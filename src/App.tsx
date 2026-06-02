import { useState, useRef, useCallback, type DragEvent } from 'react';
import { pdfToImages } from './services/pdfService';
import { extractWords, type WordPair } from './services/geminiService';
import { generateHtml } from './utils/htmlGenerator';
import { segmentFurigana } from './utils/furigana';

type Step = 'input' | 'processing' | 'result';

export default function App() {
  const [step, setStep] = useState<Step>('input');
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [wordPairs, setWordPairs] = useState<WordPair[]>([]);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ──
  const handleFile = useCallback((f: File | null) => {
    if (f && f.type === 'application/pdf') {
      setFile(f);
      setError('');
    } else if (f) {
      setError('请选择 PDF 文件 (Please select a PDF file)');
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files[0] ?? null);
    },
    [handleFile]
  );

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);

  // ── Conversion ──
  const startConversion = async () => {
    if (!apiKey.trim()) {
      setError('请填写 Gemini API Key');
      return;
    }
    if (!file) {
      setError('请选择 PDF 文件');
      return;
    }

    setError('');
    setStep('processing');
    setStatus('正在处理中，请稍候... (Processing, please wait...)');

    try {
      // Step 1: PDF → images (in browser)
      setStatus('正在渲染 PDF 页面... (Rendering PDF pages...)');
      const images = await pdfToImages(file);

      // Step 2: Gemini extraction
      const pairs = await extractWords(apiKey, images, (current, total) => {
        setProgress({ current, total });
        setStatus(`正在使用 Gemini 处理第 ${current}/${total} 页...`);
      });

      setWordPairs(pairs);
      setStatus('处理完成！(Done!)');
      setStep('result');
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setStatus('发生错误 (Error occurred)');
      setStep('input');
    }
  };

  // ── Download ──
  const downloadHtml = () => {
    const html = generateHtml(wordPairs);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const baseName = file?.name.replace(/\.pdf$/i, '') ?? '单词表';
    a.href = url;
    a.download = `${baseName}_转换结果.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Reset ──
  const reset = () => {
    setStep('input');
    setFile(null);
    setStatus('');
    setProgress({ current: 0, total: 0 });
    setWordPairs([]);
    setError('');
  };

  // ── INPUT STEP ──
  if (step === 'input') {
    return (
      <div className="max-w-lg mx-auto mt-16 px-4">
        {/* Header */}
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-8">
          PDF 单词表转换工具
        </h1>

        {/* API Key */}
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Gemini API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="输入你的 Gemini API Key..."
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition mb-6"
        />

        {/* File Drop Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${
            dragOver
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-gray-400'
          }`}
        >
          <p className="text-4xl mb-3">📄</p>
          {file ? (
            <p className="text-gray-800 font-medium">{file.name}</p>
          ) : (
            <>
              <p className="text-gray-600 font-medium">
                点击选择或拖拽 PDF 文件到此处
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Click to select or drag & drop a PDF file
              </p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Convert Button */}
        <button
          onClick={startConversion}
          disabled={!apiKey.trim() || !file}
          className={`w-full mt-6 py-3 rounded-lg font-bold text-white text-base transition ${
            apiKey.trim() && file
              ? 'bg-green-600 hover:bg-green-700 active:scale-[0.98] cursor-pointer'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          开始转换 (Start Conversion)
        </button>
      </div>
    );
  }

  // ── PROCESSING STEP ──
  if (step === 'processing') {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
      <div className="max-w-lg mx-auto mt-16 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-8">
          PDF 单词表转换工具
        </h1>

        {/* Spinner */}
        <div className="inline-block w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6" />

        <p className="text-gray-700 font-medium">{status}</p>

        {/* Progress bar */}
        {progress.total > 0 && (
          <div className="mt-6">
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {progress.current} / {progress.total} 页
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── RESULT STEP ──
  return (
    <div className="max-w-5xl mx-auto mt-8 px-4 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          PDF 单词表转换工具
        </h1>
        <div className="flex gap-3">
          <button
            onClick={downloadHtml}
            className="px-5 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 active:scale-[0.98] transition"
          >
            ⬇ 下载 HTML (Download)
          </button>
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition"
          >
            重新转换 (New)
          </button>
        </div>
      </div>

      {/* Status + count */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1 text-sm">
          ✅ {status}
        </span>
        <span className="text-gray-500 text-sm">
          共提取 {wordPairs.length} 个单词对
        </span>
      </div>

      {/* Table preview — EXACT same styles as original */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="result-table">
            <thead>
              <tr>
                <th>外语 (Foreign)</th>
                <th>中文 (Chinese)</th>
                <th>默写/挖空 (Practice)</th>
              </tr>
            </thead>
            <tbody>
              {wordPairs.map(({ ja, cn, reading }, i) => (
                <tr key={i}>
                  <td>
                    {segmentFurigana(ja, reading).map((seg, si) =>
                      seg.reading ? (
                        <ruby key={si}>
                          {seg.text}<rt>{seg.reading}</rt>
                        </ruby>
                      ) : (
                        <span key={si}>{seg.text}</span>
                      )
                    )}
                  </td>
                  <td>{cn}</td>
                  <td className="blank">__________________</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
