#pragma once
#include <QJsonObject>
#include <QJsonArray>
#include <QSet>

namespace nodetool::node_editor {
// Decode accepted legacy input declarations without changing their stored JSON.
// Output validation still requires the canonical object shape on import.
inline QJsonObject normalizedDynamicPortType(QJsonValue value) {
    for (int depth=0;depth<=128;++depth) {
        if (value.isString()) { return value.toString().isEmpty() ? QJsonObject{} : QJsonObject{{"type",value}}; }
        if (!value.isObject()) { return {}; }
        const auto object=value.toObject();
        const auto type=object.value("type");
        if (type.isString()) { return type.toString().isEmpty() ? QJsonObject{} : object; }
        if (!type.isObject()) { return {}; }
        value=type;
    }
    return {};
}
// Mirrors web TypeHandler.isConnectable, including its permissive union overlap.
inline bool connectionTypesCompatible(const QJsonObject& source, const QJsonObject& target, int depth = 0) {
    if (depth > 128) { return false; }
    const auto a = source.value("type").toString(), b = target.value("type").toString();
    if (a.isEmpty() || b.isEmpty()) { return false; }
    if (a == "any" || b == "any") { return true; }
    if ((a == "cv" && b == "chunk") || (a == "chunk" && b == "cv")) { return true; }
    const auto aa = source.value("type_args").toArray(), ba = target.value("type_args").toArray();
    if (a != "list" && b == "list" && ba.size() == 1 && connectionTypesCompatible(source, ba[0].toObject(), depth + 1)) { return true; }
    if (a == "union") {
        for (const auto& arg : aa) { if (connectionTypesCompatible(arg.toObject(), target, depth + 1)) { return true; } }
        return false;
    }
    if (b == "union") {
        for (const auto& arg : ba) { if (connectionTypesCompatible(source, arg.toObject(), depth + 1)) { return true; } }
        return false;
    }
    if (b == "object") {
        const QSet<QString> nonObjects{"str", "number", "boolean", "null", "enum", "list", "dict", "union", "tuple"};
        return !nonObjects.contains(a);
    }
    if (b == "enum") {
        return a == "str" || (a == "enum" && !source.value("type_name").toString().isEmpty()
            && source.value("type_name") == target.value("type_name"));
    }
    if (a == "enum") { return b == "str"; }
    if (a == "list") {
        return b == "list" && (aa.size() != 1 || ba.size() != 1 || connectionTypesCompatible(aa[0].toObject(), ba[0].toObject(), depth + 1));
    }
    if (a == "dict") {
        if (b != "dict") { return false; }
        if (aa.size() < 2 || ba.size() < 2) { return true; }
        return aa.size() == 2 && ba.size() == 2
            && connectionTypesCompatible(aa[0].toObject(), ba[0].toObject(), depth + 1)
            && connectionTypesCompatible(aa[1].toObject(), ba[1].toObject(), depth + 1);
    }
    return a == b;
}
}
