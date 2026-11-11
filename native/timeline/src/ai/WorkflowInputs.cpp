#include "ai/WorkflowInputs.h"
#include <QHash>
#include <QJsonValue>
#include <algorithm>
#include <cmath>

namespace nt::ai {
namespace {
QString inputKind(const QString& type) {
    static const QHash<QString, QString> kinds{
        {"nodetool.input.StringInput", "string"}, {"nodetool.input.TextInput", "string"}, {"nodetool.input.MessageInput", "string"},
        {"nodetool.input.BooleanInput", "boolean"}, {"nodetool.input.IntegerInput", "integer"}, {"nodetool.input.FloatInput", "float"},
        {"nodetool.input.ColorInput", "color"}, {"nodetool.input.ImageInput", "image"}, {"nodetool.input.VideoInput", "video"},
        {"nodetool.input.AudioInput", "audio"}, {"nodetool.input.RealtimeAudioInput", "audio"},
        {"nodetool.input.DocumentInput", "document"}, {"nodetool.input.DataFrameInput", "dataframe"},
        {"nodetool.input.DataframeInput", "dataframe"}, {"nodetool.input.Model3DInput", "model3d"},
        {"nodetool.input.ImageSizeInput", "image_size"}, {"nodetool.input.HuggingFaceModelInput", "huggingface_model"},
        {"nodetool.input.FilePathInput", "file_path"}, {"nodetool.input.FolderPathInput", "folder_path"},
        {"nodetool.input.Folder", "folder"}, {"nodetool.input.SelectInput", "select"},
        {"nodetool.input.LanguageModelInput", "language_model"}, {"nodetool.input.ImageModelInput", "image_model"},
        {"nodetool.input.VideoModelInput", "video_model"}, {"nodetool.input.TTSModelInput", "tts_model"},
        {"nodetool.input.ASRModelInput", "asr_model"}, {"nodetool.input.MusicModelInput", "music_model"},
        {"nodetool.input.EmbeddingModelInput", "embedding_model"}, {"nodetool.input.ImageListInput", "image_list"},
        {"nodetool.input.VideoListInput", "video_list"}, {"nodetool.input.AudioListInput", "audio_list"},
        {"nodetool.input.TextListInput", "text_list"}, {"nodetool.input.StringListInput", "text_list"},
        {"nodetool.input.ValueInput", "value"}};
    return kinds.value(type);
}
QJsonValue fallback(const QString& kind, const QJsonObject& data) {
    if (data.contains("value")) return data.value("value");
    if (kind == u"string" || kind == u"file_path" || kind == u"folder_path") return QString();
    if (kind == u"boolean") return false;
    if (kind == u"select") {
        const auto options = data.value("options").toArray();
        return options.isEmpty() ? QJsonValue(QString()) : options.first();
    }
    if (kind == u"image_list" || kind == u"video_list" || kind == u"audio_list" || kind == u"text_list") return QJsonArray{};
    return QJsonValue(QJsonValue::Undefined);
}
}
QJsonArray workflowInputs(const QJsonObject& workflow, const QJsonObject& overrides) {
    QJsonArray result;
    for (const auto& value : workflow.value("graph").toObject().value("nodes").toArray()) {
        if (!value.isObject()) continue;
        const auto node = value.toObject();
        const auto type = node.value("type").toString();
        const auto kind = inputKind(type);
        if (kind.isEmpty()) continue;
        const auto data = node.value("data").toObject();
        const auto name = data.value("name").toString();
        QJsonObject row{{"nodeId", node.value("id")}, {"nodeType", type}, {"name", name},
                        {"label", data.value("label").toString().isEmpty() ? name : data.value("label").toString()}, {"kind", kind},
                        {"description", data.value("description").toString()}};
        for (const auto* field : {"min", "max", "options", "enum_type_name"}) if (data.contains(field)) row.insert(field, data.value(field));
        const auto length = data.value("max_length");
        if (length.isDouble() && std::isfinite(length.toDouble())) row.insert("maxLength", std::max(0.0, std::floor(length.toDouble())));
        const auto mode = data.value("line_mode").toString();
        row.insert("multiline", mode == u"multi_line" || mode == u"multiline" || data.value("multiline").toBool());
        QJsonValue current;
        if (overrides.contains(name)) current = overrides.value(name);
        else {
            current = fallback(kind, data);
            if (current.isNull()) {
                if (kind == u"string" || kind == u"file_path" || kind == u"folder_path") current = QString();
                else if (kind == u"boolean") current = false;
                else if (kind == u"image_list" || kind == u"video_list" || kind == u"audio_list" || kind == u"text_list") current = QJsonArray{};
                else current = QJsonValue(QJsonValue::Undefined);
            }
        }
        row.insert("hasValue", !current.isUndefined());
        if (!current.isUndefined()) row.insert("value", current);
        result.append(row);
    }
    return result;
}
}
