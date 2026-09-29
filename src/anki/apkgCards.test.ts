import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { completeTemplateCards } from './apkgCards.ts';

const require = createRequire(import.meta.url);
const sqlPromise = initSqlJs({ wasmBinary: Uint8Array.from(readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))).buffer });

test('completes three templates as three cards of the SAME note without duplicating notes', async () => {
  const SQL = await sqlPromise;
  const db = new SQL.Database();
  db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, flds TEXT); CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER, due INTEGER, data TEXT)');
  db.run('INSERT INTO notes VALUES (101, ?)', ['synthetic-field']);
  db.run('INSERT INTO cards VALUES (102, 101, 7, 0, 1, ?)', ['{}']);
  const zip = new JSZip();
  zip.file('collection.anki2', db.export());
  zip.file('media', '{}');
  db.close();
  const archive = await completeTemplateCards(await zip.generateAsync({ type: 'blob' }), SQL);
  const result = await JSZip.loadAsync(await archive.arrayBuffer());
  assert.deepEqual(Object.keys(result.files).sort(), ['collection.anki2', 'media']);
  const output = new SQL.Database(await result.file('collection.anki2')!.async('uint8array'));
  try {
    assert.deepEqual(output.exec('select count(*) from notes')[0].values, [[1]]);
    assert.deepEqual(output.exec('select nid,ord from cards order by ord')[0].values, [[101, 0], [101, 1], [101, 2]]);
    assert.deepEqual(output.exec('select count(distinct id) from cards')[0].values, [[3]]);
    assert.deepEqual(output.exec('select distinct did,data from cards')[0].values, [[7, '{}']]);
  } finally { output.close(); }
});

test('writes per-guid modification times into APKG notes', async () => {
  const SQL = await sqlPromise;
  const db = new SQL.Database();
  db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT, mod INTEGER, flds TEXT); CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, ord INTEGER)');
  db.run("INSERT INTO notes VALUES (101, 'guid-a', 100, 'synthetic'); INSERT INTO cards VALUES (102, 101, 0)");
  const zip = new JSZip();
  zip.file('collection.anki2', db.export());
  db.close();
  const blob = await completeTemplateCards(await zip.generateAsync({ type: 'blob' }), SQL, new Map([['guid-a', 101]]));
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  const output = new SQL.Database(await archive.file('collection.anki2')!.async('uint8array'));
  try {
    assert.deepEqual(output.exec('select guid,mod from notes')[0].values, [['guid-a', 101]]);
  } finally { output.close(); }
});
