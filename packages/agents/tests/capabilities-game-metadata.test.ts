import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { anyGameDocument } from "@nodetool-ai/protocol";
import { z } from "zod";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const USER = "metadata-owner";
const PROJECT = "metadata-project";
let directory: string;
const reply = z.object({game:z.object({id:z.string()}),document:anyGameDocument});
beforeEach(async()=>{
  initTestDb();
  directory = await mkdtemp(join(tmpdir(),"game-metadata-agent-"));
  await Project.insertNew({id:PROJECT,user_id:USER,name:"Metadata",kind:"game"});
  await Workspace.create({user_id:USER,project_id:PROJECT,name:"Files",path:directory,is_default:false});
});
afterEach(async()=>{ModelObserver.clear(); await rm(directory,{recursive:true,force:true});});

it.each(["2d","3d"] as const)("authors and reads %s metadata through agent capabilities",async dimension=>{
  const agent = createCapabilityRun({context:new ProcessingContext({jobId:"metadata-boundaries",userId:USER}),gate:UNGATED});
  const created = reply.parse(await agent.invoke("create_native_game",{project_id:PROJECT,name:"Metadata",dimension}));
  const id = created.game.id.slice(0,12);
  const edited = reply.parse(await agent.invoke("edit_native_game",{game_id:id,ops:[{op:"update_entity",entity_id:"player",set:{tags:["hero"],props:{health:10,nested:{nullable:null}}}}]}));
  expect(edited.document.scenes[0].entities.find(entity=>entity.id==="player")).toMatchObject({tags:["hero"],props:{health:10,nested:{nullable:null}}});
  const opened = reply.parse(await agent.invoke("get_native_game",{game_id:id,view:"full"}));
  expect(opened.document).toEqual(edited.document);
  const removed = reply.parse(await agent.invoke("edit_native_game",{game_id:id,ops:[{op:"update_entity",entity_id:"player",set:{props:{nested:{nullable:null}},tags:null}}]}));
  const player = removed.document.scenes[0].entities.find(entity=>entity.id==="player");
  expect(player?.props).toEqual({nested:{nullable:null}});
  expect(player).not.toHaveProperty("tags");
});
