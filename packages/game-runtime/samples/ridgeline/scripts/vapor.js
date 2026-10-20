(input) => {
  const jet = world.get("jet");
  const fx = jet && jet.props.fx;
  if (!fx || fx.spd < 90) return { commands: [] };
  const commands = [];
  // Condensation over the wing at high load, wingtip trails from moderate load.
  if (fx.g > 4.2) commands.push({ kind: "emitParticles", emitter: "wing", count: Math.min(8, Math.round((fx.g - 4) * 2)) });
  if (fx.g > 2.6) commands.push({ kind: "emitParticles", emitter: "tips", count: 2 });
  return { commands };
}
