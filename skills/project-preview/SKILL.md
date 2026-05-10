---
name: project-preview
description: "Use when the user asks to open Project Preview, preview the current Codex workspace, browse the current working directory file tree, or view project files in the Codex in-app browser. Prefer the project_preview_open MCP tool. If unavailable, run the plugin CLI url command from this plugin root and return the localhost URL only."
---

# Project Preview

一个轻量级的本地项目文件预览器，专为 Codex 的 in-app browser 设计。它默认用于浏览和预览文件，也提供受保护的 Write mode 做有限文件操作。

## 触发词

- "打开项目预览"
- "预览当前项目文件"
- "打开文件树"
- "project preview"
- "预览文件"

## 功能定位

- **不是 wiki**：不做知识库、不做双向链接、不做笔记管理
- **不是完整 file manager**：不上传、不分享、不跨 root 管理文件
- **不是后台常驻服务**：按需启动，进程可复用，支持 stop/list 管理
- **是项目预览器**：在浏览器里浏览当前工作目录的文件结构，查看文件内容；Write mode 只支持受保护的文本保存、文件重命名和文件移入 Trash

## 工作流

当用户触发时：

不要分析目录、不要列文件、不要解释实现。只启动或复用本地预览服务，然后把 URL 给用户。

1. **获取当前工作目录**（Codex 的 cwd）
2. **优先调用 MCP tool**：`project_preview_open({ root: <cwd> })`
3. **如果 MCP tool 不可用**：从插件根目录运行 `node dist/server/index.js url --root <cwd>`
4. **复用已有实例**：如果该 root 已经有 preview server 在运行，直接返回已有 URL
5. **返回本地 URL**：例如 `http://127.0.0.1:8098`
6. **使用 Codex in-app browser 打开 URL**

> 路径说明：本文件位于 `skills/project-preview/`，插件根目录在 `../..`。fallback 命令应从插件根目录执行。
## CLI 用法

```bash
# 启动或复用，然后只打印 URL
node dist/server/index.js url --root "$PWD"

# 指定目录和端口
node dist/server/index.js url --root /path/to/project --port 8098

# 停止
node dist/server/index.js stop --root /path/to/project

# 列出所有运行中的实例
node dist/server/index.js list
```

## 安全边界

### 写操作边界
- 默认使用浏览和预览；Write mode 由前端显式开启
- 写接口要求 per-process write token
- 保存只允许已有文本文件
- 重命名和 Trash 只允许普通文件
- `.git`, `node_modules`, `dist`, `build` 等 ignored/protected path 不允许被写接口修改
- 不提供执行系统命令的能力

### 路径限制
- 只能访问指定的 root 目录内的文件
- `../` 路径穿越会被阻止
- 绝对路径会被拒绝
- Symlink 如果指向 root 外部，默认不允许访问；父目录 symlink 指向 root 外部也会被阻止

### 忽略目录
默认忽略以下目录（不出现在文件树中）：
- `.git`, `node_modules`, `dist`, `build`, `.next`
- `coverage`, `.DS_Store`, `.npm`, `.yarn`, `.pnpm-store`
- `.turbo`, `.cache`, `.parcel-cache`, `.eslintcache`
- `__pycache__`, `.pytest_cache`, `.mypy_cache`
- `target`, `Cargo.lock`
- 日志文件：`*.log`, `*.tmp`, `*.temp`
- IDE 目录：`.idea`, `.vscode`

### 大文件保护
- 超过 5MB 的文本文件不会自动加载内容
- 会提示用户下载或确认预览
- 图片、PDF、音视频不受此限制（由浏览器原生处理）

### 网络绑定
- 只绑定 `127.0.0.1`，不暴露到公网
- 不支持 `0.0.0.0`
- 不做 launchd/systemd 后台常驻

## 进程管理

- 使用 root path hash 生成唯一实例 ID
- 状态文件保存在 `~/.cache/project-preview/`
- 记录 pid、port、root、startedAt
- 启动前先 health check，复用已有实例
- 退出时自动清理状态文件

## 文件预览能力

| 文件类型 | 预览方式 |
|---------|---------|
| 文本/代码 | CodeMirror 高亮；Write mode 下可编辑文本文件 |
| Markdown | 渲染预览 + 源码切换 |
| JSON | 格式化显示 |
| CSV | 表格预览（限制行数） |
| 图片 | 直接显示 |
| PDF | 浏览器原生 iframe |
| 音频/视频 | 浏览器原生 player |
| Office (docx/xlsx/pptx) | 显示文件信息（暂不支持完整预览） |
| 其他二进制 | 显示元信息，提示暂不支持 |

## 技术栈

- **后端**：Node.js + Fastify + TypeScript
- **前端**：React + Vite + TypeScript
- **代码高亮**：CodeMirror 6
- **Markdown 渲染**：react-markdown + remark-gfm
- **CSV 解析**：PapaParse

## 目录结构

```
.
├── .codex-plugin/
│   └── plugin.json          # Codex 插件配置
├── skills/
│   └── project-preview/
│       └── SKILL.md         # 本文件
├── src/
│   ├── server/              # 后端代码
│   │   ├── index.ts         # CLI 入口
│   │   ├── server.ts        # Fastify server
│   │   ├── routes.ts        # API 路由
│   │   ├── file-utils.ts    # 文件工具
│   │   ├── security.ts      # 安全校验
│   │   └── process-manager.ts # 进程管理
│   └── client/              # 前端代码
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── FileTree.tsx
│       │   └── FilePreview.tsx
│       └── styles.css
├── tests/                   # 测试
├── package.json
├── tsconfig.json
├── tsconfig.server.json
├── vite.config.ts
└── README.md
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式（热重载 server）
npm run dev

# 构建
npm run build

# 运行测试
npm run test

# 代码检查
npm run lint
```

## 注意事项

- 插件职责是启动本地 server + browser 打开 URL
- 如果当前 Codex runtime 支持 sessionStart hook，再考虑自动启动；否则不要强行做
- 前端构建产物在 `dist/client/`，server 构建产物在 `dist/server/`
- 启动前确保已运行 `npm run build`
