#include "run/GenerationWorkflow.h"
#include <QJsonArray>

namespace nodetool::node_editor {
namespace {
// GENERATORS in packages/presets/src/eject.ts.
QString generatorType(const QString &mode) {
  if (mode == "video") { return QStringLiteral("nodetool.video.TextToVideo"); }
  if (mode == "image_to_video") { return QStringLiteral("nodetool.video.ImageToVideo"); }
  if (mode == "reference_to_video") { return QStringLiteral("nodetool.video.ReferenceToVideo"); }
  if (mode == "image") { return QStringLiteral("nodetool.image.TextToImage"); }
  if (mode == "image_edit") { return QStringLiteral("nodetool.image.ImageToImage"); }
  if (mode == "video_edit") { return QStringLiteral("nodetool.video.VideoToVideo"); }
  return {};
}

QJsonObject node(const QString &id, const QString &type, const QJsonObject &data, int x, int y) {
  return {{"id", id}, {"type", type}, {"data", data}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", y}}}}}};
}

QJsonObject edge(const QString &source, const QString &target, const QString &targetHandle) {
  return {{"id", source + "-" + target}, {"source", source}, {"sourceHandle", "output"}, {"target", target}, {"targetHandle", targetHandle}};
}
}  // namespace

QString generationMode(const QString &capability) {
  // The capability-to-mode table in web/src/hooks/useGenerationActivityTracking.ts.
  if (capability == "text_to_image") { return QStringLiteral("image"); }
  if (capability == "image_to_image") { return QStringLiteral("image_edit"); }
  if (capability == "text_to_video") { return QStringLiteral("video"); }
  if (capability == "image_to_video") { return QStringLiteral("image_to_video"); }
  if (capability == "reference_to_video") { return QStringLiteral("reference_to_video"); }
  if (capability == "video_to_video") { return QStringLiteral("video_edit"); }
  return {};
}

QJsonObject recordedGenerationWorkflow(const RecordedGeneration &generation, const QString &name) {
  const auto mode = generationMode(generation.capability);
  if (mode.isEmpty() || generation.provider.isEmpty() || generation.model.isEmpty() || generation.prompt.isNull()) { return {}; }
  const bool imageMode = mode == "image" || mode == "image_edit";
  QJsonObject generator{{"model", QJsonObject{{"type", imageMode ? "image_model" : "video_model"},
                                              {"provider", generation.provider},
                                              {"id", generation.model},
                                              {"name", generation.model}}}};
  // renderedWorkflow spreads the recorded params over the compiled ones.
  for (auto it = generation.params.begin(); it != generation.params.end(); ++it) { generator.insert(it.key(), it.value()); }
  // The recorded render keeps neither the image nor the video input, so only
  // prompt, template, generator and output remain.
  const QJsonArray nodes{node("prompt", "nodetool.input.StringInput", {{"name", "prompt"}, {"value", generation.prompt}}, 80, 80),
                         node("template", "nodetool.text.Template", {{"string", "{{ prompt }}"}}, 380, 80),
                         node("generate", generatorType(mode), generator, 680, 80),
                         node("output", "nodetool.output.Output", {{"name", "result"}}, 980, 80)};
  const QJsonArray edges{edge("prompt", "template", "prompt"), edge("template", "generate", "prompt"), edge("generate", "output", "value")};
  return {{"name", name}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}};
}

}  // namespace nodetool::node_editor
