import {beforeEach,describe,expect,it,vi} from "vitest";
import type {NodeRegistry} from "@nodetool-ai/node-sdk";
const state=vi.hoisted(()=>({events:[] as string[], snapshot:{packs:[]}, initialize:vi.fn(async()=>{})}));
vi.mock("@nodetool-ai/pack-manager",()=>({initializeInstalledExecutionHost:async(_entry:string,options:{snapshot:unknown})=>{expect(options.snapshot).toBe(state.snapshot);state.events.push("initialize");await state.initialize();}}));
vi.mock("@nodetool-ai/pack-manager/packs/host",()=>({configureCliPackHost:vi.fn(),loadCliPackSnapshot:async()=>state.snapshot,loaderContextForSnapshot:vi.fn()}));
vi.mock("@nodetool-ai/pack-host",()=>({createCatalogPackSource:()=>({register:async()=>{state.events.push("register");}})}));
vi.mock("@nodetool-ai/node-catalog",()=>({registerAvailablePacks:vi.fn()}));
import {configureCliPackHost,registerCliPacks} from "../src/packs/host.js";
beforeEach(()=>{state.events.length=0;state.initialize.mockReset();configureCliPackHost(import.meta.url);});
describe("execution host initialization",()=>{
 it("initializes the admitted worker lifecycle before registering executable nodes",async()=>{await registerCliPacks({} as NodeRegistry,{});expect(state.events).toEqual(["initialize","register"]);});
 it("fails before node registration when the configured lifecycle fails",async()=>{const cause=new Error("broken admitted admin");state.initialize.mockRejectedValueOnce(cause);await expect(registerCliPacks({} as NodeRegistry,{})).rejects.toBe(cause);expect(state.events).toEqual(["initialize"]);});
});
