import test from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './source.ts';
import { Document, Packer, Paragraph, Table, TableCell, TableRow } from 'docx';

test('reads UTF-8 TXT locally and rejects other formats', async () => {
  const file = new File(['読む：阅读\n'], 'vocab.txt', { type: 'text/plain' });
  assert.deepEqual(await readSource(file), { kind: 'txt', text: '読む：阅读\n' });
  await assert.rejects(readSource(new File(['x'], 'vocab.pdf')), /DOCX|TXT/);
});

test('extracts DOCX paragraphs without a network request', async () => {
  const document = new Document({ sections: [{ children: [new Paragraph('読む：阅读'), new Paragraph('書く：写')] }] });
  const bytes = await Packer.toBuffer(document);
  const file = new File([Uint8Array.from(bytes)], 'vocab.docx');
  const source = await readSource(file);
  assert.equal(source.kind, 'docx');
  if (source.kind !== 'docx') throw new Error('Expected DOCX source');
  assert.match(source.html, /読む：阅读/);
  assert.match(source.html, /書く：写/);
});

test('preserves DOCX table cells and rows as HTML locally', async () => {
  const cell = (text: string) => new TableCell({ children: [new Paragraph(text)] });
  const table = new Table({ rows: [
    new TableRow({ children: [cell('日文假名 (Kana)'), cell('日汉字 (Kanji)'), cell('中文意思'), cell('例句 (Example)')] }),
    new TableRow({ children: [cell('まく'), cell('撒く'), cell('撒'), cell('種をまく（たねをまく）（撒种子）')] }),
  ] });
  const document = new Document({ sections: [{ children: [table] }] });
  const bytes = await Packer.toBuffer(document);
  const file = new File([Uint8Array.from(bytes)], 'vocab-table.docx');
  const source = await readSource(file);
  assert.equal(source.kind, 'docx');
  if (source.kind !== 'docx') throw new Error('Expected DOCX source');
  assert.match(source.html, /<table/i);
  assert.match(source.html, /日文假名 \(Kana\)/);
  assert.match(source.html, /種をまく（たねをまく）（撒种子）/);
});
