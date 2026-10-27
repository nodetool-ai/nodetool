#include "TrackEffectsModel.h"
#include "SceneItems.h"
#include <QFile>
#include <QJsonDocument>
#include <QUuid>
#include <algorithm>

const QJsonObject& nt::wiring::w::effectReference() {
    static const auto reference = [] {
        QFile file(":/qt/qml/NodeTool/Timeline/src/wiring/w/TrackEffectsReference.json");
        if (!file.open(QIODevice::ReadOnly)) { qFatal("Missing track effects reference resource"); }
        return QJsonDocument::fromJson(file.readAll()).object();
    }();
    return reference;
}
QVariantMap TrackEffectsReference::data() const { return nt::wiring::w::effectReference().toVariantMap(); }
QVariantMap TrackEffectsReference::makeFableEffect(const QString& kind) const {
    auto effect = nt::wiring::w::effectReference().value("fableDefaults").toObject().value(kind).toObject();
    if (effect.isEmpty()) { return {}; }
    effect.insert("id", QUuid::createUuid().toString(QUuid::Id128));
    return effect.toVariantMap();
}
QQuickItem* TrackEffectsReference::windowItem(QQuickItem* anchor, const QString& name) const {
    return nt::wiring::w::windowItem(anchor, name);
}
void TrackEffectsModel::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) { return; }
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = timeline;
    if (timeline) { connect(timeline, &TimelineModel::timelineChanged, this, &TrackEffectsModel::changed); }
    emit changed();
}
void TrackEffectsModel::setTrackId(const QString& id) {
    if (m_trackId == id) { return; }
    m_trackId = id;
    emit changed();
}
QVariantMap TrackEffectsModel::track() const {
    if (!m_timeline) { return {}; }
    const auto& tracks = m_timeline->timeline().tracks;
    const auto found = std::ranges::find_if(tracks, [this](const auto& track) {
        return QString::fromStdString(track.id) == m_trackId;
    });
    return found == tracks.end() ? QVariantMap{} : found->raw.toVariantMap();
}
