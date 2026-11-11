#include "aiassist/ProductionReview.h"
#include "aiassist/ShotPlacement.h"
#include "aiassist/AssistDocument.h"
#include "aiassist/ShotPlan.h"
#include "app/EditRegistry.h"
#include "server/ServerSource.h"
#include <QCryptographicHash>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <cmath>
namespace {
const bool registered = nt::app::registerEdit("storyboard.placeShot", [](QJsonObject raw, const QJsonObject& payload) {
    return raw == payload.value("before").toObject() ? payload.value("after").toObject() : raw;
});
QJsonObject reviewInput(const QJsonObject& board, const QString& shotId, const QString& kind, const QJsonObject& model,
                        const QJsonArray& entities, const QJsonObject& script) {
    return {{"board", board}, {"shotId", shotId}, {"kind", kind}, {"model", model}, {"entities", entities}, {"script", script}};
}
}
ProductionReview::ProductionReview(QObject* parent) : QObject(parent), m_protection(std::make_shared<nt::assets::MediaProtection>()) {}
ProductionReview::~ProductionReview() { if (m_worker) { m_worker->requestInterruption(); m_worker->wait(); } }
void ProductionReview::setTimeline(TimelineModel* model) {
    if (model == m_timeline) { return; }
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    ++m_serial; m_timeline = model; m_summary = {}; m_token.clear(); m_inputToken.clear(); m_approvedToken.clear(); m_error.clear();
    if (model) {
        connect(model, &TimelineModel::documentReplaced, this, [this] { ++m_serial; m_summary = {}; m_token.clear(); m_inputToken.clear(); m_approvedToken.clear(); resetProtection(); emit changed(); });
        connect(model, &TimelineModel::timelineChanged, this, [this] { if (!m_approvedToken.isEmpty()) { m_approvedToken.clear(); emit changed(); } });
    }
    resetProtection(); emit changed();
}
void ProductionReview::resetProtection() {
    QSet<QString> paths;
    if (m_timeline) { for (const auto& clip : m_timeline->timeline().clips) { if (!clip.mediaPath.empty()) { paths.insert(QString::fromStdString(clip.mediaPath)); } if (!clip.audioPath.empty()) { paths.insert(QString::fromStdString(clip.audioPath)); } } }
    m_protection->reset(paths);
}
QString ProductionReview::fingerprint(const QJsonObject& value) {
    return QString::fromLatin1(QCryptographicHash::hash(QJsonDocument(value).toJson(QJsonDocument::Compact), QCryptographicHash::Sha256).toHex());
}
QJsonObject ProductionReview::shotSummary(const QJsonObject& board, const QString& shotId, const QString& kind,
                                         const QJsonObject& model, const QJsonArray& entities, const QJsonObject& script, QString& error) {
    std::optional<double> linkedDuration;
    if (kind == "video" && !script.isEmpty()) {
        const auto shots = board.value("document").toObject().value("shots").toArray();
        QStringList ids; for (const auto& value : shots) { ids.append(value.toObject().value("id").toString()); }
        if (const auto resolved = nt::aiassist::resolveId(shotId, ids)) {
            for (const auto& value : shots) { const auto shot = value.toObject(); if (shot.value("id").toString() == *resolved) { linkedDuration = nt::aiassist::linkedShotRenderSeconds(shot, script); break; } }
        }
    }
    const auto plan = nt::aiassist::planShotRender(board, shotId, kind, model, entities, linkedDuration);
    if (!plan.error.isEmpty()) { error = plan.error; return {}; }
    const auto requests = plan.requests.isEmpty() ? QJsonArray{plan.request} : plan.requests;
    const auto request = requests.first().toObject();
    const auto source = request.value("source_asset_id").toString();
    const int referenceCount = request.value("reference_images").toArray().size() + (source.isEmpty() ? 0 : 1);
    QJsonArray requestSummaries;
    for (qsizetype i = 0; i < requests.size(); ++i) {
        const auto item = requests.at(i).toObject();
        requestSummaries.append(QJsonObject{{"take", static_cast<int>(i + 1)}, {"provider", item.value("provider")}, {"model", item.value("model")},
            {"durationSeconds", item.value("duration")}, {"resolution", item.value("resolution")}, {"aspectRatio", item.value("aspect_ratio")},
            {"referenceCount", item.value("reference_images").toArray().size() + (item.value("source_asset_id").toString().isEmpty() ? 0 : 1)}});
    }
    QJsonObject result{{"boardId", board.value("id")}, {"boardUpdatedAt", board.value("updatedAt")}, {"shotId", plan.shotId}, {"kind", kind},
        {"provider", request.value("provider")}, {"model", request.value("model")}, {"request", request}, {"requests", requests}, {"requestSummaries", requestSummaries}, {"requestCount", static_cast<int>(requests.size())},
        {"durationSeconds", request.value("duration")}, {"referenceCount", referenceCount}, {"resolution", request.value("resolution")},
        {"aspectRatio", request.value("aspect_ratio")}, {"priceState", "unavailable"}, {"priceLabel", "Price unavailable"},
        {"priceDetail", QString("The server does not publish a direct-generation price quote. This action submits %1 render %2 using the models and settings shown.").arg(requests.size()).arg(requests.size() == 1 ? "request" : "requests")},
        {"pricedCount", 0}, {"unpricedCount", static_cast<int>(requests.size())}};
    const auto storedCost = plan.shot.value("cost_estimate");
    if (storedCost.isDouble() && std::isfinite(storedCost.toDouble()) && storedCost.toDouble() >= 0) {
        result.insert("previousCostUsd", storedCost);
        result.insert("previousCostLabel", "Last render: $" + QString::number(storedCost.toDouble(), 'f', 2));
    }
    if (!script.isEmpty()) { result.insert("scriptUpdatedAt", script.value("updatedAt")); }
    return result;
}
bool ProductionReview::reviewShot(const QJsonObject& board, const QString& shotId, const QString& kind, const QJsonObject& model,
                                 const QJsonArray& entityLibrary, const QJsonObject& script) {
    if (busy() || !m_timeline) { return false; }
    ++m_serial; m_generation = m_timeline->documentGeneration(); m_approvedToken.clear(); m_summary = {}; m_token.clear(); m_error.clear();
    m_inputToken = fingerprint(reviewInput(board, shotId, kind, model, entityLibrary, script));
    const auto document = board.value("document").toObject();
    const auto scriptId = document.value("screenplay").toObject().value("script_id").toString();
    const bool needsEntities = !document.value("entityIds").toArray().isEmpty() && entityLibrary.isEmpty();
    const bool needsScript = kind == "video" && !scriptId.isEmpty() && script.isEmpty();
    if (!needsEntities && !needsScript) {
        m_summary = shotSummary(board, shotId, kind, model, entityLibrary, script, m_error); m_token = fingerprint(m_summary); emit changed(); return m_error.isEmpty();
    }
    const auto target = nt::server::serverSaveTarget();
    if (!target && !m_call) { m_error = "Open a server timeline to review the shot's linked context."; emit changed(); return false; }
    const auto call = m_call; const auto serial = m_serial; const auto generation = m_generation; const auto timeline = m_timeline; const QPointer<ProductionReview> guard(this);
    auto* worker = QThread::create([guard, timeline, serial, generation, target, call, board, shotId, kind, model, entityLibrary, script, scriptId, needsEntities, needsScript] {
        std::unique_ptr<nt::server::ServerClient> server;
        if (target) { server = std::make_unique<nt::server::ServerClient>(target->server, target->token); }
        const auto query = [&](const QString& name, const QJsonObject& input) { return call ? call(name, input) : server->query(name, input); };
        auto entities = entityLibrary; auto linkedScript = script; QString error;
        if (needsEntities) {
            const auto response = query("assets.search", {{"query", ""}, {"page_size", 1000}, {"project_id", board.value("projectId").toString("default")}});
            if (!response.ok()) { error = response.describe(); } else { entities = nt::aiassist::shotEntityLibrary(response.data.toObject().value("assets").toArray()); }
        }
        if (error.isEmpty() && needsScript) {
            const auto response = query("scripts.get", {{"id", scriptId}});
            if (!response.ok()) { error = response.describe(); } else { linkedScript = response.data.toObject(); }
        }
        QJsonObject summary;
        if (error.isEmpty()) { summary = shotSummary(board, shotId, kind, model, entities, linkedScript, error); }
        if (!guard) { return; }
        QMetaObject::invokeMethod(guard, [guard, timeline, serial, generation, summary, error] {
            if (!guard || serial != guard->m_serial || !timeline || guard->m_timeline != timeline || generation != timeline->documentGeneration()) { return; }
            guard->m_summary = summary; guard->m_error = error; guard->m_token = fingerprint(summary); emit guard->changed();
        }, Qt::QueuedConnection);
    });
    m_worker = worker; connect(worker, &QThread::finished, this, [this, worker] { if (m_worker == worker) { m_worker = nullptr; emit changed(); } });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater); worker->start(); emit changed(); return true;
}
bool ProductionReview::approve() {
    if (busy() || !m_timeline || m_timeline->documentGeneration() != m_generation || m_summary.isEmpty() || !m_error.isEmpty()) { return false; }
    m_approvedToken = m_token; emit changed(); return true;
}
bool ProductionReview::consume(const QJsonObject& board, const QString& shotId, const QString& kind, const QJsonObject& model,
                              const QJsonArray& entityLibrary, const QJsonObject& script) {
    const bool matches = approved() && m_timeline && m_timeline->documentGeneration() == m_generation &&
        fingerprint(reviewInput(board, shotId, kind, model, entityLibrary, script)) == m_inputToken;
    m_approvedToken.clear();
    if (!matches) { m_error = "The shot settings changed. Review the request again before rendering."; }
    emit changed(); return matches;
}
bool ProductionReview::placeShot(const QJsonObject& board, const QString& shotId, double startMs, const QString& trackId, const QString& dropMode) {
    if (busy() || !m_timeline) { return false; }
    const auto before = m_timeline->timeline().raw;
    const auto placement = nt::aiassist::placeStoryboardShot(before, board, shotId, startMs, trackId, dropMode);
    if (!placement.error.isEmpty()) { m_error = placement.error; emit changed(); return false; }
    const auto target = nt::server::serverSaveTarget();
    if (!target && !m_call) { m_error = "Open a server timeline to place storyboard media."; emit changed(); return false; }
    ++m_serial; const auto serial = m_serial; const auto generation = m_timeline->documentGeneration(); const auto timeline = m_timeline;
    const auto call = m_call; const auto resolver = m_resolver; const auto protection = m_protection; const auto mediaGeneration = protection->generation();
    const QPointer<ProductionReview> guard(this); m_error.clear(); m_approvedToken.clear();
    auto* worker = QThread::create([guard, timeline, before, placement, serial, generation, target, call, resolver, protection, mediaGeneration] {
        nt::server::ServerClient server(target ? target->server : QUrl("http://127.0.0.1:1"), target ? target->token : QString{});
        std::vector<nt::Clip> media; QString error;
        for (const auto& value : placement.addedClips) {
            const auto raw = value.toObject(); const auto assetId = raw.value("currentAssetId").toString();
            const auto response = call ? call("assets.get", {{"id", assetId}}) : server.getAsset(assetId);
            if (!response.ok()) { error = response.describe(); break; }
            const auto root = target ? QDir::cleanPath(QDir(target->backupDir).absoluteFilePath("../../..")) : QString{};
            auto resolved = resolver ? resolver(server, root, response.data.toObject(), raw, *protection, mediaGeneration)
                : nt::assets::resolveDroppedMedia(server, root, response.data.toObject(), raw, *protection, mediaGeneration);
            const auto path = QString::fromStdString(raw.value("mediaType") == "audio" ? resolved.audioPath : resolved.mediaPath);
            if (path.isEmpty() || !QFileInfo::exists(path)) { error = "The shot's stored media could not be loaded."; break; }
            media.push_back(std::move(resolved));
        }
        if (!guard) { return; }
        QMetaObject::invokeMethod(guard, [guard, timeline, before, placement, serial, generation, media, error] {
            if (!guard || serial != guard->m_serial || !timeline || guard->m_timeline != timeline || generation != timeline->documentGeneration()) { return; }
            if (!error.isEmpty()) { guard->m_error = error; }
            else if (timeline->timeline().raw != before) { guard->m_error = "The timeline changed while loading the shot. Place it again."; }
            else if (!timeline->applyEdit("storyboard.placeShot", {{"before", before}, {"after", placement.document}})) { guard->m_error = "The shot placement could not be applied."; }
            else { for (const auto& resolved : media) { timeline->registerMedia(resolved); } emit guard->placed(placement.clipId); }
            emit guard->changed();
        }, Qt::QueuedConnection);
    });
    m_worker = worker; connect(worker, &QThread::finished, this, [this, worker] { if (m_worker == worker) { m_worker = nullptr; emit changed(); } });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater); worker->start(); emit changed(); return true;
}
