#include "host/gpu_catalog.h"

#include <cmath>
#include <cstring>
#include <functional>
#include <limits>
#include <regex>
#include <stdexcept>

namespace gr::host::gpu {
namespace {

const double kNaN = std::numeric_limits<double>::quiet_NaN();

std::vector<uint8_t> fromHex(const std::string& hex) {
  std::vector<uint8_t> out(hex.size() / 2);
  for (size_t i = 0; i < out.size(); ++i) out[i] = uint8_t(std::stoi(hex.substr(i * 2, 2), nullptr, 16));
  return out;
}

Binding::Kind bindingKind(const std::string& kind) {
  if (kind == "uniform") return Binding::Kind::Uniform;
  if (kind == "texture") return Binding::Kind::Texture;
  if (kind == "storageTexture") return Binding::Kind::StorageTexture;
  if (kind == "sampler") return Binding::Kind::Sampler;
  if (kind == "externalTexture") return Binding::Kind::ExternalTexture;
  throw std::runtime_error("gpu catalog: unknown binding kind " + kind);
}

std::string trim(const std::string& s) {
  const char* space = " \t\n\v\f\r";
  size_t a = s.find_first_not_of(space);
  if (a == std::string::npos) return {};
  size_t b = s.find_last_not_of(space);
  return s.substr(a, b - a + 1);
}

// StringToNumber: decimal literals, Infinity, and 0x/0o/0b integers.
double stringToNumber(const std::string& raw) {
  const std::string s = trim(raw);
  if (s.empty()) return 0;
  if (s == "Infinity" || s == "+Infinity") return std::numeric_limits<double>::infinity();
  if (s == "-Infinity") return -std::numeric_limits<double>::infinity();
  static const std::regex decimal(R"([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)");
  if (std::regex_match(s, decimal)) return std::strtod(s.c_str(), nullptr);
  static const std::regex prefixed(R"(0([xX][0-9a-fA-F]+|[oO][0-7]+|[bB][01]+))");
  if (std::regex_match(s, prefixed)) {
    const int base = (s[1] == 'x' || s[1] == 'X') ? 16 : (s[1] == 'o' || s[1] == 'O') ? 8 : 2;
    double v = 0;
    for (size_t i = 2; i < s.size(); ++i) {
      const char c = s[i];
      const int digit = c <= '9' ? c - '0' : (c | 0x20) - 'a' + 10;
      v = v * base + digit;
    }
    return v;
  }
  return kNaN;
}

// ToNumber(ToPrimitive(array)): the array joined with ",".
double arrayToNumber(const Json& array) {
  if (array.empty()) return 0;
  if (array.size() > 1) return kNaN;
  const Json& only = array[0];
  if (only.is_null()) return 0;
  if (only.is_number()) return only.get<double>();
  if (only.is_string()) return stringToNumber(only.get<std::string>());
  if (only.is_array()) return arrayToNumber(only);
  return kNaN;  // "true", "false", "[object Object]"
}

void writeF32(std::vector<uint8_t>& out, uint32_t offset, double value) {
  const float f = static_cast<float>(value);
  std::memcpy(out.data() + offset, &f, 4);
}

// DataView.setInt32 / setUint32 take ToInt32 / ToUint32 of the value.
uint32_t toUint32(double value) {
  if (!std::isfinite(value)) return 0;
  double t = std::trunc(value);
  double m = std::fmod(t, 4294967296.0);
  if (m < 0) m += 4294967296.0;
  return uint32_t(m);
}

const Json* member(const Json& object, const std::string& name) {
  if (!object.is_object()) return nullptr;
  auto it = object.find(name);
  return it == object.end() ? nullptr : &*it;
}

// value[index] for a vector field.
const Json* element(const Json* value, size_t index, const std::string& field, Json& scratch) {
  if (!value || value->is_null()) {
    throw std::runtime_error("Cannot read properties of " + std::string(value ? "null" : "undefined") +
                             " (reading '0') in uniform field " + field);
  }
  if (value->is_array()) return index < value->size() ? &(*value)[index] : nullptr;
  if (value->is_object()) return member(*value, std::to_string(index));
  if (value->is_string()) {
    const std::string s = value->get<std::string>();
    if (index >= s.size()) return nullptr;
    scratch = std::string(1, s[index]);
    return &scratch;
  }
  return nullptr;  // a number or boolean has no indices
}

}  // namespace

const Module& Catalog::module(const std::string& key) const {
  auto it = modules.find(key);
  if (it == modules.end()) throw std::runtime_error("Shader module " + key + " is not in the GPU catalog");
  return it->second;
}

std::shared_ptr<const Catalog> parseCatalog(const std::string& json) {
  Json doc = Json::parse(json);
  if (doc.value("format", 0) != 1) throw std::runtime_error("gpu catalog: unsupported format");
  auto catalog = std::make_shared<Catalog>();
  catalog->hash = std::hash<std::string>{}(json);
  catalog->vertex = doc.at("vertex").get<std::string>();
  catalog->vertexEntryPoint = doc.at("vertexEntryPoint").get<std::string>();
  catalog->toStraight = doc.at("alphaConvert").at("toStraight").get<std::string>();
  catalog->toPremultiplied = doc.at("alphaConvert").at("toPremultiplied").get<std::string>();
  for (auto& [key, m] : doc.at("modules").items()) {
    Module module;
    module.key = key;
    module.kind = m.at("kind").get<std::string>();
    for (auto& [name, contract] : m.at("io").at("inputs").items()) {
      module.inputs[name] = {contract.value("alpha", "") == "straight", contract.value("optional", false)};
    }
    module.dimensions = m.at("io").at("output").value("dimensions", "");
    module.paramDefaults = m.value("paramDefaults", Json::object());
    if (module.kind == "recipe") {
      module.intermediates = m.at("intermediates");
      module.passes = m.at("passes");
    } else {
      module.wgsl = m.at("wgsl").get<std::string>();
      module.entryPoint = m.at("entryPoint").get<std::string>();
      for (size_t i = 0; i < 3; ++i) module.workgroupSize[i] = m.at("workgroupSize").at(i).get<uint32_t>();
      module.layout = m.at("layout");
      for (const auto& b : m.at("bindings")) {
        module.bindings.push_back({b.at("name").get<std::string>(), b.at("binding").get<uint32_t>(),
                                   bindingKind(b.at("kind").get<std::string>())});
      }
      module.samplers = m.value("samplers", Json::object());
      if (m.contains("uniform") && m["uniform"].is_object()) {
        module.hasUniform = true;
        module.uniformSize = m["uniform"].at("size").get<uint32_t>();
        for (const auto& f : m["uniform"].at("fields")) {
          module.fields.push_back({f.at("name").get<std::string>(), f.at("type").get<std::string>(),
                                   f.at("offset").get<uint32_t>(), f.value("index", -1)});
        }
        if (m.contains("packedDefaults") && m["packedDefaults"].is_string()) {
          module.packedDefaults = fromHex(m["packedDefaults"].get<std::string>());
        }
      }
    }
    catalog->modules.emplace(key, std::move(module));
  }
  return catalog;
}

double jsNumber(const Json* value) {
  if (!value) return kNaN;
  if (value->is_number()) return value->get<double>();
  if (value->is_boolean()) return value->get<bool>() ? 1 : 0;
  if (value->is_null()) return 0;
  if (value->is_string()) return stringToNumber(value->get<std::string>());
  if (value->is_array()) return arrayToNumber(*value);
  return kNaN;
}

std::vector<uint8_t> packUniform(const Module& module, const Json& params) {
  std::vector<uint8_t> out(module.uniformSize, 0);
  for (const auto& field : module.fields) {
    const Json* value = member(params, field.name);
    if (field.index >= 0) {
      value = value && value->is_array() && size_t(field.index) < value->size() ? &(*value)[field.index] : nullptr;
    }
    if (field.type == "f32") {
      writeF32(out, field.offset, jsNumber(value));
    } else if (field.type == "i32" || field.type == "u32") {
      const uint32_t v = toUint32(jsNumber(value));
      std::memcpy(out.data() + field.offset, &v, 4);
    } else {
      const size_t n = field.type == "vec2f" ? 2 : field.type == "vec3f" ? 3 : 4;
      Json scratch;
      for (size_t i = 0; i < n; ++i) {
        writeF32(out, field.offset + uint32_t(i * 4), jsNumber(element(value, i, field.name, scratch)));
      }
    }
  }
  return out;
}

Json resolvePassParams(const Json& passParams, const Json& recipeParams) {
  Json out = Json::object();
  for (auto& [name, value] : passParams.items()) {
    if (value.is_string()) {
      const std::string ref = value.get<std::string>();
      if (ref.rfind("$.", 0) == 0) {
        if (const Json* v = member(recipeParams, ref.substr(2))) out[name] = *v;
        continue;
      }
    }
    out[name] = value;
  }
  return out;
}

}  // namespace gr::host::gpu
