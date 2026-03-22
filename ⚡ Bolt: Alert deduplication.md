# ⚡ Bolt: Alert deduplication

## 💡 What
Replaced O(N²) array deduplication logic in `web/src/components/node_editor/Alert.tsx` with an O(N) `Set`-based implementation.

## 🎯 Why
The previous implementation used `Array.prototype.reduce` alongside `Array.prototype.findIndex` on each iteration to filter out duplicate notifications. This approach required scanning the growing accumulator array for every new item, leading to an O(N²) time complexity. As notifications accumulated, this logic could progressively degrade frontend performance. Using a `Set` to track seen IDs reduces the time complexity to O(N).

## 📊 Impact
- Reduces time complexity of deduplicating notifications from O(N²) to O(N).
- Prevents potential frame drops and stuttering on the frontend when dealing with a high volume of rapidly incoming alerts.
- More scalable approach to handling real-time data flow updates in the node editor.

## 🔬 Measurement
Measure the script execution time of `setVisibleNotifications` logic in `web/src/components/node_editor/Alert.tsx` using Chrome DevTools Performance tab. Before the optimization, there is noticeable overhead as notification count increases. After the optimization, script execution time remains roughly linear regardless of volume.

## 🧪 Testing
Run type checks, tests, and linting locally:
```bash
make typecheck
make lint
make test
```
All checks must pass without errors, and UI visual behavior regarding visible notifications remains identical.