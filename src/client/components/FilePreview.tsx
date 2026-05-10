import React, { useState, useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
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
  onCopyPath: (file: FileInfo) => void;
  onRename: (file: FileInfo) => void;
  onMove: (file: FileInfo) => void;
  onTrash: (file: FileInfo) => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  file,
  writeMode,
  writeToken,
  onFileSaved,
  onCopyPath,
  onRename,
  onMove,
  onTrash,
}) => {
  const [markdownSource, setMarkdownSource] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [prefersDark, setPrefersDark] = useState(() => {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsEditing(false);
    setEditedContent('');
    setSaveError(null);
    setActionsOpen(false);
  }, [file?.path]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mediaQuery) return;

    const handleChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    setPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!actionsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [actionsOpen]);

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

  const canEdit = file.isText && !file.isLarge && file.content !== undefined;
  const canWrite = writeMode && !!writeToken;
  const editorTheme = prefersDark ? githubDark : githubLight;
  const rawFileUrl = `/api/raw?path=${encodeURIComponent(file.path)}`;

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
          <div className="preview-actions markdown-toggle">
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
              theme={editorTheme}
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
            theme={editorTheme}
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
            theme={editorTheme}
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
            theme={editorTheme}
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
            <p className="csv-note">
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
          theme={editorTheme}
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
            src={rawFileUrl}
            alt={file.name}
          />
        </div>
      );
    }

    if (file.mimeType === 'application/pdf') {
      return (
        <div className="pdf-preview">
          <div className="pdf-toolbar">
            <a className="btn" href={rawFileUrl} target="_blank" rel="noreferrer">
              Open PDF
            </a>
          </div>
          <object data={`${rawFileUrl}#toolbar=1&navpanes=0`} type="application/pdf">
            <div className="binary-info">
              <h3>{file.name}</h3>
              <p>This browser cannot render this PDF inline.</p>
              <a className="btn" href={rawFileUrl} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            </div>
          </object>
        </div>
      );
    }

    if (file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/')) {
      const Tag = file.mimeType.startsWith('audio/') ? 'audio' : 'video';
      return (
        <div className="media-preview">
          <Tag controls style={{ maxWidth: '100%' }}>
            <source
              src={rawFileUrl}
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
        <h3>{file.name}</h3>
        <p><strong>Size:</strong> {formatSize(file.size)}</p>
        <p><strong>Modified:</strong> {formatDate(file.mtime)}</p>
        <p><strong>Type:</strong> {file.mimeType}</p>
        <p className="unsupported-note">
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
          {canWrite && canEdit && !isEditing && (
            <button className="btn" onClick={handleEdit}>
              Edit
            </button>
          )}
          {canWrite && isEditing && (
            <>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </button>
            </>
          )}
          <div className="action-menu" ref={actionsRef}>
            <button
              className={`icon-btn ${actionsOpen ? 'active' : ''}`}
              type="button"
              title="File actions"
              aria-label="File actions"
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen(open => !open)}
            >
              ...
            </button>
            {actionsOpen && (
              <div className="action-menu-popover">
                <button type="button" onClick={() => { setActionsOpen(false); onCopyPath(file); }}>
                  Copy path
                </button>
                {canWrite && !isEditing && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => { setActionsOpen(false); onRename(file); }}
                  >
                    Rename
                  </button>
                )}
                {canWrite && !isEditing && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => { setActionsOpen(false); onMove(file); }}
                  >
                    Move to...
                  </button>
                )}
                {canWrite && !isEditing && (
                  <button
                    className="danger"
                    type="button"
                    disabled={isSaving}
                    onClick={() => { setActionsOpen(false); onTrash(file); }}
                  >
                    Trash
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {saveError && (
        <div className="error-banner">{saveError}</div>
      )}
      <div className="preview-content">{renderContent()}</div>
    </div>
  );
};

export default FilePreview;
