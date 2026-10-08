import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('input screen exposes model selection and forwards it to all three conversion paths', () => {
  assert.match(app, /<ModelPicker\s+value=\{modelId\}/);
  assert.match(app, /extractWordsFromDocument\(apiKey, fullText,[\s\S]{0,100}?, modelId\)/);
  assert.match(app, /extractWordsFromText\(apiKey, await file\.text\(\), language, undefined, modelId\)/);
  assert.match(app, /extractWords\(apiKey, images, language,[\s\S]{0,220}?, modelId\)/);
});
