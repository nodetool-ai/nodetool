#pragma once
#include "app/Preferences/PreferencesSettings.h"
#include <QObject>
#include <QUuid>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class ClipEffectsUi : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(QVariantMap folds READ folds NOTIFY foldsChanged)
public:
    explicit ClipEffectsUi(QObject* parent = nullptr) : QObject(parent), m_settings(nt::app::openTimelinePreferences()) {
        m_folds = m_settings->value("inspector/folds").toMap();
    }
    QVariantMap folds() const { return m_folds; }
    Q_INVOKABLE QString newId() const { return QUuid::createUuid().toString(QUuid::WithoutBraces); }
    Q_INVOKABLE void setFold(const QString& key, bool open) {
        if (m_folds.contains(key) && m_folds.value(key).toBool() == open) { return; }
        m_folds.insert(key, open);
        m_settings->setValue("inspector/folds", m_folds);
        m_settings->sync();
        emit foldsChanged();
    }
signals:
    void foldsChanged();
private:
    std::unique_ptr<QSettings> m_settings;
    QVariantMap m_folds;
};
