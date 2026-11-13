#pragma once
#include "PropertyVisibility.h"
#include "document/ChildPorts.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QJsonDocument>
#include <QJsonParseError>
#include <QSet>
#include <QRegularExpression>
#include <QVariantList>
#include <cmath>

namespace nodetool::node_editor {
// Shared by the inspector and document command boundary. No defaults are written.
inline QJsonObject propertyType(const QJsonObject& p) {
    auto type = p.value("type").isObject() ? p.value("type").toObject() : p;
    const auto overrideType = p.value("json_schema_extra").toObject().value("type").toString();
    if (overrideType == "json" || overrideType == "record_type" || overrideType == "color" || overrideType == "image_size" || overrideType.startsWith("media_")) { type.insert("type", overrideType); }
    return type;
}
inline bool propertyNullable(const QJsonObject& p) {
    const auto type = propertyType(p);
    if (type.value("optional").toBool()) { return true; }
    if (type.value("type") == "union") {
        for (const auto& arg : type.value("type_args").toArray()) {
            if (arg.toObject().value("type") == "none") { return true; }
        }
    }
    return false;
}
inline QString scalarPropertyType(const QJsonObject& p) {
    const auto t = propertyType(p);
    if (t.value("type") != "union") { return t.value("type").toString(); }
    QSet<QString> types;
    for (const auto& arg : t.value("type_args").toArray()) {
        const auto type = arg.toObject().value("type").toString();
        if (type != "none") { types.insert(type == "text" ? "str" : type); }
    }
    // Reduce scalar unions as the web resolver does. Mixed structured unions
    // stay inert rather than allowing a scalar editor to destroy their value.
    if (types.size() == 1) { return *types.cbegin(); }
    if (types == QSet<QString>{"int", "float"}) { return "float"; }
    return {};
}
inline QJsonArray propertyOptions(const QJsonObject& p) {
    const auto t = propertyType(p);
    const auto args = t.value("type_args").toArray();
    for (const auto& candidate : {t.value("values"), args.isEmpty() ? QJsonValue{} : args.first().toObject().value("values"),
                                 p.value("values"), p.value("enum"), t.value("enum")}) {
        if (!candidate.toArray().isEmpty()) { return candidate.toArray(); }
    }
    return {};
}
inline QString propertyMediaType(const QJsonObject& p) {
    const auto name = scalarPropertyType(p);
    if (name == "image_list" || name == "audio_list" || name == "video_list") { return name.left(name.size() - 5); }
    if (name == "list") {
        auto type = propertyType(p);
        if (type.value("type") == "union") {
            for (const auto& arg : type.value("type_args").toArray()) { if (arg.toObject().value("type") == "list") { type = arg.toObject(); break; } }
        }
        const auto args = type.value("type_args").toArray();
        return args.isEmpty() ? QString{} : args.first().toObject().value("type").toString();
    }
    return name;
}
inline QString validateMediaReference(const QString& type, const QJsonValue& value) {
    const auto reference = value.toObject();
    if (!value.isObject() || reference.value("type") != type) { return "Choose a media reference of the declared type"; }
    for (const auto& field : {"uri", "asset_id", "temp_id"}) {
        if (reference.value(field).isString() && !reference.value(field).toString().isEmpty()) { return {}; }
    }
    if (reference.contains("data") && !reference.value("data").isNull()) { return {}; }
    // Older generic asset fields used an id wrapper. Preserve until replaced.
    if (type == "asset" && !reference.value("id").toString().isEmpty()) { return {}; }
    return "Choose a media asset or locator";
}
inline QString validateColorValue(const QJsonValue& value) {
    const auto color = value.isString() ? value : value.toObject().value("value");
    if (!value.isString() && (!value.isObject() || value.toObject().value("type") != "color")) { return "Choose a color wrapper or hex string"; }
    if (color.isNull()) { return {}; }
    static const QRegularExpression hex(QStringLiteral("^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$"));
    return color.isString() && hex.match(color.toString()).hasMatch() ? QString{} : QStringLiteral("Enter a hex color with optional alpha");
}
inline QString validateImageSizeValue(const QJsonValue& value) {
    if (!value.isObject()) { return "Choose image dimensions"; }
    const auto dimensions = value.toObject();
    for (const auto& axis : {"width", "height"}) {
        const auto number = dimensions.value(axis);
        if (!number.isDouble() || !std::isfinite(number.toDouble()) || number.toDouble() < 1 || number.toDouble() > 9007199254740991.0 || std::trunc(number.toDouble()) != number.toDouble()) { return "Image dimensions must be positive safe integers"; }
    }
    return {};
}
inline bool isModelType(const QString& type) {
    static const QSet<QString> types{"language_model", "embedding_model", "image_model", "video_model", "tts_model", "asr_model", "music_model", "audio_to_audio_model", "rerank_model", "llama_model"};
    return types.contains(type) || type.startsWith("hf.") || type.startsWith("tjs.");
}
// Language and embedding fields also lock to a concrete default provider. Media
// fields honor only a declared list because their defaults name a provider.
inline QJsonArray modelAllowedProviders(const QJsonObject& p) {
    auto allowed = p.value("json_schema_extra").toObject().value("allowed_providers").toArray();
    const auto type = scalarPropertyType(p);
    if (allowed.isEmpty() && (type == "language_model" || type == "embedding_model")) {
        const auto provider = p.value("default").toObject().value("provider").toString();
        if (!provider.isEmpty() && provider != "empty") { allowed.append(provider); }
    }
    return allowed;
}
// Matches IMAGE_TASK_BY_NODE_TYPE and VIDEO_TASK_BY_NODE_TYPE in the web editor.
inline QStringList modelTasksForNodeType(const QString& nodeType) {
    static const QHash<QString, QStringList> tasks{
        {"nodetool.image.TextToImage", {"text_to_image"}}, {"nodetool.image.ImageToImage", {"image_to_image"}},
        {"nodetool.image.Upscale", {"upscale"}}, {"nodetool.image.RemoveBackground", {"remove_background"}},
        {"nodetool.image.EstimateDepth", {"estimate_depth"}}, {"nodetool.image.Segment", {"segment"}},
        {"nodetool.image.Relight", {"image_to_image", "relight"}}, {"nodetool.image.Vectorize", {"vectorize"}},
        {"nodetool.video.TextToVideo", {"text_to_video"}}, {"nodetool.video.ImageToVideo", {"image_to_video"}},
        {"nodetool.video.ReferenceToVideo", {"reference_to_video"}}, {"nodetool.video.VideoToVideo", {"video_to_video"}},
        {"nodetool.video.LipSync", {"lip_sync"}}};
    return tasks.value(nodeType);
}
inline QString propertyKind(const QJsonObject& p) {
    const auto overrideType = p.value("json_schema_extra").toObject().value("type").toString();
    if (overrideType.startsWith("media_")) {
        return overrideType;
    }
    if (!propertyOptions(p).isEmpty()) { return "choice"; }
    const auto type = scalarPropertyType(p);
    if (type == "str" || type == "string") {
        const auto extra = p.value("json_schema_extra").toObject();
        return extra.value("multiline") == false || extra.value("format") == "single-line" ? "text" : "multiline";
    }
    if (type == "list" || type == "dict") {
        auto container = propertyType(p);
        if (container.value("type") == "union") {
            for (const auto& arg : container.value("type_args").toArray()) {
                if (arg.toObject().value("type") == type) { container = arg.toObject(); break; }
            }
        }
        const auto args = container.value("type_args").toArray();
        const auto entry = args.isEmpty() ? QStringLiteral("any") : args.last().toObject().value("type").toString();
        if (type == "list" && entry == "tool_name") {
            return "tools";
        }
        if (type == "list" && entry == "entity") {
            return "entity_list";
        }
        if (type == "list" && entry == "workflow") { return "workflow_list"; }
        if (type == "list" && (entry == "image" || entry == "audio" || entry == "video")) { return "media_list"; }
        const QSet<QString> editableEntries{"any", "str", "string", "int", "integer", "float", "number", "bool", "boolean", "list", "dict", "union", "enum"};
        return editableEntries.contains(entry) ? type : QStringLiteral("unsupported");
    }
    if (type == "json" || type == "record_type" || type == "dataframe") { return type; }
    if (type == "sketch" || type == "timeline" || type == "script" || type == "storyboard") { return "document_ref"; }
    if (QSet<QString>{"font", "folder", "entity", "file", "document", "file_path", "folder_path"}.contains(type)) {
        return type;
    }
    if (type == "workflow") { return "workflow"; }
    if (type == "collection") { return "collection"; }
    if (type == "color" || type == "image_size") { return type; }
    if (isModelType(type)) { return "model"; }
    if (type == "model_3d") { return "model3d"; }
    if (type == "image" || type == "audio" || type == "video" || type == "asset") { return "media"; }
    if (type == "image_list" || type == "audio_list" || type == "video_list") { return "media_list"; }
    if (type == "int" || type == "integer") { return "integer"; }
    if (type == "float" || type == "number") { return "number"; }
    if (type == "bool" || type == "boolean") { return "boolean"; }
    return "unsupported";
}
// Bounds apply to both metadata recursion and user supplied collections.
inline QString validateTypedValue(const QJsonObject& type, const QJsonValue& value, int depth, int& budget) {
    if (depth > 24 || --budget < 0) { return "Value exceeds structured editing limits"; }
    const auto name = type.value("type").toString();
    const auto args = type.value("type_args").toArray();
    if (value.isNull() && (type.value("optional").toBool() || name == "none" || name == "any")) { return {}; }
    if (name == "union") {
        for (const auto& arg : args) {
            if (validateTypedValue(arg.toObject(), value, depth + 1, budget).isEmpty()) { return {}; }
        }
        return "Value does not match a declared union member";
    }
    if (name == "list" || name == "dict") {
        if (name == "list" && !value.isArray()) { return "Value must be a list"; }
        if (name == "dict" && !value.isObject()) { return "Value must be a dictionary"; }
        const auto element = args.isEmpty() ? QJsonObject{{"type", "any"}} : args.last().toObject();
        if (name == "list") {
            for (const auto& entry : value.toArray()) {
                const auto error = validateTypedValue(element, entry, depth + 1, budget);
                if (!error.isEmpty()) { return error; }
            }
        } else {
            const auto object = value.toObject();
            for (auto it = object.begin(); it != object.end(); ++it) {
                if (args.size() >= 2) {
                    const auto keyError = validateTypedValue(args.first().toObject(), it.key(), depth + 1, budget);
                    if (!keyError.isEmpty()) { return keyError; }
                }
                const auto error = validateTypedValue(element, it.value(), depth + 1, budget);
                if (!error.isEmpty()) { return error; }
            }
        }
        return {};
    }
    if (name == "image" || name == "audio" || name == "video" || name == "asset") { return validateMediaReference(name, value); }
    if (name == "color") { return validateColorValue(value); }
    if (name == "image_size") { return validateImageSizeValue(value); }
    if (name == "workflow") {
        const auto reference = value.toObject();
        return value.isObject() && reference.value("type") == "workflow" && reference.value("id").isString() && !reference.value("id").toString().isEmpty() ? QString{} : QStringLiteral("Choose a workflow reference");
    }
    if (name == "any") {
        if (value.isArray()) {
            for (const auto& entry : value.toArray()) {
                const auto error = validateTypedValue(type, entry, depth + 1, budget);
                if (!error.isEmpty()) { return error; }
            }
        } else if (value.isObject()) {
            const auto object = value.toObject();
            for (auto it = object.begin(); it != object.end(); ++it) {
                const auto error = validateTypedValue(type, it.value(), depth + 1, budget);
                if (!error.isEmpty()) { return error; }
            }
        }
        return {};
    }
    if (name == "json") {
        const auto object = value.toObject();
        if (!value.isObject() || object.value("type") != "json" || !object.value("data").isString()) { return "Expected a JSON resource"; }
        const auto text = object.value("data").toString();
        if (text.trimmed().isEmpty()) { return {}; }
        if (text.size() > 1000000) { return "JSON exceeds structured editing limits"; }
        QJsonParseError error;
        // Wrapping permits JSON scalar roots as well as objects and arrays.
        const auto parsed = QJsonDocument::fromJson(("[" + text + "]").toUtf8(), &error);
        if (error.error != QJsonParseError::NoError || parsed.array().size() != 1) { return "Invalid JSON: " + error.errorString(); }
        return validateTypedValue(QJsonObject{{"type", "any"}}, parsed.array().first(), depth + 1, budget);
    }
    if (name == "record_type") {
        const auto object = value.toObject();
        if (!value.isObject() || object.value("type") != "record_type" || !object.value("columns").isArray()) { return "Expected record columns"; }
        QSet<QString> names;
        const QSet<QString> types{"string", "int", "float", "datetime"};
        for (const auto& entry : object.value("columns").toArray()) {
            if (--budget < 0) { return "Value exceeds structured editing limits"; }
            const auto column = entry.toObject();
            const auto columnName = column.value("name").toString();
            if (columnName.isEmpty() || names.contains(columnName) || !types.contains(column.value("data_type").toString())) { return "Record columns need unique names and declared data types"; }
            names.insert(columnName);
        }
        return validateTypedValue(QJsonObject{{"type", "any"}}, value, depth + 1, budget);
    }
    const auto kind = propertyKind(type);
    if (kind == "choice") {
        for (const auto& option : propertyOptions(type)) { if (option == value) { return {}; } }
        return "Choose a declared value";
    }
    if (kind == "text" || kind == "multiline") { return value.isString() ? QString{} : QStringLiteral("Value must be text"); }
    if (kind == "boolean") { return value.isBool() ? QString{} : QStringLiteral("Value must be boolean"); }
    if (kind == "integer" || kind == "number") {
        if (!value.isDouble() || !std::isfinite(value.toDouble())) { return "Value must be a finite number"; }
        if (kind == "integer" && std::trunc(value.toDouble()) != value.toDouble()) { return "Value must be an integer"; }
        return {};
    }
    return "This nested value requires a dedicated editor";
}
inline QString validatePropertyValue(const QJsonObject& p, const QJsonValue& value) {
    if (value.isNull()) { return propertyNullable(p) ? QString{} : QStringLiteral("Value cannot be null"); }
    const auto kind = propertyKind(p);
    if (kind == "choice") {
        for (const auto& option : propertyOptions(p)) { if (option == value) { return {}; } }
        return "Choose a declared value";
    }
    if (kind == "list" || kind == "dict" || kind == "json" || kind == "record_type" || kind == "workflow" || kind == "workflow_list") {
        int budget = 10000;
        return validateTypedValue(propertyType(p), value, 0, budget);
    }
    if (kind == "dataframe") {
        const auto frame = value.toObject();
        const bool shaped = value.isObject() && frame.value("type") == "dataframe"
            && (frame.value("columns").isNull() || frame.value("columns").isUndefined() || frame.value("columns").isArray())
            && (frame.value("data").isNull() || frame.value("data").isUndefined() || frame.value("data").isArray());
        return shaped ? QString{} : QStringLiteral("Expected a dataframe");
    }
    if (kind == "document_ref") {
        const auto reference = value.toObject();
        return value.isObject() && reference.value("type") == scalarPropertyType(p) && !reference.value("id").toString().isEmpty() ? QString{} : QStringLiteral("Choose a document reference");
    }
    if (kind == "file_path" || kind == "folder_path") {
        return value.isString() ? QString{} : QStringLiteral("Choose a local path");
    }
    if (kind == "media_duration") {
        return value.isDouble() && value.toDouble() > 0 && std::isfinite(value.toDouble()) && std::trunc(value.toDouble()) == value.toDouble() ? QString{} : QStringLiteral("Choose a positive duration in seconds");
    }
    if (kind == "media_strength") {
        return value.isDouble() && QJsonArray{0.25, 0.5, 0.65, 0.75, 0.85, 1.0}.contains(value) ? QString{} : QStringLiteral("Choose a supported strength");
    }
    if (kind == "media_resolution_image" || kind == "media_resolution_video") {
        const QJsonArray allowed = kind == "media_resolution_image" ? QJsonArray{"1K", "2K", "4K"} : QJsonArray{"720p", "1080p", "1440p", "4K"};
        return allowed.contains(value) ? QString{} : QStringLiteral("Choose a supported resolution");
    }
    if (kind == "media_aspect_ratio_image" || kind == "media_aspect_ratio_video") {
        static const QRegularExpression ratio(QStringLiteral("^[1-9][0-9]*:[1-9][0-9]*$"));
        return value.isString() && ratio.match(value.toString()).hasMatch() ? QString{} : QStringLiteral("Choose a positive aspect ratio");
    }
    if (kind == "document") {
        return validateMediaReference("document", value);
    }
    if (kind == "font" || kind == "folder" || kind == "entity" || kind == "file") {
        const auto object = value.toObject();
        const auto identity = kind == "font" ? "name" : kind == "folder" ? "asset_id" : "id";
        return value.isObject() && (kind == "file" || object.value("type") == kind) && !object.value(identity).toString().isEmpty() ? QString{} : QStringLiteral("Choose a valid resource");
    }
    if (kind == "tools" || kind == "entity_list") {
        if (!value.isArray()) {
            return "Choose a resource list";
        }
        for (const auto& entry : value.toArray()) {
            const auto row = entry.toObject();
            const auto type = kind == "tools" ? "tool_name" : "entity";
            const auto identity = kind == "tools" ? "name" : "id";
            if (row.value("type") != type || row.value(identity).toString().isEmpty()) {
                return "Choose a valid list entry";
            }
        }
        return {};
    }
    if (kind == "color") { return validateColorValue(value); }
    if (kind == "image_size") { return validateImageSizeValue(value); }
    if (kind == "collection") {
        const auto reference = value.toObject();
        return value.isObject() && reference.value("type") == "collection" && reference.value("name").isString() && !reference.value("name").toString().isEmpty() ? QString{} : QStringLiteral("Choose a collection name");
    }
    if (kind == "media_list") {
        if (!value.isArray()) { return "Value must be a media list"; }
        int budget = 10000;
        const QJsonObject type{{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", propertyMediaType(p)}}}}};
        return validateTypedValue(type, value, 0, budget);
    }
    if (kind == "model3d") {
        return value.isObject() && value.toObject().value("type") == "model_3d" && value.toObject().value("uri").isString() ? QString{} : QStringLiteral("Choose a 3D model locator");
    }
    if (kind == "media") { return validateMediaReference(propertyMediaType(p), value); }
    if (kind == "model") {
        // Old workflows stored a plain model id. Preserve it until selection.
        if (value.isString()) { return {}; }
        const auto model = value.toObject();
        const auto type = scalarPropertyType(p);
        if (!value.isObject() || (model.contains("type") && model.value("type") != type)) { return "Choose a model"; }
        if (type.startsWith("hf.") || type.startsWith("tjs.")) { return model.value("repo_id").isString() || model.value("id").isString() ? QString{} : QStringLiteral("Choose a model"); }
        if (type == "llama_model") { return model.value("repo_id").isString() ? QString{} : QStringLiteral("Choose a model"); }
        if (!model.value("id").isString() || !model.value("provider").isString()) { return "Choose a model"; }
        const auto allowed = modelAllowedProviders(p);
        if (!allowed.isEmpty() && !allowed.contains(model.value("provider"))) { return "Choose a model from an allowed provider"; }
        return {};
    }
    if (kind == "unsupported") { return "This value requires the web editor"; }
    if (kind == "text" || kind == "multiline") { return value.isString() ? QString{} : QStringLiteral("Value must be text"); }
    if (kind == "boolean") { return value.isBool() ? QString{} : QStringLiteral("Value must be boolean"); }
    if (!value.isDouble() || !std::isfinite(value.toDouble())) { return "Value must be a finite number"; }
    const auto number = value.toDouble();
    if (kind == "integer" && std::trunc(number) != number) { return "Value must be an integer"; }
    if (p.value("min").isDouble() && number < p.value("min").toDouble()) { return "Value is below the minimum"; }
    if (p.value("max").isDouble() && number > p.value("max").toDouble()) { return "Value is above the maximum"; }
    return {};
}
inline QJsonObject propertyEditorType(const QJsonObject& p) {
    const auto type = propertyType(p);
    if (type.value("type") == "union") {
        for (const auto& arg : type.value("type_args").toArray()) {
            if (arg.toObject().value("type").toString() == scalarPropertyType(p)) { return arg.toObject(); }
        }
    }
    return type;
}
inline QVariantList propertyFields(const QJsonObject& rawNode, const QJsonObject& metadata, const QJsonArray& edges) {
    const auto node = withChildPorts(rawNode);
    QVariantList rows;
    QSet<QString> names;
    const auto append = [&](QJsonObject p, const QString& storage) {
        const auto name = p.value("name").toString();
        if (node.value("type") == "nodetool.workflows.subgraph.Subgraph" && name == "graph") { return; }
        if (name.isEmpty() || names.contains(name)) { return; }
        names.insert(name);
        const auto data = node.value(storage).toObject();
        const auto value = data.contains(name) ? data.value(name) : p.value("default");
        bool connected = false;
        for (const auto& edge : edges) {
            const auto e = edge.toObject();
            if (e.value("target") == node.value("id") && e.value("targetHandle") == name) { connected = true; break; }
        }
        const bool conditionSatisfied = storage != "data" || propertyConditionSatisfied(p, node.value("data").toObject());
        if (!connected && !conditionSatisfied) { return; }
        // SelectProperty.tsx offers the options the node itself stores in `options`.
        const bool select = p.value("json_schema_extra").toObject().value("type") == "select" && scalarPropertyType(p) == "str";
        const auto kind = select ? QStringLiteral("choice") : propertyKind(p);
        const bool appendStatic = kind == "media_list" && metadata.value("append_static_inputs").toArray().contains(name);
        QVariantList options;
        for (const auto& option : select ? node.value("data").toObject().value("options").toArray() : propertyOptions(p)) {
            if (select && !option.isString()) { continue; }
            options.append(QVariantMap{{"label", option.toVariant().toString()}, {"value", option.toVariant()}});
        }
        QVariantMap row{{"siblingModel", node.value("data").toObject().value("model").toVariant()}, {"nodeType", node.value("type").toString()}, {"name", name}, {"label", p.value("title").toString(name)}, {"description", p.value("description").toString()},
            {"dataType", propertyEditorType(p).toVariantMap()}, {"kind", kind}, {"value", value.toVariant()}, {"editable", conditionSatisfied && (!connected || appendStatic) && kind != "unsupported"}, {"conditionalUnavailable", !conditionSatisfied}, {"appendStatic", appendStatic}, {"connected", connected},
            {"required", p.value("required").toBool()}, {"nullable", propertyNullable(p)},
            {"hasValue", data.contains(name)}, {"hasDefault", p.contains("default")}, {"defaultValue", p.value("default").toVariant()},
            // The web resets only a property with a non-null default, and marks it changed once its
            // stored value differs. A null default has nothing to reset to.
            {"hasResetDefault", !p.value("default").isNull() && !p.value("default").isUndefined()},
            {"changed", data.contains(name) && !p.value("default").isNull() && !p.value("default").isUndefined() && data.value(name) != p.value("default")},
            {"options", options}, {"storage", storage}, {"error", !conditionSatisfied ? QStringLiteral("Unavailable for the selected settings") : connected && !appendStatic ? QStringLiteral("Value supplied by a connected input") : (kind == "unsupported" ? QStringLiteral("Preserved. Edit this value in the web editor.") : (value.isUndefined() || select ? QString{} : validatePropertyValue(p, value)))},
            {"step", kind == "integer" ? 1.0 : 0.1}};
        for (const auto& bound : {QStringLiteral("min"), QStringLiteral("max")}) {
            const auto v = p.value(bound);
            row.insert(bound, v.isDouble() && std::isfinite(v.toDouble()) ? v.toVariant() : QVariant{});
        }
        if (select) { row.insert("optionsFromNode", true); }
        if (kind == "media" || kind == "media_list") { row.insert("mediaType", propertyMediaType(p)); }
        if (kind == "model") {
            row.insert("modelType", scalarPropertyType(p));
            row.insert("allowedProviders", modelAllowedProviders(p).toVariantList());
            row.insert("modelTasks", modelTasksForNodeType(metadata.value("node_type").toString()));
        }
        rows.append(row);
    };
    for (const auto& v : metadata.value("properties").toArray()) { append(v.toObject(), "data"); }
    const auto dynamic = node.value("dynamic_inputs").toObject();
    for (auto it = dynamic.begin(); it != dynamic.end(); ++it) {
        auto p = it.value().toObject();
        if (it.value().isString()) { p.insert("type", QJsonObject{{"type", it.value()}}); }
        p.insert("name", it.key()); append(p, "dynamic_properties");
    }
    for (const auto& storage : {QStringLiteral("data"), QStringLiteral("dynamic_properties")}) {
        const auto data = node.value(storage).toObject();
        for (auto it = data.begin(); it != data.end(); ++it) { append(QJsonObject{{"name", it.key()}}, storage); }
    }
    return rows;
}
}
