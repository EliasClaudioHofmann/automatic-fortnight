import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, loadModelSelection, saveModelSelection } from '../services/modelSelection.ts';

test('model picker lists the supported Gemini IDs and preserves the existing default', () => {
  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.8-flash');
  assert.deepEqual(GEMINI_MODELS.map(option => option.id), [
    'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash',
    'gemini-3.5-flash', 'gemini-3.5-flash-lite',
  ]);
});

test('model picker remembers a selected model but ignores stale or invalid storage', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  assert.equal(loadModelSelection(storage), DEFAULT_GEMINI_MODEL);
  saveModelSelection(storage, 'gemini-3.5-flash-lite');
  assert.equal(loadModelSelection(storage), 'gemini-3.5-flash-lite');
  storage.setItem('vocabulary-gemini-model', 'unsupported-model');
  assert.equal(loadModelSelection(storage), DEFAULT_GEMINI_MODEL);
});
