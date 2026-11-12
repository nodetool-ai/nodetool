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
    // The effect mask the Program monitor overlay edits. `maskPen` adds vertices on click.
    Q_PROPERTY(QString maskClipId READ maskClipId NOTIFY maskSelectionChanged)
    Q_PROPERTY(QString maskEffectId READ maskEffectId NOTIFY maskSelectionChanged)
    Q_PROPERTY(QString maskId READ maskId NOTIFY maskSelectionChanged)
    Q_PROPERTY(bool maskPen READ maskPen NOTIFY maskSelectionChanged)
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
    QString maskClipId() const { return m_maskClipId; }
    QString maskEffectId() const { return m_maskEffectId; }
    QString maskId() const { return m_maskId; }
    bool maskPen() const { return m_maskPen; }
    Q_INVOKABLE void selectMask(const QString& clipId, const QString& effectId, const QString& maskId, bool pen = false) {
        if (clipId == m_maskClipId && effectId == m_maskEffectId && maskId == m_maskId && pen == m_maskPen) { return; }
        m_maskClipId = clipId;
        m_maskEffectId = effectId;
        m_maskId = maskId;
        m_maskPen = pen;
        emit maskSelectionChanged();
    }
    Q_INVOKABLE void clearMaskSelection() { selectMask({}, {}, {}, false); }
signals:
    void foldsChanged();
    void maskSelectionChanged();
private:
    QString m_maskClipId, m_maskEffectId, m_maskId;
    bool m_maskPen = false;
    std::unique_ptr<QSettings> m_settings;
    QVariantMap m_folds;
};
