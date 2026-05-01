# ⚡ Bolt: Optimize Zustand array updates

## 💡 What
Replaced full-array `.map()` iterations with `findIndex` and shallow index assignments (`const newArr = [...arr]; newArr[idx] = val;`) when updating a single, known element in Zustand state arrays.

This was applied to:
- `WorkflowManagerStore.ts` (for updating `openWorkflows`)
- `ColorPickerStore.ts` (for updating `swatches` and `palettes`)
- `RemoteSettingStore.ts` (for updating `settings`)

## 🎯 Why
When updating a single known element in a state array, using `.map()` iterates over the entire array, creating unnecessary callback allocations and incurring full-array traversal overhead. This introduces an O(N) time complexity bottleneck on the main thread for simple targeted updates. Using `.findIndex()` + shallow copy restricts the O(N) cost to just the search phase, and avoids memory allocations and loop overhead for elements that haven't changed.

## 📊 Impact
Reduces execution time for targeted array updates. Instead of iterating over all N elements and evaluating a condition and spreading values, it only iterates up to the modified element (on average N/2), updates a single index, and bypasses the rest of the array iteration.

## 🔬 Measurement
This can be verified by observing reduced main-thread blocking time in Chrome DevTools Performance tab when frequently triggering updates to swatches, remote settings, or workflow state.

## 🧪 Testing
- `make typecheck`
- `make lint`
- `make test`