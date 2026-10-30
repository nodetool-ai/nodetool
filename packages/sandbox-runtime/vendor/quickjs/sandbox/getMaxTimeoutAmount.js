/**
 * Determines the maximum allowed amount of concurrent timeouts.
 *
 * @param runtimeOptions - The sandbox options containing `maxTimeoutCount`.
 * @returns The configured `maxTimeoutCount` or `10` if none is set.
 */
export const getMaxTimeoutAmount = (runtimeOptions) => {
    if (!runtimeOptions.maxTimeoutCount || runtimeOptions.maxTimeoutCount <= 0) {
        return 10;
    }
    return runtimeOptions.maxTimeoutCount;
};
