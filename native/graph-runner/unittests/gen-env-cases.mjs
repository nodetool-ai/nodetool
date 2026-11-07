// Expressions the environment tests evaluate in the guest, with the values
// Node prints for them. Regenerate the table with
//   node unittests/gen-env-cases.mjs > unittests/env_cases.inc
// using the Node version in .nvmrc, with the local time zone of the machine
// that runs the tests (only date construction from local fields is used, so
// any zone gives the same strings).
const intl = [
  "new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(1234567.5)",
  "new Intl.NumberFormat().format(1234567.891)",
  "new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(1.005)",
  "new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(-2.5)",
  "new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(1)",
  "new Intl.NumberFormat('en-US', { minimumFractionDigits: 10 }).format(5e-7)",
  "new Intl.NumberFormat().format(-0)",
  "new Intl.NumberFormat().format(-0.0001)",
  "new Intl.NumberFormat().format(NaN)",
  "new Intl.NumberFormat().format(-Infinity)",
  "new Intl.NumberFormat().format(1e21)",
  "new Intl.NumberFormat().format(1.5e25)",
  "new Intl.NumberFormat().format(123456789012345678901234567890n)",
  "new Intl.NumberFormat().format('1.0005')",
  "new Intl.NumberFormat().format(' 12 ')",
  "new Intl.NumberFormat().format('0x1F')",
  "new Intl.NumberFormat().format('abc')",
  "new Intl.NumberFormat().format()",
  "new Intl.NumberFormat().format(0.1 + 0.2)",
  "new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 }).format(0.1 + 0.2)",
  "new Intl.NumberFormat('en-US', { useGrouping: false }).format(12345.6)",
  "new Intl.NumberFormat('en-US', { useGrouping: 'min2' }).format(1234)",
  "new Intl.NumberFormat('en-US', { useGrouping: 'min2' }).format(12345)",
  "new Intl.NumberFormat('en-US', { minimumIntegerDigits: 3 }).format(5.5)",
  "new Intl.NumberFormat('en-US', { maximumFractionDigits: 2.9 }).format(1.236)",
  "new Intl.NumberFormat('en-US', { style: 'percent' }).format(0.256)",
  "new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(0.12345)",
  "new Intl.NumberFormat('en-US', { style: 'percent' }).format(-0.5)",
  "Intl.NumberFormat('EN-us').format(9999.9999)",
  "JSON.stringify(new Intl.NumberFormat('en-US').formatToParts(-1234.5))",
  "JSON.stringify(new Intl.NumberFormat('en-US', { style: 'percent' }).resolvedOptions())",
  "JSON.stringify(new Intl.NumberFormat('en', { minimumFractionDigits: 4 }).resolvedOptions())",
  "JSON.stringify(Intl.NumberFormat.supportedLocalesOf(['en-US', 'en']))",
  "[1000, 2.5].map(new Intl.NumberFormat().format).join('|')",
  "Object.prototype.toString.call(new Intl.NumberFormat())",
  "(1234.5678).toLocaleString()",
  "(1234.5678).toLocaleString('en-US', { maximumFractionDigits: 1 })",
  "(12345n).toLocaleString()",
  "new Date(2026, 0, 2, 15, 4, 5).toLocaleString()",
  "new Date(2026, 10, 12, 0, 30, 0).toLocaleString('en-US')",
  "new Date(2026, 0, 2, 15, 4, 5).toLocaleDateString()",
  "new Date(2026, 0, 2, 12, 4, 5).toLocaleTimeString()",
  "new Date(NaN).toLocaleString()",
];
// Errors: the expression must throw. Node's own error name is recorded.
const intlErrors = [
  ["new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 1 })", "RangeError"],
  ["new Intl.NumberFormat('en', { maximumFractionDigits: 101 })", "RangeError"],
  ["new Intl.NumberFormat('en', { style: 'bogus' })", "RangeError"],
  ["new Intl.NumberFormat('en_US')", "RangeError"],
  ["new Intl.NumberFormat('en', { currency: 'US' })", "RangeError"],
];
// Refusals: Node formats these; the guest throws IntlUnsupportedError.
const intlRefusals = [
  "new Intl.NumberFormat('de-DE').format(1234.5)",
  "new Intl.NumberFormat(['fr', 'en']).format(1)",
  "new Intl.NumberFormat('en-GB').format(1)",
  "new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(1)",
  "new Intl.NumberFormat('en', { style: 'unit', unit: 'meter' }).format(1)",
  "new Intl.NumberFormat('en', { notation: 'compact' }).format(1234)",
  "new Intl.NumberFormat('en', { maximumSignificantDigits: 3 }).format(1234)",
  "new Intl.NumberFormat('en', { signDisplay: 'always' }).format(1)",
  "new Intl.NumberFormat('en', { roundingMode: 'floor' }).format(1.5)",
  "new Intl.NumberFormat('en', { numberingSystem: 'arab' }).format(1)",
  "(1234.5).toLocaleString('de')",
  "new Date(0).toLocaleString('en-US', { timeZone: 'UTC' })",
  "new Date(0).toLocaleDateString('ja')",
  "new Intl.NumberFormat().formatRange(1, 2)",
];
const clones = [
  "JSON.stringify(structuredClone({ a: [1, { b: 2 }], c: 'x', d: null }))",
  "(() => { const o = { n: 1 }; o.self = o; const c = structuredClone(o); return c !== o && c.self === c; })()",
  "(() => { class A { constructor() { this.x = 1; } get y() { return 2; } } const c = structuredClone(new A()); return Object.getPrototypeOf(c) === Object.prototype && JSON.stringify(c); })()",
  "(() => { const d = structuredClone(new Date(5)); return d instanceof Date && d.getTime(); })()",
  "(() => { const m = structuredClone(new Map([[1, { a: 2 }], ['k', new Set([3])]])); return m instanceof Map && m.get(1).a + ':' + [...m.get('k')].join(); })()",
  "(() => { const u = new Uint8Array([1, 2, 3, 4]); const c = structuredClone({ a: u, b: u.subarray(1, 3) }); return c.a !== u && c.a.buffer === c.b.buffer && c.b.byteOffset + ':' + Array.from(c.b).join(); })()",
  "(() => { const r = /a+/gi; r.lastIndex = 3; const c = structuredClone(r); return c !== r && c.source + c.flags + c.lastIndex; })()",
  "(() => { const e = structuredClone(new RangeError('r', { cause: 'c' })); return e instanceof RangeError && e.name + ':' + e.message + ':' + e.cause; })()",
  "(() => { const a = [1, , 3]; a.extra = 'x'; const c = structuredClone(a); return Array.isArray(c) && (1 in c) + ':' + Object.keys(c).join(); })()",
  "(() => { const b = new ArrayBuffer(8); const c = structuredClone(b, { transfer: [b] }); return b.byteLength + ':' + c.byteLength; })()",
  "(() => { const n = structuredClone(Object(3n)); return typeof n + ':' + (n.valueOf() === 3n); })()",
  "(() => { const c = structuredClone(JSON.parse('{\"__proto__\":{\"x\":1}}')); return Object.hasOwn(c, '__proto__') + ':' + (Object.getPrototypeOf(c) === Object.prototype); })()",
  "(() => { let n = 0; const b = new ArrayBuffer(2); const c = structuredClone({ get x() { return ++n; }, b }, { transfer: [b] }); return n + ':' + c.x + ':' + b.byteLength + ':' + c.b.byteLength; })()",
];
const cloneErrors = [
  "structuredClone(() => 1)",
  "structuredClone({ s: Symbol('q') })",
  "structuredClone(new WeakMap())",
  "structuredClone(Promise.resolve())",
  "structuredClone((function* () {})())",
];

const q = (s) => JSON.stringify(s);
const out = [];
out.push("// Generated by unittests/gen-env-cases.mjs with Node " + process.version + ". Do not edit.");
out.push("const std::vector<std::pair<std::string, std::string>> kIntlCases = {");
for (const x of intl) out.push(`    {${q(x)}, ${q(String(eval(x)))}},`);
out.push("};");
out.push("const std::vector<std::pair<std::string, std::string>> kIntlErrors = {");
for (const [x, name] of intlErrors) { let got; try { eval(x); got = "no error"; } catch (err) { got = err.name; } if (got !== name) throw new Error(x + " " + got); out.push(`    {${q(x)}, ${q(name)}},`); }
out.push("};");
out.push("const std::vector<std::string> kIntlRefusals = {");
for (const x of intlRefusals) { eval(x); out.push(`    ${q(x)},`); }
out.push("};");
out.push("const std::vector<std::pair<std::string, std::string>> kCloneCases = {");
for (const x of clones) out.push(`    {${q(x)}, ${q(String(eval(x)))}},`);
out.push("};");
out.push("const std::vector<std::string> kCloneErrors = {");
for (const x of cloneErrors) { let name; try { eval(x); } catch (err) { name = err.name; } if (name !== "DataCloneError") throw new Error(x); out.push(`    ${q(x)},`); }
out.push("};");
console.log(out.join("\n"));
