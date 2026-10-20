(input) => {
  const jet = world.get("jet");
  const fx = jet && jet.props.fx;
  if (!fx) return { commands: [] };
  const commands = [];
  if (fx.thr > 0.9) {
    commands.push({ kind: "emitParticles", emitter: "flame", count: 4 });
    if (input.tick % 3 === 0) commands.push({ kind: "emitParticles", emitter: "diamonds", count: 3 });
  } else if (fx.thr > 0.55 && input.tick % 2 === 0) {
    commands.push({ kind: "emitParticles", emitter: "flame", count: 1 });
  }
  if (fx.thr > 0.3 && input.tick % 2 === 0) commands.push({ kind: "emitParticles", emitter: "heat", count: 1 });
  return { commands };
}
