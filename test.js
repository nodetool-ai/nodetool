const records = [{a: 1}, {b: 2}, {c: 3, a: 4}];
const start1 = performance.now();
for(let i = 0; i < 10000; i++) {
    [...new Set(records.flatMap((r) => Object.keys(r)))];
}
const end1 = performance.now();
console.log("flatMap Set: ", end1 - start1);

const start2 = performance.now();
for(let i = 0; i < 10000; i++) {
    const keys = new Set();
    for (const r of records) {
        for (const key in r) {
            keys.add(key);
        }
    }
    const result = [...keys];
}
const end2 = performance.now();
console.log("for-in Set: ", end2 - start2);
