import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeckCards } from './deck.ts';
import type { Candidate } from './candidate.ts';

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: 'test-1',
  sourceLine: 12,
  raw: 'sample source only',
  expression: '架空語',
  reading: '',
  meaning: '架空的释义',
  partOfSpeech: '',
  pitch: '',
  example: '',
  note: '',
  status: 'pending',
  ...overrides,
});

test('creates the C word-to-meaning card when a text candidate has no example', () => {
  const cards = buildDeckCards([
    candidate({ id: 'a', status: 'confirmed' }),
    candidate({ id: 'b', status: 'confirmed', expression: '別の架空語', meaning: '另一条释义' }),
    candidate({ id: 'c', status: 'pending' }),
  ]);

  assert.equal(cards.length, 2);
  assert.equal(cards[0].template, 'C');
  assert.match(cards[0].frontHtml, /架空語/);
  assert.match(cards[0].backHtml, /架空的释义/);
  assert.equal(cards[1].template, 'C');
  assert.match(cards[1].frontHtml, /別の架空語/);
  assert.match(cards[1].backHtml, /另一条释义/);
});

test('excludes skipped, unconfirmed, and incomplete candidates', () => {
  const cards = buildDeckCards([
    candidate({ id: 'pending' }),
    candidate({ id: 'skipped', status: 'skipped' }),
    candidate({ id: 'empty-expression', status: 'confirmed', expression: '  ' }),
    candidate({ id: 'empty-meaning', status: 'confirmed', meaning: '\n ' }),
  ]);

  assert.deepEqual(cards, []);
});

test('escapes user-provided word, meaning, and example fields in every template', () => {
  const cards = buildDeckCards([
    candidate({
      status: 'confirmed',
      expression: '<script>架空()</script>',
      meaning: '<img src=x onerror=alert(1)>',
      reading: 'よみ&<svg>',
      example: '例文<script>bad()</script>',
      exampleReading: 'れいぶん&<svg>',
      exampleMeaning: '译文" onclick="evil',
    }),
  ]);

  assert.equal(cards.length, 3);
  const html = cards.flatMap(card => [card.frontHtml, card.backHtml]).join('\n');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;架空\(\)&lt;\/script&gt;/);
  assert.match(html, /よみ&amp;&lt;svg&gt;/);
  assert.match(html, /例文&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(html, /れいぶん&amp;&lt;svg&gt;/);
  assert.match(html, /译文&quot; onclick=&quot;evil/);
  assert.doesNotMatch(html, /<(?:script|svg|img)\b/i);
});

test('includes example reading and translation on the answer side where specified', () => {
  const cards = buildDeckCards([
    candidate({
      status: 'confirmed',
      reading: 'かな',
      partOfSpeech: '名詞',
      pitch: '0',
      example: '例文（架空）',
      note: '人工备注',
    }),
  ]);

  assert.equal(cards.length, 3);
  assert.match(cards[0].frontHtml, /例文（架空）/);
  assert.match(cards[1].backHtml, /かな/);
  assert.match(cards[2].backHtml, /かな/);
});

test('builds three distinct card layouts without leaking the example translation to fronts', () => {
  const cards = buildDeckCards([candidate({
    status: 'confirmed',
    expression: '架空漢字',
    reading: 'ことばよみ',
    meaning: '词条释义',
    example: '架空の例文',
    exampleReading: 'かくうのれいぶん',
    exampleMeaning: '虚构例句译文',
    exampleRaw: '架空の例文（かくうのれいぶん）（虚构例句译文）',
    exampleParseStatus: 'parsed',
  })]);

  assert.equal(cards.length, 3);
  assert.match(cards[0].frontHtml, /架空漢字/);
  assert.match(cards[0].frontHtml, /ことばよみ/);
  assert.match(cards[0].frontHtml, /架空の例文/);
  assert.match(cards[0].frontHtml, /かくうのれいぶん/);
  assert.doesNotMatch(cards[0].frontHtml, /虚构例句译文|词条释义/);
  assert.match(cards[0].backHtml, /架空漢字/);
  assert.match(cards[0].backHtml, /架空の例文/);
  assert.match(cards[0].backHtml, /词条释义/);
  assert.match(cards[0].backHtml, /虚构例句译文/);

  assert.match(cards[1].frontHtml, /架空漢字/);
  assert.match(cards[1].frontHtml, /架空の例文/);
  assert.match(cards[1].frontHtml, /かくうのれいぶん/);
  assert.doesNotMatch(cards[1].frontHtml, /ことばよみ|虚构例句译文|词条释义/);
  assert.match(cards[1].backHtml, /词条释义/);
  assert.match(cards[1].backHtml, /ことばよみ/);
  assert.match(cards[1].backHtml, /虚构例句译文/);

  assert.match(cards[2].frontHtml, /架空漢字/);
  assert.doesNotMatch(cards[2].frontHtml, /ことばよみ|架空の例文|虚构例句译文|词条释义/);
  assert.match(cards[2].backHtml, /词条释义/);
  assert.match(cards[2].backHtml, /ことばよみ/);
  assert.match(cards[2].backHtml, /架空の例文/);
  assert.match(cards[2].backHtml, /かくうのれいぶん/);
  assert.match(cards[2].backHtml, /虚构例句译文/);
});
