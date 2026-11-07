#include "ClipDelta.h"
#include <QHash>
#include <QJsonObject>

namespace {
QJsonValue rebaseValue(const QJsonValue& base, const QJsonValue& before, const QJsonValue& after) {
    if (before == after) { return base; }
    if (!before.isObject() || !after.isObject()) { return after; }
    const auto original = before.toObject();
    const auto changed = after.toObject();
    auto result = base.toObject();
    for (auto it = original.begin(); it != original.end(); ++it) {
        if (!changed.contains(it.key())) { result.remove(it.key()); }
    }
    for (auto it = changed.begin(); it != changed.end(); ++it) {
        const auto next = rebaseValue(result.value(it.key()), original.value(it.key()), it.value());
        if (next.isUndefined()) { result.remove(it.key()); }
        else { result.insert(it.key(), next); }
    }
    return result;
}
}

QJsonArray nt::motion::rebaseClipDelta(const QJsonArray& base, const QJsonArray& before, const QJsonArray& after) {
    QHash<QString, QJsonValue> baseById;
    QHash<QString, QJsonValue> beforeById;
    for (const auto& value : base) { baseById.insert(value.toObject().value("id").toString(), value); }
    for (const auto& value : before) { beforeById.insert(value.toObject().value("id").toString(), value); }
    QJsonArray result;
    for (const auto& value : after) {
        const auto id = value.toObject().value("id").toString();
        if (!beforeById.contains(id) || !baseById.contains(id)) { result.append(value); }
        else { result.append(rebaseValue(baseById.value(id), beforeById.value(id), value)); }
    }
    return result;
}
QJsonObject nt::motion::rebaseDocumentDelta(const QJsonObject& base, const QJsonObject& before, const QJsonObject& after) {
    auto b = base;
    auto p = before;
    auto a = after;
    b.remove("clips"); p.remove("clips"); a.remove("clips");
    auto result = rebaseValue(b,p,a).toObject();
    const auto beforeClips = before.value("clips");
    const auto afterClips = after.value("clips");
    if (beforeClips == afterClips) {
        if (base.contains("clips")) { result.insert("clips", base.value("clips")); }
    } else if (beforeClips.isArray() && afterClips.isArray() && base.value("clips").isArray()) {
        result.insert("clips", rebaseClipDelta(base.value("clips").toArray(), beforeClips.toArray(), afterClips.toArray()));
    } else {
        const auto clips = rebaseValue(base.value("clips"), beforeClips, afterClips);
        if (!clips.isUndefined()) { result.insert("clips", clips); }
    }
    return result;
}
