import path from 'path';
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { fileURLToPath } from 'url';
import { registerRoutes } from './routes.js';
import { saveInstance, removeInstance } from './process-manager.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export async function createServer(rootDir, port, clientDist) {
    const app = fastify({
        logger: {
            level: 'info',
        },
    });
    // Enable CORS
    await app.register(fastifyCors, {
        origin: true,
    });
    // Health check endpoint
    app.get('/api/health', async () => {
        return { status: 'ok', root: rootDir };
    });
    // Register API routes
    await registerRoutes(app, rootDir);
    // Serve static files (built client)
    const staticRoot = clientDist || path.resolve(__dirname, '../client');
    await app.register(fastifyStatic, {
        root: staticRoot,
        prefix: '/',
        wildcard: false,
    });
    // Serve SPA - return index.html for all non-API routes
    app.get('*', async (request, reply) => {
        if (request.url.startsWith('/api/')) {
            return reply.status(404).send({ error: 'API endpoint not found' });
        }
        return reply.sendFile('index.html', staticRoot);
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