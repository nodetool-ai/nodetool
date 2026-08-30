async function mockFetch(id) {
  return new Promise(resolve => setTimeout(() => resolve({ id }), 10)); // 10ms network latency
}

async function sequential(items) {
  const start = performance.now();
  for (const item of items) {
    await mockFetch(item);
  }
  return performance.now() - start;
}

async function parallel(items) {
  const start = performance.now();
  await Promise.all(items.map(item => mockFetch(item)));
  return performance.now() - start;
}

async function run() {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const seqTime = await sequential(items);
  const parTime = await parallel(items);
  console.log(`Sequential: ${seqTime.toFixed(2)}ms`);
  console.log(`Parallel (Batched): ${parTime.toFixed(2)}ms`);
}

run();
