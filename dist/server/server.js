import path from 'path';
import fs from 'fs/promises';
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { registerRoutes } from './routes.js';
import { saveInstance, removeInstance } from './process-manager.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
async function renderIndexHtml(staticRoot, rootDir) {
    const html = await fs.readFile(path.join(staticRoot, 'index.html'), 'utf-8');
    const projectName = path.basename(rootDir) || 'Project Preview';
    const title = `${projectName} - Project Preview`;
    return html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}
export async function createServer(rootDir, port, clientDist) {
    const writeToken = randomBytes(32).toString('base64url');
    const app = fastify({
        logger: {
            level: 'info',
        },
        bodyLimit: 5 * 1024 * 1024 + 1024, // 5MB + buffer for save API validation
    });
    // Health check endpoint
    app.get('/api/health', async () => {
        return { status: 'ok', root: rootDir };
    });
    app.get('/api/meta', async () => {
        return {
            name: path.basename(rootDir) || rootDir,
            root: rootDir,
            port,
            writeToken,
        };
    });
    // Register API routes
    await registerRoutes(app, rootDir, writeToken);
    // Serve static files (built client)
    const staticRoot = clientDist || path.resolve(__dirname, '../client');
    await app.register(fastifyStatic, {
        root: staticRoot,
        prefix: '/',
        index: false,
        wildcard: false,
    });
    // Serve SPA - return index.html for all non-API routes
    app.get('*', async (request, reply) => {
        if (request.url.startsWith('/api/')) {
            return reply.status(404).send({ error: 'API endpoint not found' });
        }
        const html = await renderIndexHtml(staticRoot, rootDir);
        return reply.type('text/html').send(html);
    });
    return app;
}
export async function startServer(rootDir, port) {
    const app = await createServer(rootDir, port);
    try {
        await app.listen({ port, host: '127.0.0.1' });
        // Save instance state for process management
        await saveInstance(rootDir, port, process.pid);
        // Cleanup on exit
        process.on('SIGINT', async () => {
            await removeInstance(rootDir);
            await app.close();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            await removeInstance(rootDir);
            await app.close();
            process.exit(0);
        });
        console.log(`Project Preview Server running at http://127.0.0.1:${port}`);
        console.log(`Root directory: ${rootDir}`);
        return app;
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
//# sourceMappingURL=server.js.map