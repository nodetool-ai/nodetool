const pendingHostPromises = new WeakMap();
export const registerPendingHostPromise = (ctx, promise) => {
    const current = pendingHostPromises.get(ctx);
    if (current) {
        current.add(promise);
        return;
    }
    pendingHostPromises.set(ctx, new Set([promise]));
};
export const unregisterPendingHostPromise = (ctx, promise) => {
    const current = pendingHostPromises.get(ctx);
    if (!current) {
        return;
    }
    current.delete(promise);
    if (current.size === 0) {
        pendingHostPromises.delete(ctx);
    }
};
export const rejectAndFlushPendingHostPromises = async (ctx, message = 'Sandbox timed out before async host call finished.', maxWaitMs = 100) => {
    const current = pendingHostPromises.get(ctx);
    if (!current || current.size === 0) {
        return;
    }
    const pending = Array.from(current);
    for (const deferred of pending) {
        try {
            const errHandle = ctx.newError(new Error(message));
            deferred.reject(errHandle);
            errHandle.dispose();
        }
        catch {
            // ignore rejected/dead deferred or context teardown race
        }
    }
    await Promise.race([
        Promise.allSettled(pending.map(p => p.settled)),
        new Promise(resolve => setTimeout(resolve, maxWaitMs)),
    ]);
};
