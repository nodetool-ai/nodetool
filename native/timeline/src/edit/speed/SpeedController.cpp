#include "SpeedController.h"
#include "app/EditRegistry.h"
#include "scene/Animation.h"
#include <QJsonDocument>
#include <QRegularExpression>
#include <array>
#include <cmath>

void SpeedController::setModel(TimelineModel* model) {
    if (m_model == model) {
        return;
    }
    if (m_model) {
        disconnect(m_model, nullptr, this, nullptr);
    }
    m_before = {};
    m_model = model;
    m_gesture = false;
    if (model) {
        connect(model, &TimelineModel::clipsChanged, this, &SpeedController::documentChanged);
        connect(model, &TimelineModel::timelineChanged, this, &SpeedController::documentChanged);
        connect(model, &TimelineModel::documentReplaced, this, [this] { m_before = {}; });
    }
    emit modelChanged();
    emit documentChanged();
}
QVariantMap SpeedController::document() const {
    return m_model ? QJsonDocument::fromJson(m_model->documentJson()).object().toVariantMap() : QVariantMap{};
}
bool SpeedController::apply(const QString& action, const QJsonObject& payload) {
    return m_model && m_model->applyEdit(action, payload);
}
void SpeedController::beginGesture(const QString& action, const QJsonObject& payload) {
    if (!m_model) {
        return;
    }
    m_before = QJsonDocument::fromJson(m_model->documentJson()).object();
    m_generation = m_model->documentGeneration();
    m_gesture = true;
    m_action = action;
    m_payload = payload;
}
void SpeedController::preview(const QJsonObject& payload) {
    if (!m_model || m_before.isEmpty() || m_generation != m_model->documentGeneration()) {
        return;
    }
    auto merged = m_payload;
    for (const auto& key : {QString("speedMultiplier"), QString("patch")}) {
        if (payload.contains(key)) {
            merged.insert(key, payload.value(key));
        }
    }
    const auto edit = nt::app::findEdit(m_action);
    if (edit) {
        m_model->replaceClips(edit(m_before, merged).value("clips").toArray());
    }
}
void SpeedController::commit(const QString& action, const QJsonObject& payload) {
    if (!m_model) {
        return;
    }
    if (!m_gesture) {
        apply(action, payload);
        return;
    }
    m_gesture = false;
    if (m_before.isEmpty() || m_generation != m_model->documentGeneration()) {
        m_before = {};
        return;
    }
    preview(payload);
    const auto before = m_before.value("clips").toArray();
    m_before = {};
    m_model->commitEdit(m_action, before, m_model->clipsJson());
}
bool SpeedController::easingReadable(const QString& easing) const {
    return nt::scene::isKnownEasing(easing.toStdString());
}
QVariant SpeedController::parseDuration(const QString& text, double fps, double currentMs) const {
    auto body = text.trimmed();
    int sign = 0;
    if (body.startsWith('+') || body.startsWith('-')) {
        sign = body.startsWith('+') ? 1 : -1;
        body = body.mid(1).trimmed();
    }
    static const QRegularExpression digits("^[0-9]+$");
    static const QRegularExpression separated("^[0-9]+([:;.][0-9]+){1,3}$");
    QStringList fields;
    if (digits.match(body).hasMatch()) {
        while (body.size() > 2 && fields.size() < 3) {
            fields.prepend(body.right(2));
            body.chop(2);
        }
        fields.prepend(body);
    } else if (separated.match(body).hasMatch()) {
        fields = body.split(QRegularExpression("[:;.]"));
    } else {
        return {};
    }
    double total = 0;
    const double nominal = std::max(1.0, std::round(fps));
    const std::array<double, 4> factors{1, nominal, nominal * 60, nominal * 3600};
    for (qsizetype i = 0; i < fields.size(); ++i) {
        total += fields[fields.size() - i - 1].toDouble() * factors[static_cast<size_t>(i)];
    }
    const double ms = std::floor(total * 1000 / std::max(1.0, fps) + 0.5);
    return std::max(0.0, sign == 0 ? ms : currentMs + sign * ms);
}
