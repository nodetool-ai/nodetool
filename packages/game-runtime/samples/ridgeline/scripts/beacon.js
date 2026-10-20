(input) => {
  const gates = __GATES__;
  const jet = world.get("jet");
  const next = jet && jet.props.fx ? jet.props.fx.gate : 0;
  const p = next < gates.length ? gates[next] : [0, -2000, 0];
  return { commands: [{ kind: "setKinematicPose", position: { x: p[0], y: p[1], z: p[2] } }] };
}
