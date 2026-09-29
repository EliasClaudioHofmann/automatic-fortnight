import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTxtTable, validateForAutomaticExport } from './candidate.ts';
import { buildDeckCards } from './deck.ts';
import { buildExportSnapshot } from './exporter.ts';

const guidance = /表头.*制表符|制表符.*表头/;

test('parses reordered TSV headings with extra columns and yields one exportable note and three cards', () => {
  const text = [
    'Example\t备注\tKanji\t中文意思\tKana',
    '猫が寝る（ねこがねる）（猫在睡觉）\tunused\t猫\t猫\tねこ',
  ].join('\n');
  const candidates = parseTxtTable(text);
  const result = validateForAutomaticExport(candidates);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceType, 'txt-table');
  assert.equal(candidates[0].expression, '猫');
  assert.equal(candidates[0].reading, 'ねこ');
  assert.equal(candidates[0].meaning, '猫');
  assert.equal(candidates[0].example, '猫が寝る');
  assert.equal(candidates[0].exampleReading, 'ねこがねる');
  assert.equal(candidates[0].exampleMeaning, '猫在睡觉');
  assert.equal(result.exportable.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.equal(buildDeckCards(result.exportable).length, 3);
});

test('keeps valid TXT rows when another row has incomplete fields or an unclear example', () => {
  const text = [
    'Kana\tKanji\t中文意思\tExample',
    'ねこ\t猫\t猫\t猫が寝る（ねこがねる）（猫在睡觉）',
    'いぬ\t犬\t狗\t格式不明的例句',
  ].join('\n');
  const candidates = parseTxtTable(text);
  const snapshot = buildExportSnapshot(candidates);

  assert.equal(candidates.length, 2);
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.cards.length, 3);
  assert.equal(snapshot.rejected.length, 1);
  assert.equal(snapshot.rejected[0].candidate.sourceLine, 3);
  assert.ok(snapshot.rejected[0].reasons.some(reason => /例句|例句格式/.test(reason)));
});

test('requires a tab-separated header and never infers missing fields from prose', () => {
  for (const text of [
    '猫：猫\n犬：狗',
    '日语单词 猫 的意思是猫。',
    'Kana Kanji 中文意思 Example\nねこ 猫 猫 猫が寝る（ねこがねる）（猫在睡觉）',
  ]) {
    assert.throws(() => parseTxtTable(text), guidance);
  }
});

test('fails closed for missing/duplicate headings and mismatched row width', () => {
  const malformedDocuments = [
    'Kana\tKanji\t中文意思\nねこ\t猫\t猫',
    'Kana\tKanji\tKanji\t中文意思\tExample\nねこ\t猫\t猫\t猫\t猫が寝る（ねこがねる）（猫在睡觉）',
    'Kana\tKanji\t中文意思\tExample\nねこ\t猫\t猫',
  ];
  for (const text of malformedDocuments) assert.throws(() => parseTxtTable(text), guidance);
});

test('returns incomplete fields and unclear examples as row-level rejections', () => {
  const text = [
    'Kana\tKanji\t中文意思\tExample',
    'ねこ\t猫\t猫\t猫が寝る（ねこがねる）（猫在睡觉）',
    '\t猫\t猫\t猫が寝る（ねこがねる）（猫在睡觉）',
    'いぬ\t犬\t狗\t格式不明的例句',
  ].join('\n');
  const candidates = parseTxtTable(text);
  const snapshot = buildExportSnapshot(candidates);

  assert.equal(candidates.length, 3);
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.cards.length, 3);
  assert.equal(snapshot.rejected.length, 2);
  assert.deepEqual(snapshot.rejected.map(item => item.candidate.sourceLine), [3, 4]);
  assert.ok(snapshot.rejected[0].reasons.includes('缺少词条假名'));
  assert.ok(snapshot.rejected[1].reasons.includes('缺少日文例句'));
});
