import { trpcClient } from "./src/trpc/client";
async function run() {
  const startSeq = performance.now();
  for (let i = 0; i < 5; i++) {
    try {
      await trpcClient.storyboards.get.query({ id: `item_${i}` });
    } catch (e) {}
  }
  const endSeq = performance.now();

  const startPar = performance.now();
  await Promise.all([0, 1, 2, 3, 4].map(async (i) => {
    try {
      await trpcClient.storyboards.get.query({ id: `item_${i}` });
    } catch (e) {}
  }));
  const endPar = performance.now();

  console.log(`Sequential: ${(endSeq - startSeq).toFixed(2)}ms`);
  console.log(`Parallel (Batched): ${(endPar - startPar).toFixed(2)}ms`);
}
run();
