// parseImageSpec (src/host/image_spec.h): the bound on what it allocates,
// null and type checks of the fields the image adapter reads, and unknown
// keys skipped as sharp ignores them.
//
//   gr_image_spec_tests
//
// The binary replaces the global operator new and delete to measure the
// parser's live and peak heap bytes. The counters are thread_local and count
// only while a Tracking scope is open on that thread, so allocations of
// other threads and of the test's own setup are not counted.
#include "host/image_spec.h"

#include <algorithm>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include <optional>
#include <stdexcept>
#include <string>

// The sanitizer runtimes replace operator new and delete themselves, so a
// sanitizer build cannot also replace them and skips the allocation gate.
#if defined(__has_feature)
#if __has_feature(address_sanitizer) || __has_feature(thread_sanitizer)
#define GR_SANITIZED_ALLOCATOR 1
#endif
#endif
#if defined(__SANITIZE_ADDRESS__) || defined(__SANITIZE_THREAD__)
#define GR_SANITIZED_ALLOCATOR 1
#endif

namespace {

// Per-thread allocation counters of the replaced operator new and delete.
// A replacement cannot take a context argument, so this test-only
// instrumentation lives in thread storage, touched only by its own thread.
struct Counters {
  bool tracking = false;
  size_t live = 0;
  size_t peak = 0;
};
thread_local Counters counters;

// Each block carries its size in a header, so the unsized delete can count
// what it frees.
constexpr size_t kHeader = alignof(std::max_align_t);

void* allocate(size_t size) {
  void* block = std::malloc(size + kHeader);
  if (!block) throw std::bad_alloc();
  std::memcpy(block, &size, sizeof(size));
  if (counters.tracking) {
    counters.live += size;
    if (counters.live > counters.peak) counters.peak = counters.live;
  }
  return static_cast<char*>(block) + kHeader;
}

void release(void* pointer) noexcept {
  if (!pointer) return;
  void* block = static_cast<char*>(pointer) - kHeader;
  size_t size = 0;
  std::memcpy(&size, block, sizeof(size));
  if (counters.tracking) counters.live -= std::min(size, counters.live);
  std::free(block);
}

}  // namespace

#ifndef GR_SANITIZED_ALLOCATOR
void* operator new(size_t size) { return allocate(size); }
void* operator new[](size_t size) { return allocate(size); }
void operator delete(void* pointer) noexcept { release(pointer); }
void operator delete[](void* pointer) noexcept { release(pointer); }
void operator delete(void* pointer, size_t) noexcept { release(pointer); }
void operator delete[](void* pointer, size_t) noexcept { release(pointer); }
#endif

namespace {

using gr::host::ImageSpec;
using gr::host::kImageSpecParseBytes;
using gr::host::kMaxImageSpecBytes;
using gr::host::parseImageSpec;

// Thread affinity: main thread only.
struct Checks {
  int checks = 0;
  int failures = 0;
  void check(bool ok, int line, const char* expression) {
    ++checks;
    if (ok) return;
    ++failures;
    std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, line, expression);
  }
};
#define CHECK(cond) t.check(static_cast<bool>(cond), __LINE__, #cond)

// What one parse did: its error message, if it threw, and the peak heap
// bytes it held.
struct Parsed {
  std::optional<ImageSpec> spec;
  std::string error;
  size_t peak = 0;
};

Parsed parse(const std::string& text) {
  Parsed out;
  counters = {true, 0, 0};
  try {
    out.spec = parseImageSpec(text);
  } catch (const std::runtime_error& e) {
    // Measured before the message is copied out.
    out.peak = counters.peak;
    counters.tracking = false;
    out.error = e.what();
    return out;
  }
  out.peak = counters.peak;
  counters.tracking = false;
  return out;
}

bool same(const ImageSpec& a, const ImageSpec& b) {
  auto sameSize = [](const std::optional<ImageSpec::Size>& x, const std::optional<ImageSpec::Size>& y) {
    return x.has_value() == y.has_value() &&
           (!x || (x->width == y->width && x->height == y->height && x->channels == y->channels));
  };
  const bool extract = a.extract.has_value() == b.extract.has_value() &&
                       (!a.extract || (a.extract->left == b.extract->left && a.extract->top == b.extract->top &&
                                       a.extract->width == b.extract->width && a.extract->height == b.extract->height));
  return sameSize(a.raw, b.raw) && sameSize(a.create, b.create) && sameSize(a.resize, b.resize) && extract &&
         a.background.r == b.background.r && a.background.g == b.background.g && a.background.b == b.background.b &&
         a.background.alpha == b.background.alpha && a.greyscale == b.greyscale && a.removeAlpha == b.removeAlpha &&
         a.ensureAlpha == b.ensureAlpha && a.format == b.format && a.webpLossless == b.webpLossless &&
         a.webpQuality == b.webpQuality;
}

// `prefix` + `fill` repeated + `suffix`, as long as possible within the
// spec limit.
std::string nearLimit(const std::string& prefix, const std::string& fill, const std::string& suffix) {
  std::string text = prefix;
  while (text.size() + fill.size() + suffix.size() <= kMaxImageSpecBytes) text += fill;
  return text + suffix;
}

// Gate: the parser's peak heap bytes stay within kImageSpecParseBytes for
// one long string token, one long number token and many short tokens near
// the 4096-byte limit, whether the token is skipped or read, and whether the
// parse succeeds or fails.
void allocationStaysWithinTheBound(Checks& t) {
  // The counters see allocations: a direct ::operator new call, which the
  // compiler may not elide, is counted.
  counters = {true, 0, 0};
  void* volatile probe = ::operator new(1000);
  ::operator delete(probe);
  counters.tracking = false;
  CHECK(counters.peak == 1000);
  CHECK(counters.live == 0);
  struct Case {
    const char* name;
    std::string text;
    bool ok;
  };
  const Case cases[] = {
      {"long skipped string", nearLimit(R"({"format":"png","note":")", "x", R"("})"), true},
      {"long escaped string", nearLimit(R"({"format":"png","note":")", "\\u00e9", R"("})"), true},
      {"long string key", nearLimit(R"({"format":"png",")", "k", R"(":1})"), true},
      {"long format value", nearLimit(R"({"format":")", "p", R"("})"), false},
      {"long skipped number", nearLimit(R"({"format":"png","n":1)", "7", "}"), true},
      {"long skipped fraction", nearLimit(R"({"format":"png","n":0.)", "3", "e-5}"), true},
      {"long read number", nearLimit(R"({"resize":{"height":2,"width":1)", "0", "}}"), false},
      {"many short tokens", nearLimit(R"({"format":"png","a":[0)", ",0", "]}"), true},
      {"many short keys", nearLimit(R"({"format":"png")", R"(,"k":0)", "}"), true},
      {"many short objects", nearLimit(R"({"a":[{})", ",{}", "]}"), true},
      {"deep unknown value", std::string(R"({"a":)") + std::string(64, '[') + std::string(64, ']') + "}", true},
      {"too deep unknown value", std::string(R"({"a":)") + std::string(65, '[') + std::string(65, ']') + "}", false},
      {"malformed near the end", nearLimit(R"({"format":"png","a":[0)", ",0", "]"), false},
      {"full spec",
       R"({"raw":{"width":4,"height":3,"channels":4},"resize":{"width":2,"height":2},)"
       R"("extract":{"left":0,"top":0,"width":1,"height":1},"greyscale":true,"removeAlpha":false,)"
       R"("ensureAlpha":true,"format":"webp","webp":{"lossless":true,"quality":90}})",
       true},
  };
  for (const Case& c : cases) {
    const Parsed parsed = parse(c.text);
    const bool ok = parsed.spec.has_value();
    if (ok != c.ok || parsed.peak > kImageSpecParseBytes) {
      std::fprintf(stderr, "%s: %zu bytes, ok %d, peak %zu, error '%s'\n", c.name, c.text.size(), ok, parsed.peak,
                   parsed.error.c_str());
    }
    CHECK(c.text.size() <= kMaxImageSpecBytes);
    CHECK(ok == c.ok);
    CHECK(parsed.peak <= kImageSpecParseBytes);
    // A parse that succeeds allocates nothing.
    if (ok) CHECK(parsed.peak == 0);
  }
  const Parsed tooLong = parse(std::string(kMaxImageSpecBytes + 1, ' '));
  CHECK(tooLong.error == "Image spec exceeds 4096 bytes");
  CHECK(tooLong.peak <= kImageSpecParseBytes);
}

// Gate: a field the adapter reads rejects null and other types, and a
// required member counts only when its value was valid.
void nullAndWrongTypesReject(Checks& t) {
  struct Case {
    const char* text;
    const char* error;
  };
  const Case cases[] = {
      {R"({"resize":{"width":null,"height":1}})", "Invalid image spec field type"},
      {R"({"resize":{"height":1}})", "Invalid image dimension"},
      {R"({"resize":null})", "Invalid image spec field type"},
      {R"({"raw":null})", "Invalid image spec field type"},
      {R"({"raw":{"width":1,"height":1}})", "Invalid image dimension"},
      {R"({"raw":{"width":1,"height":1,"channels":4.5}})", "Invalid image dimension"},
      {R"({"create":{"width":1,"height":1,"channels":4,"background":null}})", "Invalid image spec field type"},
      {R"({"create":{"width":1,"height":1,"channels":4}})", "Image creation needs a background colour"},
      {R"({"create":{"width":1,"height":1,"channels":4,"background":{"r":0,"g":0}}})",
       "Image creation needs a background colour"},
      {R"({"create":{"width":1,"height":1,"channels":4,"background":{"r":0,"g":0,"b":null}}})",
       "Invalid image spec field type"},
      {R"({"extract":{"left":0,"top":null,"width":1,"height":1}})", "Invalid image spec field type"},
      {R"({"extract":{"left":0,"width":1,"height":1}})", "Invalid image dimension"},
      {R"({"format":null})", "Invalid image spec field type"},
      {R"({"format":["png"]})", "Invalid image spec field type"},
      {R"({"format":"tiff"})", "Unsupported image output format"},
      {R"({"greyscale":null})", "Invalid image spec field type"},
      {R"({"greyscale":1})", "Invalid image spec field type"},
      {R"({"webp":null})", "Invalid image spec field type"},
      {R"({"webp":{"lossless":null}})", "Invalid image spec field type"},
      {R"({"webp":{"quality":0}})", "Invalid WebP quality"},
      {R"({"format":"webp","webp":{"effort":4}})", "Unsupported native WebP option"},
      {"[]", "Image spec must be an object"},
      {"null", "Image spec must be an object"},
      {R"({"format":"png",})", "Invalid image spec JSON"},
      {R"({"format":"png"} x)", "Invalid image spec JSON"},
      {R"({"a":"\ud800"})", "Invalid image spec JSON"},
      {R"({"a":"\q"})", "Invalid image spec JSON"},
      {"{\"a\":\"\x01\"}", "Invalid image spec JSON"},
      {R"({"a":01})", "Invalid image spec JSON"},
  };
  for (const Case& c : cases) {
    const Parsed parsed = parse(c.text);
    if (parsed.error != c.error) std::fprintf(stderr, "%s: got '%s'\n", c.text, parsed.error.c_str());
    CHECK(parsed.error == c.error);
  }
  // Duplicate keys: the last value counts, as in the base's JSON parser.
  const Parsed duplicate = parse(R"({"format":"raw","format":"png"})");
  CHECK(duplicate.spec && duplicate.spec->format == ImageSpec::Format::Png);
}

// Gate: unknown keys are skipped with their values, objects and arrays
// included, at the top level and inside every object the adapter reads, and
// the result is the spec without them.
void unknownKeysAreIgnored(Checks& t) {
  const std::string plain =
      R"({"raw":{"width":4,"height":3,"channels":4},"create":{"width":2,"height":2,"channels":4,)"
      R"("background":{"r":1,"g":2,"b":3,"alpha":0.5}},"resize":{"width":2,"height":2},)"
      R"("extract":{"left":1,"top":0,"width":1,"height":1},"greyscale":true,"removeAlpha":true,)"
      R"("ensureAlpha":false,"format":"webp","webp":{"lossless":true,"quality":70}})";
  const std::string extra =
      R"({"premultiplied":false,"raw":{"width":4,"premultiplied":true,"height":3,"channels":4,"x":{"y":[1,{"z":null}]}},)"
      R"("create":{"noise":{"type":"gaussian","mean":128,"sigma":30},"width":2,"height":2,"channels":4,)"
      R"("background":{"r":1,"g":2,"b":3,"alpha":0.5,"space":"srgb","tags":[[],{}]}},)"
      R"("resize":{"width":2,"height":2,"fit":"fill","kernel":"lanczos3","options":{"a":[true,false,null]}},)"
      R"("extract":{"left":1,"top":0,"width":1,"height":1,"unit":"px"},"greyscale":true,"removeAlpha":true,)"
      R"("ensureAlpha":false,"format":"webp","density":72,"meta":{"list":[1,2.5e3,"s\"\\\/é😀"]},)"
      R"("webp":{"lossless":true,"quality":70}})";
  const Parsed a = parse(plain);
  const Parsed b = parse(extra);
  CHECK(a.spec.has_value());
  CHECK(b.spec.has_value());
  CHECK(a.spec && b.spec && same(*a.spec, *b.spec));
  // WebP options the adapter does not write are ignored when the output is
  // not WebP, as in the base.
  const Parsed png = parse(R"({"format":"png","webp":{"effort":4}})");
  CHECK(png.spec && png.spec->format == ImageSpec::Format::Png);
}

}  // namespace

int main() {
  Checks t;
#ifdef GR_SANITIZED_ALLOCATOR
  std::fprintf(stderr, "allocationStaysWithinTheBound skipped: sanitizer build\n");
  (void)&allocationStaysWithinTheBound;
#else
  allocationStaysWithinTheBound(t);
#endif
  nullAndWrongTypesReject(t);
  unknownKeysAreIgnored(t);
  std::fprintf(stderr, "%d checks, %d failures\n", t.checks, t.failures);
  return t.failures == 0 ? 0 : 1;
}
