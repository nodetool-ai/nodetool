#include "aiassist/AssistantCommands.h"
#include "aiassist/AssistDocument.h"
#include "aiassist/AssistantCommandTable.h"
#include "app/EditRegistry.h"
#include "app/MenuRegistry.h"
#include "color/ScopeNumbers.h"
#include "colorpanel/ScopesController.h"
#include "edit/ClipGestureController.h"
#include "export/FrameCapture.h"
#include "ui/TimelineViewState.h"
#include "wiring/KeyActions.h"
#include "wiring/SourceDurations.h"
#include "wiring/w/SceneItems.h"
#include <QBuffer>
#include <QJsonArray>
#include <QRegularExpression>
#include <QUndoStack>
#include <QVariantList>
#include <algorithm>
#include <cmath>
#include <optional>

namespace nt::aiassist {
namespace {
using commands::Command;
using commands::Param;
using commands::ParamKind;
using commands::Runs;

constexpr int DEFAULT_FRAME_WIDTH = 640;
constexpr int MIN_FRAME_WIDTH = 16;
constexpr int MAX_FRAME_WIDTH = 1920;
constexpr int FRAME_JPEG_QUALITY = 85;

// One undo entry for a command that pushed several.
[[maybe_unused]] const bool foldedRegistered = app::registerEdit("assistant.foldedCommand", [](QJsonObject, const QJsonObject& payload) { return payload.value("document").toObject(); });

QJsonObject failure(const QString& error) { return {{"ok", false}, {"error", error}}; }
QString stripped(QString label) {
    label.remove(u'…');
    return label;
}
const Command* findAllowed(const QString& id) {
    const auto& table = commands::allowedCommands();
    const auto found = std::find_if(table.begin(), table.end(), [&](const Command& command) { return command.id == id; });
    return found == table.end() ? nullptr : &*found;
}
const app::ShellMenuEntry* shellEntry(const QString& id) {
    for (const auto& entry : app::shellMenuEntries()) {
        if (entry.action == id) { return &entry; }
    }
    return nullptr;
}
QString labelOf(const Command& command) {
    if (!command.label.isEmpty()) { return command.label; }
    if (const auto* entry = shellEntry(command.id)) {
        // A submenu item's label ("Green") means little without its submenu.
        if (entry->submenu.isEmpty()) { return stripped(entry->label); }
    }
    for (const auto& action : wiring::keyActions()) {
        if (action.name == command.id) { return action.label; }
    }
    if (const auto* entry = shellEntry(command.id)) { return entry->submenu + " > " + stripped(entry->label); }
    return command.id;
}
QVariantMap menuContext(ClipGestureController& gestures) {
    return {{"kind", "shell"},
            {"gestures", QVariant::fromValue<QObject*>(&gestures)},
            {"timeline", QVariant::fromValue<QObject*>(gestures.timeline())}};
}
// The reason a command can't run now, or empty. The command's own need goes first, then what its
// menu bar entry asks of a person.
QString blockedReason(const Command& command, ClipGestureController& gestures, const QVariantMap& context) {
    if (command.need) {
        if (const auto reason = command.need(gestures); !reason.isEmpty()) { return reason; }
    }
    if (command.runs == Runs::Action) {
        if (const auto* entry = shellEntry(command.id); entry && entry->enabled && !entry->enabled(context)) {
            return entry->disabledReason.isEmpty() ? QStringLiteral("It can't run in the current state.") : entry->disabledReason;
        }
    }
    return {};
}
QJsonObject parameterSchema(const Param& param) {
    QJsonObject schema;
    const auto strings = QJsonObject{{"type", "array"}, {"items", QJsonObject{{"type", "string"}}}};
    switch (param.kind) {
    case ParamKind::Selection:
    case ParamKind::ClipIds:
    case ParamKind::TrackIds:
    case ParamKind::MarkerIds:
        schema = strings;
        break;
    case ParamKind::Playhead:
    case ParamKind::RangeIn:
    case ParamKind::RangeOut:
    case ParamKind::GapTime:
    case ParamKind::ContextTime:
    case ParamKind::Number:
        schema = {{"type", "number"}};
        if (std::isfinite(param.min)) { schema.insert("minimum", param.min); }
        if (std::isfinite(param.max)) { schema.insert("maximum", param.max); }
        break;
    case ParamKind::Boolean:
        schema = {{"type", "boolean"}};
        break;
    case ParamKind::Patch:
    case ParamKind::NumberPatch:
        schema = {{"type", "object"}};
        if (!param.choices.isEmpty()) { schema.insert("fields", QJsonArray::fromStringList(param.choices)); }
        break;
    default:
        schema = {{"type", "string"}};
        if (!param.choices.isEmpty()) { schema.insert("enum", QJsonArray::fromStringList(param.choices)); }
        break;
    }
    if (!param.description.isEmpty()) { schema.insert("description", param.description); }
    return schema;
}
QJsonObject commandEntry(const Command& command, ClipGestureController& gestures) {
    QJsonObject entry{{"id", command.id}, {"label", labelOf(command)}};
    const auto reason = blockedReason(command, gestures, menuContext(gestures));
    entry.insert("enabled", reason.isEmpty());
    if (!reason.isEmpty()) { entry.insert("disabledReason", reason); }
    if (!command.params.isEmpty()) {
        QJsonObject properties;
        QJsonArray required;
        for (const auto& param : command.params) {
            properties.insert(param.name, parameterSchema(param));
            if (param.required) { required.append(param.name); }
        }
        QJsonObject parameters{{"properties", properties}};
        if (!required.isEmpty()) { parameters.insert("required", required); }
        entry.insert("parameters", parameters);
    }
    return entry;
}

// Resolves an id the model passed against the ids in the document: exact, or a unique 12-character
// short id. The message says what to do about a miss.
struct Resolved {
    QString id;
    QString error;
};
Resolved resolveResource(const QString& input, const QStringList& ids, const QString& noun) {
    if (const auto match = resolveId(input, ids)) { return {*match, {}}; }
    static const QRegularExpression shortId(QStringLiteral("^[0-9a-f]{12}$"));
    if (shortId.match(input).hasMatch() && std::ranges::count_if(ids, [&](const QString& id) { return id.startsWith(input); }) > 1) {
        return {{}, QStringLiteral("%1 %2 matches more than one %3. Pass the full id.").arg(noun, input, noun.toLower())};
    }
    return {{}, QStringLiteral("%1 %2 is not on this timeline. Read ui_timeline_get_state and pass its id.").arg(noun, input)};
}
QStringList idsIn(const QJsonArray& rows) {
    QStringList ids;
    ids.reserve(rows.size());
    for (const auto& row : rows) { ids.append(row.toObject().value("id").toString()); }
    return ids;
}
// A value that names a file or a URL, directly or in a nested object. Patches may not carry one, so
// they can't point a clip at something the Assistant shouldn't read. A text style's words are text.
bool namesLocation(const QJsonValue& value) {
    if (value.isString()) {
        const auto text = value.toString().trimmed();
        return text.contains(u"://") || text.startsWith(u'/') || text.startsWith(u'\\') || text.startsWith(u"file:", Qt::CaseInsensitive) ||
            text.startsWith(u"data:", Qt::CaseInsensitive) || text.startsWith(u"asset:", Qt::CaseInsensitive) || (text.size() > 2 && text[1] == u':' && text[0].isLetter());
    }
    if (value.isArray()) {
        const auto items = value.toArray();
        return std::any_of(items.begin(), items.end(), namesLocation);
    }
    if (value.isObject()) {
        const auto object = value.toObject();
        static const QRegularExpression field(QStringLiteral("(url|uri|path|src|file|asset)"), QRegularExpression::CaseInsensitiveOption);
        for (auto it = object.begin(); it != object.end(); ++it) {
            if (it.key() != u"text" && (field.match(it.key()).hasMatch() || namesLocation(it.value()))) { return true; }
        }
    }
    return false;
}

// Patch fields that show as words, so a URL in one reaches nothing.
const QStringList plainTextFields{"name", "speaker", "label", "note", "color", "labelColor"};

// The parameters of one call, checked before anything changes.
struct Prepared {
    std::optional<QStringList> selection;
    QString editClip;
    QString editEdge;
    std::optional<double> playhead;
    std::optional<double> rangeIn;
    std::optional<double> rangeOut;
    QString gapTrack;
    std::optional<double> gapTime;
    QVariantMap context;
    QJsonObject payload;
    QString error;
};
Prepared prepare(const Command& command, const QJsonObject& params, const QJsonObject& raw, const QJsonArray& markers) {
    Prepared out;
    for (auto it = params.begin(); it != params.end(); ++it) {
        if (std::ranges::none_of(command.params, [&](const Param& param) { return param.name == it.key(); })) {
            QStringList names;
            for (const auto& param : command.params) { names.append(param.name); }
            out.error = QStringLiteral("%1 does not take %2. Its parameters: %3.").arg(command.id, it.key(), names.isEmpty() ? QStringLiteral("none") : names.join(", "));
            return out;
        }
    }
    const auto clipIds = idsIn(raw.value("clips").toArray());
    const auto trackIds = idsIn(raw.value("tracks").toArray());
    const auto markerIds = idsIn(markers);
    const auto oneId = [&out](const QJsonValue& value, const QStringList& ids, const QString& noun, const QString& name) -> QString {
        if (!value.isString()) {
            out.error = name + " must be a string id.";
            return {};
        }
        const auto resolved = resolveResource(value.toString(), ids, noun);
        out.error = resolved.error;
        return resolved.id;
    };
    const auto manyIds = [&out, &oneId](const QJsonValue& value, const QStringList& ids, const QString& noun, const QString& name) -> QStringList {
        if (!value.isArray() || value.toArray().isEmpty()) {
            out.error = name + " must be a non-empty list of ids.";
            return {};
        }
        QStringList result;
        for (const auto& item : value.toArray()) {
            result.append(oneId(item, ids, noun, name));
            if (!out.error.isEmpty()) { return {}; }
        }
        result.removeDuplicates();
        return result;
    };
    for (const auto& param : command.params) {
        const auto value = params.value(param.name);
        const auto key = param.key.isEmpty() ? param.name : param.key;
        if (!params.contains(param.name)) {
            if (param.required) {
                out.error = QStringLiteral("%1 needs %2.").arg(command.id, param.name);
                return out;
            }
            continue;
        }
        std::optional<double> number;
        switch (param.kind) {
        case ParamKind::Playhead:
        case ParamKind::RangeIn:
        case ParamKind::RangeOut:
        case ParamKind::GapTime:
        case ParamKind::ContextTime:
        case ParamKind::Number:
            if (!value.isDouble() || !std::isfinite(value.toDouble()) || value.toDouble() < param.min || value.toDouble() > param.max) {
                out.error = std::isfinite(param.max) ? QStringLiteral("%1 must be a number from %2 to %3.").arg(param.name).arg(param.min).arg(param.max)
                    : std::isfinite(param.min)       ? QStringLiteral("%1 must be a number of at least %2.").arg(param.name).arg(param.min)
                                                     : QStringLiteral("%1 must be a number.").arg(param.name);
                return out;
            }
            number = value.toDouble();
            break;
        default:
            break;
        }
        switch (param.kind) {
        case ParamKind::Selection: out.selection = manyIds(value, clipIds, "Clip", param.name); break;
        case ParamKind::EditClip: out.editClip = oneId(value, clipIds, "Clip", param.name); break;
        case ParamKind::GapTrack: out.gapTrack = oneId(value, trackIds, "Track", param.name); break;
        case ParamKind::EditEdge:
            if (!param.choices.contains(value.toString())) { out.error = QStringLiteral("%1 must be one of %2.").arg(param.name, param.choices.join(", ")); }
            out.editEdge = value.toString();
            break;
        case ParamKind::Playhead: out.playhead = number; break;
        case ParamKind::RangeIn: out.rangeIn = number; break;
        case ParamKind::RangeOut: out.rangeOut = number; break;
        case ParamKind::GapTime: out.gapTime = number; break;
        case ParamKind::ContextClip: out.context.insert(key, oneId(value, clipIds, "Clip", param.name)); break;
        case ParamKind::ContextTrack: out.context.insert(key, oneId(value, trackIds, "Track", param.name)); break;
        case ParamKind::ContextTime: out.context.insert(key, *number); break;
        case ParamKind::ContextMarker: {
            const auto id = oneId(value, markerIds, "Marker", param.name);
            if (!out.error.isEmpty()) { return out; }
            out.context.insert(key, id);
            for (const auto& marker : markers) {
                if (marker.toObject().value("id").toString() == id) { out.context.insert("timeMs", marker.toObject().value("timeMs").toDouble()); }
            }
            break;
        }
        case ParamKind::ClipId: out.payload.insert(key, oneId(value, clipIds, "Clip", param.name)); break;
        case ParamKind::ClipIds: out.payload.insert(key, QJsonArray::fromStringList(manyIds(value, clipIds, "Clip", param.name))); break;
        case ParamKind::TrackId: out.payload.insert(key, oneId(value, trackIds, "Track", param.name)); break;
        case ParamKind::TrackIds: out.payload.insert(key, QJsonArray::fromStringList(manyIds(value, trackIds, "Track", param.name))); break;
        case ParamKind::MarkerIds: out.payload.insert(key, QJsonArray::fromStringList(manyIds(value, markerIds, "Marker", param.name))); break;
        case ParamKind::Number: out.payload.insert(key, *number); break;
        case ParamKind::Boolean:
            if (!value.isBool()) { out.error = param.name + " must be true or false."; }
            out.payload.insert(key, value);
            break;
        case ParamKind::Text:
            if (!value.isString()) { out.error = param.name + " must be text."; }
            out.payload.insert(key, value);
            break;
        case ParamKind::Choice:
            if (!param.choices.contains(value.toString())) { out.error = QStringLiteral("%1 must be one of %2.").arg(param.name, param.choices.join(", ")); }
            out.payload.insert(key, value);
            break;
        case ParamKind::Patch: {
            const auto patch = value.toObject();
            if (!value.isObject() || patch.isEmpty()) { out.error = param.name + " must be an object with fields to set."; }
            for (auto it = patch.begin(); it != patch.end() && out.error.isEmpty(); ++it) {
                if (!param.choices.contains(it.key())) {
                    out.error = QStringLiteral("%1 can't set %2. It can set %3.").arg(param.name, it.key(), param.choices.join(", "));
                } else if (!plainTextFields.contains(it.key()) && namesLocation(it.value())) {
                    out.error = QStringLiteral("%1.%2 can't name a file or URL.").arg(param.name, it.key());
                }
            }
            out.payload.insert(key, value);
            break;
        }
        case ParamKind::NumberPatch: {
            const auto patch = value.toObject();
            if (!value.isObject() || patch.isEmpty()) { out.error = param.name + " must be an object with fields to set."; }
            for (auto it = patch.begin(); it != patch.end() && out.error.isEmpty(); ++it) {
                if (!it.value().isDouble() && !it.value().isBool()) { out.error = QStringLiteral("%1.%2 must be a number or boolean.").arg(param.name, it.key()); }
            }
            out.payload.insert(key, value);
            break;
        }
        }
        if (!out.error.isEmpty()) { return out; }
    }
    if (out.editClip.isEmpty() != out.editEdge.isEmpty()) { out.error = "clip_id and edge go together."; }
    if (out.gapTrack.isEmpty() != !out.gapTime) { out.error = "gap_track_id and gap_at_ms go together."; }
    if (out.rangeIn && out.rangeOut && *out.rangeOut <= *out.rangeIn) { out.error = "outMs must be after inMs."; }
    if (out.selection && !out.gapTrack.isEmpty()) { out.error = "Pass clip_ids or a gap, not both."; }
    return out;
}

// What a call set up before its action ran. A call that doesn't run puts it back.
class ViewSetup {
public:
    ViewSetup(ClipGestureController& gestures, PlaybackClock& clock)
        : m_gestures(gestures), m_clock(clock), m_selection(gestures.selection()), m_gap(gestures.selectedGap()), m_edit(gestures.selectedEdit()),
          m_playhead(clock.currentTimeMs()) {
        if (auto* view = gestures.viewState()) {
            m_in = view->rangeInMs();
            m_out = view->rangeOutMs();
        }
    }
    QString apply(const Prepared& prepared) {
        if (prepared.playhead) {
            m_seeked = true;
            m_clock.seek(*prepared.playhead);
        }
        if (prepared.rangeIn || prepared.rangeOut) {
            auto* view = m_gestures.viewState();
            if (!view) { return QStringLiteral("The timeline view is not ready."); }
            m_ranged = true;
            if (prepared.rangeIn && prepared.rangeOut) { view->clearRange(); }
            if (prepared.rangeIn) { view->setRangeIn(*prepared.rangeIn); }
            if (prepared.rangeOut) { view->setRangeOut(*prepared.rangeOut); }
        }
        if (prepared.selection) {
            m_selected = true;
            m_gestures.setSelection(*prepared.selection);
        }
        if (!prepared.editClip.isEmpty()) {
            m_selected = true;
            m_gestures.selectEdit(prepared.editClip, prepared.editEdge);
        }
        if (!prepared.gapTrack.isEmpty()) {
            m_selected = true;
            if (!m_gestures.selectGapAt(prepared.gapTrack, *prepared.gapTime)) {
                return QStringLiteral("There is no gap at %1 ms on that track, or the track is locked.").arg(*prepared.gapTime);
            }
        }
        return {};
    }
    void restore() {
        if (m_selected) {
            m_gestures.setSelection(m_selection);
            if (!m_gap.isEmpty()) { m_gestures.selectGapAt(m_gap.value("trackId").toString(), m_gap.value("startMs").toDouble()); }
            if (!m_edit.isEmpty()) { m_gestures.selectEdit(m_edit.value("clipId").toString(), m_edit.value("edge").toString()); }
        }
        if (m_ranged) {
            auto* view = m_gestures.viewState();
            view->clearRange();
            if (m_in >= 0) { view->setRangeIn(m_in); }
            if (m_out >= 0) { view->setRangeOut(m_out); }
        }
        if (m_seeked) { m_clock.seek(m_playhead); }
    }
private:
    ClipGestureController& m_gestures;
    PlaybackClock& m_clock;
    QStringList m_selection;
    QVariantMap m_gap;
    QVariantMap m_edit;
    double m_playhead = 0;
    double m_in = -1;
    double m_out = -1;
    bool m_seeked = false;
    bool m_ranged = false;
    bool m_selected = false;
};
bool runAction(const Command& command, ClipGestureController& gestures, const QVariantMap& context) {
    const auto* entry = shellEntry(command.id);
    return entry && entry->run ? entry->run(context) : gestures.runAction(command.id, context);
}
// The longest known source of each clip that has one, as the transition edits take it.
QJsonObject knownSourceLimits(TimelineModel& model) {
    QJsonObject limits;
    for (const auto& clip : model.timeline().clips) {
        if (clip.mediaType != nt::MediaType::Video && clip.mediaType != nt::MediaType::Audio) { continue; }
        const auto& path = clip.mediaType == nt::MediaType::Audio && !clip.audioPath.empty() ? clip.audioPath : clip.mediaPath;
        if (const auto limit = nt::wiring::knownSourceDuration(QString::fromStdString(path))) { limits.insert(QString::fromStdString(clip.id), *limit); }
    }
    return limits;
}
QJsonObject editPayload(const Command& command, const Prepared& prepared, ClipGestureController& gestures, TimelineModel& model) {
    auto payload = prepared.payload;
    for (auto it = command.fixed.begin(); it != command.fixed.end(); ++it) {
        if (!payload.contains(it.key())) { payload.insert(it.key(), it.value()); }
    }
    if (command.linked) { payload.insert("linked", gestures.linkedSelection()); }
    if (command.sourceLimit) {
        if (const double limit = gestures.sourceCapMs(payload.value("clipId").toString()); limit >= 0) { payload.insert("maxSourceDurationMs", limit); }
    }
    if (command.sourceLimits) { payload.insert("sourceCaps", knownSourceLimits(model)); }
    return payload;
}
} // namespace

QSet<QString> registeredCommandIds() {
    QSet<QString> ids = ClipGestureController::availableActions();
    for (const auto& entry : app::shellMenuEntries()) { ids.insert(entry.action); }
    for (const auto& item : app::menuItems()) { ids.insert(item.action); }
    for (const auto& edit : app::editRegistrations()) { ids.insert(edit.name); }
    return ids;
}
CommandAudit auditCommands(const QSet<QString>& registered) {
    CommandAudit audit;
    const auto& denied = commands::deniedCommands();
    QSet<QString> allowed;
    for (const auto& command : commands::allowedCommands()) {
        allowed.insert(command.id);
        if (denied.contains(command.id)) { audit.conflicting.append(command.id); }
        if (!registered.contains(command.id)) { continue; }
        const bool runnable = command.runs == Runs::Edit ? bool(app::findEdit(command.id))
                                                         : ClipGestureController::availableActions().contains(command.id) ||
                                                               (shellEntry(command.id) && shellEntry(command.id)->run);
        if (!runnable) { audit.unrunnable.append(command.id); }
    }
    for (const auto& id : registered) {
        if (!allowed.contains(id) && !denied.contains(id)) { audit.unlisted.append(id); }
    }
    for (const auto& id : allowed) {
        if (!registered.contains(id)) { audit.stale.append(id); }
    }
    for (auto it = denied.begin(); it != denied.end(); ++it) {
        if (!registered.contains(it.key())) { audit.stale.append(it.key()); }
    }
    audit.allowed = int(allowed.size());
    audit.denied = int(denied.size());
    for (auto* list : {&audit.unlisted, &audit.stale, &audit.conflicting, &audit.unrunnable}) { list->sort(); }
    return audit;
}
void foldUndoEntries(TimelineModel& model, int indexBefore, const QString& label) {
    auto* stack = model.undoStack();
    if (stack->index() - indexBefore <= 1) { return; }
    const auto after = model.timeline().raw;
    stack->setIndex(indexBefore);
    if (model.applyEdit(QStringLiteral("assistant.foldedCommand"), {{"document", after}})) {
        const_cast<QUndoCommand*>(stack->command(stack->index() - 1))->setText(label);
    }
}

AssistantCommands::AssistantCommands(TimelineModel& model, PlaybackClock& clock, QObject* parent)
    : QObject(parent), m_model(model), m_clock(clock), m_scopes(new ScopesController(this)) {
    m_encoder.setMaxThreadCount(1);
}
AssistantCommands::~AssistantCommands() {
    m_encoder.waitForDone();
    QCoreApplication::removePostedEvents(this, QEvent::MetaCall);
}
void AssistantCommands::setEditor(QObject* editor) { m_editor = editor; }
ClipGestureController* AssistantCommands::gestures() const {
    auto* root = qobject_cast<QQuickItem*>(m_editor);
    return root ? qobject_cast<ClipGestureController*>(nt::wiring::w::findItem(root, QStringLiteral("clipGestures"))) : nullptr;
}
FrameCapture* AssistantCommands::capture() const {
    return m_editor ? m_editor->property("frameCapture").value<FrameCapture*>() : nullptr;
}
QString AssistantCommands::timelineId() const {
    const auto id = m_model.timeline().raw.value("id").toString();
    return id.isEmpty() ? QStringLiteral("native-local:%1").arg(m_model.documentGeneration()) : id;
}
QVariantList AssistantCommands::tools() {
    const auto tool = [](const QString& name, const QString& description, QVariantMap properties, QStringList required) {
        properties.insert("timeline_id", QVariantMap{{"type", "string"}});
        required.prepend("timeline_id");
        return QVariantMap{{"name", name},
                           {"description", description},
                           {"parameters", QVariantMap{{"type", "object"}, {"properties", properties}, {"required", required}, {"additionalProperties", false}}}};
    };
    const QVariantMap atMs{{"type", "number"}, {"description", "Timeline time in ms. Defaults to the playhead."}};
    return {
        tool("ui_timeline_list_commands",
             "List the editor commands ui_timeline_run_command can run: ripple, trims, lift and extract, transitions, groups, speed, tracks, effects, "
             "captions, markers and view changes. Each has an id, label, parameters and whether it is enabled now. A command disabled for want of a "
             "selection can still run when you pass clip_ids. Use filter to keep the list short.",
             {{"filter", QVariantMap{{"type", "string"}, {"description", "Only ids or labels containing this text."}}},
              {"enabled_only", QVariantMap{{"type", "boolean"}, {"description", "Only commands that can run now."}}}},
             {}),
        tool("ui_timeline_run_command",
             "Run one editor command from ui_timeline_list_commands. One call is one undo entry, and the undo command reverses it. Returns whether the "
             "document changed, the undo entry and the new state. Ids are the ones ui_timeline_get_state returns, or their first 12 characters. A command "
             "that can't run returns an error and changes nothing.",
             {{"command", QVariantMap{{"type", "string"}, {"description", "The command's id."}}},
              {"params", QVariantMap{{"type", "object"}, {"description", "The parameters the command lists."}}}},
             {"command"}),
        tool("ui_timeline_read_scopes",
             "Read scope numbers for the composited frame at a time: per-channel and luma levels in percent, plus waveform, parade, histogram and vectorscope "
             "data. Use it to check exposure and colour after an edit.",
             {{"atMs", atMs},
              {"scopes", QVariantMap{{"type", "array"}, {"items", QVariantMap{{"type", "string"}, {"enum", QVariantList{"waveform", "parade", "histogram", "vectorscope"}}}},
                                     {"description", "Which scopes. Defaults to all."}}},
              {"columns", QVariantMap{{"type", "number"}, {"description", "Waveform and parade columns, 1 to 512. Defaults to 8."}}},
              {"peaks", QVariantMap{{"type", "number"}, {"description", "Vectorscope peaks, 1 to 64. Defaults to 8."}}},
              {"bins", QVariantMap{{"type", "boolean"}, {"description", "Include all 256 histogram bins. Defaults to false."}}}},
             {}),
        tool("ui_timeline_capture_frame", "Capture the composited frame at a time as an image, to check the result of an edit.",
             {{"atMs", atMs},
              {"width", QVariantMap{{"type", "number"}, {"description", "Image width in pixels, up to 1920. Defaults to 640."}}}},
             {}),
    };
}
bool AssistantCommands::handles(const QString& name) {
    return name == u"ui_timeline_list_commands" || name == u"ui_timeline_run_command" || name == u"ui_timeline_read_scopes" || name == u"ui_timeline_capture_frame";
}
QVariantMap AssistantCommands::execute(const QString& name, const QVariantMap& args, const QString& callId) {
    const auto json = QJsonObject::fromVariantMap(args);
    if (!json.value("timeline_id").isString() || !resolveId(json.value("timeline_id").toString(), {timelineId()})) {
        return failure("This timeline is not open in the editor.").toVariantMap();
    }
    QJsonObject result;
    if (name == u"ui_timeline_list_commands") { result = listCommands(json); }
    else if (name == u"ui_timeline_run_command") { result = runCommand(json); }
    else if (name == u"ui_timeline_read_scopes") { result = readScopes(json, callId); }
    else if (name == u"ui_timeline_capture_frame") { result = captureFrame(json, callId); }
    else { result = failure("This native editor does not implement that capability."); }
    return result.toVariantMap();
}
QJsonObject AssistantCommands::state(ClipGestureController& gestures) const {
    const auto& raw = m_model.timeline().raw;
    QJsonArray clips;
    for (const auto& value : raw.value("clips").toArray()) {
        const auto clip = value.toObject();
        clips.append(QJsonObject{{"id", clip.value("id")}, {"trackId", clip.value("trackId")}, {"name", clip.value("name")}, {"mediaType", clip.value("mediaType")},
                                 {"startMs", clip.value("startMs")}, {"durationMs", clip.value("durationMs")}});
    }
    QJsonArray tracks;
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        tracks.append(QJsonObject{{"id", track.value("id")}, {"name", track.value("name")}, {"type", track.value("type")}});
    }
    QJsonObject out{{"timeline_id", timelineId()},
                    {"playheadMs", m_clock.currentTimeMs()},
                    {"durationMs", m_model.durationMs()},
                    {"selectedClipIds", QJsonArray::fromStringList(gestures.selection())},
                    {"tracks", tracks},
                    {"clips", clips},
                    {"markers", raw.value("markers").toArray()}};
    if (!gestures.selectedGap().isEmpty()) { out.insert("selectedGap", QJsonObject::fromVariantMap(gestures.selectedGap())); }
    if (!gestures.selectedEdit().isEmpty()) { out.insert("selectedEditPoint", QJsonObject::fromVariantMap(gestures.selectedEdit())); }
    if (auto* view = gestures.viewState()) {
        if (view->rangeInMs() >= 0) { out.insert("inMs", view->rangeInMs()); }
        if (view->rangeOutMs() >= 0) { out.insert("outMs", view->rangeOutMs()); }
    }
    return out;
}
QJsonObject AssistantCommands::listCommands(const QJsonObject& args) {
    auto* editor = gestures();
    if (!editor) { return failure("The editor is still loading. Try again in a moment."); }
    if (args.contains("filter") && !args.value("filter").isString()) { return failure("filter must be text."); }
    const auto filter = args.value("filter").toString().trimmed();
    const bool enabledOnly = args.value("enabled_only").toBool();
    QJsonArray entries;
    for (const auto& command : commands::allowedCommands()) {
        if (!filter.isEmpty() && !command.id.contains(filter, Qt::CaseInsensitive) && !labelOf(command).contains(filter, Qt::CaseInsensitive)) { continue; }
        const auto entry = commandEntry(command, *editor);
        if (enabledOnly && !entry.value("enabled").toBool()) { continue; }
        entries.append(entry);
    }
    return {{"ok", true}, {"commands", entries}};
}
QJsonObject AssistantCommands::runCommand(const QJsonObject& args) {
    auto* editor = gestures();
    if (!editor) { return failure("The editor is still loading. Try again in a moment."); }
    const auto id = args.value("command").toString();
    if (!args.value("command").isString() || id.isEmpty()) { return failure("command must be a command id from ui_timeline_list_commands."); }
    if (const auto denied = commands::deniedCommands().constFind(id); denied != commands::deniedCommands().constEnd()) {
        return failure(QStringLiteral("%1 is not available to the Assistant: %2.").arg(id, *denied));
    }
    const auto* command = findAllowed(id);
    if (!command) { return failure(QStringLiteral("There is no command %1. Read ui_timeline_list_commands.").arg(id)); }
    if (args.contains("params") && !args.value("params").isObject()) { return failure("params must be an object."); }
    if (!editor->gestureKind().isEmpty()) { return failure("The person is dragging in the timeline. Try again when the drag ends."); }
    const auto before = m_model.timeline().raw;
    const auto prepared = prepare(*command, args.value("params").toObject(), before, m_model.markersJson());
    if (!prepared.error.isEmpty()) { return failure(prepared.error); }

    ViewSetup setup(*editor, m_clock);
    const auto disabled = [&](const QString& reason) {
        setup.restore();
        auto result = failure(reason);
        result.insert("disabled", true);
        result.insert("command", id);
        return result;
    };
    if (const auto problem = setup.apply(prepared); !problem.isEmpty()) { return disabled(problem); }
    auto context = menuContext(*editor);
    context.insert(prepared.context);
    if (const auto reason = blockedReason(*command, *editor, context); !reason.isEmpty()) { return disabled(reason); }

    auto* stack = m_model.undoStack();
    const int indexBefore = stack->index();
    bool ran = false;
    if (command->runs == Runs::Edit) {
        ran = m_model.applyEdit(id, editPayload(*command, prepared, *editor, m_model)) != 0;
    } else {
        ran = runAction(*command, *editor, context);
    }
    const bool changed = m_model.timeline().raw != before;
    if (stack->index() - indexBefore > 1) {
        // Stepping back through the entries drops the clips they made from the selection.
        const auto selection = editor->selection();
        foldUndoEntries(m_model, indexBefore, stack->text(indexBefore));
        editor->setSelection(selection);
    }
    const int added = stack->index() - indexBefore;
    if (!ran && !changed && added == 0) {
        setup.restore();
        return failure(command->runs == Runs::Edit ? QStringLiteral("%1 changed nothing. Check clip locks, the ids and the values.").arg(id)
                                                   : QStringLiteral("%1 could not run on the current state. Check the selection, the playhead and clip locks.").arg(id));
    }
    QJsonObject undo{{"added", added > 0}, {"canUndo", stack->canUndo()}, {"canRedo", stack->canRedo()}, {"undoCount", stack->index()}};
    if (stack->canUndo()) { undo.insert("entry", stack->undoText()); }
    QJsonObject result{{"ok", true}, {"command", id}, {"changed", changed}, {"undo", undo}, {"state", state(*editor)}};
    if (command->background) { result.insert("running", true); }
    return result;
}
QJsonObject AssistantCommands::readScopes(const QJsonObject& args, const QString& callId) {
    if (callId.isEmpty()) { return failure("This tool answers later and needs a call id."); }
    auto* frames = capture();
    if (!frames) { return failure("The editor is still loading. Try again in a moment."); }
    const double at = args.contains("atMs") ? args.value("atMs").toDouble(-1) : m_clock.currentTimeMs();
    if (!std::isfinite(at) || at < 0) { return failure("atMs must be a time at or after zero."); }
    if (at > m_model.contentEndMs()) { return failure(QStringLiteral("atMs is after the end of the timeline, at %1 ms.").arg(m_model.contentEndMs())); }
    nt::scopes::NumbersOptions options;
    options.bins = args.value("bins").toBool(false);
    options.columns = args.contains("columns") ? args.value("columns").toInt(options.columns) : options.columns;
    options.peaks = args.contains("peaks") ? args.value("peaks").toInt(options.peaks) : options.peaks;
    static const QStringList known{"waveform", "parade", "histogram", "vectorscope"};
    for (const auto& value : args.value("scopes").toArray()) {
        if (!known.contains(value.toString())) { return failure(QStringLiteral("scopes can be %1.").arg(known.join(", "))); }
        options.scopes.append(value.toString());
    }
    m_scopes->setCapture(frames);
    const auto generation = m_model.documentGeneration();
    m_scopes->readNumbers(at, options, [this, callId, generation](const QJsonObject& numbers) {
        if (generation != m_model.documentGeneration()) {
            emit toolCompleted(callId, failure("The timeline changed during the reading.").toVariantMap());
            return;
        }
        if (numbers.contains("error")) {
            emit toolCompleted(callId, failure(numbers.value("error").toString()).toVariantMap());
            return;
        }
        auto result = numbers;
        result.insert("ok", true);
        emit toolCompleted(callId, result.toVariantMap());
    });
    return {{"ok", true}, {"deferred", true}};
}
QJsonObject AssistantCommands::captureFrame(const QJsonObject& args, const QString& callId) {
    if (callId.isEmpty()) { return failure("This tool answers later and needs a call id."); }
    auto* frames = capture();
    if (!frames) { return failure("The editor is still loading. Try again in a moment."); }
    const double at = args.contains("atMs") ? args.value("atMs").toDouble(-1) : m_clock.currentTimeMs();
    if (!std::isfinite(at) || at < 0) { return failure("atMs must be a time at or after zero."); }
    if (at > m_model.contentEndMs()) { return failure(QStringLiteral("atMs is after the end of the timeline, at %1 ms.").arg(m_model.contentEndMs())); }
    const double requested = args.contains("width") ? args.value("width").toDouble(-1) : DEFAULT_FRAME_WIDTH;
    if (!std::isfinite(requested) || requested < MIN_FRAME_WIDTH || requested > MAX_FRAME_WIDTH) {
        return failure(QStringLiteral("width must be from %1 to %2.").arg(MIN_FRAME_WIDTH).arg(MAX_FRAME_WIDTH));
    }
    const int width = int(requested);
    const auto generation = m_model.documentGeneration();
    frames->captureSequence(at, [self = QPointer(this), callId, width, generation](const FrameCaptureResult& frame) {
        if (!self) { return; }
        if (!frame.ok() || generation != self->m_model.documentGeneration()) {
            const auto message = frame.ok() ? QStringLiteral("The timeline changed during the capture.")
                : frame.cancelled           ? QStringLiteral("The frame capture was cancelled.")
                                            : frame.error;
            emit self->toolCompleted(callId, failure(message).toVariantMap());
            return;
        }
        // Encoding a large frame would stall the interface.
        self->m_encoder.start([owner = self.data(), callId, image = frame.image, timeMs = frame.timeMs, width] {
            const auto scaled = image.scaledToWidth(width, Qt::SmoothTransformation).convertToFormat(QImage::Format_RGB888);
            QByteArray bytes;
            QBuffer buffer(&bytes);
            buffer.open(QIODevice::WriteOnly);
            scaled.save(&buffer, "JPEG", FRAME_JPEG_QUALITY);
            const QJsonObject entry{{"timelineTimeMs", timeMs}, {"width", scaled.width()}, {"height", scaled.height()},
                                    {"dataUrl", QStringLiteral("data:image/jpeg;base64,") + QString::fromLatin1(bytes.toBase64())}};
            const QJsonObject result{{"ok", !bytes.isEmpty()}, {"frames", QJsonArray{entry}}};
            QMetaObject::invokeMethod(owner, [owner, callId, result] { emit owner->toolCompleted(callId, result.toVariantMap()); }, Qt::QueuedConnection);
        });
    });
    return {{"ok", true}, {"deferred", true}};
}
}
