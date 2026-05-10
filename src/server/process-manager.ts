import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createHash } from 'crypto';

export interface InstanceState {
  pid: number;
  port: number;
  root: string;
  startedAt: string;
}

interface InstanceWithStatus extends InstanceState {
  id: string;
  alive: boolean;
}

const STATE_DIR = path.join(os.homedir(), '.cache', 'project-preview');

function getInstanceId(root: string): string {
  return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
}

function getStateFile(instanceId: string): string {
  return path.join(STATE_DIR, `${instanceId}.json`);
}

async function ensureStateDir(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

export async function saveInstance(root: string, port: number, pid: number): Promise<void> {
  await ensureStateDir();
  const instanceId = getInstanceId(root);
  const state: InstanceState = {
    pid,
    port,
    root: path.resolve(root),
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(getStateFile(instanceId), JSON.stringify(state, null, 2));
}

export async function getInstance(root: string): Promise<InstanceState | null> {
  try {
    const instanceId = getInstanceId(root);
    const content = await fs.readFile(getStateFile(instanceId), 'utf-8');
    return JSON.parse(content) as InstanceState;
  } catch {
    return null;
  }
}

export async function removeInstance(root: string): Promise<void> {
  try {
    const instanceId = getInstanceId(root);
    await fs.unlink(getStateFile(instanceId));
  } catch {
    // Ignore errors
  }
}

export async function listInstances(): Promise<InstanceWithStatus[]> {
  try {
    await ensureStateDir();
    const files = await fs.readdir(STATE_DIR);
    const instances: InstanceWithStatus[] = [];
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(STATE_DIR, file), 'utf-8');
        const state = JSON.parse(content) as InstanceState;
        const alive = await isProcessAlive(state.pid, state.port);
        instances.push({
          ...state,
          id: file.replace('.json', ''),
          alive,
        });
      } catch {
        // Skip invalid state files
      }
    }
    
    return instances;
  } catch {
    return [];
  }
}

export async function isProcessAlive(pid: number, port: number): Promise<boolean> {
  // Health check is the authoritative signal. In Codex sandboxed runs,
  // process.kill(pid, 0) can fail even when a localhost server is reachable.
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { 
      signal: AbortSignal.timeout(2000) 
    });
    if (!response.ok) return false;
  } catch {
    return false;
  }
  
  try {
    process.kill(pid, 0);
  } catch {
    // The process may be hidden from the current sandbox, but health is enough.
  }
  
  return true;
}

export async function cleanupDeadInstances(): Promise<void> {
  const instances = await listInstances();
  for (const instance of instances) {
    if (!instance.alive) {
      await removeInstance(instance.root);
    }
  }
}
