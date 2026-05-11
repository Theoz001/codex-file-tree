import path from 'path';
import fs from 'fs/promises';
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import type { FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { registerRoutes } from './routes.js';
import { listInstances, projectRedirectUrl, projectSlug, projectUrl, removeInstance, saveInstance } from './process-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function renderIndexHtml(staticRoot: string, rootDir: string): Promise<string> {
  const html = await fs.readFile(path.join(staticRoot, 'index.html'), 'utf-8');
  const projectName = path.basename(rootDir) || 'Project Preview';
  const title = `${projectName} - Project Preview`;
  return html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function createPreviewSummary(root: string, port: number, current: boolean, startedAt: string | null) {
  return {
    name: path.basename(root) || root,
    root,
    port,
    url: projectUrl(port, root),
    current,
    startedAt,
  };
}

function startedAtTime(value: string | null): number {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

export function getRequestedProjectSlug(url: string): string | null {
  const pathname = url.split(/[?#]/, 1)[0] || '/';
  const match = /^\/p\/([^/?#]+)/.exec(pathname);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function resolveProjectRedirect(
  requestUrl: string,
  rootDir: string,
  port: number,
): Promise<string | null> {
  const requestedSlug = getRequestedProjectSlug(requestUrl);
  if (!requestedSlug) return null;

  if (requestedSlug === projectSlug(rootDir)) {
    return projectRedirectUrl(port, rootDir);
  }

  const matches = (await listInstances())
    .filter(instance => (
      instance.alive
      && instance.port !== port
      && projectSlug(instance.root) === requestedSlug
    ))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  const match = matches[0];
  return match ? projectRedirectUrl(match.port, match.root) : null;
}

interface ServerOptions {
  openWithDefaultApp?: (targetPath: string) => Promise<void>;
}

export async function createServer(rootDir: string, port: number, clientDist?: string, options: ServerOptions = {}) {
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

  app.get('/api/previews', async () => {
    const currentRoot = path.resolve(rootDir);
    const seenRoots = new Set<string>();
    const previews = (await listInstances())
      .filter(instance => instance.alive)
      .map(instance => {
        const resolvedRoot = path.resolve(instance.root);
        seenRoots.add(resolvedRoot);
        return createPreviewSummary(
          instance.root,
          instance.port,
          resolvedRoot === currentRoot,
          instance.startedAt,
        );
      });

    if (!seenRoots.has(currentRoot)) {
      previews.push(createPreviewSummary(rootDir, port, true, null));
    }

    previews.sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return startedAtTime(b.startedAt) - startedAtTime(a.startedAt);
    });

    return { previews };
  });
  
  // Register API routes
  await registerRoutes(app, rootDir, writeToken, {
    openWithDefaultApp: options.openWithDefaultApp,
  });

  const staticRoot = clientDist || path.resolve(__dirname, '../client');
  const sendIndexHtml = async (reply: FastifyReply) => {
    const html = await renderIndexHtml(staticRoot, rootDir);
    return reply.type('text/html').send(html);
  };

  app.get('/', async (_request, reply) => {
    return sendIndexHtml(reply);
  });
  
  // Serve static files (built client)
  await app.register(fastifyStatic, {
    root: staticRoot,
    prefix: '/',
    index: false,
  });
  
  // Serve SPA - return index.html for all non-API routes not matched by static assets.
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'API endpoint not found' });
    }

    const redirectUrl = await resolveProjectRedirect(request.url, rootDir, port);
    if (redirectUrl) {
      return reply.redirect(redirectUrl, 302);
    }

    return sendIndexHtml(reply);
  });
  
  return app;
}

export async function startServer(rootDir: string, port: number) {
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
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
