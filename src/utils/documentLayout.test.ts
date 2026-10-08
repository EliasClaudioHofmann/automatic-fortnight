import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { generateHtml } from './htmlGenerator.ts';
import { generateDocx } from './docxGenerator.ts';
import { parseDocxTableRows } from '../anki/candidate.ts';
import type { WordPairDocument } from '../services/geminiService.ts';

const item: WordPairDocument = {
  type: 'document', kana: 'たべる', kanji: '食べる', en: 'to eat', cn: '吃',
  example: 'ご飯を食べる（ごはんをたべる）（吃饭）',
};

const headers = ['日文假名', '日文默写', '日汉字', '默写', '英文翻译', '例句', '中文意思'];

function assertOrdered(text: string, values: string[]) {
  let previous = -1;
  for (const value of values) {
    const index = text.indexOf(value, previous + 1);
    assert.ok(index > previous, `missing or out of order: ${value}`);
    previous = index;
  }
}

test('document HTML exports two blank practice cells and seven ordered columns without rewriting the example', () => {
  const html = generateHtml([item]);
  const header = html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? '';
  const row = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
  assert.equal((header.match(/<th>/g) ?? []).length, 7);
  assertOrdered(header, headers);
  assert.equal((row.match(/<td\b/g) ?? []).length, 7);
  assert.equal((row.match(/class="blank"/g) ?? []).length, 2);
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
  assert.deepEqual(cells.map((cell, index) => cell[0].includes('class="blank"') ? index : -1).filter(index => index >= 0), [1, 3]);
  assert.match(cells[2][1], /食べる/);
  assert.match(cells[4][1], /to eat/);
  assertOrdered(row, ['たべる', '食べる', 'to eat', item.example, '吃']);
});

test('document HTML escapes untrusted kanji and English and keeps missing English blank', () => {
  const html = generateHtml([{ ...item, kanji: '<script>alert(1)</script>', en: '<b>&' }]);
  assert.doesNotMatch(html, /<script>|<b>&/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;&amp;/);
  const legacy = generateHtml([{ ...item, en: undefined }]);
  assert.equal((legacy.match(/<td\b/g) ?? []).length, 7);
  assert.doesNotMatch(legacy, /undefined/);
});

test('document Word exports seven ordered columns and preserves the original example', async () => {
  const blob = await generateDocx([item], 'document');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const rows = [...xml.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(match => match[0]);
  assert.equal(rows.length, 2);
  assert.equal((rows[0].match(/<w:tc[ >]/g) ?? []).length, 7);
  assertOrdered(rows[0], headers);
  assert.equal((rows[1].match(/<w:tc[ >]/g) ?? []).length, 7);
  assertOrdered(rows[1], ['たべる', '食べる', 'to eat', item.example, '吃']);
  const readCells = (row: string) => [...row.matchAll(/<w:tc[ >]([\s\S]*?)<\/w:tc>/g)]
    .map(match => [...match[1].matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map(text => text[1]).join(''));
  const dataCells = readCells(rows[1]);
  assert.equal(dataCells[1], '');
  assert.equal(dataCells[2], '食べる');
  assert.equal(dataCells[3], '');
  assert.equal(dataCells[4], 'to eat');
  const [candidate] = parseDocxTableRows(rows.map(readCells));
  assert.equal(candidate.expression, '食べる');
  assert.equal(candidate.meaning, '吃');
  assert.equal(candidate.example, 'ご飯を食べる');
  assert.equal(candidate.exampleReading, 'ごはんをたべる');
  assert.equal(candidate.exampleMeaning, '吃饭');
});
