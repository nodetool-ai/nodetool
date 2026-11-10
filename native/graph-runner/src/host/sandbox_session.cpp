// Cooperative nested QuickJS sessions. Each bridge call suspends on a promise;
// the workflow guest services it asynchronously before resuming this runtime.
#include "host/sandbox_session.h"
#include <quickjs.h>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <chrono>
#include <climits>
#include <cmath>
#include <cstdint>
#include <deque>
#include <map>
#include <memory>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>
#if !defined(_WIN32)
#include <pthread.h>
#endif

namespace gr::host {
namespace {
using Json = nlohmann::json;
using Clock = std::chrono::steady_clock;
std::string text(JSContext* ctx, JSValueConst value) {
  // native-rules #6: raw C string freed by hand with JS_FreeCString
  const char* raw = JS_ToCString(ctx,value);
  if (!raw) throw std::runtime_error("Sandbox value cannot be serialized");
  std::string out(raw); JS_FreeCString(ctx,raw); return out;
}
// The bytes of the current thread's stack below this frame, minus headroom
// for the C++ frames that the nested runtime's host calls add. Zero when the
// platform cannot tell.
size_t remainingStack() {
  constexpr size_t headroom = 1024*1024;
  char here = 0;
  const auto sp = reinterpret_cast<uintptr_t>(&here);
  uintptr_t low = 0;
#if defined(__APPLE__)
  const auto self = pthread_self();
  low = reinterpret_cast<uintptr_t>(pthread_get_stackaddr_np(self))-pthread_get_stacksize_np(self);
#elif defined(__linux__)
  pthread_attr_t attr;
  if (pthread_getattr_np(pthread_self(),&attr)!=0) return 0;
  void* addr=nullptr; size_t size=0;
  pthread_attr_getstack(&attr,&addr,&size);
  pthread_attr_destroy(&attr);
  low = reinterpret_cast<uintptr_t>(addr);
#endif
  if (!low || sp<=low+headroom) return 0;
  return sp-low-headroom;
}
size_t bounded(const Json& value, const char* key, size_t fallback, size_t lo, size_t hi) {
  if (!value.contains(key)) return fallback;
  const auto n = value.at(key).get<double>();
  if (!std::isfinite(n)) throw std::runtime_error("Sandbox limit must be finite");
  return size_t(std::clamp(n,double(lo),double(hi)));
}
unsigned idArg(js::Engine& en,const js::Value& v) {
  const double d=en.toNumber(v);
  if (!(d>=0 && d<=double(UINT_MAX)) || d!=std::floor(d))
    throw std::runtime_error("RangeError: sandbox: expected an integer id");
  return unsigned(d);
}
struct Session {
  std::unique_ptr<JSRuntime,decltype(&JS_FreeRuntime)> runtimeOwner{nullptr,JS_FreeRuntime};
  std::unique_ptr<JSContext,decltype(&JS_FreeContext)> contextOwner{nullptr,JS_FreeContext};
  JSRuntime* runtime = nullptr;
  JSContext* context = nullptr;
  std::function<bool()> cancelled;
  std::function<bool(const std::string&)> streamOpen;
  std::function<std::string(const std::string&,const std::string&)> synchronous;
  Clock::time_point deadline;
  // native-rules #6: raw JSValues freed by hand in the destructor
  std::map<unsigned, std::pair<JSValue,JSValue>> pending;
  std::deque<Json> events;
  unsigned serial = 0;
  std::set<unsigned> inputWaits;
  Clock::time_point suspendedAt;
  size_t outputLimit, outputBytes = 0;
  size_t stackLimit = 0;
  // Each entry runs at another depth of the outer stack. Measure from here
  // and give the runtime min(requested, remaining).
  void enter() {
    JS_UpdateStackTop(runtime);
    const auto remaining = remainingStack();
    JS_SetMaxStackSize(runtime, remaining ? std::min(stackLimit, remaining) : stackLimit);
  }
  size_t emitCalls = 0;
  std::string error;
  // native-rules #6: raw JSValue freed by hand in the destructor
  JSValue evaluation = JS_UNDEFINED;
  bool loaderLocked = false;
  std::map<std::string,std::string> moduleSources, moduleNames;
  static char* normalize(JSContext* ctx,const char* base,const char* requested,void* opaque) {
    auto& session=*static_cast<Session*>(opaque);
    try {
      if(session.loaderLocked) throw std::runtime_error("dynamic import() is not allowed in the sandbox");
      if(auto found=session.moduleNames.find(requested);found!=session.moduleNames.end()) return js_strdup(ctx,found->second.c_str());
      const std::string spec(requested), from(base);
      if(!spec.starts_with("./") && !spec.starts_with("../")) throw std::runtime_error("Module is not granted: "+spec);
      const auto split=from.find('#');
      if(split==std::string::npos) throw std::runtime_error("Relative module import has no granted pack");
      std::vector<std::string> parts;
      const auto path=from.substr(split+1);
      std::string joined=path.substr(0,path.rfind('/')==std::string::npos?0:path.rfind('/')+1)+spec;
      size_t cursor=0;
      while(cursor<=joined.size()) {
        auto end=joined.find('/',cursor);if(end==std::string::npos)end=joined.size();
        auto part=joined.substr(cursor,end-cursor);
        if(part=="..") {if(parts.empty())throw std::runtime_error("Module path escapes granted pack");parts.pop_back();}
        else if(!part.empty() && part!=".")parts.push_back(part);
        cursor=end+1;
      }
      std::string target=from.substr(0,split+1);
      for(size_t i=0;i<parts.size();++i) {if(i)target+='/';target+=parts[i];}
      if(!session.moduleSources.contains(target))throw std::runtime_error("Module is not granted: "+target);
      return js_strdup(ctx,target.c_str());
    } catch(const std::exception& error) {JS_ThrowReferenceError(ctx,"%s",error.what());return nullptr;}
  }
  static JSModuleDef* load(JSContext* ctx,const char* name,void* opaque) {
    auto& session=*static_cast<Session*>(opaque);
    auto found=session.moduleSources.find(name);
    if(found==session.moduleSources.end()) {JS_ThrowReferenceError(ctx,"Module is not granted: %s",name);return nullptr;}
    auto value=JS_Eval(ctx,found->second.c_str(),found->second.size(),name,JS_EVAL_TYPE_MODULE|JS_EVAL_FLAG_COMPILE_ONLY);
    if(JS_IsException(value))return nullptr;
    auto* module=static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(value));JS_FreeValue(ctx,value);return module;
  }
  Json outputs = Json::object(), emitted = Json::array(), logs = Json::array();

  static int interrupt(JSContext*,void* opaque) {
    const auto& session = *static_cast<Session*>(opaque);
    const auto now=Clock::now();
    const auto allowance=session.inputWaits.empty()?Clock::duration::zero():now-session.suspendedAt;
    return now>=session.deadline+allowance || allowance>std::chrono::minutes(30) || (session.cancelled && session.cancelled());
  }
  static JSValue sync(JSContext* ctx,JSValueConst,int count,JSValueConst* args) {
    auto& session=*static_cast<Session*>(JS_GetContextOpaque(ctx));
    try {
      if(count!=2 || !session.synchronous || ++session.serial>20000)throw std::runtime_error("Synchronous bridge is not granted");
      const auto value=session.synchronous(text(ctx,args[0]),text(ctx,args[1]));
      return JS_ParseJSON(ctx,value.c_str(),value.size(),"sync-bridge.json");
    }catch(const std::exception& error){return JS_ThrowInternalError(ctx,"%s",error.what());}
  }
  static JSValue open(JSContext* ctx,JSValueConst,int count,JSValueConst* args) {
    auto& session = *static_cast<Session*>(JS_GetContextOpaque(ctx));
    try {
      if(count != 1 || !JS_IsString(args[0])) throw std::runtime_error("stream.open: name must be a string");
      if(!session.streamOpen) throw std::runtime_error("stream() requires streaming-input mode; this run has no input stream");
      return JS_NewBool(ctx,session.streamOpen(text(ctx,args[0])));
    } catch(const std::exception& error) { return JS_ThrowInternalError(ctx,"%s",error.what()); }
  }
  static JSValue bridge(JSContext* ctx,JSValueConst,int count,JSValueConst* args) {
    auto& session = *static_cast<Session*>(JS_GetContextOpaque(ctx));
    try {
      if (count != 2 || ++session.serial > 20000) throw std::runtime_error("Sandbox bridge call limit exceeded");
      const auto operation = text(ctx,args[0]);
      const auto payload = text(ctx,args[1]);
      if (payload.size() > 10 * 1024 * 1024) throw std::runtime_error("Sandbox bridge size limit exceeded");
      // native-rules #6: raw JSValue freed by hand with JS_FreeValue, not an RAII handle
      JSValue functions[2];
      auto promise = JS_NewPromiseCapability(ctx,functions);
      session.pending.emplace(session.serial,std::pair{functions[0],functions[1]});
      if(operation=="take") {if(session.inputWaits.empty())session.suspendedAt=Clock::now();session.inputWaits.insert(session.serial);}
      session.events.push_back({{"token",session.serial},{"operation",operation},{"args",Json::parse(payload)}});
      return promise;
    } catch(const std::exception& error) { return JS_ThrowInternalError(ctx,"%s",error.what()); }
  }
  void evaluate(const std::string& code,const char* filename) {
    // native-rules #6: raw JSValue freed by hand with JS_FreeValue, not an RAII handle
    auto value = JS_Eval(context,code.c_str(),code.size(),filename,JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(value)) {
      // native-rules #6: raw JSValue freed by hand with JS_FreeValue, not an RAII handle
      auto exception = JS_GetException(context); error = text(context,exception); JS_FreeValue(context,exception);
    }
    JS_FreeValue(context,value);
  }
  Session(const Json& options,std::function<bool()> stop,std::function<bool(const std::string&)> isOpen,std::function<std::string(const std::string&,const std::string&)> syncBridge):cancelled(std::move(stop)),streamOpen(std::move(isOpen)),synchronous(std::move(syncBridge)) {
    const auto limits = options.value("limits",Json::object());
    outputLimit = bounded(limits,"maxOutputSize",100000,1024,10*1024*1024);
    deadline = Clock::now()+std::chrono::milliseconds(bounded(options,"timeoutMs",30000,1,600000));
    runtimeOwner.reset(JS_NewRuntime());
    runtime = runtimeOwner.get();
    if (!runtime) throw std::runtime_error("Cannot allocate sandbox runtime");
    JS_SetMemoryLimit(runtime,bounded(limits,"memoryLimitBytes",64*1024*1024,1024*1024,512*1024*1024));
    stackLimit = bounded(limits,"stackLimitBytes",512*1024,16*1024,8*1024*1024);
    enter();
    JS_SetInterruptHandler(runtime,interrupt,this);
    contextOwner.reset(JS_NewContext(runtime));
    context = contextOwner.get();
    if (!context) throw std::runtime_error("Cannot allocate sandbox context");
    JS_SetContextOpaque(context,this);
    size_t sourceBytes=0;
    for(const auto& module:options.value("modules",Json::array())) {
      if(module.at("kind")!="js") throw std::runtime_error("Only granted JavaScript modules may load");
      const auto pack=module.at("packName").get<std::string>();
      const auto entry=pack+"#"+module.at("moduleId").get<std::string>();
      moduleNames[module.at("specifier").get<std::string>()]=entry;
      moduleSources[entry]=module.at("source").get<std::string>();
      for(const auto& file:module.at("graph")) {
        if(file.at("kind")!="js")throw std::runtime_error("Only granted JavaScript module files may load");
        moduleSources[pack+"#"+file.at("id").get<std::string>()]=file.at("source").get<std::string>();
      }
    }
    for(const auto& [_,source]:moduleSources)sourceBytes+=source.size();
    if(sourceBytes>16*1024*1024)throw std::runtime_error("Sandbox module source limit exceeded");
    JS_SetModuleLoaderFunc(runtime,normalize,load,this);
    // native-rules #6: raw JSValue freed by hand with JS_FreeValue, not an RAII handle
    auto global=JS_GetGlobalObject(context);
    JS_SetPropertyStr(context,global,"__sync",JS_NewCFunction(context,sync,"sync",2));
    JS_SetPropertyStr(context,global,"__openStream",JS_NewCFunction(context,open,"streamOpen",1));
    JS_SetPropertyStr(context,global,"__nativeBridge",JS_NewCFunction(context,bridge,"bridge",2));
    JS_FreeValue(context,global);
    const auto globals = options.value("globals",Json::object());
    {
      // Parse the globals once, without a quoted copy inside a script.
      const auto encoded=globals.dump();
      // native-rules #6: raw JSValue freed by hand with JS_FreeValue, not an RAII handle
      auto parsed=JS_ParseJSON(context,encoded.c_str(),encoded.size(),"sandbox-data.json");
      if(JS_IsException(parsed)) {auto ex=JS_GetException(context);error=text(context,ex);JS_FreeValue(context,ex);}
      else {auto global=JS_GetGlobalObject(context);JS_SetPropertyStr(context,global,"__sandboxGlobals",parsed);JS_FreeValue(context,global);}
      evaluate("Object.assign(globalThis,globalThis.__sandboxGlobals);delete globalThis.__sandboxGlobals;","sandbox-data.js");
    }
    evaluate(R"JS(
const __serialize = value => JSON.stringify(value,function(key,encoded){
 const raw=this[key];
 if(raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
   const bytes=raw instanceof Uint8Array?raw:new Uint8Array(raw);
   return {__nodetool_sandbox_bytes__:bytes.toBase64()};
 }
 return encoded;
});
globalThis.__serialize=__serialize;
const __revive=value=>{
 if(value && typeof value==='object') {
   if(typeof value.__nodetool_sandbox_bytes__==='string')return Uint8Array.fromBase64(value.__nodetool_sandbox_bytes__);
   for(const key of Object.keys(value))value[key]=__revive(value[key]);
 }
 return value;
};
for(const key of Object.keys(globalThis))if(key!=='__nativeBridge')globalThis[key]=__revive(globalThis[key]);
globalThis.__revive=__revive;
const __bridge = (op,args=[]) => __nativeBridge(op,__serialize(args));
globalThis.output = (name,value) => __bridge('output',[name,value]);
globalThis.emit = (name,value) => __bridge('emit',[name,value]);
globalThis.__callTool = (name,args) => __bridge('tool',[name,args]);
globalThis.__nativeCapabilityDispatch = (...args)=>__bridge('capabilityModule',args);
globalThis.__nativeWasmDispatch = (...args) => __bridge('wasmModule',args);
globalThis.__nativeHostDispatch = (...args) => __bridge('hostModule',args);
globalThis.getSecret = name => __bridge('secret',[name]);
globalThis.sleep = ms => __bridge('sleep',[ms]);
globalThis.progress = (percent,message) => __bridge('progress',[percent,message]);
globalThis.console = Object.fromEntries(['log','info','warn','error'].map(level=>[level,(...args)=>__bridge('log',[level,args.map(String).join(' ').slice(0,4000)])]));
globalThis.workspace = Object.fromEntries(['readText','readBytes','writeBytes','write','read','stat','list','root','mkdir','remove','delete','copy','move','exists'].map(name=>[name,(...args)=>__bridge('workspace.'+name,args)]));
globalThis.assetToSandbox = (...args)=>__bridge('assetToSandbox',args);
globalThis.sandboxToAsset = (...args)=>__bridge('sandboxToAsset',args);
globalThis.fetch = async (...args)=>{
 const response=await __bridge('fetch',args);const bytes=__revive(response.bodyBytes);delete response.bodyBytes;
 return {...response,text:async()=>response.body,json:async()=>JSON.parse(response.body),bytes:async()=>bytes,arrayBuffer:async()=>bytes.buffer};
};
for(const namespace of ['format','crypto','image','canvas','audio','video','media'])globalThis[namespace]=new Proxy({}, {get(target,member){if(Object.hasOwn(target,member))return target[member];if(member==='then')return undefined;return (...args)=>__bridge('helper',[namespace,member,args]);}});
globalThis.crypto.randomUUID = ()=>__sync('randomUUID','[]');
globalThis.crypto.getRandomValues = size=>__revive(__sync('randomBytes',JSON.stringify([size])));
globalThis.stream = name => ({async *[Symbol.asyncIterator]() { for (;;) {const item=await __bridge('take',[name]);if(item.done)return;yield item.value;} }});
globalThis.stream.any = () => ({async *[Symbol.asyncIterator]() {for(;;){const item=await __bridge('take',[null]);if(item.done)return;yield [item.handle,item.value];} }});
globalThis.stream.first = async name => {const item=await __bridge('take',[name]);return item.done?undefined:item.value;};
globalThis.stream.open = name => __openStream(name);
globalThis.__runDone = false;
)JS","sandbox-init.js");
    evaluate(options.value("bootstrap",std::string()),"sandbox-helpers.js");
    if(!error.empty())return;
    evaluate(R"(for(const name of ["eval","Function","Buffer","process","env","Headers","Request","Response","performance"])delete globalThis[name];)","sandbox-hardening.js");
    std::string source;
    for(const auto& declaration:options.value("imports",Json::array()))source+=declaration.get<std::string>()+"\n";
    source+="globalThis.__task = (async()=>{"+options.at("code").get<std::string>()+"\n})().then(value=>{globalThis.__runValue=value;globalThis.__runDone=true;},error=>{globalThis.__runError=String(error);globalThis.__runDone=true;});";
    // native-rules #6: raw JSValue freed by hand with JS_FreeValue, not an RAII handle
    auto compiled=JS_Eval(context,source.c_str(),source.size(),"code-node.mjs",JS_EVAL_TYPE_MODULE|JS_EVAL_FLAG_COMPILE_ONLY);
    if(!JS_IsException(compiled) && JS_ResolveModule(context,compiled)>=0) {
      loaderLocked=true;
      auto evaluated=JS_EvalFunction(context,compiled);
      evaluation=JS_DupValue(context,evaluated);
      if(JS_IsException(evaluated)) {auto ex=JS_GetException(context);error=text(context,ex);JS_FreeValue(context,ex);}
      JS_FreeValue(context,evaluated);
    } else {
      JS_FreeValue(context,compiled);
      auto ex=JS_GetException(context);error=text(context,ex);JS_FreeValue(context,ex);
    }
  }
  ~Session() {
    if(context)JS_FreeValue(context,evaluation);
    for(auto& [_,pair]:pending) { JS_FreeValue(context,pair.first);JS_FreeValue(context,pair.second); }

  }
  Json step() {
    enter();
    JSContext* jobContext=nullptr;
    while(error.empty() && events.empty() && JS_IsJobPending(runtime)) {
      if(interrupt(context,this)) {error="Sandbox cancelled or deadline exceeded";break;}
      if(JS_ExecutePendingJob(runtime,&jobContext)<0) {auto ex=JS_GetException(jobContext);error=text(jobContext,ex);JS_FreeValue(jobContext,ex);}
    }
    if(error.empty() && JS_PromiseState(context,evaluation)==JS_PROMISE_REJECTED) {
      auto reason=JS_PromiseResult(context,evaluation);error=text(context,reason);JS_FreeValue(context,reason);
    }
    if(!error.empty()) return {{"done",true},{"result",{{"success",false},{"error",error}}}};
    if(!events.empty()) {
      auto event=events.front();events.pop_front();
      const auto op=event.at("operation").get<std::string>();
      if(op=="output" || op=="emit") {
        const auto& args=event.at("args");
        if(args.size()!=2 || !args[0].is_string() || args[0].get<std::string>().empty()) {
          error="Output names must be nonempty strings";return step();
        }
        outputBytes+=args[1].dump().size();
        if(outputBytes>outputLimit || ++emitCalls>10000) {error="Sandbox output size or emit limit exceeded";return step();}
        if(op=="output") outputs[args[0].get<std::string>()]=args[1];
        else emitted.push_back({{"name",args[0]},{"value",args[1]}});
      }
      if(op=="log" && logs.size()<1000) logs.push_back(event.at("args").at(1));
      return {{"done",false},{"event",event}};
    }
    auto global=JS_GetGlobalObject(context);
    auto done=JS_GetPropertyStr(context,global,"__runDone");
    const bool finished=JS_ToBool(context,done);JS_FreeValue(context,done);
    Json result;
    if(!finished && !pending.empty()) {JS_FreeValue(context,global);return {{"done",false},{"waiting",true}};}
    if(!finished) result={{"success",false},{"error","Sandbox promise did not settle"}};
    else {
      auto failure=JS_GetPropertyStr(context,global,"__runError");
      if(!JS_IsUndefined(failure)) result={{"success",false},{"error",text(context,failure)}};
      else {
        auto value=JS_GetPropertyStr(context,global,"__runValue");
        auto serializer=JS_GetPropertyStr(context,global,"__serialize");
        auto encoded=JS_Call(context,serializer,JS_UNDEFINED,1,&value);
        JS_FreeValue(context,serializer);
        if(JS_IsException(encoded)) {auto ex=JS_GetException(context);result={{"success",false},{"error",text(context,ex)}};JS_FreeValue(context,ex);}
        else {
          result={{"success",true},{"result",JS_IsUndefined(encoded)?Json():Json::parse(text(context,encoded))},{"outputs",outputs},{"emitted",emitted},{"logs",logs}};
          auto state=JS_GetPropertyStr(context,global,"state");
          auto stateJson=JS_JSONStringify(context,state,JS_UNDEFINED,JS_UNDEFINED);
          if(!JS_IsUndefined(stateJson) && !JS_IsException(stateJson))result["state"]=Json::parse(text(context,stateJson));
          JS_FreeValue(context,stateJson);JS_FreeValue(context,state);
        }
        JS_FreeValue(context,encoded);JS_FreeValue(context,value);
      }
      JS_FreeValue(context,failure);
    }
    JS_FreeValue(context,global);
    if(result.dump().size()>outputLimit) result={{"success",false},{"error","Sandbox output size limit exceeded"}};
    return {{"done",true},{"result",result}};
  }
  void resume(unsigned token,const Json& result,bool failed) {
    enter();
    const auto it=pending.find(token);
    if(it==pending.end()) throw std::runtime_error("Unknown sandbox bridge token");
    if(inputWaits.erase(token) && inputWaits.empty()) deadline+=Clock::now()-suspendedAt;
    const auto encoded=result.dump();
    if(encoded.size()>10*1024*1024) throw std::runtime_error("Sandbox response size limit exceeded");
    auto value=JS_ParseJSON(context,encoded.c_str(),encoded.size(),"bridge-result.json");
    auto global=JS_GetGlobalObject(context);auto revive=JS_GetPropertyStr(context,global,"__revive");
    auto revived=JS_Call(context,revive,JS_UNDEFINED,1,&value);JS_FreeValue(context,value);value=revived;
    JS_FreeValue(context,revive);JS_FreeValue(context,global);
    auto returned=JS_Call(context,failed?it->second.second:it->second.first,JS_UNDEFINED,1,&value);
    JS_FreeValue(context,returned);JS_FreeValue(context,value);
    JS_FreeValue(context,it->second.first);JS_FreeValue(context,it->second.second);pending.erase(it);
  }
};
}
void installSandboxSessions(js::Engine& engine,const js::Value& object,std::function<bool()> cancelled) {
  // native-rules #1: state shared by several host functions, no justification
  auto sessions=std::make_shared<std::map<unsigned,std::unique_ptr<Session>>>();
  auto next=std::make_shared<unsigned>(0);
  engine.addRunCleanup([weak=std::weak_ptr(sessions)] { if(auto active=weak.lock())active->clear(); });
  engine.set(object,"start",engine.function("start",1,[sessions,next,cancelled](js::Engine& en,const std::vector<js::Value>& args){
    if(args.empty() || sessions->size()>=8) throw std::runtime_error("Sandbox session limit exceeded");
    std::function<bool(const std::string&)> open;
    if(args.size()>1 && en.isFunction(args[1])) {
      auto callback=args[1];
      // native-rules #12: stored callback captures an Engine reference and runs later
      open=[&en,callback](const std::string& name){return en.toBoolean(en.call(callback,en.undefined(),{en.string(name)}));};
    }
    const auto id=++*next; sessions->emplace(id,std::make_unique<Session>(Json::parse(en.toString(args[0])),cancelled,std::move(open),args.size()>2 && en.isFunction(args[2]) ? std::function<std::string(const std::string&,const std::string&)>([&en,callback=args[2]](const std::string& name,const std::string& payload){return en.toString(en.call(callback,en.undefined(),{en.string(name),en.string(payload)}));}):std::function<std::string(const std::string&,const std::string&)>{}));return en.number(id);
  }));
  engine.set(object,"step",engine.function("step",1,[sessions](js::Engine& en,const std::vector<js::Value>& args){
    const auto id=idArg(en,args.at(0));return en.string(sessions->at(id)->step().dump());
  }));
  engine.set(object,"resume",engine.function("resume",4,[sessions](js::Engine& en,const std::vector<js::Value>& args){
    sessions->at(idArg(en,args.at(0)))->resume(idArg(en,args.at(1)),Json::parse(en.toString(args.at(2))),en.toBoolean(args.at(3)));return en.undefined();
  }));
  engine.set(object,"close",engine.function("close",1,[sessions](js::Engine& en,const std::vector<js::Value>& args){
    sessions->erase(idArg(en,args.at(0)));return en.undefined();
  }));
}
}
