import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { anyGameDocument } from "@nodetool-ai/protocol";
import { z } from "zod";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const USER = "script-params-owner";
const PROJECT = "script-params-project";
const SOURCE = "(input) => ({ state: input.params, commands: [] })";
let directory: string;
const reply = z.object({game:z.object({id:z.string()}),document:anyGameDocument});
beforeEach(async()=>{
  initTestDb();
  directory = await mkdtemp(join(tmpdir(),"game-script-params-agent-"));
  await Project.insertNew({id:PROJECT,user_id:USER,name:"Script params",kind:"game"});
  await Workspace.create({user_id:USER,project_id:PROJECT,name:"Files",path:directory,is_default:false});
});
afterEach(async()=>{ModelObserver.clear(); await rm(directory,{recursive:true,force:true});});

it.each(["2d","3d"] as const)("declares and sets %s script params through agent edits",async dimension=>{
  const agent = createCapabilityRun({context:new ProcessingContext({jobId:"script-params-boundaries",userId:USER}),gate:UNGATED});
  const created = reply.parse(await agent.invoke("create_native_game",{project_id:PROJECT,name:"Script params",dimension}));
  const id = created.game.id.slice(0,12);
  const player = created.document.scenes[0].entities.find(entity=>entity.id==="player");
  if (!player) { throw new Error("New games must contain a player"); }
  const index = player.behaviors.length;
  const params = {speed:{type:"number",default:2,minimum:0,maximum:10},target:{type:"entity"}};
  const edited = reply.parse(await agent.invoke("edit_native_game",{game_id:id,ops:[
    {op:"add_behavior",entity_id:"player",behavior:{kind:"script",source:SOURCE}},
    {op:"set_script_params",entity_id:"player",index,params,values:{speed:6,target:"camera"}}
  ]}));
  const behavior = edited.document.scenes[0].entities.find(entity=>entity.id==="player")?.behaviors[index];
  expect(behavior).toMatchObject({kind:"script",source:SOURCE,params,values:{speed:6,target:"camera"}});
  const rejected = await agent.invoke("edit_native_game",{game_id:id,ops:[{op:"set_script_params",entity_id:"player",index,values:{target:"ghost"}}]});
  expect(JSON.stringify(rejected)).toContain("missing entity ghost");
});
