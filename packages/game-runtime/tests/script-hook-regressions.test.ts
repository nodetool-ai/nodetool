import { describe, expect, it } from "vitest";
import { gameDocument, gameDocument3D, gameInputFrame3D, type GameEvent } from "@nodetool-ai/protocol";
import { createScriptedGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { blockout } from "./fixtures-game3d.js";

const script = (source: string) => ({ kind: "script", source, maxCommands: 8, maxTickMs: 50 });
const input = { pressed: [] };
const emitted = (events: readonly GameEvent[]) => events.flatMap((event) => event.kind === "trigger" ? [event.event] : []);
const destroy = `({
  onUpdate(input) { return { commands: input.tick === 0 ? [{kind:'setProp',key:'loot',value:'coin'}] : input.tick === 1 ? [{kind:'despawn',entityId:input.entity.id}] : [] }; },
  onDestroy(input) { return { commands: [{kind:'emit',event:'loot:' + input.entity.props.loot},
    {kind:'emit',event:'survivor:' + !!world.get('gem')}] }; }
})`;

describe("script lifecycle regressions", () => {
  it("keeps final authored properties and the query world in a destruction-only 2D batch", async () => {
    const base = createTopDownRoomGame("hooks");
    const document = gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene) => ({ ...scene,
      entities: scene.entities.map((entity) => ({ ...entity, behaviors: entity.id === "player" ? [script(destroy)] : [] })) })) });
    const session = await createScriptedGameSession(document, 1);
    try {
      session.step(input); session.step(input);
      expect(emitted(session.step(input).events)).toEqual(expect.arrayContaining(["loot:coin", "survivor:true"]));
    } finally { session.dispose(); }
  });

  it("restores a removed spawned 2D instance's final properties for onDestroy", async () => {
    const base = createTopDownRoomGame("hooks");
    const source = `({ onUpdate(input) { return {commands: input.tick === 1 ? [{kind:'setProp',key:'loot',value:'coin'}] : [{kind:'despawn',entityId:input.entity.id}]}; },
      onDestroy(input) { return {commands:[{kind:'emit',event:'loot:' + input.entity.props.loot}]}; } })`;
    const document = gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene) => ({ ...scene,
      entities: [...scene.entities.map((entity) => ({ ...entity, behaviors: [] })),
        { id: "enemy", templateOnly: true, transform2d: { x: -3, y: 2 }, props: { loot: "initial" }, behaviors: [script(source)] },
        { id: "launcher", transform2d: { x: -3, y: 2 }, behaviors: [script("input => ({state:null,commands:input.tick === 0 ? [{kind:'spawn',prefabId:'enemy'}] : []})")] }
      ] })) });
    const session = await createScriptedGameSession(document, 1);
    try {
      session.step(input); session.step(input); session.step(input);
      const restored = await createScriptedGameSession(document, 1, JSON.parse(JSON.stringify(session.snapshot())));
      try { expect(emitted(restored.step(input).events)).toContain("loot:coin"); } finally { restored.dispose(); }
    } finally { session.dispose(); }
  });

  it("preserves authored 3D properties for onDestroy", async () => {
    const base = blockout();
    const source = `({ onUpdate(input) {return {commands:input.tick === 0 ? [{kind:'setProp',key:'loot',value:'coin'}] : [{kind:'despawn',entityId:input.entity.id}]};},
      onDestroy(input) {return {commands:[{kind:'emit',event:'loot:' + input.entity.props.loot}]};} })`;
    const document = gameDocument3D.parse({ ...base, scenes: [{ ...base.scenes[0], entities: [...base.scenes[0]!.entities,
      { id: "enemy", transform3d: {}, props: { loot: "initial" }, behaviors: [script(source)] }] }] });
    const session = await createGameSession3D(document, 1);
    try {
      session.step(gameInputFrame3D.parse(input)); session.step(gameInputFrame3D.parse(input));
      expect(session.step(gameInputFrame3D.parse(input)).events).toContainEqual(expect.objectContaining({kind: "trigger", event: "loot:coin"}));
    } finally { session.dispose(); }
  });

  it("restores removed spawned 3D properties before the destruction hook", async () => {
    const base = blockout();
    const source = `({ onUpdate(input) {return {commands:input.tick === 1 ? [{kind:'setProp',key:'loot',value:'coin'}] : [{kind:'despawn',entityId:input.entity.id}]};},
      onDestroy(input) {return {commands:[{kind:'emit',event:'loot:' + input.entity.props.loot}]};} })`;
    const document = gameDocument3D.parse({ ...base,
      prefabs: { enemy: { rootId: "enemy", externalAssets: [], externalScenes: [], entities: [
        { id: "enemy", transform3d: {}, props: { loot: "initial" }, behaviors: [script(source)] }
      ] } },
      scenes: [{ ...base.scenes[0], entities: base.scenes[0]!.entities.map((entity) => entity.id === "player"
        ? { ...entity, behaviors: [script("input => ({state:null,commands:input.tick === 0 ? [{kind:'spawn',prefabId:'enemy'}] : []})")] } : entity) }]
    });
    const session = await createGameSession3D(document, 1);
    const frame = gameInputFrame3D.parse(input);
    try {
      session.step(frame); session.step(frame); session.step(frame);
      const restored = await createGameSession3D(document, 1, JSON.parse(JSON.stringify(session.snapshot())));
      try {
        expect(restored.step(frame).events).toContainEqual(expect.objectContaining({ kind: "trigger", event: "loot:coin" }));
      } finally { restored.dispose(); }
    } finally { session.dispose(); }
  });

  it("does not send transition-tick contacts to the next scene's reused entity ID", async () => {
    const base = createTopDownRoomGame("hooks");
    const scene = base.scenes[0]!;
    const player = scene.entities.find((entity) => entity.id === "player")!;
    const gem = scene.entities.find((entity) => entity.id === "gem")!;
    const document = gameDocument.parse({ ...base, scenes: [
      { ...scene, entities: scene.entities.map((entity) => entity.id === "player" ? { ...player, behaviors: [script("({onUpdate(){return {commands:[{kind:'sceneTransition',sceneId:'next'}]};}})")] }
        : entity.id === "gem" ? {...gem, transform2d: player.transform2d, behaviors: []} : entity) },
      { ...scene, id: "next", entities: scene.entities.filter((entity) => entity.id !== "gem").map((entity) => entity.id === "player"
        ? {...player, behaviors:[script("({onContact(input,contact){return {commands:[{kind:'emit',event:'phantom:' + contact.otherId}]};}})")]} : entity) }
    ] });
    const session = await createScriptedGameSession(document, 1);
    try {
      const transition = session.step(input);
      expect(transition.events.some((event) => event.kind === "contact")).toBe(true);
      expect(emitted(session.step(input).events).filter((event) => event.startsWith("phantom:"))).toEqual([]);
    } finally { session.dispose(); }
  });
});
