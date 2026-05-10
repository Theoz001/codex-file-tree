#!/usr/bin/env python3
"""Minimal MCP server for Project Preview."""

from __future__ import annotations

import hashlib
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
CLI = PLUGIN_ROOT / "dist" / "server" / "index.js"
STATE_DIR = Path.home() / ".cache" / "project-preview"
LOG_FILE = STATE_DIR / "project-preview-mcp.log"


def abs_root(root: str) -> str:
    if not root or not root.strip():
        raise ValueError("root must not be empty")
    resolved = str(Path(root).expanduser().resolve())
    if not Path(resolved).is_dir():
        raise ValueError(f"root is not a directory: {resolved}")
    return resolved


def instance_id(root: str) -> str:
    return hashlib.sha256(root.encode("utf-8")).hexdigest()[:16]


def state_file(root: str) -> Path:
    return STATE_DIR / f"{instance_id(root)}.json"


def read_state(root: str) -> dict[str, Any] | None:
    try:
        return json.loads(state_file(root).read_text(encoding="utf-8"))
    except Exception:
        return None


def health(port: int, root: str | None = None) -> dict[str, Any] | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1.0) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if payload.get("status") != "ok":
            return None
        if root is not None and str(Path(payload.get("root", "")).resolve()) != root:
            return None
        return payload
    except Exception:
        return None


def current_instance(root: str) -> dict[str, Any] | None:
    state = read_state(root)
    if not state:
        return None
    port = int(state.get("port", 0))
    if port and health(port, root):
        return state
    return None


def find_instance_by_scan(root: str, start_port: int = 8098) -> dict[str, Any] | None:
    for port in range(start_port, min(start_port + 200, 65536)):
        if health(port, root):
            return {"root": root, "port": port, "pid": None, "startedAt": None}
    return None


def start_preview(root_arg: str, port: int = 8098) -> dict[str, Any]:
    root = abs_root(root_arg)
    if not CLI.exists():
        raise RuntimeError(f"Project Preview CLI not built: {CLI}")

    result = subprocess.run(
        ["node", str(CLI), "url", "--root", root, "--port", str(port)],
        cwd=str(PLUGIN_ROOT),
        text=True,
        capture_output=True,
        timeout=8,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "project-preview url failed")
    
    url = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ""
    if not url.startswith("http://127.0.0.1:"):
        raise RuntimeError(f"project-preview url returned unexpected output: {result.stdout.strip()}")
    
    actual_port = int(url.rsplit(":", 1)[1])
    state = read_state(root) or {}
    return {"ok": True, "root": root, "url": url, "port": actual_port, "pid": state.get("pid")}


def list_previews() -> dict[str, Any]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    instances: list[dict[str, Any]] = []
    for file in STATE_DIR.glob("*.json"):
        try:
            state = json.loads(file.read_text(encoding="utf-8"))
            port = int(state.get("port", 0))
            alive = bool(port and health(port))
            instances.append({**state, "alive": alive, "url": f"http://127.0.0.1:{port}" if port else None})
        except Exception:
            continue
    return {"ok": True, "instances": instances}


def stop_preview(root_arg: str) -> dict[str, Any]:
    root = abs_root(root_arg)
    state = read_state(root)
    if not state:
        return {"ok": True, "action": "none", "message": "No preview server state found for root.", "root": root}
    pid = int(state.get("pid", 0))
    if pid:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    try:
        state_file(root).unlink()
    except FileNotFoundError:
        pass
    return {"ok": True, "action": "stopped", "root": root, "pid": pid}


TOOLS: dict[str, dict[str, Any]] = {
    "project_preview_open": {
        "description": "Start or reuse the read-only Project Preview web server for a Codex workspace and return its localhost URL. Do not inspect files or summarize the tree; just return/open the URL.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "root": {"type": "string", "description": "Absolute path to the workspace directory to preview."},
                "port": {"type": "integer", "description": "Preferred localhost port. Defaults to 8098.", "default": 8098},
            },
            "required": ["root"],
            "additionalProperties": False,
        },
    },
    "project_preview_list": {
        "description": "List known Project Preview server instances and their localhost URLs.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    "project_preview_stop": {
        "description": "Stop the Project Preview server for a workspace root.",
        "inputSchema": {
            "type": "object",
            "properties": {"root": {"type": "string", "description": "Absolute path to the workspace directory."}},
            "required": ["root"],
            "additionalProperties": False,
        },
    },
}


def tool_result(payload: Any) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, indent=2)}]}


def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if name == "project_preview_open":
        return tool_result(start_preview(arguments["root"], int(arguments.get("port", 8098))))
    if name == "project_preview_list":
        return tool_result(list_previews())
    if name == "project_preview_stop":
        return tool_result(stop_preview(arguments["root"]))
    raise ValueError(f"Unknown tool: {name}")


def handle_request(request: dict[str, Any]) -> dict[str, Any] | None:
    method = request.get("method")
    request_id = request.get("id")

    if method == "initialize":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "project-preview", "version": "1.0.0"}}}
    if method == "notifications/initialized":
        return None
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": [{"name": name, **definition} for name, definition in TOOLS.items()]}}
    if method == "tools/call":
        params = request.get("params", {})
        try:
            result = call_tool(params["name"], params.get("arguments", {}))
            return {"jsonrpc": "2.0", "id": request_id, "result": result}
        except Exception as exc:
            return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32000, "message": str(exc)}}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}
    if request_id is None:
        return None
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            response = handle_request(request)
        except Exception as exc:
            response = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}}
        if response is not None:
            print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
