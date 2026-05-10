import React, { useState } from 'react';
import type { FileNode } from '../App';

interface FileTreeProps {
  nodes: FileNode[];
  onSelect: (node: FileNode) => void;
  selectedPath?: string;
  level?: number;
}

const FileTree: React.FC<FileTreeProps> = ({ nodes, onSelect, selectedPath, level = 0 }) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [childrenByPath, setChildrenByPath] = useState<Record<string, FileNode[]>>({});
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [errorDirs, setErrorDirs] = useState<Record<string, string>>({});

  const toggleDir = async (path: string) => {
    if (expandedDirs.has(path)) {
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      return;
    }
    
    setExpandedDirs(prev => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
    
    if (childrenByPath[path] || loadingDirs.has(path)) return;
    
    setLoadingDirs(prev => new Set(prev).add(path));
    setErrorDirs(prev => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    
    try {
      const response = await fetch(`/api/tree?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setChildrenByPath(prev => ({ ...prev, [path]: data.nodes || [] }));
    } catch (err) {
      setErrorDirs(prev => ({
        ...prev,
        [path]: err instanceof Error ? err.message : 'Failed to load directory',
      }));
    } finally {
      setLoadingDirs(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  };

  const getFileIcon = (node: FileNode) => {
    if (node.type === 'directory') {
      return expandedDirs.has(node.path) ? '📂' : '📁';
    }
    
    const ext = node.name.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      'js': '📜', 'ts': '📘', 'jsx': '⚛️', 'tsx': '⚛️',
      'json': '📋', 'md': '📝', 'txt': '📄', 'css': '🎨',
      'html': '🌐', 'svg': '🖼️', 'png': '🖼️', 'jpg': '🖼️',
      'jpeg': '🖼️', 'gif': '🖼️', 'pdf': '📕', 'mp3': '🎵',
      'mp4': '🎬', 'csv': '📊', 'yml': '⚙️', 'yaml': '⚙️',
    };
    return iconMap[ext || ''] || '📄';
  };

  return (
    <div>
      {nodes.map(node => (
        <div key={node.path}>
          <div
            className={`tree-node ${selectedPath === node.path ? 'active' : ''}`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => {
              if (node.type === 'directory') {
                void toggleDir(node.path);
              } else {
                onSelect(node);
              }
            }}
          >
            <span className="tree-toggle">
              {node.type === 'directory' && (expandedDirs.has(node.path) ? '▼' : '▶')}
            </span>
            <span className="tree-icon">{getFileIcon(node)}</span>
            <span className="tree-name">{node.name}</span>
          </div>
          {node.type === 'directory' && expandedDirs.has(node.path) && (
            <div className="tree-children">
              {loadingDirs.has(node.path) && (
                <div
                  className="tree-node tree-status"
                  style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                >
                  Loading...
                </div>
              )}
              {errorDirs[node.path] && (
                <div
                  className="tree-node tree-status tree-error"
                  style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                >
                  {errorDirs[node.path]}
                </div>
              )}
              {childrenByPath[node.path] && childrenByPath[node.path].length === 0 && (
                <div
                  className="tree-node tree-status"
                  style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                >
                  Empty
                </div>
              )}
              {childrenByPath[node.path] && childrenByPath[node.path].length > 0 && (
                <FileTree
                  nodes={childrenByPath[node.path]}
                  onSelect={onSelect}
                  selectedPath={selectedPath}
                  level={level + 1}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default FileTree;
