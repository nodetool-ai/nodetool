#include "CodeInference.h"
#include <QFile>
#include <QHash>
#include <QJSEngine>
#include <QDebug>
namespace nodetool::node_editor {
QJsonObject withVisibleCodePorts(QJsonObject node) {
    auto inferred = withInferredCodePorts(node);
    auto outputs = inferred["dynamic_outputs"].toObject();
    const auto existing = node["dynamic_outputs"].toObject();
    for (auto it = existing.begin(); it != existing.end(); ++it) { outputs.insert(it.key(), it.value()); }
    if (node["type"] == "nodetool.code.Code") { inferred.insert("dynamic_outputs", outputs); }
    return inferred;
}
QJsonObject withInferredCodePorts(QJsonObject node, const QJsonArray& edges) {
    if (node["type"] != "nodetool.code.Code") { return node; }
    // The parser is local and never evaluates the user's source.
    // native-rules #14: thread_local mutable engine and init flag
    thread_local QJSEngine engine;
    thread_local bool initialized = false;
    if (!initialized) {
        for (const auto& path : {":/editor/code/acorn.js", ":/editor/code/inference.js"}) {
            QFile file(path);
            if (!file.open(QIODevice::ReadOnly)) { qWarning() << file.errorString(); return node; }
            auto script = QString::fromUtf8(file.readAll());
            // QV4 tail-call optimization drops Acorn's returned property assignment.
            // Sloppy mode disables that optimization without changing parsed syntax.
            if (QString::fromLatin1(path).endsWith("acorn.js")) { script.replace("'use strict';", ""); }
            const auto loaded = engine.evaluate(script, path);
            if (loaded.isError()) { qWarning() << loaded.toString(); return node; }
        }
        initialized = true;
    }
    // Graph projection asks for every card on each refresh, so parse each source once.
    // native-rules #14: thread_local mutable parse cache
    thread_local QHash<QString, QJsonObject> parsed;
    const auto source = node["data"].toObject()["code"].toString();
    auto cached = parsed.constFind(source);
    if (cached == parsed.constEnd()) {
        const auto result = engine.globalObject().property("infer").call({source});
        if (result.isError()) { qWarning() << result.toString() << result.property("stack").toString(); return node; }
        if (parsed.size() >= 256) { parsed.clear(); }
        cached = parsed.insert(source, QJsonObject::fromVariantMap(result.toVariant().toMap()));
    }
    const auto inferred = cached.value();
    auto inputs = node["dynamic_properties"].toObject();
    for (const auto& key : inferred["inputs"].toArray()) {
        if (!inputs.contains(key.toString())) { inputs.insert(key.toString(), ""); }
    }
    auto outputs = node["dynamic_outputs"].toObject();
    const auto keys = inferred["outputs"].toArray();
    if (!keys.isEmpty()) {
        QJsonObject next;
        for (const auto& key : keys) {
            next.insert(key.toString(), outputs.contains(key.toString()) ? outputs.value(key.toString()) : QJsonValue(QJsonObject{{"type", "any"}, {"type_args", QJsonArray{}}, {"optional", false}}));
        }
        for (const auto& value : edges) {
            const auto edge = value.toObject();
            const auto key = edge["sourceHandle"].toString();
            if (edge["source"] == node["id"] && outputs.contains(key)) { next.insert(key, outputs[key]); }
        }
        outputs = next;
    }
    node.insert("dynamic_properties", inputs);
    node.insert("dynamic_outputs", outputs);
    return node;
}
}
