export function observeSessionCancellation(session, signal) {
  const cancel = () => session.cancel("cancelled");
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  return () => signal?.removeEventListener("abort", cancel);
}
