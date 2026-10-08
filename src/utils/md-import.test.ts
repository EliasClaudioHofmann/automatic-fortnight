import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedFile, formatDocumentCompletion } from '../services/fileImport.ts';
import { extractTextFromFile } from '../services/documentService.ts';
import { extractWordsFromText } from '../services/geminiService.ts';

const markdown = '# 第1課\n\n- 食べる | 吃\n- 書く | 写\n\n例文：ご飯を食べる\n';

test('all three modes accept Markdown by extension, while retaining their existing formats', () => {
  for (const mode of ['japanese', 'english', 'document'] as const) {
    assert.equal(isSupportedFile(mode, 'notes.MD'), true);
    assert.equal(isSupportedFile(mode, 'notes.pdf'), true);
    assert.equal(isSupportedFile(mode, 'notes.md.exe'), false);
  }
  assert.equal(isSupportedFile('document', 'notes.docx'), true);
  assert.equal(isSupportedFile('japanese', 'notes.docx'), false);
  assert.equal(isSupportedFile('english', 'notes.docx'), false);
});

test('document mode reads Markdown as UTF-8 text without losing structure', async () => {
  const file = new File([markdown], 'notes.md', { type: 'text/markdown' });
  assert.equal(await extractTextFromFile(file), markdown);
  await assert.rejects(extractTextFromFile(new File(['x'], 'notes.md.exe')), /不支持/);
});

test('Japanese Markdown uses the Japanese vocabulary prompt, not the document prompt', async () => {
  const calls: Array<{ text: string; prompt: string }> = [];
  const pairs = await extractWordsFromText('test-key', markdown, 'japanese', async (text, prompt) => {
    calls.push({ text, prompt });
    return '[{"ja":"食べる","reading":"たべる","cn":"吃"}]';
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, markdown);
  assert.match(calls[0].prompt, /"ja"/);
  assert.doesNotMatch(calls[0].prompt, /"example"/);
  assert.deepEqual(pairs.map(item => 'ja' in item ? item.ja : ''), ['食べる']);
});

test('English Markdown uses the English vocabulary prompt and returns English word pairs', async () => {
  const calls: string[] = [];
  const pairs = await extractWordsFromText('test-key', '# Words\n- apple: 苹果', 'english', async (_text, prompt) => {
    calls.push(prompt);
    return '```json\n[{"en":"apple","cn":"苹果"}]\n```';
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /"en"/);
  assert.deepEqual(pairs.map(item => 'en' in item ? item.en : ''), ['apple']);
  await assert.rejects(extractWordsFromText('test-key', '   ', 'english', async () => '[]'), /空|内容/);
});

test('document completion visibly flags fallback output for checking', () => {
  assert.match(formatDocumentCompletion([], true), /备用模型.*核对/);
  assert.match(formatDocumentCompletion(['坏文件.md'], true), /坏文件\.md/);
  assert.equal(formatDocumentCompletion([], false), '处理完成！(Done!)');
});
