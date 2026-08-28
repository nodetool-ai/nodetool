const records = Array.from({length: 1000}, (_, i) => ({['col' + (i % 10)]: i, ['col' + ((i+1) % 10)]: i + 1, ['col' + ((i+2) % 10)]: i + 2}));
const start1 = performance.now();
for(let i = 0; i < 1000; i++) {
    [...new Set(records.flatMap((r) => Object.keys(r)))];
}
const end1 = performance.now();
console.log("flatMap Set: ", end1 - start1);

const start2 = performance.now();
for(let i = 0; i < 1000; i++) {
    const keys = new Set();
    for (let j = 0; j < records.length; j++) {
        for (const key in records[j]) {
            keys.add(key);
        }
    }
    const result = [...keys];
}
const end2 = performance.now();
console.log("for-in Set: ", end2 - start2);

const start3 = performance.now();
for(let i = 0; i < 1000; i++) {
    const keys = new Set();
    for (let j = 0; j < records.length; j++) {
        const row = records[j];
        if (row) {
             for (const key in row) {
                 if (Object.prototype.hasOwnProperty.call(row, key)) {
                     keys.add(key);
                 }
             }
        }
    }
    const result = [...keys];
}
const end3 = performance.now();
console.log("for-in hasOwn Set: ", end3 - start3);
