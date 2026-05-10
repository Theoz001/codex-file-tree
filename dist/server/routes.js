import path from 'path';
import fs from 'fs/promises';
import { timingSafeEqual } from 'crypto';
import { assertExistingPathInsideRoot, assertParentInsideRoot, hasIgnoredSegment, isPathSafe, sanitizePath, MAX_FILE_SIZE, WRITE_TOKEN_HEADER, } from './security.js';
import { getDirectoryTree, getFileInfo, getMimeType, isTextFile } from './file-utils.js';
import { moveToTrash } from './trash.js';
function getHeaderValue(value) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}
function hasValidWriteToken(request, writeToken) {
    const provided = getHeaderValue(request.headers[WRITE_TOKEN_HEADER]);
    if (!provided || !writeToken) {
        return false;
    }
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(writeToken);
    return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
function requireWriteToken(request, reply, writeToken) {
    if (hasValidWriteToken(request, writeToken)) {
        return true;
    }
    void reply.status(403).send({ error: 'Write access denied' });
    return false;
}
function isErrno(err, code) {
    return err.code === code;
}
function isAccessDenied(err) {
    return isErrno(err, 'EACCES') || err.message.includes('outside root');
}
function isProtectedWritePath(safePath) {
    return hasIgnoredSegment(safePath);
}
export async function registerRoutes(fastify, rootDir, writeToken) {
    // GET /api/tree?path=...
    fastify.get('/api/tree', async (request, reply) => {
        const rawPath = request.query.path || '';
        const safePath = sanitizePath(rawPath);
        if (!isPathSafe(safePath, rootDir)) {
            return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
        }
        const targetPath = path.join(rootDir, safePath);
        try {
            await assertExistingPathInsideRoot(targetPath, rootDir);
            const stats = await fs.stat(targetPath);
            if (!stats.isDirectory()) {
                return reply.status(400).send({ error: 'Not a directory' });
            }
            const tree = await getDirectoryTree(targetPath, rootDir);
            return reply.send({ path: safePath, nodes: tree });
        }
        catch (err) {
            const error = err;
            if (isAccessDenied(err)) {
                return reply.status(403).send({ error: error.message });
            }
            return reply.status(500).send({ error: error.message });
        }
    });
    // GET /api/file?path=...
    fastify.get('/api/file', async (request, reply) => {
        const rawPath = request.query.path || '';
        const safePath = sanitizePath(rawPath);
        if (!safePath) {
            return reply.status(400).send({ error: 'Path is required' });
        }
        if (!isPathSafe(safePath, rootDir)) {
            return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
        }
        const targetPath = path.join(rootDir, safePath);
        try {
            await assertExistingPathInsideRoot(targetPath, rootDir);
            const stats = await fs.stat(targetPath);
            if (!stats.isFile()) {
                return reply.status(400).send({ error: 'Not a file' });
            }
            const info = await getFileInfo(targetPath, rootDir);
            return reply.send(info);
        }
        catch (err) {
            const error = err;
            if (isAccessDenied(err)) {
                return reply.status(403).send({ error: error.message });
            }
            return reply.status(500).send({ error: error.message });
        }
    });
    // GET /api/raw?path=...
    fastify.get('/api/raw', async (request, reply) => {
        const rawPath = request.query.path || '';
        const safePath = sanitizePath(rawPath);
        if (!safePath) {
            return reply.status(400).send({ error: 'Path is required' });
        }
        if (!isPathSafe(safePath, rootDir)) {
            return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
        }
        const targetPath = path.join(rootDir, safePath);
        try {
            await assertExistingPathInsideRoot(targetPath, rootDir);
            const stats = await fs.stat(targetPath);
            if (!stats.isFile()) {
                return reply.status(400).send({ error: 'Not a file' });
            }
            // Read and send file directly
            const content = await fs.readFile(targetPath);
            const mimeType = getMimeType(targetPath);
            return reply.header('Content-Type', mimeType).send(content);
        }
        catch (err) {
            const error = err;
            if (isAccessDenied(err)) {
                return reply.status(403).send({ error: error.message });
            }
            return reply.status(500).send({ error: error.message });
        }
    });
    // POST /api/file/save
    fastify.post('/api/file/save', async (request, reply) => {
        if (!requireWriteToken(request, reply, writeToken)) {
            return reply;
        }
        const rawPath = request.body.path || '';
        const safePath = sanitizePath(rawPath);
        if (!safePath) {
            return reply.status(400).send({ error: 'Path is required' });
        }
        if (!isPathSafe(safePath, rootDir)) {
            return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
        }
        if (isProtectedWritePath(safePath)) {
            return reply.status(403).send({ error: 'Access denied: protected path cannot be modified' });
        }
        const targetPath = path.join(rootDir, safePath);
        try {
            await assertExistingPathInsideRoot(targetPath, rootDir);
            const stats = await fs.stat(targetPath);
            if (!stats.isFile()) {
                return reply.status(400).send({ error: 'Not a file' });
            }
            // Verify it's a text file
            const mimeType = getMimeType(targetPath);
            if (!isTextFile(path.basename(targetPath), mimeType)) {
                return reply.status(400).send({ error: 'Not a text file' });
            }
            // Check content size
            const content = request.body.content || '';
            const encoder = new TextEncoder();
            const contentBytes = encoder.encode(content);
            if (contentBytes.length > MAX_FILE_SIZE) {
                return reply.status(400).send({ error: 'Content exceeds 5MB limit' });
            }
            await fs.writeFile(targetPath, content, 'utf-8');
            return reply.send({ success: true });
        }
        catch (err) {
            const error = err;
            if (isErrno(err, 'ENOENT')) {
                return reply.status(404).send({ error: 'File not found' });
            }
            if (isAccessDenied(err)) {
                return reply.status(403).send({ error: error.message });
            }
            return reply.status(500).send({ error: error.message });
        }
    });
    // POST /api/fs/rename
    fastify.post('/api/fs/rename', async (request, reply) => {
        if (!requireWriteToken(request, reply, writeToken)) {
            return reply;
        }
        const rawPath = request.body.path || '';
        const newName = request.body.newName || '';
        const safePath = sanitizePath(rawPath);
        if (!safePath) {
            return reply.status(400).send({ error: 'Path is required' });
        }
        if (!newName ||
            newName.includes('\0') ||
            newName.includes('/') ||
            newName.includes('\\') ||
            newName === '..' ||
            newName === '.' ||
            newName.trim().length === 0 ||
            isProtectedWritePath(newName)) {
            return reply.status(400).send({ error: 'Invalid new name' });
        }
        if (!isPathSafe(safePath, rootDir)) {
            return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
        }
        if (isProtectedWritePath(safePath)) {
            return reply.status(403).send({ error: 'Access denied: protected path cannot be modified' });
        }
        const targetPath = path.join(rootDir, safePath);
        const parentDir = path.dirname(targetPath);
        const newPath = path.join(parentDir, newName);
        try {
            // Ensure new path is still within root
            if (!isPathSafe(path.relative(rootDir, newPath), rootDir)) {
                return reply.status(403).send({ error: 'Access denied: new path is outside root directory' });
            }
            await assertExistingPathInsideRoot(targetPath, rootDir);
            await assertParentInsideRoot(newPath, rootDir);
            const stats = await fs.lstat(targetPath);
            if (!stats.isFile()) {
                return reply.status(400).send({ error: 'Only files can be renamed' });
            }
            // Check destination doesn't exist
            try {
                await fs.lstat(newPath);
                return reply.status(409).send({ error: 'Destination already exists' });
            }
            catch (err) {
                if (!isErrno(err, 'ENOENT')) {
                    throw err;
                }
            }
            await fs.rename(targetPath, newPath);
            return reply.send({ success: true, newPath: path.relative(rootDir, newPath) });
        }
        catch (err) {
            const error = err;
            if (isErrno(err, 'ENOENT')) {
                return reply.status(404).send({ error: 'Source not found' });
            }
            if (isAccessDenied(err)) {
                return reply.status(403).send({ error: error.message });
            }
            return reply.status(500).send({ error: error.message });
        }
    });
    // POST /api/fs/trash
    fastify.post('/api/fs/trash', async (request, reply) => {
        if (!requireWriteToken(request, reply, writeToken)) {
            return reply;
        }
        const rawPath = request.body.path || '';
        const safePath = sanitizePath(rawPath);
        if (!safePath) {
            return reply.status(400).send({ error: 'Path is required' });
        }
        if (!isPathSafe(safePath, rootDir)) {
            return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
        }
        if (isProtectedWritePath(safePath)) {
            return reply.status(403).send({ error: 'Access denied: protected path cannot be modified' });
        }
        const targetPath = path.join(rootDir, safePath);
        try {
            await assertExistingPathInsideRoot(targetPath, rootDir);
            const stats = await fs.lstat(targetPath);
            if (!stats.isFile()) {
                return reply.status(400).send({ error: 'Only files can be moved to trash' });
            }
            await moveToTrash(targetPath);
            return reply.send({ success: true });
        }
        catch (err) {
            const error = err;
            if (isErrno(err, 'ENOENT')) {
                return reply.status(404).send({ error: 'Path not found' });
            }
            if (isAccessDenied(err)) {
                return reply.status(403).send({ error: error.message });
            }
            return reply.status(500).send({ error: error.message });
        }
    });
}
//# sourceMappingURL=routes.js.map