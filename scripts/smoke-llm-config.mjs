import assert from 'node:assert/strict';
import fs from 'node:fs';

const llmSource = fs.readFileSync('src/main/bridge/adapters/openai-compatible-llm.ts', 'utf8');
const envExample = fs.readFileSync('.env.example', 'utf8');

assert.match(llmSource, /DEFAULT_LLM_MODEL\s*=\s*'gpt-5\.5'/, 'LLM default model must be gpt-5.5');
assert.match(llmSource, /DEFAULT_REASONING_EFFORT\s*=\s*'xhigh'/, 'LLM default reasoning effort must be xhigh');
assert.match(
  llmSource,
  /COSIC_LLM_REASONING_EFFORT/,
  'LLM reasoning effort must be configurable through env'
);
assert.match(
  llmSource,
  /reasoning_effort:\s*this\.config\.reasoningEffort/,
  'chat completion requests must use the configured reasoning effort'
);
assert.doesNotMatch(
  llmSource,
  /reasoning_effort:\s*['"]xhigh['"]/,
  'chat completion requests must not hardcode xhigh per request'
);

assert.match(envExample, /COSIC_LLM_MODEL=gpt-5\.5/, '.env.example must document the default model');
assert.match(
  envExample,
  /COSIC_LLM_REASONING_EFFORT=xhigh/,
  '.env.example must document the default reasoning effort'
);

console.log('llm config smoke passed');
