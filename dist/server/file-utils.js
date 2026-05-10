import path from 'path';
import fs from 'fs/promises';
import { shouldIgnore, isSymlinkSafe, MAX_FILE_SIZE } from './security.js';
export async function getDirectoryTree(dirPath, rootDir) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes = [];
    for (const entry of entries) {
        if (shouldIgnore(entry.name))
            continue;
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(rootDir, fullPath);
        // Check symlink safety
        const symlinkSafe = await isSymlinkSafe(fullPath, rootDir);
        if (!symlinkSafe)
            continue;
        const stats = await fs.stat(fullPath);
        if (entry.isDirectory()) {
            nodes.push({
                name: entry.name,
                path: relativePath,
                type: 'directory',
            });
        }
        else if (entry.isFile()) {
            nodes.push({
                name: entry.name,
                path: relativePath,
                type: 'file',
                size: stats.size,
                mtime: stats.mtime.toISOString(),
                mimeType: getMimeType(entry.name),
            });
        }
    }
    // Sort: directories first, then alphabetically
    nodes.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });
    return nodes;
}
export async function getFileInfo(filePath, rootDir) {
    const stats = await fs.stat(filePath);
    const name = path.basename(filePath);
    const relativePath = path.relative(rootDir, filePath);
    const mimeType = getMimeType(name);
    const isText = isTextFile(name, mimeType);
    const isLarge = stats.size > MAX_FILE_SIZE;
    let content;
    if (isText && !isLarge) {
        content = await fs.readFile(filePath, 'utf-8');
    }
    return {
        name,
        path: relativePath,
        absolutePath: filePath,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        mimeType,
        isText,
        content,
        isLarge,
    };
}
export function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.htm': 'text/html',
        '.js': 'application/javascript',
        '.ts': 'application/typescript',
        '.jsx': 'text/jsx',
        '.tsx': 'text/tsx',
        '.json': 'application/json',
        '.css': 'text/css',
        '.scss': 'text/scss',
        '.sass': 'text/sass',
        '.less': 'text/less',
        '.xml': 'application/xml',
        '.svg': 'image/svg+xml',
        '.md': 'text/markdown',
        '.markdown': 'text/markdown',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.zip': 'application/zip',
        '.tar': 'application/x-tar',
        '.gz': 'application/gzip',
        '.rar': 'application/x-rar-compressed',
        '.7z': 'application/x-7z-compressed',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}
export function isTextFile(filename, mimeType) {
    const textExtensions = [
        '.txt', '.md', '.markdown', '.json', '.csv', '.js', '.ts', '.jsx', '.tsx',
        '.html', '.htm', '.css', '.scss', '.sass', '.less', '.xml', '.svg', '.yml',
        '.yaml', '.toml', '.ini', '.conf', '.cfg', '.sh', '.bash', '.zsh', '.fish',
        '.py', '.rb', '.php', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
        '.cs', '.swift', '.kt', '.scala', '.r', '.m', '.mm', '.pl', '.pm', '.lua',
        '.vim', '.sql', '.graphql', '.gql', '.dockerfile', '.makefile', '.cmake',
        '.gradle', '.properties', '.env', '.lock', '.gitignore', '.gitattributes',
        '.editorconfig', '.eslintignore', '.prettierignore', '.npmignore',
    ];
    const ext = path.extname(filename).toLowerCase();
    if (textExtensions.includes(ext))
        return true;
    // Check some known filenames without extension
    const textFilenames = [
        'dockerfile', 'makefile', 'gemfile', 'rakefile', 'jenkinsfile',
        'vagrantfile', 'brewfile', 'podfile',
    ];
    if (textFilenames.includes(filename.toLowerCase()))
        return true;
    return mimeType.startsWith('text/') ||
        mimeType === 'application/json' ||
        mimeType === 'application/javascript' ||
        mimeType === 'application/typescript' ||
        mimeType === 'application/xml';
}
//# sourceMappingURL=file-utils.js.map