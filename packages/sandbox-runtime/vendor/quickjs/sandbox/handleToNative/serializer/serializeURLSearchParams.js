import { call } from '../../helper.js';
import { handleToNative } from '../handleToNative.js';
export const serializeURLSearchParams = (ctx, handle, rootScope) => {
    const h = new URLSearchParams();
    ctx
        .newFunction('', (value, name) => {
        const v = handleToNative(ctx, value, rootScope);
        const n = handleToNative(ctx, name, rootScope);
        h.append(n, v);
    })
        .consume(f => {
        call(ctx, 'internal/serializer/serializeUrlSearchParams.js', `(h, fn) => {
          h.forEach(fn)
        }`, undefined, handle, f).dispose();
    });
    return h;
};
