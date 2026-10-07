import { describe, expect, it } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createScriptedGameSession, createTopDownRoomGame, replayScriptedGame, validateGame } from "../src/index.js";

function fixture(source: string, props: Record<string, unknown> = { removable: 1 }) {
  const base = createTopDownRoomGame("metadata-script");
  return gameDocument.parse({
    ...base,
    schemaVersion: 2,
    scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => entity.id === "player"
      ? { ...entity, tags: ["hero"], props, behaviors: [{ kind: "script", source, maxCommands: 8, maxTickMs: 30 }] }
      : entity) }))
  });
}

const input = { pressed: [] };

describe("2D QuickJS entity properties", () => {
  it("distinguishes stored null from removal and restores deterministic property mutations", async () => {
    const document = fixture(`({tick, entity, random}) => ({
      state: { tags: entity.tags, props: entity.props, roll: random() },
      commands: tick === 0 ? [{kind:'setProp',key:'nullable',value:null},{kind:'removeProp',key:'removable'}]
        : [{kind:'setProp',key:'count',value:(entity.props.count ?? 0)+1}]
    })`);
    expect(validateGame(document).valid).toBe(true);
    const first = await createScriptedGameSession(document, 7);
    try {
      first.step(input);
      const checkpoint = JSON.parse(JSON.stringify(first.snapshot()));
      expect(checkpoint.entities.find((entity: { id: string }) => entity.id === "player")).toMatchObject({ props: { nullable: null } });
      expect(checkpoint.entities.find((entity: { id: string }) => entity.id === "player").props).not.toHaveProperty("removable");
      const restored = await createScriptedGameSession(document, 999, checkpoint);
      try {
        for (let tick = 0; tick < 3; tick += 1) {
          first.step(input);
          restored.step(input);
        }
        expect(restored.snapshot()).toEqual(first.snapshot());
        expect(Object.values(first.snapshot().scriptState)).toContainEqual({ tags: ["hero"], props: { nullable: null, count: 2 }, roll: expect.any(Number) });
        const replay = await replayScriptedGame(document, 999, [input, input, input], checkpoint);
        expect(replay.snapshot).toEqual(first.snapshot());
      } finally {
        restored.dispose();
      }
    } finally {
      first.dispose();
    }
  });

  it("restores omitted legacy properties from authored defaults but preserves explicit empty state", async () => {
    const document = fixture("({entity}) => ({state:entity.props,commands:[]})", { authored: 5 });
    const initial = await createScriptedGameSession(document, 1);
    const checkpoint = JSON.parse(JSON.stringify(initial.snapshot()));
    initial.dispose();
    const player = checkpoint.entities.find((entity: { id: string }) => entity.id === "player");
    if (!player) {
      throw new Error("Snapshot fixture must contain player");
    }
    for (const explicitEmpty of [false, true]) {
      const saved = structuredClone(checkpoint);
      const savedPlayer = saved.entities.find((entity: { id: string }) => entity.id === "player");
      if (explicitEmpty) {
        savedPlayer.props = {};
      } else {
        delete savedPlayer.props;
      }
      const restored = await createScriptedGameSession(document, 999, saved);
      try {
        restored.step(input);
        expect(Object.values(restored.snapshot().scriptState)).toContainEqual(explicitEmpty ? {} : { authored: 5 });
      } finally {
        restored.dispose();
      }
    }
  });
});

describe("2D script metadata input boundaries", () => {
  it("copies nested self/world properties and reports the committed visual rotation", async () => {
    const document = fixture(`({tick,entity,world}) => {
      const observed = {rotation:entity.rotation, worldRotation:world.find(other=>other.id===entity.id).rotation,
        value:entity.props.nested.value, worldValue:world.find(other=>other.id===entity.id).props.nested.value, active:entity.active};
      entity.props.nested.value = 99;
      world.find(other=>other.id===entity.id).props.nested.value = 88;
      return {state:observed,commands:tick===0?[{kind:'setVisual',rotation:1.25}]:[]};
    }`, { nested: { value: 1 } });
    const session = await createScriptedGameSession(document, 7);
    try {
      session.step(input);
      const rotation = session.frame().sprites.find(sprite=>sprite.entityId==='player')?.rotation;
      expect(rotation).toBe(1.25);
      session.step(input);
      expect(Object.values(session.snapshot().scriptState)).toContainEqual({rotation,worldRotation:rotation,value:1,worldValue:1,active:true});
      expect(session.snapshot().entities.find(entity=>entity.id==='player')?.props).toEqual({nested:{value:1}});
      expect(document.scenes[0].entities.find(entity=>entity.id==='player')?.props).toEqual({nested:{value:1}});
    } finally { session.dispose(); }
  });

  it("rejects accumulated property maps beyond the supported key bound", async () => {
    const props = Object.fromEntries(Array.from({length:64}, (_,index)=>[`key${index}`,index]));
    const document = fixture("()=>({state:null,commands:[{kind:'setProp',key:'overflow',value:1}]})",props);
    const session = await createScriptedGameSession(document, 1);
    try { expect(()=>session.step(input)).toThrow("Entity properties exceed 64 keys"); }
    finally { session.dispose(); }
  });
});

it("reads composed 2D rotation and authored visual age before the current tick", async () => {
  const initial = fixture("({entity,world})=>({state:{self:entity.rotation,listed:world.some(item=>item.id===entity.id)},commands:[]})");
  const scene = initial.scenes[0];
  const document = gameDocument.parse({...initial,scenes:[{...scene,entities:[
    ...scene.entities.map(entity=>{
      if (entity.id !== 'player') { return entity; }
      const {body2d:_body,collider2d:_collider,...visual} = entity;
      return {...visual,parentId:'metadata-parent',transform2d:{...entity.transform2d,rotation:0.5},visualAnimation:{rotationRate:0.125}};
    }),
    {id:'metadata-parent',transform2d:{x:0,y:0,rotation:1}}
  ]}]});
  const session = await createScriptedGameSession(document,7);
  try {
    for (let tick=0;tick<4;tick+=1) {
      const rotation = session.frame().sprites.find(sprite=>sprite.entityId==='player')?.rotation;
      expect(rotation).toBe(1.5+tick*0.125);
      session.step(input);
      expect(Object.values(session.snapshot().scriptState)).toContainEqual({self:rotation,listed:false});
    }
    const snapshot = JSON.parse(JSON.stringify(session.snapshot()));
    const replay = await replayScriptedGame(document,999,[input,input],snapshot);
    session.step(input); session.step(input);
    expect(replay.snapshot).toEqual(session.snapshot());
  } finally { session.dispose(); }
});

it.each([
  "{kind:'setProp',key:'safe',value:{nested:{constructor:1}}}",
  `{kind:'setProp',key:'safe',value:JSON.parse('{"nested":{"__proto__":{"polluted":true}}}')}`,
  "{kind:'removeProp',key:'__proto__'}",
  "{kind:'setProp',key:'huge',value:'é'.repeat(32769)}"
])("rejects unsafe or oversized property command %s", async command => {
  const document = fixture(`()=>({state:null,commands:[${command}]})`);
  const session = await createScriptedGameSession(document,1);
  try { expect(()=>session.step(input)).toThrow(); }
  finally { session.dispose(); }
  expect(document.scenes[0].entities.find(entity=>entity.id==='player')?.props).toEqual({removable:1});
});
