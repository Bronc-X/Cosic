import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(ROOT_DIR, 'src', 'shared', 'classical', 'catalog.ts');
const SCORES_DIR = path.join(ROOT_DIR, 'artifacts', 'scores');
const MANIFEST_PATH = path.join(SCORES_DIR, 'manifest.json');
const SCORE_URL_PREFIX = '/scores';
const PAGE_REQUEST_TIMEOUT_MS = 15_000;
const PDF_DOWNLOAD_TIMEOUT_MS = 90_000;
const MAX_PDF_CANDIDATES_PER_SCORE = 4;
const MAX_NESTED_FILE_PAGES = 6;
const USER_AGENT = 'Cosic score resolver/1.0 (+https://imslp.org; public-domain score cache)';
const TRUSTED_HOSTS = [
  'imslp.org',
  'www.imslp.org',
  'vmirror.imslp.org',
  's9.imslp.org',
  's10.imslp.org',
  'commons.wikimedia.org',
  'upload.wikimedia.org'
];

const parseArgs = (argv) => {
  const options = {
    limit: undefined,
    workId: undefined,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--limit' || arg === '--work-id') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      if (arg === '--limit') {
        const limit = Number.parseInt(value, 10);
        if (!Number.isFinite(limit) || limit < 1) {
          throw new Error('--limit must be a positive integer');
        }
        options.limit = limit;
      } else {
        options.workId = value;
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const loadCatalog = async () => {
  const source = await fs.readFile(CATALOG_PATH, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
    },
    fileName: CATALOG_PATH
  }).outputText;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
  const module = await import(dataUrl);
  return module.classicalCatalog ?? [];
};

const isTrustedUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && TRUSTED_HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const isPdfUrl = (value) => {
  try {
    return /\.pdf(?:[?#].*)?$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
};

const isFilePageUrl = (value) => {
  try {
    const url = new URL(value);
    return /\/wiki\/File:/i.test(url.pathname);
  } catch {
    return false;
  }
};

const toImslpMirrorUrl = (value) => {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/images\/([^/]+)\/([^/]+)\/(.+\.pdf)$/i);
    if (!match || !['imslp.org', 'www.imslp.org'].includes(url.hostname.toLowerCase())) {
      return null;
    }

    return `https://vmirror.imslp.org/files/imglnks/usimg/${match[1]}/${match[2]}/${match[3]}`;
  } catch {
    return null;
  }
};

const expandPdfCandidates = (values) =>
  unique(
    values.flatMap((value) => {
      const mirrorUrl = toImslpMirrorUrl(value);
      return mirrorUrl ? [mirrorUrl, value] : [value];
    })
  );

const isDirectPdfCandidate = (value) =>
  isTrustedUrl(value) && isPdfUrl(value) && !isFilePageUrl(value);

const normalizeUrl = (href, baseUrl) => {
  const decoded = href
    .replaceAll('&amp;', '&')
    .replaceAll('&#38;', '&')
    .trim();
  try {
    return new URL(decoded, baseUrl).href;
  } catch {
    return undefined;
  }
};

const unique = (values) => [...new Set(values.filter(Boolean))];

const candidatesFromPages = (pages = []) =>
  expandPdfCandidates(pages.filter(isDirectPdfCandidate));

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(PAGE_REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
};

const extractLinks = (html, baseUrl) => {
  const links = [];
  const patterns = [
    /\bhref\s*=\s*"([^"]+)"/gi,
    /\bhref\s*=\s*'([^']+)'/gi,
    /\bsrc\s*=\s*"([^"]+)"/gi,
    /\bsrc\s*=\s*'([^']+)'/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const normalized = normalizeUrl(match[1], baseUrl);
      if (normalized) {
        links.push(normalized);
      }
    }
  }

  return unique(links);
};

const parsePageForPdfCandidates = async (sourceUrl) => {
  if (!sourceUrl || !isTrustedUrl(sourceUrl)) {
    return [];
  }
  if (isDirectPdfCandidate(sourceUrl)) {
    return expandPdfCandidates([sourceUrl]);
  }

  const html = await fetchText(sourceUrl);
  const links = extractLinks(html, sourceUrl);
  const directPdfs = expandPdfCandidates(links.filter(isDirectPdfCandidate));
  if (directPdfs.length > 0) {
    return directPdfs;
  }

  const filePages = links
    .filter((link) => isTrustedUrl(link))
    .filter((link) => /\/wiki\/(?:File:|Special:ImagefromIndex|Special:ReverseLookup)/i.test(link))
    .slice(0, MAX_NESTED_FILE_PAGES);
  const nestedPdfs = [];
  for (const filePage of filePages) {
    try {
      const fileHtml = await fetchText(filePage);
      nestedPdfs.push(
        ...expandPdfCandidates(extractLinks(fileHtml, filePage).filter(isDirectPdfCandidate))
      );
    } catch {
      // A broken nested file page should not make the whole source fail.
    }
  }

  return unique(nestedPdfs);
};

const safeFileName = (parts) =>
  parts
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

const fileNameForCandidate = (workId, scoreIndex, candidateUrl) => {
  let baseName = '';
  try {
    baseName = decodeURIComponent(path.basename(new URL(candidateUrl).pathname));
  } catch {
    baseName = '';
  }
  const stem = safeFileName([String(scoreIndex + 1).padStart(2, '0'), baseName.replace(/\.pdf$/i, '')]);
  return `${stem || `${workId}-${scoreIndex + 1}`}.pdf`;
};

const toScoreCachePath = (workId, fileName) =>
  path.join('artifacts', 'scores', workId, fileName).replaceAll('\\', '/');

const toScoreLocalUrl = (workId, fileName) =>
  `${SCORE_URL_PREFIX}/${encodeURIComponent(workId)}/${encodeURIComponent(fileName)}`;

const isPdfBuffer = (bytes) => bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-';

const downloadPdfWithCurl = async (url, destination) => {
  const tempDestination = `${destination}.download`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rm(tempDestination, { force: true });

  const executable = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const args = [
    '-L',
    '--fail',
    '--silent',
    '--show-error',
    '--max-time',
    String(Math.ceil(PDF_DOWNLOAD_TIMEOUT_MS / 1000)),
    '--user-agent',
    USER_AGENT,
    '--header',
    'Accept: application/pdf,*/*;q=0.8',
    '--output',
    tempDestination,
    url
  ];

  const result = await new Promise((resolve) => {
    const child = spawn(executable, args, {
      windowsHide: true
    });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ ok: false, reason: `curl_unavailable:${error.message}`, stderr });
    });
    child.on('exit', (code) => {
      resolve({
        ok: code === 0,
        reason: code === 0 ? 'downloaded_with_curl' : `curl_exit_${code}:${stderr.trim() || 'download_failed'}`,
        stderr
      });
    });
  });

  if (!result.ok) {
    await fs.rm(tempDestination, { force: true });
    return {
      ok: false,
      reason: result.reason,
      bytes: 0,
      contentType: null
    };
  }

  const bytes = await fs.readFile(tempDestination);
  if (!isPdfBuffer(bytes)) {
    await fs.rm(tempDestination, { force: true });
    return {
      ok: false,
      reason: 'curl_not_pdf_bytes',
      bytes: bytes.length,
      contentType: null
    };
  }

  await fs.rename(tempDestination, destination);
  return {
    ok: true,
    reason: 'downloaded_with_curl',
    bytes: bytes.length,
    contentType: 'application/pdf'
  };
};

const downloadPdf = async (url, destination, dryRun) => {
  if (dryRun) {
    return {
      ok: true,
      reason: 'dry_run',
      bytes: 0,
      contentType: null
    };
  }

  try {
    const cached = await fs.readFile(destination);
    if (isPdfBuffer(cached)) {
      return {
        ok: true,
        reason: 'cached',
        bytes: cached.length,
        contentType: 'application/pdf'
      };
    }
  } catch {
    // Missing or invalid cache files are resolved from the trusted source below.
  }

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/pdf,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(PDF_DOWNLOAD_TIMEOUT_MS)
    });
  } catch (error) {
    const fallback = await downloadPdfWithCurl(url, destination);
    return fallback.ok ? fallback : {
      ...fallback,
      reason: `download_failed:${error.message};${fallback.reason}`
    };
  }
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  const accepted = contentType === 'application/pdf' || isPdfUrl(response.url || url);
  if (!response.ok) {
    return {
      ok: false,
      reason: `download_http_${response.status}`,
      bytes: 0,
      contentType
    };
  }
  if (!accepted) {
    return {
      ok: false,
      reason: `not_pdf_content_type:${contentType || 'missing'}`,
      bytes: 0,
      contentType
    };
  }

  let bytes;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const fallback = await downloadPdfWithCurl(url, destination);
    return fallback.ok ? fallback : {
      ...fallback,
      reason: `download_body_failed:${error.message};${fallback.reason}`,
      contentType
    };
  }

  if (!isPdfBuffer(bytes)) {
    return {
      ok: false,
      reason: `not_pdf_bytes:${contentType || 'missing'}`,
      bytes: bytes.length,
      contentType
    };
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
  return {
    ok: true,
    reason: 'downloaded',
    bytes: bytes.length,
    contentType
  };
};

const resolveScore = async (work, score, scoreIndex, dryRun) => {
  const sourceUrl = score.sourceUrl;
  const directCandidates = candidatesFromPages(score.pages);
  if (
    directCandidates.length === 0 &&
    score.priority === 'optional' &&
    score.role === 'arrangement'
  ) {
    return {
      title: score.title,
      instrument: score.instrument,
      role: score.role,
      priority: score.priority,
      sourceUrl,
      status: 'skipped',
      reason: 'optional_arrangement_needs_explicit_pdf',
      candidates: []
    };
  }

  let parsedCandidates = [];
  let parseReason = null;

  if (directCandidates.length === 0) {
    try {
      parsedCandidates = await parsePageForPdfCandidates(sourceUrl);
    } catch (error) {
      parseReason = `parse_failed:${error.message}`;
    }
  }

  const candidates = unique([...directCandidates, ...parsedCandidates]).slice(0, MAX_PDF_CANDIDATES_PER_SCORE);
  if (candidates.length === 0) {
    return {
      title: score.title,
      instrument: score.instrument,
      role: score.role,
      priority: score.priority,
      sourceUrl,
      status: 'failed',
      reason: parseReason ?? 'no_pdf_candidates',
      candidates: []
    };
  }

  const attempted = [];
  for (const candidate of candidates) {
    const fileName = fileNameForCandidate(work.id, scoreIndex, candidate);
    const relativePath = toScoreCachePath(work.id, fileName);
    const localUrl = toScoreLocalUrl(work.id, fileName);
    const destination = path.join(ROOT_DIR, relativePath);
    const result = await downloadPdf(candidate, destination, dryRun);
    attempted.push({
      url: candidate,
      fileName,
      cachePath: relativePath,
      localUrl,
      status: result.ok ? 'resolved' : 'failed',
      reason: result.reason,
      bytes: result.bytes,
      contentType: result.contentType
    });

    if (result.ok) {
      return {
        title: score.title,
        instrument: score.instrument,
        role: score.role,
        priority: score.priority,
        sourceUrl,
        status: dryRun ? 'dry_run' : 'resolved',
        reason: result.reason,
        url: candidate,
        fileName,
        cachePath: dryRun ? null : relativePath,
        localUrl,
        bytes: result.bytes,
        contentType: result.contentType,
        candidates: attempted
      };
    }
  }

  return {
    title: score.title,
    instrument: score.instrument,
    role: score.role,
    priority: score.priority,
    sourceUrl,
    status: 'failed',
    reason: attempted.at(-1)?.reason ?? 'download_failed',
    candidates: attempted
  };
};

const resolveWork = async (work, dryRun) => {
  const scores = [];
  for (const [scoreIndex, score] of (work.scores ?? []).entries()) {
    scores.push(await resolveScore(work, score, scoreIndex, dryRun));
  }
  return {
    workId: work.id,
    composer: work.composer,
    workTitle: work.workTitle,
    status: scores.some((score) => score.status === 'resolved' || score.status === 'dry_run')
      ? 'resolved'
      : 'failed',
    scores
  };
};

const writeManifest = async (manifest, dryRun) => {
  if (dryRun) {
    return;
  }
  await fs.mkdir(SCORES_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
};

const readExistingManifest = async () => {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
};

const mergeManifestEntries = (existingManifest, nextEntries, shouldMerge) => {
  if (!shouldMerge || !Array.isArray(existingManifest?.entries)) {
    return nextEntries;
  }

  const byWorkId = new Map(existingManifest.entries.map((entry) => [entry.workId, entry]));
  for (const entry of nextEntries) {
    byWorkId.set(entry.workId, entry);
  }

  return [...byWorkId.values()];
};

const writeProgressManifest = async (entry) => {
  const existingManifest = await readExistingManifest();
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: false,
    catalogPath: path.relative(ROOT_DIR, CATALOG_PATH).replaceAll('\\', '/'),
    scoreRoot: path.relative(ROOT_DIR, SCORES_DIR).replaceAll('\\', '/'),
    entries: mergeManifestEntries(existingManifest, [entry], true)
  };

  await writeManifest(manifest, false);
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const catalog = await loadCatalog();
  let works = options.workId ? catalog.filter((work) => work.id === options.workId) : catalog;
  if (options.limit) {
    works = works.slice(0, options.limit);
  }
  if (options.workId && works.length === 0) {
    throw new Error(`No catalog work found for --work-id ${options.workId}`);
  }

  const entries = [];
  for (const work of works) {
    const entry = await resolveWork(work, options.dryRun);
    entries.push(entry);
    if (!options.dryRun) {
      await writeProgressManifest(entry);
    }
  }

  const existingManifest = options.dryRun ? null : await readExistingManifest();

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    catalogPath: path.relative(ROOT_DIR, CATALOG_PATH).replaceAll('\\', '/'),
    scoreRoot: path.relative(ROOT_DIR, SCORES_DIR).replaceAll('\\', '/'),
    entries: mergeManifestEntries(existingManifest, entries, Boolean(options.workId || options.limit))
  };

  await writeManifest(manifest, options.dryRun);

  const resolvedCount = entries
    .flatMap((entry) => entry.scores)
    .filter((score) => score.status === 'resolved' || score.status === 'dry_run').length;
  const failedCount = entries.flatMap((entry) => entry.scores).filter((score) => score.status === 'failed').length;
  const skippedCount = entries.flatMap((entry) => entry.scores).filter((score) => score.status === 'skipped').length;
  console.log(
    `${options.dryRun ? 'Dry-run resolved' : 'Resolved'} ${resolvedCount} score source(s), ${failedCount} failed, ${skippedCount} skipped.`
  );
  if (!options.dryRun) {
    console.log(`Manifest: ${path.relative(ROOT_DIR, MANIFEST_PATH).replaceAll('\\', '/')}`);
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
