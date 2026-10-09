import { describe, expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D, replayGame3D, validateAnyGame } from "../src/index.js";
import { blockout } from "./fixtures-game3d.js";

const input = gameInputFrame3D.parse({ pressed: [] });
const half = Math.SQRT1_2;

describe("3D script metadata and committed world rotation", () => {
  it("reads the entry-frame world quaternion and observes local visual changes next tick", async () => {
    const base = blockout();
    const document = gameDocument3D.parse({ ...base, scenes: [{ ...base.scenes[0], entities: [
      ...base.scenes[0].entities,
      { id: "parent", transform3d: { rotation: [half, 0, 0, half] } },
      { id: "child", parentId: "parent", tags: ["observer"], props: { nested: { nullable: null } },
        transform3d: { rotation: [0, half, 0, half] }, behaviors: [{ kind: "script", maxTickMs: 30,
          source: `({tick,entity,world}) => ({state:{self:entity,world},commands:tick===0?[{kind:'setVisual',rotation:[0,0,0,1]}]:[]})` }] }
    ] }] });
    expect(validateAnyGame(document).valid).toBe(true);
    const session = await createGameSession3D(document, 7);
    try {
      const before = session.frame().entities.find((entity) => entity.entityId === "child");
      if (!before) { throw new Error("Rotation fixture must project child"); }
      expect(before.transform.rotation).not.toEqual([0, half, 0, half]);
      session.step(input);
      expect(Object.values(session.snapshot().scriptState)).toContainEqual(expect.objectContaining({
        self: expect.objectContaining({ rotation: before.transform.rotation, active: true, tags: ["observer"], props: { nested: { nullable: null } } }),
        world: expect.arrayContaining([expect.objectContaining({ id: "child", rotation: before.transform.rotation, tags: ["observer"], props: { nested: { nullable: null } } })])
      }));
      const next = session.frame().entities.find((entity) => entity.entityId === "child");
      if (!next) { throw new Error("Next frame must project child"); }
      expect(next.transform.rotation).toEqual([half, 0, 0, half]);
      session.step(input);
      expect(Object.values(session.snapshot().scriptState)).toContainEqual(expect.objectContaining({ self: expect.objectContaining({ rotation: next.transform.rotation }) }));
    } finally { session.dispose(); }
  });

  it("isolates mutable properties of two prefab instances across snapshot replay", async () => {
    const base = blockout();
    const document = gameDocument3D.parse({ ...base,
      scenes: [{ ...base.scenes[0], entities: base.scenes[0].entities.map((entity) => entity.id === "player" ? {
        ...entity, behaviors: [{ kind: "script", maxTickMs: 30,
          source: `({tick})=>({state:null,commands:tick===0?[{kind:'spawn',prefabId:'actor'},{kind:'spawn',prefabId:'actor'}]:[]})` }]
      } : entity) }],
      prefabs: { actor: { rootId: "root", externalAssets: [], externalScenes: [], entities: [{
        id: "root", transform3d: {}, props: { nested: { value: 1 } }, behaviors: [{ kind: "script", maxTickMs: 30,
          source: `({entity})=>({state:entity.props,commands:entity.id==='actor#1/root'?[{kind:'setProp',key:'nested',value:{value:9}}]:[]})` }]
      }] } }
    });
    expect(validateAnyGame(document).valid).toBe(true);
    const session = await createGameSession3D(document, 7);
    try {
      session.step(input); session.step(input); session.step(input);
      const checkpoint = JSON.parse(JSON.stringify(session.snapshot()));
      expect(checkpoint.entities.find((entity: { id: string }) => entity.id === "actor#1/root")).toMatchObject({ props: { nested: { value: 9 } } });
      expect(checkpoint.entities.find((entity: { id: string }) => entity.id === "actor#2/root")).toMatchObject({ props: { nested: { value: 1 } } });
      const replay = await replayGame3D(document, 999, [input, input], checkpoint);
      session.step(input); session.step(input);
      expect(replay.snapshot).toEqual(session.snapshot());
      expect(document.prefabs.actor.entities[0]).toMatchObject({ props: { nested: { value: 1 } } });
    } finally { session.dispose(); }
  });
});

it("isolates nested 3D inputs and preserves explicit empty properties on restore", async () => {
  const base = blockout();
  const document = gameDocument3D.parse({...base,scenes:[{...base.scenes[0],entities:base.scenes[0].entities.map(entity=>entity.id==='player'?{
    ...entity,props:{nested:{value:1}},behaviors:[{kind:'script',maxTickMs:30,source:`({tick,entity,world})=>{
      const value=entity.props.nested?.value ?? null;
      if(entity.props.nested) entity.props.nested.value=99;
      const other=world.find(item=>item.id===entity.id);
      if(other.props.nested) other.props.nested.value=88;
      return {state:{value,props:other.props},commands:tick===0?[{kind:'removeProp',key:'nested'}]:[]};
    }`}]}:entity)}]});
  const session = await createGameSession3D(document,7);
  try {
    session.step(input);
    const saved = JSON.parse(JSON.stringify(session.snapshot()));
    expect(saved.entities.find((entity:{id:string})=>entity.id==='player').props).toEqual({});
    const restored = await createGameSession3D(document,999,saved);
    try { restored.step(input); expect(Object.values(restored.snapshot().scriptState)).toContainEqual({value:null,props:{}}); }
    finally { restored.dispose(); }
    delete saved.entities.find((entity:{id:string})=>entity.id==='player').props;
    const legacy = await createGameSession3D(document,999,saved);
    try { legacy.step(input); expect(Object.values(legacy.snapshot().scriptState)).toContainEqual({value:1,props:{nested:{value:88}}}); }
    finally { legacy.dispose(); }
    expect(document.scenes[0].entities.find(entity=>entity.id==='player')?.props).toEqual({nested:{value:1}});
  } finally { session.dispose(); }
});

it("rejects cumulative 3D property maps beyond the supported key bound", async () => {
  const base = blockout();
  const props = Object.fromEntries(Array.from({length:64},(_,index)=>[`key${index}`,index]));
  const document = gameDocument3D.parse({...base,scenes:[{...base.scenes[0],entities:base.scenes[0].entities.map(entity=>entity.id==='player'?{
    ...entity,props,behaviors:[{kind:'script',maxTickMs:30,source:"()=>({state:null,commands:[{kind:'setProp',key:'overflow',value:1}]})"}]}:entity)}]});
  const session = await createGameSession3D(document,1);
  try { expect(()=>session.step(input)).toThrow("Entity properties exceed 64 keys"); }
  finally { session.dispose(); }
  expect(document.scenes[0].entities.find(entity=>entity.id==='player')?.props).toEqual(props);
});

it("reports physics-driven world rotation at the next script entry and replays it", async () => {
  const base = blockout();
  const document = gameDocument3D.parse({...base,scenes:[{...base.scenes[0],entities:[...base.scenes[0].entities,
    {id:'spinner',transform3d:{position:{x:5,y:5,z:5}},body3d:{type:'dynamic',gravityScale:0,angularVelocity:{x:0,y:2,z:0}},
      collider3d:{kind:'box',halfExtents:{x:0.5,y:0.5,z:0.5}},behaviors:[{kind:'script',maxTickMs:30,
        source:"({entity,world})=>({state:{self:entity.rotation,world:world.find(item=>item.id===entity.id).rotation},commands:[]})"}]}
  ]}]});
  const session = await createGameSession3D(document,7);
  try {
    const initialRotation = session.frame().entities.find(entity=>entity.entityId==='spinner')?.transform.rotation;
    for (let tick=0;tick<3;tick+=1) {
      const rotation = session.frame().entities.find(entity=>entity.entityId==='spinner')?.transform.rotation;
      session.step(input);
      expect(Object.values(session.snapshot().scriptState)).toContainEqual({self:rotation,world:rotation});
    }
    expect(session.frame().entities.find(entity=>entity.entityId==='spinner')?.transform.rotation).not.toEqual(initialRotation);
    const checkpoint = JSON.parse(JSON.stringify(session.snapshot()));
    const replay = await replayGame3D(document,999,[input,input],checkpoint);
    session.step(input); session.step(input);
    expect(replay.snapshot).toEqual(session.snapshot());
  } finally { session.dispose(); }
});
