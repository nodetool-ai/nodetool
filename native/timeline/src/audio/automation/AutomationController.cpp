#include "AutomationController.h"
#include "Automation.h"
#include <QUuid>
#include <algorithm>

void AutomationController::setTimeline(TimelineModel* timeline) {
    if (timeline_ == timeline) { return; }
    if (timeline_) { disconnect(timeline_, nullptr, this, nullptr); }
    timeline_ = timeline;
    if (timeline_) { connect(timeline_, &TimelineModel::timelineChanged, this, &AutomationController::changed); }
    emit changed();
}
QVariantMap AutomationController::channel() const {
    if (!timeline_) { return {}; }
    if (master) { return timeline_->timeline().raw["master"].toObject().toVariantMap(); }
    const auto* track = timeline_->timeline().findTrack(trackId.toStdString());
    return track ? track->raw.toVariantMap() : QVariantMap{};
}
QVariantList AutomationController::tracks() const {
    if (!timeline_) { return {}; }
    return timeline_->timeline().raw["tracks"].toArray().toVariantList();
}
QVariant AutomationController::call(const QString& name, const QJsonArray& args) const {
    return nt::automation::call(name, args).toVariant();
}
QString AutomationController::newId() const { return QUuid::createUuid().toString(QUuid::Id128); }
quint64 AutomationController::generation() const { return timeline_ ? timeline_->documentGeneration() : 0; }
void AutomationController::edit(const QString& action, QJsonObject payload) {
    if (!timeline_) { return; }
    if (!master) { payload["trackId"] = trackId; }
    timeline_->applyEdit(action, payload);
}
void AutomationController::setPoints(const QString& laneId, const QJsonArray& points, quint64 generation) {
    if (!timeline_ || generation != timeline_->documentGeneration()) { return; }
    patchLane(laneId, {{"points", points}});
}
void AutomationController::addLane(const QJsonObject& target) {
    const auto track = QJsonObject::fromVariantMap(channel());
    if (!nt::automation::trackAcceptsAutomationTarget(track, target)) { return; }
    auto lanes = track["automation"].toArray();
    for (const auto& lane : lanes) {
        if (nt::automation::automationTargetKey(lane.toObject()["target"].toObject()) == nt::automation::automationTargetKey(target)) { return; }
    }
    lanes.append(QJsonObject{{"id",newId()},{"target",target},{"points",QJsonArray{}}});
    edit("setTrackAutomation", {{"automation",lanes}});
}
void AutomationController::patchLane(const QString& laneId, const QJsonObject& patch, bool remove) {
    QJsonArray lanes;
    for (const auto& value : QJsonObject::fromVariantMap(channel())["automation"].toArray()) {
        auto lane = value.toObject();
        if (lane["id"] == laneId) {
            if (remove) { continue; }
            for (auto it = patch.begin(); it != patch.end(); ++it) { lane[it.key()] = it.value(); }
        }
        lanes.append(lane);
    }
    edit("setTrackAutomation", {{"automation",lanes}});
}

#include "MeterReadings.h"
QVariantList AutomationMeters::take(const QString& channelId) const {
    const auto peaks=nt::automation::takeMeter(channelId.toStdString());
    return {peaks[0],peaks[1]};
}
