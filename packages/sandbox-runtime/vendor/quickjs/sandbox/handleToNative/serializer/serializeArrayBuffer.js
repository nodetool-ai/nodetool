export const serializeArrayBuffer = (ctx, handle, _rootScope) => {
    const b = ctx.getArrayBuffer(handle);
    return Uint8Array.from(b.value);
};
