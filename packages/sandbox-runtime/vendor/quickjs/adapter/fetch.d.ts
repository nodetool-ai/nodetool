import type { IFs } from 'memfs';
declare const HEADERS_MARKER = "__quickjsHeadersObject__";
/**
 * Options for creating the default fetch adapter
 */
export type GetFetchAdapterOptions = {
    /**
     * The virtual file system of the sandbox (excludes node_modules)
     */
    fs?: IFs;
    /**
     * List of allowed hosts. If set, only these hosts are allowed to call
     */
    allowedHosts?: string[];
    /**
     * List of allowed protocols. If set, only these protocols are allowed to call
     */
    allowedProtocols?: string[];
    /**
     * List of disallowed hosts. If set, these hosts are not allowed to call
     * @default ['localhost', '127.0.0.1']
     */
    disallowedHosts?: string[];
    /**
     * Timeout for fetch requests in milliseconds
     * @default 5000
     */
    timeout?: number;
    /**
     * Flag to enable CORS policy check
     * @default false
     */
    corsCheck?: boolean;
    /**
     * List of allowed CORS origins
     * @default ['*']
     */
    allowedCorsOrigins?: string[];
    /**
     * Number of requests allowed in the specified duration
     * @default 10
     */
    rateLimitPoints?: number;
    /**
     * Duration in seconds for the rate limit
     * @default 1
     */
    rateLimitDuration?: number;
};
/**
 * Create a default fetch adapter
 * @param adapterOptions Options for creating the fetch adapter
 * @returns A fetch adapter function
 */
export declare const getDefaultFetchAdapter: (adapterOptions?: GetFetchAdapterOptions) => typeof fetch;
export { HEADERS_MARKER };
