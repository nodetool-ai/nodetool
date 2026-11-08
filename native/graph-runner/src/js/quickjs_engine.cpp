// QuickJS-ng backend for the gr::js::Engine interface.
#include "js/engine.h"
#include "js/thread_owner.h"

#include <quickjs.h>

#include <cstring>
#include <unordered_set>

// The link guard of src/js/thread_owner.h: this build's mode, and the
// symbol both modes define, so objects of both modes cannot share a binary.
extern "C" {
int GR_THREAD_CHECK_MODE_SYMBOL = GR_THREAD_CHECKS;
int gr_thread_check_mode_defined = GR_THREAD_CHECKS;
}

namespace gr::js {
namespace {

// The engine's worker thread owns every value (invariant I5). The owner
// reference exists only in builds with thread checks.
struct QjsValue final : Value::Impl {
  QjsValue(JSContext* c, JSValue val, [[maybe_unused]] const ThreadOwner& o)
      : ctx(c), v(val)
#if GR_THREAD_CHECKS
      , owner(&o)
#endif
  {}
  ~QjsValue() override {
    checkOwner();
    JS_FreeValue(ctx, v);
  }
  void checkOwner() const {
#if GR_THREAD_CHECKS
    owner->check("a JavaScript value");
#endif
  }
  JSContext* ctx;
  JSValue v;
#if GR_THREAD_CHECKS
  const ThreadOwner* owner;
#endif
};

// Owns the std::function behind one host function. Freed by the class
// finalizer when the JavaScript function object is collected.
struct HostFunctionBox {
  HostFunction fn;
};

class QuickJsEngine final : public Engine {
public:
  QuickJsEngine() {
    rt_ = JS_NewRuntime();
    JS_SetMaxStackSize(rt_, 8 * 1024 * 1024);
    ctx_ = JS_NewContext(rt_);
    JS_SetContextOpaque(ctx_, this);
    JSValue global = JS_GetGlobalObject(ctx_);
    JSValue ctor = JS_GetPropertyStr(ctx_, global, "ArrayBuffer");
    JSValue prototype = JS_GetPropertyStr(ctx_, ctor, "prototype");
    for (const char* name : {"transfer", "transferToFixedLength", "transferToImmutable"}) {
      JSValue original = JS_GetPropertyStr(ctx_, prototype, name);
      if (JS_IsFunction(ctx_, original)) {
        JSValue guarded = JS_NewCFunctionData(ctx_,
          [](JSContext* ctx, JSValueConst self, int argc, JSValueConst* argv, int, JSValueConst* data) -> JSValue {
            auto* engine = static_cast<QuickJsEngine*>(JS_GetContextOpaque(ctx));
            if (JS_IsObject(self) && engine->externalBuffers_.contains(JS_VALUE_GET_PTR(self)))
              return JS_ThrowTypeError(ctx, "Cannot transfer native WebAssembly memory");
            return JS_Call(ctx, data[0], self, argc, argv);
          }, 0, 0, 1, &original);
        JS_SetPropertyStr(ctx_, prototype, name, guarded);
      }
      JS_FreeValue(ctx_, original);
    }
    JS_FreeValue(ctx_, prototype);
    JS_FreeValue(ctx_, ctor);
    JS_FreeValue(ctx_, global);
    JS_NewClassID(rt_, &boxClass_);
    JSClassDef def{};
    def.class_name = "HostFunctionBox";
    def.finalizer = [](JSRuntime* rt, JSValue obj) {
      auto* engine = static_cast<QuickJsEngine*>(JS_GetRuntimeOpaque(rt));
      delete static_cast<HostFunctionBox*>(JS_GetOpaque(obj, engine->boxClass_));
    };
    JS_NewClassID(rt_, &nativeClass_);
    JSClassDef native{};
    native.class_name = "NativeResource";
    native.finalizer = [](JSRuntime* rt, JSValue obj) {
      auto* engine = static_cast<QuickJsEngine*>(JS_GetRuntimeOpaque(rt));
      delete static_cast<std::shared_ptr<NativePayload>*>(JS_GetOpaque(obj, engine->nativeClass_));
    };
    JS_NewClass(rt_, nativeClass_, &native);
    JS_SetRuntimeOpaque(rt_, this);
    JS_NewClass(rt_, boxClass_, &def);
    JS_SetInterruptHandler(
        rt_,
        [](JSContext*, void* opaque) -> int {
          auto* engine = static_cast<QuickJsEngine*>(opaque);
          return engine->interrupt_ && engine->interrupt_() ? 1 : 0;
        },
        this);
  }

  ~QuickJsEngine() override {
    own();
    releaseRunResources();
    releaseContextResources();
    for (auto buffer : externalBufferRoots_) JS_FreeValue(ctx_, buffer);
    externalBufferRoots_.clear();
    JS_FreeContext(ctx_);
    JS_FreeRuntime(rt_);
  }

  Value wrap(JSValue v) {
    own();
    return Value(std::make_shared<QjsValue>(ctx_, v, owner_));
  }
  static JSValue raw(const Value& v) {
    auto* value = static_cast<QjsValue*>(v.impl().get());
    value->checkOwner();
    return value->v;
  }

  // Converts a pending exception into a JsError carrying its message.
  [[noreturn]] void throwPending() {
    JSValue exc = JS_GetException(ctx_);
    std::string message;
    if (JS_IsObject(exc)) {
      JSValue m = JS_GetPropertyStr(ctx_, exc, "message");
      if (JS_IsString(m)) message = cString(m);
      JS_FreeValue(ctx_, m);
    }
    if (message.empty()) message = cString(exc);
    JS_FreeValue(ctx_, exc);
    throw JsError(message);
  }

  JSValue check(JSValue v) {
    if (JS_IsException(v)) throwPending();
    return v;
  }

  std::string cString(JSValue v) {
    size_t len = 0;
    const char* s = JS_ToCStringLen(ctx_, &len, v);
    if (!s) {
      JS_FreeValue(ctx_, JS_GetException(ctx_));
      return {};
    }
    std::string out(s, len);
    JS_FreeCString(ctx_, s);
    return out;
  }

  Value evaluateScript(std::string_view source,
                       const std::string& filename) override {
    own();
    std::string src(source);  // QuickJS requires a terminating NUL.
    return wrap(check(JS_Eval(ctx_, src.c_str(), src.size(), filename.c_str(),
                              JS_EVAL_TYPE_GLOBAL)));
  }

  std::vector<uint8_t> compileScript(std::string_view source,
                                     const std::string& filename) override {
    own();
    std::string src(source);
    JSValue fn = check(JS_Eval(ctx_, src.c_str(), src.size(), filename.c_str(),
                               JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY));
    size_t size = 0;
    uint8_t* buf = JS_WriteObject(ctx_, &size, fn, JS_WRITE_OBJ_BYTECODE);
    JS_FreeValue(ctx_, fn);
    if (!buf) throwPending();
    std::vector<uint8_t> out(buf, buf + size);
    js_free(ctx_, buf);
    return out;
  }

  Value evaluateModule(std::string_view source,
                       const std::string& filename) override {
    own();
    std::string src(source);
    return wrap(check(JS_Eval(ctx_, src.c_str(), src.size(), filename.c_str(),
                              JS_EVAL_TYPE_MODULE)));
  }

  std::vector<uint8_t> compileModule(std::string_view source,
                                     const std::string& filename) override {
    own();
    std::string src(source);
    JSValue m = check(JS_Eval(ctx_, src.c_str(), src.size(), filename.c_str(),
                              JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY));
    size_t size = 0;
    uint8_t* buf = JS_WriteObject(ctx_, &size, m, JS_WRITE_OBJ_BYTECODE);
    JS_FreeValue(ctx_, m);
    if (!buf) throwPending();
    std::vector<uint8_t> out(buf, buf + size);
    js_free(ctx_, buf);
    return out;
  }

  Value evaluateBytecode(const std::vector<uint8_t>& bytecode) override {
    own();
    JSValue fn = check(JS_ReadObject(ctx_, bytecode.data(), bytecode.size(),
                                     JS_READ_OBJ_BYTECODE));
    // Module bytecode links (it has no imports to resolve) and evaluates to
    // the promise of its evaluation.
    if (JS_IsModule(fn) && JS_ResolveModule(ctx_, fn) < 0) {
      JS_FreeValue(ctx_, fn);
      throwPending();
    }
    return wrap(check(JS_EvalFunction(ctx_, fn)));
  }

  Value global() override { own(); return wrap(JS_GetGlobalObject(ctx_)); }
  Value undefined() override { own(); return wrap(JS_UNDEFINED); }
  Value null() override { own(); return wrap(JS_NULL); }
  Value boolean(bool b) override { own(); return wrap(JS_NewBool(ctx_, b)); }
  Value number(double d) override { own(); return wrap(JS_NewFloat64(ctx_, d)); }
  Value string(std::string_view s) override {
    own();
    return wrap(check(JS_NewStringLen(ctx_, s.data(), s.size())));
  }
  Value object() override { own(); return wrap(check(JS_NewObject(ctx_))); }

  Value nativeObject(std::shared_ptr<NativePayload> payload) override {
    own();
    auto value = check(JS_NewObjectClass(ctx_, nativeClass_));
    JS_SetOpaque(value, new std::shared_ptr<NativePayload>(std::move(payload)));
    return wrap(value);
  }
  std::shared_ptr<NativePayload> nativePayload(const Value& value) override {
    own();
    auto* qvalue = dynamic_cast<QjsValue*>(value.impl().get());
    if (!qvalue || qvalue->ctx != ctx_) return nullptr;
    auto* payload = static_cast<std::shared_ptr<NativePayload>*>(JS_GetOpaque(raw(value), nativeClass_));
    return payload ? *payload : nullptr;
  }

  static JSValue trampoline(JSContext* ctx, JSValueConst, int argc,
                            JSValueConst* argv, int, JSValueConst* data) {
    auto* engine = static_cast<QuickJsEngine*>(JS_GetContextOpaque(ctx));
    auto* box =
        static_cast<HostFunctionBox*>(JS_GetOpaque(data[0], engine->boxClass_));
    std::vector<Value> args;
    args.reserve(argc);
    for (int i = 0; i < argc; ++i) {
      args.push_back(engine->wrap(JS_DupValue(ctx, argv[i])));
    }
    try {
      Value result = box->fn(*engine, args);
      return result.empty() ? JS_UNDEFINED : JS_DupValue(ctx, raw(result));
    } catch (const std::exception& e) {
      // JS_ThrowInternalError is not catchable from script in QuickJS-ng.
      return JS_ThrowPlainError(ctx, "%s", e.what());
    }
  }

  Value function(const std::string& name, unsigned arity,
                 HostFunction fn) override {
    own();
    JSValue box = check(JS_NewObjectClass(ctx_, boxClass_));
    JS_SetOpaque(box, new HostFunctionBox{std::move(fn)});
    JSValue f = JS_NewCFunctionData(ctx_, &trampoline, int(arity), 0, 1, &box);
    JS_FreeValue(ctx_, box);
    check(f);
    JS_DefinePropertyValueStr(ctx_, f, "name", JS_NewString(ctx_, name.c_str()),
                              JS_PROP_CONFIGURABLE);
    return wrap(f);
  }

  Value externalArrayBuffer(uint8_t* data, size_t size, std::shared_ptr<NativePayload> owner) override {
    own();
    if (externalBufferRoots_.size() >= 4096) throw JsError("Native buffer view limit exceeded");
    auto retained = std::make_unique<std::shared_ptr<NativePayload>>(std::move(owner));
    auto value = JS_NewArrayBuffer(ctx_, data, size, 0,
      [](JSRuntime*, void* opaque, void*, size_t newSize) -> void* {
        if (newSize == 0) delete static_cast<std::shared_ptr<NativePayload>*>(opaque);
        return nullptr;
      },
      retained.get(), false);
    check(value);
    retained.release();
    externalBuffers_.insert(JS_VALUE_GET_PTR(value));
    externalBufferRoots_.push_back(JS_DupValue(ctx_, value));
    return wrap(value);
  }
  void detachArrayBuffer(const Value& buffer) override { own(); JS_DetachArrayBuffer(ctx_, raw(buffer)); }
  Value bytes(const uint8_t* data, size_t size) override {
    own();
    return wrap(check(JS_NewUint8ArrayCopy(ctx_, data, size)));
  }
  bool isBytes(const Value& v) override {
    own();
    return JS_IsArrayBuffer(raw(v)) || JS_GetTypedArrayType(raw(v)) >= 0;
  }
  size_t byteLength(const Value& v) override {
    own();
    size_t size=0;
    if(JS_IsArrayBuffer(raw(v))) { JS_GetArrayBuffer(ctx_,&size,raw(v)); return size; }
    size_t offset=0, perElement=0;
    auto buffer=check(JS_GetTypedArrayBuffer(ctx_,raw(v),&offset,&size,&perElement));
    JS_FreeValue(ctx_,buffer);
    return size;
  }
  bool isDetached(const Value& v) override {
    own();
    // Both calls throw on a detached or out-of-bounds buffer and report it
    // by their return value. The exception is dropped here.
    auto failed = [this] {
      JS_FreeValue(ctx_, JS_GetException(ctx_));
      return true;
    };
    if (JS_IsArrayBuffer(raw(v))) {
      size_t size = 0;
      return !JS_GetArrayBuffer(ctx_, &size, raw(v)) && JS_HasException(ctx_) ? failed() : false;
    }
    if (JS_GetTypedArrayType(raw(v)) < 0) return false;
    JSValue buffer = JS_GetTypedArrayBuffer(ctx_, raw(v), nullptr, nullptr, nullptr);
    if (JS_IsException(buffer)) return failed();
    JS_FreeValue(ctx_, buffer);
    return false;
  }
  std::vector<uint8_t> toBytes(const Value& v) override {
    own();
    size_t size = 0;
    if (JS_IsArrayBuffer(raw(v))) {
      uint8_t* data = JS_GetArrayBuffer(ctx_, &size, raw(v));
      if (!data && size > 0) throwPending();
      return std::vector<uint8_t>(data, data + size);
    }
    size_t offset = 0, perElement = 0;
    JSValue buffer = check(
        JS_GetTypedArrayBuffer(ctx_, raw(v), &offset, &size, &perElement));
    size_t total = 0;
    uint8_t* data = JS_GetArrayBuffer(ctx_, &total, buffer);
    JS_FreeValue(ctx_, buffer);
    // A detached buffer reports no data; its view is empty.
    if (!data || offset + size > total) return {};
    return std::vector<uint8_t>(data + offset, data + offset + size);
  }

  bool isUndefined(const Value& v) override { own(); return JS_IsUndefined(raw(v)); }
  bool isNull(const Value& v) override { own(); return JS_IsNull(raw(v)); }
  bool isString(const Value& v) override { own(); return JS_IsString(raw(v)); }
  bool isNumber(const Value& v) override { own(); return JS_IsNumber(raw(v)); }
  bool isObject(const Value& v) override { own(); return JS_IsObject(raw(v)); }
  bool isFunction(const Value& v) override {
    own();
    return JS_IsFunction(ctx_, raw(v));
  }

  std::string toString(const Value& v) override {
    own();
    JSValue s = check(JS_ToString(ctx_, raw(v)));
    std::string out = cString(s);
    JS_FreeValue(ctx_, s);
    return out;
  }
  double toNumber(const Value& v) override {
    own();
    double d = 0;
    if (JS_ToFloat64(ctx_, &d, raw(v)) < 0) throwPending();
    return d;
  }
  bool toBoolean(const Value& v) override {
    own();
    int r = JS_ToBool(ctx_, raw(v));
    if (r < 0) throwPending();
    return r != 0;
  }

  Value get(const Value& object, const std::string& name) override {
    own();
    return wrap(check(JS_GetPropertyStr(ctx_, raw(object), name.c_str())));
  }
  void set(const Value& object, const std::string& name,
           const Value& value) override {
    own();
    if (JS_SetPropertyStr(ctx_, raw(object), name.c_str(),
                          JS_DupValue(ctx_, raw(value))) < 0) {
      throwPending();
    }
  }
  Value call(const Value& fn, const Value& thisValue,
             const std::vector<Value>& args) override {
    own();
    std::vector<JSValue> argv;
    argv.reserve(args.size());
    for (const auto& a : args) argv.push_back(raw(a));
    return wrap(check(JS_Call(ctx_, raw(fn), raw(thisValue), int(argv.size()),
                              argv.data())));
  }

  PromiseCapability newPromise() override {
    own();
    JSValue funcs[2];
    JSValue p = check(JS_NewPromiseCapability(ctx_, funcs));
    return {wrap(p), wrap(funcs[0]), wrap(funcs[1])};
  }

  bool isPromise(const Value& v) override { own(); return JS_IsPromise(raw(v)); }

  bool hasPendingJobs() override {
    own();
    return JS_IsJobPending(rt_);
  }

  // JS_ExecutePendingJob runs one job per call, so the limit is exact.
  size_t drainJobs(size_t limit) override {
    own();
    size_t ran = 0;
    while (ran < limit) {
      JSContext* jobCtx = nullptr;
      int r = JS_ExecutePendingJob(rt_, &jobCtx);
      if (r == 0) break;
      ++ran;
      if (r < 0) {
        // A job threw outside any promise chain the kernel awaits.
        try {
          throwPending();
        } catch (const JsError& e) {
          std::fprintf(stderr, "[guest] uncaught job error: %s\n", e.what());
        }
      }
    }
    return ran;
  }

  void setInterruptHandler(std::function<bool()> handler) override {
    own();
    interrupt_ = std::move(handler);
  }

private:
  // Every override checks first, before any QuickJS call, so a foreign
  // thread aborts before it can run guest code or touch the runtime.
  void own() const { owner_.check("js::Engine"); }
  [[no_unique_address]] ThreadOwner owner_;
  std::unordered_set<void*> externalBuffers_;
  std::vector<JSValue> externalBufferRoots_;
  std::function<bool()> interrupt_;
  JSRuntime* rt_ = nullptr;
  JSContext* ctx_ = nullptr;
  JSClassID boxClass_ = 0;
  JSClassID nativeClass_ = 0;
};

}  // namespace

std::unique_ptr<Engine> createQuickJsEngine() {
  return std::make_unique<QuickJsEngine>();
}

void then(Engine& engine, const Value& promise,
          std::function<void(Engine&, const Value&)> onFulfilled,
          std::function<void(Engine&, const Value&)> onRejected) {
  Value thenFn = engine.get(promise, "then");
  Value ok = engine.function(
      "onFulfilled", 1,
      [f = std::move(onFulfilled)](Engine& e, const std::vector<Value>& args) {
        f(e, args.empty() ? e.undefined() : args[0]);
        return e.undefined();
      });
  Value err = engine.function(
      "onRejected", 1,
      [f = std::move(onRejected)](Engine& e, const std::vector<Value>& args) {
        f(e, args.empty() ? e.undefined() : args[0]);
        return e.undefined();
      });
  engine.call(thenFn, promise, {ok, err});
}

}  // namespace gr::js
