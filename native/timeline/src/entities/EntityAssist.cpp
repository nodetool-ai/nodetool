#include "entities/EntityAssist.h"
#include "server/ServerSource.h"
#include <QJsonArray>
#include <QRegularExpression>
#include <QUuid>

namespace {
const QString systemPrompt = QStringLiteral(
    "You write the text of one form field in a creative AI application.\n"
    "Follow the instruction. Respect the field's purpose, hint and placeholder.\n"
    "Keep the language of the current text, or of the placeholder when the field is empty.\n"
    "Reply with the new field text only: no preamble, no explanation, no quotation marks around it, no Markdown code fence.");
QString textPrompt(const QVariantMap& request) {
    QStringList lines{"# Field"};
    for (const auto& pair : {std::pair{"label", "Label: "}, {"description", "Hint: "},
             {"placeholder", "Placeholder (example of the expected form): "}}) {
        const auto value = request.value(pair.first).toString();
        if (!value.isEmpty()) lines.append(QString::fromLatin1(pair.second) + value);
    }
    const auto context = request.value("context").toString();
    if (!context.isEmpty()) lines << "" << "# Context" << context;
    const auto text = request.value("text").toString();
    lines << "" << "# Current text" << (text.trimmed().isEmpty() ? "(empty)" : text)
          << "" << "# Instruction" << request.value("instruction").toString();
    return lines.join('\n');
}
QString cleanReply(QString text) {
    text = text.trimmed();
    const auto match = QRegularExpression(QStringLiteral("^```[\\w-]*\\n([\\s\\S]*?)\\n?```$")).match(text);
    if (match.hasMatch()) text = match.captured(1).trimmed();
    for (const auto& pair : {std::pair{QStringLiteral("\""), QStringLiteral("\"")},
             {QStringLiteral("“"), QStringLiteral("”")}, {QStringLiteral("'"), QStringLiteral("'")}}) {
        if (text.size() >= 2 && text.startsWith(pair.first) && text.endsWith(pair.second) &&
            !text.mid(1, text.size() - 2).contains(pair.second)) {
            text = text.mid(1, text.size() - 2).trimmed();
            break;
        }
    }
    return text;
}
}
EntityAssist::EntityAssist(QObject* parent) : QObject(parent), m_transport(this), m_referenceTimeout(this), m_recoveryPoll(this) {
    m_referenceTimeout.setSingleShot(true);
    m_referenceTimeout.setInterval(5 * 60 * 1000);
    connect(&m_referenceTimeout, &QTimer::timeout, this, [this] {
        cancelReference();
        m_generateError = "The reference image took too long. Try again.";
        emit changed();
    });
    connect(&m_transport, &nt::ai::GenerationTransport::readyChanged, this, &EntityAssist::sendPending);
    connect(&m_transport, &nt::ai::GenerationTransport::response, this, &EntityAssist::receive);
    m_recoveryPoll.setInterval(1000);
    connect(&m_recoveryPoll, &QTimer::timeout, this, [this] {
        if (m_transport.ready()) lookup(); else open();
    });
    connect(&m_transport, &nt::ai::GenerationTransport::error, this, [this](const QString& error) {
        if (generating() && m_referenceRequest.isEmpty()) connectionLost(); else fail(error);
    });
    connect(&m_transport, &nt::ai::GenerationTransport::disconnected, this, &EntityAssist::connectionLost);
}
EntityAssist::~EntityAssist() { m_transport.disconnect(this); m_transport.close(); }
void EntityAssist::configure(const QUrl& server, const QString& token) {
    cancelReference(); cancelAssist();
    m_explicit = true; m_server = server; m_token = token;
    m_transport.configure(server, token);
}
bool EntityAssist::prepare() {
    const auto target = nt::server::serverSaveTarget().value_or(nt::server::SaveTarget{});
    if ((!m_explicit || (m_server == target.server && m_token == target.token)) && !target.expectedInstance.isEmpty()) return false;
    if (!m_explicit && (m_server != target.server || m_token != target.token)) {
        cancelReference(); cancelAssist();
        m_server = target.server; m_token = target.token;
        m_transport.configure(m_server, m_token);
    }
    return true;
}
void EntityAssist::open() {
    if (m_transport.ready()) sendPending();
    else m_transport.open();
}
void EntityAssist::connectionLost() {
    if (assisting()) { cancelAssist(); m_assistError = "The server disconnected."; emit changed(); }
    if (!generating()) return;
    if (!m_referenceRequest.isEmpty()) { fail("The server disconnected."); return; }
    m_lookupId.clear();
    m_recoveryPoll.start();
    QTimer::singleShot(0, this, [this] { if (generating() && m_recoveryPoll.isActive()) open(); });
}
void EntityAssist::lookup() {
    if (!generating() || !m_lookupId.isEmpty() || !m_transport.ready()) return;
    m_lookupId = QUuid::createUuid().toString(QUuid::Id128);
    if (!m_transport.send("lookup_generations", {{"request_ids", QJsonArray{m_referenceId}}}, m_lookupId)) m_lookupId.clear();
}
void EntityAssist::sendPending() {
    if (!m_transport.ready()) return;
    if (generating() && !m_referenceRequest.isEmpty()) {
        if (!m_transport.send("generate_media", m_referenceRequest, m_referenceId)) { fail("Could not send generation request."); return; }
        m_referenceRequest = {};
    }
    if (generating() && m_recoveryPoll.isActive()) lookup();
    if (assisting() && !m_assistRequest.isEmpty()) {
        if (!m_transport.send("generate_text", m_assistRequest, m_assistId)) { fail("Could not send assistant request."); return; }
        m_assistRequest = {};
    }
}
void EntityAssist::generateReference(const QVariantMap& request) {
    cancelReference();
    if (!prepare()) { m_generateError = "Generation is unavailable for a server that requires instance verification."; emit changed(); return; }
    const auto source = request.value("sourceAssetId").toString();
    m_referenceRequest = {{"provider", request.value("provider").toString()}, {"model", request.value("model").toString()},
        {"prompt", request.value("prompt").toString().trimmed()}, {"aspect_ratio", request.value("aspectRatio").toString()},
        {"mode", source.isEmpty() ? "image" : "image_edit"}, {"resolution", "1K"}, {"variations", request.value("takes", 1).toInt()}};
    if (!source.isEmpty()) m_referenceRequest.insert("source_asset_id", source);
    m_referenceId = QUuid::createUuid().toString(QUuid::Id128);
    m_referenceTimeout.start();
    emit changed();
    open();
}
void EntityAssist::cancelReference() {
    if (generating() && m_referenceRequest.isEmpty()) m_transport.send("cancel_generation", {{"request_ids", QJsonArray{m_referenceId}}}, QUuid::createUuid().toString(QUuid::Id128));
    m_recoveryPoll.stop(); m_lookupId.clear();
    m_referenceTimeout.stop(); m_referenceId.clear(); m_referenceRequest = {}; m_takes.clear(); m_generateError.clear();
    emit changed();
}
void EntityAssist::chooseTake(const QString& id) {
    if (!m_takes.contains(id)) return;
    cancelReference();
    emit referenceReady(id);
}
void EntityAssist::assist(const QVariantMap& request) {
    cancelAssist();
    m_assistError.clear();
    if (!prepare()) { m_assistError = "Text assistance is unavailable for a server that requires instance verification."; emit changed(); return; }
    m_assistRequest = {{"provider", request.value("provider").toString()}, {"model", request.value("model").toString()},
        {"system", systemPrompt}, {"prompt", textPrompt(request)}, {"max_tokens", 2000}};
    m_assistId = QUuid::createUuid().toString(QUuid::Id128);
    emit changed();
    open();
}
void EntityAssist::cancelAssist() { m_assistId.clear(); m_assistRequest = {}; emit changed(); }
void EntityAssist::clearProposal() { cancelAssist(); m_proposal.clear(); m_assistError.clear(); emit changed(); }
void EntityAssist::fail(const QString& error) {
    if (generating()) { m_recoveryPoll.stop(); m_lookupId.clear(); m_referenceId.clear(); m_referenceRequest = {}; m_referenceTimeout.stop(); m_generateError = error; }
    if (assisting()) { m_assistId.clear(); m_assistRequest = {}; m_assistError = error; }
    emit changed();
}
void EntityAssist::receive(const QJsonObject& message) {
    const auto id = message.value("request_id").toString();
    if (generating() && !m_lookupId.isEmpty() && id == m_lookupId) {
        m_lookupId.clear();
        if (message.value("error").isObject()) { fail(message.value("error").toObject().value("message").toString("Could not recover the reference image.")); return; }
        for (const auto& value : message.value("result").toObject().value("generations").toArray()) {
            const auto row = value.toObject();
            if (row.value("request_id") != m_referenceId) continue;
            const auto status = row.value("status").toString();
            if (status == "completed") receive({{"request_id", m_referenceId}, {"result", row}});
            else if (status != "running" && status != "queued" && status != "pending" && status != "recovering") {
                const auto error = row.value("error").toString();
                fail(error.isEmpty() ? QStringLiteral("The reference image generation failed.") : error);
            }
            return;
        }
        fail("The server could not find the reference image request."); return;
    }
    const bool reference = generating() && id == m_referenceId;
    const bool text = assisting() && id == m_assistId;
    if (!reference && !text) return;
    const auto error = message.value("error");
    const auto result = message.value("result").toObject();
    QString ready;
    if (reference) {
        m_recoveryPoll.stop(); m_lookupId.clear();
        m_referenceId.clear(); m_referenceRequest = {}; m_referenceTimeout.stop();
        if (error.isObject()) m_generateError = error.toObject().value("message").toString("RPC failed");
        else {
            for (const auto& value : result.value("asset_ids").toArray()) if (value.isString()) m_takes.append(value.toString());
            if (m_takes.isEmpty()) m_generateError = "The image model returned no reference image.";
            else if (m_takes.size() == 1) { ready = m_takes.first(); m_takes.clear(); }
        }
    } else {
        m_assistId.clear(); m_assistRequest = {};
        if (error.isObject()) m_assistError = error.toObject().value("message").toString("RPC failed");
        else {
            const auto proposal = cleanReply(result.value("text").toString());
            if (proposal.isEmpty()) m_assistError = "The model returned no text. Try again or pick another model.";
            else m_proposal = proposal;
        }
    }
    emit changed();
    if (!ready.isEmpty()) emit referenceReady(ready);
}
QString EntityAssist::assistContext(const QString& kind, const QString& name) const {
    return name.trimmed().isEmpty() ? QStringLiteral("The entity is a %1.").arg(kind) :
        QStringLiteral("The entity is a %1 named \"%2\".").arg(kind, name.trimmed());
}
QVariantList EntityAssist::referenceViews(const QString& kind) const {
    if (kind == "character") return {
        QVariantMap{{"id", "full-body"}, {"label", "Full body"}, {"instruction", "Show one full-body, front-facing pose, head to toe. Center the character against a neutral background with even studio lighting. Make their face, clothing, and distinctive features clear."}, {"aspectRatio", "1:1"}},
        QVariantMap{{"id", "portrait"}, {"label", "Portrait"}, {"instruction", "Show a head-and-shoulders portrait with the face fully visible and a neutral expression. Use a simple background and even lighting so facial features and hair are easy to identify."}, {"aspectRatio", "2:3"}},
        QVariantMap{{"id", "character-sheet"}, {"label", "Character sheet"}, {"instruction", "Create a character sheet with front, side, and back views plus a close-up of the face. Keep proportions, clothing, colors, and distinctive features consistent across views. Use a clean background without text or labels."}, {"aspectRatio", "3:2"}}};
    if (kind == "location") return {
        QVariantMap{{"id", "establishing-view"}, {"label", "Establishing view"}, {"instruction", "Show a wide establishing view of the location. Make its layout, architecture, landmarks, and atmosphere clear in one coherent scene."}, {"aspectRatio", "3:2"}},
        QVariantMap{{"id", "detail-view"}, {"label", "Detail view"}, {"instruction", "Show a closer view of the defining materials, objects, and architectural details. Keep the setting and atmosphere recognizable."}, {"aspectRatio", "1:1"}},
        QVariantMap{{"id", "location-sheet"}, {"label", "Location sheet"}, {"instruction", "Create a location sheet with three views of the same place from different angles. Keep the architecture, landmarks, lighting, and color palette consistent. No text or labels."}, {"aspectRatio", "3:2"}}};
    if (kind == "style") return {
        QVariantMap{{"id", "style-sample"}, {"label", "Style sample"}, {"instruction", "Create one cohesive scene that clearly shows this visual style's palette, lighting, texture, and rendering treatment."}, {"aspectRatio", "1:1"}},
        QVariantMap{{"id", "style-sheet"}, {"label", "Style sheet"}, {"instruction", "Create a visual style sheet with three different subjects rendered in the same style. Keep the palette, lighting, texture, and rendering treatment consistent. No text or labels."}, {"aspectRatio", "3:2"}},
        QVariantMap{{"id", "texture-detail"}, {"label", "Texture detail"}, {"instruction", "Show a close-up sample of this style's defining textures, brushwork, materials, and color relationships, with enough detail to reuse the treatment."}, {"aspectRatio", "1:1"}}};
    if (kind == "prop") return {
        QVariantMap{{"id", "product-view"}, {"label", "Product view"}, {"instruction", "Show one clear three-quarter view of the object, fully visible and centered against a neutral background. Use even studio lighting to reveal its shape, materials, and colors."}, {"aspectRatio", "1:1"}},
        QVariantMap{{"id", "detail-view"}, {"label", "Detail view"}, {"instruction", "Show a closer view of the defining materials, objects, and architectural details. Keep the setting and atmosphere recognizable."}, {"aspectRatio", "1:1"}},
        QVariantMap{{"id", "turnaround-sheet"}, {"label", "Turnaround sheet"}, {"instruction", "Create an object turnaround sheet with front, side, and back views. Keep its shape, scale, materials, colors, and details consistent across views. Use a clean background without text or labels."}, {"aspectRatio", "3:2"}}};
    return {};
}
QString EntityAssist::referencePrompt(const QString& kind, const QString& name, const QString& descriptor, const QString& viewId) const {
    const auto views = referenceViews(kind);
    if (views.isEmpty()) return {};
    auto view = views.first().toMap();
    for (const auto& row : views) if (row.toMap().value("id") == viewId) view = row.toMap();
    return QStringLiteral("A reference image of %1. %2 %3").arg(name.isEmpty() ? kind : name, descriptor.trimmed(), view.value("instruction").toString());
}
QVariantList EntityAssist::quickActions() const {
    return {
        QVariantMap{{"id", "draft"}, {"label", "Write it"}, {"instruction", "Write a complete value for this field."}, {"needsText", false}},
        QVariantMap{{"id", "improve"}, {"label", "Improve"}, {"instruction", "Make the text clearer and more specific. Keep its meaning and its facts."}, {"needsText", true}},
        QVariantMap{{"id", "expand"}, {"label", "Add detail"}, {"instruction", "Add concrete, specific detail that fits the field's purpose."}, {"needsText", true}},
        QVariantMap{{"id", "shorten"}, {"label", "Shorten"}, {"instruction", "Make the text shorter. Keep every important fact."}, {"needsText", true}},
        QVariantMap{{"id", "fix"}, {"label", "Fix grammar"}, {"instruction", "Correct spelling, grammar and punctuation only. Change nothing else."}, {"needsText", true}}};
}
