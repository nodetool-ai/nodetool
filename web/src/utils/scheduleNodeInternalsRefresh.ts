/**
 * React Flow caches handle positions for edges. After a node’s height changes
 * (collapse / expand), `updateNodeInternals` must run after layout has committed.
 * Double `requestAnimationFrame` alone is not always enough with React 18 + MUI;
 * we schedule an extra pass on the next macrotask so DOM measurements match.
 */
export function scheduleNodeInternalsRefresh(
  updateNodeInternals: (nodeId: string | string[]) => void,
  nodeIdOrIds: string | string[]
): void {
  const run = (): void => {
    updateNodeInternals(nodeIdOrIds);
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      run();
      setTimeout(run, 0);
      requestAnimationFrame(() => {
        run();
      });
      setTimeout(run, 24);
      setTimeout(run, 72);
      setTimeout(run, 160);
    });
  });
}
