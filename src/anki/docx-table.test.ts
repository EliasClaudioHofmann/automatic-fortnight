import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocxTableRows } from './candidate.ts';

test('maps Gemini DOCX columns by header and separates headword, reading, meaning, and example parts', () => {
  const rows = [
    ['例句 (Example)', '备用列', '日汉字 (Kanji)', '中文意思', '日文假名 (Kana)', '默写区（抄写/听写）'],
    ['種をまく（たねをまく）（撒种子）', 'discard me', '撒く', '撒', 'まく', ''],
  ];
  const [candidate] = parseDocxTableRows(rows);

  assert.equal(candidate.sourceLine, 2);
  assert.equal(candidate.expression, '撒く');
  assert.equal(candidate.reading, 'まく');
  assert.equal(candidate.meaning, '撒');
  assert.equal(candidate.example, '種をまく');
  assert.equal(candidate.exampleReading, 'たねをまく');
  assert.equal(candidate.exampleMeaning, '撒种子');
  assert.equal(candidate.exampleRaw, '種をまく（たねをまく）（撒种子）');
  assert.equal(candidate.exampleParseStatus, 'parsed');
  assert.equal(candidate.status, 'pending');
});

test('uses kana as the displayed word when the kanji column is a dash or blank', () => {
  const rows = [
    ['日文假名 (Kana)', '日汉字 (Kanji)', '中文意思', '例句 (Example)'],
    ['つまる', '—', '堵塞', '道がつまる（みちがつまる）（道路堵塞）'],
    ['かなだけ', '  ', '只有假名', 'かなだけ（かなだけ）（只有假名）'],
  ];
  const candidates = parseDocxTableRows(rows);

  assert.equal(candidates[0].expression, 'つまる');
  assert.equal(candidates[0].reading, 'つまる');
  assert.equal(candidates[1].expression, 'かなだけ');
  assert.equal(candidates[1].reading, 'かなだけ');
});

test('fails closed when required headings are missing or duplicated', () => {
  assert.throws(() => parseDocxTableRows([
    ['日文假名 (Kana)', '日汉字 (Kanji)', '例句 (Example)'],
    ['かな', '仮名', 'かな（かな）（假名）'],
  ]), /表头/);
  assert.throws(() => parseDocxTableRows([
    ['日文假名 (Kana)', '日汉字 (Kanji)', 'Kanji', '中文意思', '例句 (Example)'],
    ['かな', '仮名', '仮名', '假名', 'かな（かな）（假名）'],
  ]), /重复/);
});

test('retains an unrecognized example cell and marks it for review instead of guessing', () => {
  const rows = [
    ['日文假名 (Kana)', '日汉字 (Kanji)', '中文意思', '例句 (Example)'],
    ['かな', '仮名', '假名', '例句格式不明确'],
  ];
  const [candidate] = parseDocxTableRows(rows);

  assert.equal(candidate.exampleRaw, '例句格式不明确');
  assert.equal(candidate.example, '');
  assert.equal(candidate.exampleParseStatus, 'needs-review');
});
