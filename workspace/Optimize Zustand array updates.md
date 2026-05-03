# ⚡ Bolt: Optimize Zustand array updates

## 💡 What
Replaced full array iterations (`.map()`, `.find()`, `.filter()`) with optimized operations (`.findIndex()` + shallow copies + `.splice()`) inside `NodeStore` (`updateNode`, `toggleBypass`, `setBypass`) and `MiniAppsStore` (`upsertResult`).

## 🎯 Why
When dealing with updates to a single known item inside a Zustand array state, methods like `.map()` iterate over the entire array and allocate memory for a new array with potentially unnecessary execution of callback functions. In stores handling high-frequency events or large data structures like nodes/results, this O(N) traversal creates an inefficient bottleneck.

## 📊 Impact
- Reduces time complexity overhead from iterating the whole array N times to 1 time (just `.findIndex()`), significantly reducing callback allocations.
- Reduces array traversals in complex actions like `updateNode` (from 4 array loops down to just 2).
- Ensures smooth state updates during React flow interactions and workflow executions.

## 🔬 Measurement
Run the application and interact with nodes (moving, bypassing, etc) and mini-app executions. Look for fewer frame drops and more responsive UI under heavy load.

## 🧪 Testing
Executed:
- `cd web && pnpm test --passWithNoTests src/stores`
- `cd web && npm run typecheck`
- `cd web && npx oxlint src`
All tests passed and no regressions found in the stores.
