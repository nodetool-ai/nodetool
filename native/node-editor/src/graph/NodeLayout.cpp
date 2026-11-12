#include "NodeLayout.h"
#include <QFile>
#include <QHash>
#include <QSet>

namespace nodetool {
QColor typeColor(const QString &type) {
  static const QHash<QString, QString> colors{
      {"any", "#6880A0"}, {"none", "#6880A0"}, {"notype", "#A7B1BF"},
      {"str", "#FFA808"}, {"text", "#FFA808"}, {"message", "#FFA808"}, {"thread", "#FFA808"},
      {"bool", "#0DD49A"}, {"float", "#18E0F8"}, {"image_size", "#18E0F8"},
      {"datetime", "#18E0F8"}, {"date", "#18E0F8"}, {"int", "#0891B2"},
      {"image", "#E838FF"}, {"entity", "#E838FF"}, {"video_element", "#E838FF"},
      {"video", "#9460FF"}, {"timeline", "#9460FF"}, {"storyboard", "#9460FF"},
      {"keyframe", "#9460FF"}, {"shot", "#9460FF"}, {"audio", "#08B8FF"}, {"script", "#08B8FF"},
      {"sketch", "#B0F030"}, {"game_slot", "#B0F030"}, {"slot_fill", "#B0F030"},
      {"list", "#FFD612"}, {"dict", "#FFD612"}, {"enum", "#FFD612"}, {"chunk", "#FFD612"},
      {"dataframe", "#FFD612"}, {"collection", "#FFD612"}, {"object", "#FFD612"}, {"json", "#FFD612"},
      {"tensor", "#5B5EFF"}, {"torch_tensor", "#5B5EFF"}, {"np_array", "#5B5EFF"},
      {"task", "#FF3060"}, {"cv", "#FF3060"}};
  if (const auto found = colors.constFind(type); found != colors.cend()) { return QColor(*found); }
  // The web colors its remaining file-like and model reference types blue.
  return QColor(type.isEmpty() ? QStringLiteral("#6880A0") : QStringLiteral("#3888FF"));
}

QString typeIcon(const QString &type) {
  static const QHash<QString, QString> icons{
      {"str", "quote"}, {"text", "quote"}, {"message", "quote"}, {"image", "image"},
      {"video", "movie"}, {"audio", "equalizer"}, {"bool", "toggle"}, {"int", "number"},
      {"float", "number"}, {"list", "list"}, {"dict", "braces"}, {"json", "braces"},
      {"object", "braces"}, {"dataframe", "table"}, {"document", "document"}, {"folder", "folder"},
      {"any", "help"}, {"preview", "visibility"}};
  return icons.value(type, QStringLiteral("help"));
}

QString webTypeIcon(const QString &type) {
    // Aliases from iconMap in web/src/config/IconForType.tsx. Other names use
    // their own icon when one exists, and "any" otherwise.
    static const QHash<QString, QString> aliases{
        {"bytes", "file"}, {"cv", "audio"}, {"collection", "database"}, {"embedding_model", "tensor"},
        {"rerank_model", "tensor"}, {"font", "document"}, {"image_size", "language_model"},
        {"model_ref", "model"}, {"llama_cpp_model", "language_model"}, {"llama_model", "language_model"},
        {"mistral_model", "language_model"}, {"model_3d_model", "model_3d"}, {"model3d", "model_3d"},
        {"none", "notype"}, {"sketch", "image"}, {"timeline", "video"}, {"keyframe", "image"},
        {"video_element", "image"}, {"shot", "video"}, {"message", "thread_message"},
        {"torch_tensor", "tensor"}, {"tts_model", "audio"}, {"asr_model", "audio"},
        {"music_model", "audio"}, {"audio_to_audio_model", "audio"}, {"video_model", "video"},
        {"workflow", "dataframe"}, {"object", "dict"}, {"json", "dict"}};
    // Keys with an SVG in resources/data_types that iconMap also lists by name.
    static const QSet<QString> named{
        "any", "notype", "asset", "audio", "bool", "chunk", "preview", "dataframe", "dict", "enum",
        "file", "float", "folder", "image", "int", "list", "model", "language_model", "image_model",
        "str", "tensor", "text", "union", "video", "task", "thread", "datetime", "date", "np_array",
        "document", "model_3d"};
    auto name = type;
    if (name.startsWith(QStringLiteral("nodetool."))) {
        name = name.mid(9);
    }
    if (name.isEmpty()) {
        return QStringLiteral("notype");
    }
    if (const auto alias = aliases.constFind(name); alias != aliases.cend()) {
        return *alias;
    }
    if (name.startsWith(QStringLiteral("tjs."))) {
        return QStringLiteral("language_model");
    }
    return named.contains(name) ? name : QStringLiteral("any");
}

QByteArray webTypeIconSvg(const QString &key, const QColor &color) {
    // native-rules #14: function-static mutable SVG cache
    static QHash<QString, QByteArray> sources;
    auto found = sources.find(key);
    if (found == sources.end()) {
        QFile file(QStringLiteral(":/editor/data_types/%1.svg").arg(key));
        found = sources.insert(key, file.open(QIODevice::ReadOnly) ? file.readAll() : QByteArray{});
    }
    if (found->isEmpty()) {
        return {};
    }
    auto svg = *found;
    svg.replace("currentColor", color.name(QColor::HexRgb).toLatin1());
    return svg;
}

QString displayName(const QString &name) {
  auto result = name;
  result.replace('_', ' ');
  if (!result.isEmpty()) { result[0] = result[0].toUpper(); }
  return result;
}
} // namespace nodetool
