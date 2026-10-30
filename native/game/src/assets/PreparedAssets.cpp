#include "PreparedAssets.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <cstring>
#include <fstream>
#include <limits>
#include <set>
#include <stdexcept>
namespace nodetool::game {
namespace {
void require(bool condition, const std::string &message) {
  if (!condition) {
    throw std::runtime_error("Asset: " + message);
  }
}
void checkpoint(const std::function<bool()> &stop) {
  require(!stop || !stop(), "preparation cancelled");
}
constexpr std::array<std::uint32_t, 64> SHA_K = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};
std::uint32_t little32(const std::uint8_t *p) {
  return std::uint32_t(p[0]) | (std::uint32_t(p[1]) << 8) |
         (std::uint32_t(p[2]) << 16) | (std::uint32_t(p[3]) << 24);
}
Matrix4 transform(const AssetJson &node) {
  if (node.contains("matrix")) {
    require(node["matrix"].size() == 16, "matrix must have 16 elements");
    return node["matrix"].get<Matrix4>();
  }
  auto t = node.value("translation", std::array<float, 3>{0, 0, 0});
  auto s = node.value("scale", std::array<float, 3>{1, 1, 1});
  auto q = node.value("rotation", std::array<float, 4>{0, 0, 0, 1});
  const auto [x, y, z, w] = q;
  float n = x * x + y * y + z * z + w * w;
  require(std::isfinite(n) && std::abs(n - 1) < 0.01f, "invalid rotation");
  return {(1 - 2 * y * y - 2 * z * z) * s[0],
          (2 * x * y + 2 * w * z) * s[0],
          (2 * x * z - 2 * w * y) * s[0],
          0,
          (2 * x * y - 2 * w * z) * s[1],
          (1 - 2 * x * x - 2 * z * z) * s[1],
          (2 * y * z + 2 * w * x) * s[1],
          0,
          (2 * x * z + 2 * w * y) * s[2],
          (2 * y * z - 2 * w * x) * s[2],
          (1 - 2 * x * x - 2 * y * y) * s[2],
          0,
          t[0],
          t[1],
          t[2],
          1};
}
} // namespace
std::string assetDigest(const std::vector<std::uint8_t> &bytes) {
  std::array<std::uint32_t, 8> h = {0x6a09e667, 0xbb67ae85, 0x3c6ef372,
                                    0xa54ff53a, 0x510e527f, 0x9b05688c,
                                    0x1f83d9ab, 0x5be0cd19};
  auto padded = bytes;
  padded.push_back(0x80);
  while (padded.size() % 64 != 56) {
    padded.push_back(0);
  }
  auto bits = std::uint64_t(bytes.size()) * 8;
  for (int i = 7; i >= 0; --i) {
    padded.push_back(static_cast<std::uint8_t>(bits >> (i * 8)));
  }
  for (std::size_t base = 0; base < padded.size(); base += 64) {
    std::array<std::uint32_t, 64> words{};
    for (int i = 0; i < 16; ++i) {
      for (int b = 0; b < 4; ++b) {
        words[i] = (words[i] << 8) | padded[base + i * 4 + b];
      }
    }
    for (int i = 16; i < 64; ++i) {
      auto a = words[i - 15], b = words[i - 2];
      words[i] =
          words[i - 16] + (std::rotr(a, 7) ^ std::rotr(a, 18) ^ (a >> 3)) +
          words[i - 7] + (std::rotr(b, 17) ^ std::rotr(b, 19) ^ (b >> 10));
    }
    auto [a, b, c, d, e, f, g, hv] = h;
    for (int i = 0; i < 64; ++i) {
      auto t1 = hv + (std::rotr(e, 6) ^ std::rotr(e, 11) ^ std::rotr(e, 25)) +
                ((e & f) ^ (~e & g)) + SHA_K[i] + words[i];
      auto t2 = (std::rotr(a, 2) ^ std::rotr(a, 13) ^ std::rotr(a, 22)) +
                ((a & b) ^ (a & c) ^ (b & c));
      hv = g;
      g = f;
      f = e;
      e = d + t1;
      d = c;
      c = b;
      b = a;
      a = t1 + t2;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hv;
  }
  std::string out;
  constexpr char hex[] = "0123456789abcdef";
  for (auto value : h) {
    for (int shift = 28; shift >= 0; shift -= 4) {
      out += hex[(value >> shift) & 15];
    }
  }
  return out;
}
Matrix4 identityMatrix() {
  return {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
}
Matrix4 multiplyMatrix(const Matrix4 &a, const Matrix4 &b) {
  Matrix4 out{};
  for (int col = 0; col < 4; ++col) {
    for (int row = 0; row < 4; ++row) {
      for (int k = 0; k < 4; ++k) {
        out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
      }
    }
  }
  return out;
}
PreparedAssets::PreparedAssets(std::filesystem::path root, AssetJson manifest,
                               AssetLimits limits)
    : root_(std::filesystem::canonical(root)), manifest_(std::move(manifest)),
      limits_(limits) {
  require(manifest_.is_array() && manifest_.size() <= 10000,
          "invalid manifest");
  for (const auto &entry : manifest_) {
    auto id = entry.at("id").get<std::string>();
    require(!entries_.contains(id), "duplicate asset ID");
    entries_.emplace(id, entry);
  }
  for (const auto &[id, entry] : entries_) {
    for (const auto &dep : entry.value("dependencies", AssetJson::array())) {
      require(dep.is_string() && entries_.contains(dep.get<std::string>()),
              "missing manifest dependency for " + id);
    }
  }
}
std::shared_ptr<const std::vector<std::uint8_t>>
PreparedAssets::bytes(const std::string &id,
                      const std::function<bool()> &stop) {
  checkpoint(stop);
  if (auto found = bytes_.find(id); found != bytes_.end()) {
    return found->second;
  }
  require(entries_.contains(id), "missing asset " + id);
  const auto &entry = entries_.at(id);
  auto relative = std::filesystem::path(entry.at("path").get<std::string>());
  require(!relative.is_absolute() && !relative.empty(),
          "absolute/empty asset path");
  for (const auto &part : relative) {
    require(part != ".." && part != ".", "path traversal");
  }
  auto path = std::filesystem::canonical(root_ / relative);
  auto within = path.lexically_relative(root_);
  require(!within.empty() && *within.begin() != "..",
          "asset symlink escapes root");
  auto size = std::filesystem::file_size(path);
  require(size <= limits_.maxBytes &&
              size == entry.at("size").get<std::uint64_t>(),
          "asset size mismatch or limit");
  require(size <= limits_.maxTotalBytes - loadedBytes_,
          "total asset byte limit");
  auto result = std::make_shared<std::vector<std::uint8_t>>(size);
  std::ifstream stream(path, std::ios::binary);
  require(bool(stream), "cannot open asset");
  for (std::size_t offset = 0; offset < size;) {
    checkpoint(stop);
    auto count = std::min<std::size_t>(65536, size - offset);
    stream.read(reinterpret_cast<char *>(result->data() + offset),
                static_cast<std::streamsize>(count));
    require(static_cast<std::size_t>(stream.gcount()) == count,
            "truncated asset");
    offset += count;
  }
  require(assetDigest(*result) == entry.at("digest").get<std::string>(),
          "digest mismatch");
  checkpoint(stop);
  loadedBytes_ += size;
  bytes_[id] = result;
  return result;
}
void PreparedAssets::clear() {
  models_.clear();
  bytes_.clear();
  loadedBytes_ = 0;
}
std::shared_ptr<const PreparedModel>
PreparedAssets::model(const std::string &id,
                      const std::function<bool()> &stop) {
  checkpoint(stop);
  if (auto found = models_.find(id); found != models_.end()) {
    return found->second;
  }
  auto result = prepare(id, stop);
  checkpoint(stop);
  models_[id] = result;
  return result;
}
std::shared_ptr<const PreparedModel>
PreparedAssets::prepare(const std::string &id,
                        const std::function<bool()> &stop) {
  require(entries_.contains(id) && entries_.at(id).at("kind") == "model",
          "asset is not a model");
  const auto &entry = entries_.at(id);
  auto source = bytes(id, stop);
  AssetJson gltf;
  std::vector<std::uint8_t> embedded;
  std::size_t embeddedOffset = 0;
  if (source->size() >= 12 && little32(source->data()) == 0x46546c67) {
    require(little32(source->data() + 4) == 2 &&
                little32(source->data() + 8) == source->size(),
            "invalid GLB header");
    std::size_t offset = 12;
    bool jsonSeen = false;
    while (offset < source->size()) {
      require(source->size() - offset >= 8, "truncated GLB chunk");
      auto length = little32(source->data() + offset),
           type = little32(source->data() + offset + 4);
      offset += 8;
      require(length <= source->size() - offset, "invalid GLB chunk length");
      if (type == 0x4e4f534a) {
        require(!jsonSeen, "duplicate GLB JSON");
        gltf = AssetJson::parse(source->begin() + offset,
                                source->begin() + offset + length,
                                [](int depth, auto, const auto &) {
                                  require(depth <= 64, "JSON nesting limit");
                                  return true;
                                });
        jsonSeen = true;
      } else if (type == 0x004e4942) {
        require(embedded.empty(), "duplicate GLB BIN");
        embeddedOffset = offset;
        embedded.assign(source->begin() + offset,
                        source->begin() + offset + length);
      } else {
        throw std::runtime_error("Asset: unsupported GLB chunk");
      }
      offset += length;
    }
    require(jsonSeen, "missing GLB JSON");
  } else {
    gltf = AssetJson::parse(*source, [](int depth, auto, const auto &) {
      require(depth <= 64, "JSON nesting limit");
      return true;
    });
  }
  require(gltf.is_object() && gltf.at("asset").at("version") == "2.0",
          "unsupported glTF version");
  require(gltf.value("extensionsRequired", AssetJson::array()).empty(),
          "unsupported required glTF extension");
  for (const auto *field :
       {"buffers", "bufferViews", "accessors", "images", "textures",
        "materials", "meshes", "nodes", "skins", "animations", "samplers"}) {
    require(!gltf.contains(field) ||
                (gltf[field].is_array() && gltf[field].size() <= 10000),
            "model structure budget");
  }
  const auto settings = entry.value("importSettings", AssetJson::object());
  auto maxVertices = std::min(
      limits_.maxVertices, settings.value("maxVertices", limits_.maxVertices));
  auto maxIndices = std::min(limits_.maxIndices,
                             settings.value("maxIndices", limits_.maxIndices));
  auto maxNodes =
      std::min(limits_.maxNodes, settings.value("maxNodes", limits_.maxNodes));
  auto dependencyId = [&](const std::string &uri) {
    require(!uri.empty() && uri.find(':') == std::string::npos &&
                uri.find('\\') == std::string::npos &&
                uri.find('%') == std::string::npos,
            "external or encoded asset URI");
    auto relative = std::filesystem::path(uri);
    require(!relative.is_absolute(), "absolute dependency URI");
    for (const auto &part : relative) {
      require(part != ".." && part != ".", "dependency traversal");
    }
    auto target = (std::filesystem::path(entry.at("path").get<std::string>())
                       .parent_path() /
                   relative)
                      .generic_string();
    for (const auto &dep : entry.value("dependencies", AssetJson::array())) {
      auto key = dep.get<std::string>();
      if (entries_.at(key).at("path") == target) {
        return key;
      }
    }
    throw std::runtime_error("Asset: undeclared dependency " + uri);
  };
  std::vector<std::shared_ptr<const std::vector<std::uint8_t>>> buffers;
  std::vector<std::size_t> bufferLengths;
  std::vector<std::pair<std::string, std::size_t>> bufferSources;
  for (const auto &buffer : gltf.value("buffers", AssetJson::array())) {
    checkpoint(stop);
    const auto sourceId = buffer.contains("uri") ? dependencyId(buffer.at("uri").get<std::string>()) : id;
    auto data = buffer.contains("uri") ? bytes(sourceId, stop) : std::make_shared<const std::vector<std::uint8_t>>(embedded);
    require(buffer.at("byteLength").get<std::size_t>() <= data->size(),
            "short glTF buffer");
    buffers.push_back(data);
    bufferSources.emplace_back(sourceId, buffer.contains("uri") ? 0 : embeddedOffset);
    bufferLengths.push_back(buffer.at("byteLength").get<std::size_t>());
  }
  auto view = [&](std::size_t index) {
    const auto &views = gltf.at("bufferViews");
    require(index < views.size(), "bufferView out of range");
    const auto &v = views[index];
    auto buffer = v.at("buffer").get<std::size_t>();
    require(buffer < buffers.size(), "buffer out of range");
    auto offset = v.value("byteOffset", std::size_t(0)),
         length = v.at("byteLength").get<std::size_t>();
    require(offset <= bufferLengths[buffer] &&
                length <= bufferLengths[buffer] - offset,
            "bufferView exceeds buffer");
    return std::tuple{buffers[buffer], offset, length,
                      v.value("byteStride", std::size_t(0))};
  };
  auto read = [&](std::size_t index, std::size_t expectedWidth) {
    const auto &accessors = gltf.at("accessors");
    require(index < accessors.size(), "accessor out of range");
    const auto &accessor = accessors[index];
    require(!accessor.contains("sparse"), "sparse accessor unsupported");
    auto type = accessor.at("type").get<std::string>();
    std::size_t width = type == "SCALAR" ? 1
                        : type == "VEC2" ? 2
                        : type == "VEC3" ? 3
                        : type == "VEC4" ? 4
                        : type == "MAT4" ? 16
                                         : 0;
    require(width == expectedWidth, "accessor shape mismatch");
    auto count = accessor.at("count").get<std::size_t>();
    require(count <= std::max({maxVertices, maxIndices, maxNodes * 16,
                               std::size_t(100000)}),
            "accessor count exceeds budget");
    auto component = accessor.at("componentType").get<int>();
    std::size_t size = component == 5121                          ? 1
                       : component == 5123                        ? 2
                       : (component == 5125 || component == 5126) ? 4
                                                                  : 0;
    require(size > 0, "unsupported accessor component type");
    auto [data, start, length, stride] =
        view(accessor.at("bufferView").get<std::size_t>());
    if (stride == 0) {
      stride = width * size;
    }
    require(stride >= width * size && stride <= 252, "invalid accessor stride");
    auto offset = accessor.value("byteOffset", std::size_t(0));
    require(offset <= length &&
                (count == 0 ||
                 ((count - 1) <= ((length - offset) / stride) &&
                  width * size <= length - offset - (count - 1) * stride)),
            "accessor exceeds view");
    std::vector<float> values;
    values.reserve(count * width);
    for (std::size_t i = 0; i < count; ++i) {
      if (i % 1024 == 0) {
        checkpoint(stop);
      }
      for (std::size_t k = 0; k < width; ++k) {
        auto p = data->data() + start + offset + i * stride + k * size;
        float value = 0;
        if (component == 5126) {
          auto bits = little32(p);
          value = std::bit_cast<float>(bits);
        } else {
          std::uint32_t integer =
              size == 1   ? p[0]
              : size == 2 ? std::uint32_t(p[0]) | (std::uint32_t(p[1]) << 8)
                          : little32(p);
          value = static_cast<float>(integer);
          if (accessor.value("normalized", false)) {
            value /= component == 5121   ? 255.0f
                     : component == 5123 ? 65535.0f
                                         : 4294967295.0f;
          }
        }
        require(std::isfinite(value), "nonfinite accessor value");
        values.push_back(value);
      }
    }
    return values;
  };
  auto result = std::make_shared<PreparedModel>();
  result->source = gltf;
  std::size_t imageBytes = 0;
  for (const auto &image : gltf.value("images", AssetJson::array())) {
    checkpoint(stop);
    ModelImage prepared;
    prepared.mimeType = image.value("mimeType", std::string());
    if (image.contains("uri")) {
      const auto sourceId = dependencyId(image.at("uri").get<std::string>());
      prepared.bytes = *bytes(sourceId, stop);
      prepared.source = ModelImageSource{sourceId, 0, prepared.bytes.size(), entries_.at(sourceId).at("digest").get<std::string>()};
    } else {
      const auto viewIndex = image.at("bufferView").get<std::size_t>();
      auto [data, start, length, stride] =
          view(viewIndex);
      (void)stride;
      prepared.bytes.assign(data->begin() + start,
                            data->begin() + start + length);
      const auto bufferIndex = gltf.at("bufferViews").at(viewIndex).at("buffer").get<std::size_t>();
      const auto &[sourceId, sourceOffset] = bufferSources.at(bufferIndex);
      require(start <= std::numeric_limits<std::size_t>::max() - sourceOffset, "image source offset overflow");
      prepared.source = ModelImageSource{sourceId, sourceOffset + start, length, assetDigest(prepared.bytes)};
    }
    require(!prepared.bytes.empty(), "empty image");
    const bool png = prepared.bytes.size() >= 8 && std::equal(prepared.bytes.begin(), prepared.bytes.begin() + 8, std::array<std::uint8_t, 8>{137, 80, 78, 71, 13, 10, 26, 10}.begin());
    const bool jpeg = prepared.bytes.size() >= 3 && prepared.bytes[0] == 0xff && prepared.bytes[1] == 0xd8 && prepared.bytes[2] == 0xff;
    if (prepared.mimeType.empty()) { prepared.mimeType = png ? "image/png" : jpeg ? "image/jpeg" : ""; }
    require((prepared.mimeType == "image/png" && png) || (prepared.mimeType == "image/jpeg" && jpeg), "image MIME does not match PNG or JPEG signature");
    require(prepared.bytes.size() <= limits_.maxTotalBytes - imageBytes,
            "image byte budget");
    imageBytes += prepared.bytes.size();
    result->images.push_back(std::move(prepared));
  }
  auto texture = [&](const AssetJson &info, int &image, ModelSampler &sampler) {
    require(info.is_object(), "texture info must be an object");
    const auto integerIndex = [](const AssetJson &value) {
      require(value.is_number_integer() && value >= 0 && value <= 10000, "invalid texture or sampler index");
      return value.get<std::size_t>();
    };
    if (info.contains("texCoord")) { require(info.at("texCoord").is_number_integer() && info.at("texCoord") == 0, "only integer texture coordinate set zero supported"); }
    require(info.value("extensions", AssetJson::object()).empty(), "texture extensions unsupported");
    const auto index = integerIndex(info.at("index"));
    require(index < gltf.at("textures").size(), "texture index out of range");
    const auto &definition = gltf.at("textures").at(index);
    require(definition.is_object(), "texture definition must be an object");
    require(definition.value("extensions", AssetJson::object()).empty(), "texture extensions unsupported");
    image = static_cast<int>(integerIndex(definition.at("source")));
    require(image >= 0 && std::size_t(image) < result->images.size(), "texture image missing");
    if (definition.contains("sampler")) {
      const auto samplerIndex = integerIndex(definition.at("sampler"));
      require(samplerIndex < gltf.at("samplers").size(), "sampler index out of range");
      const auto &source = gltf.at("samplers").at(samplerIndex);
      require(source.is_object(), "sampler definition must be an object");
      const auto setting = [&](const char *name, int fallback) {
        if (!source.contains(name)) { return fallback; }
        const auto &value = source.at(name);
        require(value.is_number_integer() && value >= 0 && value <= 65535, "sampler settings must be bounded integers");
        return value.get<int>();
      };
      sampler.wrapS = setting("wrapS", sampler.wrapS);
      sampler.wrapT = setting("wrapT", sampler.wrapT);
      sampler.magFilter = setting("magFilter", sampler.magFilter);
      sampler.minFilter = setting("minFilter", sampler.minFilter);
    }
    const auto wrap = [](int value) { return value == 33071 || value == 33648 || value == 10497; };
    require(wrap(sampler.wrapS) && wrap(sampler.wrapT), "invalid sampler wrap mode");
    require(sampler.magFilter == 9728 || sampler.magFilter == 9729, "invalid magnification filter");
    require(sampler.minFilter == 9728 || sampler.minFilter == 9729 || (sampler.minFilter >= 9984 && sampler.minFilter <= 9987), "invalid minification filter");
  };
  for (const auto &material : gltf.value("materials", AssetJson::array())) {
    ModelMaterial prepared;
    prepared.alphaMode = material.value("alphaMode", prepared.alphaMode);
    require(prepared.alphaMode == "OPAQUE" || prepared.alphaMode == "MASK" || prepared.alphaMode == "BLEND", "invalid material alpha mode");
    prepared.alphaCutoff = material.value("alphaCutoff", prepared.alphaCutoff);
    require(std::isfinite(prepared.alphaCutoff) && prepared.alphaCutoff >= 0 && prepared.alphaCutoff <= 1, "invalid material alpha cutoff");
    if (material.contains("emissiveFactor")) { require(material.at("emissiveFactor").is_array() && material.at("emissiveFactor").size() == 3, "emissive factor must have three components"); }
    prepared.emissive = material.value("emissiveFactor", prepared.emissive);
    for (const auto value : prepared.emissive) { require(std::isfinite(value) && value >= 0 && value <= 1, "invalid material emissive factor"); }
    require(material.value("extensions", AssetJson::object()).empty(), "material extensions unsupported");
    require(!material.contains("emissiveTexture") && !material.contains("occlusionTexture"), "emissive and occlusion textures unsupported");
    const auto pbr =
        material.value("pbrMetallicRoughness", AssetJson::object());
    prepared.color = pbr.value("baseColorFactor", prepared.color);
    prepared.metallic = pbr.value("metallicFactor", 1.0f);
    prepared.roughness = pbr.value("roughnessFactor", 1.0f);
    prepared.doubleSided = material.value("doubleSided", false);
    require(!pbr.contains("metallicRoughnessTexture"), "metallic-roughness textures unsupported");
    if (pbr.contains("baseColorTexture")) {
      texture(pbr.at("baseColorTexture"), prepared.image, prepared.baseColorSampler);
    }
    if (material.contains("normalTexture")) {
      const auto &normal = material.at("normalTexture");
      texture(normal, prepared.normalImage, prepared.normalSampler);
      prepared.normalScale = normal.value("scale", prepared.normalScale);
      require(std::isfinite(prepared.normalScale) && std::abs(prepared.normalScale) <= 1000, "invalid normal texture scale");
    }
    for (float value : prepared.color) {
      require(std::isfinite(value) && value >= 0 && value <= 1,
              "invalid material color");
    }
    require(std::isfinite(prepared.metallic) && prepared.metallic >= 0 &&
                prepared.metallic <= 1 && std::isfinite(prepared.roughness) &&
                prepared.roughness >= 0 && prepared.roughness <= 1,
            "invalid material factors");
    result->materials.push_back(prepared);
  }
  std::size_t vertices = 0, indices = 0;
  for (const auto &mesh : gltf.value("meshes", AssetJson::array())) {
    std::vector<ModelPrimitive> primitives;
    for (const auto &primitive : mesh.at("primitives")) {
      checkpoint(stop);
      require(primitive.value("mode", 4) == 4, "only triangles supported");
      require(!primitive.contains("targets"), "morph targets unsupported");
      require(!primitive.at("attributes").contains("COLOR_0"),
              "vertex colors unsupported");
      ModelPrimitive prepared;
      auto positions = read(primitive.at("attributes").at("POSITION"), 3);
      require(gltf.at("accessors")
                      .at(primitive.at("attributes")
                              .at("POSITION")
                              .get<std::size_t>())
                      .at("componentType") == 5126,
              "positions must use float components");
      auto count = positions.size() / 3;
      require(count <= maxVertices - vertices, "vertex budget exceeded");
      vertices += count;
      prepared.vertices.resize(count);
      for (std::size_t i = 0; i < count; ++i) {
        std::copy_n(positions.begin() + i * 3, 3,
                    prepared.vertices[i].position.begin());
      }
      auto attribute = [&](const std::string &name, std::size_t width,
                           auto assign) {
        if (primitive.at("attributes").contains(name)) {
          auto values = read(primitive["attributes"][name], width);
          require(values.size() == count * width,
                  "attribute vertex count mismatch");
          for (std::size_t i = 0; i < count; ++i) {
            assign(prepared.vertices[i], values.data() + i * width);
          }
        }
      };
      attribute("NORMAL", 3, [](auto &v, const float *p) {
        std::copy_n(p, 3, v.normal.begin());
      });
      attribute("TEXCOORD_0", 2, [](auto &v, const float *p) {
        std::copy_n(p, 2, v.uv.begin());
      });
      attribute("WEIGHTS_0", 4, [](auto &v, const float *p) {
        std::copy_n(p, 4, v.weights.begin());
      });
      attribute("JOINTS_0", 4, [](auto &v, const float *p) {
        for (int k = 0; k < 4; ++k) {
          require(p[k] >= 0 && p[k] <= 65535 && std::floor(p[k]) == p[k],
                  "invalid joint index");
          v.joints[k] = static_cast<std::uint16_t>(p[k]);
        }
      });
      if (primitive.contains("indices")) {
        const auto &indexAccessor =
            gltf.at("accessors").at(primitive.at("indices").get<std::size_t>());
        auto indexType = indexAccessor.at("componentType").get<int>();
        require((indexType == 5121 || indexType == 5123 || indexType == 5125) &&
                    !indexAccessor.value("normalized", false),
                "indices require unsigned integer components");
        auto values = read(primitive.at("indices"), 1);
        require(values.size() <= maxIndices - indices, "index budget exceeded");
        for (float value : values) {
          require(value >= 0 && value < count && std::floor(value) == value,
                  "index out of range");
          prepared.indices.push_back(static_cast<std::uint32_t>(value));
        }
      } else {
        require(count <= maxIndices - indices, "index budget exceeded");
        for (std::size_t i = 0; i < count; ++i) {
          prepared.indices.push_back(static_cast<std::uint32_t>(i));
        }
      }
      require(prepared.indices.size() % 3 == 0, "triangle index count");
      indices += prepared.indices.size();
      prepared.material = primitive.value("material", -1);
      require(prepared.material < 0 ||
                  std::size_t(prepared.material) < result->materials.size(),
              "material missing");
      if (prepared.material >= 0 && result->materials.at(prepared.material).normalImage >= 0) {
        require(!primitive.at("attributes").contains("TANGENT"),
                "normal textures with explicit tangents unsupported");
        require(primitive.at("attributes").contains("NORMAL") && primitive.at("attributes").contains("TEXCOORD_0"), "normal textures require normals and texture coordinates");
      }
      primitives.push_back(std::move(prepared));
    }
    result->meshes.push_back(std::move(primitives));
  }
  auto nodes = gltf.value("nodes", AssetJson::array());
  require(nodes.size() <= maxNodes, "node budget exceeded");
  std::vector<int> parents(nodes.size(), -1);
  for (const auto &node : nodes) {
    ModelNode prepared;
    prepared.local = transform(node);
    for (float value : prepared.local) {
      require(std::isfinite(value), "nonfinite node transform");
    }
    prepared.mesh = node.value("mesh", -1);
    prepared.skin = node.value("skin", -1);
    require(prepared.mesh < 0 ||
                std::size_t(prepared.mesh) < result->meshes.size(),
            "mesh missing");
    prepared.children = node.value("children", std::vector<int>{});
    result->nodes.push_back(std::move(prepared));
  }
  for (std::size_t i = 0; i < result->nodes.size(); ++i) {
    for (int child : result->nodes[i].children) {
      require(child >= 0 && std::size_t(child) < nodes.size() &&
                  parents[child] < 0,
              "invalid or multiply parented node");
      parents[child] = static_cast<int>(i);
    }
  }
  std::vector<int> degree(nodes.size());
  std::vector<int> queue;
  for (std::size_t i = 0; i < nodes.size(); ++i) {
    if (parents[i] < 0) {
      queue.push_back(static_cast<int>(i));
    } else {
      degree[i] = 1;
    }
  }
  std::size_t visited = 0;
  for (std::size_t i = 0; i < queue.size(); ++i) {
    ++visited;
    for (int child : result->nodes[queue[i]].children) {
      if (--degree[child] == 0) {
        queue.push_back(child);
      }
    }
  }
  require(visited == nodes.size(), "cyclic model hierarchy");
  if (gltf.contains("scenes")) {
    auto si = gltf.value("scene", 0);
    require(si >= 0 && std::size_t(si) < gltf["scenes"].size(),
            "scene missing");
    result->roots = gltf["scenes"][si].value("nodes", std::vector<int>{});
  } else {
    for (std::size_t i = 0; i < parents.size(); ++i) {
      if (parents[i] < 0) {
        result->roots.push_back(static_cast<int>(i));
      }
    }
  }
  for (int root : result->roots) {
    require(root >= 0 && std::size_t(root) < nodes.size() && parents[root] < 0,
            "invalid scene root");
  }
  for (const auto &skin : gltf.value("skins", AssetJson::array())) {
    ModelSkin prepared;
    prepared.joints = skin.at("joints").get<std::vector<int>>();
    require(prepared.joints.size() <= 256, "joint budget exceeded");
    for (int joint : prepared.joints) {
      require(joint >= 0 && std::size_t(joint) < nodes.size(),
              "joint node missing");
    }
    prepared.inverseBind.assign(prepared.joints.size(), identityMatrix());
    if (skin.contains("inverseBindMatrices")) {
      auto matrices = read(skin.at("inverseBindMatrices"), 16);
      require(matrices.size() == prepared.joints.size() * 16,
              "inverse bind count mismatch");
      for (std::size_t i = 0; i < prepared.joints.size(); ++i) {
        std::copy_n(matrices.begin() + i * 16, 16,
                    prepared.inverseBind[i].begin());
      }
    }
    result->skins.push_back(std::move(prepared));
  }
  for (const auto &node : result->nodes) {
    require(node.skin < 0 || std::size_t(node.skin) < result->skins.size(),
            "skin missing");
    if (node.skin >= 0 && node.mesh >= 0) {
      for (const auto &p : result->meshes[node.mesh]) {
        for (const auto &v : p.vertices) {
          for (int k = 0; k < 4; ++k) {
            require(v.weights[k] == 0 ||
                        v.joints[k] < result->skins[node.skin].joints.size(),
                    "vertex joint missing");
          }
        }
      }
    }
  }
  std::size_t totalAnimationKeys = 0;
  for (const auto &animation : gltf.value("animations", AssetJson::array())) {
    require(animation.at("channels").size() <= 256 &&
                animation.at("samplers").size() <= 256,
            "animation channel budget");
    ModelAnimation prepared;
    prepared.name = animation.value("name", std::string());
    for (const auto &channel : animation.at("channels")) {
      checkpoint(stop);
      AnimationChannel output;
      output.node = channel.at("target").at("node");
      require(output.node >= 0 && std::size_t(output.node) < nodes.size(),
              "animation target missing");
      require(!nodes[output.node].contains("matrix"),
              "animation requires TRS node");
      output.path = channel["target"].at("path");
      require(output.path == "translation" || output.path == "rotation" ||
                  output.path == "scale",
              "unsupported animation path");
      auto sampler = channel.at("sampler").get<std::size_t>();
      require(sampler < animation.at("samplers").size(),
              "animation sampler missing");
      const auto &input = animation["samplers"][sampler];
      output.interpolation =
          input.value("interpolation", std::string("LINEAR"));
      require(output.interpolation == "LINEAR" ||
                  output.interpolation == "STEP",
              "unsupported animation interpolation");
      output.times = read(input.at("input"), 1);
      require(!output.times.empty() &&
                  output.times.size() <= 100000 - totalAnimationKeys,
              "invalid animation key count");
      totalAnimationKeys += output.times.size();
      for (std::size_t i = 0; i < output.times.size(); ++i) {
        require(output.times[i] >= 0 &&
                    (i == 0 || output.times[i] > output.times[i - 1]),
                "invalid animation key time");
      }
      auto width = output.path == "rotation" ? 4 : 3;
      auto values = read(input.at("output"), width);
      require(values.size() == output.times.size() * width,
              "animation value count mismatch");
      output.values.resize(output.times.size());
      for (std::size_t i = 0; i < output.values.size(); ++i) {
        std::copy_n(values.begin() + i * width, width,
                    output.values[i].begin());
      }
      prepared.duration = std::max(prepared.duration, output.times.back());
      prepared.channels.push_back(std::move(output));
    }
    result->animations.push_back(std::move(prepared));
  }
  return result;
}
ModelPose sampleModel(const PreparedModel &model, std::size_t animation,
                      double seconds, bool loop) {
  require(std::isfinite(seconds) && seconds >= 0, "invalid animation time");
  auto nodes = model.source.value("nodes", AssetJson::array());
  ModelPose pose;
  pose.world.resize(model.nodes.size(), identityMatrix());
  pose.joints.resize(model.skins.size());
  if (animation < model.animations.size()) {
    const auto &clip = model.animations[animation];
    float time = static_cast<float>(loop && clip.duration > 0
                                        ? std::fmod(seconds, clip.duration)
                                        : seconds);
    for (const auto &channel : clip.channels) {
      auto upper =
          std::upper_bound(channel.times.begin(), channel.times.end(), time);
      std::size_t left = upper == channel.times.begin()
                             ? 0
                             : std::size_t(upper - channel.times.begin() - 1),
                  right = std::min(left + 1, channel.times.size() - 1);
      float alpha =
          channel.interpolation == "STEP" || left == right
              ? 0
              : std::clamp((time - channel.times[left]) /
                               (channel.times[right] - channel.times[left]),
                           0.0f, 1.0f);
      auto a = channel.values[left], b = channel.values[right];
      if (channel.path == "rotation") {
        float dot = 0;
        for (int k = 0; k < 4; ++k) {
          dot += a[k] * b[k];
        }
        if (dot < 0) {
          for (float &value : b) {
            value = -value;
          }
          dot = -dot;
        }
        std::array<float, 4> q{};
        if (dot < 0.9995f) {
          float theta = std::acos(std::clamp(dot, -1.0f, 1.0f));
          float sa = std::sin((1 - alpha) * theta) / std::sin(theta),
                sb = std::sin(alpha * theta) / std::sin(theta);
          for (int k = 0; k < 4; ++k) {
            q[k] = sa * a[k] + sb * b[k];
          }
        } else {
          for (int k = 0; k < 4; ++k) {
            q[k] = a[k] + alpha * (b[k] - a[k]);
          }
        }
        float norm = 0;
        for (float value : q) {
          norm += value * value;
        }
        require(norm > 0, "zero animation quaternion");
        for (float &value : q) {
          value /= std::sqrt(norm);
        }
        nodes[channel.node]["rotation"] = q;
      } else {
        std::array<float, 3> v{};
        for (int k = 0; k < 3; ++k) {
          v[k] = a[k] + alpha * (b[k] - a[k]);
        }
        nodes[channel.node][channel.path] = v;
      }
    }
  }
  std::vector<std::pair<int, Matrix4>> queue;
  std::vector<bool> child(model.nodes.size());
  for (const auto &node : model.nodes) {
    for (int index : node.children) {
      child[index] = true;
    }
  }
  for (std::size_t i = 0; i < child.size(); ++i) {
    if (!child[i]) {
      queue.emplace_back(static_cast<int>(i), identityMatrix());
    }
  }
  for (std::size_t i = 0; i < queue.size(); ++i) {
    auto [index, parent] = queue[i];
    pose.world[index] = multiplyMatrix(parent, transform(nodes[index]));
    for (int next : model.nodes[index].children) {
      queue.emplace_back(next, pose.world[index]);
    }
  }
  for (std::size_t i = 0; i < model.skins.size(); ++i) {
    const auto &skin = model.skins[i];
    for (std::size_t j = 0; j < skin.joints.size(); ++j) {
      pose.joints[i].push_back(
          multiplyMatrix(pose.world[skin.joints[j]], skin.inverseBind[j]));
    }
  }
  return pose;
}
} // namespace nodetool::game
