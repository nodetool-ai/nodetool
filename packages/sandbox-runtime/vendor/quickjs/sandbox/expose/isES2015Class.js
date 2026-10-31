const classRegex = new RegExp(/^class\s/);
export function isES2015Class(cls) {
    return typeof cls === 'function' && classRegex.test(Function.prototype.toString.call(cls));
}
