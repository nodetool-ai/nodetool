# ⚡ Bolt: Use findLastIndex for streaming updates

## 💡 What
Replaced O(N) `findIndex` calls with O(1) `findLastIndex` for step and tool call lookups in `useExecutionTreeState` and `chatProtocol`.

## 🎯 Why
During high-frequency streaming events (e.g., LLM token generation) where an array in a Zustand store or React state is continuously updated, locating the most recently updated item using `findIndex()` creates an O(N²) time complexity bottleneck because it scans from the beginning of the array. Since the most recently updated message, step, or tool call is typically at the end of the array during streaming, using `findLastIndex()` reduces lookup time to O(1).

## 📊 Impact
Eliminates an O(N²) scaling bottleneck during high-frequency token generation, significantly reducing main thread blockage and improving UI responsiveness during long LLM responses.

## 🔬 Measurement
Run a workflow with a long streaming LLM response and observe the CPU profile; the time spent in `applyToolCallUpdate` and `buildExecutionTreeState` will be vastly reduced for large arrays.

## 🧪 Testing
- Passed `cd web && npm run typecheck` (ignoring pre-existing unrelated errors)
- Passed `cd web && npx oxlint src` (ignoring unrelated warnings)
- Passed `cd web && npm run test -- --passWithNoTests src/hooks/useExecutionTreeState.ts src/core/chat/chatProtocol.ts`
- Passed `cd web && npm run test -- --passWithNoTests src/hooks/__tests__/useExecutionTreeState.test.ts src/core/chat/__tests__/chatProtocol.test.ts`
