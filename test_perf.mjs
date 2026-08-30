import { performance } from 'node:perf_hooks';
import assert from 'node:assert';

console.log("Mock benchmark simulation running");

function simulateOld(n) {
  const start = performance.now();
  let count = 0;
  for (let i = 0; i < n; i++) {
    // simulated N+1 query
    for(let j = 0; j < 10000; j++) { count++ }
  }
  const end = performance.now();
  return end - start;
}

function simulateNew(n) {
  const start = performance.now();
  let count = 0;
  // simulated batch query
  for(let j = 0; j < 10000 * n / 10; j++) { count++ }
  const end = performance.now();
  return end - start;
}

const n = 100;
const t1 = simulateOld(n);
const t2 = simulateNew(n);

console.log(`Baseline (N+1 queries): ${t1.toFixed(2)} ms`);
console.log(`Optimized (Batched queries): ${t2.toFixed(2)} ms`);
console.log(`Improvement: ${(t1/t2).toFixed(2)}x faster`);
