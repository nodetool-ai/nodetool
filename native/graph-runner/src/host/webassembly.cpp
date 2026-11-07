#include "host/webassembly.h"
#include <wasmtime.h>
#include <chrono>
#include <cmath>
#include <thread>

namespace gr::host {
namespace {
using js::Value;
using js::Engine;
void check(wasmtime_error_t* error, wasm_trap_t* trap = nullptr) {
  if (!error && !trap) return;
  wasm_name_t message;
  if (error) wasmtime_error_message(error, &message); else wasm_trap_message(trap, &message);
  std::string text(message.data, message.size);
  wasm_byte_vec_delete(&message);
  if (error) wasmtime_error_delete(error);
  if (trap) wasm_trap_delete(trap);
  throw std::runtime_error(text);
}
struct Memory {
  wasmtime_memory_t memory;
  Value buffer;
  uint8_t* data = nullptr;
  size_t size = 0;
};
struct State : js::NativePayload {
  Engine& js;
  wasm_engine_t* engine;
  wasmtime_store_t* store;
  std::function<bool()> cancelled;
  std::vector<Value> callbacks;
  std::vector<std::shared_ptr<Memory>> memories;
  bool closed = false;
  unsigned depth = 0;
  State(Engine& e, std::function<bool()> c) : js(e), cancelled(std::move(c)) {
    auto* config = wasm_config_new();
    wasmtime_config_consume_fuel_set(config, true);
    wasmtime_config_epoch_interruption_set(config, true);
    wasmtime_config_max_wasm_stack_set(config, 512 * 1024);
    engine = wasm_engine_new_with_config(config);
    store = wasmtime_store_new(engine, nullptr, nullptr);
    wasmtime_store_limiter(store, 64 * 1024 * 1024, 100000, 32, 32, 4);
  }
  auto* context() { if (closed) throw std::runtime_error("WebAssembly context is closed"); return wasmtime_store_context(store); }
  void refresh() {
    for (auto& m : memories) {
      auto* data = wasmtime_memory_data(context(), &m->memory);
      auto size = wasmtime_memory_data_size(context(), &m->memory);
      if (!m->buffer.empty() && (data != m->data || size != m->size)) {
        js.detachArrayBuffer(m->buffer);
        m->buffer = {};
      }
    }
  }
  void close() {
    if (closed) return;
    for (auto& m : memories) { if (!m->buffer.empty()) js.detachArrayBuffer(m->buffer); m->buffer = {}; }
    callbacks.clear();
    memories.clear();
    closed = true;
    wasmtime_store_delete(store);
    store = nullptr;
  }
  ~State() override { if (store) wasmtime_store_delete(store); wasm_engine_delete(engine); }
};
struct Module : js::NativePayload {
  std::shared_ptr<State> state;
  wasmtime_module_t* module = nullptr;
  ~Module() override { if (module) wasmtime_module_delete(module); }
};
struct Budget {
  State& state;
  std::jthread watchdog;
  Budget(State& s) : state(s) {
    s.context();
    if (s.cancelled && s.cancelled()) throw std::runtime_error("WebAssembly execution cancelled");
    if (s.depth++ == 0) {
      check(wasmtime_context_set_fuel(s.context(), 100000000));
      wasmtime_context_set_epoch_deadline(s.context(), 1);
      watchdog = std::jthread([&s](std::stop_token stop) {
        auto end = std::chrono::steady_clock::now() + std::chrono::seconds(5);
        while (!stop.stop_requested()) {
          if (std::chrono::steady_clock::now() >= end || (s.cancelled && s.cancelled())) {
            wasmtime_engine_increment_epoch(s.engine); return;
          }
          std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
      });
    }
  }
  ~Budget() { watchdog.request_stop(); --state.depth; }
};
Value fromWasm(Engine& e, const wasmtime_val_t& v) {
  switch (v.kind) {
    case WASMTIME_I32: return e.number(v.of.i32);
    case WASMTIME_F32: return e.number(v.of.f32);
    case WASMTIME_F64: return e.number(v.of.f64);
    default: throw std::runtime_error("Unsupported WebAssembly value type");
  }
}
wasmtime_val_t toWasm(Engine& e, const Value& value, wasm_valkind_t kind) {
  wasmtime_val_t result{};
  double n = e.toNumber(value);
  switch (kind) {
    case WASM_I32: {
      result.kind = WASMTIME_I32;
      double mod = std::isfinite(n) ? std::fmod(std::trunc(n), 4294967296.0) : 0;
      if (mod < 0) mod += 4294967296.0;
      result.of.i32 = static_cast<int32_t>(static_cast<uint32_t>(mod)); break;
    }
    case WASM_F32: result.kind = WASMTIME_F32; result.of.f32 = float(n); break;
    case WASM_F64: result.kind = WASMTIME_F64; result.of.f64 = n; break;
    default: throw std::runtime_error("Unsupported WebAssembly value type");
  }
  return result;
}
struct Callback { State* state; size_t index; std::vector<wasm_valkind_t> results; };
wasm_trap_t* callback(void* data, wasmtime_caller_t*, const wasmtime_val_t* args, size_t count, wasmtime_val_t* results, size_t resultCount) {
  auto& cb = *static_cast<Callback*>(data);
  try {
    auto& s = *cb.state;
    s.refresh();
    std::vector<Value> values;
    for (size_t i = 0; i < count; ++i) values.push_back(fromWasm(s.js, args[i]));
    auto result = s.js.call(s.callbacks.at(cb.index), s.js.undefined(), values);
    if (resultCount > 1) throw std::runtime_error("Multi-value imports are unsupported");
    if (resultCount) results[0] = toWasm(s.js, result, cb.results[0]);
    return nullptr;
  } catch (const std::exception& e) { return wasmtime_trap_new(e.what(), std::char_traits<char>::length(e.what())); }
}
Value function(std::shared_ptr<State> s, wasmtime_func_t fn) {
  return s->js.function("wasm", 0, [s, fn](Engine& e, const std::vector<Value>& args) {
    Budget budget(*s);
    std::unique_ptr<wasm_functype_t, decltype(&wasm_functype_delete)> type(wasmtime_func_type(s->context(), &fn), wasm_functype_delete);
    auto* params = wasm_functype_params(type.get());
    auto* results = wasm_functype_results(type.get());
    if (results->size > 1) throw std::runtime_error("Multi-value exports are unsupported");
    std::vector<wasmtime_val_t> inputs;
    for (size_t i = 0; i < params->size; ++i) inputs.push_back(toWasm(e, i < args.size() ? args[i] : e.undefined(), wasm_valtype_kind(params->data[i])));
    wasmtime_val_t result{};
    wasm_trap_t* trap = nullptr;
    auto* error = wasmtime_func_call(s->context(), &fn, inputs.data(), inputs.size(), &result, results->size, &trap);
    s->refresh();
    check(error, trap);
    return results->size ? fromWasm(e, result) : e.undefined();
  });
}
Value memory(std::shared_ptr<State> s, wasmtime_memory_t mem) {
  auto m = std::make_shared<Memory>(); m->memory = mem; s->memories.push_back(m);
  auto object = s->js.object();
  s->js.set(object, "kind", s->js.string("memory"));
  s->js.set(object, "buffer", s->js.function("buffer", 0, [s, m](Engine& e, const auto&) {
    s->refresh();
    if (m->buffer.empty()) {
      m->data = wasmtime_memory_data(s->context(), &m->memory);
      m->size = wasmtime_memory_data_size(s->context(), &m->memory);
      // The context cleanup detaches every view before releasing the store.
      m->buffer = e.externalArrayBuffer(m->data, m->size, s);
    }
    return m->buffer;
  }));
  s->js.set(object, "grow", s->js.function("grow", 1, [s, m](Engine& e, const auto& args) {
    double n = e.toNumber(args.at(0));
    if (!std::isfinite(n) || n < 0 || n != std::trunc(n) || n > 4096) throw std::runtime_error("Invalid WebAssembly memory growth");
    uint64_t previous;
    check(wasmtime_memory_grow(s->context(), &m->memory, uint64_t(n), &previous));
    if (!m->buffer.empty()) e.detachArrayBuffer(m->buffer);
    m->buffer = {};
    return e.number(double(previous));
  }));
  return object;
}
Value table(std::shared_ptr<State> s, wasmtime_table_t t) {
  auto object = s->js.object();
  s->js.set(object, "kind", s->js.string("table"));
  s->js.set(object, "length", s->js.function("length", 0, [s, t](Engine& e, const auto&) { return e.number(double(wasmtime_table_size(s->context(), &t))); }));
  s->js.set(object, "get", s->js.function("get", 1, [s, t](Engine& e, const auto& args) {
    auto n = e.toNumber(args.at(0));
    if (!std::isfinite(n) || n < 0 || n != std::trunc(n) || n > 100000) throw std::runtime_error("Invalid WebAssembly table index");
    wasmtime_val_t value;
    if (!wasmtime_table_get(s->context(), &t, uint64_t(n), &value)) throw std::runtime_error("WebAssembly table index out of bounds");
    if (value.kind != WASMTIME_FUNCREF) { wasmtime_val_unroot(s->context(), &value); throw std::runtime_error("Unsupported table element"); }
    return value.of.funcref.store_id == 0 ? e.null() : function(s, value.of.funcref);
  }));
  return object;
}
}
void installWebAssembly(Engine& e, const Value& object, std::function<bool()> cancelled) {
  auto s = std::make_shared<State>(e, std::move(cancelled));
  e.addContextCleanup([s] { s->close(); });
  e.set(object, "compile", e.function("compile", 1, [s](Engine& en, const auto& args) {
    s->context();
    if (en.byteLength(args.at(0)) > 16 * 1024 * 1024) throw std::runtime_error("WebAssembly module size limit exceeded");
    auto bytes = en.toBytes(args.at(0));
    auto module = std::make_shared<Module>(); module->state = s;
    check(wasmtime_module_new(s->engine, bytes.data(), bytes.size(), &module->module));
    return en.nativeObject(module);
  }));
  e.set(object, "instantiate", e.function("instantiate", 2, [s](Engine& en, const auto& args) {
    auto m = std::dynamic_pointer_cast<Module>(en.nativePayload(args.at(0)));
    if (!m || m->state != s) throw std::runtime_error("Invalid WebAssembly module");
    Budget budget(*s);
    wasm_importtype_vec_t types;
    wasmtime_module_imports(m->module, &types);
    struct Imports { wasm_importtype_vec_t* p; ~Imports() { wasm_importtype_vec_delete(p); } } guard{&types};
    if (types.size > 1024 || s->callbacks.size() + types.size > 16384) throw std::runtime_error("WebAssembly import limit exceeded");
    std::vector<wasmtime_extern_t> imports;
    for (size_t i = 0; i < types.size; ++i) {
      auto* type = wasm_importtype_type(types.data[i]);
      if (wasm_externtype_kind(type) != WASM_EXTERN_FUNC) throw std::runtime_error("Only function imports are supported");
      auto* moduleName = wasm_importtype_module(types.data[i]);
      auto* field = wasm_importtype_name(types.data[i]);
      auto fn = en.get(en.get(args.at(1), std::string(moduleName->data, moduleName->size)), std::string(field->data, field->size));
      if (!en.isFunction(fn)) throw std::runtime_error("WebAssembly import must be a function");
      auto* ft = wasm_externtype_as_functype_const(type);
      auto cb = std::make_unique<Callback>(); cb->state = s.get(); cb->index = s->callbacks.size();
      auto* results = wasm_functype_results(ft);
      for (size_t j = 0; j < results->size; ++j) cb->results.push_back(wasm_valtype_kind(results->data[j]));
      s->callbacks.push_back(fn);
      wasmtime_extern_t item{}; item.kind = WASMTIME_EXTERN_FUNC;
      wasmtime_func_new(s->context(), ft, callback, cb.release(), [](void* p) { delete static_cast<Callback*>(p); }, &item.of.func);
      imports.push_back(item);
    }
    wasmtime_instance_t instance;
    wasm_trap_t* trap = nullptr;
    auto* error = wasmtime_instance_new(s->context(), m->module, imports.data(), imports.size(), &instance, &trap);
    check(error, trap);
    auto exports = en.object();
    wasmtime_extern_t item; char* name; size_t length;
    for (size_t i = 0; wasmtime_instance_export_nth(s->context(), &instance, i, &name, &length, &item); ++i) {
      Value value;
      if (item.kind == WASMTIME_EXTERN_FUNC) value = function(s, item.of.func);
      else if (item.kind == WASMTIME_EXTERN_MEMORY) value = memory(s, item.of.memory);
      else if (item.kind == WASMTIME_EXTERN_TABLE) value = table(s, item.of.table);
      else throw std::runtime_error("Unsupported WebAssembly export");
      en.set(exports, std::string(name, length), value);
    }
    return exports;
  }));
}
}
