import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

interface PreviewInstance {
  name: string;
  root: string;
  port: number;
  url: string;
  current: boolean;
  startedAt: string | null;
}

interface RenameTarget {
  path: string;
  name: string;
}

interface MoveTarget {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

interface FolderInfo {
  name: string;
  path: string;
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

function getParentPath(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index === -1 ? '' : filePath.slice(0, index);
}

function isSameOrChildPath(candidatePath: string, parentPath: string): boolean {
  return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}/`);
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
  const [previews, setPreviews] = useState<PreviewInstance[]>([]);
  const [previewsOpen, setPreviewsOpen] = useState(false);
  const [previewsLoading, setPreviewsLoading] = useState(false);
  const [previewsError, setPreviewsError] = useState<string | null>(null);
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
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [folderQuery, setFolderQuery] = useState('');
  const [selectedMoveDir, setSelectedMoveDir] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const previewsMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const moveSearchRef = useRef<HTMLInputElement>(null);

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
    if (!moveTarget) return;
    requestAnimationFrame(() => {
      moveSearchRef.current?.focus();
    });
  }, [moveTarget]);

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

  const fetchPreviews = useCallback(async () => {
    setPreviewsLoading(true);
    setPreviewsError(null);
    try {
      const response = await fetch('/api/previews');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json() as { previews: PreviewInstance[] };
      setPreviews(data.previews || []);
    } catch (err) {
      setPreviewsError('Failed to load running previews');
      console.error(err);
    } finally {
      setPreviewsLoading(false);
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
    if (!previewsOpen) return;
    void fetchPreviews();
  }, [fetchPreviews, previewsOpen]);

  useEffect(() => {
    if (!previewsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!previewsMenuRef.current?.contains(event.target as Node)) {
        setPreviewsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewsOpen]);

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

  const handleFileMoved = useCallback((oldPath: string, newPath: string) => {
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

  const fetchFolders = useCallback(async () => {
    setFoldersLoading(true);
    setMoveError(null);
    try {
      const response = await fetch('/api/folders');
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to load folders' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setFolders(data.folders || []);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Failed to load folders');
      setFolders([]);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  const handleMovePath = useCallback((node: MoveTarget) => {
    if (!projectMeta?.writeToken) return;
    setMoveTarget(node);
    setFolderQuery('');
    setSelectedMoveDir(null);
    setMoveError(null);
    void fetchFolders();
  }, [fetchFolders, projectMeta?.writeToken]);

  const handleCancelMove = useCallback(() => {
    if (isMoving) return;
    setMoveTarget(null);
    setFolderQuery('');
    setSelectedMoveDir(null);
    setMoveError(null);
  }, [isMoving]);

  const availableMoveFolders = useMemo(() => {
    if (!moveTarget) return [];
    const parentPath = getParentPath(moveTarget.path);
    const query = folderQuery.trim().toLowerCase();

    return folders.filter(folder => {
      if (folder.path === parentPath) return false;
      if (moveTarget.type === 'directory' && isSameOrChildPath(folder.path, moveTarget.path)) return false;
      if (!query) return true;
      const label = folder.path || '/';
      return label.toLowerCase().includes(query);
    });
  }, [folderQuery, folders, moveTarget]);

  useEffect(() => {
    if (!moveTarget) return;
    if (availableMoveFolders.length === 0) {
      setSelectedMoveDir(null);
      return;
    }
    if (!availableMoveFolders.some(folder => folder.path === selectedMoveDir)) {
      setSelectedMoveDir(availableMoveFolders[0].path);
    }
  }, [availableMoveFolders, moveTarget, selectedMoveDir]);

  const handleSubmitMove = useCallback(async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!moveTarget || !projectMeta?.writeToken || isMoving || selectedMoveDir === null) return;

    setIsMoving(true);
    setMoveError(null);
    try {
      const response = await fetch('/api/fs/move', {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({ path: moveTarget.path, targetDir: selectedMoveDir }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Move failed' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      handleFileMoved(moveTarget.path, result.newPath);
      setMoveTarget(null);
      setFolderQuery('');
      setSelectedMoveDir(null);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setIsMoving(false);
    }
  }, [
    handleFileMoved,
    isMoving,
    moveTarget,
    projectMeta?.writeToken,
    selectedMoveDir,
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

  const handleMoveNode = useCallback((node: FileNode) => {
    handleMovePath(node);
  }, [handleMovePath]);

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
          <div className="previews-menu" ref={previewsMenuRef}>
            <button
              className={`icon-btn ${previewsOpen ? 'active' : ''}`}
              type="button"
              title="Running previews"
              aria-label="Running previews"
              aria-expanded={previewsOpen}
              onClick={() => setPreviewsOpen(open => !open)}
            >
              ▦
            </button>
            {previewsOpen && (
              <div className="previews-popover" role="menu" aria-label="Running previews">
                <div className="previews-popover-header">
                  <span>Running previews</span>
                  <button
                    className="previews-refresh"
                    type="button"
                    aria-label="Refresh running previews"
                    title="Refresh"
                    disabled={previewsLoading}
                    onClick={() => void fetchPreviews()}
                  >
                    ↻
                  </button>
                </div>
                <div className="previews-list">
                  {previewsLoading && <div className="previews-status">Loading...</div>}
                  {!previewsLoading && previewsError && (
                    <div className="previews-status previews-error">{previewsError}</div>
                  )}
                  {!previewsLoading && !previewsError && previews.length === 0 && (
                    <div className="previews-status">No running previews</div>
                  )}
                  {!previewsLoading && !previewsError && previews.map(preview => (
                    <a
                      key={`${preview.port}:${preview.root}`}
                      className={`preview-link ${preview.current ? 'current' : ''}`}
                      href={preview.url}
                      role="menuitem"
                      title={preview.root}
                    >
                      <span className="preview-link-main">
                        <span className="preview-link-name">{preview.name}</span>
                        {preview.current && <span className="preview-badge">Current</span>}
                      </span>
                      <span className="preview-link-meta">
                        localhost:{preview.port} · {preview.root}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
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
                  onMove={handleMoveNode}
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
            onMove={(file) => void handleMovePath({ path: file.path, name: file.name, type: 'file' })}
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
      {moveTarget && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={handleCancelMove}
        >
          <form
            className="move-dialog"
            onSubmit={handleSubmitMove}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                handleCancelMove();
              }
            }}
          >
            <div className="dialog-title">Move "{moveTarget.name}" to folder</div>
            <label className="dialog-field">
              <span className="dialog-label">Search folders</span>
              <input
                ref={moveSearchRef}
                value={folderQuery}
                disabled={isMoving}
                placeholder="Type to filter folders"
                onChange={(event) => setFolderQuery(event.target.value)}
              />
            </label>
            <div className="folder-list" role="listbox" aria-label="Destination folder">
              {foldersLoading && <div className="folder-list-status">Loading folders...</div>}
              {!foldersLoading && availableMoveFolders.length === 0 && (
                <div className="folder-list-status">No available target folders</div>
              )}
              {!foldersLoading && availableMoveFolders.map(folder => (
                <button
                  key={folder.path || '__root__'}
                  className={`folder-option ${selectedMoveDir === folder.path ? 'selected' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={selectedMoveDir === folder.path}
                  disabled={isMoving}
                  onClick={() => setSelectedMoveDir(folder.path)}
                >
                  <span className="folder-option-icon">📁</span>
                  <span className="folder-option-path">{folder.path || '/'}</span>
                </button>
              ))}
            </div>
            {moveError && <div className="dialog-error">{moveError}</div>}
            <div className="dialog-actions">
              <button className="btn" type="button" onClick={handleCancelMove} disabled={isMoving}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={isMoving || foldersLoading || selectedMoveDir === null}
              >
                {isMoving ? 'Moving...' : 'Move'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;
