import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeckCards } from './deck.ts';
import { buildApkgBlob, buildExportSnapshot, buildNoteRecords, candidatesForExportSnapshot, createApkgFilename, stableApkgIds, noteModForExport } from './exporter.ts';
import type { Candidate } from './candidate.ts';

const candidate: Candidate = {
  id: 'row-1',
  sourceLine: 1,
  raw: 'synthetic test row',
  expression: '架空語',
  reading: '',
  meaning: '架空的释义',
  partOfSpeech: '',
  pitch: '',
  example: '',
  note: '',
  status: 'pending',
};

test('refuses to build an empty deck before initializing the WASM exporter', async () => {
  await assert.rejects(
    buildApkgBlob([candidate], '测试牌组'),
    /没有可导出的有效词条/,
  );
});

test('creates a filesystem-safe APKG download filename', () => {
  const filename = createApkgFilename('  Lesson/日本語:*?  ');
  assert.ok(filename.endsWith('.apkg'));
  assert.doesNotMatch(filename, /[<>:"/\\|?*\u0000-\u001f]/);
  assert.equal(createApkgFilename('   '), 'anki-deck.apkg');
});

test('build snapshot derives preview and APKG records from the same auto-validated rows', () => {
  const row: Candidate = {
    ...candidate, expression: '架空漢字', reading: 'かくうかな', meaning: '虚构释义',
    example: '架空の文', exampleRaw: '架空の文（かくうのぶん）（虚构译文）',
    exampleReading: 'かくうのぶん', exampleMeaning: '虚构译文', exampleParseStatus: 'parsed',
    status: 'pending',
  };
  const snapshot = buildExportSnapshot([row]);
  assert.equal(snapshot.records.length, 1);
  assert.deepEqual(snapshot.cards.map(card => card.template), ['A', 'B', 'C']);
});

test('maps only one snapshot’s validated records to confirmed preview candidates', () => {
  const valid: Candidate = {
    ...candidate, id: 'valid', expression: '架空漢字', reading: 'かくうかな', meaning: '虚构释义',
    example: '架空の文', exampleReading: 'かくうのぶん', exampleMeaning: '虚构译文', exampleParseStatus: 'parsed',
  };
  const invalid = { ...valid, id: 'invalid', expression: '不完整', exampleReading: '' };
  const duplicate = { ...valid, id: 'duplicate', expression: '重複語', reading: 'ちょうふくご' };
  const duplicateAgain = { ...duplicate, id: 'duplicate-again', meaning: '重复释义' };
  const otherUpload = { ...valid, id: 'other-upload', expression: '別の架空語', reading: 'べつのかくうご' };
  const snapshot = buildExportSnapshot([valid, invalid, duplicate, duplicateAgain]);

  const previewCandidates = candidatesForExportSnapshot(snapshot, [valid, invalid, duplicate, duplicateAgain, otherUpload]);
  assert.deepEqual(previewCandidates.map(row => [row.id, row.status]), [['valid', 'confirmed']]);
  assert.deepEqual(buildDeckCards(previewCandidates).map(card => card.template), ['A', 'B', 'C']);
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.cards.length, 3);

  const nextSnapshot = buildExportSnapshot([otherUpload]);
  const nextPreviewCandidates = candidatesForExportSnapshot(nextSnapshot, [otherUpload]);
  assert.deepEqual(nextPreviewCandidates.map(row => row.id), ['other-upload']);
  assert.deepEqual(candidatesForExportSnapshot(snapshot, [otherUpload]), []);
});
test('preserves semantic note GUID across inserted rows and changed meanings while distinguishing readings and sources', () => {
  const original: Candidate = {
    ...candidate, expression: '架空漢字', reading: 'かくうかな', meaning: '初稿',
    example: '架空の文', exampleReading: 'かくうのぶん', exampleMeaning: '虚构译文', exampleParseStatus: 'parsed',
  };
  const inserted = { ...original, id: 'row-2', sourceLine: 2, meaning: '修订稿' };
  const originalGuid = buildExportSnapshot([original], '合成资料').records[0].guid;
  assert.match(originalGuid, /^anki-[0-9a-f]{16}$/);
  assert.equal(originalGuid, buildExportSnapshot([inserted], '合成资料').records[0].guid);
  assert.notEqual(originalGuid, buildExportSnapshot([{ ...original, reading: 'かくうべつ' }], '合成资料').records[0].guid);
  assert.notEqual(originalGuid, buildExportSnapshot([original], '另一资料').records[0].guid);
  assert.notEqual(originalGuid, buildExportSnapshot([{ ...original, expression: '別の架空語' }], '合成资料').records[0].guid);
});

test('rejects every row sharing a source, expression, and reading identity with its source line and reason', () => {
  const first: Candidate = {
    ...candidate, sourceLine: 7, expression: '架空漢字', reading: 'かくうかな', meaning: '第一释义',
    example: '架空の文', exampleReading: 'かくうのぶん', exampleMeaning: '第一译文', exampleParseStatus: 'parsed',
  };
  const second = { ...first, id: 'row-8', sourceLine: 8, meaning: '另一释义', exampleMeaning: '另一译文' };
  const snapshot = buildExportSnapshot([first, second], '合成资料');
  assert.equal(snapshot.records.length, 0);
  assert.deepEqual(snapshot.rejected.map(({ candidate: row, reasons }) => [row.sourceLine, reasons]), [
    [7, ['同来源、同词形和同假名的重复键；为避免多义词条静默合并，未导出']],
    [8, ['同来源、同词形和同假名的重复键；为避免多义词条静默合并，未导出']],
  ]);
});

test('derives repeatable safe model and deck IDs and retains exactly three cards per accepted note', () => {
  const row: Candidate = {
    ...candidate, expression: '架空漢字', reading: 'かくうかな', meaning: '虚构释义',
    example: '架空の文', exampleReading: 'かくうのぶん', exampleMeaning: '虚构译文', exampleParseStatus: 'parsed',
  };
  const rows = Array.from({ length: 43 }, (_, index): Candidate => ({
    ...row,
    id: `row-${index + 1}`,
    sourceLine: index + 1,
    expression: `架空漢字${index + 1}`,
    reading: `かくうかな${index + 1}`,
  }));
  const firstIds = stableApkgIds('稳定牌组');
  const secondIds = stableApkgIds('稳定牌组');
  assert.deepEqual(firstIds, secondIds);
  assert.ok(Number.isSafeInteger(firstIds.modelId));
  assert.ok(Number.isSafeInteger(firstIds.deckId));
  const firstBuild = buildExportSnapshot(rows, '稳定牌组');
  const secondBuild = buildExportSnapshot(rows, '稳定牌组');
  assert.deepEqual(firstBuild.records.map(record => record.guid), secondBuild.records.map(record => record.guid));
  assert.equal(firstBuild.records.length, 43);
  assert.equal(firstBuild.cards.length, 129);
  assert.ok(firstBuild.cards.every(card => ['A', 'B', 'C'].includes(card.template)));
});

test('creates one note with three card ordinals for an automatically validated example candidate', () => {
  const [record] = buildNoteRecords([{
    ...candidate,
    status: 'pending',
    expression: '架空漢字',
    reading: 'かくうかな',
    meaning: '虚构释义',
    example: '架空の文',
    exampleReading: 'かくうのぶん',
    exampleMeaning: '虚构例句译文',
    exampleRaw: '架空の文（かくうのぶん）（虚构例句译文）',
    exampleParseStatus: 'parsed',
  }]);

  assert.equal(buildNoteRecords([candidate]).length, 0);
  assert.equal(record.candidateId, 'row-1');
  assert.deepEqual(record.cardOrdinals, [0, 1, 2]);
  assert.equal(record.fields.length, 8);
  assert.match(record.fields[0], /架空漢字/);
  assert.match(record.fields[4], /架空の文/);
  assert.match(record.fields[6], /虚构例句译文/);
});

test('edited meaning gets a strictly newer note mod even when exported in the same second', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const first = noteModForExport(storage, 'stable-guid', ['word', 'old meaning'], 1790568304);
  const repeated = noteModForExport(storage, 'stable-guid', ['word', 'old meaning'], 1790568304);
  const changed = noteModForExport(storage, 'stable-guid', ['word', 'new meaning'], 1790568304);
  assert.equal(repeated, first);
  assert.ok(changed > first);
  assert.equal(noteModForExport(storage, 'stable-guid', ['word', 'new meaning'], 1790568304), changed);
  assert.equal(noteModForExport(storage, 'another-guid', ['word', 'new meaning'], 1790568304), first);
});

test('allows a first export without a cached note mod', () => {
  const storage = { getItem: () => null, setItem: () => {} };
  assert.equal(noteModForExport(storage, 'new-guid', ['word', 'meaning'], 1790568304), 1790568304);
});

test('fails closed with an actionable Chinese error when reading the note-mod cache fails', () => {
  const storage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => {},
  };
  assert.throws(
    () => noteModForExport(storage, 'stable-guid', ['word', 'meaning'], 1790568304),
    /Anki 导出失败：本地更新缓存读取失败.*浏览器.*重试/,
  );
});

test('fails closed with an actionable Chinese error when writing the note-mod cache fails', () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota'); },
  };
  assert.throws(
    () => noteModForExport(storage, 'stable-guid', ['word', 'meaning'], 1790568304),
    /Anki 导出失败：本地更新缓存写入失败.*浏览器.*重试/,
  );
});

test('fails closed for malformed or invalid note-mod cache data', () => {
  for (const cached of [
    'not-json',
    JSON.stringify({ fingerprint: '', mod: 1790568304 }),
    JSON.stringify({ fingerprint: 'not-a-fingerprint', mod: 1790568304 }),
    JSON.stringify({ fingerprint: '0123456789abcdef', mod: -1 }),
    JSON.stringify({ fingerprint: '0123456789abcdef', mod: 1.5 }),
    JSON.stringify({ fingerprint: '0123456789abcdef', mod: Number.MAX_SAFE_INTEGER + 1 }),
    JSON.stringify(null),
  ]) {
    const storage = { getItem: () => cached, setItem: () => {} };
    assert.throws(
      () => noteModForExport(storage, 'stable-guid', ['word', 'meaning'], 1790568304),
      /Anki 导出失败：本地更新缓存无效.*清除该词条缓存项.*后重试/,
      `expected invalid cache to be rejected: ${cached}`,
    );
  }
});
