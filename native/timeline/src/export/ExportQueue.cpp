// Behaviour follows FilmCraft (https://github.com/storytold/filmcraft), crates/ui-egui/src/panels/export_mode, MIT. See licenses/FilmCraft-MIT.txt.
#include "export/ExportQueue.h"
#include "assets/AssetMedia.h"
#include <QDir>
#include <QFileInfo>
#include <QUrl>
#include <QUuid>
#include <algorithm>
#include <utility>

namespace {
bool unfinished(const QString& state) { return state == u"queued" || state == u"running"; }
QString detail(const QString& state, const QString& phase, qint64 frame, qint64 total, const QString& error) {
    if (state == u"queued") { return QStringLiteral("Waiting"); }
    if (state == u"done") { return QStringLiteral("Saved"); }
    if (state == u"failed") { return error; }
    if (state == u"cancelled") { return QStringLiteral("Cancelled"); }
    if (phase == u"audio") { return QStringLiteral("Mixing audio…"); }
    if (phase == u"encoding") { return QStringLiteral("Encoding frame %1 / %2").arg(frame).arg(total); }
    if (phase == u"finalizing") { return QStringLiteral("Finalizing…"); }
    return QStringLiteral("Preparing…");
}
}
ExportQueue::ExportQueue(QObject* parent) : QAbstractListModel(parent) {
    connect(&m_runner, &ExportController::progressChanged, this, &ExportQueue::updateProgress);
    connect(&m_runner, &ExportController::finished, this, &ExportQueue::finish);
}
ExportQueue::~ExportQueue() {
    // The runner shuts down before the queued snapshots and leases are destroyed.
    disconnect(&m_runner, nullptr, this, nullptr);
    m_runner.cancel();
}
void ExportQueue::setTimeline(TimelineModel* model) {
    if (m_timeline == model) { return; }
    m_timeline = model;
    emit timelineChanged();
}
int ExportQueue::rowCount(const QModelIndex& parent) const {
    return parent.isValid() ? 0 : static_cast<int>(m_jobs.size());
}
QVariant ExportQueue::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || index.column() != 0 || index.row() < 0 || index.row() >= rowCount()) { return {}; }
    const auto name = roleNames().value(role);
    if (name.isEmpty()) { return {}; }
    return values(m_jobs[index.row()]).value(QString::fromUtf8(name));
}
QHash<int, QByteArray> ExportQueue::roleNames() const {
    return {{Qt::UserRole + 1, "jobId"}, {Qt::UserRole + 2, "name"}, {Qt::UserRole + 3, "output"},
        {Qt::UserRole + 4, "fileName"}, {Qt::UserRole + 5, "presetName"}, {Qt::UserRole + 6, "formatLabel"},
        {Qt::UserRole + 7, "state"}, {Qt::UserRole + 8, "phase"}, {Qt::UserRole + 9, "ratio"},
        {Qt::UserRole + 10, "frame"}, {Qt::UserRole + 11, "totalFrames"}, {Qt::UserRole + 12, "error"},
        {Qt::UserRole + 13, "detail"}};
}
int ExportQueue::activeCount() const {
    return static_cast<int>(std::count_if(m_jobs.begin(), m_jobs.end(), [](const auto& job) { return unfinished(job.state); }));
}
QString ExportQueue::refuse(const QString& error) {
    if (m_lastError != error) {
        m_lastError = error;
        emit lastErrorChanged();
    }
    return {};
}
QString ExportQueue::enqueue(const QString& output, const QVariantMap& settings, const QString& presetName) {
    if (!m_timeline) { return refuse(QStringLiteral("Open a timeline before exporting.")); }
    const auto path = QUrl(output).isLocalFile() ? QUrl(output).toLocalFile() : output;
    const QFileInfo destination(path);
    if (path.isEmpty() || !destination.dir().exists()) {
        return refuse(QStringLiteral("The folder for this export does not exist."));
    }
    const auto absolute = QDir(destination.dir().canonicalPath()).filePath(destination.fileName());
    for (const auto& job : m_jobs) {
        if (unfinished(job.state) && job.output == absolute) {
            return refuse(QStringLiteral("Another queued export already writes %1.").arg(destination.fileName()));
        }
    }
    const auto normal = nt::exporting::settingsFromVariant(settings);
    const auto unavailable = nt::exporting::unavailableOriginalMedia(m_timeline->timeline(), !nt::exporting::isAudioOnly(normal.format));
    if (!unavailable.isEmpty()) { return refuse(unavailable); }
    if (m_timeline->timeline().clips.empty() && m_timeline->durationMs() <= 0) {
        return refuse(QStringLiteral("Add a clip before exporting."));
    }
    Job job;
    job.id = QUuid::createUuid().toString(QUuid::Id128);
    job.name = m_timeline->name();
    job.output = absolute;
    job.presetName = presetName;
    job.settings = normal;
    job.snapshot = nt::exporting::exportSnapshot(*m_timeline);
    job.leases = nt::assets::MediaProtection::leasePaths(m_timeline->resolvedMediaPaths());
    const auto id = job.id;
    const int row = rowCount();
    beginInsertRows({}, row, row);
    m_jobs.push_back(std::move(job));
    endInsertRows();
    if (!m_lastError.isEmpty()) {
        m_lastError.clear();
        emit lastErrorChanged();
    }
    emit countChanged();
    startNext();
    return id;
}
void ExportQueue::cancel(const QString& id) {
    const int row = findJob(id);
    if (row < 0) { return; }
    auto& job = m_jobs[row];
    if (job.state == u"queued") {
        job.state = QStringLiteral("cancelled");
        job.snapshot = {};
        job.leases.clear();
        changed(row);
        emit countChanged();
    } else if (job.state == u"running") {
        job.cancelRequested = true;
        m_runner.cancel();
    }
}
void ExportQueue::remove(const QString& id) {
    const int row = findJob(id);
    if (row < 0 || unfinished(m_jobs[row].state)) { return; }
    beginRemoveRows({}, row, row);
    m_jobs.erase(m_jobs.begin() + row);
    endRemoveRows();
    emit countChanged();
}
void ExportQueue::clearFinished() {
    for (int row = rowCount() - 1; row >= 0; --row) {
        if (!unfinished(m_jobs[row].state)) { remove(m_jobs[row].id); }
    }
}
QVariantMap ExportQueue::job(const QString& id) const {
    const int row = findJob(id);
    return row < 0 ? QVariantMap{} : values(m_jobs[row]);
}
int ExportQueue::findJob(const QString& id) const {
    const auto found = std::find_if(m_jobs.begin(), m_jobs.end(), [&](const auto& job) { return job.id == id; });
    return found == m_jobs.end() ? -1 : static_cast<int>(found - m_jobs.begin());
}
QVariantMap ExportQueue::values(const Job& job) const {
    return {{"jobId", job.id}, {"name", job.name}, {"output", job.output}, {"fileName", QFileInfo(job.output).fileName()},
        {"presetName", job.presetName}, {"formatLabel", nt::exporting::formatLabel(job.settings.format)},
        {"state", job.state}, {"phase", job.phase}, {"ratio", job.ratio}, {"frame", job.frame},
        {"totalFrames", job.totalFrames}, {"error", job.error},
        {"detail", detail(job.state, job.phase, job.frame, job.totalFrames, job.error)}};
}
void ExportQueue::startNext() {
    if (running() || m_runner.running()) { return; }
    const auto next = std::find_if(m_jobs.begin(), m_jobs.end(), [](const auto& job) { return job.state == u"queued"; });
    if (next == m_jobs.end()) { return; }
    next->state = QStringLiteral("running");
    next->phase = QStringLiteral("preparing");
    m_runningId = next->id;
    const int row = static_cast<int>(next - m_jobs.begin());
    // Move resources before signals or startSnapshot, which can finish synchronously.
    const auto snapshot = std::exchange(next->snapshot, {});
    const auto settings = next->settings;
    const auto output = next->output;
    const auto name = next->name;
    auto leases = std::move(next->leases);
    changed(row);
    emit countChanged();
    m_runner.startSnapshot(snapshot, output, settings, name, std::move(leases));
}
void ExportQueue::updateProgress() {
    const int row = findJob(m_runningId);
    if (row < 0) { return; }
    auto& job = m_jobs[row];
    job.phase = m_runner.phase();
    job.ratio = m_runner.ratio();
    job.frame = m_runner.frame();
    job.totalFrames = m_runner.totalFrames();
    changed(row);
}
void ExportQueue::finish(bool success) {
    const int row = findJob(m_runningId);
    if (row < 0) { return; }
    auto& job = m_jobs[row];
    if (job.cancelRequested || m_runner.wasCancelled()) { job.state = QStringLiteral("cancelled"); }
    else if (success) { job.state = QStringLiteral("done"); job.ratio = 1; }
    else { job.state = QStringLiteral("failed"); job.error = m_runner.error(); }
    m_runningId.clear();
    changed(row);
    emit countChanged();
    QMetaObject::invokeMethod(this, &ExportQueue::startNext, Qt::QueuedConnection);
}
void ExportQueue::changed(int row) { emit dataChanged(index(row), index(row)); }
