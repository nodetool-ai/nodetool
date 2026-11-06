#include "TimelineChatHost.h"
#include "markers/MarkerOps.h"
#include <QJsonDocument>
#include <QRegularExpression>
#include <QUndoCommand>
#include <cmath>

namespace nt::chat {
namespace {
QVariantMap failure(const QString& error) { return {{"ok", false}, {"error", error}}; }
bool resourceIdMatches(const QString& full, const QString& input) {
    static const QRegularExpression fullId(QStringLiteral("^[a-f0-9]{32}$"));
    static const QRegularExpression shortId(QStringLiteral("^[a-f0-9]{12}$"));
    return full == input || (fullId.match(full).hasMatch() && shortId.match(input).hasMatch() && full.startsWith(input));
}
QVariantMap schemaProperty(const QString& type) { return {{"type", type}}; }
// One marker added with all its fields is one undo entry.
class AddMarkerCommand : public QUndoCommand {
public:
    AddMarkerCommand(TimelineModel& model, QJsonArray before, QJsonArray after)
        : QUndoCommand(QStringLiteral("Add marker")), m_model(model), m_before(std::move(before)), m_after(std::move(after)) {}
    void redo() override { m_model.replaceMarkers(m_after); }
    void undo() override { m_model.replaceMarkers(m_before); }
private:
    TimelineModel& m_model;
    QJsonArray m_before;
    QJsonArray m_after;
};
bool isText(const QVariant& value) { return value.metaType().id() == QMetaType::QString; }
bool isNumber(const QVariant& value) {
    const auto id = value.metaType().id();
    return id == QMetaType::Double || id == QMetaType::Int || id == QMetaType::LongLong;
}
QVariantMap tool(const QString& name, const QString& description, QVariantMap properties, QStringList required) {
    properties.insert("timeline_id", schemaProperty("string"));
    required.prepend("timeline_id");
    return {{"name", name}, {"description", description}, {"parameters", QVariantMap{
        {"type", "object"}, {"properties", properties}, {"required", required}, {"additionalProperties", false}}}};
}
}
TimelineChatHost::TimelineChatHost(TimelineModel& model, PlaybackClock& clock, QObject* parent)
    : QObject(parent), m_model(model), m_clock(clock) {
    connect(&model, &TimelineModel::timelineChanged, this, &TimelineChatHost::contextChanged);
    connect(&model, &TimelineModel::markersChanged, this, &TimelineChatHost::contextChanged);
    connect(&model, &TimelineModel::documentReplaced, this, [this] { setSelection({}); });
}
void TimelineChatHost::setSelection(const QStringList& ids) {
    if (m_selection == ids) { return; }
    m_selection = ids;
    emit contextChanged();
}
QVariantMap TimelineChatHost::context() const {
    auto id = m_model.timeline().raw.value("id").toString();
    if (id.isEmpty()) id = QStringLiteral("native-local:%1").arg(m_model.documentGeneration());
    return {{"timeline_id", id}, {"name", m_model.name()}, {"selected_clip_ids", m_selection}};
}
QVariantList TimelineChatHost::tools() {
    return {
        tool("ui_timeline_get_state", "Read this native timeline, its clips, markers, playhead and selection.", {}, {}),
        tool("ui_timeline_seek", "Move this native timeline's playhead to an absolute time in milliseconds.",
             {{"timeMs", schemaProperty("number")}}, {"timeMs"}),
        tool("ui_timeline_add_marker", "Add an undoable marker to this native timeline. Supports time, label, note, color and durationMs (a range marker). The note is a review note for the editor and shows in ui_timeline_get_state.",
             {{"timeMs", schemaProperty("number")}, {"label", schemaProperty("string")}, {"note", schemaProperty("string")},
              {"color", schemaProperty("string")}, {"durationMs", schemaProperty("number")}}, {"timeMs"}),
        tool("ui_timeline_delete_marker", "Delete an undoable marker by exact id or unique case-insensitive label.",
             {{"target", schemaProperty("string")}}, {"target"})};
}
QVariantMap TimelineChatHost::execute(const QString& name, const QVariantMap& args) {
    // The current document is the host's entire authorized timeline scope.
    const auto timelineId = context().value("timeline_id").toString();
    if (args.value("timeline_id").metaType().id() != QMetaType::QString ||
        !resourceIdMatches(timelineId, args.value("timeline_id").toString())) {
        return failure("The requested timeline is not open in this native editor.");
    }
    if (name == "ui_timeline_get_state") {
        auto result = m_model.timeline().raw.toVariantMap();
        result.insert("ok", true);
        result.insert("timeline_id", timelineId);
        result.insert("playheadMs", m_clock.currentTimeMs());
        result.insert("selectedClipIds", m_selection);
        return result;
    }
    if (name == "ui_timeline_seek" || name == "ui_timeline_add_marker") {
        const auto time = args.value("timeMs");
        if (time.metaType().id() != QMetaType::Double && time.metaType().id() != QMetaType::Int &&
            time.metaType().id() != QMetaType::LongLong) {
            return failure("timeMs must be a finite number at or after zero.");
        }
        const double ms = time.toDouble();
        if (!std::isfinite(ms) || ms < 0) { return failure("timeMs must be a finite number at or after zero."); }
        if (name == "ui_timeline_seek") {
            m_clock.seek(ms);
            return {{"ok", true}, {"playheadMs", m_clock.currentTimeMs()}};
        }
        for (const char* key : {"label", "note", "color"}) {
            if (args.contains(key) && !isText(args.value(key))) { return failure(QStringLiteral("%1 must be text.").arg(key)); }
        }
        double durationMs = 0;
        if (args.contains("durationMs")) {
            if (!isNumber(args.value("durationMs")) || !std::isfinite(args.value("durationMs").toDouble()) ||
                args.value("durationMs").toDouble() < 0) {
                return failure("durationMs must be a finite number at or after zero.");
            }
            durationMs = args.value("durationMs").toDouble();
        }
        const auto before = m_model.markersJson();
        const auto id = nt::markers::newId();
        const auto after = nt::markers::add(before, {{"id", id}, {"timeMs", ms}, {"label", args.value("label").toString()},
                                                     {"note", args.value("note").toString()}, {"color", args.value("color").toString()},
                                                     {"durationMs", durationMs}, {"author", QStringLiteral("Assistant")}});
        m_model.undoStack()->push(new AddMarkerCommand(m_model, before, after));
        for (const auto& marker : m_model.markers()) {
            if (marker.toMap().value("id").toString() == id) { return {{"ok", true}, {"marker", marker}}; }
        }
        return failure("The marker command did not create a marker.");
    }
    if (name == "ui_timeline_delete_marker") {
        if (args.value("target").metaType().id() != QMetaType::QString) {
            return failure("target must be a marker id or label.");
        }
        const auto target = args.value("target").toString();
        if (target.isEmpty()) { return failure("target must be a marker id or label."); }
        QStringList matches;
        for (const auto& marker : m_model.markers()) {
            const auto row = marker.toMap();
            if (row.value("id").toString() == target) { matches = {target}; break; }
            if (resourceIdMatches(row.value("id").toString(), target) ||
                row.value("label").toString().compare(target, Qt::CaseInsensitive) == 0) {
                matches.append(row.value("id").toString());
            }
        }
        if (matches.size() != 1) { return failure("The marker target must identify exactly one marker."); }
        const bool removed = m_model.deleteMarker(matches.front());
        return {{"ok", removed}, {"deleted", removed}};
    }
    return failure("This native editor does not implement that capability.");
}
}
