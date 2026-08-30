const { performance } = require('perf_hooks');

async function benchmark() {
  const start = performance.now();

  // mock addShot.execute
  const addShot = {
    execute: async ({action}) => {
      // Simulate DB delay
      await new Promise(r => setTimeout(r, 10));
      return { shot: { id: 'shot_' + Math.random().toString(36).substring(7) } };
    }
  };

  const derived = {
    shots: Array.from({length: 50}, (_, i) => ({ text: 'action ' + i, scriptLineIds: ['line_' + i] }))
  };

  const scriptLineIdsByShotId = new Map();
  const placed = [];

  const promises = derived.shots.map(async (scaffold) => {
    const action = scaffold.text;
    const result = await addShot.execute({ action });
    return { result, scaffold, action };
  });

  const results = await Promise.all(promises);

  for (const { result, scaffold, action } of results) {
    scriptLineIdsByShotId.set(result.shot.id, scaffold.scriptLineIds);
    placed.push({
      id: result.shot.id,
      scriptLineIds: scaffold.scriptLineIds,
      action
    });
  }

  const end = performance.now();
  console.log(`Batched version: ${end - start} ms`);
}

benchmark();
