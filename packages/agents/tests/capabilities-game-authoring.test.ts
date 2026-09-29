import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { anyGameDocument, gameAuthoringCandidate } from "@nodetool-ai/protocol";
import { createSandboxModuleCatalog, discoverSandboxPack } from "@nodetool-ai/node-sdk";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { createNativeGame } from "../src/capabilities/game.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { gameSpecs } from "../src/capabilities/game.specs.js";

const USER = "game-authoring-boundary-owner";
const PROJECT = "game-authoring-boundary-project";
const discovery = discoverSandboxPack(fileURLToPath(new URL("../../sandbox-packs/sandbox-game", import.meta.url)));
if (!discovery) { throw new Error("Game pack missing"); }
const catalog = createSandboxModuleCatalog([discovery]);
const reply = z.object({game:z.object({id:z.string(),revision:z.string()}),document:anyGameDocument});
let directory: string;
const agent = () => createCapabilityRun({context:new ProcessingContext({jobId:"authoring-boundaries",userId:USER,sandboxModuleCatalog:catalog}),gate:UNGATED});

describe("retained game ownership boundaries", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "game-authoring-boundaries-"));
    await Project.insertNew({id:PROJECT,user_id:USER,name:"Game",kind:"game"});
    await Workspace.create({user_id:USER,project_id:PROJECT,name:"Game files",path:directory,is_default:false});
  });
  afterEach(async () => { ModelObserver.clear(); await rm(directory,{recursive:true,force:true}); });

  it("requires explicit initial replacement and binds replacement policy into the reviewed candidate", async () => {
    const run = agent();
    const created = reply.parse(await run.invoke("create_native_game",{project_id:PROJECT,name:"Original"}));
    const document = structuredClone(created.document);
    document.scenes[0].name = "Intentional replacement";
    const program = {source:"return inputs.document;",inputs:{document},seed:7};
    expect(await run.invoke("preview_native_game_authoring",{game_id:created.game.id,program})).toMatchObject({error:expect.stringContaining("Initial construction differs")});
    const preview = z.object({candidate:gameAuthoringCandidate}).parse(await run.invoke("preview_native_game_authoring",{game_id:created.game.id,program,expected_document:document}));
    expect(preview.candidate.replace_existing).toBe(true);
    expect(await run.invoke("apply_native_game_authoring",{game_id:created.game.id,candidate:{...preview.candidate,replace_existing:false}})).toHaveProperty("error");
    expect(await run.invoke("get_native_game",{game_id:created.game.id,view:"full"})).toMatchObject({document:{scenes:[{name:created.document.scenes[0].name}]}});
  });

  it("rejects source attachment through create or publish and tracks native publication edits as overrides", async () => {
    const run = agent();
    const created = reply.parse(await run.invoke("create_native_game",{project_id:PROJECT,name:"Retained"}));
    const program = {source:"return inputs.document;",inputs:{document:created.document},seed:7};
    const preview = z.object({candidate:gameAuthoringCandidate}).parse(await run.invoke("preview_native_game_authoring",{game_id:created.game.id,program}));
    const saved = reply.parse(await run.invoke("apply_native_game_authoring",{game_id:created.game.id,candidate:preview.candidate}));
    expect(saved.document.authoring).toBeDefined();
    if (saved.document.schemaVersion === 3 || !saved.document.authoring) { throw new Error("Expected retained 2D game"); }
    expect(await createNativeGame(USER,PROJECT,"Unsafe clone",saved.document)).toHaveProperty("error");
    const forged = structuredClone(saved.document);
    if (!forged.authoring) { throw new Error("Missing metadata"); }
    forged.authoring.program.source = "return inputs.tampered;";
    expect(await run.invoke("publish_native_game",{game_id:created.game.id,base_revision:created.game.revision,document:forged})).toMatchObject({error:expect.stringContaining("preview and apply")});
    const edited = structuredClone(saved.document);
    edited.scenes[0].entities[0].transform2d.x += 3;
    const published = reply.parse(await run.invoke("publish_native_game",{game_id:created.game.id,base_revision:created.game.revision,document:edited}));
    expect(published.document.authoring?.overrides).toContainEqual(expect.objectContaining({entityId:edited.scenes[0].entities[0].id,path:["transform2d","x"]}));
  });

  it("saves callbacks that mutate a template while retaining its original preparation inputs", async () => {
    const run = agent();
    const session = createChatCodeActSession({tools:gameSpecs,context:run.context,sandboxModuleCatalog:catalog,
      executeTool:(call)=>run.invoke(call.name,call.args)});
    const observation = z.object({ok:z.boolean(),result:z.object({game_id:z.string()}).optional()}).parse(JSON.parse(await session.executeAction({code:`
      import {game,constructGame,saveGame} from "@nodetool-ai/sandbox-game";
      const bundle=constructGame({seed:7,inputs:{template:game()}},(inputs,builder)=>{
        const document=inputs.template;
        builder.prefab("marker",builder.entity("definition",0,8,{transform2d:{scaleX:2,scaleY:3}}));
        builder.instance(document.scenes[0],"instance","marker",{transform2d:{x:4}});
        return document;
      });
      return await saveGame({name:"Retained template",...bundle},{games:nodetool.games,project_id:"${PROJECT}"});
    `})));
    expect(observation.ok,JSON.stringify(observation)).toBe(true);
    if (!observation.result) { throw new Error("Missing saved game"); }
    const saved=reply.parse(await run.invoke("get_native_game",{game_id:observation.result.game_id,view:"full"}));
    const template=anyGameDocument.parse(saved.document.authoring?.program.inputs["template"]);
    expect(template.scenes[0].entities).toEqual([]);
    expect(saved.document.scenes[0].entities.map((entity)=>entity.id)).toEqual(["instance"]);
    const rebuilt=await run.invoke("preview_native_game_authoring",{game_id:saved.game.id});
    expect(rebuilt).toMatchObject({conflicts:[]});
  });
});
