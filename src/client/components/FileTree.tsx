import React, { useEffect, useState } from 'react';
import type { FileNode } from '../App';

interface FileTreeProps {
  nodes: FileNode[];
  onSelect: (node: FileNode) => void;
  selectedPath?: string;
  level?: number;
  canWrite?: boolean;
  onCopyPath?: (node: FileNode) => void;
  onRename?: (node: FileNode) => void;
  onTrash?: (node: FileNode) => void;
}

interface ContextMenuState {
  node: FileNode;
  x: number;
  y: number;
}

const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  onSelect,
  selectedPath,
  level = 0,
  canWrite = false,
  onCopyPath,
  onRename,
  onTrash,
}) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [childrenByPath, setChildrenByPath] = useState<Record<string, FileNode[]>>({});
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [errorDirs, setErrorDirs] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('click', close);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

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

  const openContextMenu = (event: React.MouseEvent, node: FileNode) => {
    event.preventDefault();
    event.stopPropagation();
    if (node.type === 'file') {
      onSelect(node);
    }
    setContextMenu({
      node,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 180)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 140)),
    });
  };

  const runMenuAction = (action: () => void) => {
    setContextMenu(null);
    action();
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
            onContextMenu={(event) => openContextMenu(event, node)}
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
                  canWrite={canWrite}
                  onCopyPath={onCopyPath}
                  onRename={onRename}
                  onTrash={onTrash}
                />
              )}
            </div>
          )}
        </div>
      ))}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {onCopyPath && (
            <button type="button" onClick={() => runMenuAction(() => onCopyPath(contextMenu.node))}>
              Copy path
            </button>
          )}
          {canWrite && onRename && (
            <button type="button" onClick={() => runMenuAction(() => onRename(contextMenu.node))}>
              Rename
            </button>
          )}
          {canWrite && onTrash && (
            <button
              className="danger"
              type="button"
              onClick={() => runMenuAction(() => onTrash(contextMenu.node))}
            >
              Trash
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FileTree;
