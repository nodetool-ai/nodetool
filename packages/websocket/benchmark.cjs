const assert = require('assert');

async function mockLoadBundledWorkflow(id, userId) {
  // simulate some I/O delay
  return new Promise(resolve => setTimeout(() => resolve({ id, name: "test", userId }), 50));
}

async function sequential(ids, userId) {
  const start = Date.now();
  const workflows = [];
  for (const id of ids) {
    const loaded = await mockLoadBundledWorkflow(id, userId);
    if ("error" in loaded) {
      return loaded.error;
    }
    workflows.push(loaded);
  }
  const end = Date.now();
  return end - start;
}

async function concurrent(ids, userId) {
  const start = Date.now();
  const workflows = [];
  const loadedResults = await Promise.all(ids.map(id => mockLoadBundledWorkflow(id, userId)));
  for (const loaded of loadedResults) {
    if ("error" in loaded) {
      return loaded.error;
    }
    workflows.push(loaded);
  }
  const end = Date.now();
  return end - start;
}

async function run() {
  const ids = Array.from({length: 10}, (_, i) => i);
  const tSeq = await sequential(ids, "user1");
  const tCon = await concurrent(ids, "user1");
  console.log(`Sequential: ${tSeq}ms`);
  console.log(`Concurrent: ${tCon}ms`);
}

run();
