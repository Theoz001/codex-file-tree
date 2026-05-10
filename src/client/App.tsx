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

const App: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [treeData, setTreeData] = useState<FileNode[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    fetchTree();
  }, [fetchTree]);

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

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="header-title">Project Preview</span>
          <span className="header-path">Root</span>
        </div>
        <div className="header-right">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="btn" onClick={handleRefresh}>
            🔄 Refresh
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
