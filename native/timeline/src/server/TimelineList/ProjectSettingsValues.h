#pragma once
#include "model/TimelineModel.h"
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
};
