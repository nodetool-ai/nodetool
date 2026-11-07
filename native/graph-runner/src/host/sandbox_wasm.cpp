#include "host/sandbox_wasm.h"
#include <wasmtime.h>
#include <nlohmann/json.hpp>
#include <chrono>
#include <cmath>
#include <memory>
#include <stdexcept>
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
Json call(const std::vector<uint8_t>& bytes,const std::string& name,const Json& args,const Json& limits,const std::function<bool()>& cancelled) {
  if(bytes.size()>16*1024*1024 || !args.is_array() || args.size()>8)throw std::runtime_error("WASM input limit exceeded");
  const auto timeout=limits.value("callTimeoutMs",5000);
  const auto pages=limits.value("memoryPagesMax",4096);
  if(timeout<1 || timeout>5000 || pages<0 || pages>4096)throw std::runtime_error("Invalid WASM execution limits");
  if(cancelled && cancelled())throw std::runtime_error("WASM call cancelled");
  auto* config=wasm_config_new();
  wasmtime_config_consume_fuel_set(config,true);
  wasmtime_config_epoch_interruption_set(config,true);
  wasmtime_config_max_wasm_stack_set(config,512*1024);
  wasmtime_config_cranelift_opt_level_set(config,WASMTIME_OPT_LEVEL_NONE);
  std::unique_ptr<wasm_engine_t,decltype(&wasm_engine_delete)> engine(wasm_engine_new_with_config(config),wasm_engine_delete);
  wasmtime_module_t* compiled=nullptr;
  check(wasmtime_module_new(engine.get(),bytes.data(),bytes.size(),&compiled));
  std::unique_ptr<wasmtime_module_t,decltype(&wasmtime_module_delete)> module(compiled,wasmtime_module_delete);
  std::unique_ptr<wasmtime_store_t,decltype(&wasmtime_store_delete)> store(wasmtime_store_new(engine.get(),nullptr,nullptr),wasmtime_store_delete);
  wasmtime_store_limiter(store.get(),int64_t(pages)*65536,100000,1,4,1);
  auto* context=wasmtime_store_context(store.get());
  check(wasmtime_context_set_fuel(context,100000000));
  wasmtime_context_set_epoch_deadline(context,1);
  const auto deadline=std::chrono::steady_clock::now()+std::chrono::milliseconds(timeout);
  std::jthread watchdog([&](std::stop_token stop){
    while(!stop.stop_requested()) {
      if(std::chrono::steady_clock::now()>=deadline || (cancelled && cancelled())) {wasmtime_engine_increment_epoch(engine.get());return;}
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
  });
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
