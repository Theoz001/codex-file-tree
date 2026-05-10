# Project Preview

Project Preview is a local Codex plugin for browsing and previewing the current
workspace in the Codex in-app browser.

[中文说明](README.zh-CN.md)

## Features

- File tree for the selected workspace root
- Preview for text, code, Markdown, JSON, CSV, images, PDF, audio, and video
- Markdown preview/source switching
- CodeMirror-based source preview for common text formats
- Collapsible sidebar and system light/dark theme support
- Guarded write mode for editing existing text files
- Context-menu file actions for copying paths, renaming, and moving items to trash
- Local-only server bound to `127.0.0.1`

## Install

```bash
npm install
npm run build
```

For Codex plugin use, install or link this repository as a local plugin, then
reload Codex so the `project-preview` plugin is discovered.

## Use

Start or reuse a preview server for the current directory:

```bash
npm start -- url --root "$PWD"
```

Common commands:

```bash
project-preview url --root /path/to/project
project-preview start --root /path/to/project --port 8098
project-preview stop --root /path/to/project
project-preview list
```

The server returns a local URL such as:

```text
http://127.0.0.1:8098/p/my-project/
```

## Safety

- The server only binds to `127.0.0.1`.
- CORS is not enabled.
- All file access is restricted to the configured workspace root.
- Path traversal and symlinks that resolve outside the root are blocked.
- Write mode must be enabled in the UI before mutating actions are available.
- Mutating APIs require a per-process write token.
- Save only writes existing text files under the preview size limit.
- Rename and trash actions are limited to files and directories inside the root.
- Protected paths such as `.git`, `node_modules`, `dist`, and `build` cannot be
  modified through write APIs.
- Trash moves files to the platform trash location. Tests can override this with
  `PROJECT_PREVIEW_TRASH_DIR`.

## Privacy

- Project Preview does not upload files.
- Project Preview does not send telemetry.
- File contents are served only by the local `127.0.0.1` preview server for the
  configured workspace root.

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

Write APIs require the `x-project-preview-write-token` returned by
`GET /api/meta`.

## Verify

```bash
npm run lint
npm run test
npm run build
npm audit
```
