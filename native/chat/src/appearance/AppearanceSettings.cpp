#include "AppearanceSettings.h"

#include <QGuiApplication>
#include <QStyleHints>
#include <cmath>

namespace nt::chat {
namespace {
QString validChoice(const QVariant& stored, const QStringList& choices, const QString& fallback) {
    const auto value = stored.toString();
    return choices.contains(value) ? value : fallback;
}
double validScale(const QVariant& stored, double minimum) {
    bool ok = false;
    const double value = stored.toDouble(&ok);
    return ok && std::isfinite(value) && value >= minimum && value <= 2.0 ? value : 1.0;
}
}
AppearanceSettings::AppearanceSettings(QObject* parent)
    : QObject(parent), m_ownedSettings(std::make_unique<QSettings>("NodeTool", "Chat")), m_settings(m_ownedSettings.get()) {
    watchSystemScheme();
}
AppearanceSettings::AppearanceSettings(QSettings& settings, QObject* parent)
    : QObject(parent), m_settings(&settings) {
    watchSystemScheme();
}
void AppearanceSettings::watchSystemScheme() {
    if (auto* hints = QGuiApplication::styleHints()) {
        connect(hints, &QStyleHints::colorSchemeChanged, this, &AppearanceSettings::systemSchemeChanged);
    }
}
QString AppearanceSettings::themePreference() const {
    return validChoice(m_settings->value("appearance/themePreference", "System"), {"System", "Dark", "Light"}, "System");
}
double AppearanceSettings::uiScale() const { return validScale(m_settings->value("appearance/uiScale", 1.0), 0.75); }
double AppearanceSettings::textScale() const { return validScale(m_settings->value("appearance/textScale", 1.0), 1.0); }
QString AppearanceSettings::motionPreference() const {
    return validChoice(m_settings->value("appearance/motionPreference", "System"), {"System", "Reduce", "Full"}, "System");
}
QString AppearanceSettings::systemScheme() const {
    const auto scheme = QGuiApplication::styleHints()->colorScheme();
    if (scheme == Qt::ColorScheme::Dark) return "Dark";
    if (scheme == Qt::ColorScheme::Light) return "Light";
    return "Unknown";
}
bool AppearanceSettings::reducedMotion() const {
    // Qt does not expose an OS reduced-motion preference on all supported platforms.
    return motionPreference() == "Reduce";
}
void AppearanceSettings::write(const QString& key, const QVariant& value) {
    if (m_settings->value(key) == value) return;
    m_settings->setValue(key, value);
    m_settings->sync();
    emit changed();
}
void AppearanceSettings::setThemePreference(const QString& value) {
    if (QStringList{"System", "Dark", "Light"}.contains(value)) write("appearance/themePreference", value);
}
void AppearanceSettings::setUiScale(double value) {
    if (std::isfinite(value) && value >= 0.75 && value <= 2.0) write("appearance/uiScale", value);
}
void AppearanceSettings::setTextScale(double value) {
    if (std::isfinite(value) && value >= 1.0 && value <= 2.0) write("appearance/textScale", value);
}
void AppearanceSettings::setMotionPreference(const QString& value) {
    if (QStringList{"System", "Reduce", "Full"}.contains(value)) write("appearance/motionPreference", value);
}
}
