#include "Model.h"
#include "assets/PreparedAssets.h"
namespace nodetool::game {
Json prepareBrowserModel(const Json &request) {
#ifndef __EMSCRIPTEN__
  (void)request;
  throw Error("unavailable_capability", "Model preparation requires the isolated browser filesystem");
#else
  PreparedAssets assets("/assets", request.at("manifest"), AssetLimits{8 * 1024 * 1024, 16 * 1024 * 1024, 50000, 150000, 1000});
  const auto model = assets.model(request.at("id").get<std::string>());
  Json meshes = Json::array(), materials = Json::array(), images = Json::array(), nodes = Json::array(), skins = Json::array(), animations = Json::array();
  for (const auto &mesh : model->meshes) {
    auto primitives = Json::array();
    for (const auto &primitive : mesh) {
      auto vertices = Json::array();
      for (const auto &vertex : primitive.vertices) {
        vertices.push_back({{"position", vertex.position}, {"normal", vertex.normal}, {"uv", vertex.uv}, {"joints", vertex.joints}, {"weights", vertex.weights}});
      }
      primitives.push_back({{"vertices", vertices}, {"indices", primitive.indices}, {"material", primitive.material}});
    }
    meshes.push_back(std::move(primitives));
  }
  const auto sampler = [](const ModelSampler &value) { return Json{{"wrapS", value.wrapS}, {"wrapT", value.wrapT}, {"magFilter", value.magFilter}, {"minFilter", value.minFilter}}; };
  for (const auto &material : model->materials) {
    materials.push_back({{"color", material.color}, {"metallic", material.metallic}, {"roughness", material.roughness}, {"image", material.image}, {"doubleSided", material.doubleSided},
      {"emissive", material.emissive}, {"normalImage", material.normalImage}, {"normalScale", material.normalScale}, {"alphaMode", material.alphaMode}, {"alphaCutoff", material.alphaCutoff},
      {"baseColorSampler", sampler(material.baseColorSampler)}, {"normalSampler", sampler(material.normalSampler)}});
  }
  for (const auto &image : model->images) {
    if (!image.source) { throw Error("validation_error", "Prepared image has no verified source"); }
    const auto &source = *image.source;
    images.push_back({{"mimeType", image.mimeType}, {"source", {{"assetId", source.assetId}, {"offset", source.offset}, {"length", source.length}, {"digest", source.digest}}}});
  }
  for (const auto &node : model->nodes) { nodes.push_back({{"local", node.local}, {"children", node.children}, {"mesh", node.mesh}, {"skin", node.skin}}); }
  for (const auto &skin : model->skins) { skins.push_back({{"joints", skin.joints}, {"inverseBind", skin.inverseBind}}); }
  for (const auto &animation : model->animations) {
    auto channels = Json::array();
    for (const auto &channel : animation.channels) { channels.push_back({{"node", channel.node}, {"path", channel.path}, {"interpolation", channel.interpolation}, {"times", channel.times}, {"values", channel.values}}); }
    animations.push_back({{"name", animation.name}, {"duration", animation.duration}, {"channels", channels}});
  }
  return {{"meshes", meshes}, {"materials", materials}, {"images", images}, {"nodes", nodes}, {"roots", model->roots}, {"skins", skins}, {"animations", animations}, {"source", model->source}};
#endif
}
}
