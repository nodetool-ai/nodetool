#include "ScriptHost.h"
#include "core/JsonSave.h"
#include "EmbeddedCommands.h"
extern "C" {
#include <quickjs.h>
}
#include <algorithm>
#include <chrono>
#include <memory>
#include <set>

namespace nodetool::game {
namespace {
constexpr std::size_t MAX_INPUT_BYTES = 2 * 1024 * 1024;
constexpr std::size_t MAX_SOURCE_BYTES = 1024 * 1024;
struct RuntimeDeleter { void operator()(JSRuntime* value) const { JS_FreeRuntime(value); } };
struct ContextDeleter { void operator()(JSContext* value) const { JS_FreeContext(value); } };
class Value {
public:
    Value(JSContext* context, JSValue value): context_(context), value_(value) {}
    ~Value() { JS_FreeValue(context_, value_); }
    Value(const Value&) = delete;
    Value& operator=(const Value&) = delete;
    JSValueConst get() const { return value_; }
private:
    JSContext* context_;
    JSValue value_;
};
struct Budget { std::chrono::steady_clock::time_point deadline; bool exceeded = false; bool cancelled = false; };
int interrupt(JSRuntime*, void* opaque) noexcept {
    auto& budget = *static_cast<Budget*>(opaque);
    try { checkCancellation(); } catch (...) { budget.cancelled = true; return 1; }
    budget.exceeded = std::chrono::steady_clock::now() >= budget.deadline;
    return budget.exceeded ? 1 : 0;
}
std::string stringOf(JSContext* context, JSValueConst value) {
    std::size_t length = 0;
    const char* text = JS_ToCStringLen(context, &length, value);
    if (!text) { return "JavaScript exception (message unavailable)"; }
    if (length > 2 * 1024 * 1024) { JS_FreeCString(context, text); throw Error("SCRIPT_LIMIT", "Script serialized output exceeds byte budget"); }
    std::string result(text, length);
    JS_FreeCString(context, text);
    return result;
}
JSValue worldGet(JSContext* context, JSValueConst, int argc, JSValueConst* argv) noexcept {
    try {
        if (argc != 1 || !JS_IsString(argv[0])) { return JS_ThrowTypeError(context, "world.get requires an entity ID"); }
        const auto* world = static_cast<const ScriptWorld*>(JS_GetContextOpaque(context));
        const auto id = stringOf(context, argv[0]);
        const Json* entity = world ? world->find(id) : nullptr;
        if (!entity) { return JS_NULL; }
        const auto text = entity->dump();
        if (text.size() > 1024 * 1024) { return JS_ThrowRangeError(context, "World entity exceeds query budget"); }
        return JS_ParseJSON(context, text.data(), text.size(), "world-entity.json");
    } catch (...) { return JS_ThrowInternalError(context, "World query failed"); }
}
Json execute(const Json& call, bool validateOnly, const ScriptWorld* world) {
    const auto source = call.value("source", "");
    const auto scriptId = call.value("scriptId", call.value("behaviorId", "script"));
    const auto limits = call.value("limits", Json::object());
    const int maxMs = std::clamp(limits.value("maxTickMs", 20), 1, 100);
    if (source.empty() || source.size() > MAX_SOURCE_BYTES) { throw Error("SCRIPT_LIMIT", "Script source is empty or exceeds source budget", scriptId); }
    auto input = call; input.erase("world");
    const auto inputText = input.dump();
    if (inputText.size() > MAX_INPUT_BYTES) { throw Error("SCRIPT_LIMIT", "Script input exceeds byte budget", scriptId); }
    Budget budget{std::chrono::steady_clock::now() + std::chrono::milliseconds(maxMs)};
    std::unique_ptr<JSRuntime, RuntimeDeleter> runtime(JS_NewRuntime());
    if (!runtime) { throw Error("SCRIPT_LIMIT", "Cannot allocate script runtime", scriptId); }
    JS_SetMemoryLimit(runtime.get(), 16 * 1024 * 1024);
    JS_SetMaxStackSize(runtime.get(), 256 * 1024);
    JS_SetInterruptHandler(runtime.get(), interrupt, &budget);
    std::unique_ptr<JSContext, ContextDeleter> context(JS_NewContext(runtime.get()));
    if (!context) { throw Error("SCRIPT_LIMIT", "Cannot allocate script realm", scriptId); }
    JS_SetContextOpaque(context.get(), const_cast<ScriptWorld*>(world));
    {
        Value global(context.get(), JS_GetGlobalObject(context.get()));
        JS_DefinePropertyValueStr(context.get(), global.get(), "__nativeWorldGet",
            JS_NewCFunction(context.get(), worldGet, "worldGet", 1), 0);
    }
    auto eval = [&](const std::string& code, const std::string& filename) {
        Value value(context.get(), JS_Eval(context.get(), code.data(), code.size(), filename.c_str(), JS_EVAL_TYPE_GLOBAL));
        if (JS_IsException(value.get())) {
            // Exception getters and string conversion remain interruptible guest execution.
            Value exception(context.get(), JS_GetException(context.get()));
            std::string message = stringOf(context.get(), exception.get());
            Value stack(context.get(), JS_GetPropertyStr(context.get(), exception.get(), "stack"));
            if (!JS_IsUndefined(stack.get())) { message += "\n" + stringOf(context.get(), stack.get()); }
            Value global(context.get(), JS_GetGlobalObject(context.get()));
            Value hook(context.get(), JS_GetPropertyStr(context.get(), global.get(), "__nativeHook"));
            Json diagnostic{{"hook",stringOf(context.get(), hook.get())},{"scriptId",scriptId},{"maxTickMs",maxMs},{"entityId",call.value("entityId", "")},{"behaviorId",call.value("behaviorId", "")},
                {"sourceDigest",call.value("sourceDigest", "")},{"tick",call.value("tick", 0)}, {"message",message}};
            if (budget.cancelled) { throw Error("CANCELLED", "Script cancelled", scriptId); }
            Error failure(budget.exceeded ? "SCRIPT_LIMIT" : "SCRIPT_ERROR", message, scriptId);
            failure.details = std::move(diagnostic);
            throw failure;
        }
        return stringOf(context.get(), value.get());
    };
    // Capture builtins before the behavior can mutate them. No std/os modules are installed.
    const std::string setup = R"JS(
'use strict';
globalThis.__nativeInput = JSON.parse()JS" + Json(inputText).dump() + R"JS();
Object.defineProperty(globalThis, '__nativeRun', {value: (() => {
 const stringify = JSON.stringify.bind(JSON), parse = JSON.parse.bind(JSON), freeze = Object.freeze;
 const input = __nativeInput; delete globalThis.__nativeInput;
 const limits = input.limits || {}, maxCommands = Math.min(limits.maxCommands || 128,1024), maxTimers = Math.min(limits.maxTimers || 32,128);
 const maxStateBytes = Math.min(limits.maxStateBytes || 65536,1048576);
 let rng = (input.rngState === undefined ? 1 : input.rngState) >>> 0;
 const commands = [], logs = [], hooks = [];
 let currentHook = 'source';
 Object.defineProperty(globalThis,'__nativeHook',{get:()=>currentHook,configurable:false});
 let timers = (input.timers || []).map(t => ({name:t.name,at:t.at,every:t.every}));
 let state = input.state === undefined ? {} : input.state;
 const random = () => { rng = (Math.imul(1664525,rng)+1013904223)>>>0; return rng/4294967296; };
 Object.defineProperty(Math,'random',{value:random,writable:false,configurable:false});
 globalThis.Date = undefined; globalThis.Promise = undefined; globalThis.WeakRef = undefined; globalThis.FinalizationRegistry = undefined;
 globalThis.eval = undefined; globalThis.Function = undefined;
 const clone = v => parse(stringify(v));
 const deepFreeze = v => { if(v && typeof v==='object') { freeze(v); for(const k of Object.keys(v)) deepFreeze(v[k]); } return v; };
 const worldGet=__nativeWorldGet;
 globalThis.command = c => { if(commands.length>=maxCommands) throw Error('Command budget exceeded'); commands.push(c); };
 globalThis.log = (...values) => { if(logs.length>=64) throw Error('Log budget exceeded'); const line=stringify(values); if(line.length>4096) throw Error('Log byte budget exceeded'); logs.push(line); };
 const schedule = (ticks,name,repeat) => { if(!Number.isSafeInteger(ticks)||ticks<1||ticks>1000000||typeof name!=='string'||name.length>128) throw Error('Invalid timer'); timers=timers.filter(t=>t.name!==name); if(timers.length>=maxTimers) throw Error('Timer budget exceeded'); timers.push({name,at:input.tick+ticks,...(repeat?{every:ticks}:{})}); };
 globalThis.after=(ticks,name)=>schedule(ticks,name,false); globalThis.every=(ticks,name)=>schedule(ticks,name,true);
 globalThis.cancelTimer=name=>{timers=timers.filter(t=>t.name!==name);};
 const world = freeze({get:id=>deepFreeze(worldGet(id)),query:q=>command({...q,kind:'query'})});
 return behavior => {
   if(!behavior || (typeof behavior!=='object'&&typeof behavior!=='function')) throw Error('Behavior must be a function or lifecycle object');
   const arg={...input,state,world,random,command,log};
   const accept = result => {
     if(result && typeof result.then==='function') throw Error('Async behavior results are unsupported');
     if(result!==undefined) { if(result===null || typeof result!=='object') throw Error('Behavior result must be an object'); if('state' in result) arg.state=result.state; if(result.commands!==undefined) {if(!Array.isArray(result.commands)) throw Error('commands must be an array'); for(const c of result.commands) command(c);} }
   };
   const hook = name => { const fn=behavior[name]; if(fn!==undefined) {if(typeof fn!=='function') throw Error('Hook '+name+' must be a function'); hooks.push(name); currentHook=name; accept(fn.call(behavior,arg));} };
   for(const name of ['onStart','onSceneEnter','onTriggerEnter','onTriggerExit','onContact','onEvent','onFixedUpdate','onUpdate','onDestroy']) { if(behavior[name]!==undefined && typeof behavior[name]!=='function') throw Error('Hook '+name+' must be a function'); }
   if(input.validateOnly) return stringify({valid:true});
   if(typeof behavior==='function') {if(!input.lifecycle || !input.lifecycle.destroy) {currentHook='update'; accept(behavior(arg));}}
   else if(input.lifecycle && input.lifecycle.destroy) hook('onDestroy');
   else {
     const life=input.lifecycle || {};
     if(life.start || (life.started === undefined && input.tick === 0)) hook('onStart');
     if(life.sceneEnter) hook('onSceneEnter');
     for(const contact of life.contacts || []) { arg.contact=contact; if(contact.sensor && contact.phase==='enter') hook('onTriggerEnter'); else if(contact.sensor && contact.phase==='exit') hook('onTriggerExit'); else hook('onContact'); }
     for(const event of input.events || []) {arg.event=event; hook('onEvent');}
     const due=timers.filter(t=>t.at<=input.tick).sort((a,b)=>a.at-b.at || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
     timers=timers.filter(t=>t.at>input.tick);
     for(const t of due) {if(t.every) timers.push({...t,at:input.tick+t.every}); hook(t.name);}
     hook('onFixedUpdate'); hook('onUpdate');
   }
   if(timers.length>maxTimers) throw Error('Timer budget exceeded');
   const stateText=stringify(arg.state, (key,value)=>{ if(value===undefined || typeof value==='function' || typeof value==='symbol' || typeof value==='bigint' || (typeof value==='number' && !Number.isFinite(value))) throw Error('State must contain only JSON values'); return value; }); if(stateText===undefined || stateText.length>maxStateBytes) throw Error('State byte budget exceeded');
   const output=stringify({state:parse(stateText),commands,rngState:rng,timers,logs,hooks});
   if(output.length>maxStateBytes+1048576) throw Error('Output byte budget exceeded');
   return output;
 };
})(), writable:false, configurable:false});
'initialized';
)JS";
    eval(setup, "native-script-host.js");
    // Expression semantics follow the TS game runtime: function or lifecycle object.
    std::string expression = "globalThis.__nativeBehavior = (\n" + source + "\n); 'compiled';";
    eval(expression, scriptId + ".js");
    const auto output = eval("__nativeRun(__nativeBehavior)", "native-script-dispatch.js");
    if (JS_IsJobPending(runtime.get())) { throw Error("SCRIPT_ERROR", "Queued promise work is unsupported", scriptId); }
    if (budget.exceeded || std::chrono::steady_clock::now() >= budget.deadline) { throw Error("SCRIPT_LIMIT", "Script call budget exceeded", scriptId); }
    auto result = Json::parse(output);
    if (validateOnly) { return result; }
    const auto stateBudget = std::clamp(limits.value("maxStateBytes", 65536), 1, 1048576);
    if (result.at("state").dump().size() > static_cast<std::size_t>(stateBudget)) { throw Error("SCRIPT_LIMIT", "Script state exceeds byte budget", scriptId); }
    static const Json commandSchema = Json::parse(EmbeddedCommandsSchema);
    static const Json command2dSchema = Json::parse(EmbeddedCommands2DSchema);
    const auto dimension = call.value("dimension", std::string("3d"));
    if (dimension != "2d" && dimension != "3d") { throw Error("SCRIPT_ERROR", "Unsupported script dimension", scriptId); }
    for (auto& command : result.at("commands")) {
        try { command = normalizeSchema(dimension == "2d" ? command2dSchema : commandSchema, command); }
        catch (const Error& error) { throw Error("SCRIPT_ERROR", std::string("Invalid script command: ") + error.what(), scriptId); }
        if (command.at("kind") == "save") { validateSaveData(command.at("data")); }
    }
    return result;
}
}
ScriptWorld::ScriptWorld(const Json& entities) {
    if (!entities.is_array() && !entities.is_object()) { throw Error("SCRIPT_ERROR", "World view must contain entities"); }
    if (entities.size() > 100000) { throw Error("SCRIPT_LIMIT", "World entity budget exceeded"); }
    entities_.reserve(entities.size());
    for (const auto& entity : entities) {
        if (entity.is_object() && entity.contains("id") && entity.at("id").is_string()) { entities_.emplace(entity.at("id").get<std::string>(), &entity); }
    }
}
const Json* ScriptWorld::find(const std::string& id) const {
    const auto found = entities_.find(id);
    return found == entities_.end() ? nullptr : found->second;
}
Json ScriptHost::invoke(const Json& call) const {
    const auto worldData = call.value("world", Json::array());
    const ScriptWorld world(worldData);
    return invoke(call, world);
}
Json ScriptHost::invoke(const Json& call, const ScriptWorld& world) const {
    try { return execute(call, false, &world); }
    catch (const Error& error) {
        auto failure = error;
        if (failure.details.empty()) {
            failure.details = {{"entityId",call.value("entityId", "")},{"behaviorId",call.value("behaviorId", "")},
                {"sourceDigest",call.value("sourceDigest", "")},{"tick",call.value("tick", 0)}, {"message",error.what()}};
        }
        throw failure;
    }
    catch (const std::exception& error) { throw Error("SCRIPT_ERROR", error.what(), call.value("behaviorId", "script")); }
}
void ScriptHost::validateSource(const std::string& source, const std::string& scriptId) const {
    execute(Json{{"source",source},{"scriptId",scriptId},{"validateOnly",true},{"limits",{{"maxTickMs",100}}}}, true, nullptr);
}
}
