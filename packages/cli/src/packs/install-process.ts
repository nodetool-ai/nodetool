let refusingContext: string | undefined;

/** Server entry points permanently disable installation in their process. */
export function refusePackInstallsInProcess(context: string): void {
  refusingContext ??= context;
}
export function assertPackInstallProcessAllowed(): void {
  if (refusingContext) { throw new Error(`Node pack installation is disabled in ${refusingContext} processes`); }
}
