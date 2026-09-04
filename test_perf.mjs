const rows = Array.from({ length: 100000 }, (_, i) => ({ a: 1, b: 2, c: 3, d: 4, e: 5 }));

console.time('flatMap');
const names1 = Array.from(new Set(rows.flatMap((row) => Object.keys(row ?? {}))));
console.timeEnd('flatMap');

console.time('manual');
const keysSet = new Set();
for (const row of rows) {
  if (!row) continue;
  for (const key of Object.keys(row)) {
    keysSet.add(key);
  }
}
const names2 = Array.from(keysSet);
console.timeEnd('manual');
