import { call } from '../../helper.js';
import { handleToNative } from '../handleToNative.js';
export const serializeSet = (ctx, handle, rootScope) => {
    const s = new Set();
    ctx
        .newFunction('', value => {
        const v = handleToNative(ctx, value, rootScope);
        s.add(v);
    })
        .consume(f => {
        call(ctx, 'internal/serializer/serializeSet.js', `(s,fn) => {
            s.forEach(fn)
          }`, undefined, handle, f).dispose();
    });
    return s;
};
