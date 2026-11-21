#pragma once
#include "model/TimelineModel.h"
#include "music/MusicPlan.h"
#include <QJsonDocument>
#include <QtQmlIntegration/qqmlintegration.h>

class ProjectSettingsValues : public QObject {
    Q_OBJECT
    QML_ELEMENT
public:
    explicit ProjectSettingsValues(QObject* parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE QVariantMap read(TimelineModel* model) const {
        return model ? QJsonDocument::fromJson(model->documentJson()).object().toVariantMap() : QVariantMap{};
    }
    // Why setProjectSettings would refuse `tempo` (MD6 tempo lock, MD9 music
    // tempo), or an empty string.
    Q_INVOKABLE QString tempoRefusal(TimelineModel* model, const QVariantMap& tempo) const {
        return model ? nt::music::tempoChangeRefusal(QJsonDocument::fromJson(model->documentJson()).object(),
                                                     QJsonObject::fromVariantMap(tempo))
                     : QString();
    }
};
