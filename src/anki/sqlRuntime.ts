import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export async function initializeSql() {
  const response = await fetch(sqlWasmUrl);
  if (!response.ok) throw new Error('APKG SQLite WASM 加载失败');
  return initSqlJs({ wasmBinary: await response.arrayBuffer() });
}
