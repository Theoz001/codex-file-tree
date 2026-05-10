import path from 'path';
import fs from 'fs/promises';
import { isPathSafe, isSymlinkSafe, sanitizePath } from './security.js';
import { getDirectoryTree, getFileInfo, getMimeType } from './file-utils.js';
export async function registerRoutes(fastify, rootDir) {
    // GET /api/tree?path=...
    fastify.get('/api/tree', async (request, reply) => {
        const rawPath = request.query.path || '';
        const safePath = sanitizePath(rawPath);
        if (!isPathSafe(safePath, rootDir)) {
            return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
        }
        const targetPath = path.join(rootDir, safePath);
        try {
            const stats = await fs.stat(targetPath);
            if (!stats.isDirectory()) {
                return reply.status(400).send({ error: 'Not a directory' });
            }
            const tree = await getDirectoryTree(targetPath, rootDir);
            return reply.send({ path: safePath, nodes: tree });
        }
        catch (err) {
            const error = err;
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
            const symlinkSafe = await isSymlinkSafe(targetPath, rootDir);
            if (!symlinkSafe) {
                return reply.status(403).send({ error: 'Access denied: symlink target is outside root directory' });
            }
            const stats = await fs.stat(targetPath);
            if (!stats.isFile()) {
                return reply.status(400).send({ error: 'Not a file' });
            }
            const info = await getFileInfo(targetPath, rootDir);
            return reply.send(info);
        }
        catch (err) {
            const error = err;
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
            const symlinkSafe = await isSymlinkSafe(targetPath, rootDir);
            if (!symlinkSafe) {
                return reply.status(403).send({ error: 'Access denied: symlink target is outside root directory' });
            }
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
            return reply.status(500).send({ error: error.message });
        }
    });
}
//# sourceMappingURL=routes.js.map