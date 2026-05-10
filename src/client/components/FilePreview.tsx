import React, { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { githubLight } from '@uiw/codemirror-theme-github';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Papa from 'papaparse';
import type { FileInfo } from '../App';

interface FilePreviewProps {
  file: FileInfo | null;
  writeMode: boolean;
  writeToken: string;
  onFileSaved: () => void;
  onFileRenamed: (oldPath: string, newPath: string) => void;
  onFileTrashed: (path: string) => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  file,
  writeMode,
  writeToken,
  onFileSaved,
  onFileRenamed,
  onFileTrashed,
}) => {
  const [markdownSource, setMarkdownSource] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setIsEditing(false);
    setEditedContent('');
    setSaveError(null);
  }, [file?.path]);

  if (!file) {
    return (
      <div className="empty-state">
        Select a file to preview
      </div>
    );
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string): string => {
    return new Date(iso).toLocaleString();
  };

  const getLanguageExtensions = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return [javascript({ jsx: ext?.includes('x') })];
      case 'json':
        return [json()];
      case 'md':
      case 'markdown':
        return [markdown()];
      case 'py':
        return [python()];
      case 'css':
      case 'scss':
      case 'sass':
        return [css()];
      case 'html':
      case 'htm':
        return [html()];
      default:
        return [];
    }
  };

  const writeHeaders = () => ({
    'Content-Type': 'application/json',
    'X-Project-Preview-Write-Token': writeToken,
  });

  const handleEdit = () => {
    if (file.content !== undefined) {
      setIsEditing(true);
      setEditedContent(file.content);
      setSaveError(null);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedContent('');
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!file || !writeToken) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch('/api/file/save', {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({ path: file.path, content: editedContent }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setIsEditing(false);
      setEditedContent('');
      onFileSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRename = async () => {
    if (!file || !writeToken || isEditing || isSaving) return;
    const newName = window.prompt(`Rename "${file.name}" to:`, file.name);
    if (!newName || newName === file.name) return;
    try {
      const response = await fetch('/api/fs/rename', {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({ path: file.path, newName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Rename failed' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      onFileRenamed(file.path, result.newPath);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const handleTrash = async () => {
    if (!file || !writeToken || isEditing || isSaving) return;
    const confirmed = window.confirm(`Move "${file.path}" to Trash?`);
    if (!confirmed) return;
    try {
      const response = await fetch('/api/fs/trash', {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({ path: file.path }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Trash failed' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      onFileTrashed(file.path);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Trash failed');
    }
  };

  const handleCopyPath = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.absolutePath);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = file.absolutePath;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  const canEdit = file.isText && !file.isLarge && file.content !== undefined;
  const canWrite = writeMode && !!writeToken;

  const renderContent = () => {
    if (file.isLarge && file.isText) {
      return (
        <div className="warning-box">
          <h4>⚠️ Large File</h4>
          <p>This file is {formatSize(file.size)} and exceeds the 5MB preview limit.</p>
          <p>You can download it or use an external editor.</p>
        </div>
      );
    }

    if (file.mimeType === 'text/markdown' && file.content !== undefined) {
      return (
        <div>
          <div className="preview-actions" style={{ marginBottom: '12px' }}>
            <button
              className={`btn ${!markdownSource ? 'btn-primary' : ''}`}
              onClick={() => setMarkdownSource(false)}
            >
              Preview
            </button>
            <button
              className={`btn ${markdownSource ? 'btn-primary' : ''}`}
              onClick={() => setMarkdownSource(true)}
            >
              Source
            </button>
          </div>
          {markdownSource || isEditing ? (
            <CodeMirror
              value={isEditing ? editedContent : file.content}
              theme={githubLight}
              extensions={[markdown()]}
              editable={isEditing}
              basicSetup={{ lineNumbers: true }}
              style={{ fontSize: '13px' }}
              onChange={isEditing ? setEditedContent : undefined}
            />
          ) : (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {file.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      );
    }

    if (file.mimeType === 'application/json' && file.content !== undefined) {
      try {
        const formatted = JSON.stringify(JSON.parse(file.content), null, 2);
        return (
          <CodeMirror
            value={isEditing ? editedContent : formatted}
            theme={githubLight}
            extensions={[json()]}
            editable={isEditing}
            basicSetup={{ lineNumbers: true }}
            style={{ fontSize: '13px' }}
            onChange={isEditing ? setEditedContent : undefined}
          />
        );
      } catch {
        return (
          <CodeMirror
            value={isEditing ? editedContent : file.content}
            theme={githubLight}
            extensions={[json()]}
            editable={isEditing}
            basicSetup={{ lineNumbers: true }}
            style={{ fontSize: '13px' }}
            onChange={isEditing ? setEditedContent : undefined}
          />
        );
      }
    }

    if (file.mimeType === 'text/csv' && file.content !== undefined) {
      if (isEditing) {
        return (
          <CodeMirror
            value={editedContent}
            theme={githubLight}
            extensions={[]}
            editable={true}
            basicSetup={{ lineNumbers: true }}
            style={{ fontSize: '13px' }}
            onChange={setEditedContent}
          />
        );
      }
      const result = Papa.parse(file.content, { header: true });
      if (result.data && result.data.length > 0) {
        const headers = Object.keys(result.data[0] as Record<string, unknown>);
        return (
          <div>
            <p style={{ marginBottom: '12px', color: '#666', fontSize: '13px' }}>
              Showing {Math.min(result.data.length, 100)} of {result.data.length} rows
            </p>
            <table className="csv-table">
              <thead>
                <tr>
                  {headers.map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.data.slice(0, 100).map((row, i) => (
                  <tr key={i}>
                    {headers.map(h => (
                      <td key={h}>{(row as Record<string, unknown>)[h] as string}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    }

    if (file.isText && file.content !== undefined) {
      return (
        <CodeMirror
          value={isEditing ? editedContent : file.content}
          theme={githubLight}
          extensions={getLanguageExtensions(file.name)}
          editable={isEditing}
          basicSetup={{ lineNumbers: true }}
          style={{ fontSize: '13px' }}
          onChange={isEditing ? setEditedContent : undefined}
        />
      );
    }

    if (file.mimeType.startsWith('image/')) {
      return (
        <div className="image-preview">
          <img
            src={`/api/raw?path=${encodeURIComponent(file.path)}`}
            alt={file.name}
          />
        </div>
      );
    }

    if (file.mimeType === 'application/pdf') {
      return (
        <div className="pdf-preview">
          <iframe
            src={`/api/raw?path=${encodeURIComponent(file.path)}`}
            title={file.name}
          />
        </div>
      );
    }

    if (file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/')) {
      const Tag = file.mimeType.startsWith('audio/') ? 'audio' : 'video';
      return (
        <div className="media-preview">
          <Tag controls style={{ maxWidth: '100%' }}>
            <source
              src={`/api/raw?path=${encodeURIComponent(file.path)}`}
              type={file.mimeType}
            />
            Your browser does not support this media type.
          </Tag>
        </div>
      );
    }

    // Binary / unsupported files
    return (
      <div className="binary-info">
        <h3>📄 {file.name}</h3>
        <p><strong>Size:</strong> {formatSize(file.size)}</p>
        <p><strong>Modified:</strong> {formatDate(file.mtime)}</p>
        <p><strong>Type:</strong> {file.mimeType}</p>
        <p style={{ marginTop: '24px', color: '#999' }}>
          This file type is not supported for preview.
        </p>
      </div>
    );
  };

  return (
    <div>
      <div className="preview-header">
        <div>
          <div className="preview-title">{file.name}</div>
          <div className="preview-meta">
            {formatSize(file.size)} • {formatDate(file.mtime)} • {file.mimeType}
          </div>
        </div>
        <div className="preview-actions">
          <button className="btn" onClick={handleCopyPath} title="Copy absolute path">
            📋 Copy path
          </button>
          {canWrite && canEdit && !isEditing && (
            <button className="btn" onClick={handleEdit}>
              ✏️ Edit
            </button>
          )}
          {canWrite && isEditing && (
            <>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : '💾 Save'}
              </button>
              <button className="btn" onClick={handleCancel} disabled={isSaving}>
                ❌ Cancel
              </button>
            </>
          )}
          {canWrite && !isEditing && (
            <>
              <button className="btn" onClick={handleRename} disabled={isSaving}>
                ✏️ Rename
              </button>
              <button className="btn btn-danger" onClick={handleTrash} disabled={isSaving}>
                🗑️ Trash
              </button>
            </>
          )}
        </div>
      </div>
      {saveError && (
        <div style={{ padding: '8px 16px', background: '#ffebee', color: '#c62828', fontSize: '13px' }}>
          {saveError}
        </div>
      )}
      <div className="preview-content">{renderContent()}</div>
    </div>
  );
};

export default FilePreview;
