export const call = (ctx, fileName, code, that, ...args) => {
    const fnHandle = ctx.unwrapResult(ctx.evalCode(code, fileName));
    try {
        const callHandle = ctx.unwrapResult(ctx.callFunction(fnHandle, that || ctx.undefined, ...args));
        fnHandle.dispose();
        return callHandle;
    }
    catch (error) {
        console.error(error);
        const e = new Error(error.message ?? 'Function call failed in serialization');
        e.cause = error;
        throw e;
    }
};
