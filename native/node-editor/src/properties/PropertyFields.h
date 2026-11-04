#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QJsonDocument>
#include <QJsonParseError>
#include <QSet>
#include <QVariantList>
#include <cmath>

namespace nodetool::node_editor {
// Shared by the inspector and document command boundary. No defaults are written.
inline QJsonObject propertyType(const QJsonObject& p) {
    auto type = p.value("type").isObject() ? p.value("type").toObject() : p;
    const auto overrideType = p.value("json_schema_extra").toObject().value("type").toString();
    if (overrideType == "json" || overrideType == "record_type") { type.insert("type", overrideType); }
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
inline QString propertyKind(const QJsonObject& p) {
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
        const QSet<QString> editableEntries{"any", "str", "string", "int", "integer", "float", "number", "bool", "boolean", "list", "dict", "union", "enum"};
        return editableEntries.contains(entry) ? type : QStringLiteral("unsupported");
    }
    if (type == "json" || type == "record_type") { return type; }
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
    if (kind == "list" || kind == "dict" || kind == "json" || kind == "record_type") {
        int budget = 10000;
        return validateTypedValue(propertyType(p), value, 0, budget);
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
inline QVariantList propertyFields(const QJsonObject& node, const QJsonObject& metadata, const QJsonArray& edges) {
    QVariantList rows;
    QSet<QString> names;
    const auto append = [&](QJsonObject p, const QString& storage) {
        const auto name = p.value("name").toString();
        if (name.isEmpty() || names.contains(name)) { return; }
        names.insert(name);
        const auto data = node.value(storage).toObject();
        const auto value = data.contains(name) ? data.value(name) : p.value("default");
        bool connected = false;
        for (const auto& edge : edges) {
            const auto e = edge.toObject();
            if (e.value("target") == node.value("id") && e.value("targetHandle") == name) { connected = true; break; }
        }
        const auto kind = propertyKind(p);
        QVariantList options;
        for (const auto& option : propertyOptions(p)) { options.append(QVariantMap{{"label", option.toVariant().toString()}, {"value", option.toVariant()}}); }
        QVariantMap row{{"name", name}, {"label", p.value("title").toString(name)}, {"description", p.value("description").toString()},
            {"dataType", propertyEditorType(p).toVariantMap()}, {"kind", kind}, {"value", value.toVariant()}, {"editable", !connected && kind != "unsupported"}, {"connected", connected},
            {"required", p.value("required").toBool()}, {"nullable", propertyNullable(p)},
            {"hasValue", data.contains(name)}, {"hasDefault", p.contains("default")}, {"defaultValue", p.value("default").toVariant()},
            {"options", options}, {"storage", storage}, {"error", connected ? QStringLiteral("Value supplied by a connected input") : (kind == "unsupported" ? QStringLiteral("Preserved. Edit this value in the web editor.") : (value.isUndefined() ? QString{} : validatePropertyValue(p, value)))},
            {"step", kind == "integer" ? 1.0 : 0.1}};
        for (const auto& bound : {QStringLiteral("min"), QStringLiteral("max")}) {
            const auto v = p.value(bound);
            row.insert(bound, v.isDouble() && std::isfinite(v.toDouble()) ? v.toVariant() : QVariant{});
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
