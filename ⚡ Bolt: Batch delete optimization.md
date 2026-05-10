# ⚡ Bolt: Batch delete optimization

**💡 What:** Replaced iterative `deleteNode(node.id)` with batched `deleteNodes(ids)` in `SelectionContextMenu.tsx`.

**🎯 Why:** Iterating `deleteNode` over multiple selected nodes triggers independent state updates per node, leading to `O(N)` cascading React component re-renders (specifically `getSelectedNodes` consumers). `deleteNodes` performs the deletion and updates state exactly once, avoiding UI stuttering and massive overhead when dealing with large group deletions.

**📊 Impact:** Massively reduces frontend state churn. Given `N` selected nodes, deleting them will now trigger `1` render phase rather than `N` render phases, resulting in O(1) state overhead relative to selection size.

**🔬 Measurement:** Select 100+ nodes, click `Delete` from the context menu, and measure the profile render graph.

**🧪 Testing:**
```bash
cd web && npm run typecheck
cd web && npx oxlint src
cd web && pnpm test -- --passWithNoTests src/hooks/nodes/__tests__/useNodeContextMenu.test.ts
```
All commands succeeded with zero issues.
