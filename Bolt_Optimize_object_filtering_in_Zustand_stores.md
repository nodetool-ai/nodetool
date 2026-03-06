# ⚡ Bolt: Optimize object filtering in Zustand stores

## 💡 What
Replaced expensive `Object.entries(state).filter(...)` operations with direct `for...in` loops and shallow-copy/delete logic in Zustand stores (`ErrorStore`, `ExecutionTimeStore`, `VibeCodingStore`).

## 🎯 Why
The pattern `Object.fromEntries(Object.entries(state).filter(...))` was being used for bulk filtering or targeted key deletion. This creates intermediate arrays (`Object.entries()` creates an array of tuple arrays, `.filter()` creates another array), which is computationally expensive and generates unnecessary garbage collection overhead, particularly for stores that manage frequent updates or track large collections like errors and execution times.

## 📊 Impact
* Eliminates the creation of two intermediate arrays per call.
* Reduces execution time from O(N) memory allocations to O(1) memory allocations (modifying a pre-allocated object structure).
* Helps maintain consistent UI performance during intense graph operations when errors and execution timings are rapidly clearing/updating.

## 🔬 Measurement
The impact can be verified by profiling memory allocations in the Chrome DevTools Performance tab during bulk delete operations in `ErrorStore` and `ExecutionTimeStore` to see fewer transient arrays created by `Object.entries`.

## 🧪 Testing
Run `make typecheck`, `make lint`, and `make test` to verify that functionality remains entirely identical without typing or logical regressions.
