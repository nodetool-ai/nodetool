// A node value shared by the readers of one output (PT11).
#pragma once

#include "kernel/json.h"

#include <memory>
#include <utility>

namespace gr {

// One output value, shared by the edges that carry it, the inboxes and
// envelopes that hold it, and the output_update that reports it, so a
// fan-out of N edges holds one value, not N copies. Copies of a SharedValue
// share the Json. No holder changes it after creation: readers see it as
// const, and take() moves it out only from its last holder.
//
// Thread affinity: the run's worker thread only, like the inboxes and
// actors that hold it. Destroyed with its last holder.
class SharedValue {
public:
  // JSON null.
  SharedValue() = default;
  explicit SharedValue(Json value) : json_(std::make_shared<Json>(std::move(value))) {}

  const Json& operator*() const { return json_ ? *json_ : null(); }
  const Json* operator->() const { return &**this; }

  // The value: moved out when this is its only holder, else a copy. Leaves
  // this holder null.
  Json take() {
    if (!json_) return Json();
    std::shared_ptr<Json> json = std::exchange(json_, nullptr);
    if (json.use_count() == 1) return std::move(*json);
    return *json;
  }

  // Lends the Json to `fn` as a mutable lvalue for the length of the call,
  // then puts back what `fn` left in it. `fn` must leave an equal value,
  // such as by swapping it into a message and back, and no other holder may
  // read it during the call. For a synchronous sink that would otherwise
  // need a copy.
  template <class F>
  void lend(F&& fn) {
    if (!json_) json_ = std::make_shared<Json>();
    fn(*json_);
  }

private:
  static const Json& null() {
    static const Json value;
    return value;
  }

  // native-rules #1: shared because the readers of one output value (each
  // edge's inbox envelope, an actor's sticky and last envelopes, the
  // output_update) end at independent times. The last one frees the value.
  std::shared_ptr<Json> json_;
};

}  // namespace gr
