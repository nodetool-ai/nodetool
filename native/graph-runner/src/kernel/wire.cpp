#include "kernel/wire.h"

#include <algorithm>
#include <array>
#include <cstring>

namespace gr {
namespace {

constexpr char kBytes[] = "__bytes__";
constexpr char kBlob[] = "__blob__";
constexpr char kTyped[] = "__typed__";
constexpr char kBuffer[] = "__buffer__";

// Names of the kinds that carry a "__typed__" tag, by BlobKind.
constexpr std::array<std::string_view, 14> kTypedNames = {
    "",              "",             "ArrayBuffer",  "Int8Array",    "Uint8ClampedArray",
    "Int16Array",    "Uint16Array",  "Int32Array",   "Uint32Array",  "Float32Array",
    "Float64Array",  "BigInt64Array", "BigUint64Array", "DataView",
};

// What a walk of a value found.
//
// Thread affinity: none. A value with no shared state.
struct Found {
  bool bytes = false;
  // An object with a "__blob__" key, which markers would be confused with.
  bool marker = false;
};

// Walks without recursion: a value parsed from host text can nest deeper
// than the stack allows.
Found scan(const Json& root) {
  Found found;
  std::vector<const Json*> stack{&root};
  while (!stack.empty()) {
    const Json* value = stack.back();
    stack.pop_back();
    if (value->is_binary()) {
      found.bytes = true;
    } else if (value->is_object()) {
      for (auto it = value->begin(); it != value->end(); ++it) {
        if (it.key() == kBlob) found.marker = true;
        if (it->is_structured() || it->is_binary()) stack.push_back(&*it);
      }
    } else if (value->is_array()) {
      for (const Json& item : *value) {
        if (item.is_structured() || item.is_binary()) stack.push_back(&item);
      }
    }
  }
  return found;
}

void appendBase64(std::string& out, std::span<const uint8_t> bytes) {
  static constexpr char kAlphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const size_t start = out.size();
  out.resize(start + (bytes.size() + 2) / 3 * 4);
  char* to = out.data() + start;
  size_t i = 0;
  for (; i + 3 <= bytes.size(); i += 3) {
    const uint32_t n = (uint32_t(bytes[i]) << 16) | (uint32_t(bytes[i + 1]) << 8) | bytes[i + 2];
    *to++ = kAlphabet[n >> 18];
    *to++ = kAlphabet[(n >> 12) & 63];
    *to++ = kAlphabet[(n >> 6) & 63];
    *to++ = kAlphabet[n & 63];
  }
  if (const size_t left = bytes.size() - i; left == 1) {
    const uint32_t n = uint32_t(bytes[i]) << 16;
    *to++ = kAlphabet[n >> 18];
    *to++ = kAlphabet[(n >> 12) & 63];
    *to++ = '=';
    *to++ = '=';
  } else if (left == 2) {
    const uint32_t n = (uint32_t(bytes[i]) << 16) | (uint32_t(bytes[i + 1]) << 8);
    *to++ = kAlphabet[n >> 18];
    *to++ = kAlphabet[(n >> 12) & 63];
    *to++ = kAlphabet[(n >> 6) & 63];
    *to++ = '=';
  }
}

// Writes a value that holds bytes. Everything without bytes below it is
// written by Json::dump, so the text is the one dump() gives.
//
// Thread affinity: the thread of the call that made it. It lives on that
// call's stack.
class Writer {
public:
  Writer(Json::error_handler_t handler, std::vector<Blob>* transit) : handler_(handler), transit_(transit) {}

  // `value` holds bytes.
  void write(const Json& value) {
    if (value.is_binary()) {
      writeBytes(value.get_binary());
    } else if (value.is_object()) {
      out_ += '{';
      bool first = true;
      for (auto it = value.begin(); it != value.end(); ++it) {
        if (!std::exchange(first, false)) out_ += ',';
        out_ += Json(it.key()).dump(-1, ' ', false, handler_);
        out_ += ':';
        writeChild(*it);
      }
      out_ += '}';
    } else {
      out_ += '[';
      bool first = true;
      for (const Json& item : value) {
        if (!std::exchange(first, false)) out_ += ',';
        writeChild(item);
      }
      out_ += ']';
    }
  }

  std::string take() { return std::move(out_); }

private:
  void writeChild(const Json& value) {
    if (value.is_binary() || (value.is_structured() && scan(value).bytes)) {
      write(value);
    } else {
      out_ += value.dump(-1, ' ', false, handler_);
    }
  }

  void writeBytes(const Blob& blob) {
    const std::string_view typed = typedName(blob.kind());
    out_ += '{';
    if (!typed.empty()) {
      out_ += "\"__typed__\":\"";
      out_ += typed;
      out_ += "\",";
    }
    if (transit_) {
      out_ += "\"__blob__\":";
      out_ += std::to_string(transit_->size());
      transit_->push_back(blob);
    } else {
      out_ += "\"__bytes__\":\"";
      appendBase64(out_, blob.bytes());
      out_ += '"';
    }
    if (blob.kind() == BlobKind::Buffer) out_ += ",\"__buffer__\":true";
    out_ += '}';
  }

  const Json::error_handler_t handler_;
  // Non-owning, or null to write base64. Outlives the writer.
  std::vector<Blob>* const transit_;
  std::string out_;
};

// The blob a marker object names, or nullopt when `value` is no marker.
std::optional<Blob> markedBlob(const Json& value, const std::vector<Blob>& blobs) {
  const auto index = value.find(kBlob);
  if (index == value.end() || !index->is_number_integer() || value.size() > 2) return std::nullopt;
  const auto n = index->get<int64_t>();
  if (n < 0 || static_cast<uint64_t>(n) >= blobs.size()) return std::nullopt;
  const Blob& blob = blobs[static_cast<size_t>(n)];
  if (value.size() == 1) return blob.withKind(BlobKind::Uint8Array);
  if (const auto buffer = value.find(kBuffer); buffer != value.end()) {
    if (buffer->is_boolean() && buffer->get<bool>()) return blob.withKind(BlobKind::Buffer);
    return std::nullopt;
  }
  const auto typed = value.find(kTyped);
  if (typed == value.end() || !typed->is_string()) return std::nullopt;
  if (const auto kind = typedKind(typed->get_ref<const std::string&>())) return blob.withKind(*kind);
  return std::nullopt;
}

}  // namespace

std::string_view typedName(BlobKind kind) { return kTypedNames[static_cast<size_t>(kind)]; }

std::optional<BlobKind> typedKind(std::string_view name) {
  if (name.empty()) return std::nullopt;
  const auto found = std::find(kTypedNames.begin(), kTypedNames.end(), name);
  if (found == kTypedNames.end()) return std::nullopt;
  return static_cast<BlobKind>(found - kTypedNames.begin());
}

bool operator==(const Blob& a, const Blob& b) {
  return a.kind_ == b.kind_ && a.size() == b.size() &&
         (a.storage_ == b.storage_ || a.size() == 0 || std::memcmp(a.data(), b.data(), a.size()) == 0);
}

std::strong_ordering operator<=>(const Blob& a, const Blob& b) {
  const auto bytes = std::lexicographical_compare_three_way(a.begin(), a.end(), b.begin(), b.end());
  return bytes != 0 ? bytes : a.kind_ <=> b.kind_;
}

bool holdsBytes(const Json& value) { return scan(value).bytes; }

std::string dumpWire(const Json& value, Json::error_handler_t handler) {
  if (!scan(value).bytes) return value.dump(-1, ' ', false, handler);
  Writer writer(handler, nullptr);
  writer.write(value);
  return writer.take();
}

std::string dumpTransit(const Json& value, std::vector<Blob>& blobs) {
  const Found found = scan(value);
  if (!found.bytes) return value.dump();
  Writer writer(Json::error_handler_t::strict, found.marker ? nullptr : &blobs);
  writer.write(value);
  return writer.take();
}

void attachBlobs(Json& root, const std::vector<Blob>& blobs) {
  if (blobs.empty()) return;
  std::vector<Json*> stack{&root};
  while (!stack.empty()) {
    Json* value = stack.back();
    stack.pop_back();
    if (value->is_object()) {
      if (auto blob = markedBlob(*value, blobs)) {
        *value = Json::binary(std::move(*blob));
        continue;
      }
      for (auto it = value->begin(); it != value->end(); ++it) {
        if (it->is_structured()) stack.push_back(&*it);
      }
    } else if (value->is_array()) {
      for (Json& item : *value) {
        if (item.is_structured()) stack.push_back(&item);
      }
    }
  }
}

}  // namespace gr
