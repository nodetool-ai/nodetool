import { call } from '../../helper.js';
import { handleToNative } from '../handleToNative.js';
export const serializeError = (ctx, handle, rootScope) => {
    const d = new Error();
    ctx
        .newFunction('serializeError', (value, name) => {
        const v = handleToNative(ctx, value, rootScope);
        const n = handleToNative(ctx, name, rootScope);
        Object.defineProperties(d, v);
        d.name = n;
    })
        .consume(f => {
        call(ctx, 'internal/serializer/serializeError.js', `(d,fn) => {
          fn(Object.getOwnPropertyDescriptors(d),d.name)
        }`, undefined, handle, f).dispose();
    });
    return d;
};
