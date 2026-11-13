#include "NodeLayout.h"
#include <QFile>
#include <QHash>
#include <QSet>

namespace nodetool {
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
