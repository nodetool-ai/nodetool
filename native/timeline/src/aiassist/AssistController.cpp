#include "aiassist/AssistController.h"
#include "aiassist/AssistDocument.h"
#include "aiassist/LinkedWorkflow.h"
#include "aiassist/ScriptExtraction.h"
#include "aiassist/ScriptAuthoring.h"
#include "aiassist/StoryboardAssembly.h"
#include "app/EditRegistry.h"
#include "server/ServerSource.h"
#include <QThread>
#include <utility>
#include <algorithm>
#include <QDir>
#include <QFileInfo>
#include <QSet>
#include <QCryptographicHash>
namespace {
QString draftKey(const QString& scriptId) {
    const auto target = nt::server::serverSaveTarget();
    if (!target) { return scriptId; }
    auto origin = target->server;
    origin.setPath({}); origin.setQuery(QString{}); origin.setFragment(QString{}); origin.setUserInfo(QString{});
    const auto scope = origin.toEncoded() + '\0' + target->token.toUtf8() + '\0' + target->expectedInstance.toUtf8();
    return QString::fromLatin1(QCryptographicHash::hash(scope, QCryptographicHash::Sha256).toHex()) + ':' + scriptId;
}
QString clipMediaKey(const QJsonObject& raw) {
    return raw.value("mediaType").toString() + QChar(0x1f) + raw.value("mediaPath").toString() + QChar(0x1f) + raw.value("audioPath").toString() + QChar(0x1f) + raw.value("currentAssetId").toString();
}
}
AssistController::AssistController(QObject* parent) : QObject(parent) {

}
AssistController::~AssistController() { if (m_cancelled) { m_cancelled->store(true); } }
void AssistController::setModel(TimelineModel* model) {
    if (m_model == model) { return; }
    if (m_model) {
        disconnect(m_model, nullptr, this, nullptr);
        disconnect(m_model->undoStack(), nullptr, this, nullptr);
    }
    if (m_cancelled) { m_cancelled->store(true); }
    m_model = model;
    m_scriptRevisions.clear(); m_result.clear(); m_pendingCommitId.clear();
    if (model) {
        connect(model, &TimelineModel::clipsChanged, this, &AssistController::changed);
        const auto invalidate = [this]() { if (m_busy && m_cancelled) { m_cancelled->store(true); } };
        connect(model, &TimelineModel::timelineChanged, this, invalidate);
        connect(model, &TimelineModel::markersChanged, this, invalidate);
        connect(model->undoStack(), &QUndoStack::indexChanged, this, [invalidate](int) { invalidate(); });
        connect(model, &TimelineModel::documentReplaced, this, [this]() { if (m_cancelled) { m_cancelled->store(true); } m_result.clear(); m_scriptRevisions.clear(); m_pendingCommitId.clear(); emit changed(); });
    }
    emit scriptDraftsChanged(); emit changed();
}
QVariantList AssistController::words() const {
    return m_model ? nt::aiassist::transcript(m_model->timeline().raw).toVariantList() : QVariantList{};
}
QVariantList AssistController::beats() const {
    QVariantList result;
    if (!m_model) { return result; }
    for (const auto& value : m_model->timeline().raw.value("clips").toArray()) {
        const auto clip = value.toObject();
        if (clip.value("mediaType") == "audio" && clip.value("sourceType") == "generated" && clip.value("bindingKind") == "text-to-audio") { result.append(clip.toVariantMap()); }
    }
    std::sort(result.begin(), result.end(), [](const QVariant& a, const QVariant& b) {
        const auto left = a.toMap(); const auto right = b.toMap();
        const double start = left.value("startMs").toDouble(), other = right.value("startMs").toDouble();
        return start == other ? left.value("id").toString() < right.value("id").toString() : start < other;
    });
    return result;
}
QVariantList AssistController::scriptRows() const {
    auto script = QJsonObject::fromVariantMap(m_result.toMap());
    const auto scriptId = script.value("id").toString();
    const auto drafts = m_scriptDrafts.value(draftKey(scriptId));
    auto document = script.value("document").toObject();
    auto sections = document.value("sections").toArray();
    for (qsizetype i = 0; i < sections.size(); ++i) {
        auto section = sections[i].toObject(); auto lines = section.value("lines").toArray();
        for (qsizetype j = 0; j < lines.size(); ++j) {
            auto line = lines[j].toObject(); const auto id = line.value("id").toString();
            if (drafts.contains(id)) { line.insert("text", drafts.value(id).text); lines[j] = line; }
        }
        section.insert("lines", lines); sections[i] = section;
    }
    document.insert("sections", sections); script.insert("document", document);
    auto rows = nt::aiassist::scriptPanelRows(script, m_model ? m_model->timeline().raw : QJsonObject{});
    QSet<QString> present;
    for (const auto& value : rows) { const auto row = value.toObject(); if (row.value("kind") == "line") { present.insert(row.value("id").toString()); } }
    bool orphanHeading = false;
    for (auto it = drafts.cbegin(); it != drafts.cend(); ++it) {
        if (present.contains(it.key()) || it->remove) { continue; }
        if (!orphanHeading) { rows.append(QJsonObject{{"kind", "section"}, {"id", "retainedDrafts"}, {"title", "Unsubmitted drafts"}}); orphanHeading = true; }
        rows.append(QJsonObject{{"kind", "line"}, {"id", it.key()}, {"text", it->text}, {"draftOrphan", true}, {"canVoice", false}});
    }
    for (qsizetype i = 0; i < rows.size(); ++i) {
        auto row = rows[i].toObject(); const auto id = row.value("id").toString();
        row.insert("scriptId", scriptId);
        row.insert("draftDirty", row.value("kind") == "line" && drafts.contains(id));
        row.insert("draftRemove", drafts.value(id).remove);
        rows[i] = row;
    }
    return rows.toVariantList();
}
QVariantMap AssistController::scriptHeader() const { return nt::aiassist::scriptPanelHeader(QJsonObject::fromVariantMap(m_result.toMap())).toVariantMap(); }
QUrl AssistController::scriptEditorUrl() const {
    const auto resource = QJsonObject::fromVariantMap(m_result.toMap());
    if (!resource.value("document").toObject().value("sections").isArray()) { return {}; }
    const auto target = nt::server::serverSaveTarget();
    return target ? nt::aiassist::scriptEditorUrl(target->server, resource.value("id").toString()) : QUrl{};
}
bool AssistController::createLinkedScript() {
    if (!m_model) { return false; }
    QJsonObject input{{"name", m_model->name().isEmpty() ? "Timeline script" : m_model->name() + " script"}};
    const auto project = m_model->timeline().raw.value("projectId");
    if (project.isString() && !project.toString().isEmpty()) { input.insert("projectId", project); }
    return call(true, "scripts.createLinked", input);
}
bool AssistController::addScriptLine() {
    const auto source = QJsonObject::fromVariantMap(m_result.toMap());
    const auto updated = nt::aiassist::addScriptLine(source);
    return updated != source && saveScript(updated);
}
bool AssistController::hasScriptLineDraft(const QString& scriptId, const QString& lineId) const {
    return m_scriptDrafts.value(draftKey(scriptId)).contains(lineId);
}
void AssistController::setScriptLineDraft(const QString& scriptId, const QString& lineId, const QString& text) {
    const auto source = QJsonObject::fromVariantMap(m_result.toMap());
    if (scriptId.isEmpty() || source.value("id").toString() != scriptId) { return; }
    QStringList ids; QHash<QString, QString> texts;
    for (const auto& section : source.value("document").toObject().value("sections").toArray()) {
        for (const auto& value : section.toObject().value("lines").toArray()) { const auto line = value.toObject(); const auto id = line.value("id").toString(); ids.append(id); texts.insert(id, line.value("text").toString()); }
    }
    const auto resolved = nt::aiassist::resolveId(lineId, ids);
    if (!resolved) {
        if (m_scriptDrafts.value(draftKey(scriptId)).contains(lineId)) { m_scriptDrafts[draftKey(scriptId)].insert(lineId, {text, false}); ++m_scriptDraftRevision; emit scriptDraftsChanged(); }
        return;
    }
    if (texts.value(*resolved) == text) { m_scriptDrafts[draftKey(scriptId)].remove(*resolved); }
    else { m_scriptDrafts[draftKey(scriptId)].insert(*resolved, {text, false}); }
    ++m_scriptDraftRevision; emit scriptDraftsChanged();
}
bool AssistController::saveScriptLineDraft(const QString& scriptId, const QString& lineId) {
    const auto source = QJsonObject::fromVariantMap(m_result.toMap());
    if (scriptId.isEmpty() || source.value("id").toString() != scriptId || m_busy) { return false; }
    const auto drafts = m_scriptDrafts.value(draftKey(scriptId));
    QStringList ids; for (auto it = drafts.cbegin(); it != drafts.cend(); ++it) { ids.append(it.key()); }
    const auto resolved = nt::aiassist::resolveId(lineId, ids);
    if (!resolved) { emit changed(); return false; }
    const auto draft = drafts.value(*resolved);
    auto updated = nt::aiassist::patchScriptLineText(source, {{"lineId", *resolved}, {"text", draft.text}});
    if (draft.remove) { updated = nt::aiassist::removeEmptyScriptLine(updated, {{"lineId", *resolved}}); }
    if (updated == source) {
        bool exists = false;
        for (const auto& section : source.value("document").toObject().value("sections").toArray()) {
            for (const auto& line : section.toObject().value("lines").toArray()) { if (line.toObject().value("id").toString() == *resolved) { exists = true; } }
        }
        if (exists || draft.remove) { return saveScript(source); }
        m_error = "This line no longer exists. Your draft is retained for copying into a new line."; emit changed(); return false;
    }
    return saveScript(updated);
}
bool AssistController::patchScriptLine(const QString& id, const QString& text) {
    const auto scriptId = m_result.toMap().value("id").toString();
    setScriptLineDraft(scriptId, id, text);
    return saveScriptLineDraft(scriptId, id);
}
bool AssistController::removeEmptyScriptLine(const QString& id, const QString& text) {
    return removeEmptyScriptLineForScript(m_result.toMap().value("id").toString(), id, text);
}
bool AssistController::removeEmptyScriptLineForScript(const QString& scriptId, const QString& id, const QString& text) {
    if (!text.isEmpty() || scriptId.isEmpty() || m_result.toMap().value("id").toString() != scriptId) { return false; }
    setScriptLineDraft(scriptId, id, text);
    const auto source = QJsonObject::fromVariantMap(m_result.toMap());
    QStringList ids;
    for (const auto& section : source.value("document").toObject().value("sections").toArray()) {
        for (const auto& value : section.toObject().value("lines").toArray()) { ids.append(value.toObject().value("id").toString()); }
    }
    const auto resolved = nt::aiassist::resolveId(id, ids); if (!resolved) { return false; }
    m_scriptDrafts[draftKey(scriptId)].insert(*resolved, {text, true});
    ++m_scriptDraftRevision; emit scriptDraftsChanged();
    return saveScriptLineDraft(scriptId, *resolved);
}
void AssistController::confirmScriptDrafts(const QJsonObject& submitted, const QJsonObject& confirmed) {
    const auto scriptId = confirmed.value("id").toString();
    if (scriptId.isEmpty() || !submitted.value("document").isObject()) { return; }
    const auto texts = [](const QJsonObject& document) {
        QHash<QString, QString> result;
        for (const auto& section : document.value("sections").toArray()) {
            for (const auto& value : section.toObject().value("lines").toArray()) { const auto line = value.toObject(); result.insert(line.value("id").toString(), line.value("text").toString()); }
        }
        return result;
    };
    const auto sent = texts(submitted.value("document").toObject());
    const auto saved = texts(confirmed.value("document").toObject());
    auto& drafts = m_scriptDrafts[draftKey(scriptId)];
    bool cleared = false;
    for (auto it = drafts.begin(); it != drafts.end();) {
        const bool textConfirmed = !it->remove && sent.contains(it.key()) && saved.contains(it.key()) && sent.value(it.key()) == it->text && saved.value(it.key()) == it->text;
        const bool removalConfirmed = it->remove && !sent.contains(it.key()) && !saved.contains(it.key());
        if (textConfirmed || removalConfirmed) { it = drafts.erase(it); cleared = true; } else { ++it; }
    }
    if (drafts.isEmpty()) { m_scriptDrafts.remove(draftKey(scriptId)); }
    if (cleared) { ++m_scriptDraftRevision; emit scriptDraftsChanged(); }
}
bool AssistController::addBeat(const QString& text, const QString& provider, const QString& model, const QString& voice) {
    return m_model && m_model->applyEdit("assist.addBeat", {{"text", text}, {"provider", provider}, {"model", model}, {"voice", voice}});
}
bool AssistController::setBeatText(const QString& id, const QString& text) { return m_model && m_model->applyEdit("assist.setBeatText", {{"clipId", id}, {"text", text}}); }
bool AssistController::deleteBeat(const QString& id) { return m_model && m_model->applyEdit("assist.deleteBeat", {{"clipIds", QJsonArray{id}}}); }
bool AssistController::reorderBeats(const QStringList& ids) { return m_model && m_model->applyEdit("assist.reorderBeats", {{"orderedClipIds", QJsonArray::fromStringList(ids)}}); }
bool AssistController::correctWord(const QString& clipId, int index, const QString& text) {
    return m_model && m_model->applyEdit("assist.correctTranscript", {{"clipId", clipId}, {"wordIndex", index}, {"text", text}}) != 0;
}
bool AssistController::deleteWords(double startMs, double endMs) {
    return m_model && m_model->applyEdit("assist.deleteTranscriptRange", {{"startMs", startMs}, {"endMs", endMs}}) != 0;
}
bool AssistController::removeFillers() { return m_model && m_model->applyEdit("assist.removeFillers", {}) != 0; }
bool AssistController::call(bool write, const QString& procedure, const QJsonObject& input) {
    if (write && (procedure == "scripts.update" || procedure == "storyboards.update" || procedure == "assets.update") &&
        input.value("id").toString() == m_result.toMap().value("id").toString() && m_resultScope != draftKey({})) {
        m_error = "The server identity changed. Reopen the document before saving. Your draft is retained."; emit changed(); return false;
    }
    auto transport = m_call;
    if (!transport) {
        if (const auto target = nt::server::serverSaveTarget()) {
            transport = [target](bool write, const QString& procedure, const QJsonObject& input) {
                nt::server::ServerClient server(target->server, target->token);
                server.setExpectedInstance(target->expectedInstance);
                return write ? server.mutate(procedure, input) : server.query(procedure, input);
            };
        }
    }
    if (!m_model || !transport) { m_error = "Connect to a server to use linked documents."; emit changed(); return false; }
    if (m_busy) { return false; }
    const auto observed = m_model->timeline().raw;
    auto mediaResolver = m_mediaResolver;
    const bool documentOnly = m_documentOnly && procedure != "scripts.getCommitted" && procedure != "storyboards.assembleNative";
    QSet<QString> resolvedBefore, protectedPaths;
    for (const auto& clip : m_model->timeline().clips) {
        const auto path = clip.mediaType == nt::MediaType::Audio ? clip.audioPath : clip.mediaPath;
        if (!path.empty() && QFileInfo::exists(QString::fromStdString(path))) { resolvedBefore.insert(clipMediaKey(clip.raw)); }
        if (!clip.mediaPath.empty()) { protectedPaths.insert(QString::fromStdString(clip.mediaPath)); }
        if (!clip.audioPath.empty()) { protectedPaths.insert(QString::fromStdString(clip.audioPath)); }
    }
    m_mediaProtection->reset(protectedPaths);
    if (!mediaResolver) {
        if (const auto target = nt::server::serverSaveTarget()) {
            const auto protection = m_mediaProtection;
            const auto mediaGeneration = protection->generation();
            mediaResolver = [target, protection, mediaGeneration](const QJsonObject& raw) {
                nt::server::ServerClient server(target->server, target->token);
                const auto asset = server.getAsset(raw.value("currentAssetId").toString());
                if (!asset.ok()) { return nt::Clip{}; }
                const auto cacheRoot = QDir::cleanPath(QDir(target->backupDir).absoluteFilePath("../../.."));
                return nt::assets::resolveDroppedMedia(server, cacheRoot, asset.data.toObject(), raw, *protection, mediaGeneration);
            };
        }
    }
    if (documentOnly) { mediaResolver = {}; }
    const auto targetAtStart = nt::server::serverSaveTarget();
    const auto generation = m_model->documentGeneration();
    const QPointer<TimelineModel> model = m_model;
    m_busy = true;
    emit changed();
    const QPointer<AssistController> self(this);
    m_cancelled = std::make_shared<std::atomic_bool>(false);
    const auto cancelled = m_cancelled;
    auto* worker = QThread::create([self, model, observed, generation, transport, write, procedure, input, cancelled, mediaResolver, resolvedBefore, documentOnly, targetAtStart]() {
        auto resolvedInput = input;
        const auto requestedId = input.value("id").toString();
        if (requestedId.size() == 12 && !procedure.startsWith("assets.")) {
            const auto family = procedure.section('.', 0, 0);
            const auto listing = transport(false, family + ".list", {});
            QStringList scope;
            if (listing.ok()) {
                for (const auto& value : listing.data.toArray()) { scope.append(value.toObject().value("id").toString()); }
            }
            const auto resolved = nt::aiassist::resolveId(requestedId, scope);
            if (resolved) { resolvedInput.insert("id", *resolved); }
            else {
                if (!self) { return; }
                QMetaObject::invokeMethod(self, [self]() {
                    if (!self) { return; }
                    self->m_busy = false;
                    self->m_error = "Resource prefix is ambiguous or unavailable.";
                    emit self->changed();
                }, Qt::QueuedConnection);
                return;
            }
        }
        if (cancelled->load()) {
            if (self) { QMetaObject::invokeMethod(self, [self]() { if (self) { self->m_busy = false; self->m_error = "The timeline changed. Refresh the linked document."; emit self->changed(); } }, Qt::QueuedConnection); }
            return;
        }
        nt::server::QueryResult response;
        if (procedure == "storyboards.assembleNative") {
            auto board = input.value("board").toObject();
            QJsonObject script;
            const auto scriptId = board.value("document").toObject().value("screenplay").toObject().value("script_id").toString();
            if (!scriptId.isEmpty()) {
                const auto loaded = transport(false, "scripts.get", {{"id", scriptId}});
                if (loaded.ok()) { script = loaded.data.toObject(); }
            }
            const auto assembly = nt::aiassist::assembleStoryboard(observed, board, script);
            if (!assembly.error.isEmpty()) { response.error.message = assembly.error; }
            else {
                if (cancelled->load()) {
                    if (self) { QMetaObject::invokeMethod(self, [self]() { if (self) { self->m_busy = false; self->m_error = "The timeline changed. Refresh the linked document."; emit self->changed(); } }, Qt::QueuedConnection); }
                    return;
                }
                const auto linked = transport(true, "storyboards.update", {{"id", board.value("id")}, {"timelineId", observed.value("id")}, {"baseUpdatedAt", board.value("updatedAt")}});
                if (!linked.ok()) { response = linked; }
                else { response.data = QJsonObject{{"board", linked.data.toObject()}, {"script", script}}; }
            }
        } else if (procedure == "scripts.createLinked") {
            response = transport(true, "scripts.create", resolvedInput);
            if (response.ok()) {
                if (cancelled->load()) { response.error.message = "The timeline changed. The new script remains unlinked."; }
                else {
                    const auto created = response.data.toObject();
                    response = transport(true, "scripts.update", {{"id", created.value("id")}, {"timelineId", observed.value("id")}, {"baseUpdatedAt", created.value("updatedAt")}});
                }
            }
        } else {
            response = procedure == "scripts.linked" ? transport(false, "scripts.list", resolvedInput) : transport(write, procedure == "scripts.getCommitted" ? "scripts.get" : procedure, resolvedInput);
        }
        if (procedure == "scripts.linked" && response.ok()) {
            const auto linked = response.data.toArray();
            if (linked.isEmpty()) { response.data = QJsonObject{}; }
            else if (linked.size() == 1) { response = transport(false, "scripts.get", {{"id", linked.first().toObject().value("id")}}); }
            else { response.error.message = "More than one script is linked to this timeline."; }
        }
        std::vector<nt::Clip> resolvedMedia;
        if (response.ok() && mediaResolver) {
            QJsonObject next;
            const auto resource = response.data.toObject();
            if (procedure == "storyboards.assembleNative") { next = nt::aiassist::assembleStoryboard(observed, resource.value("board").toObject(), resource.value("script").toObject()).document; }
            else if (resource.value("timelineId") == observed.value("id") && resource.value("document").toObject().contains("sections")) { next = nt::aiassist::reconcileScript(observed, resource); }
            auto resolved = resolvedBefore;
            for (const auto& value : next.value("clips").toArray()) {
                const auto clip = value.toObject(); const auto type = clip.value("mediaType").toString(); const auto key = clipMediaKey(clip);
                if (clip.value("currentAssetId").toString().isEmpty() || (type != "audio" && type != "video" && type != "image") || resolved.contains(key)) { continue; }
                if (cancelled->load()) { break; }
                auto media = mediaResolver(clip);
                const auto path = type == "audio" ? media.audioPath : media.mediaPath;
                if (path.empty() || !QFileInfo::exists(QString::fromStdString(path))) { response.error.message = "Linked media could not be loaded. Refresh the document to retry."; break; }
                resolved.insert(key); resolvedMedia.push_back(std::move(media));
            }
        }
        if (!self) { return; }
        QMetaObject::invokeMethod(self, [self, model, observed, generation, response, procedure, resolvedMedia, cancelled, input, documentOnly, targetAtStart]() {
            if (!self) { return; }
            self->m_busy = false;
            const auto targetNow = nt::server::serverSaveTarget();
            const bool sameTarget = (!targetAtStart && !targetNow) || (targetAtStart && targetNow &&
                targetAtStart->server == targetNow->server && targetAtStart->token == targetNow->token &&
                targetAtStart->expectedInstance == targetNow->expectedInstance && targetAtStart->timelineId == targetNow->timelineId);
            if (!sameTarget || cancelled->load() || !model || self->m_model != model || generation != model->documentGeneration() ||
                !nt::aiassist::acceptsResult(observed, model->timeline().raw)) {
                self->m_error = "The timeline changed. Refresh the linked document.";
            } else {
                self->m_error = response.ok() ? QString{} : response.describe();
                if (response.ok()) {
                    if (procedure == "scripts.update") { self->confirmScriptDrafts(input, response.data.toObject()); }
                    if (procedure == "storyboards.assembleNative") {
                        self->m_result = response.data.toObject().value("board").toVariant();
                        if (!model->applyEdit("assist.assembleStoryboard", response.data.toObject())) { self->m_error = "Storyboard assembly is unchanged or unavailable."; }
                    } else if (procedure != "scripts.linked" && (procedure != "scripts.getCommitted" || self->m_result.toMap().value("id").toString() == response.data.toObject().value("id").toString())) { self->m_result = response.data.toVariant(); self->m_resultScope = draftKey({}); }
                    const auto resource = response.data.toObject();
                    if (!documentOnly && resource.value("timelineId") == observed.value("id") &&
                        resource.value("document").toObject().contains("sections")) {
                        const auto scriptId = resource.value("id").toString();
                        const auto revision = resource.value("updatedAt").toString();
                        const bool alreadySeen = !revision.isEmpty() && self->m_scriptRevisions.value(scriptId) == revision;
                        if (procedure == "scripts.update" || procedure == "scripts.getCommitted" || procedure == "scripts.createLinked") { model->applyEdit("assist.reconcileScript", resource); }
                        else if (self->m_pendingCommitId != scriptId && (procedure != "scripts.linked" || !alreadySeen)) { model->settleDocument(nt::aiassist::reconcileScript(model->timeline().raw, resource)); }
                        self->m_scriptRevisions.insert(scriptId, revision);
                    }
                }
                if (response.ok()) { for (const auto& media : resolvedMedia) { model->registerMedia(media); } }
            }
            emit self->scriptDraftsChanged(); emit self->changed();
            if (!self->m_pendingCommitId.isEmpty()) {
                const auto id = std::exchange(self->m_pendingCommitId, QString{});
                self->applyScriptRevision(id);
            }
        }, Qt::QueuedConnection);
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start();
    return true;
}
bool AssistController::refreshLinkedScript() {
    if (!m_model || m_busy) { return false; }
    return call(false, "scripts.linked", {{"timelineId", m_model->timeline().raw.value("id")}});
}
bool AssistController::assembleStoryboard(const QJsonObject& board) {
    if (board.value("id").toString().isEmpty() || board.value("updatedAt").toString().isEmpty()) { return false; }
    return call(true, "storyboards.assembleNative", {{"board", board}});
}
bool AssistController::extractScript() {
    if (!m_model) { return false; }
    const auto document = nt::aiassist::extractScriptFromTimeline(m_model->timeline().raw.value("clips").toArray());
    const auto sections = document.value("sections").toArray();
    bool hasLines = false;
    for (const auto& section : sections) { if (!section.toObject().value("lines").toArray().isEmpty()) { hasLines = true; break; } }
    if (!hasLines) { m_error = "This timeline has no transcript to extract."; emit changed(); return false; }
    QJsonObject input{{"name", m_model->name() + " script"}, {"document", document}};
    const auto project = m_model->timeline().raw.value("projectId");
    if (project.isString() && !project.toString().isEmpty()) { input.insert("projectId", project); }
    return call(true, "scripts.create", input);
}
void AssistController::updateResource(const QJsonObject& resource) {
    if (resource.value("id").toString().isEmpty() || m_result.toMap().value("id").toString() != resource.value("id").toString()) { return; }
    m_result = resource.toVariantMap(); emit changed();
}
bool AssistController::listScripts() {
    return call(false, "scripts.list", {});
}
bool AssistController::listStoryboards() { return call(false, "storyboards.list", {}); }
bool AssistController::openClipScript(const QString& clipId) {
    if (!m_model) { return false; }
    QStringList ids;
    const auto clips = m_model->timeline().raw.value("clips").toArray();
    for (const auto& value : clips) { ids.append(value.toObject().value("id").toString()); }
    const auto resolved = nt::aiassist::resolveId(clipId, ids);
    if (!resolved) { return false; }
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        if (clip.value("id").toString() != *resolved) { continue; }
        const auto scriptId = clip.value("scriptId").toString();
        return !scriptId.isEmpty() && !clip.value("scriptLineId").toString().isEmpty() && openScript(scriptId);
    }
    return false;
}
bool AssistController::applyScriptRevision(const QString& id) {
    if (m_documentOnly && m_model && m_result.toMap().value("id").toString() == id &&
        m_result.toMap().value("timelineId").toString() != m_model->timeline().raw.value("id").toString()) {
        m_error = "Link this script to this cut before applying its revision."; emit changed(); return false;
    }
    if (m_busy) { m_pendingCommitId = id; return true; }
    return call(false, "scripts.getCommitted", {{"id", id}});
}
bool AssistController::openScript(const QString& id) { return call(false, "scripts.get", {{"id", id}}); }
bool AssistController::openStoryboard(const QString& id) { return call(false, "storyboards.get", {{"id", id}}); }
bool AssistController::linkScript(const QString& id, bool linked) {
    if (!m_model) { return false; }
    return call(true, "scripts.update", {{"id", id}, {"timelineId", linked ? m_model->timeline().raw.value("id") : QJsonValue::Null}});
}
bool AssistController::saveScript(const QJsonObject& script) {
    if (script.value("updatedAt").toString().isEmpty()) { return false; }
    return call(true, "scripts.update", {{"id", script.value("id")}, {"document", script.value("document")}, {"baseUpdatedAt", script.value("updatedAt")}});
}
bool AssistController::saveStoryboard(const QJsonObject& storyboard) {
    if (storyboard.value("updatedAt").toString().isEmpty()) { return false; }
    return call(true, "storyboards.update", {{"id", storyboard.value("id")}, {"document", storyboard.value("document")}, {"baseUpdatedAt", storyboard.value("updatedAt")}});
}

bool AssistController::listContextResources(const QString& kind, bool linkedOnly) {
    if (!m_model || (kind != "scripts" && kind != "storyboards")) { return false; }
    QJsonObject input;
    const auto project = m_model->timeline().raw.value("projectId").toString();
    if (!project.isEmpty()) { input.insert("projectId", project); }
    if (kind == "scripts" && linkedOnly) { input.insert("timelineId", m_model->timeline().raw.value("id")); }
    if (kind == "storyboards" && project.isEmpty()) {
        m_error = "Open a project timeline to browse its storyboards."; emit changed(); return false;
    }
    return call(false, kind + ".list", input);
}
bool AssistController::openEntity(const QString& id) { return call(false, "assets.get", {{"id", id}}); }
bool AssistController::saveEntity(const QJsonObject& entity, const QJsonValue& expectedMetadata) {
    if (entity.value("id").toString().isEmpty() || !entity.value("metadata").toObject().value("nodetool_entity").isObject()) { return false; }
    return call(true, "assets.update", {{"id", entity.value("id")}, {"expected_metadata", expectedMetadata}, {"metadata", entity.value("metadata")}});
}

bool AssistController::scriptDirty() const { return !m_scriptDrafts.value(draftKey(m_result.toMap().value("id").toString())).isEmpty(); }
