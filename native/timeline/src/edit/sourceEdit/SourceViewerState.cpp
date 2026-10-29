#include "SourceViewerState.h"
#include "SourceEdit.h"
#include "assets/AssetClip.h"
#include "edit/Keymap.h"
#include <QJsonDocument>
#include <QJSValue>
#include <algorithm>
#include <cmath>
#include <limits>
#include <optional>

namespace {
std::optional<double> parseSeconds(QString text) {
    text = text.trimmed();
    if (text.endsWith('s', Qt::CaseInsensitive)) { text.chop(1); text = text.trimmed(); }
    if (text.isEmpty()) { return std::nullopt; }
    const double value = QJSValue(text).toNumber();
    if (!std::isfinite(value) || value < 0) { return std::nullopt; }
    return std::floor(value * 1000 + 0.5);
}
double durationLimit(const QVariantMap& asset) {
    const auto duration = QJsonObject::fromVariantMap(asset).value("duration");
    return duration.isDouble() ? std::floor(duration.toDouble() * 1000 + 0.5) : std::numeric_limits<double>::infinity();
}
QString actionName(const QString& kind) {
    return "source" + kind.first(1).toUpper() + kind.sliced(1);
}
}
void SourceViewerState::setMediaBrowser(AssetBrowser* browser) {
    if (m_mediaBrowser == browser) { return; }
    m_mediaBrowser = browser;
    emit changed();
}
void SourceViewerState::setAsset(const QVariantMap& value) {
    if (m_asset == value) { return; }
    m_asset = value;
    const auto id = value.value("id").toString();
    if (!id.isEmpty() && m_marks.value("assetId").toString() != id) { m_marks.clear(); }
    emit changed();
}
QString SourceViewerState::mediaType() const {
    return nt::assets::assetMediaType(QJsonObject{{"content_type", QJsonValue::fromVariant(m_asset.value("content_type"))}});
}
double SourceViewerState::inMs() const {
    return nt::sourceedit::sourceRangeFor(QJsonObject::fromVariantMap(m_asset), QJsonObject::fromVariantMap(m_marks)).inMs;
}
double SourceViewerState::outMs() const {
    return nt::sourceedit::sourceRangeFor(QJsonObject::fromVariantMap(m_asset), QJsonObject::fromVariantMap(m_marks)).outMs;
}
double SourceViewerState::durationMs() const {
    const double limit = durationLimit(m_asset);
    return std::isfinite(limit) ? limit : 0;
}
void SourceViewerState::setMarks(double in, double out) {
    const auto id = m_asset.value("id").toString();
    if (id.isEmpty()) { return; }
    const QVariantMap next{{"assetId", id}, {"inMs", in}, {"outMs", out}};
    if (m_marks == next) { return; }
    m_marks = next;
    emit changed();
}
void SourceViewerState::markIn(double timeMs) {
    if (!std::isfinite(timeMs)) { return; }
    const double time = std::max(0.0, std::min(timeMs, durationLimit(m_asset)));
    setMarks(time, std::max(time, outMs()));
}
void SourceViewerState::markOut(double timeMs) {
    if (!std::isfinite(timeMs)) { return; }
    const double time = std::max(0.0, std::min(timeMs, durationLimit(m_asset)));
    setMarks(std::min(time, inMs()), time);
}
void SourceViewerState::setIn(const QString& seconds) {
    if (const auto value = parseSeconds(seconds)) {
        setMarks(std::min(std::min(*value, durationLimit(m_asset)), outMs()), outMs());
    }
}
void SourceViewerState::setOut(const QString& seconds) {
    if (const auto value = parseSeconds(seconds)) {
        setMarks(inMs(), std::max(inMs(), std::min(*value, durationLimit(m_asset))));
    }
}
bool SourceViewerState::perform(const QString& kind, ClipGestureController* gestures) {
    if (!gestures || !gestures->timeline() || !gestures->clock() ||
        (kind != "append" && kind != "insert" && kind != "overwrite")) { return false; }
    auto* timeline = gestures->timeline();
    const auto before = timeline->clipsJson();
    const auto result = nt::sourceedit::performSourceEdit(kind, QJsonDocument::fromJson(timeline->documentJson()).object(),
        nt::targeting::TrackTargeting::current().state(), QJsonObject::fromVariantMap(m_marks),
        gestures->clock()->time(), QJsonObject::fromVariantMap(m_asset));
    if (!result) { return false; }
    const auto label = kind.first(1).toUpper() + kind.sliced(1) + " source";
    if (!timeline->commitEdit(label, before, result->doc.value("clips").toArray())) { return false; }
    if (m_mediaBrowser && m_mediaBrowser->timeline() == timeline) {
        m_mediaBrowser->resolveClipMedia(m_asset, result->id);
    }
    gestures->setSelection({result->id});
    return true;
}
QString SourceViewerState::shortcut(const QString& kind, const QString& preset) const {
    return nt::edit::formatActionShortcut(preset, actionName(kind));
}
