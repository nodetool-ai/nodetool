1. **Optimize O(N*M) lookups in `useTransformActions.ts`**
   - Replace nested `document.layers.find(...)` inside loops with an O(N) backward/forward scan against a `Set` of target IDs, which is much faster than `Map` setup (avoids N temporary object allocations) and correctly implements the optimization requested without memory regressions.
2. **Optimize O(N*M) lookups in `TransformTool.ts`**
   - Same approach, replace `.find(...)` inside loops with scanning `layers` for matches in a `Set` of target IDs.
3. **Optimize O(N*M) lookups in `transformTargetSet.ts`**
   - Same approach, replace `.find(...)` inside loops with scanning `layers` against a `Set` of target IDs.
4. **Run all relevant validation commands**
   - Run `npx turbo run typecheck --filter="./web"` and `npm run test` in the `web` workspace to ensure no regressions were introduced.
5. **Request code review**
   - Submit for code review to ensure the optimization satisfies the reviewer.
6. **Submit the change**
   - Commit the changes and open a PR detailing the bottleneck and the measured O(1) lookup speedup.
