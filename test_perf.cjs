const { performance } = require('perf_hooks');

const R = 5000;
const C = 100;

const rows = Array.from({ length: R }, () => Array.from({ length: C }, (_, i) => `val${i}`));
const dataframeColumns = Array.from({ length: C }, (_, i) => ({ name: `col${i}`, data_type: 'string' }));

const columnMapping = new Map();
for (let i = 0; i < C; i++) {
  columnMapping.set(i, i);
}

const dfToPasteIdx = new Map();
for (let i = 0; i < C; i++) {
  dfToPasteIdx.set(i, i);
}

function isString(val) {
  return typeof val === 'string';
}

function before() {
  const start = performance.now();
  const newRows = rows.map((row) => {
    const newRow = { rownum: 0 };
    dataframeColumns.forEach((col, dfIdx) => {
      let value = "";
      for (const [pasteIdx, mappedDfIdx] of columnMapping.entries()) {
        if (mappedDfIdx === dfIdx) {
          value = row[pasteIdx] ?? "";
          if (isString(value)) {
            value = value.replace(/^"|"$/g, "");
          }
          break;
        }
      }
      newRow[col.name] = value;
    });
    return newRow;
  });
  return performance.now() - start;
}

function after() {
  const start = performance.now();
  const newRows = rows.map((row) => {
    const newRow = { rownum: 0 };
    dataframeColumns.forEach((col, dfIdx) => {
      let value = "";
      const pasteIdx = dfToPasteIdx.get(dfIdx);
      if (pasteIdx !== undefined) {
        value = row[pasteIdx] ?? "";
        if (isString(value)) {
          value = value.replace(/^"|"$/g, "");
        }
      }
      newRow[col.name] = value;
    });
    return newRow;
  });
  return performance.now() - start;
}

console.log('Before:', before(), 'ms');
console.log('After:', after(), 'ms');
