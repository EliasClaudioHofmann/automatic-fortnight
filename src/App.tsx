import { useState, useRef, useCallback, type DragEvent } from 'react';
import { pdfToImages } from './services/pdfService';
import { extractWords, type WordPair } from './services/geminiService';
import { generateHtml } from './utils/htmlGenerator';
import { segmentFurigana } from './utils/furigana';
import pkg from '../package.json';

const VERSION = pkg.version;
type Step = 'input' | 'processing' | 'result';
type Language = 'japanese' | 'english';

export default function App() {
  const [step, setStep] = useState<Step>('input');
  const [apiKey, setApiKey] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<Language>('japanese');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [wordPairs, setWordPairs] = useState<WordPair[]>([]);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ──
  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const pdfFiles = Array.from(newFiles).filter((f) => f.type === 'application/pdf');
    
    if (pdfFiles.length === 0 && newFiles.length > 0) {
      setError('请只选择 PDF 文件 (Please select only PDF files)');
      return;
    }
    
    setFiles((prev) => [...prev, ...pdfFiles]);
    setError('');
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
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
    if (files.length === 0) {
      setError('请选择至少一个 PDF 文件');
      return;
    }

    setError('');
    setStep('processing');
    setStatus('正在处理中，请稍候... (Processing, please wait...)');

    try {
      const allPairs: WordPair[] = [];
      let totalPages = 0;

      // Calculate total pages first
      setStatus('正在计算 PDF 总页数... (Calculating total pages...)');
      const allImages: string[] = [];
      const filePages: number[] = [];

      for (const file of files) {
        const images = await pdfToImages(file);
        allImages.push(...images);
        filePages.push(images.length);
        totalPages += images.length;
      }

      // Step 2: Gemini extraction
      setProgress({ current: 0, total: totalPages });
      let processedPages = 0;

      const pairs = await extractWords(apiKey, allImages, language, (current, total) => {
        processedPages = current;
        setProgress({ current, total });
        setStatus(`正在使用 Gemini 处理第 ${current}/${total} 页... (Processing page ${current}/${total}...)`);
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
    const fileNameBase = files.length === 1 
      ? files[0].name.replace(/\.pdf$/i, '') 
      : `${language === 'japanese' ? '日语' : '英语'}_单词表`;
    a.href = url;
    a.download = `${fileNameBase}_转换结果.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Reset ──
  const reset = () => {
    setStep('input');
    setFiles([]);
    setLanguage('japanese');
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
          <span className="text-xs text-gray-400 ml-2 align-top">v{VERSION}</span>
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

        {/* Language Selection */}
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择语言 (Choose Language)
        </label>
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setLanguage('japanese')}
            className={`flex-1 py-2.5 rounded-lg font-semibold transition ${
              language === 'japanese'
                ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            日语 (Japanese)
          </button>
          <button
            onClick={() => setLanguage('english')}
            className={`flex-1 py-2.5 rounded-lg font-semibold transition ${
              language === 'english'
                ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            英语 (English)
          </button>
        </div>

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
          <p className="text-gray-600 font-medium">
            点击选择或拖拽 PDF 文件到此处
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Click to select or drag & drop PDF files (支持多个文件 / Multiple files supported)
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files ?? [])}
        />

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">
              已选择 {files.length} 个文件 ({files.length} file{files.length > 1 ? 's' : ''} selected)
            </p>
            <ul className="space-y-2">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between bg-white p-2 rounded border border-gray-200 text-sm"
                >
                  <span className="text-gray-700 truncate">📄 {f.name}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="ml-2 px-2 py-1 text-red-600 hover:bg-red-50 rounded transition text-xs"
                  >
                    ✕ 删除
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Convert Button */}
        <button
          onClick={startConversion}
          disabled={!apiKey.trim() || files.length === 0}
          className={`w-full mt-6 py-3 rounded-lg font-bold text-white text-base transition ${
            apiKey.trim() && files.length > 0
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
          <span className="text-xs text-gray-400 ml-2 align-top">v{VERSION}</span>
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
          <span className="text-xs text-gray-400 ml-2 align-top">v{VERSION}</span>
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
                <th>{language === 'japanese' ? '日语 (Japanese)' : '英语 (English)'}</th>
                <th>中文 (Chinese)</th>
                <th>默写/挖空 (Practice)</th>
              </tr>
            </thead>
            <tbody>
              {wordPairs.map((item, i) => {
                let foreignContent: React.ReactNode;
                
                if ('ja' in item) {
                  // Japanese with furigana
                  foreignContent = segmentFurigana(item.ja, item.reading).map((seg, si) =>
                    seg.reading ? (
                      <ruby key={si}>
                        {seg.text}<rt>{seg.reading}</rt>
                      </ruby>
                    ) : (
                      <span key={si}>{seg.text}</span>
                    )
                  );
                } else {
                  // English
                  foreignContent = <span>{item.en}</span>;
                }
                
                return (
                  <tr key={i}>
                    <td>{foreignContent}</td>
                    <td>{item.cn}</td>
                    <td className="blank">__________________</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
