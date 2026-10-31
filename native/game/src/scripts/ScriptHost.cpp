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
// Installed once in each realm. Builtins are captured before guest code runs, then every
// object reachable from the global object is frozen so no call can leave hidden state behind.
const char* const HARNESS = R"JS(
'use strict';
(() => {
 const stringify = JSON.stringify.bind(JSON), parse = JSON.parse.bind(JSON), freeze = Object.freeze;
 const {defineProperty, getOwnPropertyDescriptor, getPrototypeOf} = Object, ownKeys = Reflect.ownKeys;
 const worldGet = __nativeWorldGet; delete globalThis.__nativeWorldGet;
 let call = null, currentHook = 'source';
 const active = () => { if (!call) throw Error('Script host is idle'); return call; };
 defineProperty(globalThis,'__nativeHook',{get:()=>currentHook,configurable:false});
 const random = () => { const c = active(); c.rng = (Math.imul(1664525,c.rng)+1013904223)>>>0; return c.rng/4294967296; };
 defineProperty(Math,'random',{value:random,writable:false,configurable:false});
 globalThis.Date = undefined; globalThis.Promise = undefined; globalThis.WeakRef = undefined; globalThis.FinalizationRegistry = undefined;
 globalThis.eval = undefined; globalThis.Function = undefined;
 const deepFreeze = v => { if(v && typeof v==='object') { freeze(v); for(const k of Object.keys(v)) deepFreeze(v[k]); } return v; };
 const command = c => { const a = active(); if(a.commands.length>=a.maxCommands) throw Error('Command budget exceeded'); a.commands.push(c); };
 globalThis.command = command;
 const log = (...values) => { const a = active(); if(a.logs.length>=64) throw Error('Log budget exceeded'); const line=stringify(values); if(line.length>4096) throw Error('Log byte budget exceeded'); a.logs.push(line); };
 globalThis.log = log;
 const schedule = (ticks,name,repeat) => { const a = active(); if(!Number.isSafeInteger(ticks)||ticks<1||ticks>1000000||typeof name!=='string'||name.length>128) throw Error('Invalid timer'); a.timers=a.timers.filter(t=>t.name!==name); if(a.timers.length>=a.maxTimers) throw Error('Timer budget exceeded'); a.timers.push({name,at:a.input.tick+ticks,...(repeat?{every:ticks}:{})}); };
 globalThis.after=(ticks,name)=>schedule(ticks,name,false); globalThis.every=(ticks,name)=>schedule(ticks,name,true);
 globalThis.cancelTimer=name=>{const a = active(); a.timers=a.timers.filter(t=>t.name!==name);};
 const world = freeze({get:id=>deepFreeze(worldGet(id)),query:q=>command({...q,kind:'query'})});
 // Frozen prototypes would block `instance.name = v` (the override mistake). These accessors
 // assign an own property on the instance and keep the prototype itself read-only.
 const overridable = (proto, names) => { for (const k of names) { const d = getOwnPropertyDescriptor(proto,k); if (!d || !('value' in d)) continue; const v = d.value;
   defineProperty(proto,k,{get(){return v;},set(next){ if(this===proto) throw TypeError('Cannot assign to read only property '+String(k)); defineProperty(this,k,{value:next,writable:true,enumerable:true,configurable:true}); },enumerable:d.enumerable,configurable:false}); } };
 overridable(Object.prototype, ownKeys(Object.prototype).filter(k=>k!=='__proto__'));
 overridable(getPrototypeOf(()=>{}), ['constructor','toString']);
 for (const E of [Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError, AggregateError]) overridable(E.prototype, ['constructor','name','message','toString']);
 const reached = new Set();
 const visit = o => { if (o===null || (typeof o!=='object' && typeof o!=='function') || reached.has(o)) return; reached.add(o); visit(getPrototypeOf(o));
   for (const k of ownKeys(o)) { const d = getOwnPropertyDescriptor(o,k); if ('value' in d) visit(d.value); else { visit(d.get); visit(d.set); } } };
 visit(globalThis); visit(world);
 for (const o of reached) freeze(o);
 return (inputText, factory) => {
   const input = parse(inputText), limits = input.limits || {};
   call = {input, commands:[], logs:[], hooks:[], rng:(input.rngState === undefined ? 1 : input.rngState) >>> 0,
     maxCommands:Math.min(limits.maxCommands || 128,1024), maxTimers:Math.min(limits.maxTimers || 32,128),
     timers:(input.timers || []).map(t => ({name:t.name,at:t.at,every:t.every}))};
   currentHook = 'source';
   const c = call, maxStateBytes = Math.min(limits.maxStateBytes || 65536,1048576);
   try {
     const behavior = factory();
     if(!behavior || (typeof behavior!=='object'&&typeof behavior!=='function')) throw Error('Behavior must be a function or lifecycle object');
     const arg={...input,state:input.state === undefined ? {} : input.state,world,random,command,log};
     const accept = result => {
       if(result && typeof result.then==='function') throw Error('Async behavior results are unsupported');
       if(result!==undefined) { if(result===null || typeof result!=='object') throw Error('Behavior result must be an object'); if('state' in result) arg.state=result.state; if(result.commands!==undefined) {if(!Array.isArray(result.commands)) throw Error('commands must be an array'); for(const x of result.commands) command(x);} }
     };
     const hook = name => { const fn=behavior[name]; if(fn!==undefined) {if(typeof fn!=='function') throw Error('Hook '+name+' must be a function'); c.hooks.push(name); currentHook=name; accept(fn.call(behavior,arg));} };
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
       const due=c.timers.filter(t=>t.at<=input.tick).sort((a,b)=>a.at-b.at || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
       c.timers=c.timers.filter(t=>t.at>input.tick);
       for(const t of due) {if(t.every) c.timers.push({...t,at:input.tick+t.every}); hook(t.name);}
       hook('onFixedUpdate'); hook('onUpdate');
     }
     if(c.timers.length>c.maxTimers) throw Error('Timer budget exceeded');
     const stateText=stringify(arg.state, (key,value)=>{ if(value===undefined || typeof value==='function' || typeof value==='symbol' || typeof value==='bigint' || (typeof value==='number' && !Number.isFinite(value))) throw Error('State must contain only JSON values'); return value; }); if(stateText===undefined || stateText.length>maxStateBytes) throw Error('State byte budget exceeded');
     const output=stringify({state:parse(stateText),commands:c.commands,rngState:c.rng,timers:c.timers,logs:c.logs,hooks:c.hooks});
     if(output.length>maxStateBytes+1048576) throw Error('Output byte budget exceeded');
     return output;
   } finally { call = null; }
 };
})()
)JS";
constexpr std::size_t MAX_REALMS = 256;
constexpr std::size_t GUEST_MEMORY_BYTES = 16 * 1024 * 1024;
// Distinguishes a guest exception, after which only its realm is discarded, from runtime faults.
struct GuestError { Error error; };
}
struct ScriptHost::Engine {
    struct Realm {
        JSContext* context = nullptr;
        JSValue run = JS_UNDEFINED;
        JSValue factory = JS_UNDEFINED;
    };
    std::unique_ptr<JSRuntime, RuntimeDeleter> runtime;
    std::unordered_map<std::string, Realm> realms;
    Budget budget;
    std::size_t baselineBytes = 0;
    Engine(): runtime(JS_NewRuntime()) {
        if (!runtime) { throw Error("SCRIPT_LIMIT", "Cannot allocate script runtime"); }
        JS_SetMaxStackSize(runtime.get(), 256 * 1024);
        JS_SetInterruptHandler(runtime.get(), interrupt, &budget);
    }
    ~Engine() { clear(); }
    Engine(const Engine&) = delete;
    Engine& operator=(const Engine&) = delete;
    static void release(Realm& realm) {
        JS_FreeValue(realm.context, realm.run);
        JS_FreeValue(realm.context, realm.factory);
        JS_FreeContext(realm.context);
    }
    void clear() { for (auto& [source, realm] : realms) { release(realm); } realms.clear(); }
    void discard(const std::string& source) {
        const auto found = realms.find(source);
        if (found != realms.end()) { release(found->second); realms.erase(found); }
    }
    void measureBaseline() {
        JSMemoryUsage usage{};
        JS_ComputeMemoryUsage(runtime.get(), &usage);
        baselineBytes = static_cast<std::size_t>(usage.malloc_size);
    }
};
namespace {
Json execute(ScriptHost::Engine& engine, const Json& call, bool validateOnly, const ScriptWorld* world) {
    const auto source = call.value("source", "");
    const auto scriptId = call.value("scriptId", call.value("behaviorId", "script"));
    const auto limits = call.value("limits", Json::object());
    const int maxMs = std::clamp(limits.value("maxTickMs", 20), 1, 100);
    if (source.empty() || source.size() > MAX_SOURCE_BYTES) { throw Error("SCRIPT_LIMIT", "Script source is empty or exceeds source budget", scriptId); }
    auto input = call; input.erase("world");
    if (validateOnly) { input["validateOnly"] = true; }
    const auto inputText = input.dump();
    if (inputText.size() > MAX_INPUT_BYTES) { throw Error("SCRIPT_LIMIT", "Script input exceeds byte budget", scriptId); }
    auto& budget = engine.budget;
    budget = Budget{std::chrono::steady_clock::now() + std::chrono::milliseconds(maxMs)};
    JSRuntime* runtime = engine.runtime.get();
    auto found = engine.realms.find(source);
    // Realm creation and the call each get the guest allowance above the memory the realms hold.
    JS_SetMemoryLimit(runtime, engine.baselineBytes + GUEST_MEMORY_BYTES);
    JSContext* context = found == engine.realms.end() ? nullptr : found->second.context;
    auto check = [&](JSContext* ctx, JSValue value) {
        if (!JS_IsException(value)) { return value; }
        // Exception getters and string conversion remain interruptible guest execution.
        Value exception(ctx, JS_GetException(ctx));
        std::string message = stringOf(ctx, exception.get());
        Value stack(ctx, JS_GetPropertyStr(ctx, exception.get(), "stack"));
        if (!JS_IsUndefined(stack.get())) { message += "\n" + stringOf(ctx, stack.get()); }
        Value global(ctx, JS_GetGlobalObject(ctx));
        Value hook(ctx, JS_GetPropertyStr(ctx, global.get(), "__nativeHook"));
        Json diagnostic{{"hook",JS_IsUndefined(hook.get()) ? std::string("source") : stringOf(ctx, hook.get())},{"scriptId",scriptId},{"maxTickMs",maxMs},{"entityId",call.value("entityId", "")},{"behaviorId",call.value("behaviorId", "")},
            {"sourceDigest",call.value("sourceDigest", "")},{"tick",call.value("tick", 0)}, {"message",message}};
        if (budget.cancelled) { throw Error("CANCELLED", "Script cancelled", scriptId); }
        Error failure(budget.exceeded ? "SCRIPT_LIMIT" : "SCRIPT_ERROR", message, scriptId);
        failure.details = std::move(diagnostic);
        if (budget.exceeded) { throw failure; }
        throw GuestError{std::move(failure)};
    };
    if (!context) {
        if (engine.realms.size() >= MAX_REALMS) { engine.clear(); engine.measureBaseline(); JS_SetMemoryLimit(runtime, engine.baselineBytes + GUEST_MEMORY_BYTES); }
        std::unique_ptr<JSContext, ContextDeleter> created(JS_NewContext(runtime));
        if (!created) { throw Error("SCRIPT_LIMIT", "Cannot allocate script realm", scriptId); }
        JSContext* ctx = created.get();
        {
            Value global(ctx, JS_GetGlobalObject(ctx));
            JS_DefinePropertyValueStr(ctx, global.get(), "__nativeWorldGet", JS_NewCFunction(ctx, worldGet, "worldGet", 1), JS_PROP_CONFIGURABLE);
        }
        const std::string harness(HARNESS);
        Value run(ctx, check(ctx, JS_Eval(ctx, harness.data(), harness.size(), "native-script-host.js", JS_EVAL_TYPE_GLOBAL)));
        // Expression semantics follow the TS game runtime: function or lifecycle object.
        const std::string expression = "(function () { return (\n" + source + "\n); })";
        Value factory(ctx, check(ctx, JS_Eval(ctx, expression.data(), expression.size(), (scriptId + ".js").c_str(), JS_EVAL_TYPE_GLOBAL)));
        ScriptHost::Engine::Realm realm{ctx, JS_DupValue(ctx, run.get()), JS_DupValue(ctx, factory.get())};
        created.release();
        found = engine.realms.emplace(source, realm).first;
        context = ctx;
        engine.measureBaseline();
        JS_SetMemoryLimit(runtime, engine.baselineBytes + GUEST_MEMORY_BYTES);
    }
    const auto& realm = found->second;
    JS_SetContextOpaque(context, const_cast<ScriptWorld*>(world));
    std::string output;
    {
        JSValue args[2] = {JS_NewStringLen(context, inputText.data(), inputText.size()), realm.factory};
        Value text(context, check(context, [&] { const auto result = JS_Call(context, realm.run, JS_UNDEFINED, 2, args); JS_FreeValue(context, args[0]); return result; }()));
        output = stringOf(context, text.get());
    }
    JS_SetContextOpaque(context, nullptr);
    if (JS_IsJobPending(runtime)) { throw Error("SCRIPT_ERROR", "Queued promise work is unsupported", scriptId); }
    if (budget.exceeded || std::chrono::steady_clock::now() >= budget.deadline) { throw Error("SCRIPT_LIMIT", "Script call budget exceeded", scriptId); }
    auto result = Json::parse(output);
    if (validateOnly) { return result; }
    const auto stateBudget = std::clamp(limits.value("maxStateBytes", 65536), 1, 1048576);
    if (result.at("state").dump().size() > static_cast<std::size_t>(stateBudget)) { throw GuestError{Error("SCRIPT_LIMIT", "Script state exceeds byte budget", scriptId)}; }
    static const Json commandSchema = Json::parse(EmbeddedCommandsSchema);
    static const Json command2dSchema = Json::parse(EmbeddedCommands2DSchema);
    const auto dimension = call.value("dimension", std::string("3d"));
    if (dimension != "2d" && dimension != "3d") { throw GuestError{Error("SCRIPT_ERROR", "Unsupported script dimension", scriptId)}; }
    for (auto& command : result.at("commands")) {
        try { command = normalizeSchema(dimension == "2d" ? command2dSchema : commandSchema, command); }
        catch (const Error& error) { throw GuestError{Error("SCRIPT_ERROR", std::string("Invalid script command: ") + error.what(), scriptId)}; }
        if (command.at("kind") == "save") { validateSaveData(command.at("data")); }
    }
    return result;
}
// A guest exception discards its realm. Any other failure (limit, cancellation, memory,
// queued jobs) may leave runtime-wide state behind, so it replaces the whole runtime.
Json guarded(std::unique_ptr<ScriptHost::Engine>& engine, const Json& call, bool validateOnly, const ScriptWorld* world) {
    if (!engine) { engine = std::make_unique<ScriptHost::Engine>(); }
    const auto source = call.value("source", "");
    try { return execute(*engine, call, validateOnly, world); }
    catch (GuestError& failure) { engine->discard(source); engine->measureBaseline(); throw failure.error; }
    catch (...) { engine.reset(); throw; }
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
ScriptHost::ScriptHost() = default;
ScriptHost::~ScriptHost() = default;
ScriptHost::ScriptHost(ScriptHost&&) noexcept = default;
ScriptHost& ScriptHost::operator=(ScriptHost&&) noexcept = default;
Json ScriptHost::invoke(const Json& call) {
    const auto worldData = call.value("world", Json::array());
    const ScriptWorld world(worldData);
    return invoke(call, world);
}
Json ScriptHost::invoke(const Json& call, const ScriptWorld& world) {
    try { return guarded(engine_, call, false, &world); }
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
void ScriptHost::validateSource(const std::string& source, const std::string& scriptId) {
    guarded(engine_, Json{{"source",source},{"scriptId",scriptId},{"limits",{{"maxTickMs",100}}}}, true, nullptr);
}
}
