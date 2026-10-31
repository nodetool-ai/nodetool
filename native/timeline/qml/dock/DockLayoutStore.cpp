#include "DockLayoutStore.h"
#include "app/Preferences/PreferencesSettings.h"
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDebug>
#include <algorithm>
#include <cmath>

namespace { const QString preferencesKey = QStringLiteral("nodetool.timeline-layout.v1"); }
DockLayoutStore::DockLayoutStore(QObject* parent) : QObject(parent) {
    QFile script(":/qt/qml/NodeTool/Timeline/qml/dock/DockLayout.js");
    if (!script.open(QIODevice::ReadOnly)) { qFatal("Cannot load timeline dock model"); }
    const auto loaded = m_engine.evaluate(QString::fromUtf8(script.readAll()).replace(".pragma library", ""), script.fileName());
    if (loaded.isError()) { qFatal("Cannot evaluate timeline dock model: %s", qPrintable(loaded.toString())); }
    const auto saved = QJsonDocument::fromJson(nt::app::openTimelinePreferences()->value(preferencesKey).toByteArray()).object();
    const auto name = saved.value("workspace").toString();
    if (workspaces().contains(name)) { m_workspace = name; }
    m_workspaces = saved.value("workspaces").toObject().toVariantMap();
    m_layout = m_workspaces.contains(m_workspace)
        ? call("hydrate", {m_workspaces.value(m_workspace)}) : call("createLayout", {m_workspace});
}
QVariantMap DockLayoutStore::call(const QString& name, const QVariantList& args) {
    // JSON avoids QVariant sequence wrappers at the pure-JS model boundary.
    const auto json = QJsonDocument::fromVariant(args).toJson(QJsonDocument::Compact);
    const auto values = m_engine.evaluate("(" + QString::fromUtf8(json) + ")");
    QJSValueList arguments;
    for (quint32 i = 0; i < values.property("length").toUInt(); ++i) { arguments.append(values.property(i)); }
    const auto result = m_engine.globalObject().property(name).call(arguments);
    if (result.isError()) { qWarning().noquote() << "Dock:" << result.toString(); return {}; }
    return result.toVariant().toMap();
}
QVariantMap DockLayoutStore::withScriptPanelSelected(const QVariantMap& layout) {
    const bool hasScript = std::any_of(m_panels.cbegin(), m_panels.cend(), [](const QVariant& panel) {
        return panel.toMap().value("id") == QStringLiteral("script");
    });
    if (!hasScript) return layout;
    const auto selected = call("transition", {layout, QVariantMap{{"type", "reveal"}, {"panelId", "script"}}});
    return selected.isEmpty() ? layout : selected;
}
void DockLayoutStore::persist() {
    m_workspaces.insert(m_workspace, m_layout);
    const QJsonObject value{{"workspace", m_workspace}, {"workspaces", QJsonObject::fromVariantMap(m_workspaces)}};
    auto settings = nt::app::openTimelinePreferences();
    settings->setValue(preferencesKey, QJsonDocument(value).toJson(QJsonDocument::Compact));
    settings->sync();
}
bool DockLayoutStore::dispatch(const QVariantMap& action) {
    const auto type = action.value("type").toString();
    if (m_resizeStart && type != "resize" && type != "resizeGroups") { finishResize(true); }
    const auto next = call("transition", {m_layout, action});
    if (next.isEmpty() || next == m_layout) { return false; }
    m_layout = next;
    if (!m_resizeStart) { persist(); }
    emit changed();
    return true;
}
void DockLayoutStore::registerPanels(const QVariantList& panels) {
    finishResize(true);
    m_panels = panels;
    const auto next = call("registerMissingPanels", {m_layout, panels});
    if (next.isEmpty() || next == m_layout) { return; }
    m_layout = m_workspace == "Script" && !m_workspaces.contains(m_workspace)
        ? withScriptPanelSelected(next) : next;
    emit changed();
}
void DockLayoutStore::switchWorkspace(int index) {
    if (index < 0 || index >= workspaces().size()) { return; }
    finishResize(true);
    m_workspaces.insert(m_workspace, m_layout);
    const auto name = workspaces()[index];
    const bool saved = m_workspaces.contains(name);
    const auto next = saved ? call("hydrate", {m_workspaces.value(name)})
        : call("presetWithExtensions", {m_layout, name});
    m_workspace = name;
    m_layout = call("registerMissingPanels", {next, m_panels});
    if (name == "Script" && !saved) m_layout = withScriptPanelSelected(m_layout);
    ++m_epoch;
    persist();
    emit changed();
}
void DockLayoutStore::resetWorkspace() {
    finishResize(true);
    m_layout = call("presetWithExtensions", {m_layout, m_workspace});
    m_layout = call("registerMissingPanels", {m_layout, m_panels});
    if (m_workspace == "Script") m_layout = withScriptPanelSelected(m_layout);
    ++m_epoch;
    persist();
    emit changed();
}
QVariantMap DockLayoutStore::displaySizes(double width, double height, const QVariantMap& sizes) const {
    const double widthMaximum = std::max(100.0, std::min(1600.0, width / 3));
    const double bottomMaximum = std::max(80.0, std::min(1000.0, height * 0.75));
    return {{"left", std::min(sizes.value("left").toDouble(), widthMaximum)},
            {"right", std::min(sizes.value("right").toDouble(), widthMaximum)},
            {"bottom", std::min(sizes.value("bottom").toDouble(), bottomMaximum)}};
}
void DockLayoutStore::resizeRegion(const QString& region, double size, double width, double height) {
    if (!std::isfinite(size) || !std::isfinite(width) || !std::isfinite(height)) { return; }
    if (region != "left" && region != "right" && region != "bottom") { return; }
    const bool bottom = region == "bottom";
    const double minimum = bottom ? 80.0 : 100.0;
    const double maximum = std::max(minimum, std::min(bottom ? 1000.0 : 1600.0, bottom ? height * 0.75 : width / 3));
    dispatch({{"type", "resize"}, {"region", region}, {"size", std::clamp(size, minimum, maximum)}});
}
void DockLayoutStore::beginResize() {
    if (!m_resizeStart) { m_resizeStart = m_layout; }
}
void DockLayoutStore::finishResize(bool canceled) {
    if (!m_resizeStart) { return; }
    const auto initial = std::move(*m_resizeStart);
    m_resizeStart.reset();
    if (initial == m_layout) { return; }
    if (canceled) { m_layout = initial; emit changed(); }
    else { persist(); }
}
