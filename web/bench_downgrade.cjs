async function bench() {
  const boards = Array.from({ length: 50 }, (_, i) => ({ id: i }));

  // N+1 serial
  const startSerial = Date.now();
  for (const item of boards) {
    await new Promise(r => setTimeout(r, 10)); // simulate fetch
    // simulate work
  }
  const endSerial = Date.now();

  // Parallel map
  const startParallel = Date.now();
  await Promise.all(boards.map(async (item) => {
    await new Promise(r => setTimeout(r, 10)); // simulate fetch
    // simulate work
  }));
  const endParallel = Date.now();

  console.log(`Serial: ${endSerial - startSerial}ms`);
  console.log(`Parallel: ${endParallel - startParallel}ms`);
}
bench();
