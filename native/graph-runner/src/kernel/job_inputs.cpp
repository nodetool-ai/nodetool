#include "kernel/job_inputs.h"

#include <stdexcept>

namespace gr {
namespace {

std::invalid_argument badArgument(std::string_view name, std::string_view problem) {
  return std::invalid_argument(std::string(name) + " " + std::string(problem));
}

}  // namespace

std::vector<uint8_t> snapshotBytes(js::Engine& engine, const js::Value& value, std::string_view name) {
  if (!engine.isBytes(value)) throw badArgument(name, "must be an ArrayBuffer or a typed array");
  if (engine.isDetached(value)) throw badArgument(name, "is a detached or out-of-bounds buffer");
  return engine.toBytes(value);
}

std::string snapshotString(js::Engine& engine, const js::Value& value, std::string_view name) {
  if (!engine.isString(value)) throw badArgument(name, "must be a string");
  return engine.toString(value);
}

std::string snapshotOptions(js::Engine& engine, const js::Value& value, std::string_view name) {
  if (engine.isUndefined(value) || engine.isNull(value)) return "{}";
  if (!engine.isObject(value) || engine.isFunction(value)) throw badArgument(name, "must be an object");
  js::Value json = engine.get(engine.global(), "JSON");
  js::Value text = engine.call(engine.get(json, "stringify"), json, {value});
  if (!engine.isString(text)) throw badArgument(name, "cannot be serialized");
  return engine.toString(text);
}

}  // namespace gr
