import type { ClassicalScoreCoverage, ClassicalWorkProfile, Track } from '../contracts/bridge';
import { classicalCatalog, type ClassicalCatalogEntry } from './catalog';

const isDirectScorePage = (value: string): boolean =>
  /\.(?:pdf|png|jpe?g|webp|svg)(?:[?#].*)?$/i.test(value.trim());

const isPreferredOriginalOrFullScore = (score: ClassicalCatalogEntry['scores'][number]): boolean =>
  score.priority === 'preferred' && (score.role === 'original' || score.role === 'authoritative_full_score');

const isLikelyChopinNocturneOp9No2 = (track: Track): boolean => {
  const searchable = buildCatalogMatchText(track);

  return (
    includesAny(searchable, ['chopin', '肖邦', 'frederic chopin', 'frédéric chopin']) &&
    includesAny(searchable, ['nocturne', '夜曲']) &&
    includesAny(searchable, ['op 9 no 2', 'op9 no2', 'op 9 2', 'no 2', 'no 2', 'no. 2'])
  );
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const includesAny = (haystack: string, needles: string[]): boolean =>
  needles.some((needle) => {
    const normalizedNeedle = normalizeText(needle);
    return normalizedNeedle.length > 0 && haystack.includes(normalizedNeedle);
  });

const buildCatalogMatchText = (track: Track): string =>
  normalizeText([track.title, track.artist, track.album].join(' '));

const matchesEntry = (track: Track, entry: ClassicalCatalogEntry): boolean => {
  if (entry.id === 'chopin-nocturne-op9-no2') {
    return isLikelyChopinNocturneOp9No2(track);
  }

  const searchable = buildCatalogMatchText(track);
  const composerMatched = includesAny(searchable, [entry.composer, ...entry.composerAliases]);
  const workMatched = includesAny(searchable, [
    entry.workTitle,
    ...entry.workAliases,
    ...entry.catalogNumbers
  ]);
  const catalogNumberMatched = includesAny(searchable, entry.catalogNumbers);

  return (composerMatched && workMatched) || (catalogNumberMatched && workMatched);
};

export const evaluateClassicalScoreCoverage = (
  entry: Pick<ClassicalCatalogEntry, 'scores'>
): ClassicalScoreCoverage => {
  const readableScores = entry.scores.filter((score) => score.pages.some(isDirectScorePage));
  const hasPreferredSource = entry.scores.some(isPreferredOriginalOrFullScore);
  const hasReadablePreferredSource = readableScores.some(isPreferredOriginalOrFullScore);
  const hasOptionalArrangement = entry.scores.some(
    (score) => score.priority === 'optional' && score.role === 'arrangement'
  );

  if (hasPreferredSource) {
    return {
      status: 'covered',
      hasPreferredSource,
      hasOptionalArrangement,
      missingReason: hasReadablePreferredSource ? undefined : 'needs_review'
    };
  }

  if (entry.scores.length > 0) {
    return {
      status: 'partial',
      hasPreferredSource,
      hasOptionalArrangement,
      missingReason: 'needs_review'
    };
  }

  return {
    status: 'missing',
    hasPreferredSource,
    hasOptionalArrangement,
    missingReason: 'no_legal_source'
  };
};

export const hasPreferredClassicalScoreSource = (entry: Pick<ClassicalCatalogEntry, 'scores'>): boolean =>
  evaluateClassicalScoreCoverage(entry).hasPreferredSource;

const buildVerifiedProfile = (entry: ClassicalCatalogEntry): ClassicalWorkProfile => {
  const coverage = evaluateClassicalScoreCoverage(entry);

  return {
    isClassical: true,
    isScoreReady: coverage.hasPreferredSource,
    matchStatus: 'catalog',
    workId: entry.id,
    note: entry.note,
    scores: entry.scores,
    coverage
  };
};

export const findClassicalCatalogEntry = (track: Track): ClassicalCatalogEntry | null =>
  classicalCatalog.find((entry) => matchesEntry(track, entry)) ?? null;

export const matchClassicalWorkProfile = (
  track: Track,
  options?: { scoreReadyOnly?: boolean }
): ClassicalWorkProfile | null => {
  const entry = findClassicalCatalogEntry(track);

  if (entry) {
    const profile = buildVerifiedProfile(entry);
    return options?.scoreReadyOnly && !profile.isScoreReady ? null : profile;
  }

  return null;
};

export const enrichTrackWithClassicalMetadata = (track: Track): Track => {
  const classical = matchClassicalWorkProfile(track);
  return classical ? { ...track, classical } : track;
};

export const enrichTracksWithClassicalMetadata = (tracks: Track[]): Track[] =>
  tracks.map(enrichTrackWithClassicalMetadata);
