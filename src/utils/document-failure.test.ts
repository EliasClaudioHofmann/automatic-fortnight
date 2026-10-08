import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWordsFromDocument } from '../services/geminiService.ts';

const rubyNote = '<ruby>崩す<rt>くずす</rt></ruby>\nこわす　<ruby>壊<rt>こわ</rt></ruby>す';

test('document Markdown surfaces Gemini request failure instead of reporting zero words as success', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'test request rejected' } }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await assert.rejects(extractWordsFromDocument('test-key', rubyNote), /test request rejected/);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('document Markdown does not report success when Gemini returns an empty array', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '[]' }], role: 'model' }, finishReason: 'STOP' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(extractWordsFromDocument('test-key', rubyNote), /未识别到词汇/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('document Markdown recovers from a 503 using the verified fallback and reports it', async () => {
  const originalFetch = globalThis.fetch;
  const models: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    models.push(url.includes('gemini-3.5-flash-lite') ? 'lite' : 'primary');
    if (url.includes('gemini-3.8-flash')) {
      return new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } }), {
        status: 503, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"kana":"くずす","kanji":"崩す","cn":"破坏","en":"to break","example":"形を崩す（かたちをくずす）（破坏形状）"}]' }], role: 'model' }, finishReason: 'STOP' }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    let fallbackCount = 0;
    const pairs = await extractWordsFromDocument('test-key', rubyNote, () => { fallbackCount++; });
    assert.deepEqual(models, ['primary', 'lite']);
    assert.equal(fallbackCount, 1);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].kanji, '崩す');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('document import calls the chosen model instead of the former fixed default', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"kana":"くずす","kanji":"崩す","cn":"破坏","en":"to break","example":"形を崩す（かたちをくずす）（破坏形状）"}]' }], role: 'model' }, finishReason: 'STOP' }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const pairs = await extractWordsFromDocument('test-key', rubyNote, undefined, 'gemini-3.5-flash');
    assert.equal(pairs.length, 1);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /models\/gemini-3\.5-flash:generateContent/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('selecting Flash Lite does not retry the same model on HTTP 503', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'lite busy' } }), {
      status: 503, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await assert.rejects(extractWordsFromDocument('test-key', rubyNote, undefined, 'gemini-3.5-flash-lite'), /lite busy/);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /models\/gemini-3\.5-flash-lite:generateContent/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
