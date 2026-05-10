# Project Preview

Lightweight local project file preview server for the Codex in-app browser.

## Scope

Project Preview opens a local web UI for browsing one configured root directory.
It is primarily a preview tool, with a guarded write mode for basic file edits.

It does not execute shell commands, upload files, expose a public server, or manage
files outside the configured root.

## Quick Start

```bash
npm install
npm run build
npm start -- url --root "$PWD"
```

Common commands:

```bash
project-preview start --root /path/to/project --port 8098
project-preview url --root /path/to/project
project-preview stop --root /path/to/project
project-preview list
```

## API

Read APIs:

- `GET /api/health`
- `GET /api/meta`
- `GET /api/tree?path=...`
- `GET /api/file?path=...`
- `GET /api/raw?path=...`

Write APIs:

- `POST /api/file/save`
- `POST /api/fs/rename`
- `POST /api/fs/trash`

Write APIs require the per-process `x-project-preview-write-token` returned by
`GET /api/meta`. The browser UI sends this token automatically when Write mode is
enabled.

## Safety Boundaries

- The server binds to `127.0.0.1` only.
- CORS is not enabled; the UI is expected to call APIs from the same origin.
- Every mutating request requires the per-process write token.
- Paths are checked lexically and with `realpath` before file access.
- Symlinks that resolve outside the configured root are blocked, including when a
  parent directory is the symlink.
- Write APIs reject ignored/protected path segments such as `.git`,
  `node_modules`, `dist`, and `build`.
- Save only writes existing text files under the 5 MB limit.
- Rename and Trash are limited to files and directories.
- Trash moves files to the platform trash location. Tests can override this with
  `PROJECT_PREVIEW_TRASH_DIR`.

## Preview Support

- Text and code: CodeMirror
- Markdown: rendered preview and source view
- JSON: formatted source view
- CSV: table preview
- Images, PDF, audio, video: browser-native preview
- Unsupported binary files: metadata view

## Development

```bash
npm run lint
npm run test
npm run build
```

The server code lives in `src/server/`, the React client lives in `src/client/`,
and server API coverage lives in `tests/server.test.ts`.
