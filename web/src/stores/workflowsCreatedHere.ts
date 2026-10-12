/**
 * Workflows this page created itself. Every create path in the app opens its
 * own surface for the new row (an editor tab, or a guided flow's tab), so the
 * `created` event the server echoes back must not open a second tab for it.
 */
const createdHere = new Set<string>();

export function noteWorkflowCreatedHere(id: string): void {
  createdHere.add(id);
}

export function wasWorkflowCreatedHere(id: string): boolean {
  return createdHere.has(id);
}
