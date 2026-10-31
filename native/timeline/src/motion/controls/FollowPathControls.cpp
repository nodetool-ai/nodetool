#include "FollowPathControls.h"
#include <QJsonArray>
#include <QJsonObject>

void FollowPathControls::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) { return; }
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = timeline;
    if (m_timeline) { connect(m_timeline, &TimelineModel::clipsChanged, this, &FollowPathControls::changed); }
    emit changed();
}
QVariantList FollowPathControls::options() const {
    QVariantList result;
    if (!m_timeline) { return result; }
    for (const auto& value : m_timeline->clipsJson()) {
        const auto clip = value.toObject();
        if (clip.value("mediaType").toString() != "shape") { continue; }
        const auto id = clip.value("id").toString();
        const auto name = clip.value("name").toString();
        result.append(QVariantMap{{"value", id}, {"label", name.isEmpty() ? id : name}});
    }
    return result;
}
QVariantList FollowPathControls::clipOptions() const {
    QVariantList result;
    if (!m_timeline) { return result; }
    for (const auto& value : m_timeline->clipsJson()) {
        const auto clip = value.toObject();
        const auto id = clip.value("id").toString();
        const auto name = clip.value("name").toString();
        result.append(QVariantMap{{"value", id}, {"label", name.isEmpty() ? id : name}});
    }
    return result;
}
QVariantMap FollowPathControls::params(const QString& id) const {
    if (!m_timeline) { return {}; }
    for (const auto& value : m_timeline->clipsJson()) {
        const auto clip = value.toObject();
        if (clip.value("id").toString() == id && clip.value("mediaType").toString() == "shape") {
            return shapeParams(clip.value("shapeStyle").toObject().toVariantMap());
        }
    }
    return {};
}
QVariantMap FollowPathControls::shapeParams(const QVariantMap& shape) {
    const auto kind = shape.value("kind").toString();
    QString d;
    if (kind == "rect") { d = "M0 0L1 0L1 1L0 1Z"; }
    else if (kind == "ellipse") { d = "M1 0.5 C1 0.7761423749153968 0.7761423749153968 1 0.5 1 C0.2238576250846032 1 0 0.7761423749153968 0 0.5 C0 0.2238576250846032 0.2238576250846032 0 0.5 0 C0.7761423749153968 0 1 0.2238576250846032 1 0.5 Z"; }
    else if (kind == "path") { d = shape.value("d").toString().trimmed(); }
    if (d.isEmpty()) { return {}; }
    return {{"d", d}, {"pathX", shape.value("x", 0.25)}, {"pathY", shape.value("y", 0.25)},
            {"pathWidth", shape.value("width", 0.5)}, {"pathHeight", shape.value("height", 0.5)}};
}
