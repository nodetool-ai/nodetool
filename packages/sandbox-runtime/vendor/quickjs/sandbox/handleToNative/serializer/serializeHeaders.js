import { call } from '../../helper.js';
import { handleToNative } from '../handleToNative.js';
export const serializeHeaders = (ctx, handle, rootScope) => {
    const h = new Headers();
    ctx
        .newFunction('', (value, name) => {
        const v = handleToNative(ctx, value, rootScope);
        const n = handleToNative(ctx, name, rootScope);
        h.append(n, v);
    })
        .consume(f => {
        call(ctx, 'internal/serializer/serializeHeaders.js', `(h, fn) => {
          h.forEach(fn)
        }`, undefined, handle, f).dispose();
    });
    return h;
};
