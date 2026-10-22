(input) => {
  const state = input.state || { values: {}, phase: "", feedback: "", feedbackUntil: 0 };
  const commands = [];
  const player = world.get("racer-0");
  const race = player && player.props.race;
  if (!race) { return { state, commands }; }
  const update = (id, field, value) => {
    const key = id + ":" + field;
    if (state.values[key] !== value) {
      state.values[key] = value;
      commands.push({ kind: "ui", id, [field]: value });
    }
  };
  const formatTime = seconds => {
    const tenths = Math.floor(seconds * 10);
    const minutes = Math.floor(tenths / 600);
    return minutes + ":" + ((tenths % 600) / 10).toFixed(1).padStart(4, "0");
  };
  const showRace = race.phase === "racing" || race.phase === "countdown" || race.phase === "paused";
  update("title", "visible", race.phase === "title");
  update("race-root", "visible", showRace);
  update("countdown-panel", "visible", race.phase === "countdown");
  update("pause", "visible", race.phase === "paused");
  update("results", "visible", race.phase === "finished");
  if (race.phase === "countdown") { update("countdown", "text", race.countdown > 0 ? String(Math.ceil(race.countdown)) : "GO!"); }
  if (state.phase !== race.phase) {
    if (race.phase === "racing" && state.phase === "countdown") {
      state.feedback = "GO!";
      state.feedbackUntil = input.tick + 75;
    } else if (race.phase === "title" || race.phase === "countdown") {
      state.feedback = "";
      state.feedbackUntil = 0;
    }
    if (race.phase === "finished") {
      const rank = Math.max(1, Math.min(6, race.position));
      update("results-title", "text", rank === 1 ? "COASTLINE CHAMPION" : rank <= 3 ? "PODIUM FINISH" : "RACE COMPLETE");
      update("results-time", "text", "P" + rank + "  /  6     •     " + formatTime(race.time) + "     •     3 LAPS");
      for (let i = 0; i < 6; i += 1) { update("result-" + i, "text", race.results[i] || ""); }
    }
    state.phase = race.phase;
  }
  for (const event of input.events) {
    if (event.kind !== "trigger") { continue; }
    const labels = { boost: "TURBO BOOST", pickup: "ITEM READY", item: "ITEM DEPLOYED", hit: "HIT! KEEP RACING", lap: race.lap >= 3 ? "FINAL LAP" : "LAP " + race.lap, drift: "DRIFTING" };
    if (labels[event.event]) {
      state.feedback = labels[event.event];
      state.feedbackUntil = input.tick + (event.event === "lap" ? 120 : 65);
    }
  }
  if (input.tick % 15 !== 3 && commands.length === 0) { return { state, commands }; }
  if (showRace) {
    const rank = Math.max(1, Math.min(6, race.position));
    update("rank", "text", String(rank));
    update("rank-suffix", "text", ["", "ST", "ND", "RD", "TH", "TH", "TH"][rank]);
    update("lap", "text", Math.min(3, race.lap) + " / 3");
    update("time", "text", formatTime(race.time));
    update("speed", "text", String(Math.round(race.speed)));
    update("speed-bar", "value", Math.min(1, race.speed / 180));
    update("item", "text", race.item ? race.item.toUpperCase() : "—");
    update("item-help", "text", race.item ? "SPACE / E TO USE" : "DRIVE THROUGH A CRATE");
    update("drift-bar", "value", Math.round(race.drift * 20) / 20);
    update("boost-bar", "value", Math.round(race.boost * 20) / 20);
    update("charge-label", "text", race.boost > 0 ? "TURBO ACTIVE" : race.drift >= 0.35 ? "RELEASE SHIFT FOR TURBO" : race.drift > 0 ? "KEEP DRIFTING TO CHARGE" : "HOLD SHIFT + STEER TO DRIFT");
    update("feedback", "text", input.tick < state.feedbackUntil && race.phase === "racing" ? state.feedback : "");
    update("offroad", "text", race.offroad ? "OFF TRACK  •  R TO RECOVER" : race.shield > 0 ? "SHIELD ACTIVE" : "");
  }
  const map = __MINIMAP__;
  const scale = __HUD_SCALE__;
  const colors = __RACER_COLORS__;
  for (let i = 5; i >= 0; i -= 1) {
    const id = "racer-map-" + i;
    const racer = showRace && race.phase !== "paused" ? (i === 0 ? player : world.get("racer-" + i)) : null;
    const x = racer ? Math.round(map.x + (racer.position.x - map.minX) * map.scale) : 0;
    const y = racer ? Math.round(map.y + (racer.position.z - map.minZ) * map.scale) : 0;
    const key = racer ? x + ":" + y : "hidden";
    if (state.values[id] !== key) {
      state.values[id] = key;
      commands.push({ kind: "hud", id, text: racer ? "●" : "", x: (x - (i === 0 ? 7 : 5)) * scale, y: (y - (i === 0 ? 7 : 5)) * scale, size: (i === 0 ? 16 : 12) * scale, color: colors[i], fontId: "font-ui" });
    }
  }
  return { state, commands };
}
