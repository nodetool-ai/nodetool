// Register each engine context once, including the shared SQ-4 context.
// Browsers supply the confirmation text; custom beforeunload text is ignored.
const guardedContexts = new WeakSet<AudioContext>();

export function guardAudioNavigation(ctx: AudioContext, target: Window = window): void {
  if (guardedContexts.has(ctx) || ctx.state === 'closed') return;
  guardedContexts.add(ctx);

  const warn = (event: BeforeUnloadEvent) => {
    if (ctx.state !== 'running') return;
    event.preventDefault();
    event.returnValue = '';
  };
  const update = () => {
    target.removeEventListener('beforeunload', warn);
    if (ctx.state === 'running') target.addEventListener('beforeunload', warn);
    if (ctx.state === 'closed') {
      ctx.removeEventListener('statechange', update);
      guardedContexts.delete(ctx);
    }
  };
  ctx.addEventListener('statechange', update);
  update();
}
