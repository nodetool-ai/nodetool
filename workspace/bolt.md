## 2024-05-18 - Parallelize AudioBuffer Loading

**Learning:** When loading multiple independent audio buffers over the network within a loop, using `await` sequentially creates a performance bottleneck proportional to the number of buffers.
**Action:** Always map the independent network requests to an array of Promises and resolve them concurrently using `Promise.all` before executing the sequential synchronous operations.
