#include "kernel/job_inputs.h"

#include <algorithm>
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

uint64_t stringBytesBound(js::Engine& engine, const js::Value& value, std::string_view name) {
  if (!engine.isString(value)) throw badArgument(name, "must be a string");
  const double units = engine.toNumber(engine.get(value, "length"));
  // A UTF-16 unit becomes at most three UTF-8 bytes; a surrogate pair, two
  // units, becomes four.
  return nodetool::jobs::checkedMul(static_cast<uint64_t>(units), 3);
}

std::vector<uint8_t> snapshotBytes(js::Engine& engine, const js::Value& value, std::string_view name,
                                   nodetool::jobs::Reservation& reservation) {
  if (!engine.isBytes(value)) throw badArgument(name, "must be an ArrayBuffer or a typed array");
  if (engine.isDetached(value)) throw badArgument(name, "is a detached or out-of-bounds buffer");
  reservation.reserveSnapshot(engine.byteLength(value));
  return engine.toBytes(value);
}

std::string snapshotString(js::Engine& engine, const js::Value& value, std::string_view name,
                           nodetool::jobs::Reservation& reservation) {
  const uint64_t bound = stringBytesBound(engine, value, name);
  reservation.reserveSnapshot(bound);
  std::string text = engine.toString(value);
  reservation.releaseSnapshot(bound - std::min<uint64_t>(bound, text.size()));
  return text;
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
