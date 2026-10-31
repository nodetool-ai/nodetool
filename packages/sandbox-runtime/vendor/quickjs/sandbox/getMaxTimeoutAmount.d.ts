import type { SandboxBaseOptions } from '../index.js';
/**
 * Determines the maximum allowed amount of concurrent timeouts.
 *
 * @param runtimeOptions - The sandbox options containing `maxTimeoutCount`.
 * @returns The configured `maxTimeoutCount` or `10` if none is set.
 */
export declare const getMaxTimeoutAmount: (runtimeOptions: SandboxBaseOptions) => number;
