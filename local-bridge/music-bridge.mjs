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
const ARTWORK_CACHE_SECONDS = 60 * 60 * 24 * 7;
const SCORE_CACHE_SECONDS = 60 * 60 * 24 * 7;
const SCORE_CACHE_ROOT = path.join(projectRoot, 'artifacts', 'scores');
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

const normalizeRemoteArtworkUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }

  if (!/^https?:\/\//i.test(raw)) {
    return '';
  }

  return raw.replace(/^http:\/\//i, 'https://');
};

const isAllowedArtworkUrl = (value) => {
  try {
    const { protocol, hostname } = new URL(value);
    const host = hostname.toLowerCase();

    return (
      protocol === 'https:' &&
      (host === 'music.163.com' ||
        host.endsWith('.music.163.com') ||
        host === 'music.126.net' ||
        host.endsWith('.music.126.net'))
    );
  } catch {
    return false;
  }
};

const hashString = (value) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
};

const escapeSvgText = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildFallbackArtworkUrl = ({ seed, title, artist }) => {
  const params = new URLSearchParams({
    seed: String(seed || title || artist || 'cosic'),
    title: String(title || 'Untitled'),
    artist: String(artist || 'Cosic')
  });

  return `${getPublicBaseUrl()}/artwork/fallback?${params.toString()}`;
};

const buildArtworkProxyUrl = (remoteUrl, fallback) => {
  const normalized = normalizeRemoteArtworkUrl(remoteUrl);
  if (!normalized || !isAllowedArtworkUrl(normalized)) {
    return fallback ? buildFallbackArtworkUrl(fallback) : '';
  }

  return `${getPublicBaseUrl()}/artwork?url=${encodeURIComponent(normalized)}`;
};

const buildCoverUrl = (remoteUrl, fallback) => buildArtworkProxyUrl(remoteUrl, fallback);

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
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
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

const badRequest = (response, message = 'Bad request.', request) => {
  json(response, 400, { ok: false, message }, request);
};

const toErrorMessage = (error) => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error.';
};

process.on('unhandledRejection', (error) => {
  console.warn('[music-bridge] ignored async provider rejection:', toErrorMessage(error));
});

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

  const businessCode = Number(payload?.code);
  if (Number.isFinite(businessCode) && businessCode !== 200) {
    throw new Error(
      payload?.message || payload?.msg || `NetEase request failed for ${pathname} with code ${businessCode}.`
    );
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
      coverUrl: buildCoverUrl(playlist.coverImgUrl, {
        seed: playlist.id,
        title: playlist.name || 'Untitled playlist',
        artist: 'Playlist'
      }),
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

  return fetchSongDetails(missingIds);
};

const fetchSongDetails = async (trackIds) => {
  const songs = [];
  for (const group of chunk(trackIds, SONG_DETAIL_CHUNK_SIZE)) {
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
  const id = String(song.id);
  const title = song.name || 'Untitled track';
  const artist = artists.map((item) => item.name).filter(Boolean).join(' / ') || 'Unknown artist';

  return {
    id,
    title,
    artist,
    album: album.name || 'Unknown album',
    duration: Math.max(1, Math.round(Number(song.dt || song.duration || 0) / 1000)),
    year: year ? String(year) : '',
    coverUrl: buildCoverUrl(album.picUrl || album.blurPicUrl, {
      seed: id,
      title,
      artist
    })
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
    coverUrl: buildCoverUrl(playlist.coverImgUrl, {
      seed: playlist.id,
      title: playlist.name || 'Untitled playlist',
      artist: 'Playlist'
    }),
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
  const detailSongs = await fetchSongDetails(
    songs.map((song) => Number(song?.id)).filter(Number.isFinite)
  ).catch(() => []);
  const detailsById = new Map(detailSongs.map((song) => [String(song.id), song]));

  return {
    query,
    items: songs.map((song) => normalizeTrack(detailsById.get(String(song.id)) || song))
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
      coverUrl: buildCoverUrl(playlist.coverImgUrl, {
        seed: playlist.id,
        title: playlist.name || 'Untitled playlist',
        artist: 'Playlist'
      }),
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

const isSafeScorePart = (value) => /^[a-z0-9][a-z0-9._-]{0,160}$/i.test(value);

const resolveScorePdfPath = (workId, fileName) => {
  if (!isSafeScorePart(workId) || !isSafeScorePart(fileName) || !/\.pdf$/i.test(fileName)) {
    return null;
  }

  const root = path.resolve(SCORE_CACHE_ROOT);
  const candidate = path.resolve(root, workId, fileName);
  const insideRoot = candidate === root || candidate.startsWith(`${root}${path.sep}`);

  return insideRoot ? candidate : null;
};

const parseRangeHeader = (rangeHeader, size) => {
  if (typeof rangeHeader !== 'string') {
    return null;
  }

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    return null;
  }

  let start;
  let end;

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1)
  };
};

const sendCachedScorePdf = async (request, response, workId, fileName) => {
  const filePath = resolveScorePdfPath(workId, fileName);
  if (!filePath) {
    return badRequest(response, 'Invalid score path.', request);
  }

  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return notFound(response, 'Score PDF not found.', request);
  }

  if (!stat.isFile()) {
    return notFound(response, 'Score PDF not found.', request);
  }

  const range = parseRangeHeader(request.headers.range, stat.size);
  const headers = {
    ...corsHeaders(request),
    'Content-Type': 'application/pdf',
    'Accept-Ranges': 'bytes',
    'Cache-Control': `public, max-age=${SCORE_CACHE_SECONDS}, immutable`,
    'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
    'X-Content-Type-Options': 'nosniff'
  };

  if (range) {
    const chunkSize = range.end - range.start + 1;
    response.writeHead(206, {
      ...headers,
      'Content-Length': chunkSize,
      'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(response);
    return;
  }

  response.writeHead(200, {
    ...headers,
    'Content-Length': stat.size
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
};

const isImageResponse = (response) => {
  const contentType = response.headers.get('content-type')?.toLowerCase() || '';

  return contentType.startsWith('image/');
};

const getArtworkProxyHeaders = (remoteUrl) => {
  const headers = {
    accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'user-agent': AUDIO_PROXY_USER_AGENT,
    referer: `${NETEASE_ORIGIN}/`,
    origin: NETEASE_ORIGIN
  };

  if (readMusicCookie()) {
    headers.cookie = readMusicCookie();
  }

  return headers;
};

const proxyArtwork = async (request, response, remoteUrl) => {
  const normalized = normalizeRemoteArtworkUrl(remoteUrl);
  if (!normalized || !isAllowedArtworkUrl(normalized)) {
    return notFound(response, 'Artwork URL is not allowed.', request);
  }

  const upstream = await fetch(normalized, {
    headers: getArtworkProxyHeaders(normalized),
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!isAllowedArtworkUrl(upstream.url || normalized)) {
    return notFound(response, 'Artwork redirect is not allowed.', request);
  }

  if (!upstream.ok || !upstream.body || !isImageResponse(upstream)) {
    return upstreamError(
      response,
      'Artwork proxy failed.',
      isImageResponse(upstream) ? `Upstream status ${upstream.status}` : 'Upstream returned non-image content',
      request
    );
  }

  const headers = {
    ...corsHeaders(request),
    'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
    'Cache-Control': `public, max-age=${ARTWORK_CACHE_SECONDS}, immutable`
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) {
    headers['Content-Length'] = contentLength;
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

const fallbackArtworkPalettes = [
  ['#1b2a2a', '#8be7df', '#f6fff8'],
  ['#281b26', '#f4a7d8', '#fff6fb'],
  ['#241f14', '#f0cf78', '#fff8df'],
  ['#141d2b', '#9ec9ff', '#f4fbff'],
  ['#20181a', '#f49a8f', '#fff2ef']
];

const buildFallbackArtworkSvg = ({ seed, title, artist }) => {
  const palette = fallbackArtworkPalettes[hashString(seed) % fallbackArtworkPalettes.length];
  const [background, accent, foreground] = palette || fallbackArtworkPalettes[0];
  const cleanTitle = String(title || 'Untitled').trim().slice(0, 44);
  const cleanArtist = String(artist || 'Cosic').trim().slice(0, 34);
  const initial = escapeSvgText((cleanTitle || cleanArtist || 'C').slice(0, 1).toUpperCase());

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${escapeSvgText(cleanTitle)} cover">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${background}"/>
      <stop offset="1" stop-color="#050607"/>
    </linearGradient>
    <radialGradient id="r" cx="72%" cy="24%" r="68%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.58"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <rect width="512" height="512" fill="url(#r)"/>
  <circle cx="114" cy="112" r="7" fill="${foreground}" opacity="0.56"/>
  <circle cx="398" cy="86" r="5" fill="${foreground}" opacity="0.34"/>
  <circle cx="426" cy="386" r="4" fill="${foreground}" opacity="0.32"/>
  <path d="M80 376c74-42 147-42 221 0s132 42 174 0v54c-42 42-100 42-174 0S154 388 80 430z" fill="${accent}" opacity="0.22"/>
  <text x="58" y="224" fill="${foreground}" font-family="Arial, sans-serif" font-size="112" font-weight="800" letter-spacing="6">${initial}</text>
  <text x="58" y="346" fill="${foreground}" font-family="Arial, sans-serif" font-size="30" font-weight="700">${escapeSvgText(cleanTitle)}</text>
  <text x="58" y="386" fill="${foreground}" opacity="0.72" font-family="Arial, sans-serif" font-size="22">${escapeSvgText(cleanArtist)}</text>
</svg>`;
};

const sendFallbackArtwork = (request, response, params) => {
  const title = params.get('title') || 'Untitled';
  const artist = params.get('artist') || 'Cosic';
  const seed = params.get('seed') || `${title}:${artist}`;
  const body = buildFallbackArtworkSvg({ seed, title, artist });

  response.writeHead(200, {
    ...corsHeaders(request),
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': `public, max-age=${ARTWORK_CACHE_SECONDS}, immutable`
  });
  response.end(body);
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

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return notFound(response, undefined, request);
  }

  try {
    if (pathname === '/health') {
      return json(response, 200, await getHealth(), request);
    }

    if (pathname === '/artwork/fallback') {
      return sendFallbackArtwork(request, response, url.searchParams);
    }

    if (pathname === '/artwork') {
      return proxyArtwork(request, response, url.searchParams.get('url') || '');
    }

    const scoreMatch = pathname.match(/^\/scores\/([^/]+)\/([^/]+\.pdf)$/i);
    if (scoreMatch) {
      return await sendCachedScorePdf(
        request,
        response,
        decodeURIComponent(scoreMatch[1]),
        decodeURIComponent(scoreMatch[2])
      );
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
      return await proxyTrackAudio(request, response, decodeURIComponent(audioMatch[1]));
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
  console.log('  GET /artwork?url=:encodedUrl');
  console.log('  GET /artwork/fallback?seed=:seed');
  console.log('  GET /scores/:workId/:file.pdf');
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
