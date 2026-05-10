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

const MIN_SIDEBAR_WIDTH = 220;
const MIN_PREVIEW_WIDTH = 240;
const MAX_SIDEBAR_RATIO = 0.65;
const DEFAULT_SIDEBAR_WIDTH = 280;
const SIDEBAR_STORAGE_KEY = 'project-preview-sidebar-width';

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
  const [isDragging, setIsDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('writeMode', String(writeMode));
  }, [writeMode]);

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
    }
  }, [fetchTree, fetchFile, selectedFile]);

  const handleFileTrashed = useCallback((trashedPath: string) => {
    setTreeKey(prev => prev + 1);
    fetchTree('');
    if (selectedFile?.path === trashedPath) {
      setSelectedFile(null);
    }
  }, [fetchTree, selectedFile]);

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
          <img className="header-icon" src="/icon.png" alt="" aria-hidden="true" />
          <div className="header-project">
            <span className="header-title">{projectMeta?.name || 'Project Preview'}</span>
            <span className="header-path" title={projectMeta?.root || ''}>
              {projectMeta?.root || 'Loading project...'}
            </span>
          </div>
        </div>
        <div className="header-right">
          <label className="write-mode-toggle">
            <input
              type="checkbox"
              checked={writeMode}
              onChange={(e) => setWriteMode(e.target.checked)}
            />
            <span className="write-mode-label">Write mode</span>
          </label>
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
        <div style={{ padding: '8px 16px', background: '#ffebee', color: '#c62828', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div className="main" ref={mainRef}>
        <aside className="sidebar" style={{ width: sidebarWidth }}>
          <FileTree
            key={treeKey}
            nodes={filteredTree}
            onSelect={handleSelectFile}
            selectedPath={selectedFile?.path}
          />
        </aside>
        <div
          className={`splitter ${isDragging ? 'dragging' : ''}`}
          onMouseDown={() => setIsDragging(true)}
        />
        <main className="preview">
          <FilePreview
            file={selectedFile}
            writeMode={writeMode}
            writeToken={projectMeta?.writeToken || ''}
            onFileSaved={handleFileSaved}
            onFileRenamed={handleFileRenamed}
            onFileTrashed={handleFileTrashed}
          />
        </main>
      </div>
    </div>
  );
};

export default App;
