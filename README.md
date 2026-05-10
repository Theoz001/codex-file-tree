# Project Preview

轻量级本地项目文件预览器，专为 Codex 的 in-app browser 设计。

## 定位

- **不是 wiki**：不做知识库、双向链接、笔记管理
- **不是 file manager**：不上传、不删除、不重命名、不编辑、不分享
- **不是后台常驻服务**：按需启动，进程可复用，支持 stop/list 管理
- **是只读文件预览器**：在浏览器里浏览当前工作目录的文件结构，查看文件内容

## 快速开始

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 启动预览（默认当前目录，前台运行）
npm start

# 启动/复用预览服务，并只打印 URL
npm start -- url --root "$PWD"

# 或指定目录和端口
npm start -- --root /path/to/project --port 8098

# 开发模式（热重载 server）
npm run dev
```

## CLI 命令

```bash
# 启动预览服务器
project-preview start
project-preview start --root /path/to/project --port 8098

# 启动/复用预览服务，并只打印 URL
project-preview url --root /path/to/project --port 8098

# 停止预览服务器
project-preview stop --root /path/to/project

# 列出所有运行中的实例
project-preview list

# 帮助
project-preview help
```

## 作为 Codex 插件使用

1. 在 Codex 中触发 skill：
   - "打开项目预览"
   - "预览当前项目文件"
   - "打开文件树"
   - "project preview"

2. Skill 会自动：
   - 获取当前工作目录
   - 调用 `project_preview_open`
   - 启动/复用 preview server
   - 返回并打开本地 URL，例如 `http://127.0.0.1:8098`

插件暴露的 MCP tools：

- `project_preview_open`：启动或复用当前工作目录的预览服务，并返回 URL
- `project_preview_list`：列出已有预览实例
- `project_preview_stop`：停止指定工作目录的预览服务

## 安全边界

### 只读原则
- 所有 API 均为只读操作
- 不提供写入、删除、修改文件的接口
- 不提供执行系统命令的能力

### 路径限制
- 只能访问指定的 root 目录内的文件
- `../` 路径穿越会被阻止
- Symlink 如果指向 root 外部，默认不允许访问

### 忽略目录
默认忽略：`.git`, `node_modules`, `dist`, `build`, `.next`, `coverage`, `.DS_Store`, `.npm`, `.yarn`, `.pnpm-store`, `.turbo`, `.cache`, `.parcel-cache`, `.eslintcache`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `target`, `Cargo.lock`, `*.log`, `*.tmp`, `*.temp`, `.idea`, `.vscode`

### 大文件保护
- 超过 5MB 的文本文件不会自动加载内容
- 图片、PDF、音视频由浏览器原生处理

### 网络绑定
- 只绑定 `127.0.0.1`，不暴露到公网
- 不做 launchd/systemd 后台常驻

## 文件预览能力

| 文件类型 | 预览方式 |
|---------|---------|
| 文本/代码 | CodeMirror 只读高亮 |
| Markdown | 渲染预览 + 源码切换 |
| JSON | 格式化显示 |
| CSV | 表格预览（限制行数） |
| 图片 | 直接显示 |
| PDF | 浏览器原生 iframe |
| 音频/视频 | 浏览器原生 player |
| Office | 显示文件信息 |
| 其他二进制 | 显示元信息 |

## 进程管理

- 使用 root path hash 生成唯一实例 ID
- 状态文件保存在 `~/.cache/project-preview/`
- 启动前先 health check，复用已有实例
- 退出时自动清理状态文件

## 技术栈

- **后端**：Node.js + Fastify + TypeScript
- **前端**：React + Vite + TypeScript
- **代码高亮**：CodeMirror 6
- **Markdown 渲染**：react-markdown + remark-gfm

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 运行测试
npm run test

# 代码检查
npm run lint
```

## API

- `GET /api/health` - 健康检查
- `GET /api/tree?path=...` - 目录树
- `GET /api/file?path=...` - 文件信息（含内容）
- `GET /api/raw?path=...` - 原始文件内容

## 目录结构

```
.
├── .codex-plugin/
│   └── plugin.json          # Codex 插件配置
├── skills/
│   └── project-preview/
│       └── SKILL.md         # Skill 定义
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

## License

MIT
