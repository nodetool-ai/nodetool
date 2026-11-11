// The sharp chain a guest describes in JSON (guest/host/sharp.mjs), as the
// fixed-size struct the native image jobs keep instead of a JSON tree.
//
// Thread affinity: none. parseImageSpec() is a pure function, and an
// ImageSpec is a value.
#pragma once

#include <cstddef>
#include <optional>
#include <string_view>

namespace gr::host {

// The longest spec text a sharp call may pass.
constexpr size_t kMaxImageSpecBytes = 4096;

// The most heap memory parseImageSpec() allocates through operator new. It
// scans the text in place and decodes the keys and string values it
// compares into 16-byte arrays on its stack, and std::from_chars converts
// numbers without allocating, so a parse that succeeds allocates nothing.
// One that fails throws std::runtime_error built from a fixed message of at
// most 64 bytes: libstdc++ copies it once into a reference-counted string,
// a 24-byte header plus the text and its terminator, 89 bytes at most. The
// exception object itself comes from the C++ runtime's exception
// allocator, not operator new. The bound adds room for that one block.
constexpr size_t kImageSpecParseBytes = 128;

// Unknown keys may hold values nested at most this deep.
constexpr size_t kMaxImageSpecDepth = 64;

// The fields of a sharp chain the native adapter evaluates. Holds no heap
// storage.
struct ImageSpec {
  enum class Format { Png, Webp, Raw };
  struct Size {
    int width = 0;
    int height = 0;
    int channels = 0;
  };
  struct Rect {
    int left = 0;
    int top = 0;
    int width = 0;
    int height = 0;
  };
  struct Color {
    double r = 0;
    double g = 0;
    double b = 0;
    double alpha = 1;
  };
  std::optional<Size> raw;
  std::optional<Size> create;
  // With `create` only.
  Color background;
  // `channels` unused.
  std::optional<Size> resize;
  std::optional<Rect> extract;
  bool greyscale = false;
  bool removeAlpha = false;
  bool ensureAlpha = false;
  Format format = Format::Png;
  bool webpLossless = false;
  int webpQuality = 80;
};

// Parses spec JSON into an ImageSpec without building a JSON tree, and
// allocates at most kImageSpecParseBytes. Keys the adapter does not read
// are skipped with their values, at any depth up to kMaxImageSpecDepth, as
// sharp ignores options it does not know. Throws std::runtime_error for
// text longer than kMaxImageSpecBytes, malformed JSON, a top level that is
// not an object, and a field the adapter reads that holds null or the wrong
// type, or lacks a required member, or is out of range.
ImageSpec parseImageSpec(std::string_view text);

}  // namespace gr::host
