# PDF 单词表转换工具 (Web版)

基于原 [PdfToWordList.py](../PdfToWordList.py) 的纯前端 Web 版。上传 PDF 单词表，通过 Gemini API 提取日-中或英-中单词对，生成可下载的 HTML 默写表。

## 新增功能 (v1.2.0)

- ✅ **多语言支持**：现已支持日语和英语两种语言的单词表提取
- ✅ **多文件上传**：支持同时上传多个 PDF 文件，一次性处理所有文件
- ✅ **语言切换按钮**：UI 中添加了直观的语言选择界面
- ✅ **文件列表管理**：选择多个文件后显示文件列表，支持删除单个文件

## 与原版的对应关系

| 原版 (tkinter) | Web 版 |
|---|---|
| `tkinter.Entry` API Key 输入 | `<input type="password">` |
| `filedialog.askopenfilename` | 拖拽 / 点击上传（支持多文件） |
| `fitz.open` PDF 渲染 | `pdfjs-dist` 浏览器渲染 |
| `genai.upload_file` + `generate_content` | `@google/generative-ai` inline base64 |
| `generate_html()` 输出 HTML 文件 | 页面预览 + 下载按钮 |
| 表格样式 (lines 107-145) | **完全一致**，一字未改 |
| 日语专用 | 日语 + 英语双语支持 |
| 单文件处理 | 支持多文件批量处理 |

## 本地运行

```bash
cd web-app
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`。

## 部署

### Vercel（推荐）

1. 将项目推送到 GitHub / GitLab 仓库
2. 打开 [vercel.com](https://vercel.com)，Import Git Repository
3. 配置如下：

| 设置 | 值 |
|---|---|
| **Framework** | Vite |
| **Root Directory** | `默写表生成/web-app` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

4. 点击 Deploy — 完成！

> Vercel 自动检测 Vite 项目，通常无需手动配置。`npm run build` 输出到 `dist/`，Vercel 自动识别为静态站点。

### Cloudflare Pages

1. 将项目推送到 GitHub / GitLab 仓库
2. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → Create → Pages
3. 连接仓库，配置：

| 设置 | 值 |
|---|---|
| **Framework preset** | Vite |
| **Root Directory** | `默写表生成/web-app` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

4. Save and Deploy

### 手动部署（任意静态托管）

```bash
cd web-app
npm run build
```

将 `dist/` 目录上传到任意静态托管服务（GitHub Pages、Netlify、Nginx 等）。

## 技术栈

- **React 18** + **TypeScript**
- **Vite 6** (构建工具)
- **Tailwind CSS 3** (UI 样式)
- **pdfjs-dist 4.0** (浏览器端 PDF 渲染)
- **@google/generative-ai** (Gemini API 调用)
- **gemini-flash-lite-latest** (与原版一致的模型)

## 注意事项

- API Key 仅在用户浏览器中使用，不会上传到任何第三方服务器
- PDF 页面以 JPEG (80% quality, 150 DPI) 格式发送到 Gemini API
- 处理速度取决于 PDF 页数和 Gemini API 响应速度
