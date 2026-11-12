#include "music/MusicJobs.h"

#include "app/Preferences/PreferencesSettings.h"
#include "assets/AssetMedia.h"
#include "model/TimelineModel.h"
#include "music/MusicBounce.h"
#include "music/MusicDocument.h"
#include "music/MusicEdits.h"
#include "music/MusicPlan.h"
#include "music/MusicRange.h"
#include "server/AssetCache.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QQmlEngine>
#include <QSaveFile>
#include <QSet>
#include <QSettings>
#include <QThread>
#include <QUuid>

#include <algorithm>
#include <cmath>

namespace nt::music {
namespace {

QString newId() { return QUuid::createUuid().toString(QUuid::Id128); }

QString isoNow() { return QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs); }

qint64 nowMs() { return QDateTime::currentMSecsSinceEpoch(); }

bool isActive(const QString& state) {
    return state == u"rendering" || state == u"queued" || state == u"running" || state == u"placing";
}

bool isFinal(const QString& state) { return state == u"done" || state == u"failed" || state == u"cancelled"; }

QString text(std::string_view value) { return QString::fromUtf8(value.data(), static_cast<qsizetype>(value.size())); }

QJsonObject range(std::int64_t start, std::int64_t end) {
    return {{"start_frame", static_cast<qint64>(start)}, {"end_frame", static_cast<qint64>(end)}};
}

QString settingsKey(const QString& task, const QString& model) {
    auto name = model;
    name.replace(QLatin1Char('/'), QLatin1Char('_'));
    return QStringLiteral("music/expectedRunRatio/") + task + QLatin1Char('/') + name;
}

QString recordPrefix(const nt::server::SaveTarget& target) {
    return nt::server::safePathPart(target.timelineId) + QStringLiteral(".music-job-");
}

}  // namespace

// ---------------------------------------------------------------- list model

int MusicJobListModel::rowCount(const QModelIndex& parent) const {
    return parent.isValid() ? 0 : static_cast<int>(m_rows.size());
}

QVariant MusicJobListModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || index.row() < 0 || index.row() >= m_rows.size()) {
        return {};
    }
    const auto& row = m_rows[index.row()];
    switch (role) {
    case JobIdRole: return row.value("jobId");
    case StateRole: return row.value("state");
    case OperationRole: return row.value("operation");
    case ElapsedMsRole: {
        const auto finished = row.value("finishedAtMs").toLongLong();
        const auto submitted = row.value("submittedAtMs").toLongLong();
        return static_cast<double>((finished > 0 ? finished : nowMs()) - submitted);
    }
    case ExpectedMsRole: return row.value("expectedMs");
    case ErrorRole: return row.value("error");
    case ClipIdRole: return row.value("clipId");
    case TrackIdRole: return row.value("trackId");
    case StartFrameRole: return row.value("startFrame");
    case EndFrameRole: return row.value("endFrame");
    case ResubmitCountRole: return row.value("resubmitCount");
    case UnplacedTakesRole: return row.value("unplacedTakes");
    case CanCancelRole: return row.value("canCancel");
    case CanRetryRole: return row.value("canRetry");
    case CanPlaceRole: return row.value("canPlace");
    case TitleRole: return row.value("title");
    case PlacedCountRole: return row.value("placedCount");
    case SeedRole: return row.value("seed");
    default: return {};
    }
}

QHash<int, QByteArray> MusicJobListModel::roleNames() const {
    return {{JobIdRole, "jobId"},           {StateRole, "state"},
            {OperationRole, "operation"},   {ElapsedMsRole, "elapsedMs"},
            {ExpectedMsRole, "expectedMs"}, {ErrorRole, "error"},
            {ClipIdRole, "clipId"},         {TrackIdRole, "trackId"},
            {StartFrameRole, "startFrame"}, {EndFrameRole, "endFrame"},
            {ResubmitCountRole, "resubmitCount"}, {UnplacedTakesRole, "unplacedTakes"},
            {CanCancelRole, "canCancel"},   {CanRetryRole, "canRetry"},
            {CanPlaceRole, "canPlace"},     {TitleRole, "title"},
            {PlacedCountRole, "placedCount"}, {SeedRole, "seed"}};
}

void MusicJobListModel::setRows(QList<QVariantMap> rows) {
    bool sameIds = rows.size() == m_rows.size();
    for (qsizetype i = 0; sameIds && i < rows.size(); ++i) {
        sameIds = rows[i].value("jobId") == m_rows[i].value("jobId");
    }
    if (!sameIds) {
        beginResetModel();
        m_rows = std::move(rows);
        endResetModel();
        return;
    }
    m_rows = std::move(rows);
    if (!m_rows.isEmpty()) {
        emit dataChanged(index(0), index(static_cast<int>(m_rows.size() - 1)));
    }
}

void MusicJobListModel::tick() {
    if (!m_rows.isEmpty()) {
        emit dataChanged(index(0), index(static_cast<int>(m_rows.size() - 1)), {ElapsedMsRole});
    }
}

// ---------------------------------------------------------------- records

QJsonObject MusicJobs::Job::toJson() const {
    return {{"id", id},
            {"requestId", requestId},
            {"state", state},
            {"operation", operation},
            {"provider", provider},
            {"model", model},
            {"prompt", prompt},
            {"trackId", trackId},
            {"clipId", clipId},
            {"startFrame", static_cast<qint64>(startFrame)},
            {"endFrame", static_cast<qint64>(endFrame)},
            {"windowStartFrame", static_cast<qint64>(windowStartFrame)},
            {"requestFrames", static_cast<qint64>(requestFrames)},
            {"plan", plan},
            {"request", request},
            {"clip", clip},
            {"contextAssetId", contextAssetId},
            {"resubmitCount", resubmitCount},
            {"takes", takes},
            {"placedCount", placedCount},
            {"resultSeed", resultSeed},
            {"timing", timing},
            {"error", error},
            {"createdAt", createdAt},
            {"submittedAtMs", submittedAtMs},
            {"finishedAtMs", finishedAtMs},
            {"sent", sent}};
}

MusicJobs::Job MusicJobs::Job::fromJson(const QJsonObject& value) {
    Job job;
    job.id = value.value("id").toString();
    job.requestId = value.value("requestId").toString();
    job.state = value.value("state").toString();
    job.operation = value.value("operation").toString();
    job.provider = value.value("provider").toString();
    job.model = value.value("model").toString();
    job.prompt = value.value("prompt").toString();
    job.trackId = value.value("trackId").toString();
    job.clipId = value.value("clipId").toString();
    job.startFrame = value.value("startFrame").toInteger();
    job.endFrame = value.value("endFrame").toInteger();
    job.windowStartFrame = value.value("windowStartFrame").toInteger();
    job.requestFrames = value.value("requestFrames").toInteger();
    job.plan = value.value("plan").toObject();
    job.request = value.value("request").toObject();
    job.clip = value.value("clip").toObject();
    job.contextAssetId = value.value("contextAssetId").toString();
    job.resubmitCount = value.value("resubmitCount").toInt();
    job.takes = value.value("takes").toArray();
    job.placedCount = value.value("placedCount").toInt();
    job.resultSeed = value.value("resultSeed").toInteger(-1);
    job.timing = value.value("timing").toObject();
    job.error = value.value("error").toString();
    job.createdAt = value.value("createdAt").toString();
    job.submittedAtMs = value.value("submittedAtMs").toInteger();
    job.finishedAtMs = value.value("finishedAtMs").toInteger();
    job.sent = value.value("sent").toBool();
    return job;
}

// ---------------------------------------------------------------- lifetime

MusicJobs::MusicJobs(QObject* parent)
    : QObject(parent), m_transport(this), m_poll(this), m_reconnect(this), m_ticker(this),
      m_list(new MusicJobListModel(this)), m_mediaProtection(std::make_shared<nt::assets::MediaProtection>()) {
    qRegisterMetaType<nt::music::BounceResult>();
    m_poll.setInterval(kPollIntervalMs);
    m_ticker.setInterval(1000);
    m_reconnect.setSingleShot(true);
    connect(&m_poll, &QTimer::timeout, this, &MusicJobs::lookup);
    connect(&m_ticker, &QTimer::timeout, m_list, &MusicJobListModel::tick);
    connect(&m_reconnect, &QTimer::timeout, this, [this] {
        if (activeCount() > 0) open();
    });
    connect(&m_transport, &nt::ai::GenerationTransport::response, this, &MusicJobs::receive);
    connect(&m_transport, &nt::ai::GenerationTransport::error, this, &MusicJobs::setError);
    connect(&m_transport, &nt::ai::GenerationTransport::readyChanged, this, [this] {
        emit readyChanged();
        if (!m_transport.ready()) return;
        m_reconnect.stop();
        m_reconnectAttempts = 0;
        sendPending();
        lookup();
        updatePolling();
    });
    connect(&m_transport, &nt::ai::GenerationTransport::disconnected, this, [this] {
        m_poll.stop();
        if (activeCount() > 0 && m_target && m_reconnectAttempts < 5) {
            m_reconnect.start(std::min(30000, 1000 << m_reconnectAttempts++));
        }
    });
}

MusicJobs::~MusicJobs() {
    for (auto& worker : m_workers) {
        worker->requestInterruption();
    }
    for (auto& worker : m_workers) {
        worker->wait();
    }
    m_workers.clear();
    // Each MusicBounce joins its own worker.
    m_jobs.clear();
}

MusicJobs* MusicJobs::forTimeline(TimelineModel* timeline) {
    if (!timeline) return nullptr;
    if (auto* existing = timeline->findChild<MusicJobs*>(QString(), Qt::FindDirectChildrenOnly)) return existing;
    // Owned by the model through the Qt parent; QML never takes it.
    auto* jobs = new MusicJobs(timeline);
    QQmlEngine::setObjectOwnership(jobs, QQmlEngine::CppOwnership);
    jobs->setTimeline(timeline);
    return jobs;
}

void MusicJobs::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) return;
    if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
    reset();
    m_timeline = timeline;
    m_target = nt::server::serverSaveTarget();
    if (m_timeline) {
        connect(m_timeline, &TimelineModel::documentReplaced, this, [this] {
            // Another document under the same model: its own jobs.
            const auto target = nt::server::serverSaveTarget();
            if (target && m_target && target->timelineId == m_target->timelineId) return;
            reset();
            m_target = target;
            restore();
            publish();
            if (activeCount() > 0) open();
        });
        restore();
        if (activeCount() > 0) QTimer::singleShot(0, this, [this] { if (activeCount() > 0) open(); });
    }
    publish();
    emit timelineChanged();
}

void MusicJobs::reset() {
    m_transport.close();
    m_poll.stop();
    m_reconnect.stop();
    m_reconnectAttempts = 0;
    m_jobs.clear();
    m_mediaProtection->reset({});
}

bool MusicJobs::canonicalizeTarget() {
    if (!m_target || !m_timeline) {
        setError(QStringLiteral("Open a server timeline to generate music."));
        return false;
    }
    const auto canonical = m_timeline->timeline().raw.value("id").toString();
    const auto supplied = m_target->timelineId;
    if (!canonical.isEmpty() && supplied == canonical) return true;
    const auto isHex = [](QChar c) { return (c >= u'0' && c <= u'9') || (c >= u'a' && c <= u'f'); };
    if (canonical.size() == 32 && supplied.size() == 12 && std::all_of(canonical.cbegin(), canonical.cend(), isHex) &&
        canonical.startsWith(supplied)) {
        m_target->timelineId = canonical;
        return true;
    }
    setError(QStringLiteral("The server timeline does not match the open document."));
    return false;
}

void MusicJobs::open() {
    if (!canonicalizeTarget()) return;
    if (!m_target->expectedInstance.isEmpty()) {
        setError(QStringLiteral("Generation is unavailable for a server that requires instance verification."));
        return;
    }
    if (!m_transport.ready()) {
        m_transport.configure(m_target->server, m_target->token);
        m_transport.open();
    }
}

// ---------------------------------------------------------------- queries

MusicJobs::Job* MusicJobs::find(const QString& jobId) {
    for (auto& job : m_jobs) {
        if (job.id == jobId) return &job;
    }
    return nullptr;
}

const MusicJobs::Job* MusicJobs::find(const QString& jobId) const {
    for (const auto& job : m_jobs) {
        if (job.id == jobId) return &job;
    }
    return nullptr;
}

MusicJobs::Job* MusicJobs::findByRequest(const QString& requestId) {
    if (requestId.isEmpty()) return nullptr;
    for (auto& job : m_jobs) {
        if (job.requestId == requestId) return &job;
    }
    return nullptr;
}

int MusicJobs::activeCount() const {
    return static_cast<int>(std::count_if(m_jobs.begin(), m_jobs.end(), [](const Job& job) { return isActive(job.state); }));
}

QVariantList MusicJobs::bands() const {
    QVariantList out;
    for (const auto& job : m_jobs) {
        if (job.operation != u"repaint" || !isActive(job.state)) continue;
        out.append(QVariantMap{{"jobId", job.id},
                               {"clipId", job.clipId},
                               {"trackId", job.trackId},
                               {"startFrame", static_cast<qint64>(job.startFrame)},
                               {"endFrame", static_cast<qint64>(job.endFrame)},
                               {"state", job.state},
                               {"bars", barsText(job)},
                               {"contextStartFrame", static_cast<qint64>(job.windowStartFrame)},
                               {"contextEndFrame", static_cast<qint64>(job.windowStartFrame + job.requestFrames)}});
    }
    return out;
}

QString MusicJobs::barsText(const Job& job) const {
    if (!m_timeline || job.endFrame <= job.startFrame) return {};
    const auto tempo = sequenceTempo(m_timeline->timeline().raw);
    if (!tempo) return {};
    auto bars = barRangeLabel(FrameRange{job.startFrame, job.endFrame}, *tempo);
    bars[0] = bars[0].toLower();
    return bars;
}

QString MusicJobs::jobTitle(const Job& job, bool withBars) const {
    const auto task = parseTask(job.operation.toStdString());
    QString title = task ? text(taskLabel(*task)) : job.operation;
    if (m_timeline) {
        for (const auto& value : m_timeline->timeline().raw.value("tracks").toArray()) {
            if (value.toObject().value("id").toString() == job.trackId) title += QStringLiteral(" · ") + value.toObject().value("name").toString();
        }
    }
    const auto bars = withBars ? barsText(job) : QString();
    return bars.isEmpty() ? title : title + QStringLiteral(" · ") + bars;
}

QVariantMap MusicJobs::clipJobs() const {
    QVariantMap out;
    for (const auto& job : m_jobs) {
        if (job.clipId.isEmpty() || (!isActive(job.state) && job.state != u"failed")) continue;
        out.insert(job.clipId, QVariantMap{{"jobId", job.id}, {"state", job.state}, {"operation", job.operation},
                                           {"error", job.error}, {"title", jobTitle(job, false)}});
    }
    return out;
}

QVariantMap MusicJobs::row(const Job& job) const {
    const bool placeable = !job.takes.isEmpty() && (job.state == u"done" || job.state == u"failed");
    return {{"jobId", job.id},
            {"title", jobTitle(job, true)},
            {"placedCount", job.placedCount},
            {"seed", job.resultSeed},
            {"requestId", job.requestId},
            {"state", job.state},
            {"operation", job.operation},
            {"submittedAtMs", job.submittedAtMs},
            {"finishedAtMs", job.finishedAtMs},
            {"elapsedMs", static_cast<double>((job.finishedAtMs > 0 ? job.finishedAtMs : nowMs()) - job.submittedAtMs)},
            {"expectedMs", expectedMs(job.operation, job.model, static_cast<double>(job.requestFrames))},
            {"error", job.error},
            {"clipId", job.clipId},
            {"trackId", job.trackId},
            {"startFrame", static_cast<qint64>(job.startFrame)},
            {"endFrame", static_cast<qint64>(job.endFrame)},
            {"resubmitCount", job.resubmitCount},
            {"unplacedTakes", job.state == u"placing" ? 0 : static_cast<int>(job.takes.size())},
            {"canCancel", job.state == u"rendering" || job.state == u"queued" || job.state == u"running"},
            {"canRetry", job.state == u"failed" || job.state == u"cancelled"},
            {"canPlace", placeable}};
}

QStringList MusicJobs::contextAssetIds() const {
    QStringList ids;
    for (const auto& job : m_jobs) {
        if (!job.contextAssetId.isEmpty()) ids.append(job.contextAssetId);
    }
    return ids;
}

QVariantMap MusicJobs::job(const QString& jobId) const {
    const auto* found = find(jobId);
    return found ? row(*found) : QVariantMap{};
}

QVariantList MusicJobs::jobs() const {
    QVariantList out;
    for (const auto& job : m_jobs) out.append(row(job));
    return out;
}

double MusicJobs::expectedMs(const QString& task, const QString& model, double requestFrames) const {
    if (task.isEmpty() || !std::isfinite(requestFrames) || requestFrames <= 0) return 0;
    const auto settings = nt::app::openTimelinePreferences();
    const auto key = settingsKey(task, model);
    if (settings->value(key + QStringLiteral("/count")).toInt() <= 0) return 0;
    const double ratio = settings->value(key + QStringLiteral("/ratio")).toDouble();
    return std::isfinite(ratio) && ratio > 0 ? ratio * requestFrames / static_cast<double>(kSampleRate) * 1000.0 : 0;
}

void MusicJobs::recordTiming(const Job& job) {
    const double runMs = job.timing.value("lm_ms").toDouble() + job.timing.value("synth_ms").toDouble();
    const double generatedSeconds = static_cast<double>(job.requestFrames) / static_cast<double>(kSampleRate);
    if (!std::isfinite(runMs) || runMs <= 0 || generatedSeconds <= 0) return;
    const double ratio = runMs / 1000.0 / generatedSeconds;
    auto settings = nt::app::openTimelinePreferences();
    const auto key = settingsKey(job.operation, job.model);
    const int count = settings->value(key + QStringLiteral("/count")).toInt();
    const double previous = settings->value(key + QStringLiteral("/ratio")).toDouble();
    // A moving average over the last ten jobs of this kind.
    const int weight = std::min(count + 1, 10);
    const double next = count > 0 && std::isfinite(previous) ? previous + (ratio - previous) / weight : ratio;
    settings->setValue(key + QStringLiteral("/ratio"), next);
    settings->setValue(key + QStringLiteral("/count"), count + 1);
    settings->sync();
}

void MusicJobs::setError(const QString& error) {
    m_error = error;
    emit errorChanged();
}

void MusicJobs::setState(Job& job, const QString& state) {
    job.state = state;
    if (isFinal(state)) {
        if (job.finishedAtMs == 0) job.finishedAtMs = nowMs();
    } else {
        job.finishedAtMs = 0;
    }
    emit jobChanged(job.id, state);
}

void MusicJobs::publish() {
    QList<QVariantMap> rows;
    for (const auto& job : m_jobs) rows.append(row(job));
    m_list->setRows(std::move(rows));
    if (activeCount() > 0) {
        if (!m_ticker.isActive()) m_ticker.start();
    } else {
        m_ticker.stop();
    }
    updatePolling();
    emit jobsChanged();
}

void MusicJobs::updatePolling() {
    const bool polling = m_transport.ready() && std::any_of(m_jobs.begin(), m_jobs.end(), [](const Job& job) {
        return job.sent && (job.state == u"queued" || job.state == u"running");
    });
    if (polling && !m_poll.isActive()) m_poll.start();
    if (!polling) m_poll.stop();
}

// ---------------------------------------------------------------- persistence

QString MusicJobs::recordPath(const QString& jobId) const {
    return QDir(m_target->backupDir).filePath(recordPrefix(*m_target) + nt::server::safePathPart(jobId) + QStringLiteral(".json"));
}

bool MusicJobs::save(const Job& job) {
    if (!m_target || !QDir().mkpath(m_target->backupDir)) {
        setError(QStringLiteral("Could not create the music job folder."));
        return false;
    }
    QSaveFile file(recordPath(job.id));
    const auto bytes = QJsonDocument(job.toJson()).toJson(QJsonDocument::Compact);
    if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) {
        setError(QStringLiteral("Could not save the music job record."));
        return false;
    }
    return true;
}

void MusicJobs::restore() {
    if (!m_target || !m_timeline || !canonicalizeTarget()) return;
    const QDir folder(m_target->backupDir);
    const auto names = folder.entryList({recordPrefix(*m_target) + QStringLiteral("*.json")}, QDir::Files, QDir::Name);
    std::vector<Job> loaded;
    for (const auto& name : names) {
        QFile file(folder.filePath(name));
        if (!file.open(QIODevice::ReadOnly)) continue;
        QJsonParseError parseError;
        const auto document = QJsonDocument::fromJson(file.readAll(), &parseError);
        if (parseError.error != QJsonParseError::NoError || !document.isObject()) continue;
        auto job = Job::fromJson(document.object());
        if (job.id.isEmpty() || job.requestId.isEmpty() || find(job.id)) continue;
        job.recovered = true;
        loaded.push_back(std::move(job));
    }
    std::sort(loaded.begin(), loaded.end(), [](const Job& a, const Job& b) { return a.submittedAtMs < b.submittedAtMs; });
    for (auto& job : loaded) {
        m_jobs.push_back(std::move(job));
        auto& added = m_jobs.back();
        if (added.state == u"rendering") {
            // The bounce died with the app. Its snapshot is gone (MD16), so
            // only a Retry, which renders the current timeline, can go on.
            added.state = QStringLiteral("failed");
            added.error = QStringLiteral("The app closed while the context audio was rendering. Retry to render it again.");
            added.finishedAtMs = nowMs();
            save(added);
        } else if (added.state == u"placing") {
            // The takes are in the record: place them again (the edit skips takes already on the clip).
            const auto id = added.id;
            QTimer::singleShot(0, this, [this, id] {
                if (auto* job = find(id); job && job->state == u"placing") place(*job, false);
            });
        }
    }
}

// ---------------------------------------------------------------- submission

bool MusicJobs::canStart() {
    if (!m_timeline || !m_target) {
        setError(QStringLiteral("Open a server timeline to generate music."));
        return false;
    }
    if (!canonicalizeTarget()) return false;
    if (!m_target->expectedInstance.isEmpty()) {
        setError(QStringLiteral("Generation is unavailable for a server that requires instance verification."));
        return false;
    }
    if (activeCount() >= kMaxActiveJobs) {
        setError(QStringLiteral("Eight music jobs are already running on this timeline. Wait for one to finish."));
        return false;
    }
    return true;
}

QString MusicJobs::submit(const QString& trackId, double startFrame, double endFrame, const QString& operation,
                          const QString& prompt, int candidates, double seed, const QString& model,
                          const QVariantMap& options) {
    if (!canStart()) return {};
    if (prompt.trimmed().isEmpty() || model.trimmed().isEmpty()) {
        setError(QStringLiteral("Enter a prompt and choose a model before generating."));
        return {};
    }
    if (candidates < 1 || candidates > 4) {
        setError(QStringLiteral("Choose from 1 to 4 candidates."));
        return {};
    }
    std::optional<MusicTask> override;
    if (!operation.isEmpty()) {
        override = parseTask(operation.toStdString());
        if (!override) {
            setError(QStringLiteral("Unknown music operation: ") + operation);
            return {};
        }
    }
    const auto& raw = m_timeline->timeline().raw;
    QJsonObject planJson{{"tempo", raw.value("tempo")},
                         {"selection", QJsonObject{{"trackId", trackId}, {"startFrame", startFrame}, {"endFrame", endFrame}}},
                         {"tracks", raw.value("tracks")},
                         {"clips", m_timeline->clipsJson()}};
    if (override) planJson.insert("operation", text(taskName(*override)));
    const auto input = planInputFromJson(planJson);
    if (const auto refusal = musicTempoRefusal(input.tempo); !refusal.empty()) {
        setError(QString::fromStdString(refusal));
        return {};
    }
    const auto plan = planMusicOperation(input);
    if (!plan.refusal.empty() || !plan.operation || !plan.windowStartFrame || !plan.requestFrames) {
        setError(QString::fromStdString(plan.refusal.empty() ? plan.reason : plan.refusal));
        return {};
    }
    const auto task = *plan.operation;
    const auto provider = options.value("provider", QStringLiteral("acestep")).toString();
    const auto jobId = newId();

    Job job;
    job.id = jobId;
    job.requestId = jobId;
    job.operation = text(taskName(task));
    job.provider = provider;
    job.model = model.trimmed();
    job.prompt = prompt.trimmed();
    job.trackId = trackId;
    job.startFrame = static_cast<std::int64_t>(plan.target.startFrame);
    job.endFrame = static_cast<std::int64_t>(plan.target.endFrame);
    job.windowStartFrame = *plan.windowStartFrame;
    job.requestFrames = *plan.requestFrames;
    job.plan = planToJson(plan);
    job.createdAt = isoNow();
    job.submittedAtMs = nowMs();

    QJsonObject music{{"task", job.operation},
                      {"bpm", static_cast<int>(plan.bpm)},
                      {"beats_per_bar", static_cast<int>(plan.beatsPerBar)},
                      {"beat_unit", static_cast<int>(plan.beatUnit)},
                      {"candidates", candidates},
                      {"request_frames", static_cast<qint64>(*plan.requestFrames)},
                      {"window_start_frame", static_cast<qint64>(*plan.windowStartFrame)}};
    if (plan.key) {
        music.insert("key", QJsonObject{{"tonic", QString::fromStdString(plan.key->tonic)},
                                        {"mode", QString::fromStdString(plan.key->mode)}});
    }
    if (std::isfinite(seed) && seed >= 0) music.insert("seed", static_cast<qint64>(std::floor(seed)));
    if (options.contains("steps")) music.insert("steps", options.value("steps").toInt());
    if (!options.value("lmModel").toString().isEmpty()) music.insert("lm_model", options.value("lmModel").toString());
    if (!options.value("audioCodes").toString().isEmpty()) music.insert("audio_codes", options.value("audioCodes").toString());
    if (task == MusicTask::Text2Music) {
        QJsonArray segments;
        for (const auto& segment : plan.segments.value_or(std::vector<FrameRange>{})) {
            segments.append(range(segment.startFrame, segment.endFrame));
        }
        music.insert("segments", segments);
        music.insert("beat_phase_frames", static_cast<qint64>(plan.beatPhaseFrames.value_or(0)));
        music.insert("align", true);
    } else {
        if (!plan.region) {
            setError(QStringLiteral("The plan has no region."));
            return {};
        }
        music.insert("region", range(plan.region->startFrame, plan.region->endFrame));
        if (plan.beatPhaseFrames) music.insert("beat_phase_frames", static_cast<qint64>(*plan.beatPhaseFrames));
    }
    if (task == MusicTask::Repaint) {
        if (!plan.splice || !plan.clipId) {
            setError(QStringLiteral("The clip has no active take to regenerate."));
            return {};
        }
        music.insert("splice", QJsonObject{{"parent_asset_id", QString::fromStdString(plan.splice->parentAssetId)},
                                           {"start_frame", static_cast<qint64>(plan.splice->startFrame)},
                                           {"end_frame", static_cast<qint64>(plan.splice->endFrame)}});
        job.clipId = QString::fromStdString(*plan.clipId);
        for (const auto& value : m_timeline->clipsJson()) {
            if (value.toObject().value("id").toString() == job.clipId) job.clip = value.toObject();
        }
    } else {
        job.clipId = newId();
        job.clip = placeholderClip(job.clipId, trackId, job.startFrame, job.endFrame, job.prompt, provider, job.model);
    }
    if (task == MusicTask::Lego) {
        if (!plan.trackRole) {
            setError(QStringLiteral("Choose a role for the target track before adding an instrument."));
            return {};
        }
        music.insert("track_role", QString::fromStdString(*plan.trackRole));
    }
    job.request = QJsonObject{{"mode", "music"},
                              {"provider", provider},
                              {"model", job.model},
                              {"prompt", job.prompt},
                              {"timeline_context", QJsonObject{{"sequence_id", m_target->timelineId},
                                                               {"target_clip_id", job.clipId}}},
                              {"music", music}};

    if (task == MusicTask::Text2Music) {
        job.state = QStringLiteral("queued");
        if (m_timeline->applyEdit("music.insertPlaceholder", QJsonObject{{"clip", job.clip}}) == 0) {
            setError(QStringLiteral("Choose an empty range on an unlocked audio track."));
            return {};
        }
        m_jobs.push_back(std::move(job));
        auto& added = m_jobs.back();
        send(added);
    } else {
        // The snapshot of this turn is the context, whatever happens after (MD16).
        const auto snapshot = m_timeline->snapshot();
        job.state = QStringLiteral("rendering");
        if (!save(job)) return {};
        m_jobs.push_back(std::move(job));
        startBounce(m_jobs.back(), *snapshot);
    }
    m_error.clear();
    emit errorChanged();
    const auto& submitted = m_jobs.back();
    emit jobSubmitted(submitted.id, submitted.clipId);
    publish();
    return jobId;
}

QString MusicJobs::regenerate(const QString& clipId, const QString& takeId, bool sameSeed) {
    if (!canStart()) return {};
    QJsonObject clip;
    for (const auto& value : m_timeline->clipsJson()) {
        if (value.toObject().value("id").toString() == clipId) clip = value.toObject();
    }
    QJsonObject version;
    for (const auto& value : clip.value("versions").toArray()) {
        if (value.toObject().value("id").toString() == takeId) version = value.toObject();
    }
    const auto record = musicGeneration(version);
    const auto task = parseTask(record.value("task").toString().toStdString());
    const auto model = version.value("model").toString(clip.value("model").toString());
    const auto prompt = version.value("prompt").toString(clip.value("prompt").toString());
    if (clip.isEmpty() || !task || model.isEmpty() || prompt.trimmed().isEmpty()) {
        setError(QStringLiteral("This take has no generation record to regenerate from."));
        return {};
    }
    const std::int64_t targetStart = record.value("targetStartFrame").toInteger(-1);
    const std::int64_t targetEnd = record.value("targetEndFrame").toInteger(-1);
    if (targetStart < 0 || targetEnd <= targetStart) {
        setError(QStringLiteral("The take's record has no target range."));
        return {};
    }
    const auto tempo = record.value("bpm").toInt();
    QJsonObject music{{"task", record.value("task")},
                      {"bpm", tempo},
                      {"beats_per_bar", record.value("beatsPerBar").toInt()},
                      {"beat_unit", record.value("beatUnit").toInt()},
                      {"candidates", 1}};
    if (record.value("key").isObject()) music.insert("key", record.value("key"));
    if (record.value("steps").toInt() > 0) music.insert("steps", record.value("steps").toInt());
    if (!record.value("lmModel").toString().isEmpty()) music.insert("lm_model", record.value("lmModel"));
    if (sameSeed) {
        if (!record.value("seed").isDouble()) {
            setError(QStringLiteral("The take's record has no seed."));
            return {};
        }
        music.insert("seed", record.value("seed").toInteger());
        if (!record.value("audioCodes").toString().isEmpty()) music.insert("audio_codes", record.value("audioCodes"));
    }

    const auto jobId = newId();
    Job job;
    job.id = jobId;
    job.requestId = jobId;
    job.operation = text(taskName(*task));
    job.provider = version.value("provider").toString(QStringLiteral("acestep"));
    job.model = model;
    job.prompt = prompt.trimmed();
    job.trackId = clip.value("trackId").toString();
    job.clipId = clipId;
    job.clip = clip;
    job.startFrame = targetStart;
    job.endFrame = targetEnd;
    job.createdAt = isoNow();
    job.submittedAtMs = nowMs();
    if (*task == MusicTask::Text2Music) {
        // The window the take was cut from starts `segmentIndex` take lengths
        // before it. Generate has no context, so the planner gives the same
        // window again from the tempo alone.
        const auto length = targetEnd - targetStart;
        const auto segment = record.value("segmentIndex").toInt();
        const auto windowStart = targetStart - segment * length;
        PlanInput input;
        input.tempo.bpm = tempo;
        input.tempo.offsetMs = m_timeline->timeline().raw.value("tempo").toObject().value("offsetMs").toDouble();
        input.tempo.beatsPerBar = music.value("beats_per_bar").toInt();
        input.tempo.beatUnit = music.value("beat_unit").toInt();
        input.selection = Selection{job.trackId.toStdString(), static_cast<double>(windowStart), static_cast<double>(windowStart + length)};
        input.tracks.push_back(PlanTrack{job.trackId.toStdString(), "audio"});
        input.operation = MusicTask::Text2Music;
        const auto plan = planMusicOperation(input);
        if (windowStart < 0 || !plan.refusal.empty() || !plan.segments || segment < 0 ||
            segment >= static_cast<int>(plan.segments->size())) {
            setError(QStringLiteral("The take's record does not fit the project's tempo."));
            return {};
        }
        const auto& segmentRange = (*plan.segments)[static_cast<std::size_t>(segment)];
        job.windowStartFrame = windowStart;
        job.requestFrames = *plan.requestFrames;
        job.plan = planToJson(plan);
        music.insert("segments", QJsonArray{range(segmentRange.startFrame, segmentRange.endFrame)});
        music.insert("beat_phase_frames", static_cast<qint64>(plan.beatPhaseFrames.value_or(0)));
        music.insert("align", true);
    } else {
        const std::int64_t windowStart = record.value("contextStartFrame").toInteger(-1);
        const std::int64_t windowEnd = record.value("contextEndFrame").toInteger(-1);
        job.contextAssetId = record.value("contextAssetId").toString();
        if (job.contextAssetId.isEmpty() || windowStart < 0 || windowEnd <= windowStart || targetStart < windowStart ||
            targetEnd > windowEnd) {
            setError(QStringLiteral("This take has no context audio to regenerate from."));
            return {};
        }
        job.windowStartFrame = windowStart;
        job.requestFrames = windowEnd - windowStart;
        music.insert("context_asset_id", job.contextAssetId);
        music.insert("region", range(targetStart - windowStart, targetEnd - windowStart));
        if (*task == MusicTask::Repaint) {
            const auto splice = record.value("splice").toObject();
            if (splice.value("parentAssetId").toString().isEmpty()) {
                setError(QStringLiteral("The take's record has no parent audio."));
                return {};
            }
            music.insert("splice", QJsonObject{{"parent_asset_id", splice.value("parentAssetId")},
                                               {"start_frame", splice.value("startFrame").toInteger()},
                                               {"end_frame", splice.value("endFrame").toInteger()}});
        } else if (!record.value("trackRole").toString().isEmpty()) {
            music.insert("track_role", record.value("trackRole"));
        }
    }
    music.insert("request_frames", static_cast<qint64>(job.requestFrames));
    music.insert("window_start_frame", static_cast<qint64>(job.windowStartFrame));
    job.request = QJsonObject{{"mode", "music"},
                              {"provider", job.provider},
                              {"model", job.model},
                              {"prompt", job.prompt},
                              {"timeline_context", QJsonObject{{"sequence_id", m_target->timelineId},
                                                               {"target_clip_id", job.clipId}}},
                              {"music", music}};
    job.state = QStringLiteral("queued");
    m_jobs.push_back(std::move(job));
    send(m_jobs.back());
    m_error.clear();
    emit errorChanged();
    emit jobSubmitted(jobId, clipId);
    publish();
    return jobId;
}

void MusicJobs::startBounce(Job& job, const nt::Timeline& snapshot) {
    MusicBounce::Job work;
    work.timeline = snapshot;
    work.kind = job.operation == u"repaint" ? BounceKind::Dry : BounceKind::Mix;
    work.targetTrackId = job.trackId.toStdString();
    work.startFrame = job.windowStartFrame;
    work.frames = job.requestFrames;
    work.upload = m_target;
    work.metadata = QJsonObject{{"music_job_id", job.id}, {"sequence_id", m_target->timelineId}};
    job.bounce = std::make_unique<MusicBounce>();
    // Queued: the slot destroys the bounce, which must not happen inside its own signal.
    connect(job.bounce.get(), &MusicBounce::finished, this,
            [this, id = job.id](const BounceResult& result) { bounceFinished(id, result); }, Qt::QueuedConnection);
    if (!job.bounce->start(std::move(work))) {
        job.bounce.reset();
        fail(job, QStringLiteral("The context window is empty."));
    }
}

void MusicJobs::bounceFinished(const QString& jobId, const BounceResult& result) {
    auto* job = find(jobId);
    if (!job || job->state != u"rendering") return;
    job->bounce.reset();
    if (!result.ok) {
        fail(*job, result.error);
        return;
    }
    job->contextAssetId = result.assetId;
    auto music = job->request.value("music").toObject();
    music.insert("context_asset_id", result.assetId);
    job->request.insert("music", music);
    if (job->operation == u"lego" && !insertPlaceholder(*job)) {
        fail(*job, QStringLiteral("The target range is no longer empty, or its track is locked."));
        return;
    }
    setState(*job, QStringLiteral("queued"));
    send(*job);
    publish();
}

bool MusicJobs::insertPlaceholder(Job& job) {
    if (!m_timeline) return false;
    if (m_timeline->findClip(job.clipId)) return true;
    return m_timeline->applyEdit("music.insertPlaceholder", QJsonObject{{"clip", job.clip}}) != 0;
}

void MusicJobs::send(Job& job) {
    if (!m_transport.ready()) {
        // Sent when the socket is ready (sendPending).
        job.sent = false;
        save(job);
        open();
        return;
    }
    job.sent = true;
    if (!save(job)) {
        job.sent = false;
        fail(job, m_error);
        return;
    }
    if (!m_transport.send(QStringLiteral("generate_media"), job.request, job.requestId)) {
        job.sent = false;
        save(job);
        return;
    }
    updatePolling();
}

void MusicJobs::sendPending() {
    bool any = false;
    for (auto& job : m_jobs) {
        if (job.state == u"queued" && !job.sent) {
            send(job);
            any = true;
        }
    }
    if (any) publish();
}

// ---------------------------------------------------------------- replies

void MusicJobs::lookup() {
    if (!m_transport.ready()) return;
    QJsonArray ids;
    for (const auto& job : m_jobs) {
        if (job.sent && (job.state == u"queued" || job.state == u"running")) ids.append(job.requestId);
    }
    if (ids.isEmpty()) return;
    m_transport.send(QStringLiteral("lookup_generations"), {{"request_ids", ids}}, newId());
}

void MusicJobs::receive(const QJsonObject& message) {
    const auto requestId = message.value("request_id").toString();
    if (auto* job = findByRequest(requestId)) {
        if (job->state != u"queued" && job->state != u"running") return;
        if (message.value("error").isObject()) {
            fail(*job, message.value("error").toObject().value("message").toString());
        } else {
            const auto result = message.value("result").toObject();
            complete(*job, result.value("music_takes").toArray(), result.value("timing").toObject());
        }
        publish();
        return;
    }
    const auto command = message.value("command").toString();
    if (command == u"cancel_generation" && message.value("error").isObject()) {
        setError(message.value("error").toObject().value("message").toString());
        return;
    }
    if (command != u"lookup_generations" || message.value("error").isObject()) return;
    QSet<QString> seen;
    for (const auto& value : message.value("result").toObject().value("generations").toArray()) {
        const auto row = value.toObject();
        const auto id = row.value("request_id").toString();
        if (seen.contains(id)) continue;
        seen.insert(id);
        if (auto* job = findByRequest(id); job && (job->state == u"queued" || job->state == u"running")) {
            job->missingLookups = 0;
            applyRow(*job, row);
        }
    }
    // A recovered job the server has no row for twice in a row was lost
    // with the old connection (the row is written when the work starts).
    for (auto& job : m_jobs) {
        if (!job.recovered || !job.sent || seen.contains(job.requestId) ||
            (job.state != u"queued" && job.state != u"running")) {
            continue;
        }
        if (++job.missingLookups >= 2) {
            interrupted(job, QStringLiteral("The server has no record of this job."));
        }
    }
    publish();
}

void MusicJobs::applyRow(Job& job, const QJsonObject& row) {
    const auto status = row.value("status").toString();
    if (status == u"completed") {
        complete(job, row.value("music_takes").toArray(), row.value("timing").toObject());
    } else if (status == u"failed" || status == u"needs_attention") {
        const auto error = row.value("error").toString();
        fail(job, error.isEmpty() ? QStringLiteral("The music job failed.") : error);
    } else if (status == u"cancelled") {
        job.error = row.value("error").toString();
        setState(job, QStringLiteral("cancelled"));
        save(job);
    } else if (status == u"interrupted") {
        interrupted(job, row.value("error").toString());
    } else {
        const auto backend = row.value("music_status").toString();
        const auto next = backend == u"running" || (backend.isEmpty() && status == u"running") ? QStringLiteral("running")
                                                                                                  : QStringLiteral("queued");
        if (next != job.state) {
            setState(job, next);
            save(job);
        }
    }
}

void MusicJobs::complete(Job& job, const QJsonArray& takes, const QJsonObject& timing) {
    if (takes.isEmpty()) {
        fail(job, QStringLiteral("The music job returned no takes."));
        return;
    }
    job.takes = takes;
    job.timing = timing;
    job.error.clear();
    recordTiming(job);
    setState(job, QStringLiteral("placing"));
    save(job);
    place(job, false);
}

void MusicJobs::fail(Job& job, const QString& error) {
    job.error = error.isEmpty() ? QStringLiteral("The music job failed.") : error;
    setState(job, QStringLiteral("failed"));
    save(job);
    publish();
}

void MusicJobs::interrupted(Job& job, const QString& error) {
    // JB-2 second layer: an ace-server job does not outlive the server, and a
    // repeat costs time, not money. Paid providers never resubmit.
    if (job.provider == u"acestep" && job.resubmitCount < kMaxResubmits) {
        ++job.resubmitCount;
        resend(job);
        return;
    }
    const auto reason = error.isEmpty() ? QStringLiteral("The server stopped while running this job.") : error;
    fail(job, job.resubmitCount > 0 ? QStringLiteral("The job was interrupted again after one resubmit. ") + reason : reason);
}

void MusicJobs::resend(Job& job) {
    job.requestId = newId();
    job.sent = false;
    job.recovered = false;
    job.missingLookups = 0;
    job.error.clear();
    setState(job, QStringLiteral("queued"));
    send(job);
}

// ---------------------------------------------------------------- placement

void MusicJobs::place(Job& job, bool reinsert) {
    if (!m_target || !m_timeline) return;
    QStringList assets;
    for (const auto& value : job.takes) {
        const auto assetId = value.toObject().value("asset_id").toString();
        if (assetId.isEmpty()) {
            fail(job, QStringLiteral("A take has no asset."));
            return;
        }
        assets.append(assetId);
    }
    const auto target = *m_target;
    const auto protection = m_mediaProtection;
    const auto generation = protection->generation();
    const QPointer<MusicJobs> self(this);
    const auto jobId = job.id;
    const auto requestId = job.requestId;
    auto worker = std::unique_ptr<QThread>(QThread::create([self, target, protection, generation, assets, jobId, requestId, reinsert] {
        nt::server::ServerClient client(target.server, target.token);
        client.setExpectedInstance(target.expectedInstance);
        const auto cacheRoot = QDir::cleanPath(QDir(target.backupDir).absoluteFilePath(QStringLiteral("../../..")));
        QList<nt::Clip> media;
        QString error;
        for (const auto& assetId : assets) {
            if (QThread::currentThread()->isInterruptionRequested()) return;
            const auto asset = client.getAsset(assetId);
            if (!asset.ok()) {
                error = asset.describe();
                break;
            }
            const QJsonObject raw{{"mediaType", "audio"}, {"currentAssetId", assetId}};
            auto resolved = nt::assets::resolveDroppedMedia(client, cacheRoot, asset.data.toObject(), raw, *protection, generation);
            if (resolved.audioPath.empty() && resolved.mediaPath.empty()) {
                error = QStringLiteral("Take ") + assetId + QStringLiteral(" could not be downloaded.");
                break;
            }
            resolved.raw = raw;
            media.append(std::move(resolved));
        }
        // `self` outlives this thread: ~MusicJobs joins it first.
        QMetaObject::invokeMethod(
            self.data(),
            [self, jobId, requestId, reinsert, media, error] {
                if (self) self->placed(jobId, requestId, reinsert, media, error);
            },
            Qt::QueuedConnection);
    }));
    auto* started = worker.get();
    connect(started, &QThread::finished, this, [this, started] {
        const auto it = std::find_if(m_workers.begin(), m_workers.end(), [started](const auto& w) { return w.get() == started; });
        if (it != m_workers.end()) {
            (*it)->wait();
            m_workers.erase(it);
        }
    }, Qt::QueuedConnection);
    m_workers.push_back(std::move(worker));
    started->start();
}

void MusicJobs::placed(const QString& jobId, const QString& requestId, bool reinsert, const QList<nt::Clip>& media,
                       const QString& error) {
    auto* job = find(jobId);
    if (!job || job->requestId != requestId || job->state != u"placing" || !m_timeline) return;
    if (!error.isEmpty()) {
        fail(*job, QStringLiteral("The takes could not be downloaded: ") + error);
        return;
    }
    for (const auto& clip : media) m_timeline->registerMedia(clip);
    QJsonArray takes;
    for (const auto& value : job->takes) {
        const auto take = value.toObject();
        takes.append(QJsonObject{{"assetId", take.value("asset_id")},
                                 {"candidate", take.value("candidate")},
                                 {"segment", take.value("segment")},
                                 {"record", take.value("record")}});
    }
    QJsonObject payload{{"clipId", job->clipId},
                        {"task", job->operation},
                        {"requestId", job->requestId},
                        {"jobId", job->id},
                        {"provider", job->provider},
                        {"model", job->model},
                        {"prompt", job->prompt},
                        {"createdAt", isoNow()},
                        {"takes", takes}};
    if (reinsert && job->operation != u"repaint") payload.insert("insertClip", job->clip);
    const bool present = m_timeline->findClip(job->clipId) != nullptr;
    bool alreadyPlaced = present;
    if (present) {
        // A repeated placement after a reopen: every take is on the clip already.
        QSet<QString> held;
        for (const auto& value : m_timeline->findClip(job->clipId)->raw.value("versions").toArray()) {
            held.insert(value.toObject().value("assetId").toString());
        }
        for (const auto& value : takes) alreadyPlaced = alreadyPlaced && held.contains(value.toObject().value("assetId").toString());
    }
    if (alreadyPlaced || m_timeline->applyEdit("music.applyResult", payload) != 0) {
        job->placedCount = static_cast<int>(job->takes.size());
        job->resultSeed = job->takes.first().toObject().value("record").toObject().value("seed").toInteger(-1);
        job->takes = {};
        job->error.clear();
    } else {
        // The takes stay in the record; placeOrphan places them.
        job->error = present ? QStringLiteral("The clip is locked or changed. Place the takes from the job list.")
                             : QStringLiteral("The placeholder was removed. Place the takes from the job list.");
    }
    setState(*job, QStringLiteral("done"));
    save(*job);
    publish();
}

// ---------------------------------------------------------------- actions

bool MusicJobs::cancel(const QString& jobId) {
    auto* job = find(jobId);
    if (!job || (job->state != u"rendering" && job->state != u"queued" && job->state != u"running")) return false;
    if (job->sent) {
        if (!m_transport.send(QStringLiteral("cancel_generation"), {{"request_ids", QJsonArray{job->requestId}}}, newId())) {
            setError(QStringLiteral("Connect to the server to cancel this job."));
            return false;
        }
    }
    if (job->bounce) {
        job->bounce->cancel();
        job->bounce.reset();
    }
    if (job->operation != u"repaint" && m_timeline) {
        const auto before = m_timeline->clipsJson();
        QJsonArray after;
        bool removed = false;
        for (const auto& value : before) {
            const auto clip = value.toObject();
            if (clip.value("id").toString() == job->clipId && clip.value("status").toString() == u"queued") {
                removed = true;
                continue;
            }
            after.append(value);
        }
        if (removed) m_timeline->commitEdit(QStringLiteral("Cancel music job"), before, after);
    }
    job->error.clear();
    setState(*job, QStringLiteral("cancelled"));
    save(*job);
    publish();
    return true;
}

bool MusicJobs::retry(const QString& jobId) {
    auto* job = find(jobId);
    if (!job || (job->state != u"failed" && job->state != u"cancelled") || !m_timeline || !m_target) return false;
    if (activeCount() >= kMaxActiveJobs) {
        setError(QStringLiteral("Eight music jobs are already running on this timeline. Wait for one to finish."));
        return false;
    }
    job->resubmitCount = 0;
    job->error.clear();
    job->requestId = newId();
    job->sent = false;
    job->recovered = false;
    job->missingLookups = 0;
    job->submittedAtMs = nowMs();
    if (job->operation != u"text2music" && job->contextAssetId.isEmpty()) {
        setState(*job, QStringLiteral("rendering"));
        save(*job);
        startBounce(*job, *m_timeline->snapshot());
        publish();
        return true;
    }
    if (job->operation != u"repaint" && !insertPlaceholder(*job)) {
        fail(*job, QStringLiteral("The target range is no longer empty, or its track is locked."));
        return false;
    }
    setState(*job, QStringLiteral("queued"));
    send(*job);
    publish();
    return true;
}

bool MusicJobs::placeOrphan(const QString& jobId) {
    auto* job = find(jobId);
    if (!job || job->takes.isEmpty() || (job->state != u"done" && job->state != u"failed")) return false;
    job->error.clear();
    setState(*job, QStringLiteral("placing"));
    save(*job);
    place(*job, true);
    publish();
    return true;
}

bool MusicJobs::dismiss(const QString& jobId) {
    const auto it = std::find_if(m_jobs.begin(), m_jobs.end(), [&](const Job& job) { return job.id == jobId; });
    if (it == m_jobs.end() || !isFinal(it->state)) return false;
    QFile::remove(recordPath(jobId));
    m_jobs.erase(it);
    publish();
    return true;
}

} // namespace nt::music
