import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createHash } from 'crypto';
const DEFAULT_STATE_DIR = path.join(os.homedir(), '.cache', 'project-preview');
function getStateDir() {
    return process.env.PROJECT_PREVIEW_STATE_DIR || DEFAULT_STATE_DIR;
}
export function projectSlug(root) {
    const name = path.basename(root) || 'root';
    return name.trim().replace(/\s+/g, '-').replace(/[/?#%\\]/g, '-') || 'root';
}
export function projectUrl(port, _root) {
    return `http://127.0.0.1:${port}/`;
}
export function projectRedirectUrl(port, root) {
    return projectUrl(port, root);
}
function getInstanceId(root) {
    return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
}
function getStateFile(instanceId) {
    return path.join(getStateDir(), `${instanceId}.json`);
}
async function ensureStateDir() {
    await fs.mkdir(getStateDir(), { recursive: true });
}
export async function saveInstance(root, port, pid) {
    await ensureStateDir();
    const instanceId = getInstanceId(root);
    const state = {
        pid,
        port,
        root: path.resolve(root),
        startedAt: new Date().toISOString(),
    };
    await fs.writeFile(getStateFile(instanceId), JSON.stringify(state, null, 2));
}
export async function getInstance(root) {
    try {
        const instanceId = getInstanceId(root);
        const content = await fs.readFile(getStateFile(instanceId), 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
export async function removeInstance(root) {
    try {
        const instanceId = getInstanceId(root);
        await fs.unlink(getStateFile(instanceId));
    }
    catch {
        // Ignore errors
    }
}
export async function listInstances() {
    try {
        await ensureStateDir();
        const stateDir = getStateDir();
        const files = await fs.readdir(stateDir);
        const stateEntries = await Promise.all(files
            .filter(file => file.endsWith('.json'))
            .map(async (file) => {
            try {
                const content = await fs.readFile(path.join(stateDir, file), 'utf-8');
                const state = JSON.parse(content);
                return {
                    file,
                    state,
                };
            }
            catch {
                return null;
            }
        }));
        const instances = await Promise.all(stateEntries
            .filter((entry) => entry !== null)
            .map(async ({ file, state }) => {
            const alive = await isProcessAlive(state.pid, state.port, state.root);
            return {
                ...state,
                id: file.replace('.json', ''),
                alive,
            };
        }));
        return instances;
    }
    catch {
        return [];
    }
}
export async function isProcessAlive(pid, port, expectedRoot) {
    // Health check is the authoritative signal. In Codex sandboxed runs,
    // process.kill(pid, 0) can fail even when a localhost server is reachable.
    try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
            signal: AbortSignal.timeout(2000)
        });
        if (!response.ok)
            return false;
        const health = await response.json();
        if (health.status !== 'ok')
            return false;
        if (expectedRoot !== undefined) {
            if (!health.root)
                return false;
            if (path.resolve(health.root) !== path.resolve(expectedRoot))
                return false;
        }
    }
    catch {
        return false;
    }
    try {
        process.kill(pid, 0);
    }
    catch {
        // The process may be hidden from the current sandbox, but health is enough.
    }
    return true;
}
export async function cleanupDeadInstances() {
    const instances = await listInstances();
    for (const instance of instances) {
        if (!instance.alive) {
            await removeInstance(instance.root);
        }
    }
}
//# sourceMappingURL=process-manager.js.map