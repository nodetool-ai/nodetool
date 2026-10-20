(input) => {
  const jet = world.get("jet");
  const fx = jet && jet.props.fx;
  if (!fx) return { state: {}, commands: [] };
  const commands = [];
  // Afterburner flame and shock diamonds, a dry-thrust flicker, and heat haze.
  if (fx.thr > 0.9) {
    commands.push({ kind: "emitParticles", emitter: "flame", count: 4 });
    if (input.tick % 3 === 0) commands.push({ kind: "emitParticles", emitter: "diamonds", count: 3 });
  } else if (fx.thr > 0.55 && input.tick % 2 === 0) {
    commands.push({ kind: "emitParticles", emitter: "flame", count: 1 });
  }
  if (fx.thr > 0.3 && input.tick % 2 === 0) commands.push({ kind: "emitParticles", emitter: "heat", count: 1 });
  // Condensation behind the wing at high load, wingtip trails from moderate load.
  if (fx.spd > 90) {
    if (fx.g > 4.2) commands.push({ kind: "emitParticles", emitter: "wing", count: Math.min(8, Math.round((fx.g - 4) * 2)) });
    if (fx.g > 2.6) commands.push({ kind: "emitParticles", emitter: "tips", count: 2 });
  }
  return { state: {}, commands };
}
