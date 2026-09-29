import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidates, confirmedCards, validateForAutomaticExport, type Candidate } from './candidate.ts';

test('retains source lines, skips headings, and attaches indented notes without inventing fields', () => {
  const text = '2026年9月\nN2\n食べる：吃\n  例：パンを食べる\n読む\t阅读\n長いメモだけの説明です。これは単語ではありません。';
  const rows = parseCandidates(text);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.sourceLine), [3, 5]);
  assert.equal(rows[0].raw, '食べる：吃\n  例：パンを食べる');
  assert.equal(rows[0].expression, '食べる');
  assert.equal(rows[0].meaning, '吃');
  assert.equal(rows[0].example, 'パンを食べる');
  assert.equal(rows[0].reading, '');
  assert.equal(rows[0].partOfSpeech, '');
  assert.equal(rows[0].pitch, '');
  assert.equal(rows[1].meaning, '阅读');
});

test('only confirmed, complete Chinese to Japanese rows become preview cards', () => {
  const base: Candidate = {
    id: '1', sourceLine: 1, raw: '読む：阅读', expression: '読む',
    reading: '', meaning: '阅读', partOfSpeech: '', pitch: '', example: '', note: '', status: 'pending'
  };
  const rows: Candidate[] = [base, { ...base, id: '2', status: 'confirmed' },
    { ...base, id: '3', status: 'confirmed', meaning: '' },
    { ...base, id: '4', status: 'skipped' }];
  assert.deepEqual(confirmedCards(rows).map(card => card.id), ['2']);
});

test('auto-validates complete rows and reports deterministic rejection reasons without review', () => {
  const valid: Candidate = {
    id: 'ok', sourceLine: 2, sourceType: 'docx-table', raw: 'complete row',
    expression: '架空漢字', reading: 'かくうかな', meaning: '虚构释义',
    partOfSpeech: '', pitch: '', example: '架空の文', exampleRaw: '架空の文（かくうのぶん）（虚构译文）',
    exampleReading: 'かくうのぶん', exampleMeaning: '虚构译文', exampleParseStatus: 'parsed',
    note: '', status: 'pending',
  };
  const invalid: Candidate = {
    ...valid, id: 'bad', sourceLine: 3, exampleReading: '', status: 'pending',
  };
  assert.deepEqual(validateForAutomaticExport([valid, invalid]), {
    exportable: [{ ...valid, status: 'confirmed' }],
    rejected: [{ candidate: invalid, reasons: ['缺少例句假名读音'] }],
  });
  const ambiguous = { ...valid, id: 'ambiguous', exampleParseStatus: 'needs-review' as const };
  assert.deepEqual(validateForAutomaticExport([ambiguous]), {
    exportable: [],
    rejected: [{ candidate: ambiguous, reasons: ['例句格式无法确定'] }],
  });
});
