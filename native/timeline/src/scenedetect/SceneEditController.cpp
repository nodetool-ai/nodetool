#include "scenedetect/SceneEditController.h"

#include "preview/SceneEval.h"
#include "scenedetect/ShotScan.h"

#include <QCoreApplication>
#include <QElapsedTimer>
#include <QJsonArray>
#include <QJsonObject>

#include <algorithm>
#include <cmath>
#include <memory>

namespace {
using nt::shots::CutOutcome;

constexpr int kMaxNamesInNotice = 3;

double roundMs(double value) { return std::round(value * 1000.0) / 1000.0; }

QString names(const QStringList& list) {
    QStringList shown = list.mid(0, kMaxNamesInNotice);
    QString text = shown.join(QStringLiteral(", "));
    if (list.size() > kMaxNamesInNotice) { text += QStringLiteral(" and %1 more").arg(list.size() - kMaxNamesInNotice); }
    return text;
}
}  // namespace

SceneEditController::SceneEditController(QObject* parent) : QObject(parent) {
    m_pool.setMaxThreadCount(1);
    m_poll.setInterval(100);
    connect(&m_poll, &QTimer::timeout, this, &SceneEditController::progressChanged);
}

SceneEditController::~SceneEditController() {
    m_run->cancel = true;
    m_pool.waitForDone();
}

void SceneEditController::setTimeline(TimelineModel* model) {
    if (m_timeline == model) { return; }
    cancel();
    m_timeline = model;
    emit timelineChanged();
}

double SceneEditController::progress() const {
    return m_run->total > 0 ? std::clamp(static_cast<double>(m_run->done.load()) / static_cast<double>(m_run->total), 0.0, 1.0) : 0.0;
}

QString SceneEditController::status() const {
    std::lock_guard lock(m_statusMutex);
    return m_current;
}

void SceneEditController::setSensitivity(double value) {
    const float next = static_cast<float>(std::clamp(value, 0.0, 100.0));
    if (m_options.sensitivity == next) { return; }
    m_options.sensitivity = next;
    emit optionsChanged();
    if (m_state == QLatin1String("ready")) { recompute(); }
}

void SceneEditController::setMinShotFrames(int frames) {
    const int next = std::clamp(frames, 1, 10000);
    if (m_options.minShotFrames == next) { return; }
    m_options.minShotFrames = next;
    emit optionsChanged();
    if (m_state == QLatin1String("ready")) { recompute(); }
}

void SceneEditController::setState(const QString& state) {
    if (m_state == state) { return; }
    m_state = state;
    emit stateChanged();
    emit actionsChanged();
}

QString SceneEditController::plural(int count, const QString& one, const QString& many) {
    return QStringLiteral("%1 %2").arg(count).arg(count == 1 ? one : many);
}

bool SceneEditController::begin(const QStringList& clipIds) {
    reset();
    if (!m_timeline) { return false; }
    const auto doc = nt::shots::editDocOf(m_timeline->timeline().raw);
    const double period = 1000.0 / std::max(1.0, m_timeline->fps());
    std::vector<Job> jobs;
    QStringList seen;
    int locked = 0;
    int noMedia = 0;
    int videoClips = 0;
    for (const QString& id : clipIds) {
        if (seen.contains(id)) { continue; }
        seen.append(id);
        const nt::Clip* clip = m_timeline->findClip(id);
        if (!clip || clip->mediaType != nt::MediaType::Video) { continue; }
        ++videoClips;
        if (nt::edit::editableUserTargets(doc, {id}, true, false).empty()) {
            ++locked;
            continue;
        }
        if (clip->mediaPath.empty()) {
            ++noMedia;
            continue;
        }
        Job job;
        job.clip = *clip;
        job.scan.id = id;
        job.scan.name = QString::fromStdString(clip->name);
        job.scan.startMs = clip->startMs;
        job.scan.durationMs = clip->durationMs;
        job.scan.inPointMs = clip->inPointMs;
        job.scan.periodMs = period;
        job.frames = std::max(1, static_cast<int>(std::floor(clip->durationMs / period + 1e-6)));
        jobs.push_back(std::move(job));
    }
    QStringList left;
    if (locked > 0) { left << plural(locked, QStringLiteral("locked clip"), QStringLiteral("locked clips")); }
    if (noMedia > 0) { left << plural(noMedia, QStringLiteral("clip with no media"), QStringLiteral("clips with no media")); }
    m_skipped = left.isEmpty() ? QString() : QStringLiteral("Left out: %1.").arg(left.join(QStringLiteral(", ")));
    if (jobs.empty()) {
        m_summary = videoClips == 0 ? QStringLiteral("Select a video clip to detect scene edits.")
                                    : QStringLiteral("None of the selected video clips can be analysed.");
        m_notice = m_skipped;
        setState(QStringLiteral("failed"));
        emit resultsChanged();
        return false;
    }
    qint64 total = 0;
    for (const auto& job : jobs) { total += job.frames; }
    m_run = std::make_shared<Run>();
    m_run->total = total;
    {
        std::lock_guard lock(m_statusMutex);
        m_current = QStringLiteral("Analysing %1").arg(jobs.front().scan.name);
    }
    m_notice = m_skipped;
    m_summary.clear();
    const int generation = ++m_generation;
    setState(QStringLiteral("analyzing"));
    emit progressChanged();
    emit resultsChanged();
    m_poll.start();
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    auto shared = std::make_shared<std::vector<Job>>(std::move(jobs));
    // native-rules #12: lambda captures raw this and runs on a pool thread
    m_pool.start([this, shared, state = m_run, generation]() { run(std::move(*shared), state, generation); });
    return true;
}

void SceneEditController::run(std::vector<Job> jobs, std::shared_ptr<Run> state, int generation) {
    std::vector<ClipScan> scans;
    bool cancelled = false;
    qint64 base = 0;
    for (auto& job : jobs) {
        {
            std::lock_guard lock(m_statusMutex);
            m_current = QStringLiteral("Analysing %1").arg(job.scan.name);
        }
        nt::shots::ScanRequest request;
        request.path = job.clip.mediaPath;
        request.sourceTimesMs.reserve(static_cast<size_t>(job.frames));
        for (int frame = 0; frame < job.frames; ++frame) {
            request.sourceTimesMs.push_back(nt::clipSourceMsAt(job.clip, job.scan.startMs + frame * job.scan.periodMs));
        }
        auto result = nt::shots::scanShots(request, [&](std::size_t done) {
            state->done.store(base + static_cast<qint64>(done), std::memory_order_relaxed);
            return !state->cancel.load(std::memory_order_relaxed);
        });
        base += job.frames;
        state->done = base;
        if (result.cancelled) {
            cancelled = true;
            break;
        }
        if (!result.error.empty()) {
            job.scan.error = QString::fromStdString(result.error);
        } else {
            job.scan.diffs = std::move(result.diffs);
        }
        scans.push_back(std::move(job.scan));
    }
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    auto shared = std::make_shared<std::vector<ClipScan>>(std::move(scans));
    QMetaObject::invokeMethod(this, [this, shared, generation, cancelled]() { finish(std::move(*shared), generation, cancelled); },
        Qt::QueuedConnection);
}

void SceneEditController::finish(std::vector<ClipScan> scans, int generation, bool cancelled) {
    if (generation != m_generation) { return; }
    m_poll.stop();
    emit progressChanged();
    if (cancelled) {
        m_clips.clear();
        m_rows.clear();
        m_cutCount = 0;
        m_cuttable = 0;
        m_summary = QStringLiteral("Stopped. Nothing was changed.");
        m_notice.clear();
        setState(QStringLiteral("idle"));
        emit resultsChanged();
        emit analysisFinished();
        return;
    }
    m_clips = std::move(scans);
    const bool anyRead = std::any_of(m_clips.begin(), m_clips.end(), [](const ClipScan& scan) { return scan.error.isEmpty(); });
    if (!anyRead) {
        m_rows.clear();
        m_cutCount = 0;
        m_cuttable = 0;
        QStringList reasons;
        for (const auto& scan : m_clips) { reasons << QStringLiteral("%1: %2").arg(scan.name, scan.error); }
        m_summary = QStringLiteral("Could not read the media of the selected clips.");
        if (!m_skipped.isEmpty()) { reasons.prepend(m_skipped); }
        m_notice = reasons.join(QLatin1Char('\n'));
        setState(QStringLiteral("failed"));
        emit resultsChanged();
        emit analysisFinished();
        return;
    }
    recompute();
    setState(QStringLiteral("ready"));
    emit analysisFinished();
}

void SceneEditController::cancel() {
    if (m_state != QLatin1String("analyzing")) { return; }
    m_run->cancel = true;
}

void SceneEditController::reset() {
    if (m_state == QLatin1String("analyzing")) {
        m_run->cancel = true;
        ++m_generation;
        m_poll.stop();
    }
    m_clips.clear();
    m_rows.clear();
    m_cutCount = 0;
    m_cuttable = 0;
    m_summary.clear();
    m_notice.clear();
    m_outcome.clear();
    m_skipped.clear();
    m_run = std::make_shared<Run>();
    setState(QStringLiteral("idle"));
    emit resultsChanged();
}

std::vector<int> SceneEditController::cutsOf(const ClipScan& scan) const {
    return nt::shots::detectCuts(scan.diffs, m_options);
}

std::vector<double> SceneEditController::timesOf(const ClipScan& scan) const {
    std::vector<double> times;
    for (const int frame : cutsOf(scan)) { times.push_back(roundMs(scan.startMs + frame * scan.periodMs)); }
    return times;
}

std::vector<nt::shots::CutRequest> SceneEditController::requests() const {
    std::vector<nt::shots::CutRequest> out;
    for (const auto& scan : m_clips) {
        auto times = timesOf(scan);
        if (times.empty()) { continue; }
        out.push_back({scan.id, scan.startMs, scan.durationMs, scan.inPointMs, std::move(times)});
    }
    return out;
}

void SceneEditController::recompute() {
    m_rows.clear();
    m_cutCount = 0;
    int readable = 0;
    for (const auto& scan : m_clips) {
        const int cuts = scan.error.isEmpty() ? static_cast<int>(cutsOf(scan).size()) : 0;
        if (scan.error.isEmpty()) { ++readable; }
        m_cutCount += cuts;
        m_rows.append(QVariantMap{{"name", scan.name}, {"cuts", cuts}, {"note", scan.error}});
    }
    const auto asked = requests();
    nt::shots::CutPlan plan;
    if (m_timeline) { plan = nt::shots::planCuts(nt::shots::editDocOf(m_timeline->timeline().raw), asked); }
    m_cuttable = plan.points;

    QStringList notes;
    if (!m_skipped.isEmpty()) { notes << m_skipped; }
    QStringList locked;
    QStringList retimed;
    QStringList refused;
    bool changed = false;
    for (size_t i = 0; i < asked.size() && i < plan.outcomes.size(); ++i) {
        const nt::Clip* clip = m_timeline ? m_timeline->findClip(asked[i].clipId) : nullptr;
        const QString name = clip ? QString::fromStdString(clip->name) : asked[i].clipId;
        switch (plan.outcomes[i]) {
        case CutOutcome::Locked: locked << name; break;
        case CutOutcome::Changed: changed = true; break;
        case CutOutcome::CannotSplit: (clip && clip->timeRemap ? retimed : refused) << name; break;
        default: break;
        }
    }
    if (!locked.isEmpty()) { notes << QStringLiteral("Locked since the analysis, so not cut: %1.").arg(names(locked)); }
    if (!retimed.isEmpty()) {
        notes << QStringLiteral("%1 has a time remap and cannot be cut. Create Markers still works.").arg(names(retimed));
    }
    if (!refused.isEmpty()) { notes << QStringLiteral("%1 cannot be split.").arg(names(refused)); }
    if (changed) { notes << QStringLiteral("The timeline changed since the analysis. Close this and run it again."); }
    for (const auto& scan : m_clips) {
        if (!scan.error.isEmpty()) { notes << QStringLiteral("Could not read %1: %2").arg(scan.name, scan.error); }
    }
    m_notice = notes.join(QLatin1Char('\n'));

    const QString clipsText = plural(readable, QStringLiteral("clip"), QStringLiteral("clips"));
    if (m_cutCount == 0) {
        m_summary = QStringLiteral("No cuts found in %1. Nothing will change.").arg(clipsText);
        if (m_options.sensitivity < 100.0F) { m_summary += QStringLiteral(" A higher sensitivity looks for subtler cuts."); }
    } else {
        m_summary = QStringLiteral("Found %1 in %2.").arg(plural(m_cutCount, QStringLiteral("cut"), QStringLiteral("cuts")), clipsText);
    }
    emit resultsChanged();
    emit actionsChanged();
}

bool SceneEditController::applyCuts() {
    if (m_state != QLatin1String("ready") || !m_timeline) { return false; }
    const auto asked = requests();
    const auto doc = nt::shots::editDocOf(m_timeline->timeline().raw);
    const auto plan = nt::shots::planCuts(doc, asked);
    if (plan.points == 0) { return false; }
    QJsonArray clips;
    for (const auto& request : asked) {
        QJsonArray at;
        for (const double time : request.atMs) { at.append(time); }
        clips.append(QJsonObject{{"id", request.clipId}, {"startMs", request.startMs}, {"durationMs", request.durationMs},
                                 {"inPointMs", request.inPointMs}, {"atMs", at}});
    }
    if (m_timeline->applyEdit(QStringLiteral("sceneEdit.cut"), {{"clips", clips}}) == 0) { return false; }
    const int added = static_cast<int>(plan.clips.size() - doc.clips.size());
    m_outcome = QStringLiteral("Cut %1 at %2.").arg(plural(plan.clipsCut, QStringLiteral("clip"), QStringLiteral("clips")),
        plural(plan.points, QStringLiteral("point"), QStringLiteral("points")));
    if (added > plan.points) { m_outcome += QStringLiteral(" Linked audio was cut at the same places."); }
    setState(QStringLiteral("applied"));
    return true;
}

bool SceneEditController::createMarkers() {
    if (m_state != QLatin1String("ready") || !m_timeline) { return false; }
    std::vector<double> times;
    for (const auto& scan : m_clips) {
        for (const double time : timesOf(scan)) { times.push_back(time); }
    }
    if (times.empty()) { return false; }
    const auto before = m_timeline->markersJson();
    const auto after = nt::shots::addCutMarkers(before, times, m_timeline->fps());
    if (after.size() == before.size()) {
        m_outcome = QStringLiteral("No markers added. The timeline already has a marker at each cut.");
        setState(QStringLiteral("applied"));
        return true;
    }
    QJsonArray at;
    for (const double time : times) { at.append(time); }
    if (m_timeline->applyEdit(QStringLiteral("sceneEdit.markers"), {{"timesMs", at}}) == 0) { return false; }
    const int added = static_cast<int>(after.size() - before.size());
    m_outcome = QStringLiteral("Added %1.").arg(plural(added, QStringLiteral("marker"), QStringLiteral("markers")));
    if (added < static_cast<int>(times.size())) {
        m_outcome += QStringLiteral(" The others were already there.");
    }
    setState(QStringLiteral("applied"));
    return true;
}

bool SceneEditController::waitForAnalysis(int timeoutMs) {
    QElapsedTimer clock;
    clock.start();
    while (m_state == QLatin1String("analyzing") && clock.elapsed() < timeoutMs) {
        QCoreApplication::processEvents(QEventLoop::AllEvents, 20);
    }
    return m_state != QLatin1String("analyzing");
}
