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
export declare function saveInstance(root: string, port: number, pid: number): Promise<void>;
export declare function getInstance(root: string): Promise<InstanceState | null>;
export declare function removeInstance(root: string): Promise<void>;
export declare function listInstances(): Promise<InstanceWithStatus[]>;
export declare function isProcessAlive(pid: number, port: number, expectedRoot?: string): Promise<boolean>;
export declare function cleanupDeadInstances(): Promise<void>;
export {};
//# sourceMappingURL=process-manager.d.ts.map