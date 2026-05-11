export declare function getRequestedProjectSlug(url: string): string | null;
export declare function resolveProjectRedirect(requestUrl: string, rootDir: string, port: number): Promise<string | null>;
interface ServerOptions {
    openWithDefaultApp?: (targetPath: string) => Promise<void>;
}
export declare function createServer(rootDir: string, port: number, clientDist?: string, options?: ServerOptions): Promise<import("fastify").FastifyInstance<import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>>;
export declare function startServer(rootDir: string, port: number): Promise<import("fastify").FastifyInstance<import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>>;
export {};
//# sourceMappingURL=server.d.ts.map