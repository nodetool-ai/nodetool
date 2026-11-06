#include "edit/trim/TrimMonitorFrames.h"

#include "colorpanel/ColorMatchController.h"
#include "edit/trim/TrimMode.h"
#include "export/ExportController.h"

#include <QJsonDocument>

namespace {
bool hasPicture(const QVariantMap& side) {
    const auto type = side.value("mediaType").toString();
    return !side.isEmpty() && type != u"audio" && type != u"midi" && type != u"group";
}
}  // namespace

TrimMonitorFrames::TrimMonitorFrames(QObject* parent) : QObject(parent) {}

TrimMonitorFrames::~TrimMonitorFrames() {
    for (auto& side : m_sides) cancelSide(side);
}

void TrimMonitorFrames::cancelSide(Side& side) {
    ++side.token;
    side.busy = false;
    if (side.requestId != 0 && m_capture) m_capture->cancel(side.requestId);
    side.requestId = 0;
}

void TrimMonitorFrames::setTrim(TrimMode* trim) {
    if (trim == m_trim) return;
    if (m_trim) disconnect(m_trim, nullptr, this, nullptr);
    m_trim = trim;
    if (m_trim) connect(m_trim, &TrimMode::monitorChanged, this, &TrimMonitorFrames::update);
    emit inputsChanged();
    update();
}

void TrimMonitorFrames::setCapture(FrameCapture* capture) {
    if (capture == m_capture) return;
    for (auto& side : m_sides) {
        cancelSide(side);
        side.key.clear();
    }
    m_capture = capture;
    emit inputsChanged();
    update();
}

void TrimMonitorFrames::setEnabled(bool enabled) {
    if (enabled == m_enabled) return;
    m_enabled = enabled;
    emit inputsChanged();
    update();
}

void TrimMonitorFrames::update() {
    if (!m_trim || !m_capture || !m_enabled) return;
    const auto monitor = m_trim->monitor();
    updateSide(0, monitor.value("outgoing").toMap());
    updateSide(1, monitor.value("incoming").toMap());
}

void TrimMonitorFrames::updateSide(int index, const QVariantMap& wanted) {
    Side& side = m_sides[index];
    if (!hasPicture(wanted)) {
        cancelSide(side);
        const bool changed = !side.image.isNull() || !side.error.isEmpty();
        side.key.clear();
        side.image = {};
        side.error.clear();
        if (changed) emit framesChanged();
        return;
    }
    if (side.busy) {
        side.stale = true;
        return;
    }
    auto* model = m_capture->timeline();
    if (!model) return;
    const auto clipId = wanted.value("clipId").toString();
    const double timeMs = wanted.value("frameTimeMs").toDouble();
    const auto snapshot = nt::exporting::exportSnapshot(*model);
    QJsonArray effects;
    for (const auto& value : snapshot.value("clips").toArray()) {
        if (value.toObject().value("id").toString() == clipId) effects = value.toObject().value("effects").toArray();
    }
    const auto document = nt::colorpanel::isolatedClipDocument(snapshot, clipId, effects);
    const QByteArray key = QJsonDocument(document).toJson(QJsonDocument::Compact) + '@' + QByteArray::number(timeMs, 'g', 17);
    if (key == side.key) return;
    side.key = key;
    side.stale = false;
    side.busy = true;
    const int token = ++side.token;
    // A request refused at once calls back before it returns.
    const int requestId = m_capture->captureDocument(document, timeMs, [self = QPointer(this), index, token](const FrameCaptureResult& result) {
        if (!self) return;
        Side& done = self->m_sides[index];
        if (token != done.token) return;
        done.busy = false;
        done.requestId = 0;
        if (result.ok()) {
            done.image = result.image;
            done.error.clear();
        } else if (!result.cancelled) {
            done.error = result.error;
        }
        emit self->framesChanged();
        if (done.stale) {
            done.stale = false;
            self->update();
        }
    });
    if (side.busy && side.token == token) side.requestId = requestId;
    emit framesChanged();
}
