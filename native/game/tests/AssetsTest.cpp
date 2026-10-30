#include "assets/PreparedAssets.h"
#include <algorithm>
#include <bit>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
using namespace nodetool::game;
namespace {
void check(bool ok, const char *message) {
  if (!ok) {
    throw std::runtime_error(message);
  }
}
template <class Fn> void rejects(Fn fn) {
  bool failed = false;
  try {
    fn();
  } catch (const std::exception &) {
    failed = true;
  }
  check(failed, "expected asset rejection");
}
struct Directory {
  std::filesystem::path path =
      std::filesystem::temp_directory_path() /
      ("game-assets-" +
       std::to_string(
           std::chrono::steady_clock::now().time_since_epoch().count()));
  Directory() { std::filesystem::create_directory(path); }
  ~Directory() {
    std::error_code error;
    std::filesystem::remove_all(path, error);
  }
};
void write(const std::filesystem::path &path,
           const std::vector<std::uint8_t> &data) {
  std::ofstream out(path, std::ios::binary);
  out.write(reinterpret_cast<const char *>(data.data()), data.size());
}
AssetJson entry(const std::string &id, const std::string &path,
                const std::vector<std::uint8_t> &bytes,
                const std::string &kind = "model") {
  return {{"id", id},
          {"path", path},
          {"kind", kind},
          {"digest", assetDigest(bytes)},
          {"size", bytes.size()},
          {"dependencies", AssetJson::array()}};
}
AssetJson modelJson() {
  return {
      {"asset", {{"version", "2.0"}}},
      {"nodes", AssetJson::array({{{"mesh", 0}}})},
      {"meshes",
       AssetJson::array(
           {{{"primitives",
              AssetJson::array({{{"attributes", {{"POSITION", 0}}}}})}}})},
      {"buffers",
       AssetJson::array({{{"uri", "triangle.bin"}, {"byteLength", 36}}})},
      {"bufferViews", AssetJson::array({{{"buffer", 0}, {"byteLength", 36}}})},
      {"accessors", AssetJson::array({{{"bufferView", 0},
                                       {"componentType", 5126},
                                       {"count", 3},
                                       {"type", "VEC3"}}})}};
}
std::vector<std::uint8_t> encoded(const AssetJson &json) {
  auto text = json.dump();
  return {text.begin(), text.end()};
}
void putFloat(std::vector<std::uint8_t> &out, float value) {
  auto bits = std::bit_cast<std::uint32_t>(value);
  for (int i = 0; i < 4; ++i) {
    out.push_back(static_cast<std::uint8_t>(bits >> (i * 8)));
  }
}
} // namespace
int main(int argc, char **argv) {
  try {
    if (argc == 3) {
      std::ifstream documentFile(argv[1]);
      const auto document = AssetJson::parse(documentFile);
      PreparedAssets admitted(argv[2], document.at("assets"));
      AssetJson models = AssetJson::array();
      for (const auto &asset : document.at("assets")) {
        if (asset.at("kind") != "model") { continue; }
        const auto model = admitted.model(asset.at("id").get<std::string>());
        std::size_t primitives = 0, vertices = 0, indices = 0, blend = 0, normal = 0, emissive = 0;
        for (const auto &mesh : model->meshes) { for (const auto &primitive : mesh) { ++primitives; vertices += primitive.vertices.size(); indices += primitive.indices.size(); } }
        for (const auto &material : model->materials) {
          blend += material.alphaMode == "BLEND";
          normal += material.normalImage >= 0;
          emissive += std::any_of(material.emissive.begin(), material.emissive.end(), [](float value) { return value > 0; });
        }
        models.push_back({{"id", asset.at("id")}, {"primitives", primitives}, {"vertices", vertices}, {"indices", indices}, {"blendMaterials", blend}, {"normalMaterials", normal}, {"emissiveMaterials", emissive}});
      }
      check(!models.empty(), "Actual asset fixture contains no models");
      std::cout << models.dump() << '\n';
      return 0;
    }
    check(
        assetDigest({'a', 'b', 'c'}) ==
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        "SHA256 vector");
    Directory dir;
    std::vector<std::uint8_t> buffer;
    for (float value : std::array<float, 9>{0, 0, 0, 1, 0, 0, 0, 1, 0}) {
      putFloat(buffer, value);
    }
    write(dir.path / "triangle.bin", buffer);
    auto json = modelJson();
    auto source = encoded(json);
    write(dir.path / "triangle.gltf", source);
    auto modelEntry = entry("mesh", "triangle.gltf", source);
    modelEntry["dependencies"] = {"buffer"};
    auto manifest = AssetJson::array(
        {modelEntry, entry("buffer", "triangle.bin", buffer, "buffer")});
    PreparedAssets assets(dir.path, manifest);
    auto first = assets.model("mesh");
    check(first->meshes[0][0].vertices.size() == 3, "triangle vertices");
    check(first->meshes[0][0].indices.size() == 3, "triangle indices");
    check(assets.model("mesh") == first, "immutable model cache shared");
    auto pose = sampleModel(*first, 0, 10);
    check(pose.world[0] == identityMatrix(), "static pose");
    assets.clear();
    check(assets.model("mesh") != first,
          "unload removes cache while external reference valid");
    check(first->meshes.size() == 1, "external model alive");
    rejects([&] { assets.model("mesh", [] { return true; }); });
    auto materialBuffer = buffer;
    for (const float value : std::array<float, 15>{0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1}) { putFloat(materialBuffer, value); }
    const std::vector<std::uint8_t> imageBytes{137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31, 0, 3, 3, 2, 0, 239, 154, 75, 187, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130};
    materialBuffer.insert(materialBuffer.end(), imageBytes.begin(), imageBytes.end());
    write(dir.path / "material.bin", materialBuffer);
    write(dir.path / "pixel.png", imageBytes);
    auto textured = json;
    textured["buffers"][0] = {{"uri", "material.bin"}, {"byteLength", materialBuffer.size()}};
    textured["bufferViews"].push_back({{"buffer", 0}, {"byteOffset", 36}, {"byteLength", 36}});
    textured["bufferViews"].push_back({{"buffer", 0}, {"byteOffset", 72}, {"byteLength", 24}});
    textured["accessors"].push_back({{"bufferView", 1}, {"componentType", 5126}, {"count", 3}, {"type", "VEC3"}});
    textured["accessors"].push_back({{"bufferView", 2}, {"componentType", 5126}, {"count", 3}, {"type", "VEC2"}});
    auto &attributes = textured["meshes"][0]["primitives"][0]["attributes"];
    attributes["NORMAL"] = 1; attributes["TEXCOORD_0"] = 2;
    textured["meshes"][0]["primitives"][0]["material"] = 0;
    textured["images"] = AssetJson::array({{{"uri", "pixel.png"}, {"mimeType", "image/png"}}});
    textured["textures"] = AssetJson::array({{{"source", 0}, {"sampler", 0}}, {{"source", 0}, {"sampler", 1}}});
    textured["samplers"] = AssetJson::array({{{"wrapS", 10497}, {"wrapT", 10497}}, {{"wrapS", 33071}, {"wrapT", 33648}, {"magFilter", 9728}, {"minFilter", 9728}}});
    textured["materials"] = AssetJson::array({{{"pbrMetallicRoughness", {{"baseColorFactor", {.25, .75, .8, .16}}, {"metallicFactor", .3}, {"roughnessFactor", .05}, {"baseColorTexture", {{"index", 0}}}}}, {"normalTexture", {{"index", 1}, {"scale", .4}}}, {"emissiveFactor", {.1, .2, .3}}, {"alphaMode", "BLEND"}, {"doubleSided", true}}});
    const auto prepareMaterial = [&](const AssetJson &candidate) {
      const auto data = encoded(candidate);
      write(dir.path / "material.gltf", data);
      auto sourceEntry = entry("material", "material.gltf", data);
      sourceEntry["dependencies"] = {"material-buffer", "image"};
      PreparedAssets prepared(dir.path, AssetJson::array({sourceEntry, entry("material-buffer", "material.bin", materialBuffer, "buffer"), entry("image", "pixel.png", imageBytes, "image")}));
      return prepared.model("material");
    };
    const auto materialModel = prepareMaterial(textured);
    const auto &material = materialModel->materials.at(0);
    check(material.alphaMode == "BLEND" && material.doubleSided && std::abs(material.color[3] - .16F) < 1e-6F, "Optic glass alpha preserved");
    check(material.image == 0 && material.normalImage == 0 && std::abs(material.normalScale - .4F) < 1e-6F, "Base color and normal channels preserved");
    check(std::abs(material.emissive[1] - .2F) < 1e-6F && std::abs(material.metallic - .3F) < 1e-6F && std::abs(material.roughness - .05F) < 1e-6F, "Emissive and PBR factors preserved");
    check(material.baseColorSampler.wrapS == 10497 && material.baseColorSampler.minFilter == 9987 && material.normalSampler.wrapS == 33071 && material.normalSampler.wrapT == 33648 && material.normalSampler.magFilter == 9728, "One image retains distinct channel samplers");
    const auto &imageSource = materialModel->images.at(0).source;
    check(imageSource && imageSource->assetId == "image" && imageSource->offset == 0 && imageSource->length == imageBytes.size() && imageSource->digest == assetDigest(imageBytes), "External image source identifies the verified whole file");
    auto inferredMime = textured; inferredMime["images"][0].erase("mimeType");
    check(prepareMaterial(inferredMime)->images[0].mimeType == "image/png", "External PNG MIME inferred from signature");
    auto bufferedImage = textured;
    bufferedImage["bufferViews"].push_back({{"buffer", 0}, {"byteOffset", 96}, {"byteLength", imageBytes.size()}});
    bufferedImage["images"][0] = {{"bufferView", 3}, {"mimeType", "image/png"}};
    const auto bufferImageModel = prepareMaterial(bufferedImage);
    const auto &bufferImageSource = bufferImageModel->images[0].source;
    check(bufferImageSource && bufferImageSource->assetId == "material-buffer" && bufferImageSource->offset == 96 && bufferImageSource->length == imageBytes.size() && bufferImageSource->digest == assetDigest(imageBytes), "External buffer image source preserves exact encoded range");
    auto embeddedImage = bufferedImage; embeddedImage["buffers"][0].erase("uri");
    auto embeddedImageJson = embeddedImage.dump();
    while (embeddedImageJson.size() % 4 != 0) { embeddedImageJson += ' '; }
    std::vector<std::uint8_t> imageGlb;
    const auto imageWord = [&](std::uint32_t value) { for (int byte = 0; byte < 4; ++byte) { imageGlb.push_back(static_cast<std::uint8_t>(value >> (byte * 8))); } };
    imageWord(0x46546c67); imageWord(2); imageWord(static_cast<std::uint32_t>(28 + embeddedImageJson.size() + materialBuffer.size()));
    imageWord(static_cast<std::uint32_t>(embeddedImageJson.size())); imageWord(0x4e4f534a);
    imageGlb.insert(imageGlb.end(), embeddedImageJson.begin(), embeddedImageJson.end());
    imageWord(static_cast<std::uint32_t>(materialBuffer.size())); imageWord(0x004e4942);
    imageGlb.insert(imageGlb.end(), materialBuffer.begin(), materialBuffer.end());
    write(dir.path / "image.glb", imageGlb);
    PreparedAssets embeddedImageAssets(dir.path, AssetJson::array({entry("image-model", "image.glb", imageGlb)}));
    const auto embeddedImageModel = embeddedImageAssets.model("image-model");
    const auto &embeddedImageSource = embeddedImageModel->images[0].source;
    check(embeddedImageSource && embeddedImageSource->assetId == "image-model" && embeddedImageSource->offset == 28 + embeddedImageJson.size() + 96 && embeddedImageSource->length == imageBytes.size() && embeddedImageSource->digest == assetDigest(imageBytes), "Embedded GLB image source uses absolute BIN payload file offset");
    check(std::equal(imageBytes.begin(), imageBytes.end(), imageGlb.begin() + embeddedImageSource->offset), "Image source range matches original encoded bytes");
    auto masked = textured; masked["materials"][0]["alphaMode"] = "MASK"; masked["materials"][0]["alphaCutoff"] = .25;
    check(prepareMaterial(masked)->materials[0].alphaCutoff == .25F, "Mask alpha cutoff preserved");
    auto defaults = textured; defaults["materials"] = AssetJson::array({AssetJson::object()});
    const auto defaultMaterial = prepareMaterial(defaults)->materials[0];
    check(defaultMaterial.alphaMode == "OPAQUE" && defaultMaterial.alphaCutoff == .5F && defaultMaterial.normalImage == -1 && defaultMaterial.emissive == std::array<float, 3>{0, 0, 0}, "Material defaults preserved");
    for (const auto &field : {"alphaMode", "alphaCutoff", "emissiveFactor", "emissiveWidth", "imageMime", "normalTexture", "samplers", "samplerShape", "textureIndex", "uvSet", "missingUv", "tangent", "vertexColor", "mrTexture", "emissiveTexture", "occlusionTexture", "extensions"}) {
      auto invalid = textured;
      if (field == std::string("alphaMode")) { invalid["materials"][0]["alphaMode"] = "ADDITIVE"; }
      else if (field == std::string("alphaCutoff")) { invalid["materials"][0]["alphaCutoff"] = 2; }
      else if (field == std::string("emissiveFactor")) { invalid["materials"][0]["emissiveFactor"] = {0, -1, 0}; }
      else if (field == std::string("emissiveWidth")) { invalid["materials"][0]["emissiveFactor"] = {0, 0, 0, 1}; }
      else if (field == std::string("imageMime")) { invalid["images"][0]["mimeType"] = "image/jpeg"; }
      else if (field == std::string("normalTexture")) { invalid["materials"][0]["normalTexture"]["scale"] = 1001; }
      else if (field == std::string("samplers")) { invalid["samplers"][1]["wrapS"] = 10497.5; }
      else if (field == std::string("samplerShape")) { invalid["samplers"][1] = 0; }
      else if (field == std::string("textureIndex")) { invalid["materials"][0]["normalTexture"]["index"] = 0.5; }
      else if (field == std::string("uvSet")) { invalid["materials"][0]["normalTexture"]["texCoord"] = 1; }
      else if (field == std::string("missingUv")) { invalid["meshes"][0]["primitives"][0]["attributes"].erase("TEXCOORD_0"); }
      else if (field == std::string("tangent")) { invalid["meshes"][0]["primitives"][0]["attributes"]["TANGENT"] = 0; }
      else if (field == std::string("vertexColor")) { invalid["meshes"][0]["primitives"][0]["attributes"]["COLOR_0"] = 0; }
      else if (field == std::string("mrTexture")) { invalid["materials"][0]["pbrMetallicRoughness"]["metallicRoughnessTexture"] = {{"index", 0}}; }
      else if (field == std::string("extensions")) { invalid["materials"][0]["extensions"] = {{"KHR_materials_unlit", AssetJson::object()}}; }
      else { invalid["materials"][0][field] = {{"index", 0}}; }
      rejects([&] { prepareMaterial(invalid); });
    }
    auto badManifest = manifest;
    badManifest[0]["digest"] = std::string(64, '0');
    rejects([&] {
      PreparedAssets invalid(dir.path, badManifest);
      invalid.model("mesh");
    });
    badManifest = manifest;
    badManifest[0]["size"] = 1;
    rejects([&] {
      PreparedAssets invalid(dir.path, badManifest);
      invalid.model("mesh");
    });
    badManifest = manifest;
    badManifest[0]["path"] = "../triangle.gltf";
    rejects([&] {
      PreparedAssets invalid(dir.path, badManifest);
      invalid.model("mesh");
    });
    badManifest = manifest;
    badManifest[0]["dependencies"] = AssetJson::array();
    rejects([&] {
      PreparedAssets invalid(dir.path, badManifest);
      invalid.model("mesh");
    });
    auto attempt = [&](AssetJson candidate) {
      auto data = encoded(candidate);
      write(dir.path / "bad.gltf", data);
      auto e = entry("bad", "bad.gltf", data);
      e["dependencies"] = {"buffer"};
      PreparedAssets invalid(dir.path, AssetJson::array({e, manifest[1]}));
      invalid.model("bad");
    };
    auto bad = json;
    bad["extensionsRequired"] = {"KHR_draco_mesh_compression"};
    rejects([&] { attempt(bad); });
    bad = json;
    bad["buffers"][0]["uri"] = "https://example.com/a.bin";
    rejects([&] { attempt(bad); });
    bad = json;
    bad["buffers"][0]["uri"] = "../triangle.bin";
    rejects([&] { attempt(bad); });
    bad = json;
    bad["buffers"][0]["byteLength"] = 1;
    rejects([&] { attempt(bad); });
    bad = json;
    bad["accessors"][0]["count"] = 100000;
    rejects([&] { attempt(bad); });
    bad = json;
    bad["nodes"][0]["children"] = {0};
    rejects([&] { attempt(bad); });
    bad = json;
    bad["materials"] = AssetJson::array(
        {{{"pbrMetallicRoughness", {{"baseColorTexture", {{"index", 0}}}}}}});
    bad["textures"] = AssetJson::array({{{"source", 0}}});
    rejects([&] { attempt(bad); });
    AssetLimits tiny;
    tiny.maxVertices = 2;
    rejects([&] {
      PreparedAssets invalid(dir.path, manifest, tiny);
      invalid.model("mesh");
    });
    for (int i = 0; i < 100; ++i) {
      assets.clear();
      check(assets.model("mesh")->nodes.size() == 1, "reload model");
    }

    // GLB embeds buffers without permitting undeclared runtime URI fetches.
    auto glbJson = json;
    glbJson["buffers"][0].erase("uri");
    auto text = glbJson.dump();
    while (text.size() % 4) {
      text += ' ';
    }
    auto glb = std::vector<std::uint8_t>{};
    auto word = [&](std::uint32_t value) {
      for (int i = 0; i < 4; ++i) {
        glb.push_back(static_cast<std::uint8_t>(value >> (i * 8)));
      }
    };
    word(0x46546c67);
    word(2);
    word(static_cast<std::uint32_t>(12 + 8 + text.size() + 8 + buffer.size()));
    word(static_cast<std::uint32_t>(text.size()));
    word(0x4e4f534a);
    glb.insert(glb.end(), text.begin(), text.end());
    word(static_cast<std::uint32_t>(buffer.size()));
    word(0x004e4942);
    glb.insert(glb.end(), buffer.begin(), buffer.end());
    write(dir.path / "embedded.glb", glb);
    PreparedAssets embedded(
        dir.path, AssetJson::array({entry("embedded", "embedded.glb", glb)}));
    check(embedded.model("embedded")->meshes[0][0].vertices.size() == 3,
          "GLB embedded geometry");
    auto broken = glb;
    broken[8] = 0;
    write(dir.path / "broken.glb", broken);
    rejects([&] {
      PreparedAssets invalid(
          dir.path, AssetJson::array({entry("broken", "broken.glb", broken)}));
      invalid.model("broken");
    });

    // Parsed skeletal animation has no retained mixer state across a
    // restore/seek.
    auto skinned = json;
    auto skinBuffer = buffer;
    for (float value : std::array<float, 2>{0, 1}) {
      putFloat(skinBuffer, value);
    }
    for (float value : std::array<float, 6>{0, 0, 0, 2, 0, 0}) {
      putFloat(skinBuffer, value);
    }
    for (float value : identityMatrix()) {
      putFloat(skinBuffer, value);
    }
    write(dir.path / "skin.bin", skinBuffer);
    skinned["buffers"][0] = {{"uri", "skin.bin"},
                             {"byteLength", skinBuffer.size()}};
    skinned["bufferViews"].push_back(
        {{"buffer", 0}, {"byteOffset", 36}, {"byteLength", 8}});
    skinned["bufferViews"].push_back(
        {{"buffer", 0}, {"byteOffset", 44}, {"byteLength", 24}});
    skinned["bufferViews"].push_back(
        {{"buffer", 0}, {"byteOffset", 68}, {"byteLength", 64}});
    skinned["accessors"].push_back({{"bufferView", 1},
                                    {"componentType", 5126},
                                    {"count", 2},
                                    {"type", "SCALAR"}});
    skinned["accessors"].push_back({{"bufferView", 2},
                                    {"componentType", 5126},
                                    {"count", 2},
                                    {"type", "VEC3"}});
    skinned["accessors"].push_back({{"bufferView", 3},
                                    {"componentType", 5126},
                                    {"count", 1},
                                    {"type", "MAT4"}});
    skinned["nodes"] = AssetJson::array(
        {{{"mesh", 0}, {"skin", 0}, {"children", {1}}}, AssetJson::object()});
    skinned["skins"] =
        AssetJson::array({{{"joints", {1}}, {"inverseBindMatrices", 3}}});
    skinned["animations"] = AssetJson::array(
        {{{"samplers", AssetJson::array({{{"input", 1}, {"output", 2}}})},
          {"channels",
           AssetJson::array(
               {{{"sampler", 0},
                 {"target", {{"node", 1}, {"path", "translation"}}}}})}}});
    auto skinSource = encoded(skinned);
    write(dir.path / "skin.gltf", skinSource);
    auto skinEntry = entry("skin", "skin.gltf", skinSource);
    skinEntry["dependencies"] = {"skinBuffer"};
    PreparedAssets skinAssets(
        dir.path, AssetJson::array({skinEntry, entry("skinBuffer", "skin.bin",
                                                     skinBuffer, "buffer")}));
    auto skinModel = skinAssets.model("skin");
    check(sampleModel(*skinModel, 0, 0.5).joints[0][0][12] == 1,
          "parsed skin joint animation");
    check(sampleModel(*skinModel, 0, 0).joints[0][0][12] == 0,
          "parsed animation restore");
    // Animation sampling is pure and seeking back does not preserve hidden
    // mixer state.
    PreparedModel animated;
    animated.source = {{"nodes", AssetJson::array({AssetJson::object()})}};
    animated.nodes = {ModelNode{identityMatrix(), {}, -1, -1}};
    ModelAnimation clip;
    clip.duration = 1;
    AnimationChannel channel;
    channel.node = 0;
    channel.path = "translation";
    channel.interpolation = "LINEAR";
    channel.times = {0, 1};
    channel.values = {std::array<float, 4>{0, 0, 0, 0},
                      std::array<float, 4>{2, 0, 0, 0}};
    clip.channels.push_back(channel);
    animated.animations.push_back(clip);
    check(sampleModel(animated, 0, 0.5).world[0][12] == 1, "linear animation");
    check(sampleModel(animated, 0, 0).world[0][12] == 0, "animation rewind");
    check(sampleModel(animated, 0, 1.5).world[0][12] == 1, "animation loop");
    std::cout << "prepared asset tests passed\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
