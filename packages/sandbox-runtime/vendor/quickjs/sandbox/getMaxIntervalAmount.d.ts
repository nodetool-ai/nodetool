import type { SandboxBaseOptions } from '../index.js';
/**
 * Determines the maximum allowed amount of concurrent intervals.
 *
 * @param runtimeOptions - The sandbox options containing `maxIntervalCount`.
 * @returns The configured `maxIntervalCount` or `10` if none is set.
 */
export declare const getMaxIntervalAmount: (runtimeOptions: SandboxBaseOptions) => number;
