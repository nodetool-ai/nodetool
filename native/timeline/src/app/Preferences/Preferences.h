#pragma once
#include "PreferencesSettings.h"
#include "server/ServerSource.h"
#include <QObject>
#include <QPointer>
#include <QQuickItem>
#include <QSettings>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>
#include <memory>

class ClipGestureController;

namespace nt::app {
class Preferences : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QString keyboardLayout READ keyboardLayout WRITE setKeyboardLayout NOTIFY changed)
    Q_PROPERTY(QString cacheFolder READ cacheFolder WRITE setCacheFolder NOTIFY changed)
    Q_PROPERTY(qint64 cacheBudgetMb READ cacheBudgetMb WRITE setCacheBudgetMb NOTIFY changed)
    Q_PROPERTY(QString decoderMode READ decoderMode WRITE setDecoderMode NOTIFY changed)
    Q_PROPERTY(QString audioDevice READ audioDevice WRITE setAudioDevice NOTIFY changed)
    Q_PROPERTY(QString themePreference READ themePreference WRITE setThemePreference NOTIFY changed)
    Q_PROPERTY(double uiScale READ uiScale WRITE setUiScale NOTIFY changed)
    Q_PROPERTY(double textScale READ textScale WRITE setTextScale NOTIFY changed)
    Q_PROPERTY(QString motionPreference READ motionPreference WRITE setMotionPreference NOTIFY changed)
    Q_PROPERTY(QString systemScheme READ systemScheme NOTIFY systemSchemeChanged)
    Q_PROPERTY(bool reducedMotion READ reducedMotion NOTIFY changed)
    Q_PROPERTY(QVariantList recentTimelines READ recentTimelines NOTIFY recentTimelinesChanged)
    Q_PROPERTY(QVariantList playbackDevices READ playbackDevices NOTIFY devicesChanged)
public:
    explicit Preferences(QObject* parent = nullptr);
    QString keyboardLayout() const;
    QString cacheFolder() const;
    qint64 cacheBudgetMb() const;
    QString decoderMode() const;
    QString audioDevice() const;
    QString themePreference() const;
    double uiScale() const;
    double textScale() const;
    QString motionPreference() const;
    QString systemScheme() const;
    bool reducedMotion() const;
    void setKeyboardLayout(const QString& value);
    void setCacheFolder(const QString& value);
    void setCacheBudgetMb(qint64 value);
    void setDecoderMode(const QString& value);
    void setAudioDevice(const QString& value);
    void setThemePreference(const QString& value);
    void setUiScale(double value);
    void setTextScale(double value);
    void setMotionPreference(const QString& value);
    QVariantList playbackDevices() const { return m_devices; }
    Q_INVOKABLE void refreshDevices();
    QVariantList recentTimelines() const;
    void addRecentFile(const QString& label, const QString& path);
    void addRecentServer(const QString& label, const nt::server::SaveTarget& target);
    Q_INVOKABLE void clearRecentTimelines();
    bool hasCacheFolder() const;
    bool hasCacheBudget() const;
signals:
    void changed();
    void devicesChanged();
    void recentTimelinesChanged();
    void systemSchemeChanged();
private:
    void write(const QString& key, const QVariant& value);
    void addRecent(QVariantMap entry);
    void writeRecent(const QVariantList& entries);
    std::unique_ptr<QSettings> m_settings;
    QVariantList m_devices;
};
void applyCachePreferences(const Preferences& preferences);
QStringList recentTimelineArguments(const QVariantMap& entry);
bool interactiveTimelineRun(const QStringList& arguments);
bool recordOpenedTimeline(Preferences& preferences, const QStringList& arguments, bool active,
                          const QString& label, const std::optional<nt::server::SaveTarget>& target = std::nullopt);

class ShellPreferences : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QQuickItem* anchor READ anchor WRITE setAnchor NOTIFY anchorChanged)
    Q_PROPERTY(bool dialogOpen READ dialogOpen WRITE setDialogOpen NOTIFY dialogOpenChanged)
    Q_PROPERTY(Preferences* store READ store WRITE setStore NOTIFY storeChanged)
public:
    explicit ShellPreferences(QObject* parent = nullptr);
    QQuickItem* anchor() const { return m_anchor; }
    void setAnchor(QQuickItem* item);
    Preferences* store() const { return m_store; }
    void setStore(Preferences* store);
    bool dialogOpen() const { return m_dialogOpen; }
    void setDialogOpen(bool open);
    Q_INVOKABLE void bind();
    Q_INVOKABLE void restoreEditorFocus();
signals:
    void anchorChanged();
    void storeChanged();
    void dialogOpenChanged();
    void closePreferencesRequested();
protected:
    bool eventFilter(QObject* watched, QEvent* event) override;
private:
    bool m_dialogOpen = false;
    void recordActiveTimeline();
    QPointer<QQuickWindow> m_window;
    bool m_recorded = false;
    QPointer<QQuickItem> m_anchor;
    QPointer<Preferences> m_store;
    QList<QPointer<ClipGestureController>> m_controllers;
};
}
