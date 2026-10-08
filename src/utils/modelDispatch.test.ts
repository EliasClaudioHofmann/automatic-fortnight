import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWords } from '../services/geminiService.ts';

test('PDF vision extraction sends the selected model ID to Gemini', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '[{"en":"apple","cn":"苹果"}]' }], role: 'model' }, finishReason: 'STOP' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const pairs = await extractWords('test-key', ['ZGF0YQ=='], 'english', () => {}, 'gemini-3.5-flash-lite');
    assert.equal(pairs.length, 1);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /models\/gemini-3\.5-flash-lite:generateContent/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PDF vision extraction exposes model quota errors instead of returning an empty success', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded for selected model' },
  }), { status: 429, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(
      extractWords('test-key', ['ZGF0YQ=='], 'japanese', () => {}, 'gemini-3.8-flash'),
      /quota exceeded for selected model/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
