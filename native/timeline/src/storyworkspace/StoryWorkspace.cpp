#include "storyworkspace/StoryWorkspace.h"
#include "storyworkspace/StoryDrafts.h"
#include "server/ServerSource.h"
#include <QCryptographicHash>
#include <QJsonDocument>
#include <QJsonArray>
#include <QSet>
#include <QUuid>

void StoryWorkspace::setController(AssistController* controller) {
    if (m_controller == controller) { return; }
    if (m_controller) { disconnect(m_controller, nullptr, this, nullptr); }
    m_controller = controller;
    if (controller) { connect(controller, &AssistController::changed, this, &StoryWorkspace::observe); }
    emit resourceChanged(); emit changed();
}
QString StoryWorkspace::key() const {
    if (!m_controller || !m_controller->model()) { return {}; }
    QByteArray scope;
    if (const auto target = nt::server::serverSaveTarget()) {
        scope = target->server.toEncoded() + '\0' + target->token.toUtf8() + '\0' + target->expectedInstance.toUtf8();
    }
    const auto timeline = m_controller->model()->timeline().raw;
    scope += '\0' + timeline.value("projectId").toString().toUtf8() + '\0' + timeline.value("id").toString().toUtf8();
    const auto loaded = current();
    const auto document = loaded.value("document").toObject();
    const QString kind = document.contains("shots") ? "storyboard" : document.contains("sections") ? "script" : "entity";
    return QString::fromLatin1(QCryptographicHash::hash(scope, QCryptographicHash::Sha256).toHex()) + ':' + kind + ':' + loaded.value("id").toString();
}
QJsonObject StoryWorkspace::current() const { return m_controller ? QJsonObject::fromVariantMap(m_controller->result().toMap()) : QJsonObject{}; }
QVariantMap StoryWorkspace::resource() const { return m_drafts.contains(key()) ? m_drafts.value(key()).edited.toVariantMap() : current().toVariantMap(); }
bool StoryWorkspace::dirty() const { return m_drafts.contains(key()) || !m_jsonDrafts.value(key()).isEmpty(); }
bool StoryWorkspace::retain(const QJsonObject& edited, const QString& error) {
    m_error = error;
    if (!error.isEmpty() || current().value("id").toString().isEmpty() || !m_controller || m_controller->busy()) { emit changed(); return false; }
    const auto draftKey = key();
    if (!m_drafts.contains(draftKey)) { m_drafts.insert(draftKey, {current(), edited}); }
    else { m_drafts[draftKey].edited = edited; }
    if (m_drafts.value(draftKey).base == edited) { m_drafts.remove(draftKey); }
    emit changed(); return true;
}
bool StoryWorkspace::patchShot(const QString& id, const QString& field, const QJsonValue& value) {
    const auto result = nt::storyworkspace::patchShot(QJsonObject::fromVariantMap(resource()), id, field, value);
    return retain(result.resource, result.error);
}
bool StoryWorkspace::patchSpeaker(const QString& id, const QString& field, const QJsonValue& value) {
    const auto result = nt::storyworkspace::patchSpeaker(QJsonObject::fromVariantMap(resource()), id, field, value);
    return retain(result.resource, result.error);
}
bool StoryWorkspace::patchEntity(const QString& field, const QJsonValue& value) {
    const auto result = nt::storyworkspace::patchEntity(QJsonObject::fromVariantMap(resource()), field, value);
    return retain(result.resource, result.error);
}
bool StoryWorkspace::patchDocument(const QString& field, const QJsonValue& value) {
    const auto result = nt::storyworkspace::patchDocument(QJsonObject::fromVariantMap(resource()), field, value);
    return retain(result.resource, result.error);
}
bool StoryWorkspace::applyShotDraft(const QString& shotId, const QJsonObject& patch) {
    const auto result = nt::storyworkspace::applyShotDraft(QJsonObject::fromVariantMap(resource()), shotId, patch);
    return retain(result.resource, result.error);
}
bool StoryWorkspace::nudgeShot(const QString& shotId, int direction) {
    const auto result = nt::storyworkspace::nudgeShot(QJsonObject::fromVariantMap(resource()), shotId, direction);
    return retain(result.resource, result.error);
}
bool StoryWorkspace::removeShotVersion(const QString& shotId, const QString& kind, int index) {
    const auto result = nt::storyworkspace::removeShotVersion(QJsonObject::fromVariantMap(resource()), shotId, kind, index);
    return retain(result.resource, result.error);
}
QString StoryWorkspace::insertShot(const QString& afterShotId) {
    const auto id = QUuid::createUuid().toString(QUuid::Id128);
    const auto result = nt::storyworkspace::insertShot(QJsonObject::fromVariantMap(resource()), afterShotId, id);
    return retain(result.resource, result.error) ? id : QString{};
}
QString StoryWorkspace::duplicateShot(const QString& shotId) {
    const auto id = QUuid::createUuid().toString(QUuid::Id128);
    const auto result = nt::storyworkspace::duplicateShot(QJsonObject::fromVariantMap(resource()), shotId, id);
    return retain(result.resource, result.error) ? id : QString{};
}
bool StoryWorkspace::removeShot(const QString& shotId) {
    const auto result = nt::storyworkspace::removeShot(QJsonObject::fromVariantMap(resource()), shotId);
    return retain(result.resource, result.error);
}
bool StoryWorkspace::moveShot(const QString& shotId, const QString& sceneId, int position) {
    const auto result = nt::storyworkspace::moveShot(QJsonObject::fromVariantMap(resource()), shotId, sceneId, position);
    return retain(result.resource, result.error);
}
bool StoryWorkspace::patchBoard(const QString& field, const QJsonValue& value) {
    const auto result = nt::storyworkspace::patchBoard(QJsonObject::fromVariantMap(resource()), field, value);
    return retain(result.resource, result.error);
}
bool StoryWorkspace::save() {
    if (!m_controller || m_controller->busy() || !dirty()) { return false; }
    for (const auto& raw : m_jsonDrafts.value(key())) {
        if (!raw.error.isEmpty()) { m_error = raw.error; emit changed(); return false; }
    }
    if (!m_drafts.contains(key())) { m_jsonDrafts.remove(key()); emit changed(); return true; }
    const auto draft = m_drafts.value(key());
    if (draft.base != current()) { m_error = "The document changed remotely. Copy your draft before discarding it and reopening the document."; emit changed(); return false; }
    m_submitting = key(); m_submitted = draft.edited; m_error.clear();
    const auto document = draft.edited.value("document").toObject();
    const bool started = document.contains("shots") ? m_controller->saveStoryboard(draft.edited) :
        document.contains("sections") ? m_controller->saveScript(draft.edited) :
        m_controller->saveEntity(draft.edited, draft.base.value("metadata"));
    if (!started) { m_submitting.clear(); m_error = "Save could not start. Your draft is retained."; emit changed(); }
    return started;
}
void StoryWorkspace::observe() {
    if (!m_submitting.isEmpty() && m_controller && !m_controller->busy()) {
        const auto saved = current();
        const bool entity = m_submitted.value("metadata").isObject();
        const auto field = entity ? QStringLiteral("metadata") : QStringLiteral("document");
        if (m_controller->error().isEmpty() && key() == m_submitting && saved.value("id") == m_submitted.value("id") && saved.value(field) == m_submitted.value(field) && (entity || saved.value("name") == m_submitted.value("name"))) {
            m_drafts.remove(m_submitting); m_jsonDrafts.remove(m_submitting);
        } else { m_error = "Save was not confirmed. Your draft is retained. Retry after reconnecting, or reopen to check for conflicts."; }
        m_submitting.clear(); m_submitted = {};
    }
    const auto activeKey = key();
    if (m_observedKey != activeKey) {
        m_observedKey = activeKey; m_error.clear();
        for (const auto& raw : m_jsonDrafts.value(activeKey)) { if (!raw.error.isEmpty()) { m_error = raw.error; break; } }
    }
    emit resourceChanged(); emit changed();
}
void StoryWorkspace::discard() { if (!m_controller || m_controller->busy()) { return; } m_drafts.remove(key()); m_jsonDrafts.remove(key()); m_error.clear(); emit resourceChanged(); emit changed(); }
QStringList StoryWorkspace::entityIds() const {
    const auto document = QJsonObject::fromVariantMap(resource()).value("document").toObject();
    QStringList ids; QSet<QString> seen;
    const auto append = [&ids, &seen](const QString& id) { if (!id.isEmpty() && !seen.contains(id)) { seen.insert(id); ids.append(id); } };
    for (const auto& id : document.value("entityIds").toArray()) { append(id.toString()); }
    for (const auto& cast : document.value("cast").toArray()) { append(cast.toObject().value("entityId").toString()); }
    for (const auto& shot : document.value("shots").toArray()) {
        for (const auto& id : shot.toObject().value("entity_ids").toArray()) { append(id.toString()); }
        append(shot.toObject().value("location_id").toString());
    }
    return ids;
}
QString StoryWorkspace::json(const QJsonValue& value) const {
    if (value.isUndefined() || value.isNull()) { return "[]"; }
    return QString::fromUtf8(value.isArray() ? QJsonDocument(value.toArray()).toJson(QJsonDocument::Indented) : QJsonDocument(value.toObject()).toJson(QJsonDocument::Indented));
}
bool StoryWorkspace::patchJson(const QString& shotId, const QString& field, const QString& text) {
    QJsonParseError error;
    const auto parsed = QJsonDocument::fromJson(text.toUtf8(), &error);
    if (error.error != QJsonParseError::NoError) { m_error = "Invalid JSON: " + error.errorString(); emit changed(); return false; }
    const QJsonValue value = parsed.isArray() ? QJsonValue(parsed.array()) : QJsonValue(parsed.object());
    return shotId.isEmpty() ? patchDocument(field, value) : patchShot(shotId, field, value);
}

QString StoryWorkspace::jsonDraft(const QString& shotId, const QString& field, const QJsonValue& fallback) const {
    const auto drafts = m_jsonDrafts.value(key()); const auto fieldKey = shotId + QChar(0x1f) + field;
    return drafts.contains(fieldKey) ? drafts.value(fieldKey).text : json(fallback);
}
void StoryWorkspace::setJsonDraft(const QString& shotId, const QString& field, const QString& text) {
    const auto draftKey = key();
    patchJson(shotId, field, text);
    m_jsonDrafts[draftKey].insert(shotId + QChar(0x1f) + field, {text, m_error});
    emit changed();
}

QVariantList StoryWorkspace::linkedResources() const {
    QVariantList result;
    if (!m_controller || !m_controller->model()) { return result; }
    QSet<QString> seen;
    for (const auto& value : m_controller->model()->timeline().raw.value("clips").toArray()) {
        const auto clip = value.toObject();
        for (const auto& field : {QStringLiteral("scriptId"), QStringLiteral("storyboardBoardId")}) {
            const auto id = clip.value(field).toString();
            const QString kind = field == "scriptId" ? "scripts" : "storyboards";
            if (id.isEmpty() || seen.contains(kind + ':' + id)) { continue; }
            seen.insert(kind + ':' + id);
            result.append(QVariantMap{{"id", id}, {"kind", kind}});
        }
    }
    return result;
}
