#!/usr/bin/env node
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { startServer } from './server.js';
import { getInstance, removeInstance, listInstances, isProcessAlive, cleanupDeadInstances } from './process-manager.js';
const __filename = fileURLToPath(import.meta.url);
function parseArgs() {
    const args = process.argv.slice(2);
    let command = 'start';
    let root = process.cwd();
    let port = 8098;
    // First arg might be a command
    if (args.length > 0 && !args[0].startsWith('-')) {
        const firstArg = args[0].toLowerCase();
        if (['start', 'url', 'stop', 'list', 'help'].includes(firstArg)) {
            command = firstArg;
            args.shift();
        }
    }
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--root' || arg === '-r') {
            root = args[++i] || root;
        }
        else if (arg === '--port' || arg === '-p') {
            const parsedPort = parseInt(args[++i], 10);
            if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort < 65536) {
                port = parsedPort;
            }
        }
        else if (arg === '--help' || arg === '-h') {
            command = 'help';
        }
    }
    return { command, root: path.resolve(root), port };
}
async function handleStart(root, port) {
    // Check if instance already exists for this root
    const existing = await getInstance(root);
    if (existing) {
        const alive = await isProcessAlive(existing.pid, existing.port);
        if (alive) {
            console.log(`Preview server already running for ${root}`);
            console.log(`URL: http://127.0.0.1:${existing.port}`);
            return;
        }
        else {
            // Clean up dead instance
            await removeInstance(root);
        }
    }
    // Start new server
    const availablePort = await findAvailablePort(port);
    if (availablePort !== port) {
        console.log(`Port ${port} is busy; using ${availablePort} instead`);
    }
    await startServer(root, availablePort);
}
async function handleUrl(root, port) {
    const existing = await getInstance(root);
    if (existing) {
        const alive = await isProcessAlive(existing.pid, existing.port);
        if (alive) {
            console.log(`http://127.0.0.1:${existing.port}`);
            return;
        }
        await removeInstance(root);
    }
    const availablePort = await findAvailablePort(port);
    const child = spawn(process.execPath, [__filename, 'start', '--root', root, '--port', String(availablePort)], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        const instance = await getInstance(root);
        if (instance) {
            const alive = await isProcessAlive(instance.pid, instance.port);
            if (alive) {
                console.log(`http://127.0.0.1:${instance.port}`);
                return;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out waiting for Project Preview server on port ${availablePort}`);
}
async function findAvailablePort(startPort) {
    for (let port = startPort; port < startPort + 200 && port < 65536; port++) {
        const available = await new Promise(resolve => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close(() => resolve(true));
            });
            server.listen(port, '127.0.0.1');
        });
        if (available)
            return port;
    }
    throw new Error(`No available port found starting at ${startPort}`);
}
async function handleStop(root) {
    const existing = await getInstance(root);
    if (!existing) {
        console.log(`No preview server found for ${root}`);
        return;
    }
    const alive = await isProcessAlive(existing.pid, existing.port);
    if (alive) {
        try {
            process.kill(existing.pid, 'SIGTERM');
            console.log(`Stopped preview server for ${root} (PID: ${existing.pid})`);
        }
        catch (err) {
            console.error(`Failed to stop server: ${err.message}`);
        }
    }
    else {
        console.log(`Server was already dead, cleaning up state`);
    }
    await removeInstance(root);
}
async function handleList() {
    await cleanupDeadInstances();
    const instances = await listInstances();
    if (instances.length === 0) {
        console.log('No preview servers running');
        return;
    }
    console.log('Preview servers:');
    console.log('');
    for (const instance of instances) {
        const status = instance.alive ? '🟢 running' : '🔴 dead';
        console.log(`  ${status}  ${instance.root}`);
        console.log(`      URL: http://127.0.0.1:${instance.port}`);
        console.log(`      PID: ${instance.pid}  Started: ${instance.startedAt}`);
        console.log('');
    }
}
function printHelp() {
    console.log(`
Project Preview Server

A lightweight local project file previewer for Codex in-app browser.

Usage:
  project-preview [command] [options]

Commands:
  start    Start a preview server (default)
  url      Start or reuse a preview server, then print only its URL
  stop     Stop a preview server
  list     List all running preview servers
  help     Show this help message

Options:
  --root, -r <directory>   Root directory to serve (default: current working directory)
  --port, -p <number>     Port to listen on (default: 8098)
  --help, -h               Show this help message

Examples:
  project-preview
  project-preview url --root /path/to/project
  project-preview start --root /path/to/project
  project-preview start --port 3000
  project-preview stop --root /path/to/project
  project-preview list

Security:
  - Read-only access
  - Restricted to root directory
  - Symlinks outside root are blocked
  - Ignores: .git, node_modules, dist, build, etc.
`);
}
async function main() {
    const { command, root, port } = parseArgs();
    switch (command) {
        case 'start':
            await handleStart(root, port);
            break;
        case 'url':
            await handleUrl(root, port);
            break;
        case 'stop':
            await handleStop(root);
            break;
        case 'list':
            await handleList();
            break;
        case 'help':
        default:
            printHelp();
            break;
    }
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map