import React, { useState, useEffect, useCallback } from 'react';
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
}

const App: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [treeData, setTreeData] = useState<FileNode[]>([]);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      <div className="main">
        <aside className="sidebar">
          <FileTree
            nodes={filteredTree}
            onSelect={handleSelectFile}
            selectedPath={selectedFile?.path}
          />
        </aside>
        <main className="preview">
          <FilePreview file={selectedFile} />
        </main>
      </div>
    </div>
  );
};

export default App;
