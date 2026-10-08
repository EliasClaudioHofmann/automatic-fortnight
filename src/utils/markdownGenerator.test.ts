import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMarkdown } from './markdownGenerator.ts';
import type { WordPairDocument, WordPairEnglish, WordPairJapanese } from '../services/geminiService.ts';

const japanese: WordPairJapanese = { type: 'japanese', ja: '日本語', reading: 'にほんご', cn: '日语' };
const english: WordPairEnglish = { type: 'english', en: 'apple', cn: '苹果' };
const document: WordPairDocument = {
  type: 'document', kana: 'たべる', kanji: '食べる', en: 'to eat',
  example: 'ご飯を食べる（ごはんをたべる）（吃饭）', cn: '吃',
};

test('Japanese mode exports a UTF-8 Markdown vocabulary table with a blank practice column', () => {
  const text = generateMarkdown([japanese], 'japanese');
  assert.match(text, /\| 日语 \| 中文 \| 默写\/挖空 \|/);
  assert.match(text, /\| 日本語（にほんご） \| 日语 \|\s+\|/);
  assert.equal(new TextDecoder().decode(new TextEncoder().encode(text)), text);
});

test('English mode exports the word, Chinese meaning, and blank practice space', () => {
  const text = generateMarkdown([english], 'english');
  assert.match(text, /\| apple \| 苹果 \|\s+\|/);
});

test('Document mode exports seven ordered columns with the original example intact', () => {
  const text = generateMarkdown([document], 'document');
  const lines = text.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '| 日文假名 | 日文默写 | 日汉字 | 默写 | 英文翻译 | 例句 | 中文意思 |');
  assert.equal(lines[2], '| たべる |  | 食べる |  | to eat | ご飯を食べる（ごはんをたべる）（吃饭） | 吃 |');
});

test('Markdown export escapes pipes, backslashes, markup, and embedded newlines without splitting rows', () => {
  const text = generateMarkdown([{ ...document, kanji: 'A|B', en: 'a\\b', cn: '<script>&\n次行' }], 'document');
  assert.equal(text.trimEnd().split('\n').length, 3);
  assert.match(text, /A\\\|B/);
  assert.match(text, /a\\\\b/);
  assert.match(text, /&lt;script&gt;&amp;<br>次行/);
});
