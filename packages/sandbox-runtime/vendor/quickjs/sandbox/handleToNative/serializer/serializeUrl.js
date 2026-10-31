import { call } from '../../helper.js';
import { handleToNative } from '../handleToNative.js';
export const serializeUrl = (ctx, handle, rootScope) => {
    let d;
    ctx
        .newFunction('', value => {
        const v = handleToNative(ctx, value, rootScope);
        d = new URL(v);
    })
        .consume(f => {
        call(ctx, 'internal/serializer/serializeUrl.js', `(d,fn) => {
           fn(d.toJSON())
        }`, undefined, handle, f).dispose();
    });
    return d;
};
URLSearchParams;
