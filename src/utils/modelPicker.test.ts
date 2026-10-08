import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ModelPicker from '../ModelPicker.tsx';

test('model picker renders the selected model and warns about quota and generated Japanese accuracy', () => {
  const html = renderToStaticMarkup(createElement(ModelPicker, {
    value: 'gemini-3.5-flash-lite', onChange: () => {},
  }));
  assert.match(html, /<select[^>]*id="gemini-model"/);
  assert.equal((html.match(/<option /g) ?? []).length, 5);
  assert.match(html, /<option value="gemini-3\.5-flash-lite" selected="">/);
  assert.match(html, /额度/);
  assert.match(html, /核对.*读音|读音.*核对/);
});
