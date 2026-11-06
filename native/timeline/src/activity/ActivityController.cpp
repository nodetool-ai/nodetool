#include "ActivityController.h"
#include "server/ServerSource.h"
#include <QDateTime>
#include <QJsonArray>
#include <QSet>
#include <algorithm>
#include <cmath>

namespace {
bool activeJob(const QString& status) { return status == "running" || status == "scheduled"; }
QString reportedCost(const QJsonValue& value, const QString& currency) {
    if (!value.isDouble() || !std::isfinite(value.toDouble()) || value.toDouble() < 0 || currency.isEmpty()) { return "Not reported"; }
    return QString::number(value.toDouble(), 'g', 10) + " " + currency;
}
struct Page { QString procedure; QJsonObject input; bool generation = false; };
struct Result { QVariantList rows; QString jobCursor, generationCursor, error; bool jobsFetched = false, generationsFetched = false, proxiesFetched = false; };
}
ActivityController::ActivityController(QObject* parent) : QObject(parent) {
    m_poll.setInterval(5000);
    connect(&m_poll, &QTimer::timeout, this, &ActivityController::refresh);
    m_poll.start();
}
ActivityController::~ActivityController() { if (m_worker) { m_worker->requestInterruption(); m_worker->wait(); } }
QString ActivityController::projectId() const { return m_timeline ? m_timeline->timeline().raw.value("projectId").toString() : QString{}; }
QString ActivityController::scopeLabel() const {
    if (!m_target) { return "Open a server timeline to see server activity."; }
    return projectId().isEmpty() ? "Server activity for this account (timeline has no project)." : "Project " + projectId();
}
void ActivityController::setTarget(std::optional<nt::server::SaveTarget> target) { m_explicitTarget = true; m_target = std::move(target); reset(); }
void ActivityController::setTimeline(TimelineModel* value) {
    if (m_timeline == value) { return; }
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = value;
    if (value) { connect(value, &TimelineModel::documentReplaced, this, &ActivityController::reset); }
    reset();
}
void ActivityController::reset() {
    ++m_epoch;
    if (!m_explicitTarget) { m_target = nt::server::serverSaveTarget(); }
    m_rows.clear(); m_jobCursor.clear(); m_generationCursor.clear(); m_jobHeadCursor.clear(); m_generationHeadCursor.clear(); m_error.clear(); m_lastUpdated.clear(); m_stale = true;
    emit changed();
    QTimer::singleShot(0, this, &ActivityController::refresh);
}
QVariantList ActivityController::rows() const {
    auto result = m_rows;
    for (auto& value : result) { auto row = value.toMap(); if (m_stale || row.value("stale").toBool() || busy()) { row.insert("cancellable", false); } row.insert("stale", m_stale || row.value("stale").toBool()); value = row; }
    return result;
}
QVariantMap ActivityController::jobRow(const QJsonObject& value) {
    const auto status = value.value("status").toString();
    return {{"id", value.value("id").toString()}, {"source", "Server job"}, {"kind", "Workflow"},
        {"title", value.value("name").toString().isEmpty() ? value.value("workflow_id").toString() : value.value("name").toString()},
        {"status", status}, {"detail", value.value("error").toString()}, {"progress", -1.0},
        {"cost", reportedCost(value.value("cost"), "(currency not reported)")}, {"cancellable", activeJob(status)},
        {"updatedAt", value.value("finished_at").toString().isEmpty() ? value.value("started_at").toString() : value.value("finished_at").toString()}};
}
QVariantMap ActivityController::generationRow(const QJsonObject& value) {
    const auto status = value.value("status").toString();
    QStringList detail;
    for (const auto& field : {"submission_status", "provider_status", "output_status", "attachment_status", "submission_error", "provider_error", "output_error", "attachment_error"}) {
        const auto state = value.value(field).toString(); if (!state.isEmpty()) { detail.append(QString::fromLatin1(field).replace('_', ' ') + ": " + state); }
    }
    if (value.value("cancellation_requested").toBool()) { detail.append("Cancellation requested"); }
    if (!value.value("generation_error").toString().isEmpty()) { detail.append(value.value("generation_error").toString()); }
    auto cost = reportedCost(value.value("cost"), value.value("currency").toString());
    if (cost != "Not reported" && !value.value("price_source").toString().isEmpty()) { cost += " (" + value.value("price_source").toString() + ")"; }
    if (value.value("quantity").isDouble() && !value.value("billing_unit").toString().isEmpty()) {
        cost += " · " + QString::number(value.value("quantity").toDouble(), 'g', 10) + " " + value.value("billing_unit").toString();
    }
    const bool active = value.value("can_cancel").toBool();
    return {{"id", value.value("generation_id").toString()}, {"source", "Generation"}, {"kind", value.value("capability").toString()},
        {"title", value.value("provider").toString() + " / " + value.value("model").toString()}, {"status", status},
        {"detail", detail.join("\n")}, {"progress", -1.0}, {"cost", cost},
        {"cancellable", active && !value.value("cancellation_requested").toBool()},
        {"updatedAt", value.value("completed_at").toString().isEmpty() ? value.value("started_at").toString() : value.value("completed_at").toString()}};
}
void ActivityController::refresh() { request(false); }
void ActivityController::loadMore() { if (hasMore()) { request(true); } }
void ActivityController::cancel(const QString& id, const QString& source) {
    if (m_stale || busy()) { return; }
    const auto found = std::ranges::find_if(m_rows, [&id, &source](const QVariant& row) { const auto item = row.toMap(); return item.value("id").toString() == id && (source.isEmpty() || item.value("source").toString() == source) && item.value("cancellable").toBool() && !item.value("stale").toBool(); });
    if (found != m_rows.end()) {
        const auto actualSource = found->toMap().value("source").toString();
        if (source.isEmpty() && std::ranges::count_if(m_rows, [&id](const QVariant& row) { return row.toMap().value("id").toString() == id; }) != 1) { return; }
        request(false, id, actualSource);
    }
}
void ActivityController::request(bool more, const QString& cancelId, const QString& cancelSource) {
    if (busy() || !m_target || !m_timeline) { return; }
    const auto target = *m_target; const auto project = projectId(); const auto epoch = m_epoch; const auto call = m_call;
    const auto jobCursor = m_jobCursor, generationCursor = m_generationCursor;
    const auto knownRows = m_rows;
    QString cancelProcedure;
    if (!cancelId.isEmpty()) { for (const auto& row : m_rows) { if (row.toMap().value("id") == cancelId && row.toMap().value("source") == cancelSource) { cancelProcedure = row.toMap().value("source") == "Generation" ? "generations.cancel" : "jobs.cancel"; } } }
    const QPointer<ActivityController> guard(this);
    auto* worker = QThread::create([guard, target, project, epoch, call, more, jobCursor, generationCursor, cancelId, cancelProcedure, knownRows] {
        nt::server::ServerClient client(target.server, target.token, 5000);
        client.setExpectedInstance(target.expectedInstance); client.setDeadlineMs(5000);
        const auto invoke = [&](bool write, const QString& procedure, const QJsonObject& input) { return call ? call(write, procedure, input) : write ? client.mutate(procedure, input) : client.query(procedure, input); };
        Result result;
        if (!cancelProcedure.isEmpty()) {
            QJsonObject input{{"id", cancelId}};
            if (cancelProcedure == "generations.cancel" && !project.isEmpty()) { input.insert("project_id", project); }
            const auto cancelled = invoke(true, cancelProcedure, input);
            if (!cancelled.ok()) { result.error = "Cancellation: " + cancelled.describe(); }
        }
        std::vector<Page> pages;
        if (!more || !jobCursor.isEmpty()) { QJsonObject input{{"limit", 100}, {"include_outputs", false}}; if (!project.isEmpty()) { input.insert("project_id", project); } if (more) { input.insert("start_key", jobCursor); } pages.push_back({"jobs.list", input, false}); }
        if (!more || !generationCursor.isEmpty()) { QJsonObject input{{"limit", 100}}; if (!project.isEmpty()) { input.insert("project_id", project); } if (more) { input.insert("start_key", generationCursor); } pages.push_back({"generations.list", input, true}); }
        for (const auto& page : pages) {
            if (QThread::currentThread()->isInterruptionRequested()) { return; }
            const auto response = invoke(false, page.procedure, page.input);
            if (!response.ok()) { if (!result.error.isEmpty()) { result.error += "\n"; } result.error += page.procedure + ": " + response.describe(); continue; }
            const auto object = response.data.toObject();
            if (!response.data.isObject() || !object.value(page.generation ? "generations" : "jobs").isArray()) { result.error += "Invalid activity response from " + page.procedure; continue; }
            const auto values = object.value(page.generation ? "generations" : "jobs").toArray();
            for (const auto& value : values) {
                if (!value.isObject()) { result.error += "Invalid activity record"; continue; }
                const auto item = value.toObject();
                if (!project.isEmpty() && item.value("project_id").toString() != project) { continue; }
                const auto row = page.generation ? generationRow(item) : jobRow(item);
                if (!row.value("id").toString().isEmpty()) { result.rows.append(row); }
            }
            if (page.generation) { result.generationsFetched = true; result.generationCursor = object.value("next").toString(); }
            else { result.jobsFetched = true; result.jobCursor = object.value("next_start_key").toString(); }
        }
        if (!more) {
            QSet<QString> refreshed;
            for (const auto& value : result.rows) { const auto row = value.toMap(); refreshed.insert(row.value("source").toString() + ":" + row.value("id").toString()); }
            for (const auto& value : knownRows) {
                const auto row = value.toMap(); const auto source = row.value("source").toString(); const auto id = row.value("id").toString();
                const auto status = row.value("status").toString();
                const bool active = source == "Server job" ? activeJob(status) : status != "completed" && status != "failed" && status != "cancelled" && status != "interrupted" && status != "unavailable";
                if (!active || refreshed.contains(source + ":" + id) || (source != "Generation" && source != "Server job")) { continue; }
                if (QThread::currentThread()->isInterruptionRequested()) { return; }
                QJsonObject input{{"id", id}}; if (source == "Generation" && !project.isEmpty()) { input.insert("project_id", project); }
                const auto response = invoke(false, source == "Generation" ? "generations.get" : "jobs.get", input);
                if (!response.ok()) {
                    if (response.error.code == "NOT_FOUND") { auto unavailable = row; unavailable.insert("status", "unavailable"); unavailable.insert("detail", "This activity is no longer available from the server."); unavailable.insert("cancellable", false); result.rows.append(unavailable); }
                    else { result.error += "\nPreviously discovered activity: " + response.describe(); }
                    continue;
                }
                const auto item = response.data.toObject();
                if (!project.isEmpty() && item.value("project_id").toString() != project) { continue; }
                result.rows.append(source == "Generation" ? generationRow(item) : jobRow(item));
            }
            if (QThread::currentThread()->isInterruptionRequested()) { return; }
            QJsonObject input{{"page_size", 10000}, {"content_type", "video/"}};
            if (!project.isEmpty()) { input.insert("project_id", project); }
            const auto response = invoke(false, "assets.list", input);
            if (!response.ok()) { result.error += "\nProxies: " + response.describe(); }
            else if (!response.data.toObject().value("assets").isArray()) { result.error += "\nInvalid proxy activity response"; }
            else {
                result.proxiesFetched = true;
                const auto object = response.data.toObject();
                if (!object.value("next").isNull() && !object.value("next").toString().isEmpty()) { result.error += "\nProxy activity is limited to the first 10000 video assets. The server does not accept a proxy history cursor."; }
                for (const auto& value : object.value("assets").toArray()) {
                    const auto asset = value.toObject(); const auto status = asset.value("proxy_status").toString();
                    if (status.isEmpty() || status == "none" || asset.value("id").toString().isEmpty()) { continue; }
                    if (!project.isEmpty() && asset.value("project_id").toString() != project) { continue; }
                    result.rows.append(QVariantMap{{"id", asset.value("id").toString()}, {"source", "Proxy"}, {"kind", "Video proxy"}, {"title", asset.value("name").toString()}, {"status", status},
                        {"detail", "Server asset proxy status. Cancellation and progress are not reported by this source."}, {"progress", -1.0}, {"cost", "Not reported"}, {"cancellable", false}, {"updatedAt", asset.value("updated_at").toString()}});
                }
            }
        }
        if (!guard) { return; }
        QMetaObject::invokeMethod(guard, [guard, epoch, result, more] {
            if (!guard || guard->m_epoch != epoch) { return; }
            if (!more) { for (auto& value : guard->m_rows) { auto row = value.toMap(); row.insert("stale", true); value = row; } }
            QHash<QString, qsizetype> indices;
            for (qsizetype i = 0; i < guard->m_rows.size(); ++i) { const auto row = guard->m_rows[i].toMap(); indices.insert(row.value("source").toString() + ":" + row.value("id").toString(), i); }
            for (const auto& value : result.rows) {
                auto row = value.toMap();
                row.insert("stale", false);
                const auto key = row.value("source").toString() + ":" + row.value("id").toString();
                const auto existing = indices.constFind(key);
                if (existing == indices.cend()) { indices.insert(key, guard->m_rows.size()); guard->m_rows.append(row); }
                else { guard->m_rows[*existing] = row; }
            }
            std::stable_sort(guard->m_rows.begin(), guard->m_rows.end(), [](const QVariant& a, const QVariant& b) { return a.toMap().value("updatedAt").toString() > b.toMap().value("updatedAt").toString(); });
            if (result.jobsFetched) {
                if (more || result.jobCursor != guard->m_jobHeadCursor) { guard->m_jobCursor = result.jobCursor; }
                if (!more) { guard->m_jobHeadCursor = result.jobCursor; }
            }
            if (result.generationsFetched) {
                if (more || result.generationCursor != guard->m_generationHeadCursor) { guard->m_generationCursor = result.generationCursor; }
                if (!more) { guard->m_generationHeadCursor = result.generationCursor; }
            }
            guard->m_error = result.error; guard->m_stale = !result.jobsFetched && !result.generationsFetched && !result.proxiesFetched;
            if (!guard->m_stale) { guard->m_lastUpdated = QDateTime::currentDateTimeUtc().toString(Qt::ISODate); }
            emit guard->changed();
        }, Qt::QueuedConnection);
    });
    m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker, epoch] { if (m_worker == worker) { m_worker = nullptr; emit changed(); if (epoch != m_epoch) { refresh(); } } });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start(); emit changed();
}
