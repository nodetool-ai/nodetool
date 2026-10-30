#pragma once
#include <array>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>
namespace nodetool::game {
using AssetJson = nlohmann::json;
using Matrix4 = std::array<float, 16>;
struct ModelVertex {
  std::array<float, 3> position{}, normal{};
  std::array<float, 2> uv{};
  std::array<std::uint16_t, 4> joints{};
  std::array<float, 4> weights{};
};
struct ModelSampler {
  int wrapS = 10497, wrapT = 10497, magFilter = 9729, minFilter = 9987;
};
struct ModelMaterial {
  std::array<float, 4> color{1, 1, 1, 1};
  std::array<float, 3> emissive{};
  float metallic = 1, roughness = 1;
  int image = -1, normalImage = -1;
  float normalScale = 1, alphaCutoff = .5F;
  std::string alphaMode = "OPAQUE";
  ModelSampler baseColorSampler, normalSampler;
  bool doubleSided = false;
};
struct ModelImageSource {
  std::string assetId;
  std::size_t offset = 0, length = 0;
  std::string digest;
};
struct ModelImage {
  std::vector<std::uint8_t> bytes;
  std::string mimeType;
  std::optional<ModelImageSource> source;
};
struct ModelPrimitive {
  std::vector<ModelVertex> vertices;
  std::vector<std::uint32_t> indices;
  int material = -1;
};
struct ModelNode {
  Matrix4 local;
  std::vector<int> children;
  int mesh = -1, skin = -1;
};
struct ModelSkin {
  std::vector<int> joints;
  std::vector<Matrix4> inverseBind;
};
struct AnimationChannel {
  int node = 0;
  std::string path, interpolation;
  std::vector<float> times;
  std::vector<std::array<float, 4>> values;
};
struct ModelAnimation {
  std::string name;
  float duration = 0;
  std::vector<AnimationChannel> channels;
};
struct PreparedModel {
  std::vector<std::vector<ModelPrimitive>> meshes;
  std::vector<ModelMaterial> materials;
  std::vector<ModelImage> images;
  std::vector<ModelNode> nodes;
  std::vector<int> roots;
  std::vector<ModelSkin> skins;
  std::vector<ModelAnimation> animations;
  AssetJson source;
};
struct ModelPose {
  std::vector<Matrix4> world;
  std::vector<std::vector<Matrix4>> joints;
};
struct AssetLimits {
  std::size_t maxBytes = 64 * 1024 * 1024, maxTotalBytes = 256 * 1024 * 1024,
              maxVertices = 100000, maxIndices = 300000, maxNodes = 1000;
};
std::string assetDigest(const std::vector<std::uint8_t> &bytes);
Matrix4 identityMatrix();
Matrix4 multiplyMatrix(const Matrix4 &a, const Matrix4 &b);
ModelPose sampleModel(const PreparedModel &model, std::size_t animation,
                      double seconds, bool loop = true);
class PreparedAssets {
public:
  explicit PreparedAssets(std::filesystem::path root, AssetJson manifest,
                          AssetLimits limits = {});
  std::shared_ptr<const PreparedModel>
  model(const std::string &id, const std::function<bool()> &cancelled = {});
  std::shared_ptr<const std::vector<std::uint8_t>>
  bytes(const std::string &id, const std::function<bool()> &cancelled = {});
  void clear();

private:
  std::filesystem::path root_;
  AssetJson manifest_;
  AssetLimits limits_;
  std::size_t loadedBytes_ = 0;
  std::map<std::string, AssetJson> entries_;
  std::map<std::string, std::shared_ptr<const std::vector<std::uint8_t>>>
      bytes_;
  std::map<std::string, std::shared_ptr<const PreparedModel>> models_;
  std::shared_ptr<const PreparedModel>
  prepare(const std::string &id, const std::function<bool()> &cancelled);
};
} // namespace nodetool::game
