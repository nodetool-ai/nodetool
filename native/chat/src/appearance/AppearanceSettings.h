#pragma once

#include <QObject>
#include <QSettings>
#include <memory>

namespace nt::chat {
class AppearanceSettings : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString themePreference READ themePreference WRITE setThemePreference NOTIFY changed)
    Q_PROPERTY(double uiScale READ uiScale WRITE setUiScale NOTIFY changed)
    Q_PROPERTY(double textScale READ textScale WRITE setTextScale NOTIFY changed)
    Q_PROPERTY(QString motionPreference READ motionPreference WRITE setMotionPreference NOTIFY changed)
    Q_PROPERTY(QString systemScheme READ systemScheme NOTIFY systemSchemeChanged)
    Q_PROPERTY(bool reducedMotion READ reducedMotion NOTIFY changed)
public:
    explicit AppearanceSettings(QObject* parent = nullptr);
    explicit AppearanceSettings(QSettings& settings, QObject* parent = nullptr);
    QString themePreference() const;
    double uiScale() const;
    double textScale() const;
    QString motionPreference() const;
    QString systemScheme() const;
    bool reducedMotion() const;
    void setThemePreference(const QString& value);
    void setUiScale(double value);
    void setTextScale(double value);
    void setMotionPreference(const QString& value);
signals:
    void changed();
    void systemSchemeChanged();
private:
    void write(const QString& key, const QVariant& value);
    void watchSystemScheme();
    std::unique_ptr<QSettings> m_ownedSettings;
    QSettings* m_settings;
};
}
