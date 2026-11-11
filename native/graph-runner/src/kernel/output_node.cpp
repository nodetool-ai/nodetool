// `nodetool.output.Output`, run by the kernel. The TypeScript class lives in
// audio-nodes and pulls in media dependencies, so the guest does not bundle
// it. For JSON values its process() is `{ output: this.value ?? null }`.
// normalizeOutputValue and asset persistence only touch bytes and media refs:
// those values go to the guest's outputValue (guest/host/output.mjs).
#include "kernel/executor.h"

namespace gr {
namespace {

// Bytes from a node, or their tagged base64 form from a host or the store.
bool isBytesTag(const Json& v) {
  return v.is_binary() || (v.is_object() && v.contains("__bytes__") && v["__bytes__"].is_string());
}

bool containsBytes(const Json& v) {
  if (isBytesTag(v)) return true;
  if (v.is_array() || v.is_object()) {
    for (const auto& item : v) {
      if (containsBytes(item)) return true;
    }
  }
  return false;
}

bool nonEmpty(const Json& v, const char* key) {
  if (!v.contains(key)) return false;
  const Json& f = v[key];
  if (f.is_string()) return !f.get_ref<const std::string&>().empty();
  return !f.is_null();
}

// Whether OutputNode.process could change the value: bytes anywhere become
// {type: "bytes", length}, and a media ref that carries data or a uri but no
// asset id is saved as an asset.
bool needsGuest(const Json& v) {
  if (containsBytes(v)) return true;
  if (!v.is_object() || !v.contains("type") || !v["type"].is_string()) return false;
  const std::string& type = v["type"].get_ref<const std::string&>();
  if (type != "image" && type != "audio" && type != "video") return false;
  return !nonEmpty(v, "asset_id") && (nonEmpty(v, "data") || nonEmpty(v, "uri"));
}

class OutputFrames final : public FrameIterator {
public:
  explicit OutputFrames(Task<Json> frame) : frame_(std::move(frame)) {}
  Task<std::optional<Json>> next() override {
    co_await Tick{};
    if (done_) co_return std::nullopt;
    done_ = true;
    co_return co_await frame_;
  }

private:
  Task<Json> frame_;
  bool done_ = false;
};

class OutputExecutor final : public Executor {
public:
  OutputExecutor(const Json& properties, OutputValueStep valueStep)
      : valueStep_(std::move(valueStep)) {
    // BaseNode.assign() at construction: declared `value` defaults to null.
    if (properties.is_object() && properties.contains("value")) {
      value_ = properties["value"];
    }
  }

  Task<void> initialize() override { co_await Tick{}; }
  Task<void> preProcess() override { co_await Tick{}; }
  Task<void> finalize() override { co_await Tick{}; }

  Task<Json> process(Json inputs) override {
    co_await Tick{};
    co_return co_await step(std::move(inputs));
  }

  // BaseNode's default genProcess yields process() once, after assign().
  std::unique_ptr<FrameIterator> genProcess(Json inputs) override {
    return std::make_unique<OutputFrames>(step(std::move(inputs)));
  }

  bool hasRun() const override { return false; }
  Task<Json> run(StreamIO&) override {
    throw NodeError("Output node has no run()");
    co_return Json();
  }

private:
  Task<Json> step(Json inputs) {
    if (inputs.is_object() && inputs.contains("value")) value_ = inputs["value"];
    if (valueStep_ && needsGuest(value_)) co_return Json{{"output", co_await valueStep_(value_)}};
    co_return Json{{"output", value_}};
  }

  OutputValueStep valueStep_;
  Json value_ = nullptr;
};

}  // namespace

std::unique_ptr<Executor> makeOutputExecutor(const Json& properties, OutputValueStep valueStep) {
  return std::make_unique<OutputExecutor>(properties, std::move(valueStep));
}

}  // namespace gr
