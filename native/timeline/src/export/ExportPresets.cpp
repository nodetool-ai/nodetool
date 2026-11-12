// Behaviour follows FilmCraft (https://github.com/storytold/filmcraft), crates/ui-egui/src/panels/export_mode, MIT. See licenses/FilmCraft-MIT.txt.
#include "export/ExportPresets.h"
#include "app/Preferences/PreferencesSettings.h"
#include <QCryptographicHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <algorithm>

namespace {
QVariantMap deliverySettings(const QVariantMap& values) {
    auto settings = nt::exporting::toVariant(nt::exporting::settingsFromVariant(values));
    settings.remove("startMs");
    settings.remove("endMs");
    settings.remove("alpha");
    return settings;
}
QVariantMap presetMap(const nt::exporting::ExportPreset& preset) {
    auto map = deliverySettings(nt::exporting::toVariant(preset.settings));
    map.insert("id", preset.id);
    map.insert("name", preset.name);
    map.insert("description", preset.description);
    map.insert("builtin", preset.builtin);
    return map;
}
QString userId(const QString& name) {
    return QStringLiteral("user-") + QString::fromLatin1(
        QCryptographicHash::hash(name.toLower().toUtf8(), QCryptographicHash::Sha256).toHex().first(12));
}
}
namespace nt::exporting {
std::vector<ExportPreset> builtinExportPresets() {
    return {
        {"match", "Match timeline", "Same size and frame rate as the timeline.", true, {}},
        {"landscape-1080p", "1080p landscape", "Full HD, 16:9.", true, Settings{.width = 1920, .height = 1080}},
        {"vertical-9x16", "Vertical 9:16", "For phones, reels and shorts.", true, Settings{.width = 1080, .height = 1920}},
        {"square-1x1", "Square", "For feed posts.", true, Settings{.width = 1080, .height = 1080}},
        {"review-720p", "Small review copy", "A light file to send for feedback.", true,
            Settings{.width = 1280, .height = 720, .videoBitrateKbps = 2500}},
        {"audio-wav", "Audio only (WAV)", "The mixdown as a 16-bit WAV.", true, Settings{.format = QStringLiteral("wav")}},
        {"audio-wav-24", "Full mix (24-bit WAV)", "The mixdown as a 24-bit WAV, for mastering and music delivery.", true,
            Settings{.format = QStringLiteral("wav"), .audioBitDepth = 24}}
    };
}
}
ExportPresets::ExportPresets(QObject* parent)
    : QObject(parent), m_settings(nt::app::openTimelinePreferences()), m_presets(nt::exporting::builtinExportPresets()) {
    const auto users = QJsonDocument::fromJson(m_settings->value("export/userPresets").toString().toUtf8()).array();
    for (const auto& value : users) {
        const auto map = value.toObject().toVariantMap();
        const auto name = map.value("name").toString().trimmed();
        if (name.isEmpty()) { continue; }
        const auto existing = std::find_if(m_presets.begin(), m_presets.end(), [&](const auto& p) {
            return p.name.compare(name, Qt::CaseInsensitive) == 0;
        });
        if (existing != m_presets.end() && existing->builtin) { continue; }
        nt::exporting::ExportPreset preset{userId(name), name, map.value("description").toString(), false,
            nt::exporting::settingsFromVariant(deliverySettings(map))};
        if (existing == m_presets.end()) { m_presets.push_back(std::move(preset)); }
        else { *existing = std::move(preset); }
    }
    const auto last = m_settings->value("export/lastPreset", "match").toString();
    if (!preset(last).isEmpty()) { m_lastPresetId = last; }
    const auto stored = QJsonDocument::fromJson(m_settings->value("export/lastSettings").toString().toUtf8());
    m_lastSettings = deliverySettings(stored.isObject() ? stored.object().toVariantMap() : settingsFor("match"));
}
QVariantList ExportPresets::presets() const {
    QVariantList result;
    for (const auto& preset : m_presets) { result.append(presetMap(preset)); }
    return result;
}
void ExportPresets::setLastPresetId(const QString& id) {
    if (m_lastPresetId == id || preset(id).isEmpty()) { return; }
    m_lastPresetId = id;
    m_settings->setValue("export/lastPreset", id);
    m_settings->sync();
    emit lastPresetIdChanged();
}
void ExportPresets::setLastSettings(const QVariantMap& settings) {
    const auto normal = deliverySettings(settings);
    if (normal == m_lastSettings) { return; }
    m_lastSettings = normal;
    m_settings->setValue("export/lastSettings", QString::fromUtf8(
        QJsonDocument(QJsonObject::fromVariantMap(normal)).toJson(QJsonDocument::Compact)));
    m_settings->sync();
    emit lastSettingsChanged();
}
QVariantMap ExportPresets::preset(const QString& id) const {
    const auto found = std::find_if(m_presets.begin(), m_presets.end(), [&](const auto& p) { return p.id == id; });
    return found == m_presets.end() ? QVariantMap{} : presetMap(*found);
}
QVariantMap ExportPresets::settingsFor(const QString& id) const {
    const auto found = std::find_if(m_presets.begin(), m_presets.end(), [&](const auto& p) { return p.id == id; });
    return found == m_presets.end() ? QVariantMap{} : nt::exporting::toVariant(found->settings);
}
QString ExportPresets::saveUserPreset(const QString& name, const QVariantMap& settings) {
    const auto trimmed = name.trimmed();
    if (trimmed.isEmpty()) { return {}; }
    const auto existing = std::find_if(m_presets.begin(), m_presets.end(), [&](const auto& p) {
        return p.name.compare(trimmed, Qt::CaseInsensitive) == 0;
    });
    if (existing != m_presets.end() && existing->builtin) { return {}; }
    const auto id = userId(trimmed);
    nt::exporting::ExportPreset user{id, trimmed, {}, false, nt::exporting::settingsFromVariant(deliverySettings(settings))};
    if (existing == m_presets.end()) { m_presets.push_back(std::move(user)); }
    else { *existing = std::move(user); }
    savePresets();
    emit presetsChanged();
    return id;
}
bool ExportPresets::removeUserPreset(const QString& id) {
    const auto found = std::find_if(m_presets.begin(), m_presets.end(), [&](const auto& p) { return p.id == id && !p.builtin; });
    if (found == m_presets.end()) { return false; }
    m_presets.erase(found);
    savePresets();
    if (m_lastPresetId == id) { setLastPresetId("match"); }
    emit presetsChanged();
    return true;
}
QString ExportPresets::idForSettings(const QVariantMap& settings) const {
    const auto normal = deliverySettings(settings);
    for (const auto& preset : m_presets) {
        if (deliverySettings(nt::exporting::toVariant(preset.settings)) == normal) { return preset.id; }
    }
    return {};
}
void ExportPresets::savePresets() {
    QJsonArray users;
    for (const auto& preset : m_presets) {
        if (!preset.builtin) { users.append(QJsonObject::fromVariantMap(presetMap(preset))); }
    }
    m_settings->setValue("export/userPresets", QString::fromUtf8(QJsonDocument(users).toJson(QJsonDocument::Compact)));
    m_settings->sync();
}
