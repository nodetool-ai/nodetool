#include "remix/clip/RemixController.h"

#include "model/TimelineJson.h"
#include "remix/RemixFile.h"

#include <QDateTime>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QThread>
#include <QUuid>

#include <algorithm>
#include <cmath>

namespace {
constexpr double kMaxTargetMs = 3600.0 * 1000.0;
QString newId() { return QUuid::createUuid().toString(QUuid::Id128); }
double clampPercent(double v) { return std::isfinite(v) ? std::clamp(v, 0.0, 100.0) : 50.0; }
}  // namespace

RemixController::RemixController(QObject* parent)
    : QObject(parent), m_protection(std::make_shared<nt::assets::MediaProtection>()),
      m_previewModel(new TimelineModel(this)), m_previewClock(new PlaybackClock(this)) {
    qRegisterMetaType<RemixRelay::Task>("RemixRelay::Task");
    // Workers hand their results to the GUI thread through a relay they own a share of. The relay outlives this
    // controller while a worker still runs, and its connection to this object ends when this object does.
    m_relay = std::shared_ptr<RemixRelay>(new RemixRelay, [](RemixRelay* relay) { relay->deleteLater(); });
    connect(m_relay.get(), &RemixRelay::post, this, [](const RemixRelay::Task& task) { task(); });
    connect(m_previewClock, &PlaybackClock::playingChanged, this, &RemixController::listeningChanged);
    connect(m_previewClock, &PlaybackClock::timeChanged, this, [this] { if (m_previewClock->playing()) { emit listeningChanged(); } });
}

RemixController::~RemixController() {
    m_audio.reset();
    ++m_serial;
    // A worker stops at its next check. One stuck in a network call or a cache lock is left to finish by
    // itself: it holds no pointer to this object, and its thread is not a child of it.
    if (m_worker) {
        m_worker->requestInterruption();
        m_worker->wait(3000);
    }
}

void RemixController::setTimeline(TimelineModel* model) {
    if (m_timeline == model) { return; }
    close();
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = model;
    if (model) {
        connect(model, &TimelineModel::documentReplaced, this, &RemixController::close);
        connect(model, &TimelineModel::clipsChanged, this, [this] {
            if (m_state != QLatin1String("closed")) { emit changed(); }
        });
    }
    emit changed();
}

void RemixController::setBackend(std::shared_ptr<nt::remix::Backend> backend) {
    m_backend = std::move(backend);
    m_backendSet = true;
    emit changed();
}
std::shared_ptr<nt::remix::Backend> RemixController::backend() const {
    if (m_backendSet) { return m_backend; }
    if (!m_serverBackendResolved) {
        m_serverBackend = nt::remix::serverBackend();
        m_serverBackendResolved = true;
    }
    return m_serverBackend;
}

void RemixController::setAudioMode(const QString& mode) {
    if ((mode != "none" && mode != "null" && mode != "system") || mode == m_audioMode) { return; }
    stopListening();
    m_audio.reset();
    m_audioMode = mode;
    emit changed();
}

QJsonObject RemixController::currentRaw() const {
    if (!m_timeline) { return {}; }
    auto raw = m_timeline->timeline().raw;
    raw.insert("clips", m_timeline->clipsJson());
    return raw;
}
QJsonObject RemixController::clipRaw(const QString& id) const {
    if (!m_timeline) { return {}; }
    for (const auto& value : m_timeline->clipsJson()) {
        if (value.toObject().value("id").toString() == id) { return value.toObject(); }
    }
    return {};
}
QSet<QString> RemixController::protectedPaths() const {
    QSet<QString> paths;
    if (m_timeline) {
        for (const auto& clip : m_timeline->timeline().clips) {
            if (!clip.mediaPath.empty()) { paths.insert(QString::fromStdString(clip.mediaPath)); }
            if (!clip.audioPath.empty()) { paths.insert(QString::fromStdString(clip.audioPath)); }
        }
    }
    return paths;
}

void RemixController::setState(const QString& state) {
    m_state = state;
    emit changed();
}

// Whether the clip still plays the music this dialog analysed: a take applied or a trim made
// while the dialog was open would make the plan describe other audio.
QString RemixController::staleReason() const {
    const auto clip = clipRaw(m_clipId);
    const auto now = nt::remix::sourceWindow(clip);
    if (clip.isEmpty() || !now || clip.value("currentAssetId").toString() != m_currentAsset || now->assetId != m_window.assetId ||
        std::abs(clip.value("durationMs").toDouble() - m_currentMs) > 0.5 || std::abs(clip.value("inPointMs").toDouble(0) - m_currentIn) > 0.5 ||
        std::abs(now->startMs - m_window.startMs) > 0.5 || std::abs(now->durationMs - m_window.durationMs) > 0.5) {
        return QStringLiteral("The clip changed after Remix opened. Close this window and open Remix again.");
    }
    return {};
}
QString RemixController::refusal() const {
    if (m_state == QLatin1String("closed") || m_state == QLatin1String("refused")) { return m_refusal; }
    if (!m_refusal.isEmpty()) { return m_refusal; }
    if (!m_plan) { return {}; }
    if (const auto stale = staleReason(); !stale.isEmpty()) { return stale; }
    if (!backend()) { return QStringLiteral("Open the timeline from a server to save the remix."); }
    return nt::remix::refusal(currentRaw(), m_clipId, m_targetMs);
}
bool RemixController::canApply() const {
    return m_state == QLatin1String("ready") && m_plan.has_value() && m_planError.isEmpty() && refusal().isEmpty();
}
bool RemixController::canListen() const {
    return m_state == QLatin1String("ready") && m_plan.has_value() && m_planError.isEmpty();
}
double RemixController::tempoChangePercent() const {
    if (!m_plan || m_targetMs <= 0) { return 0; }
    const double target = std::llround(m_targetMs * nt::remix::kOutputRate / 1000.0);
    return target > 0 ? (double(m_plan->length() * (nt::remix::kOutputRate / nt::remix::kAnalysisRate)) / target - 1.0) * 100.0 : 0.0;
}

QVariantList RemixController::pieces() const {
    QVariantList list;
    if (!m_plan || !m_analysis || m_analysis->len <= 0) { return list; }
    const double total = double(m_plan->length());
    double out = 0;
    for (const auto& piece : m_plan->pieces) {
        list.append(QVariantMap{{"srcFrom", piece.src / double(m_analysis->len)},
                                {"srcTo", (piece.src + piece.len) / double(m_analysis->len)},
                                {"outFrom", out / total}, {"outTo", (out + piece.len) / total}});
        out += double(piece.len);
    }
    return list;
}

double RemixController::gapMs() const {
    const auto clip = clipRaw(m_clipId);
    if (clip.isEmpty()) { return -1; }
    const double start = clip.value("startMs").toDouble();
    double next = std::numeric_limits<double>::infinity();
    for (const auto& value : m_timeline->clipsJson()) {
        const auto other = value.toObject();
        if (other.value("id") == clip.value("id") || other.value("trackId") != clip.value("trackId")) { continue; }
        if (other.value("startMs").toDouble() >= start) { next = std::min(next, other.value("startMs").toDouble()); }
    }
    return std::isinf(next) ? -1 : std::max(0.0, next - start);
}

bool RemixController::listening() const { return m_previewClock->playing(); }
double RemixController::listenPositionMs() const { return m_previewClock->time(); }

QString RemixController::bakeKey() const {
    return QStringLiteral("%1|%2|%3|%4|%5").arg(m_clipId, m_window.assetId).arg(m_targetMs, 0, 'f', 0).arg(m_segments, 0, 'f', 0).arg(m_variations, 0, 'f', 0);
}

void RemixController::cancelWork() {
    ++m_serial;
    retireWorker();
}

void RemixController::close() {
    const bool wasOpen = m_state != QLatin1String("closed");
    stopListening();
    m_audio.reset();
    cancelWork();
    m_clipId.clear(); m_clipName.clear(); m_error.clear(); m_refusal.clear(); m_phase.clear(); m_planError.clear();
    m_progress = 0; m_isRemix = false;
    m_analysis.reset(); m_plan.reset(); m_window = {};
    m_bakedKey.clear(); m_loadedKey.clear(); m_sourcePath.clear();
    m_state = QStringLiteral("closed");
    if (wasOpen) { emit changed(); emit progressChanged(); }
}

bool RemixController::begin(const QString& clipId) {
    close();
    if (!m_timeline) { return false; }
    const auto raw = currentRaw();
    const auto clip = clipRaw(clipId);
    m_clipId = clipId;
    m_clipName = clip.value("name").toString();
    if (const auto reason = nt::remix::refusal(raw, clipId, 0); !reason.isEmpty()) {
        m_refusal = reason;
        setState(QStringLiteral("refused"));
        return false;
    }
    const auto window = nt::remix::sourceWindow(clip);
    if (!window) {
        m_refusal = QStringLiteral("This clip has no audio to remix.");
        setState(QStringLiteral("refused"));
        return false;
    }
    m_window = *window;
    m_currentAsset = clip.value("currentAssetId").toString();
    m_currentMs = clip.value("durationMs").toDouble();
    m_currentIn = clip.value("inPointMs").toDouble(0);
    m_generation = m_timeline->documentGeneration();
    const auto meta = nt::remix::activeRemix(clip);
    m_isRemix = !meta.isEmpty();
    m_targetMs = std::round(std::clamp(m_currentMs, 1.0, kMaxTargetMs));
    m_segments = m_isRemix && meta.contains("segments") ? clampPercent(meta.value("segments").toDouble()) : 50;
    m_variations = m_isRemix && meta.contains("variations") ? clampPercent(meta.value("variations").toDouble()) : 50;
    if (m_window.durationMs > double(nt::remix::kMaxAnalysisSeconds) * 1000.0) {
        m_error = QString::fromLatin1(nt::remix::describe(nt::remix::Error::TooLong));
        setState(QStringLiteral("refused"));
        return false;
    }
    std::string path;
    if (m_window.assetId == m_currentAsset) {
        for (const auto& c : m_timeline->timeline().clips) {
            if (c.id == clipId.toStdString()) { path = !c.audioPath.empty() ? c.audioPath : c.mediaPath; break; }
        }
        if (path.empty() || !QFileInfo::exists(QString::fromStdString(path))) {
            m_error = QStringLiteral("The audio of this clip is not downloaded yet. Try again in a moment.");
            setState(QStringLiteral("refused"));
            return false;
        }
    }
    m_progress = 0;
    m_phase = QStringLiteral("Analysing the music…");
    startAnalysis(path);
    return true;
}

void RemixController::startAnalysis(std::string path) {
    retireWorker();
    setState(QStringLiteral("analyzing"));
    emit progressChanged();
    const auto serial = ++m_serial;
    const QPointer<RemixController> self(this);
    const auto assetId = m_window.assetId;
    const auto start = m_window.startMs, duration = m_window.durationMs;
    const auto backend = this->backend();
    const auto protection = m_protection;
    protection->reset(protectedPaths());
    const auto mediaGeneration = protection->generation();
    const auto relay = m_relay;
    auto* thread = QThread::create([self, relay, serial, path = std::move(path), assetId, start, duration, backend, protection, mediaGeneration]() mutable {
        const auto cancelled = [] { return QThread::currentThread()->isInterruptionRequested(); };
        QString error;
        if (path.empty()) {
            if (!backend) {
                error = QStringLiteral("The source of this remix is not available. Open the timeline from its server.");
            } else {
                const auto resolved = backend->resolve(assetId, *protection, mediaGeneration);
                if (resolved.ok()) { path = resolved.media.audioPath; }
                else { error = resolved.error.isEmpty() ? QStringLiteral("The source audio could not be downloaded.") : resolved.error; }
            }
        }
        nt::remix::AnalysisResult result;
        if (error.isEmpty() && !cancelled()) {
            result = nt::remix::analyzeFile({path, start, duration},
                [self, relay, serial](double fraction) {
                    if (!self) { return; }
                    relay->post([self, serial, fraction] {
                        if (!self || self->m_serial != serial) { return; }
                        self->m_progress = fraction;
                        emit self->progressChanged();
                    });
                }, cancelled);
        }
        if (!self || cancelled()) { return; }
        relay->post([self, serial, result = std::move(result), error, path]() mutable {
            if (!self || self->m_serial != serial) { return; }
            if (!error.isEmpty() || !result.analysis) {
                self->m_error = !error.isEmpty() ? error : QString::fromLatin1(nt::remix::describe(result.error));
                self->m_progress = 0;
                self->setState(QStringLiteral("refused"));
                return;
            }
            self->m_sourcePath = QString::fromStdString(path);
            self->m_analysis = std::make_shared<const nt::remix::Analysis>(std::move(*result.analysis));
            self->m_progress = 1;
            self->m_phase.clear();
            self->m_error.clear();
            self->m_state = QStringLiteral("ready");
            self->replan();
            emit self->progressChanged();
        });
    });
    m_worker = thread;
    connect(thread, &QThread::finished, this, [this, thread] {
        if (m_worker == thread) { m_worker = nullptr; }
    });
    connect(thread, &QThread::finished, thread, &QObject::deleteLater);
    thread->start();
}

void RemixController::setSettings(double targetMs, double segments, double variations) {
    if (!std::isfinite(targetMs) || targetMs < 1) { return; }
    m_targetMs = std::round(std::min(targetMs, kMaxTargetMs));
    m_segments = clampPercent(segments);
    m_variations = clampPercent(variations);
    if (listening()) { stopListening(); }
    if (m_analysis && m_state == QLatin1String("ready")) { replan(); } else { emit changed(); }
}

void RemixController::replan() {
    m_plan.reset();
    m_planError.clear();
    if (m_analysis) {
        const auto result = nt::remix::plan(*m_analysis, std::llround(m_targetMs * nt::remix::kAnalysisRate / 1000.0),
                                            {m_segments, m_variations});
        if (result.plan) { m_plan = *result.plan; }
        else { m_planError = QString::fromLatin1(nt::remix::describe(result.error)); }
    }
    m_error = m_planError;
    emit changed();
}

void RemixController::retireWorker() {
    // The editor never waits for a worker: a cancelled one stops at its next check, or when the
    // call it is in returns, and its result is dropped because the serial no longer matches.
    m_reverting = false;
    if (!m_worker) { return; }
    m_worker->requestInterruption();
    m_worker = nullptr;
}

void RemixController::startBake(bool thenListen, bool thenApply) {
    if (!m_plan || !m_analysis || m_sourcePath.isEmpty()) { return; }
    retireWorker();
    const auto key = bakeKey();
    const auto frames = std::llround(m_targetMs * nt::remix::kOutputRate / 1000.0);
    const auto serial = ++m_serial;
    const bool reuse = m_bakedKey == key && QFileInfo::exists(m_bakedPath);
    const auto wavPath = reuse ? m_bakedPath : m_dir.filePath(QStringLiteral("remix-%1.wav").arg(++m_bakes));
    m_progress = 0;
    m_phase = thenApply ? QStringLiteral("Rendering the remix…") : QStringLiteral("Rendering a preview…");
    m_error.clear();
    setState(thenApply ? QStringLiteral("applying") : QStringLiteral("rendering"));
    emit progressChanged();
    const QPointer<RemixController> self(this);
    const nt::remix::FileWindow window{m_sourcePath.toStdString(), m_window.startMs, m_window.durationMs};
    const auto plan = *m_plan;
    const auto backend = thenApply ? this->backend() : nullptr;
    const auto protection = m_protection;
    protection->reset(protectedPaths());
    const auto mediaGeneration = protection->generation();
    const auto generation = m_generation;
    const auto sibling = m_window.assetId;
    const auto name = QStringLiteral("%1 (%2)").arg(m_clipName.isEmpty() ? QStringLiteral("Music") : m_clipName, nt::remix::takeLabel(double(frames) * 1000.0 / nt::remix::kOutputRate).toLower());
    const auto relay = m_relay;
    auto* thread = QThread::create([=]() mutable {
        const auto cancelled = [] { return QThread::currentThread()->isInterruptionRequested(); };
        const auto report = [self, relay, serial](double fraction, const QString& phase) {
            if (!self) { return; }
            relay->post([self, serial, fraction, phase] {
                if (!self || self->m_serial != serial) { return; }
                self->m_progress = fraction;
                if (!phase.isEmpty()) { self->m_phase = phase; }
                emit self->progressChanged();
            });
        };
        auto fail = [self, relay, serial](const QString& message) {
            if (!self) { return; }
            relay->post([self, serial, message] {
                if (!self || self->m_serial != serial) { return; }
                self->m_error = message;
                self->m_progress = 0;
                self->m_phase.clear();
                self->setState(QStringLiteral("ready"));
                emit self->progressChanged();
            });
        };
        if (!reuse) {
            const auto error = nt::remix::bakeWav(window, plan, frames, wavPath,
                [&](double f) { report(thenApply ? f * 0.7 : f, {}); }, cancelled);
            if (cancelled()) { return; }
            if (error != nt::remix::Error::None) { fail(QString::fromLatin1(nt::remix::describe(error))); return; }
        }
        if (!self) { return; }
        relay->post([self, serial, wavPath, key] {
            if (!self || self->m_serial != serial) { return; }
            self->m_bakedKey = key;
            self->m_bakedPath = wavPath;
        });
        if (thenListen) {
            relay->post([self, serial, wavPath] {
                if (!self || self->m_serial != serial) { return; }
                self->m_progress = 1;
                self->m_phase.clear();
                self->m_state = QStringLiteral("ready");
                self->loadListening(wavPath);
                emit self->progressChanged();
            });
            return;
        }
        if (!thenApply) { return; }
        if (!backend) { fail(QStringLiteral("Open the timeline from a server to save the remix.")); return; }
        report(0.75, QStringLiteral("Saving the remix…"));
        const auto uploaded = backend->upload(wavPath, name, sibling);
        if (cancelled()) { return; }
        if (!uploaded.ok()) { fail(uploaded.error.isEmpty() ? QStringLiteral("The remix could not be saved.") : uploaded.error); return; }
        report(0.9, QStringLiteral("Preparing the new take…"));
        const auto resolved = backend->resolve(uploaded.asset.value("id").toString(), *protection, mediaGeneration);
        if (cancelled()) { return; }
        if (!resolved.ok()) { fail(resolved.error.isEmpty() ? QStringLiteral("The saved remix could not be loaded.") : resolved.error); return; }
        auto asset = uploaded.asset;
        if (!(asset.value("duration").toDouble() > 0)) { asset.insert("duration", double(frames) / nt::remix::kOutputRate); }
        if (!self) { return; }
        relay->post([self, serial, media = resolved.media, asset, wavPath, generation] {
            if (!self || self->m_serial != serial) { return; }
            self->finishApply(media, asset, wavPath, generation, serial);
        });
    });
    m_worker = thread;
    connect(thread, &QThread::finished, this, [this, thread] {
        if (m_worker == thread) { m_worker = nullptr; }
    });
    connect(thread, &QThread::finished, thread, &QObject::deleteLater);
    thread->start();
}

void RemixController::listen() {
    if (listening()) { stopListening(); return; }
    if (!canListen()) { return; }
    if (m_loadedKey == bakeKey() && m_previewModel->timeline().clips.size() == 1) {
        m_previewClock->seek(0);
        m_previewClock->play();
        return;
    }
    startBake(true, false);
}

void RemixController::loadListening(const QString& wavPath) {
    const double duration = std::llround(m_targetMs * nt::remix::kOutputRate / 1000.0) * 1000.0 / nt::remix::kOutputRate;
    QJsonObject clip{{"id", "remixPreview"}, {"trackId", "remixTrack"}, {"name", "Remix"}, {"mediaType", "audio"},
                     {"sourceType", "imported"}, {"startMs", 0}, {"durationMs", duration}, {"currentAssetId", "remix-preview"},
                     {"status", "generated"}, {"muted", false}};
    const QJsonObject raw{{"id", "remixPreview"}, {"name", "Remix"}, {"fps", 30}, {"width", 640}, {"height", 360}, {"durationMs", duration},
                          {"tracks", QJsonArray{QJsonObject{{"id", "remixTrack"}, {"type", "audio"}, {"index", 0}}}},
                          {"clips", QJsonArray{clip}}};
    const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    if (!parsed.timeline) { m_error = parsed.error; emit changed(); return; }
    m_audio.reset();
    m_previewClock->pause();
    m_previewModel->setTimeline(*parsed.timeline);
    nt::Clip media;
    media.raw = clip;
    media.mediaType = nt::MediaType::Audio;
    media.audioPath = wavPath.toStdString();
    m_previewModel->registerMedia(media);
    m_previewClock->setDurationMs(duration);
    m_previewClock->seek(0);
    m_loadedKey = bakeKey();
    auto audio = std::make_unique<nt::audio::AppAudio>();
    QString error;
    if (!audio->start(m_audioMode, 0, *m_previewModel, *m_previewClock, &error)) { m_error = error; emit changed(); return; }
    m_audio = std::move(audio);
    m_previewClock->play();
    emit changed();
}

void RemixController::stopListening() {
    m_previewClock->pause();
}

void RemixController::apply() {
    if (!canApply()) { return; }
    stopListening();
    startBake(false, true);
}

void RemixController::finishApply(const nt::Clip& media, const QJsonObject& asset, const QString&, quint64 generation, quint64) {
    if (!m_timeline || m_timeline->documentGeneration() != generation) {
        m_error = QStringLiteral("The timeline changed while the remix was saved. Try again.");
        setState(QStringLiteral("ready"));
        return;
    }
    if (const auto stale = staleReason(); !stale.isEmpty()) {
        m_error = stale;
        setState(QStringLiteral("ready"));
        return;
    }
    const long long frames = std::llround(m_targetMs * nt::remix::kOutputRate / 1000.0);
    const double duration = double(frames) * 1000.0 / nt::remix::kOutputRate;
    QJsonArray cuts;
    for (const auto& [out, in] : m_plan->cuts()) {
        cuts.append(QJsonObject{{"outMs", double(out) * 1000.0 / nt::remix::kAnalysisRate}, {"inMs", double(in) * 1000.0 / nt::remix::kAnalysisRate}});
    }
    QJsonObject remix{{"targetMs", m_targetMs}, {"segments", m_segments}, {"variations", m_variations}, {"bpm", m_analysis->bpm},
                      {"beats", int(m_analysis->beats.size())}, {"cuts", cuts}, {"tempoChangePercent", tempoChangePercent()}};
    QJsonObject payload{{"clipId", m_clipId}, {"assetId", asset.value("id")}, {"takeId", newId()},
                        {"createdAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}, {"durationMs", duration},
                        {"remix", remix}};
    // The media goes in first: the edit makes the new asset the clip's, and the clip finds its file by that asset.
    m_timeline->registerMedia(media);
    if (!m_timeline->applyEdit(QStringLiteral("clip.remix"), payload)) {
        const auto why = nt::remix::refusal(currentRaw(), m_clipId, duration);
        m_error = why.isEmpty() ? QStringLiteral("The remix could not be applied to the clip.") : why;
        setState(QStringLiteral("ready"));
        return;
    }
    close();
    emit applied();
}

QString RemixController::revert(const QString& clipId) {
    if (!m_timeline) { return QStringLiteral("No timeline is open."); }
    if (busy() || m_reverting) { return QStringLiteral("Wait for the remix to finish."); }
    const auto raw = currentRaw();
    if (const auto why = nt::remix::revertRefusal(raw, clipId); !why.isEmpty()) { emit reverted(clipId, why); return why; }
    const auto clip = clipRaw(clipId);
    const auto meta = nt::remix::activeRemix(clip);
    const auto sourceAsset = meta.value("sourceAssetId").toString();
    const auto commit = [this, clipId](const nt::Clip* media) {
        if (media) { m_timeline->registerMedia(*media); }
        const auto token = m_timeline->applyEdit(QStringLiteral("clip.remix.revert"), QJsonObject{{"clipId", clipId}});
        const auto why = token ? QString{} : nt::remix::revertRefusal(currentRaw(), clipId);
        emit reverted(clipId, token ? QString{} : (why.isEmpty() ? QStringLiteral("The clip could not be reverted.") : why));
    };
    // The source may already play: a clip opened from a saved remix has only the remix on disk.
    bool loaded = false;
    for (const auto& c : m_timeline->timeline().clips) {
        if (c.raw.value("currentAssetId").toString() == sourceAsset && !c.audioPath.empty()) { loaded = true; break; }
    }
    if (loaded) { commit(nullptr); return {}; }
    const auto backend = this->backend();
    if (!backend) {
        const QString why = QStringLiteral("Open the timeline from its server to bring the original back.");
        emit reverted(clipId, why);
        return why;
    }
    retireWorker();
    m_reverting = true;
    const QPointer<RemixController> self(this);
    const auto serial = ++m_serial;
    const auto generation = m_timeline->documentGeneration();
    const auto protection = m_protection;
    protection->reset(protectedPaths());
    const auto mediaGeneration = protection->generation();
    const auto relay = m_relay;
    auto* thread = QThread::create([=] {
        const auto resolved = backend->resolve(sourceAsset, *protection, mediaGeneration);
        if (!self || QThread::currentThread()->isInterruptionRequested()) { return; }
        relay->post([self, serial, generation, clipId, resolved, commit] {
            if (!self || self->m_serial != serial || !self->m_timeline || self->m_timeline->documentGeneration() != generation) { return; }
            self->m_reverting = false;
            if (!resolved.ok()) {
                emit self->reverted(clipId, resolved.error.isEmpty() ? QStringLiteral("The original audio could not be loaded.") : resolved.error);
                return;
            }
            commit(&resolved.media);
        });
    });
    m_worker = thread;
    connect(thread, &QThread::finished, this, [this, thread] { if (m_worker == thread) { m_worker = nullptr; m_reverting = false; } });
    connect(thread, &QThread::finished, thread, &QObject::deleteLater);
    thread->start();
    return {};
}
