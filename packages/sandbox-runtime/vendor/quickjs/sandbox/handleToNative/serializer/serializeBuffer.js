import { call } from '../../helper.js';
import { handleToNative } from '../handleToNative.js';
export const serializeBuffer = (ctx, handle, rootScope) => {
    let b;
    ctx
        .newFunction('', value => {
        const v = handleToNative(ctx, value, rootScope);
        b = Buffer.from(v);
    })
        .consume(f => {
        call(ctx, 'internal/serializer/serializeBuffer.js', `(b,fn) => {
                  fn(b.buffer)
                }`, undefined, handle, f).dispose();
    });
    return b;
};
