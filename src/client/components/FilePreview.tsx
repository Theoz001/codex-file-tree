import React, { useState } from 'react';
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
}

const FilePreview: React.FC<FilePreviewProps> = ({ file }) => {
  const [markdownSource, setMarkdownSource] = useState(false);

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

  const getLanguageExtension = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return javascript({ jsx: ext?.includes('x') });
      case 'json':
        return json();
      case 'md':
      case 'markdown':
        return markdown();
      case 'py':
        return python();
      case 'css':
      case 'scss':
      case 'sass':
        return css();
      case 'html':
      case 'htm':
        return html();
      default:
        return [];
    }
  };

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

    if (file.mimeType === 'text/markdown' && file.content) {
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
          {markdownSource ? (
            <CodeMirror
              value={file.content}
              theme={githubLight}
              extensions={[markdown()]}
              editable={false}
              basicSetup={{ lineNumbers: true }}
              style={{ fontSize: '13px' }}
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

    if (file.mimeType === 'application/json' && file.content) {
      try {
        const formatted = JSON.stringify(JSON.parse(file.content), null, 2);
        return (
          <CodeMirror
            value={formatted}
            theme={githubLight}
            extensions={[json()]}
            editable={false}
            basicSetup={{ lineNumbers: true }}
            style={{ fontSize: '13px' }}
          />
        );
      } catch {
        return (
          <CodeMirror
            value={file.content}
            theme={githubLight}
            extensions={[json()]}
            editable={false}
            basicSetup={{ lineNumbers: true }}
            style={{ fontSize: '13px' }}
          />
        );
      }
    }

    if (file.mimeType === 'text/csv' && file.content) {
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

    if (file.isText && file.content) {
      return (
        <CodeMirror
          value={file.content}
          theme={githubLight}
          extensions={[getLanguageExtension(file.name)]}
          editable={false}
          basicSetup={{ lineNumbers: true }}
          style={{ fontSize: '13px' }}
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
      </div>
      <div className="preview-content">{renderContent()}</div>
    </div>
  );
};

export default FilePreview;
