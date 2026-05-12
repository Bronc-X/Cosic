import assert from 'node:assert/strict';

const {
  OpenAiCompatibleLlmAdapter,
  parseLlmJsonObject,
  resolveLlmSelectedTracks
} = await import('../dist-electron/src/main/bridge/adapters/openai-compatible-llm.js');
const { CosyVoiceAdapter } = await import('../dist-electron/src/main/bridge/adapters/cosyvoice-adapter.js');
const { parseSpecificArtistRequest, prepareCurationCandidateTracks } = await import(
  '../dist-electron/src/main/bridge/bridge-service.js'
);

assert.equal(typeof OpenAiCompatibleLlmAdapter, 'function', 'LLM adapter must be exported for smoke verification');
assert.equal(typeof CosyVoiceAdapter, 'function', 'CosyVoice adapter must be exported for smoke verification');
assert.equal(typeof parseLlmJsonObject, 'function', 'LLM JSON parser must be exported for smoke verification');
assert.equal(typeof resolveLlmSelectedTracks, 'function', 'LLM track resolver must be exported for smoke verification');
assert.equal(typeof parseSpecificArtistRequest, 'function', 'artist/count parser must be exported for smoke verification');
assert.equal(
  typeof prepareCurationCandidateTracks,
  'function',
  'bridge service must expose empty-candidate curation fallback preparation'
);

const resolverTracks = [
  {
    id: '1501606',
    title: 'Cello Suite No. 1',
    artist: 'Janos Starker',
    album: 'Bach',
    duration: 168,
    source: '',
    year: '1965',
    mood: 'Calm',
    tags: ['cello'],
    theme: { primary: '#fff', secondary: '#000', accent: '#aaa' }
  },
  {
    id: '4879333',
    title: 'Evening Wind',
    artist: 'Joe Hisaishi',
    album: 'Piano Stories',
    duration: 214,
    source: '',
    year: '1988',
    mood: 'Open',
    tags: ['piano'],
    theme: { primary: '#fff', secondary: '#000', accent: '#aaa' }
  }
];

assert.deepEqual(
  resolveLlmSelectedTracks([' track-2 ', 1501606, 'Cello Suite No. 1 - Janos Starker', 'missing'], resolverTracks).map(
    (track) => track.id
  ),
  ['4879333', '1501606'],
  'resolver must recover short choice ids, numeric ids, and title-artist strings without duplicates'
);

assert.deepEqual(
  resolveLlmSelectedTracks(['track 1', 'track_2', 'Track #1', 'track-2: Evening Wind'], resolverTracks).map(
    (track) => track.id
  ),
  ['1501606', '4879333'],
  'resolver must recover common LLM short-id variants without duplicates'
);

assert.deepEqual(
  resolveLlmSelectedTracks(
    [
      { id: 'track-2', title: 'wrong title' },
      { trackId: '1501606' },
      { title: 'Evening Wind', artist: 'Joe Hisaishi' },
      { name: 'Cello Suite No. 1', artists: ['Janos Starker'] }
    ],
    resolverTracks
  ).map((track) => track.id),
  ['4879333', '1501606'],
  'resolver must recover object-shaped LLM track selections without duplicates'
);

assert.deepEqual(
  parseLlmJsonObject('Sure.\n```json\n{"title":"Night","trackIds":["1","2",],"reply":"done"}\n```\nExtra prose.'),
  {
    title: 'Night',
    trackIds: ['1', '2'],
    reply: 'done'
  },
  'parser must recover fenced JSON with surrounding prose and trailing commas'
);

assert.deepEqual(
  parseLlmJsonObject('prefix {"title":"A","nested":{"ok":true},"trackIds":["x"]} suffix'),
  {
    title: 'A',
    nested: {
      ok: true
    },
    trackIds: ['x']
  },
  'parser must extract the first balanced JSON object from prose'
);

assert.deepEqual(
  parseLlmJsonObject('bad fence ```json\n{"broken": true,\n``` final {"trackIds":["ok"],"title":"Final"}', {
    isValid: (value) => Boolean(value && typeof value === 'object' && Array.isArray(value.trackIds))
  }),
  {
    trackIds: ['ok'],
    title: 'Final'
  },
  'parser must skip malformed or invalid earlier candidates and keep searching'
);

assert.deepEqual(
  parseLlmJsonObject('{"a":{"b":1,},"c":["x",],"text":"brace { inside string }",}'),
  {
    a: {
      b: 1
    },
    c: ['x'],
    text: 'brace { inside string }'
  },
  'parser must repair nested trailing commas and ignore braces inside strings'
);

assert.throws(
  () => parseLlmJsonObject('no usable object here'),
  /LLM did not return valid JSON/,
  'parser must fail visibly when no valid JSON object exists'
);

assert.deepEqual(
  parseSpecificArtistRequest('Adele的十首歌', []),
  {
    artist: 'Adele',
    requestedCount: 15,
    strictArtistOnly: true
  },
  'artist/count parser must clamp artist-的-count phrasing to the playlist floor'
);

assert.deepEqual(
  parseSpecificArtistRequest('十首Adele的歌', []),
  {
    artist: 'Adele',
    requestedCount: 15,
    strictArtistOnly: true
  },
  'artist/count parser must clamp count-before-artist phrasing to the playlist floor'
);

assert.deepEqual(
  parseSpecificArtistRequest('二十首', [{ role: 'user', text: '我要听Adele的歌' }]),
  {
    artist: 'Adele',
    requestedCount: 20,
    strictArtistOnly: true
  },
  'artist/count parser must use chat history for follow-up count requests'
);

assert.deepEqual(
  parseSpecificArtistRequest('99首Adele的歌', []),
  {
    artist: 'Adele',
    requestedCount: 50,
    strictArtistOnly: true
  },
  'artist/count parser must clamp requested counts to the playlist ceiling'
);

assert.deepEqual(
  prepareCurationCandidateTracks([], resolverTracks, [], { maxTracks: 2 }).map((track) => track.id),
  ['1501606', '4879333'],
  'bridge curation must fall back to known playable tracks before asking the LLM'
);

assert.deepEqual(
  prepareCurationCandidateTracks([], [], resolverTracks, { maxTracks: 1 }).map((track) => track.id),
  ['1501606'],
  'bridge curation must fall back to the real catalog pool when primary and known tracks are empty'
);

assert.deepEqual(
  prepareCurationCandidateTracks([resolverTracks[0]], resolverTracks, [resolverTracks[1]], { maxTracks: 3 }).map(
    (track) => track.id
  ),
  ['1501606'],
  'bridge curation must keep explicit candidates stable instead of mixing unrelated fallback tracks'
);

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalEnv = {
  voiceBaseUrl: process.env.COSIC_VOICE_BASE_URL,
  voiceMode: process.env.COSIC_VOICE_MODE,
  voiceSpeakerId: process.env.COSIC_VOICE_SPK_ID,
  voiceTimeoutMs: process.env.COSIC_VOICE_TIMEOUT_MS,
  llmBaseUrl: process.env.COSIC_LLM_BASE_URL,
  llmApiKey: process.env.COSIC_LLM_API_KEY,
  llmModel: process.env.COSIC_LLM_MODEL,
  llmTimeoutMs: process.env.COSIC_LLM_TIMEOUT_MS,
  llmCurationTimeoutMs: process.env.COSIC_LLM_CURATION_TIMEOUT_MS,
  llmProxyUrl: process.env.COSIC_LLM_PROXY_URL
};
const restoreEnv = (key, value) => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
};

try {
  process.env.COSIC_LLM_BASE_URL = 'not-a-url';
  process.env.COSIC_LLM_API_KEY = 'test-key';
  const invalidLlmAdapter = new OpenAiCompatibleLlmAdapter();
  assert.equal(invalidLlmAdapter.isConfigured(), false, 'invalid LLM base URLs must be treated as unconfigured');
  assert.equal(
    invalidLlmAdapter.getProviderLabel(),
    'OpenAI-compatible',
    'invalid LLM base URLs must not crash provider label rendering'
  );

  process.env.COSIC_LLM_BASE_URL = 'https://llm.local/v1';
  process.env.COSIC_LLM_API_KEY = 'test-key';
  process.env.COSIC_LLM_MODEL = 'test-model';
  process.env.COSIC_LLM_TIMEOUT_MS = '1000';
  delete process.env.COSIC_LLM_CURATION_TIMEOUT_MS;
  process.env.COSIC_LLM_PROXY_URL = 'http://127.0.0.1:7897';

  let proxyProbeInit;
  globalThis.fetch = async (_url, init) => {
    proxyProbeInit = init;
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    });
  };

  const proxyProbe = await new OpenAiCompatibleLlmAdapter().probe();
  assert.equal(proxyProbe.status, 'online', 'LLM probe must work with an explicit proxy URL');
  assert.equal(
    typeof proxyProbeInit?.dispatcher?.dispatch,
    'function',
    'LLM requests must attach an undici proxy dispatcher when COSIC_LLM_PROXY_URL is set'
  );
  delete process.env.COSIC_LLM_PROXY_URL;

  const curationTimeouts = [];
  globalThis.setTimeout = (callback, delay, ...args) => {
    curationTimeouts.push(delay);
    return originalSetTimeout(callback, 100000, ...args);
  };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        model: 'test-model',
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Default Timeout Station',
                intent: 'timeout regression',
                note: 'avoid premature fallback',
                reply: 'Default curation timeout is long enough.',
                trackIds: ['track-1']
              })
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      }
    );

  await new OpenAiCompatibleLlmAdapter().generateCuratedPlaylist('curate with default timeout', resolverTracks);
  globalThis.setTimeout = originalSetTimeout;
  assert.equal(
    curationTimeouts[0],
    20000,
    'curation must default to 20s so slower compatible models do not hit premature fallback'
  );
  process.env.COSIC_LLM_CURATION_TIMEOUT_MS = '20000';

  let curationAttempts = 0;
  globalThis.fetch = async () => {
    curationAttempts += 1;
    const trackIds = curationAttempts === 1 ? ['track-99'] : ['track-2'];
    return new Response(
      JSON.stringify({
        model: 'test-model',
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Retry Station',
                intent: 'contract repair',
                note: 'retry valid ids',
                reply: 'Retrying with valid ids.',
                trackIds
              })
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  };

  const repairedCuration = await new OpenAiCompatibleLlmAdapter().generateCuratedPlaylist(
    'curate from the candidate list',
    resolverTracks
  );
  assert.equal(
    curationAttempts,
    1,
    'curation must not spend a second LLM request repairing unresolvable track ids'
  );
  assert.deepEqual(
    repairedCuration.tracks.map((track) => track.id),
    ['1501606', '4879333'],
    'curation must fall back to real candidate tracks when the first response cannot be resolved'
  );

  let fallbackAttempts = 0;
  globalThis.fetch = async () => {
    fallbackAttempts += 1;
    return new Response(
      JSON.stringify({
        model: 'test-model',
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Fallback Station',
                intent: 'local fallback',
                note: 'candidate pool',
                reply: 'Use the local candidate pool.',
                trackIds: ['track-99']
              })
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  };

  const fallbackCuration = await new OpenAiCompatibleLlmAdapter().generateCuratedPlaylist(
    'curate from the candidate list',
    resolverTracks
  );
  assert.equal(
    fallbackAttempts,
    1,
    'curation must fall back immediately when the model returns only invalid track ids'
  );
  assert.deepEqual(
    fallbackCuration.tracks.map((track) => track.id),
    ['1501606', '4879333'],
    'curation fallback must return real candidate tracks instead of throwing an empty-id error'
  );

  let invalidJsonAttempts = 0;
  globalThis.fetch = async () => {
    invalidJsonAttempts += 1;
    return new Response(
      JSON.stringify({
        model: 'test-model',
        choices: [
          {
            message: {
              content:
                invalidJsonAttempts === 1
                  ? 'I would play the cello track first, then the piano track.'
                  : 'Still not JSON.'
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  };

  const invalidJsonFallbackCuration = await new OpenAiCompatibleLlmAdapter().generateCuratedPlaylist(
    'curate from an invalid LLM response',
    resolverTracks
  );
  assert.equal(
    invalidJsonAttempts,
    1,
    'curation must fall back immediately when the model returns prose instead of JSON'
  );
  assert.deepEqual(
    invalidJsonFallbackCuration.tracks.map((track) => track.id),
    ['1501606', '4879333'],
    'curation must fall back to real candidate tracks when JSON repair also fails'
  );

  let objectPlanAttempts = 0;
  globalThis.fetch = async () => {
    objectPlanAttempts += 1;
    return new Response(
      JSON.stringify({
        model: 'test-model',
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Object Plan Station',
                reason: 'object-shaped selections',
                description: 'The provider returned a common non-canonical shape.',
                message: 'I picked these by title and artist.',
                tracks: [
                  { id: 'track-2', title: 'Evening Wind', artist: 'Joe Hisaishi' },
                  { songId: '1501606', name: 'Cello Suite No. 1', artists: ['Janos Starker'] }
                ]
              })
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  };

  const objectPlanCuration = await new OpenAiCompatibleLlmAdapter().generateCuratedPlaylist(
    'curate from object shaped model output',
    resolverTracks
  );
  assert.equal(objectPlanAttempts, 1, 'object-shaped playlist plans must not trigger extra LLM requests');
  assert.equal(objectPlanCuration.title, 'Object Plan Station', 'playlist title must normalize from common name fields');
  assert.deepEqual(
    objectPlanCuration.tracks.map((track) => track.id),
    ['4879333', '1501606'],
    'curation must resolve object-shaped model output into real candidate tracks'
  );

  let llmAttempts = 0;
  globalThis.fetch = async () => {
    llmAttempts += 1;
    if (llmAttempts === 1) {
      throw new TypeError('fetch failed');
    }

    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    });
  };

  const retryProbe = await new OpenAiCompatibleLlmAdapter().probe();
  assert.equal(retryProbe.status, 'online', 'LLM probe must recover from a transient fetch failure');
  assert.equal(llmAttempts, 2, 'LLM requests must retry transient fetch failures once before surfacing an error');

  process.env.COSIC_VOICE_BASE_URL = 'http://voice.local/';
  process.env.COSIC_VOICE_MODE = 'sft';
  process.env.COSIC_VOICE_SPK_ID = '';
  process.env.COSIC_VOICE_TIMEOUT_MS = '50';
  delete process.env.COSIC_VOICE_MAX_TEXT_CHARS;

  let requestUrl = '';
  let requestInit;
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response(Uint8Array.from([0, 0, 1, 0, 2, 0, 3, 0]));
  };

  const narration = await new CosyVoiceAdapter().generateNarrationAudio('  smoke narration  ');
  const narrationBuffer = Buffer.from(narration.audioBase64, 'base64');
  assert.equal(requestUrl, 'http://voice.local/inference_sft', 'CosyVoice SFT mode must call the SFT endpoint');
  assert.equal(requestInit?.body?.get('tts_text'), 'smoke narration', 'CosyVoice request must send trimmed text');
  assert.equal(
    requestInit?.body?.get('spk_id'),
    '\u4e2d\u6587\u5973',
    'CosyVoice request must default to the Chinese female speaker'
  );
  assert.equal(narration.mimeType, 'audio/wav', 'CosyVoice narration must be returned as wav');
  assert.equal(narration.sampleRateHz, 22050, 'CosyVoice narration must declare the expected sample rate');
  assert.equal(
    narrationBuffer.subarray(0, 4).toString('ascii'),
    'RIFF',
    'CosyVoice raw PCM must be wrapped in a WAV header'
  );

  await new CosyVoiceAdapter().generateNarrationAudio('x'.repeat(320));
  assert.equal(
    requestInit?.body?.get('tts_text').length,
    260,
    'CosyVoice default narration text must stay short enough for stable local inference'
  );

  globalThis.fetch = async () => new Response(new Uint8Array());
  await assert.rejects(
    () => new CosyVoiceAdapter().generateNarrationAudio('empty'),
    /empty audio/,
    'CosyVoice must fail visibly when the server returns empty audio'
  );

  process.env.COSIC_VOICE_TIMEOUT_MS = '5';
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  await assert.rejects(
    () => new CosyVoiceAdapter().generateNarrationAudio('timeout'),
    /timed out/,
    'CosyVoice must fail visibly when the local server hangs'
  );

  globalThis.fetch = async () => {
    throw new TypeError('terminated');
  };
  await assert.rejects(
    () => new CosyVoiceAdapter().generateNarrationAudio('stream interrupted'),
    /stream ended before audio was fully generated/,
    'CosyVoice stream interruptions must be mapped to an actionable warming-up error'
  );
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  restoreEnv('COSIC_VOICE_BASE_URL', originalEnv.voiceBaseUrl);
  restoreEnv('COSIC_VOICE_MODE', originalEnv.voiceMode);
  restoreEnv('COSIC_VOICE_SPK_ID', originalEnv.voiceSpeakerId);
  restoreEnv('COSIC_VOICE_TIMEOUT_MS', originalEnv.voiceTimeoutMs);
  restoreEnv('COSIC_LLM_BASE_URL', originalEnv.llmBaseUrl);
  restoreEnv('COSIC_LLM_API_KEY', originalEnv.llmApiKey);
  restoreEnv('COSIC_LLM_MODEL', originalEnv.llmModel);
  restoreEnv('COSIC_LLM_TIMEOUT_MS', originalEnv.llmTimeoutMs);
  restoreEnv('COSIC_LLM_CURATION_TIMEOUT_MS', originalEnv.llmCurationTimeoutMs);
  restoreEnv('COSIC_LLM_PROXY_URL', originalEnv.llmProxyUrl);
}

console.log('llm json repair smoke passed');
