#pragma once
#include <QJsonArray>
#include <QJsonObject>

namespace nodetool::node_editor {
// Metadata conditions use JavaScript scalar equality, not structural JSON equality.
inline bool visibilityScalarEqual(const QJsonValue &a, const QJsonValue &b) {
    return !a.isObject() && !a.isArray() && a == b;
}
inline bool propertyConditionSatisfied(const QJsonObject &property, const QJsonObject &values) {
    const auto raw = property.value("json_schema_extra").toObject().value("visible_when");
    if (!raw.isObject() || !raw.toObject().value("property").isString()) { return true; }
    const auto rule = raw.toObject();
    auto candidate = values.value(rule.value("property").toString());
    const auto path = rule.value("path").toString();
    if (!path.isEmpty()) {
        for (const auto &segment : path.split('.')) {
            candidate = candidate.isObject() ? candidate.toObject().value(segment) : QJsonValue(QJsonValue::Undefined);
        }
    }
    const auto contains = [&](const QJsonValue &value) {
        if (!candidate.isArray()) { return false; }
        for (const auto &entry : candidate.toArray()) {
            if (visibilityScalarEqual(entry, value)) { return true; }
        }
        return false;
    };
    if (rule.value("includes_any").isArray()) {
        for (const auto &value : rule.value("includes_any").toArray()) {
            if (contains(value)) { return true; }
        }
        return false;
    }
    if (rule.contains("includes")) { return contains(rule.value("includes")); }
    if (rule.contains("equals")) { return visibilityScalarEqual(candidate, rule.value("equals")); }
    if (candidate.isNull() || candidate.isUndefined()) { return false; }
    if (candidate.isBool()) { return candidate.toBool(); }
    if (candidate.isDouble()) { return candidate.toDouble() != 0; }
    if (candidate.isString()) { return !candidate.toString().isEmpty(); }
    return true;
}
}
