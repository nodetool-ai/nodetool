#include "host/sandbox_wasm.h"
#include <wasmtime.h>
#include <nlohmann/json.hpp>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <unordered_map>
#include <cmath>
#include <memory>
#include <stdexcept>
#include <string_view>
#include <thread>
#include <vector>

namespace gr::host {
namespace {
using Json=nlohmann::json;
void check(wasmtime_error_t* error,wasm_trap_t* trap=nullptr) {
  if(!error && !trap)return;
  wasm_name_t message;
  if(error)wasmtime_error_message(error,&message);else wasm_trap_message(trap,&message);
  std::string text(message.data,message.size);wasm_byte_vec_delete(&message);
  if(error)wasmtime_error_delete(error);if(trap)wasm_trap_delete(trap);
  throw std::runtime_error(text);
}
// One engine, one watchdog thread and a cache of compiled modules for each
// calling thread. A call arms the watchdog with a deadline, so it starts no
// thread and compiles nothing it compiled before.
struct Runner {
  // native-rules #6: raw wasm engine freed by hand in the destructor
  wasm_engine_t* engine;
  std::mutex mutex;
  std::condition_variable cv;
  bool armed=false,stop=false;
  std::chrono::steady_clock::time_point deadline;
  const std::function<bool()>* cancelled=nullptr;
  struct Cached {std::vector<uint8_t> bytes;std::shared_ptr<wasmtime_module_t> module;};
  std::unordered_map<size_t,Cached> modules;
  std::thread watchdog;
  Runner() {
    auto* config=wasm_config_new();
    wasmtime_config_consume_fuel_set(config,true);
    wasmtime_config_epoch_interruption_set(config,true);
    wasmtime_config_max_wasm_stack_set(config,512*1024);
    wasmtime_config_cranelift_opt_level_set(config,WASMTIME_OPT_LEVEL_NONE);
    engine=wasm_engine_new_with_config(config);
    watchdog=std::thread([this]{run();});
  }
  void run() {
    std::unique_lock lock(mutex);
    while(!stop) {
      if(!armed){cv.wait(lock);continue;}
      const auto now=std::chrono::steady_clock::now();
      if(now>=deadline || (cancelled && *cancelled && (*cancelled)())) {wasmtime_engine_increment_epoch(engine);armed=false;continue;}
      cv.wait_until(lock,std::min(deadline,now+std::chrono::milliseconds(1)));
    }
  }
  void arm(std::chrono::steady_clock::time_point end,const std::function<bool()>* cancel) {
    {std::lock_guard lock(mutex);deadline=end;cancelled=cancel;armed=true;}
    cv.notify_one();
  }
  void disarm() {std::lock_guard lock(mutex);armed=false;cancelled=nullptr;}
  std::shared_ptr<wasmtime_module_t> module(const std::vector<uint8_t>& bytes) {
    const size_t key=std::hash<std::string_view>{}(std::string_view(reinterpret_cast<const char*>(bytes.data()),bytes.size()));
    auto it=modules.find(key);
    if(it!=modules.end() && it->second.bytes==bytes)return it->second.module;
    wasmtime_module_t* compiled=nullptr;
    check(wasmtime_module_new(engine,bytes.data(),bytes.size(),&compiled));
    std::shared_ptr<wasmtime_module_t> module(compiled,wasmtime_module_delete);
    if(modules.size()>=16)modules.clear();
    modules[key]=Cached{bytes,module};
    return module;
  }
  ~Runner() {
    {std::lock_guard lock(mutex);stop=true;}
    cv.notify_one();
    watchdog.join();
    modules.clear();
    wasm_engine_delete(engine);
  }
};
Runner& runner() {static thread_local Runner instance;return instance;}
struct Armed {
  Runner& r;
  Armed(Runner& runner,std::chrono::steady_clock::time_point end,const std::function<bool()>& cancel):r(runner){r.arm(end,&cancel);}
  ~Armed(){r.disarm();}
};
Json call(const std::vector<uint8_t>& bytes,const std::string& name,const Json& args,const Json& limits,const std::function<bool()>& cancelled) {
  if(bytes.size()>16*1024*1024 || !args.is_array() || args.size()>8)throw std::runtime_error("WASM input limit exceeded");
  const auto timeout=limits.value("callTimeoutMs",5000);
  const auto pages=limits.value("memoryPagesMax",4096);
  if(timeout<1 || timeout>5000 || pages<0 || pages>4096)throw std::runtime_error("Invalid WASM execution limits");
  if(cancelled && cancelled())throw std::runtime_error("WASM call cancelled");
  auto& rt=runner();
  auto module=rt.module(bytes);
  std::unique_ptr<wasmtime_store_t,decltype(&wasmtime_store_delete)> store(wasmtime_store_new(rt.engine,nullptr,nullptr),wasmtime_store_delete);
  wasmtime_store_limiter(store.get(),int64_t(pages)*65536,100000,1,4,1);
  auto* context=wasmtime_store_context(store.get());
  check(wasmtime_context_set_fuel(context,100000000));
  wasmtime_context_set_epoch_deadline(context,1);
  const auto deadline=std::chrono::steady_clock::now()+std::chrono::milliseconds(timeout);
  Armed armed(rt,deadline,cancelled);
  wasmtime_instance_t instance;wasm_trap_t* trap=nullptr;
  auto* error=wasmtime_instance_new(context,module.get(),nullptr,0,&instance,&trap);check(error,trap);
  wasmtime_extern_t exported;
  if(!wasmtime_instance_export_get(context,&instance,name.c_str(),name.size(),&exported) || exported.kind!=WASMTIME_EXTERN_FUNC)throw std::runtime_error("WASM function export is missing");
  std::unique_ptr<wasm_functype_t,decltype(&wasm_functype_delete)> type(wasmtime_func_type(context,&exported.of.func),wasm_functype_delete);
  const auto* parameters=wasm_functype_params(type.get());const auto* results=wasm_functype_results(type.get());
  if(parameters->size!=args.size() || results->size>1)throw std::runtime_error("WASM scalar signature mismatch");
  std::vector<wasmtime_val_t> values(args.size());
  for(size_t i=0;i<args.size();++i) {
    if(!args[i].is_number() || !std::isfinite(args[i].get<double>()))throw std::runtime_error("WASM arguments must be finite numbers");
    const auto n=args[i].get<double>();
    switch(wasm_valtype_kind(parameters->data[i])) {
      case WASM_I32: if(std::trunc(n)!=n || n<-2147483648.0 || n>2147483647.0)throw std::runtime_error("WASM i32 argument out of range");values[i].kind=WASMTIME_I32;values[i].of.i32=int32_t(n);break;
      case WASM_F32: values[i].kind=WASMTIME_F32;values[i].of.f32=float(n);break;
      case WASM_F64: values[i].kind=WASMTIME_F64;values[i].of.f64=n;break;
      default: throw std::runtime_error("WASM scalar type is not allowed");
    }
  }
  if(results->size && wasm_valtype_kind(results->data[0])!=WASM_I32 && wasm_valtype_kind(results->data[0])!=WASM_F32 && wasm_valtype_kind(results->data[0])!=WASM_F64)throw std::runtime_error("WASM result type is not allowed");
  wasmtime_val_t result;
  trap=nullptr;error=wasmtime_func_call(context,&exported.of.func,values.data(),values.size(),&result,results->size,&trap);check(error,trap);
  if(cancelled && cancelled())throw std::runtime_error("WASM call cancelled");
  if(!results->size)return nullptr;
  switch(result.kind) {case WASMTIME_I32:return result.of.i32;case WASMTIME_F32:return result.of.f32;case WASMTIME_F64:return result.of.f64;default:throw std::runtime_error("WASM result type is not allowed");}
}
}
void installSandboxWasm(js::Engine& e,const js::Value& object,std::function<bool()> cancelled) {
  e.set(object,"wasm",e.function("wasm",4,[cancelled](js::Engine& en,const std::vector<js::Value>& args){
    if(args.size()!=4)throw std::runtime_error("WASM call requires bytes, export, arguments and limits");
    return en.string(call(en.toBytes(args[0]),en.toString(args[1]),Json::parse(en.toString(args[2])),Json::parse(en.toString(args[3])),cancelled).dump());
  }));
}
}
