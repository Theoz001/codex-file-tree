import { FastifyInstance } from 'fastify';
interface RouteOptions {
    openWithDefaultApp?: (targetPath: string) => Promise<void>;
}
export declare function registerRoutes(fastify: FastifyInstance, rootDir: string, writeToken: string, options?: RouteOptions): Promise<void>;
export {};
//# sourceMappingURL=routes.d.ts.map