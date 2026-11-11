// Bytes inside a node value (PT13). A Blob is the binary type of gr::Json,
// so a value that holds bytes carries them as bytes, not as base64 text.
#pragma once

#include "nodetool/jobs/admission.h"

#include <compare>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <span>
#include <string_view>
#include <utility>
#include <vector>

namespace gr {

// The JavaScript type the bytes had in the node that made them. The next
// node gets the same type (guest/values.mjs).
enum class BlobKind : uint8_t {
  Uint8Array,
  Buffer,
  ArrayBuffer,
  Int8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
  DataView,
};

// The "__typed__" tag of a kind, or empty for Uint8Array and Buffer, which
// carry no such tag.
std::string_view typedName(BlobKind kind);
// The kind a "__typed__" tag names, or nullopt for an unknown name.
std::optional<BlobKind> typedKind(std::string_view name);

// Immutable bytes shared by every copy of the Json value that holds them.
// Copying a Blob copies a reference, never the bytes, so a fan-out of N
// edges holds the bytes once. The bytes never change after construction.
//
// Ownership: the copies share one Storage, and the last copy destroys it,
// which frees the bytes and releases their admission charge. No table and
// no id names a blob: a blob lives exactly as long as a value holds it.
//
// Thread affinity: the run's worker thread, like the Json values that hold
// it. Reading from another thread is safe (the bytes are const, the
// reference count is atomic, and the ledger takes its own mutex), but the
// runner never does so.
class Blob {
public:
  // No bytes, as a Uint8Array.
  Blob() = default;
  // Takes the bytes. `charge` is the admission reservation that covers
  // them, or empty for bytes made outside a run.
  explicit Blob(std::vector<uint8_t> bytes, BlobKind kind = BlobKind::Uint8Array,
                nodetool::jobs::Reservation charge = {})
      : storage_(std::make_shared<const Storage>(std::move(bytes), std::move(charge))), kind_(kind) {}

  // The same bytes as another JavaScript type.
  Blob withKind(BlobKind kind) const {
    Blob out = *this;
    out.kind_ = kind;
    return out;
  }

  BlobKind kind() const { return kind_; }
  const uint8_t* data() const { return storage_ ? storage_->bytes.data() : nullptr; }
  size_t size() const { return storage_ ? storage_->bytes.size() : 0; }
  std::span<const uint8_t> bytes() const { return {data(), size()}; }
  // Bytes the admission ledger holds for this blob.
  uint64_t chargedBytes() const { return storage_ ? storage_->charge.bytes() : 0; }

  // The read-only container interface nlohmann::basic_json needs of its
  // binary type.
  using value_type = uint8_t;
  using const_iterator = const uint8_t*;
  using iterator = const_iterator;
  bool empty() const { return size() == 0; }
  const_iterator begin() const { return data(); }
  const_iterator end() const { return data() + size(); }
  const_iterator cbegin() const { return begin(); }
  const_iterator cend() const { return end(); }
  const uint8_t& back() const { return *(end() - 1); }

  // Equal bytes of the same kind.
  friend bool operator==(const Blob& a, const Blob& b);
  friend std::strong_ordering operator<=>(const Blob& a, const Blob& b);

private:
  struct Storage {
    Storage(std::vector<uint8_t> b, nodetool::jobs::Reservation c) : bytes(std::move(b)), charge(std::move(c)) {}
    const std::vector<uint8_t> bytes;
    // Released with the bytes.
    nodetool::jobs::Reservation charge;
  };

  // native-rules #1: shared because the bytes of one output are read by
  // every edge from it, by each inbox envelope, by an actor's last result
  // and by the messages that report it, which end at independent times.
  // Unique ownership would need one copy of the bytes for each of them.
  std::shared_ptr<const Storage> storage_;
  BlobKind kind_ = BlobKind::Uint8Array;
};

}  // namespace gr
