#include "host/image_spec.h"

#include <array>
#include <charconv>
#include <cmath>
#include <stdexcept>
#include <string>
#include <system_error>

namespace gr::host {
namespace {

// A strict JSON reader over the spec text that stores nothing but the
// ImageSpec: it scans in place, decodes the keys and string values it
// compares into fixed arrays, and converts numbers with std::from_chars.
// Recursion is bounded by kMaxImageSpecDepth.
//
// Thread affinity: the calling thread, for one parse.
class SpecParser {
public:
  explicit SpecParser(std::string_view text) : text_(text) {}

  ImageSpec parse() {
    space();
    if (peek() != '{') fail("Image spec must be an object");
    root();
    space();
    if (pos_ != text_.size()) syntax();
    return spec_;
  }

private:
  // A decoded key or string value. One longer than the array matches no
  // field, so its view is empty.
  struct Word {
    std::array<char, 16> chars{};
    size_t size = 0;
    bool overflow = false;
    std::string_view view() const { return overflow ? std::string_view() : std::string_view(chars.data(), size); }
  };
  struct Number {
    double value = 0;
    bool integral = true;
  };
  // Required members a reader validated, one bit each.
  enum : unsigned { kWidth = 1, kHeight = 2, kChannels = 4, kBackground = 8, kLeft = 16, kTop = 32, kR = 64, kG = 128, kB = 256 };

  [[noreturn]] static void fail(const char* message) { throw std::runtime_error(message); }
  [[noreturn]] static void syntax() { fail("Invalid image spec JSON"); }
  [[noreturn]] static void mistyped() { fail("Invalid image spec field type"); }

  char peek() const { return pos_ < text_.size() ? text_[pos_] : '\0'; }
  static bool digit(char c) { return c >= '0' && c <= '9'; }
  void space() {
    while (pos_ < text_.size() && (text_[pos_] == ' ' || text_[pos_] == '\t' || text_[pos_] == '\n' || text_[pos_] == '\r')) {
      ++pos_;
    }
  }
  void expect(char c) {
    space();
    if (peek() != c) syntax();
    ++pos_;
  }
  void literal(std::string_view word) {
    if (text_.substr(pos_, word.size()) != word) syntax();
    pos_ += word.size();
  }

  // Reads an object, calling member(key) with the position at each value.
  // member must read or skip the value.
  template <class Member>
  void members(Member&& member) {
    expect('{');
    space();
    if (peek() == '}') {
      ++pos_;
      return;
    }
    for (;;) {
      space();
      if (peek() != '"') syntax();
      const Word key = string();
      expect(':');
      space();
      member(key.view());
      space();
      if (peek() == ',') {
        ++pos_;
        continue;
      }
      if (peek() != '}') syntax();
      ++pos_;
      return;
    }
  }

  static void put(Word& word, char c) {
    if (word.size < word.chars.size()) {
      word.chars[word.size++] = c;
    } else {
      word.overflow = true;
    }
  }
  static void putCodePoint(Word& word, unsigned code) {
    if (code < 0x80) {
      put(word, char(code));
    } else if (code < 0x800) {
      put(word, char(0xC0 | (code >> 6)));
      put(word, char(0x80 | (code & 0x3F)));
    } else if (code < 0x10000) {
      put(word, char(0xE0 | (code >> 12)));
      put(word, char(0x80 | ((code >> 6) & 0x3F)));
      put(word, char(0x80 | (code & 0x3F)));
    } else {
      put(word, char(0xF0 | (code >> 18)));
      put(word, char(0x80 | ((code >> 12) & 0x3F)));
      put(word, char(0x80 | ((code >> 6) & 0x3F)));
      put(word, char(0x80 | (code & 0x3F)));
    }
  }
  unsigned hex4() {
    if (pos_ + 4 > text_.size()) syntax();
    unsigned code = 0;
    for (int i = 0; i < 4; ++i) {
      const char c = text_[pos_++];
      code <<= 4;
      if (digit(c)) {
        code |= unsigned(c - '0');
      } else if (c >= 'a' && c <= 'f') {
        code |= unsigned(c - 'a' + 10);
      } else if (c >= 'A' && c <= 'F') {
        code |= unsigned(c - 'A' + 10);
      } else {
        syntax();
      }
    }
    return code;
  }
  // Reads a string at its opening quote.
  Word string() {
    Word word;
    ++pos_;
    for (;;) {
      if (pos_ >= text_.size()) syntax();
      const auto c = static_cast<unsigned char>(text_[pos_++]);
      if (c == '"') return word;
      if (c < 0x20) syntax();
      if (c != '\\') {
        put(word, char(c));
        continue;
      }
      if (pos_ >= text_.size()) syntax();
      switch (text_[pos_++]) {
        case '"': put(word, '"'); break;
        case '\\': put(word, '\\'); break;
        case '/': put(word, '/'); break;
        case 'b': put(word, '\b'); break;
        case 'f': put(word, '\f'); break;
        case 'n': put(word, '\n'); break;
        case 'r': put(word, '\r'); break;
        case 't': put(word, '\t'); break;
        case 'u': {
          unsigned code = hex4();
          if (code >= 0xD800 && code <= 0xDBFF) {
            if (text_.substr(pos_, 2) != "\\u") syntax();
            pos_ += 2;
            const unsigned low = hex4();
            if (low < 0xDC00 || low > 0xDFFF) syntax();
            code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
          } else if (code >= 0xDC00 && code <= 0xDFFF) {
            syntax();
          }
          putCodePoint(word, code);
          break;
        }
        default: syntax();
      }
    }
  }
  // Reads a number. Out of range for a double, it is infinite, which no
  // field accepts.
  Number number() {
    const size_t start = pos_;
    Number out;
    if (peek() == '-') ++pos_;
    if (peek() == '0') {
      ++pos_;
    } else if (digit(peek())) {
      while (digit(peek())) ++pos_;
    } else {
      syntax();
    }
    if (peek() == '.') {
      out.integral = false;
      ++pos_;
      if (!digit(peek())) syntax();
      while (digit(peek())) ++pos_;
    }
    if (peek() == 'e' || peek() == 'E') {
      out.integral = false;
      ++pos_;
      if (peek() == '+' || peek() == '-') ++pos_;
      if (!digit(peek())) syntax();
      while (digit(peek())) ++pos_;
    }
    const char* first = text_.data() + start;
    const auto [end, error] = std::from_chars(first, text_.data() + pos_, out.value);
    if (error == std::errc::result_out_of_range) {
      out.value = *first == '-' ? -HUGE_VAL : HUGE_VAL;
    } else if (error != std::errc() || end != text_.data() + pos_) {
      syntax();
    }
    return out;
  }

  // Skips a value the adapter does not read.
  void skip(size_t depth) {
    if (depth > kMaxImageSpecDepth) fail("Image spec nests too deeply");
    switch (peek()) {
      case '{':
        members([&](std::string_view) { skip(depth + 1); });
        return;
      case '[':
        ++pos_;
        space();
        if (peek() == ']') {
          ++pos_;
          return;
        }
        for (;;) {
          space();
          skip(depth + 1);
          space();
          if (peek() == ',') {
            ++pos_;
            continue;
          }
          if (peek() != ']') syntax();
          ++pos_;
          return;
        }
      case '"': string(); return;
      case 't': literal("true"); return;
      case 'f': literal("false"); return;
      case 'n': literal("null"); return;
      default: number(); return;
    }
  }

  // Readers of the values the adapter uses. Each rejects null and every
  // other type but its own.
  bool boolean() {
    if (peek() == 't') {
      literal("true");
      return true;
    }
    if (peek() == 'f') {
      literal("false");
      return false;
    }
    mistyped();
  }
  Number numeric() {
    if (peek() != '-' && !digit(peek())) mistyped();
    return number();
  }
  int dimension() {
    const Number n = numeric();
    if (!n.integral || !(n.value >= 1 && n.value <= 65535)) fail("Invalid image dimension");
    return static_cast<int>(n.value);
  }
  void object() {
    if (peek() != '{') mistyped();
  }

  // raw, create (with `background`) and resize (without `channels`).
  ImageSpec::Size size(bool channels, bool background) {
    object();
    ImageSpec::Size out;
    unsigned valid = 0;
    members([&](std::string_view key) {
      if (key == "width") {
        out.width = dimension();
        valid |= kWidth;
      } else if (key == "height") {
        out.height = dimension();
        valid |= kHeight;
      } else if (channels && key == "channels") {
        out.channels = dimension();
        valid |= kChannels;
      } else if (background && key == "background") {
        spec_.background = colour();
        valid |= kBackground;
      } else {
        skip(2);
      }
    });
    const unsigned dims = kWidth | kHeight | (channels ? unsigned(kChannels) : 0u);
    if ((valid & dims) != dims) fail("Invalid image dimension");
    if (background && !(valid & kBackground)) fail("Image creation needs a background colour");
    return out;
  }
  ImageSpec::Color colour() {
    object();
    ImageSpec::Color out;
    unsigned valid = 0;
    members([&](std::string_view key) {
      if (key == "r") {
        out.r = numeric().value;
        valid |= kR;
      } else if (key == "g") {
        out.g = numeric().value;
        valid |= kG;
      } else if (key == "b") {
        out.b = numeric().value;
        valid |= kB;
      } else if (key == "alpha") {
        out.alpha = numeric().value;
      } else {
        skip(3);
      }
    });
    if ((valid & (kR | kG | kB)) != (kR | kG | kB)) fail("Image creation needs a background colour");
    if (!std::isfinite(out.r) || !std::isfinite(out.g) || !std::isfinite(out.b) || !std::isfinite(out.alpha)) {
      fail("Invalid background colour");
    }
    return out;
  }
  ImageSpec::Rect rect() {
    object();
    ImageSpec::Rect out;
    unsigned valid = 0;
    auto offset = [&] {
      // Any number, truncated, as the base read it with get<int>().
      const double value = numeric().value;
      if (!(value > -65536 && value < 65536)) fail("Invalid extract area");
      return static_cast<int>(value);
    };
    members([&](std::string_view key) {
      if (key == "left") {
        out.left = offset();
        valid |= kLeft;
      } else if (key == "top") {
        out.top = offset();
        valid |= kTop;
      } else if (key == "width") {
        out.width = dimension();
        valid |= kWidth;
      } else if (key == "height") {
        out.height = dimension();
        valid |= kHeight;
      } else {
        skip(2);
      }
    });
    const unsigned all = kLeft | kTop | kWidth | kHeight;
    if ((valid & all) != all) fail("Invalid image dimension");
    return out;
  }
  void webp() {
    object();
    members([&](std::string_view key) {
      if (key == "lossless") {
        spec_.webpLossless = boolean();
      } else if (key == "quality") {
        const double value = numeric().value;
        if (!(value >= 1 && value < 101)) fail("Invalid WebP quality");
        spec_.webpQuality = static_cast<int>(value);
      } else {
        // The base rejected other WebP options when it wrote WebP.
        webpExtra_ = true;
        skip(2);
      }
    });
  }
  void format() {
    if (peek() != '"') mistyped();
    const Word word = string();
    const std::string_view name = word.view();
    if (name == "png") {
      spec_.format = ImageSpec::Format::Png;
    } else if (name == "webp") {
      spec_.format = ImageSpec::Format::Webp;
    } else if (name == "raw") {
      spec_.format = ImageSpec::Format::Raw;
    } else {
      fail("Unsupported image output format");
    }
  }
  void root() {
    members([&](std::string_view key) {
      if (key == "raw") {
        spec_.raw = size(true, false);
      } else if (key == "create") {
        spec_.create = size(true, true);
      } else if (key == "resize") {
        spec_.resize = size(false, false);
      } else if (key == "extract") {
        spec_.extract = rect();
      } else if (key == "webp") {
        webp();
      } else if (key == "greyscale") {
        spec_.greyscale = boolean();
      } else if (key == "removeAlpha") {
        spec_.removeAlpha = boolean();
      } else if (key == "ensureAlpha") {
        spec_.ensureAlpha = boolean();
      } else if (key == "format") {
        format();
      } else {
        skip(1);
      }
    });
    if (webpExtra_ && spec_.format == ImageSpec::Format::Webp) fail("Unsupported native WebP option");
  }

  std::string_view text_;
  size_t pos_ = 0;
  ImageSpec spec_;
  bool webpExtra_ = false;
};

}  // namespace

ImageSpec parseImageSpec(std::string_view text) {
  static_assert(kMaxImageSpecBytes == 4096, "the message below names the limit");
  if (text.size() > kMaxImageSpecBytes) throw std::runtime_error("Image spec exceeds 4096 bytes");
  return SpecParser(text).parse();
}

}  // namespace gr::host
