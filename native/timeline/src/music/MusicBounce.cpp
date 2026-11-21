#include "music/MusicBounce.h"

#include "assets/AssetImport.h"
#include "assets/AssetWav.h"
#include "audio/AudioEngine.h"
#include "music/MusicTime.h"
#include "server/ServerClient.h"

#include <QFileInfo>
#include <QJsonArray>
#include <QPointer>
#include <QTemporaryDir>
#include <QThread>

#include <utility>

namespace nt::music {

Timeline bounceTimeline(const Timeline& source, BounceKind kind, const std::string& targetTrackId) {
    Timeline copy = source;
    // A new snapshot that no model owns, so no cache keyed by revision is reused.
    copy.revision = 0;
    if (kind == BounceKind::Mix) {
        for (auto& track : copy.tracks) {
            if (track.id == targetTrackId) {
                track.muted = true;
                track.raw.insert("muted", true);
            }
        }
        copy.indexClips();
        return copy;
    }
    std::vector<Track> tracks;
    for (auto track : copy.tracks) {
        if (track.id != targetTrackId) {
            continue;
        }
        track.muted = false;
        track.solo = false;
        track.volumeDb = 0.0;
        track.pan = 0.0;
        for (const auto* field : {"effects", "automation", "volumeDb", "pan", "muted", "solo"}) {
            track.raw.remove(QLatin1String(field));
        }
        tracks.push_back(std::move(track));
    }
    std::vector<Clip> clips;
    for (auto clip : copy.clips) {
        if (clip.trackId != targetTrackId || clip.mediaType != MediaType::Audio) {
            continue;
        }
        clip.muted = false;
        clip.volumeDb = 0.0;
        clip.fadeInMs = 0.0;
        clip.fadeOutMs = 0.0;
        clip.fadeInShape.clear();
        clip.fadeOutShape.clear();
        // Keyed Volume lives in the parsed scene (Mixer.cpp clipVolumeEnvelope).
        clip.scene.reset();
        for (const auto* field : {"audioEffects", "volumeDb", "fadeInMs", "fadeOutMs", "fadeInShape", "fadeOutShape", "muted"}) {
            clip.raw.remove(QLatin1String(field));
        }
        clips.push_back(std::move(clip));
    }
    copy.tracks = std::move(tracks);
    copy.clips = std::move(clips);
    copy.masterVolumeDb = 0.0;
    auto master = copy.raw.value("master").toObject();
    master.remove("effects");
    master.remove("volumeDb");
    copy.raw.insert("master", master);
    QJsonArray rawTracks;
    for (const auto& track : copy.tracks) {
        rawTracks.append(track.raw);
    }
    QJsonArray rawClips;
    for (const auto& clip : copy.clips) {
        rawClips.append(clip.raw);
    }
    copy.raw.insert("tracks", rawTracks);
    copy.raw.insert("clips", rawClips);
    copy.indexClips();
    return copy;
}

std::vector<float> renderBounce(const Timeline& source, BounceKind kind, const std::string& targetTrackId,
                                std::int64_t startFrame, std::int64_t frames, std::vector<std::string>* problems,
                                std::function<bool()> cancelled) {
    if (frames <= 0 || startFrame < 0) {
        return {};
    }
    const Timeline changed = bounceTimeline(source, kind, targetTrackId);
    auto pcm = audio::renderOffline(changed, static_cast<int>(kSampleRate), frameToMs(startFrame), frameToMs(frames),
                                    problems, std::move(cancelled));
    if (pcm.empty()) {
        return pcm;
    }
    // renderOffline rounds the duration to frames; whole-frame input is exact.
    pcm.resize(static_cast<std::size_t>(frames) * 2, 0.0f);
    return pcm;
}

QString bounceAssetName(BounceKind kind, std::int64_t startFrame) {
    return QStringLiteral("music-%1-context-%2.wav")
        .arg(kind == BounceKind::Mix ? QStringLiteral("mix") : QStringLiteral("dry"))
        .arg(startFrame);
}

MusicBounce::MusicBounce(QObject* parent) : QObject(parent) {}

MusicBounce::~MusicBounce() {
    if (m_worker) {
        m_worker->requestInterruption();
        m_worker->wait();
    }
}

void MusicBounce::cancel() {
    if (m_worker) {
        m_worker->requestInterruption();
    }
}

bool MusicBounce::start(Job job) {
    if (m_worker || job.frames <= 0 || job.startFrame < 0) {
        return false;
    }
    const QPointer<MusicBounce> self(this);
    // The worker owns `job` by value: the timeline copy, the target and the paths.
    m_worker.reset(QThread::create([self, job = std::move(job)]() {
        BounceResult result;
        result.frames = job.frames;
        const auto interrupted = [] { return QThread::currentThread()->isInterruptionRequested(); };
        const auto post = [&self](BounceResult value) {
            // `self` outlives this thread: ~MusicBounce joins it first.
            QMetaObject::invokeMethod(
                self.data(), [self, value = std::move(value)] {
                    if (self) {
                        self->deliver(value);
                    }
                },
                Qt::QueuedConnection);
        };
        std::vector<std::string> problems;
        const auto pcm = renderBounce(job.timeline, job.kind, job.targetTrackId, job.startFrame, job.frames, &problems,
                                      interrupted);
        if (interrupted()) {
            result.cancelled = true;
            result.error = QStringLiteral("The bounce was cancelled.");
            post(std::move(result));
            return;
        }
        if (pcm.empty() || !problems.empty()) {
            QStringList lines;
            for (const auto& line : problems) {
                lines.append(QString::fromStdString(line));
            }
            result.error = lines.isEmpty() ? QStringLiteral("The context window rendered no audio.")
                                           : QStringLiteral("Context audio is missing: ") + lines.join(QStringLiteral("; "));
            post(std::move(result));
            return;
        }
        QTemporaryDir scratch;
        QString path = job.wavPath;
        if (path.isEmpty()) {
            if (!scratch.isValid()) {
                result.error = QStringLiteral("Could not create a folder for the context bounce.");
                post(std::move(result));
                return;
            }
            path = scratch.filePath(bounceAssetName(job.kind, job.startFrame));
        }
        if (!nt::assets::writeStereoFloatWav(path, pcm)) {
            result.error = QStringLiteral("Could not write the context bounce.");
            post(std::move(result));
            return;
        }
        if (!job.wavPath.isEmpty()) {
            result.wavPath = path;
        }
        if (job.upload) {
            nt::server::ServerClient client(job.upload->server, job.upload->token);
            client.setExpectedInstance(job.upload->expectedInstance);
            auto metadata = job.metadata;
            metadata.insert("generation_context", "music");
            metadata.insert("bounce", job.kind == BounceKind::Mix ? QStringLiteral("mix") : QStringLiteral("dry"));
            metadata.insert("start_frame", static_cast<qint64>(job.startFrame));
            metadata.insert("frames", static_cast<qint64>(job.frames));
            const auto imported = nt::assets::importFile(client, path, QJsonObject{{"metadata", metadata}});
            if (interrupted()) {
                result.cancelled = true;
                result.error = QStringLiteral("The bounce was cancelled.");
                post(std::move(result));
                return;
            }
            if (!imported.ok()) {
                result.error = QStringLiteral("Could not upload the context bounce: ") + imported.error;
                post(std::move(result));
                return;
            }
            result.assetId = imported.asset.value("id").toString();
        }
        result.ok = true;
        post(std::move(result));
    }));
    m_worker->start();
    return true;
}

void MusicBounce::deliver(const BounceResult& result) {
    // The worker posted this as its last step, so it is about to return.
    m_worker->wait();
    m_worker.reset();
    emit finished(result);
}

} // namespace nt::music
