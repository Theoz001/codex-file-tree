import React, { useState, useEffect, useCallback, useRef } from 'react';
import FileTree from './components/FileTree';
import FilePreview from './components/FilePreview';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mtime?: string;
  mimeType?: string;
}

export interface FileInfo {
  name: string;
  path: string;
  absolutePath: string;
  size: number;
  mtime: string;
  mimeType: string;
  isText: boolean;
  content?: string;
  isLarge?: boolean;
}

interface ProjectMeta {
  name: string;
  root: string;
  port: number;
  writeToken: string;
}

interface RenameTarget {
  path: string;
  name: string;
}

const MIN_SIDEBAR_WIDTH = 220;
const MIN_PREVIEW_WIDTH = 240;
const MAX_SIDEBAR_RATIO = 0.65;
const DEFAULT_SIDEBAR_WIDTH = 280;
const SIDEBAR_STORAGE_KEY = 'project-preview-sidebar-width';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'project-preview-sidebar-collapsed';

function joinProjectPath(root: string, relativePath: string): string {
  if (!root) return relativePath;
  if (!relativePath) return root;
  return `${root.replace(/\/+$/, '')}/${relativePath}`;
}

function getSidebarBounds() {
  const viewportWidth = window.innerWidth || 1024;
  const maxByRatio = Math.floor(viewportWidth * MAX_SIDEBAR_RATIO);
  const maxByPreview = viewportWidth - MIN_PREVIEW_WIDTH;
  const max = Math.max(160, Math.min(maxByRatio, maxByPreview));
  const min = Math.min(MIN_SIDEBAR_WIDTH, max);
  return { min, max };
}

function clampSidebarWidth(value: number): number {
  const { min, max } = getSidebarBounds();
  if (!Number.isFinite(value)) {
    return Math.min(Math.max(DEFAULT_SIDEBAR_WIDTH, min), max);
  }
  return Math.min(max, Math.max(min, value));
}

const App: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [treeData, setTreeData] = useState<FileNode[]>([]);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writeMode, setWriteMode] = useState(() => {
    return localStorage.getItem('writeMode') === 'true';
  });
  const [treeKey, setTreeKey] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return clampSidebarWidth(saved ? parseInt(saved, 10) : DEFAULT_SIDEBAR_WIDTH);
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  });
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('writeMode', String(writeMode));
  }, [writeMode]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
    if (sidebarCollapsed) {
      setIsDragging(false);
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!renameTarget) return;
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [renameTarget]);

  useEffect(() => {
    const handleResize = () => {
      setSidebarWidth(prev => {
        const clamped = clampSidebarWidth(prev);
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(clamped));
        return clamped;
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const response = await fetch('/api/meta');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json() as ProjectMeta;
      setProjectMeta(data);
      document.title = `${data.name} - Project Preview`;
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchTree = useCallback(async (path: string = '') => {
    try {
      const response = await fetch(`/api/tree?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTreeData(data.nodes);
      setError(null);
    } catch (err) {
      setError('Failed to load directory tree');
      console.error(err);
    }
  }, []);

  const fetchFile = useCallback(async (path: string) => {
    try {
      const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSelectedFile(data);
      setError(null);
    } catch (err) {
      setError('Failed to load file');
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchMeta();
    fetchTree();
  }, [fetchMeta, fetchTree]);

  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, [isDragging]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !mainRef.current) return;
      const { min, max } = getSidebarBounds();
      const newWidth = Math.max(min, Math.min(max, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, sidebarWidth]);

  const handleSelectFile = useCallback((node: FileNode) => {
    if (node.type === 'file') {
      fetchFile(node.path);
    }
  }, [fetchFile]);

  const handleRefresh = useCallback(() => {
    fetchTree('');
    if (selectedFile) {
      fetchFile(selectedFile.path);
    }
  }, [fetchTree, fetchFile, selectedFile]);

  const handleFileSaved = useCallback(() => {
    if (selectedFile) {
      fetchFile(selectedFile.path);
    }
  }, [fetchFile, selectedFile]);

  const handleFileRenamed = useCallback((oldPath: string, newPath: string) => {
    setTreeKey(prev => prev + 1);
    fetchTree('');
    if (selectedFile?.path === oldPath) {
      fetchFile(newPath);
    } else if (selectedFile?.path.startsWith(`${oldPath}/`)) {
      fetchFile(`${newPath}${selectedFile.path.slice(oldPath.length)}`);
    }
  }, [fetchTree, fetchFile, selectedFile]);

  const handleFileTrashed = useCallback((trashedPath: string) => {
    setTreeKey(prev => prev + 1);
    fetchTree('');
    if (selectedFile?.path === trashedPath || selectedFile?.path.startsWith(`${trashedPath}/`)) {
      setSelectedFile(null);
    }
  }, [fetchTree, selectedFile]);

  const writeHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'X-Project-Preview-Write-Token': projectMeta?.writeToken || '',
  }), [projectMeta?.writeToken]);

  const handleCopyPath = useCallback(async (node: Pick<FileNode, 'path'> & { absolutePath?: string }) => {
    const absolutePath = node.absolutePath || joinProjectPath(projectMeta?.root || '', node.path);
    try {
      await navigator.clipboard.writeText(absolutePath);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = absolutePath;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }, [projectMeta?.root]);

  const handleRenamePath = useCallback((path: string, name: string) => {
    if (!projectMeta?.writeToken) return;
    setRenameTarget({ path, name });
    setRenameValue(name);
    setRenameError(null);
  }, [projectMeta?.writeToken]);

  const handleCancelRename = useCallback(() => {
    if (isRenaming) return;
    setRenameTarget(null);
    setRenameValue('');
    setRenameError(null);
  }, [isRenaming]);

  const handleSubmitRename = useCallback(async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!renameTarget || !projectMeta?.writeToken || isRenaming) return;

    const newName = renameValue;
    if (!newName.trim()) {
      setRenameError('Name cannot be empty.');
      return;
    }
    if (newName === renameTarget.name) {
      handleCancelRename();
      return;
    }

    setIsRenaming(true);
    setRenameError(null);
    try {
      const response = await fetch('/api/fs/rename', {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({ path: renameTarget.path, newName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Rename failed' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      handleFileRenamed(renameTarget.path, result.newPath);
      setRenameTarget(null);
      setRenameValue('');
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setIsRenaming(false);
    }
  }, [
    handleCancelRename,
    handleFileRenamed,
    isRenaming,
    projectMeta?.writeToken,
    renameTarget,
    renameValue,
    writeHeaders,
  ]);

  const handleTrashPath = useCallback(async (path: string, name: string) => {
    if (!projectMeta?.writeToken) return;
    const confirmed = window.confirm(`Move "${path || name}" to Trash?`);
    if (!confirmed) return;
    try {
      const response = await fetch('/api/fs/trash', {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({ path }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Trash failed' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      handleFileTrashed(path);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Trash failed');
    }
  }, [handleFileTrashed, projectMeta?.writeToken, writeHeaders]);

  const handleRenameNode = useCallback((node: FileNode) => {
    void handleRenamePath(node.path, node.name);
  }, [handleRenamePath]);

  const handleTrashNode = useCallback((node: FileNode) => {
    void handleTrashPath(node.path, node.name);
  }, [handleTrashPath]);

  const filteredTree = searchQuery
    ? treeData.filter(node =>
        node.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : treeData;
  const showSearch = searchOpen || searchQuery.length > 0;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-project">
            <span className="header-title">{projectMeta?.name || 'Project Preview'}</span>
            <span className="header-path" title={projectMeta?.root || ''}>
              {projectMeta?.root || 'Loading project...'}
            </span>
          </div>
        </div>
        <div className="header-right">
          <button
            className={`mode-toggle ${writeMode ? 'active' : ''}`}
            type="button"
            aria-pressed={writeMode}
            title={writeMode ? 'Disable write operations' : 'Enable write operations'}
            onClick={() => setWriteMode(enabled => !enabled)}
          >
            <span className="mode-dot" aria-hidden="true" />
            <span>{writeMode ? 'Write enabled' : 'Read only'}</span>
          </button>
          <button
            className={`icon-btn ${showSearch ? 'active' : ''}`}
            title="Search files"
            aria-label="Search files"
            onClick={() => setSearchOpen(open => !open)}
          >
            🔍
          </button>
          {showSearch && (
            <div className="search-box">
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                autoFocus
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}
          <button className="icon-btn" title="Refresh files" aria-label="Refresh files" onClick={handleRefresh}>
            ↻
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">{error}</div>
      )}

      <div className="main" ref={mainRef}>
        {sidebarCollapsed ? (
          <button
            className="sidebar-rail"
            type="button"
            title="Show file tree"
            aria-label="Show file tree"
            onClick={() => setSidebarCollapsed(false)}
          >
            ›
          </button>
        ) : (
          <>
            <aside className="sidebar" style={{ width: sidebarWidth }}>
              <div className="sidebar-header">
                <span className="sidebar-heading">Files</span>
                <button
                  className="sidebar-collapse-btn"
                  type="button"
                  title="Hide file tree"
                  aria-label="Hide file tree"
                  onClick={() => setSidebarCollapsed(true)}
                >
                  ‹
                </button>
              </div>
              <div className="tree-scroll">
                <FileTree
                  key={treeKey}
                  nodes={filteredTree}
                  onSelect={handleSelectFile}
                  selectedPath={selectedFile?.path}
                  canWrite={writeMode && !!projectMeta?.writeToken}
                  onCopyPath={handleCopyPath}
                  onRename={handleRenameNode}
                  onTrash={handleTrashNode}
                />
              </div>
            </aside>
            <div
              className={`splitter ${isDragging ? 'dragging' : ''}`}
              onMouseDown={() => setIsDragging(true)}
            />
          </>
        )}
        <main className="preview">
          <FilePreview
            file={selectedFile}
            writeMode={writeMode}
            writeToken={projectMeta?.writeToken || ''}
            onFileSaved={handleFileSaved}
            onCopyPath={handleCopyPath}
            onRename={(file) => void handleRenamePath(file.path, file.name)}
            onTrash={(file) => void handleTrashPath(file.path, file.name)}
          />
        </main>
      </div>
      {renameTarget && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={handleCancelRename}
        >
          <form
            className="rename-dialog"
            onSubmit={handleSubmitRename}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                handleCancelRename();
              }
            }}
          >
            <div className="dialog-title">Rename</div>
            <label className="dialog-field">
              <span className="dialog-label">Name</span>
              <input
                ref={renameInputRef}
                value={renameValue}
                disabled={isRenaming}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </label>
            {renameError && <div className="dialog-error">{renameError}</div>}
            <div className="dialog-actions">
              <button className="btn" type="button" onClick={handleCancelRename} disabled={isRenaming}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={isRenaming}>
                {isRenaming ? 'Renaming...' : 'Rename'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;
