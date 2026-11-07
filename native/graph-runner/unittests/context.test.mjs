import "./context-crypto.test.ts";
import fontBytes from "fixture:context-font";
import {GlobalFonts} from "../guest/host/canvas.mjs";
import "./context-env.mjs";
import "../guest/env/index.mjs";
import { ContextAbortController } from "../guest/host/context-services.mjs";
import { GuestContext } from '../guest/host/context.mjs';
import { SummarizerNode, CreateThreadNode, AgentNode } from '@nodetool-ai/llm-nodes/nodes/agents';
import { CodeNode } from '@nodetool-ai/code-nodes/nodes/code-node';
import { BaseProvider } from '../guest/host/runtime.mjs';
import { Tool } from '../guest/host/agents.mjs';
import { importHidden } from '../guest/shims/config.cjs';
function check(value, message) { if (!value) throw new Error(message); }
async function rejects(fn, text) {
  try { await fn(); } catch(error) { check(String(error).includes(text), String(error)); return; }
  throw new Error(`Expected rejection: ${text}`);
}
await rejects(() => new GuestContext().getProvider('local'), "provider 'local' is not granted");
await rejects(() => new GuestContext().getScript('secret'), 'not granted');
check((await importHidden('@nodetool-ai/agents')).Tool===Tool, 'explicit native agents hidden import');
check(await importHidden('ungranted-package')===null,'ungranted hidden import');
const controller = new ContextAbortController();
let resolutions = 0;
let requests = [];
const context = new GuestContext({signal: controller.signal, providerResolver: async id => {
  resolutions++;
  check(id === 'local', 'provider id');
  return {provider:id, async *generateMessages(args) {
    requests.push(args);
    yield {type:'chunk',content:'<think>private</think>Useful ',content_type:'text'};
    yield {type:'chunk',content:'summary.',content_type:'text'};
  }};
}});
const providers = await Promise.all([context.getProvider('local'), context.getProvider('local')]);
check(resolutions === 1 && providers[0] === providers[1], 'memoized concurrent resolver');
const node = new SummarizerNode();
node.text = 'A deterministic source.';
node.model = {provider:'local',id:'fixture'};
const outputs = [];
for await (const output of node.genProcess(context)) outputs.push(output);
check(outputs.some(output => output.text === 'Useful summary.'), JSON.stringify(outputs));
check(requests.length === 1 && requests[0].model === 'fixture', 'real node provider request');
const broken = new GuestContext({providerResolver: async () => { throw new Error('adapter failed'); }});
await rejects(() => broken.getProvider('local'), 'adapter failed');
await rejects(() => broken.getProvider('local'), 'adapter failed');
let messages = [];
context.addMessageListener(message => messages.push(message));
context.postMessage({type:'node_progress',progress:50});
check(messages.length === 1, 'message delivery');
context.setInjectedTools([{name:'owned',process:async () => 42}]);
check(await context.getInjectedTool('owned').process() === 42 && context.getInjectedTool('missing') === null, 'tool grants');
const sleep = context.sleep(5000);
controller.abort(new Error('fixture cancelled'));
await rejects(() => sleep, 'fixture cancelled');
await rejects(() => context.getProvider('local'), 'fixture cancelled');
await rejects(() => context.getScript('secret'), 'fixture cancelled');
// Existing node body must execute in an isolated sandbox, never host eval.
const code = new CodeNode();
code.code = 'return { answer: inputs.x + 1 };';
code.dynamicProps.set('x', 41);
check((await code.process(new GuestContext())).answer === 42, 'real Code node output');
const native = await new GuestContext().getProvider('native');
const parts = [];
for await (const part of native.generateMessages({messages:[],model:'fixture'})) parts.push(part.content);
check(parts.join('') === 'native', 'native callback stream');
globalThis.__g5Result = {outputs:outputs.length,requests:requests.length};
globalThis.__nodetool = {};

const dbContext = new GuestContext({userId:'fixture', modelOptions:{databasePath:':memory:'}});
const thread = new CreateThreadNode();
thread.thread_id = 'g5-thread';
check((await thread.process(dbContext)).thread_id === 'g5-thread', 'real thread node');
await dbContext.createMessage({thread_id:'g5-thread', role:'user', content:'persisted'});
check((await dbContext.getThreadMessages('g5-thread')).messages[0].content === 'persisted', 'real SQLite thread messages');
class LocalProvider extends BaseProvider {
  constructor() { super('local'); this.turn = 0; }
  async *generateMessages(args) {
    if (this.turn++ === 0) yield {type:'tool_call',id:'call1',name:'read_fixture',args:{}};
    else yield {type:'chunk',content:'Tool result received.',content_type:'text'};
  }
}
class ReadTool extends Tool {
  name = 'read_fixture';
  description = 'Read deterministic fixture';
  inputSchema = {type:'object',properties:{}};
  async process() { toolCalls++; return {answer:42}; }
}
let toolCalls = 0;
dbContext.registerProvider('local',new LocalProvider());
dbContext.setInjectedTools([new ReadTool()]);
dbContext.set('nodetool_permission_gate',{mode:'auto',sessionAllow:new Set(),requestApproval:async ()=>'deny'});
const agent = new AgentNode();
agent.model = {provider:'local',id:'fixture'};
agent.prompt = 'Read the fixture.';
agent.tools = [{name:'read_fixture'}];
agent.thread_id = 'g5-thread';
const turns = [];
for await (const part of agent.genProcess(dbContext)) turns.push(part);
check(toolCalls === 1, 'real Agent injected tool execution '+JSON.stringify(turns));
check(turns.some(part => part.text === 'Tool result received.'), 'real Agent final response');
check((await dbContext.getThreadMessages('g5-thread')).messages.length >= 3, 'Agent persisted messages');
__g5Result.agentToolCalls = toolCalls;
const emitting = new CodeNode();
emitting.code = 'await emit("value", inputs.x); await sleep(1); await output("total", inputs.x + 1);';
emitting.dynamicProps.set('x', 9);
const bags=[];
for await (const bag of emitting.genProcess(new GuestContext())) bags.push(bag);
check(JSON.stringify(bags) === '[{"value":9},{"total":10}]','real Code emit/final '+JSON.stringify(bags));
const streaming = new CodeNode();
streaming.code = 'let sum=0; if(!stream.open("x")) throw new Error("input closed"); for await(const n of stream("x")) {sum+=n; await emit("item",n);} await output("sum",sum);';
const streamBags=[];
await streaming.run({
  signal: new ContextAbortController().signal,
  hasStream: name => name === 'x',
  async *stream(name) {check(name==='x','input name');yield 2;yield 3;},
  async *any() {yield ['x',2];yield ['x',3];}
},{async emit(name,value){streamBags.push({[name]:value});},async emitGroup(value){streamBags.push(value);}},new GuestContext());
check(JSON.stringify(streamBags)==='[{"item":2},{"item":3},{"sum":5}]','real Code streaming '+JSON.stringify(streamBags));
const badWorkspace = new CodeNode();
badWorkspace.code='return await workspace.read("forbidden.txt");';
const deniedWorkspaceContext=new GuestContext();deniedWorkspaceContext.workspace=null;
await rejects(()=>badWorkspace.process(deniedWorkspaceContext),'workspace.read is not available without a context');
__g5Result.codeEmits=bags.length;
__g5Result.codeStreamBags=streamBags.length;
const cancelledProviderController = new ContextAbortController();
const cancelledProvider = new GuestContext({signal:cancelledProviderController.signal,providerResolver:async () => ({async *generateMessages(args) {
  check(args.signal===cancelledProviderController.signal,'provider receives real cancellation signal');
  yield {type:'chunk',content:'before cancellation',content_type:'text'};
  cancelledProviderController.abort(new Error('provider cancelled'));
  yield {type:'chunk',content:'must not escape',content_type:'text'};
}})});
const cancelledSummary = new SummarizerNode();
cancelledSummary.text='input';cancelledSummary.model={provider:'local',id:'fixture'};
await rejects(async()=>{for await(const ignored of cancelledSummary.genProcess(cancelledProvider)) {}},'provider cancelled');
const {runInSandbox} = await import('../guest/host/sandbox.mjs');
let firstRelease;
const firstBlocked = new Promise(resolve=>firstRelease=resolve);
const parallelResult=await runInSandbox({code:'await Promise.all([emit("first",1),emit("second",2)]);await output("done",true);',context:new GuestContext(),onEmit:async name=>{if(name==='first')await firstBlocked;else firstRelease();}});
check(parallelResult.success && parallelResult.outputs.done,'parallel bridges preserve fan-out');
const waitingAbort=new ContextAbortController();
const waiting=runInSandbox({code:'return await stream.first("waiting");',signal:waitingAbort.signal,onTakeInput:()=>new Promise(()=>{})});
setTimeout(()=>waitingAbort.abort(new Error('input cancelled')),2);
await rejects(()=>waiting,'input cancelled');
__g5Result.parallelBridges=true;
const moduleContext=new GuestContext();
moduleContext.sandboxModuleCatalog={resolveForExecution:()=>({statuses:[],modules:[{
  kind:'js',specifier:'@fixture/math',packName:'fixture',moduleId:'index.js',source:'import { double } from "./double.js";export const twice=double;',
  graph:[{kind:'js',id:'double.js',source:'export function double(x){return x*2;}',dependencies:[],internal:false}]
}]})};
const importedCode=new CodeNode();
importedCode.code='import {twice} from "@fixture/math";return {answer:twice(inputs.x)};';
importedCode.dynamicProps.set('x',21);
check((await importedCode.process(moduleContext)).answer===42,'real Code declared JS package and sibling import');
const deniedImport=await runInSandbox({code:'return await import("node:fs");'});
check(!deniedImport.success && deniedImport.error.includes('dynamic import'),'dynamic imports remain denied');
__g5Result.declaredModules=true;

const workspaceCode=new CodeNode();
workspaceCode.code='await workspace.write("code-grant.txt","stored");return {read:await workspace.read("code-grant.txt")};';
check((await workspaceCode.process(new GuestContext())).read==='stored','real Code granted workspace write/read');
workspaceCode.code='return await workspace.read("../escape.txt");';
await rejects(()=>workspaceCode.process(new GuestContext()),'outside the workspace');
const secretCode=new CodeNode();secretCode.secrets=['ALLOWED'];
secretCode.code='return {secret:await getSecret("ALLOWED")};';
check((await secretCode.process(new GuestContext())).secret==='fixture-secret','declared secret grant');
secretCode.code='return await getSecret("DENIED");';
await rejects(()=>secretCode.process(new GuestContext()),'outside the declared scope');
__g5Result.workspaceAndSecrets=true;
class GenerateTextTool extends Tool {
 name='generate_text';description='Deterministic injected text model';
 inputSchema={type:'object',properties:{prompt:{type:'string'}},required:['prompt']};
 async process(context,args){return {text:args.prompt.toUpperCase()};}
}
const codeToolContext=new GuestContext();
codeToolContext.setInjectedTools([new GenerateTextTool()]);
codeToolContext.set('nodetool_permission_gate',{mode:'auto',sessionAllow:new Set(),requestApproval:async()=> 'deny'});
const toolCode=new CodeNode();toolCode.code='return await nodetool.models.generate("local model",{provider:"local",id:"fixture"});';
check((await toolCode.process(codeToolContext)).text==='LOCAL MODEL','real Code nodetool model tool through production gate');
__g5Result.codeTools=true;
const csvContext=new GuestContext();
csvContext.sandboxModuleCatalog={resolveForExecution:()=>({statuses:[],modules:[{kind:'host',hostId:'csv',specifier:'@nodetool-ai/sandbox-csv',packName:'@nodetool-ai/sandbox-csv',moduleId:'csv',graph:[]}]})};
const csvCode=new CodeNode();csvCode.code='import {parse} from "@nodetool-ai/sandbox-csv";return {rows:await parse("name,score\\nAda,42")};';
check((await csvCode.process(csvContext)).rows[0].score==='42','real Code canonical host CSV module');
__g5Result.hostModules=true;
const addBytes=new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);
const wasmContext=new GuestContext();
wasmContext.sandboxModuleCatalog={resolveForExecution:()=>({statuses:[],modules:[{kind:'wasm',specifier:'@fixture/wasm',packName:'fixture',moduleId:'add.wasm',bytes:addBytes,wasm:{memoryPagesMax:0,exports:[{wasm:'add',as:'add'}]},graph:[]}]})};
const wasmCode=new CodeNode();wasmCode.code='import {add} from "@fixture/wasm";return {answer:await add(20,22)};';
check((await wasmCode.process(wasmContext)).answer===42,'real Code scalar WASM module');
wasmCode.code='import {add} from "@fixture/wasm";return await add(2147483648,0);';
await rejects(()=>wasmCode.process(wasmContext),'out of range');
__g5Result.wasmModules=true;
const capabilityCode=new CodeNode();
capabilityCode.code='import {generate_text} from "@nodetool-ai/sandbox-nodetool/media";return await generate_text({prompt:"capability model",provider:"local",model:"fixture"});';
check((await capabilityCode.process(codeToolContext)).text==='CAPABILITY MODEL','real Code hidden agents capability import and gated injected model');
__g5Result.capabilityModules=true;
const helpersCode=new CodeNode();
helpersCode.code='const hashed=await crypto.digest("SHA-256","abc");return {hash:toHex(hashed),b64:toBase64(fromHex("4142")),uuid:crypto.randomUUID(),randomLength:crypto.getRandomValues(8).length,number:await format.number(1234.5,{locale:"en-US"}),mapped:await parallelMap([1,2,3],async n=>n*2,2),url:new URL("/x","https://example.com").href};';
const helpers=await helpersCode.process(new GuestContext());
check(helpers.hash==='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','real Code SHA256 known vector');
check(helpers.b64==='QUI=' && helpers.randomLength===8 && /^[0-9a-f-]{36}$/.test(helpers.uuid),'real Code bytes/entropy helpers');
check(helpers.number==='1,234.5' && helpers.url==='https://example.com/x' && JSON.stringify(helpers.mapped)==='[2,4,6]','real Code format/URL/parallelMap');
const mediaCode=new CodeNode();mediaCode.code='const document=await media.toDocument(new Uint8Array([65,66]),{name:"tiny.txt",mimeType:"text/plain"});return {text:await media.text(document)};';
check((await mediaCode.process(new GuestContext())).text==='AB','real Code media document bridge');
const canvasCode=new CodeNode();canvasCode.code='const surface=createCanvas(4,4);const ctx=surface.getContext("2d");ctx.fillStyle="#ff0000";ctx.fillRect(0,0,4,4);const bytes=await surface.toBytes();const info=await image.info(bytes);return {width:info.width,height:info.height,length:bytes.length};';
const drawn=await canvasCode.process(new GuestContext());
check(drawn.width===4 && drawn.height===4 && drawn.length>0,'real Code canonical createCanvas/image bridge');
__g5Result.coreHelperBridges=true;
GlobalFonts.register(fontBytes);
const ocrContext=new GuestContext();
ocrContext.sandboxModuleCatalog={resolveForExecution:()=>({statuses:[],modules:[{kind:'host',hostId:'ocr',specifier:'@nodetool-ai/sandbox-ocr',packName:'@nodetool-ai/sandbox-ocr',moduleId:'ocr',graph:[]}]})};
const ocrCode=new CodeNode();
ocrCode.code='import {recognize} from "@nodetool-ai/sandbox-ocr";const surface=createCanvas(400,100);const ctx=surface.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,400,100);ctx.fillStyle="#000";ctx.font="48px Inter";ctx.fillText("HELLO 42",15,70);return await recognize(await surface.toBytes(),{language:"eng"});';
const recognized=await ocrCode.process(ocrContext);
check(recognized.text.trim()==='HELLO 42','real Code native OCR text '+JSON.stringify(recognized));
check(recognized.words.length===2 && recognized.words.every(word=>word.bbox.x1>word.bbox.x0),'real OCR word boxes');
__g5Result.nativeOcr=true;
await import('./context-navigator.test.mjs');
await import('./context-host-packages.test.mjs');

const workspaceBytesCode=new CodeNode();
workspaceBytesCode.code='await workspace.mkdir("bytes");await workspace.writeBytes("bytes/in.bin",new Uint8Array([0,127,255]));await workspace.copy("bytes/in.bin","bytes/copy.bin");await workspace.move("bytes/copy.bin","bytes/out.bin");const stat=await workspace.stat("bytes/out.bin");const data=await workspace.readBytes((await workspace.root())+"/bytes/out.bin");await workspace.remove("bytes/in.bin");return {stat,data:[...data],files:await workspace.list("bytes"),missing:(await workspace.stat("bytes/in.bin")).exists};';
const workspaceBytes=await workspaceBytesCode.process(new GuestContext());
check(workspaceBytes.stat.exists && workspaceBytes.stat.isFile && workspaceBytes.stat.size===3 && !workspaceBytes.missing,'canonical workspace stat contract');
check(JSON.stringify(workspaceBytes.data)==='[0,127,255]' && JSON.stringify(workspaceBytes.files)==='["out.bin"]','canonical workspace byte/list/root/copy/move/remove contracts');
const fetchCode=new CodeNode();
fetchCode.code='const response=await fetch("https://fixture.invalid/echo",{method:"POST",body:{value:42},headers:{"x-fixture":"yes"}});return {status:response.status,body:await response.json()};';
const fetched=await fetchCode.process(new GuestContext());
check(fetched.status===201 && fetched.body.received===42,'real Code fetch through explicit host transport');
fetchCode.code='return await fetch("http://127.0.0.1/private");';
await rejects(()=>fetchCode.process(new GuestContext()),'private');
const assetContext=new GuestContext({modelOptions:{databasePath:':memory:'}});
const assetCode=new CodeNode();
assetCode.code='await workspace.writeBytes("original.txt",new Uint8Array([65,66]));const asset=await sandboxToAsset("original.txt");await assetToSandbox(asset.uri,"restored/note.txt");return {asset,text:await workspace.read("restored/note.txt")};';
const persisted=await assetCode.process(assetContext);
check(persisted.text==='AB' && persisted.asset.type==='document' && /^[a-f0-9]{32}$/.test(persisted.asset.asset_id),'real Code asset persistence and workspace roundtrip');
check((await assetContext.getAssetInfo(persisted.asset.asset_id)).name==='original.txt','real persisted asset metadata');
assetContext._models.close();
// asset://<id> without an extension resolves from the owner's folder with one
// directory read, never the store listing; other layouts still fall back to it.
{
  const hostAssets=globalThis.__host.assets;
  const stemId='0123456789abcdef0123456789abcdef';
  hostAssets.write(`u1/${stemId}_thumb.jpg`,new Uint8Array([9]));
  hostAssets.write(`u1/${stemId}.png`,new Uint8Array([1,2,3]));
  hostAssets.write(`deep/nested/${stemId.replace(/0/g,'f')}.bin`,new Uint8Array([7]));
  let listed=0;
  const list=hostAssets.list;
  hostAssets.list=(prefix)=>{listed++;return list(prefix);};
  try {
    const owned=new GuestContext({userId:'u1'});
    const direct=await owned.resolveAssetBytes(`asset://${stemId}`);
    check(direct.bytes && Array.from(direct.bytes).join()==='1,2,3' && listed===0,'asset id resolves from the owner folder without listing');
    check(JSON.stringify(owned.assetStorage.findStem('missing',stemId))==='[]','finding in a missing folder returns no keys');
    const nested=await owned.resolveAssetBytes(`asset://${stemId.replace(/0/g,'f')}`);
    check(nested.bytes && Array.from(nested.bytes).join()==='7' && listed>0,'nested asset still resolves through the listing');
  } finally {
    hostAssets.list=list;
  }
}
__g5Result.workspaceContract=true;__g5Result.fetchBridge=true;__g5Result.assetBridge=true;

const {CodexWebSearchNode}=await import('@nodetool-ai/llm-nodes/nodes/codex');
const {VertexGroundedSearchNode}=await import('@nodetool-ai/llm-nodes/nodes/gemini');
const localSearch=new CodexWebSearchNode();localSearch.query='local deterministic search';localSearch.model={provider:'codex',id:'fixture'};
const searched=await localSearch.process(new GuestContext());
check(searched.text==='Fixture answer'&&searched.sources[0].url==='https://fixture.invalid/source','actual Codex WebSearch node with an explicit native adapter');
const vertexSearch=new VertexGroundedSearchNode();vertexSearch.query='local deterministic search';vertexSearch.model={provider:'gemini_vertex',id:'fixture'};
const grounded=await vertexSearch.process(new GuestContext());
check(grounded.text==='Grounded fixture answer'&&grounded.sources[0].url==='https://fixture.invalid/source','actual Vertex grounded-search node with a native Response adapter');
vertexSearch.query='local failure';
await rejects(()=>vertexSearch.process(new GuestContext()),'Vertex AI error 503: fixture endpoint failure');
await rejects(async()=>{const provider=await new GuestContext().getProvider('gemini_vertex');await provider.mediaHeaders('https://fixture.invalid/private');},'not granted');
__g5Result.nativeProviderPorts=true;

const boundedWorkspace=new CodeNode();boundedWorkspace.max_response_mb=.001;
boundedWorkspace.code='await workspace.writeBytes("response-limit.bin",new Uint8Array(2048));return await workspace.readBytes("response-limit.bin");';
await rejects(()=>boundedWorkspace.process(new GuestContext()),'Sandbox response body size limit exceeded');
const codeSleep=new CodeNode();codeSleep.timeout=7;codeSleep.code='await sleep(60000);return {slept:true};';
check((await codeSleep.process(new GuestContext())).slept,'canonical Code sleep clamps an excessive request');
const safeLog=await runInSandbox({code:'await console.log("observer isolation");return 42;',onLog:()=>{throw new Error('fixture observer failed');}});
check(safeLog.success&&safeLog.result===42,'Code console observer exceptions are isolated');
__g5Result.codeHelperLimits=true;
