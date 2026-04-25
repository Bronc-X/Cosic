import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const NETEASE_ORIGIN = 'https://music.163.com';
const REQUEST_TIMEOUT_MS = 15_000;
const PLAYLIST_PAGE_LIMIT = 1000;
const SONG_DETAIL_CHUNK_SIZE = 200;
const STREAM_EXPIRE_FALLBACK_SECONDS = 20 * 60;
const STREAM_REFRESH_SKEW_MS = 15 * 1000;
const AUDIO_PROXY_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const UNM_DEFAULT_SOURCES = ['pyncmd', 'migu', 'kugou', 'bilibili', 'kuwo', 'bodian', 'ytdlp'];
const streamCache = new Map();
let unmMatcher;

const parseLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
};

const loadLocalEnv = () => {
  const candidates = ['.env.local', '.env'];

  for (const filename of candidates) {
    const filePath = path.join(projectRoot, filename);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseLine(line);
      if (!parsed) {
        continue;
      }

      if (!process.env[parsed.key]) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }
};

loadLocalEnv();

const readBaseUrl = () => process.env.COSIC_MUSIC_BASE_URL?.trim() || 'http://127.0.0.1:7878';
const readBooleanEnv = (name, fallback) => {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }

  return !['0', 'false', 'no', 'off'].includes(raw);
};
const readUnmEnabled = () => readBooleanEnv('COSIC_UNM_ENABLED', true);
const readUnmFollowSourceOrder = () => readBooleanEnv('COSIC_UNM_FOLLOW_SOURCE_ORDER', true);
const readYtDlpPath = () => {
  const raw = process.env.COSIC_YTDLP_PATH?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(projectRoot, raw);
  }

  const bundledPath = path.join(projectRoot, 'tools', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return fs.existsSync(bundledPath) ? bundledPath : null;
};
const ensureExecutableDirectoryOnPath = (executablePath) => {
  if (!executablePath || !fs.existsSync(executablePath)) {
    return null;
  }

  const executableDir = path.dirname(executablePath);
  const currentPath = process.env.PATH || '';
  const pathEntries = currentPath.split(path.delimiter).filter(Boolean);

  if (!pathEntries.includes(executableDir)) {
    process.env.PATH = [executableDir, ...pathEntries].join(path.delimiter);
  }

  return executablePath;
};
const readUnmSources = () => {
  const raw = process.env.COSIC_UNM_SOURCES?.trim();
  const sources = (raw ? raw.split(/[,\s]+/) : UNM_DEFAULT_SOURCES)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return sources.length > 0 ? sources : UNM_DEFAULT_SOURCES;
};
const isNetEaseHostedUrl = (value) => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === 'music.163.com' ||
      hostname.endsWith('.music.163.com') ||
      hostname.endsWith('.music.126.net')
    );
  } catch {
    return false;
  }
};
const containsCjkText = (value) => /[\u3400-\u9fff]/u.test(value);
const getPreferredUnmSources = (seed) => {
  const baseSources = readUnmSources();
  if (!seed) {
    return baseSources;
  }

  const fingerprint = [
    seed.name,
    seed.album?.name,
    ...(Array.isArray(seed.artists) ? seed.artists.map((artist) => artist?.name || '') : [])
  ]
    .filter(Boolean)
    .join(' ');

  if (!containsCjkText(fingerprint)) {
    return baseSources;
  }

  const regionalPriority = ['pyncmd', 'migu', 'kugou', 'bilibili', 'kuwo', 'bodian', 'ytdlp'];
  const prioritized = regionalPriority.filter((source) => baseSources.includes(source));
  const rest = baseSources.filter((source) => !prioritized.includes(source));

  return [...prioritized, ...rest];
};
const configuredYtDlpPath = ensureExecutableDirectoryOnPath(readYtDlpPath());
if (readUnmFollowSourceOrder()) {
  process.env.FOLLOW_SOURCE_ORDER = 'true';
} else {
  delete process.env.FOLLOW_SOURCE_ORDER;
}
const baseUrl = new URL(readBaseUrl());
const host = baseUrl.hostname || '127.0.0.1';
const port = Number(baseUrl.port || 7878);

const readMusicCookie = () => process.env.COSIC_MUSIC_COOKIE?.trim() || '';
const getPublicBaseUrl = () => readBaseUrl().replace(/\/+$/, '');
const buildOuterAudioUrl = (trackId) =>
  `${NETEASE_ORIGIN}/song/media/outer/url?id=${encodeURIComponent(trackId)}.mp3`;

const authMode = readMusicCookie()
  ? 'cookie'
  : process.env.COSIC_MUSIC_API_KEY?.trim()
    ? 'token'
    : 'none';

const loadUnmMatcher = () => {
  if (unmMatcher !== undefined) {
    return unmMatcher;
  }

  if (!readUnmEnabled()) {
    unmMatcher = null;
    return unmMatcher;
  }

  try {
    unmMatcher = require('@unblockneteasemusic/server');
  } catch {
    unmMatcher = null;
  }

  return unmMatcher;
};

const isAllowedCorsOrigin = (origin) => {
  if (!origin) {
    return false;
  }

  if (origin === 'null') {
    return true;
  }

  try {
    const url = new URL(origin);
    const hostAllowed = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    const portAllowed = ['', '5173', String(port)].includes(url.port);

    return hostAllowed && portAllowed;
  } catch {
    return false;
  }
};

const corsHeaders = (request) => {
  const headers = {
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range'
  };
  const origin = request?.headers?.origin;

  if (typeof origin === 'string' && isAllowedCorsOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }

  return headers;
};

const json = (response, statusCode, payload, request) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(request)
  });
  response.end(JSON.stringify(payload, null, 2));
};

const notFound = (response, message = 'Not found.', request) => {
  json(response, 404, { ok: false, message }, request);
};

const serviceUnavailable = (response, message, request) => {
  json(response, 503, { ok: false, message }, request);
};

const upstreamError = (response, message, details, request) => {
  json(response, 502, {
    ok: false,
    message,
    ...(details ? { details } : {})
  }, request);
};

const toErrorMessage = (error) => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error.';
};

const getRequestHeaders = () => {
  const cookie = readMusicCookie();
  if (!cookie) {
    throw new Error(
      'COSIC_MUSIC_COOKIE is empty. Add MUSIC_U and __csrf into .env.local first.'
    );
  }

  return {
    cookie,
    referer: `${NETEASE_ORIGIN}/`,
    origin: NETEASE_ORIGIN,
    accept: 'application/json, text/plain, */*',
    'user-agent': AUDIO_PROXY_USER_AGENT
  };
};

const getAudioProxyHeaders = (remoteUrl, rangeHeader) => {
  const headers = {
    accept: '*/*',
    'user-agent': AUDIO_PROXY_USER_AGENT,
    ...(rangeHeader ? { range: rangeHeader } : {})
  };

  try {
    const { hostname } = new URL(remoteUrl);
    if (
      hostname === 'music.163.com' ||
      hostname.endsWith('.music.163.com') ||
      hostname.endsWith('.126.net')
    ) {
      headers.referer = `${NETEASE_ORIGIN}/`;
      headers.origin = NETEASE_ORIGIN;
      if (readMusicCookie()) {
        headers.cookie = readMusicCookie();
      }
    }

    if (
      hostname.includes('bilibili.com') ||
      hostname.includes('bilivideo.com') ||
      hostname.includes('akamaized.net')
    ) {
      headers.referer = 'https://www.bilibili.com/';
    }
  } catch {
    // Keep generic audio headers when the remote URL is malformed.
  }

  return headers;
};

const neteaseFetchJson = async (pathname) => {
  const response = await fetch(`${NETEASE_ORIGIN}${pathname}`, {
    headers: getRequestHeaders(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`NetEase returned non-JSON response for ${pathname}.`);
  }

  if (!response.ok) {
    throw new Error(`NetEase request failed for ${pathname} with status ${response.status}.`);
  }

  return payload;
};

const getAccount = async () => {
  const payload = await neteaseFetchJson('/api/nuser/account/get');
  const account = payload?.account;
  const profile = payload?.profile;

  if (!account?.id || !profile?.userId) {
    throw new Error('NetEase login cookie is invalid or expired.');
  }

  return {
    userId: profile.userId,
    nickname: profile.nickname || `user-${profile.userId}`,
    avatarUrl: profile.avatarUrl || null
  };
};

const listPlaylists = async () => {
  const account = await getAccount();
  const payload = await neteaseFetchJson(
    `/api/user/playlist?uid=${account.userId}&limit=${PLAYLIST_PAGE_LIMIT}&offset=0`
  );

  const playlists = Array.isArray(payload?.playlist) ? payload.playlist : [];

  return {
    account,
    items: playlists.map((playlist) => ({
      id: String(playlist.id),
      name: playlist.name || 'Untitled playlist',
      description: playlist.description || '',
      trackCount: Number(playlist.trackCount || 0),
      coverUrl: playlist.coverImgUrl || '',
      updatedAt: playlist.updateTime
        ? new Date(playlist.updateTime).toISOString()
        : new Date().toISOString()
    }))
  };
};

const chunk = (items, size) => {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
};

const fetchMissingSongs = async (trackIds, existingIds) => {
  const missingIds = trackIds.filter((id) => !existingIds.has(id));
  if (!missingIds.length) {
    return [];
  }

  const songs = [];
  for (const group of chunk(missingIds, SONG_DETAIL_CHUNK_SIZE)) {
    const payload = await neteaseFetchJson(`/api/song/detail?ids=[${group.join(',')}]`);
    const part = Array.isArray(payload?.songs) ? payload.songs : [];
    songs.push(...part);
  }

  return songs;
};

const normalizeTrack = (song) => {
  const album = song.al || song.album || {};
  const artists = song.ar || song.artists || [];
  const publishTime = song.publishTime || song.publish || song.publishDate || null;
  const year = publishTime ? new Date(publishTime).getFullYear() : null;

  return {
    id: String(song.id),
    title: song.name || 'Untitled track',
    artist: artists.map((artist) => artist.name).filter(Boolean).join(' / ') || 'Unknown artist',
    album: album.name || 'Unknown album',
    duration: Math.max(1, Math.round(Number(song.dt || song.duration || 0) / 1000)),
    year: year ? String(year) : '',
    coverUrl: album.picUrl || album.blurPicUrl || ''
  };
};

const getPlaylist = async (playlistId) => {
  const payload = await neteaseFetchJson(
    `/api/v6/playlist/detail?id=${encodeURIComponent(playlistId)}&n=5000`
  );

  const playlist = payload?.playlist;
  if (!playlist?.id) {
    return null;
  }

  const orderedTrackIds = Array.isArray(playlist.trackIds)
    ? playlist.trackIds.map((item) => Number(item.id)).filter(Number.isFinite)
    : [];
  const existingSongs = Array.isArray(playlist.tracks) ? playlist.tracks : [];
  const existingIds = new Set(existingSongs.map((song) => Number(song.id)).filter(Number.isFinite));
  const missingSongs = await fetchMissingSongs(orderedTrackIds, existingIds);
  const songMap = new Map();

  for (const song of [...existingSongs, ...missingSongs]) {
    if (song?.id) {
      songMap.set(Number(song.id), song);
    }
  }

  const orderedSongs = orderedTrackIds
    .map((id) => songMap.get(id))
    .filter(Boolean)
    .map(normalizeTrack);

  return {
    id: String(playlist.id),
    name: playlist.name || 'Untitled playlist',
    description: playlist.description || '',
    coverUrl: playlist.coverImgUrl || '',
    trackCount: Number(playlist.trackCount || orderedSongs.length),
    tracks: orderedSongs
  };
};

const buildAudioProxyUrl = (trackId) =>
  `${getPublicBaseUrl()}/tracks/${encodeURIComponent(trackId)}/audio?ts=${Date.now()}`;

const normalizeStreamType = (remoteUrl, type) => {
  const nextType = String(type || '').trim();
  if (!nextType) {
    return isNetEaseHostedUrl(remoteUrl) ? 'netease:official' : 'unknown';
  }

  if (nextType.startsWith('unm:') || nextType === 'outer') {
    return nextType;
  }

  return isNetEaseHostedUrl(remoteUrl) ? 'netease:official' : nextType;
};

const cacheStream = (trackId, remoteUrl, { bitrate = 0, type = 'unknown', expiresAt } = {}) => {
  const cached = {
    trackId: String(trackId),
    remoteUrl,
    bitrate: Number(bitrate || 0),
    type: normalizeStreamType(remoteUrl, type),
    expiresAt: expiresAt || new Date(Date.now() + STREAM_EXPIRE_FALLBACK_SECONDS * 1000).toISOString()
  };

  streamCache.set(String(trackId), cached);
  return cached;
};

const cacheOuterStream = (trackId) =>
  cacheStream(trackId, buildOuterAudioUrl(trackId), {
    bitrate: 128000,
    type: 'outer'
  });

const isStreamFresh = (stream) => {
  if (!stream?.expiresAt) {
    return false;
  }

  const expiresAt = new Date(stream.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt - Date.now() > STREAM_REFRESH_SKEW_MS;
};

const toPublicStreamPayload = (trackId, cachedStream) => ({
  trackId: String(trackId),
  url: buildAudioProxyUrl(trackId),
  bitrate: Number(cachedStream?.bitrate || 0),
  type: cachedStream?.type || 'unknown',
  expiresAt: cachedStream?.expiresAt || new Date().toISOString()
});

const hasAudioFileExtension = (url) => /\.(mp3|m4a|aac|flac|ogg|opus|webm)(?:\?|$)/i.test(url);

const isAudioResponse = (response) => {
  const contentType = response.headers.get('content-type')?.toLowerCase() || '';
  if (contentType.startsWith('audio/') || contentType.includes('octet-stream')) {
    return true;
  }

  return hasAudioFileExtension(response.url || '');
};

const getTrackMatchSeed = async (trackId) => {
  const payload = await neteaseFetchJson(`/api/song/detail?ids=[${encodeURIComponent(trackId)}]`);
  const song = Array.isArray(payload?.songs) ? payload.songs[0] : null;
  const album = song?.al || song?.album || {};
  const artists = Array.isArray(song?.ar || song?.artists) ? song.ar || song.artists : [];

  if (!song?.id) {
    return null;
  }

  return {
    id: Number(song.id),
    name: song.name || 'Untitled track',
    alias: Array.isArray(song.alia || song.alias) ? song.alia || song.alias : [],
    duration: Number(song.dt || song.duration || 0),
    album: {
      id: Number(album.id || 0),
      name: album.name || 'Unknown album'
    },
    artists: artists.map((artist, index) => ({
      id: Number(artist?.id || index + 1),
      name: artist?.name || 'Unknown artist'
    }))
  };
};

const isRejectedUnblockMatch = (payload) => {
  const url = String(payload?.url || '');
  if (!url) {
    return true;
  }

  if (payload?.source === 'pyncmd' && !isNetEaseHostedUrl(url)) {
    return true;
  }

  // Kuwo sometimes resolves unrelated promo audio to the same generic file.
  if (payload?.source === 'kuwo' && url.includes('3759149332.mp3?bitrate')) {
    return true;
  }

  return false;
};

const resolveUnblockTrackStream = async (trackId) => {
  const match = loadUnmMatcher();
  if (!match) {
    return null;
  }

  try {
    const seed = await getTrackMatchSeed(trackId).catch(() => null);
    for (const source of getPreferredUnmSources(seed)) {
      try {
        const revived = await match(String(trackId), [source], seed || undefined);
        if (isRejectedUnblockMatch(revived)) {
          continue;
        }

        return cacheStream(trackId, revived.url, {
          bitrate: Number(revived.br || 128000),
          type: `unm:${revived.source || source}`
        });
      } catch {
        // Try the next source in the ordered fallback chain.
      }
    }
  } catch {
    return null;
  }

  return null;
};

const getTrackStream = async (trackId, forceRefresh = false) => {
  const cachedStream = streamCache.get(String(trackId));
  if (!forceRefresh && isStreamFresh(cachedStream)) {
    return toPublicStreamPayload(trackId, cachedStream);
  }

  let payload;

  try {
    payload = await neteaseFetchJson(
      `/api/song/enhance/player/url?id=${encodeURIComponent(trackId)}&ids=[${encodeURIComponent(trackId)}]&br=320000`
    );
  } catch {
    const revivedStream = await resolveUnblockTrackStream(trackId);
    return toPublicStreamPayload(trackId, revivedStream || cacheOuterStream(trackId));
  }

  const stream = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!stream?.url || stream.code !== 200) {
    const revivedStream = await resolveUnblockTrackStream(trackId);
    return toPublicStreamPayload(trackId, revivedStream || cacheOuterStream(trackId));
  }

  const cached = cacheStream(trackId, stream.url, {
    bitrate: Number(stream.br || 0),
    type: stream.type || 'unknown',
    expiresAt: new Date(Date.now() + Number(stream.expi || STREAM_EXPIRE_FALLBACK_SECONDS) * 1000).toISOString()
  });

  return toPublicStreamPayload(trackId, cached);
};

const getTrackLyrics = async (trackId) => {
  const payload = await neteaseFetchJson(
    `/api/song/lyric?id=${encodeURIComponent(trackId)}&lv=-1&kv=-1&tv=-1`
  );

  return {
    trackId: String(trackId),
    provider: 'netease',
    lyric: payload?.lrc?.lyric || '',
    translatedLyric: payload?.tlyric?.lyric || '',
    fetchedAt: new Date().toISOString()
  };
};

const fetchUpstreamTrackAudio = async (trackId, rangeHeader, forceRefresh = false) => {
  let publicStream = await getTrackStream(trackId, forceRefresh);
  let cachedStream = streamCache.get(String(trackId));

  if (!publicStream || !cachedStream?.remoteUrl) {
    return null;
  }

  let upstream = await fetch(cachedStream.remoteUrl, {
    headers: getAudioProxyHeaders(cachedStream.remoteUrl, rangeHeader),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (( !upstream.ok || !isAudioResponse(upstream) ) && [200, 401, 403, 404].includes(upstream.status) && !forceRefresh) {
    publicStream = await getTrackStream(trackId, true);
    cachedStream = streamCache.get(String(trackId));

    if (!publicStream || !cachedStream?.remoteUrl) {
      return null;
    }

    upstream = await fetch(cachedStream.remoteUrl, {
      headers: getAudioProxyHeaders(cachedStream.remoteUrl, rangeHeader),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  }

  if ((!upstream.ok || !isAudioResponse(upstream)) && !String(cachedStream?.type || '').startsWith('unm:')) {
    cachedStream = await resolveUnblockTrackStream(trackId);
    if (cachedStream) {
      publicStream = toPublicStreamPayload(trackId, cachedStream);
      upstream = await fetch(cachedStream.remoteUrl, {
        headers: getAudioProxyHeaders(cachedStream.remoteUrl, rangeHeader),
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    }
  }

  if ((!upstream.ok || !isAudioResponse(upstream)) && cachedStream?.type !== 'outer') {
    cachedStream = cacheOuterStream(trackId);
    publicStream = toPublicStreamPayload(trackId, cachedStream);
    upstream = await fetch(cachedStream.remoteUrl, {
      headers: getAudioProxyHeaders(cachedStream.remoteUrl, rangeHeader),
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  }

  return upstream;
};

const probeTrackAudio = async (trackId) => {
  const upstream = await fetchUpstreamTrackAudio(trackId, 'bytes=0-1');

  if (!upstream) {
    return {
      success: false,
      message: '未拿到音频地址'
    };
  }

  if ((upstream.ok || upstream.status === 206) && isAudioResponse(upstream)) {
    return {
      success: true,
      message: 'ok'
    };
  }

  return {
    success: false,
    message: isAudioResponse(upstream) ? `音频代理失败: ${upstream.status}` : '返回的不是有效音频流'
  };
};

const searchTracks = async (query, limit = 8) => {
  const payload = await neteaseFetchJson(
    `/api/search/get/web?csrf_token=&s=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}&type=1`
  );

  const songs = Array.isArray(payload?.result?.songs) ? payload.result.songs : [];

  return {
    query,
    items: songs.map(normalizeTrack)
  };
};

const searchPlaylists = async (query, limit = 6) => {
  const payload = await neteaseFetchJson(
    `/api/search/get/web?csrf_token=&s=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}&type=1000`
  );

  const playlists = Array.isArray(payload?.result?.playlists) ? payload.result.playlists : [];

  return {
    query,
    items: playlists.map((playlist) => ({
      id: String(playlist.id),
      name: playlist.name || 'Untitled playlist',
      description: playlist.description || '',
      trackCount: Number(playlist.trackCount || 0),
      coverUrl: playlist.coverImgUrl || '',
      updatedAt: playlist.updateTime
        ? new Date(playlist.updateTime).toISOString()
        : new Date().toISOString()
    }))
  };
};

const proxyTrackAudio = async (request, response, trackId) => {
  const rangeHeader = typeof request.headers.range === 'string' ? request.headers.range : undefined;
  const upstream = await fetchUpstreamTrackAudio(trackId, rangeHeader);

  if (!upstream) {
    return notFound(response, 'Track stream not found or unavailable.', request);
  }

  if (!upstream.ok || !upstream.body || !isAudioResponse(upstream)) {
    return upstreamError(
      response,
      'Track audio proxy failed.',
      isAudioResponse(upstream) ? `Upstream status ${upstream.status}` : 'Upstream returned non-audio content',
      request
    );
  }

  const headers = {
    ...corsHeaders(request),
    'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
    'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes'
  };

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) {
    headers['Content-Length'] = contentLength;
  }

  const contentRange = upstream.headers.get('content-range');
  if (contentRange) {
    headers['Content-Range'] = contentRange;
  }

  const cacheControl = upstream.headers.get('cache-control');
  if (cacheControl) {
    headers['Cache-Control'] = cacheControl;
  }

  response.writeHead(upstream.status, headers);

  const upstreamBody = Readable.fromWeb(upstream.body);
  const closeUpstream = () => {
    upstreamBody.destroy();
  };

  response.on('error', closeUpstream);
  request.on('aborted', closeUpstream);
  response.on('close', () => {
    if (!response.writableEnded) {
      closeUpstream();
    }
  });
  upstreamBody.on('error', (error) => {
    if (!response.destroyed) {
      response.destroy(error);
    }
  });
  upstreamBody.on('end', () => {
    response.off('error', closeUpstream);
    request.off('aborted', closeUpstream);
  });

  upstreamBody.pipe(response);
};

const getHealth = async () => {
  if (!readMusicCookie()) {
    return {
      ok: false,
      provider: 'netease',
      authMode,
      mode: 'netease-live',
      configured: false,
      message: 'COSIC_MUSIC_COOKIE is missing. Add MUSIC_U and __csrf first.'
    };
  }

  const account = await getAccount();

  return {
    ok: true,
    provider: 'netease',
    authMode,
    mode: 'netease-live',
    configured: true,
    account: {
      userId: account.userId,
      nickname: account.nickname,
      avatarUrl: account.avatarUrl
    },
    fallbackResolver: {
      enabled: readUnmEnabled(),
      installed: Boolean(loadUnmMatcher()),
      sources: readUnmSources(),
      followSourceOrder: readUnmFollowSourceOrder(),
      ytDlpPath: configuredYtDlpPath
    },
    message: 'NetEase bridge is connected with your local login cookie.'
  };
};

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    return notFound(response, undefined, request);
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...corsHeaders(request)
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
  const { pathname } = url;

  if (request.method !== 'GET') {
    return notFound(response, undefined, request);
  }

  try {
    if (pathname === '/health') {
      return json(response, 200, await getHealth(), request);
    }

    if (!readMusicCookie()) {
      return serviceUnavailable(
        response,
        'Music bridge is not configured yet. Set COSIC_MUSIC_COOKIE in .env.local first.',
        request
      );
    }

    if (pathname === '/user/playlists') {
      return json(response, 200, await listPlaylists(), request);
    }

    if (pathname === '/check/music') {
      const trackId = url.searchParams.get('id');
      if (!trackId) {
        return json(response, 400, { success: false, message: 'Missing id.' }, request);
      }

      return json(response, 200, await probeTrackAudio(trackId), request);
    }

    const playlistMatch = pathname.match(/^\/playlists\/([^/]+)$/);
    if (playlistMatch) {
      const playlist = await getPlaylist(decodeURIComponent(playlistMatch[1]));
      if (!playlist) {
        return notFound(response, 'Playlist not found.', request);
      }

      return json(response, 200, playlist, request);
    }

    if (pathname === '/search/tracks') {
      const query = url.searchParams.get('q')?.trim();
      const limit = Number(url.searchParams.get('limit') || 8);

      if (!query) {
        return json(response, 400, { ok: false, message: 'Missing q.' }, request);
      }

      return json(response, 200, await searchTracks(query, Math.max(1, Math.min(limit, 20))), request);
    }

    if (pathname === '/search/playlists') {
      const query = url.searchParams.get('q')?.trim();
      const limit = Number(url.searchParams.get('limit') || 6);

      if (!query) {
        return json(response, 400, { ok: false, message: 'Missing q.' }, request);
      }

      return json(response, 200, await searchPlaylists(query, Math.max(1, Math.min(limit, 12))), request);
    }

    const streamMatch = pathname.match(/^\/tracks\/([^/]+)\/stream$/);
    if (streamMatch) {
      const stream = await getTrackStream(decodeURIComponent(streamMatch[1]));
      if (!stream) {
        return notFound(response, 'Track stream not found or unavailable.', request);
      }

      return json(response, 200, stream, request);
    }

    const lyricsMatch = pathname.match(/^\/tracks\/([^/]+)\/lyrics$/);
    if (lyricsMatch) {
      return json(response, 200, await getTrackLyrics(decodeURIComponent(lyricsMatch[1])), request);
    }

    const audioMatch = pathname.match(/^\/tracks\/([^/]+)\/audio$/);
    if (audioMatch) {
      return proxyTrackAudio(request, response, decodeURIComponent(audioMatch[1]));
    }
  } catch (error) {
    return upstreamError(response, 'NetEase bridge request failed.', toErrorMessage(error), request);
  }

  return notFound(response, undefined, request);
});

server.listen(port, host, () => {
  console.log(`[music-bridge] running on ${readBaseUrl()}`);
  console.log('[music-bridge] available endpoints:');
  console.log('  GET /health');
  console.log('  GET /user/playlists');
  console.log('  GET /playlists/:id');
  console.log('  GET /check/music?id=:id');
  console.log('  GET /search/tracks?q=:query');
  console.log('  GET /search/playlists?q=:query');
  console.log('  GET /tracks/:id/stream');
  console.log('  GET /tracks/:id/lyrics');
  console.log('  GET /tracks/:id/audio');
  console.log('[music-bridge] current auth mode:', authMode);
  console.log(
    '[music-bridge] UNM fallback:',
    readUnmEnabled() && loadUnmMatcher()
      ? `enabled (${readUnmSources().join(', ')})${readUnmFollowSourceOrder() ? ' strict-order' : ''}`
      : readUnmEnabled()
        ? 'package not installed'
        : 'disabled'
  );
  console.log('[music-bridge] yt-dlp:', configuredYtDlpPath || 'not found');
  console.log('[music-bridge] this version serves live NetEase data when COSIC_MUSIC_COOKIE is valid.');
});
