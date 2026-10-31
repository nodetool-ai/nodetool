#include "motion/gesture/ClipDelta.h"
#include "model/TimelineModel.h"

#include "model/TimelineJson.h"
#include "app/EditRegistry.h"

#include <QHash>
#include <QJsonDocument>
#include <QUndoCommand>
#include <QUuid>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <memory>

namespace {

// The media identity of a clip: every field that decides which files a
// loader resolves (the picture, the sound and the asset).
QString mediaKey(const QJsonObject& raw) {
    return raw.value(u"mediaType").toString() + QChar(0x1f) + raw.value(u"mediaPath").toString() + QChar(0x1f) +
           raw.value(u"originalMediaPath").toString() + QChar(0x1f) + raw.value(u"audioPath").toString() +
           QChar(0x1f) + raw.value(u"currentAssetId").toString();
}

quint64 nextCommandToken() {
    static std::atomic<quint64> next{1};
    return next.fetch_add(1, std::memory_order_relaxed);
}

// One edit of the `markers` array.
class MarkersCommand : public QUndoCommand {
public:
    MarkersCommand(TimelineModel* model, QJsonArray before, QJsonArray after, const QString& text)
        : QUndoCommand(text), m_model(model), m_before(std::move(before)), m_after(std::move(after)) {}
    void redo() override { m_model->replaceMarkers(m_after); }
    void undo() override { m_model->replaceMarkers(m_before); }

private:
    TimelineModel* m_model;
    QJsonArray m_before;
    QJsonArray m_after;
};

class DocumentCommand : public QUndoCommand {
public:
    DocumentCommand(QString name, QJsonObject before, QJsonObject after,
                    std::function<void(const QJsonObject&)> replace, quint64 token,
                    int mergeId = 0, bool continuation = false)
        : QUndoCommand(name), m_before(std::move(before)), m_after(std::move(after)),
          m_replace(std::move(replace)), m_token(token), m_id(mergeId > 0 ? mergeId : -1),
          m_continuation(continuation) {}
    void redo() override { m_replace(m_after); }
    void undo() override { m_replace(m_before); }
    int id() const override { return m_id; }
    bool mergeWith(const QUndoCommand* other) override {
        const auto* next = dynamic_cast<const DocumentCommand*>(other);
        if (!next || !next->m_continuation) { return false; }
        m_after = next->m_after;
        m_token = next->m_token;
        return true;
    }
    quint64 token() const { return m_token; }
    void settle(const QJsonObject& document) { m_after = document; }
private:
    QJsonObject m_before;
    QJsonObject m_after;
    std::function<void(const QJsonObject&)> m_replace;
    quint64 m_token;
    int m_id;
    bool m_continuation;
};

}  // namespace

TimelineModel::TimelineModel(QObject* parent)
    : QObject(parent),
      m_timeline(std::make_shared<const nt::Timeline>()),
      m_tracks(new TrackListModel(this)),
      m_undo(new QUndoStack(this)) {}

void TimelineModel::setTimeline(nt::Timeline timeline) {
    m_media.clear();
    m_mattes.clear();
    for (const auto& c : timeline.clips) {
        if (!c.generatedMattePath.empty()) m_mattes.insert(c.raw.value("generatedMatte").toObject().value("assetId").toString(), c.generatedMattePath);
        if (!c.mediaPath.empty() || !c.originalMediaPath.empty() || !c.audioPath.empty())
            m_media.insert(mediaKey(c.raw), {c.mediaPath, c.originalMediaPath, c.audioPath});
    }
    timeline.revision = nt::nextTimelineRevision();
    timeline.indexClips();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(timeline));
    markAllChanged();
    ++m_generation;
    emit documentReplaced();
    m_undo->clear();
    m_tracks->reset(m_timeline.get());
    // A new document replaces the clips too: lane models that outlive the
    // reset must drop the old snapshot.
    emit clipsChanged();
    emit timelineChanged();
    emit markersChanged();
}

double TimelineModel::contentEndMs() const {
    double end = m_timeline->durationMs;
    for (const auto& c : m_timeline->clips) {
        end = std::max(end, c.endMs());
    }
    return end;
}

QJsonArray TimelineModel::clipsJson() const {
    return m_timeline->raw.value(u"clips").toArray();
}

QByteArray TimelineModel::documentJson() const {
    return QJsonDocument(m_timeline->raw).toJson(QJsonDocument::Compact);
}

bool TimelineModel::replaceClips(const QJsonArray& clips) {
    // Incremental: a clip whose JSON did not change keeps its typed copy, and
    // only the changed clips are parsed. An unchanged clip shares its JSON
    // with the old one, so the comparison is a pointer check.
    const nt::Timeline& old = *m_timeline;
    std::vector<int> reuse(static_cast<size_t>(clips.size()), -1);
    bool sameIds = clips.size() == static_cast<int>(old.clips.size());
    bool same = sameIds;
    for (int i = 0; i < clips.size(); ++i) {
        const QJsonObject c = clips.at(i).toObject();
        // Most clips keep their place: compare at the same index first.
        if (static_cast<size_t>(i) < old.clips.size() && old.clips[static_cast<size_t>(i)].raw == c) {
            reuse[static_cast<size_t>(i)] = i;
            continue;
        }
        const nt::Clip* prev = old.findClip(c.value(u"id").toString().toStdString());
        const int j = prev ? static_cast<int>(prev - old.clips.data()) : -1;
        sameIds = sameIds && j == i;
        if (j >= 0 && prev->raw == c) {
            reuse[static_cast<size_t>(i)] = j;
            same = same && j == i;
        } else {
            same = false;
        }
    }
    if (same) return false;
    return applyClips(clips, reuse, sameIds);
}

bool TimelineModel::patchClips(const QJsonArray& changed) {
    return patch(changed, false);
}

bool TimelineModel::previewClips(const QJsonArray& changed) {
    return patch(changed, true);
}

void TimelineModel::settleTransient() {
    if (!m_transient) return;
    Transient pending = std::move(*m_transient);
    m_transient.reset();
    m_changedClipIds = std::move(pending.clipIds);
    m_changedTrackIds = std::move(pending.trackIds);
    if (pending.takesChanged) ++m_takesRevision;
    emit clipsChanged();
    emit timelineChanged();
}

bool TimelineModel::patch(const QJsonArray& changed, bool transient) {
    const nt::Timeline& old = *m_timeline;
    QJsonArray clips = old.raw.value(u"clips").toArray();
    std::vector<int> reuse(old.clips.size());
    for (size_t i = 0; i < reuse.size(); ++i) reuse[i] = static_cast<int>(i);
    bool any = false;
    for (const auto& value : changed) {
        const QJsonObject c = value.toObject();
        const nt::Clip* prev = old.findClip(c.value(u"id").toString().toStdString());
        if (!prev) return false;
        if (prev->raw == c) continue;
        const auto i = static_cast<size_t>(prev - old.clips.data());
        clips.replace(static_cast<int>(i), c);
        reuse[i] = -1;
        any = true;
    }
    return any && applyClips(clips, reuse, true, transient);
}

bool TimelineModel::applyClips(const QJsonArray& clips, const std::vector<int>& reuse, bool sameIds, bool transient) {
    const nt::Timeline& old = *m_timeline;
    QJsonObject raw = old.raw;
    raw.insert(QStringLiteral("clips"), clips);
    QJsonArray changed;
    for (size_t i = 0; i < reuse.size(); ++i) {
        if (reuse[i] < 0) changed.append(clips.at(static_cast<int>(i)));
    }
    std::vector<nt::Clip> parsedClips;
    if (!changed.isEmpty()) {
        // The changed clips parse in a document of their own with the
        // sequence's fields and tracks.
        QJsonObject part = raw;
        part.insert(QStringLiteral("clips"), changed);
        nt::ParseResult parsed = nt::parseTimeline(part);
        if (!parsed.timeline || parsed.timeline->clips.size() != static_cast<size_t>(changed.size())) return false;
        parsedClips = std::move(parsed.timeline->clips);
        // The parse knows neither the load's base folder nor the server's
        // asset cache: take the media the document's load resolved.
        for (auto& c : parsedClips) {
            c.generatedMattePath = m_mattes.value(c.raw.value("generatedMatte").toObject().value("assetId").toString());
            const auto it = m_media.constFind(mediaKey(c.raw));
            if (it != m_media.constEnd()) {
                c.mediaPath = it->picture;
                c.originalMediaPath = it->originalPicture;
                c.audioPath = it->audio;
            }
        }
    }
    QSet<QString> changedIds;
    QSet<QString> changedTracks;
    bool takesChanged = !sameIds;
    std::vector<nt::Clip> nextClips;
    nextClips.reserve(reuse.size());
    size_t k = 0;
    for (size_t i = 0; i < reuse.size(); ++i) {
        if (reuse[i] >= 0) {
            nextClips.push_back(old.clips[static_cast<size_t>(reuse[i])]);
            continue;
        }
        nt::Clip& next = parsedClips[k++];
        if (!takesChanged) {
            const nt::Clip* prev = old.findClip(next.id);
            takesChanged = !prev || prev->raw.value(u"versions") != next.raw.value(u"versions");
        }
        changedIds.insert(QString::fromStdString(next.id));
        if (const nt::Clip* prev = old.findClip(next.id)) changedTracks.insert(QString::fromStdString(prev->trackId));
        changedTracks.insert(QString::fromStdString(next.trackId));
        nextClips.push_back(std::move(next));
    }
    // Every other field (the sequence's and the tracks') stays as loaded.
    nt::Timeline full = old;
    full.raw = raw;
    full.clips = std::move(nextClips);
    full.revision = nt::nextTimelineRevision();
    if (!sameIds) full.indexClips();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(full));
    m_tracks->rebind(m_timeline.get());
    if (transient) {
        if (!m_transient) m_transient.emplace();
        m_transient->clipIds.unite(changedIds);
        m_transient->trackIds.unite(changedTracks);
        m_transient->takesChanged = m_transient->takesChanged || takesChanged;
        emit previewChanged();
        return true;
    }
    if (m_transient) {
        // A full change also carries the transient ones before it.
        changedIds.unite(m_transient->clipIds);
        changedTracks.unite(m_transient->trackIds);
        takesChanged = takesChanged || m_transient->takesChanged;
        m_transient.reset();
    }
    m_changedClipIds = sameIds ? std::optional<QSet<QString>>(std::move(changedIds)) : std::nullopt;
    m_changedTrackIds = std::move(changedTracks);
    if (takesChanged) ++m_takesRevision;
    emit clipsChanged();
    emit timelineChanged();
    return true;
}

bool TimelineModel::trackTouched(const QString& trackId) const {
    return !m_changedClipIds || m_changedTrackIds.contains(trackId);
}

bool TimelineModel::clipTouched(const QString& clipId) const {
    return !m_changedClipIds || m_changedClipIds->contains(clipId);
}

const nt::Clip* TimelineModel::findClip(const QString& clipId) const {
    return m_timeline->findClip(clipId.toStdString());
}

void TimelineModel::markAllChanged() {
    m_transient.reset();
    m_changedClipIds.reset();
    ++m_takesRevision;
}

quint64 TimelineModel::commitEdit(const QString& text, const QJsonArray& before, const QJsonArray& after, int mergeId,
                               bool continuation) {
    const QJsonArray savedBefore = before;
    const QJsonArray savedAfter = after;
    if (savedBefore == savedAfter) return false;
    const auto liveBefore = clipsJson();
    emit beforeCommand();
    const auto restored = clipsJson();
    // An external command may have been computed against a transient preview.
    // Apply only its observable changes to the restored committed clips.
    const auto commandBefore = liveBefore == restored ? savedBefore : restored;
    const auto commandAfter = liveBefore == restored ? savedAfter : nt::motion::rebaseClipDelta(restored, savedBefore, savedAfter);
    if (commandBefore == commandAfter) return false;
    auto beforeDocument = m_timeline->raw;
    beforeDocument.insert("clips", commandBefore);
    auto afterDocument = m_timeline->raw;
    afterDocument.insert("clips", commandAfter);
    const auto token = nextCommandToken();
    auto command = std::make_unique<DocumentCommand>(text, std::move(beforeDocument), std::move(afterDocument),
        [this](const QJsonObject& raw) { replaceDocument(raw); }, token, mergeId, continuation);
    m_undo->push(command.release());
    return token;
}

bool TimelineModel::moveClip(const QString& clipId, double startMs) {
    QJsonArray clips = clipsJson();
    for (int i = 0; i < clips.size(); ++i) {
        QJsonObject c = clips.at(i).toObject();
        if (c.value(u"id").toString() != clipId) continue;
        c.insert(QStringLiteral("startMs"), std::max(0.0, startMs));
        clips.replace(i, c);
        return commitEdit(QStringLiteral("Move clip"), clipsJson(), clips);
    }
    return false;
}

QJsonArray TimelineModel::markersJson() const {
    return m_timeline->raw.value(u"markers").toArray();
}

QVariantList TimelineModel::markers() const {
    return markersJson().toVariantList();
}

bool TimelineModel::replaceMarkers(const QJsonArray& incoming) {
    const QJsonArray markers = incoming;
    emit beforeCommand();
    if (markers == markersJson()) return false;
    nt::Timeline next = *m_timeline;
    next.raw.insert(QStringLiteral("markers"), markers);
    next.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(next));
    markAllChanged();
    m_tracks->rebind(m_timeline.get());
    emit markersChanged();
    return true;
}

QString TimelineModel::addMarker(double timeMs, const QString& label) {
    // makeMarker: a fresh id, the time rounded to whole ms and not negative.
    const QString id = QUuid::createUuid().toString(QUuid::Id128);
    QJsonArray after = markersJson();
    after.append(QJsonObject{{QStringLiteral("id"), id},
                             {QStringLiteral("timeMs"), std::max(0.0, std::round(timeMs))},
                             {QStringLiteral("label"), label}});
    m_undo->push(new MarkersCommand(this, markersJson(), after, QStringLiteral("Add marker")));
    return id;
}

bool TimelineModel::deleteMarker(const QString& markerId) {
    QJsonArray after;
    const QJsonArray before = markersJson();
    for (const QJsonValue& m : before) {
        if (m.toObject().value(u"id").toString() != markerId) after.append(m);
    }
    if (after.size() == before.size()) return false;
    m_undo->push(new MarkersCommand(this, before, after, QStringLiteral("Delete marker")));
    return true;
}

void TimelineModel::close() {
    nt::Timeline empty;
    empty.name = m_timeline->name;
    empty.fps = m_timeline->fps;
    empty.width = m_timeline->width;
    empty.height = m_timeline->height;
    setTimeline(std::move(empty));
}

quint64 TimelineModel::applyEdit(const QString& name, const QJsonObject& payload) {
    const auto edit = nt::app::findEdit(name);
    if (!edit) {
        return false;
    }
    const auto valid = [this](const QJsonObject& before, const QJsonObject& after) {
        auto beforeFields = before;
        auto afterFields = after;
        beforeFields.remove("clips");
        afterFields.remove("clips");
        if (beforeFields == afterFields) {
            if (!after.value("clips").isArray()) {
                return false;
            }
            QHash<QString, QJsonObject> existing;
            existing.reserve(static_cast<int>(m_timeline->clips.size()));
            for (const auto& clip : m_timeline->clips) {
                existing.insert(QString::fromStdString(clip.id), clip.raw);
            }
            QJsonArray changed;
            for (const auto& value : after.value("clips").toArray()) {
                if (!value.isObject()) {
                    return false;
                }
                const auto clip = value.toObject();
                if (existing.value(clip.value("id").toString()) != clip) {
                    changed.append(clip);
                }
            }
            if (!changed.isEmpty()) {
                auto part = after;
                part.insert("clips", changed);
                const auto parsed = nt::parseTimeline(part);
                if (!parsed.timeline || parsed.timeline->clips.size() != static_cast<size_t>(changed.size())) {
                    return false;
                }
            }
        } else {
            beforeFields = before;
            afterFields = after;
            beforeFields.remove("markers");
            afterFields.remove("markers");
            if (beforeFields == afterFields) {
                if (!after.value("markers").isArray()) {
                    return false;
                }
            } else if (!nt::parseTimeline(after).timeline) {
                return false;
            }
        }
        return true;
    };
    auto before = m_timeline->raw;
    auto after = edit(before, payload);
    if (before == after || !valid(before, after)) { return false; }
    emit beforeCommand();
    const auto restored = m_timeline->raw;
    if (restored != before) {
        before = restored;
        after = edit(before, payload);
        if (before == after || !valid(before, after)) { return false; }
    }
    const auto token = nextCommandToken();
    auto command = std::make_unique<DocumentCommand>(name, before, after,
        [this](const QJsonObject& raw) { replaceDocument(raw); }, token);
    m_undo->push(command.release());
    return token;
}

bool TimelineModel::replaceDocument(const QJsonObject& incoming) {
    const QJsonObject raw = incoming;
    emit beforeCommand();
    if (raw == m_timeline->raw) {
        return false;
    }
    auto beforeFields = m_timeline->raw;
    auto afterFields = raw;
    beforeFields.remove("clips");
    afterFields.remove("clips");
    if (beforeFields == afterFields && raw.contains("clips")) {
        return replaceClips(raw.value("clips").toArray());
    }
    beforeFields = m_timeline->raw;
    afterFields = raw;
    beforeFields.remove("markers");
    afterFields.remove("markers");
    if (beforeFields == afterFields && raw.contains("markers")) {
        return replaceMarkers(raw.value("markers").toArray());
    }
    auto parsed = nt::parseTimeline(raw);
    if (!parsed.timeline) {
        return false;
    }
    const bool tracksChanged = raw.value("tracks") != m_timeline->raw.value("tracks");
    const bool markersChangedValue = raw.value("markers") != m_timeline->raw.value("markers");
    auto next = std::move(*parsed.timeline);
    for (auto& clip : next.clips) {
        clip.generatedMattePath = m_mattes.value(clip.raw.value("generatedMatte").toObject().value("assetId").toString());
        const auto media = m_media.constFind(mediaKey(clip.raw));
        if (media != m_media.constEnd()) {
            clip.mediaPath = media->picture;
            clip.originalMediaPath = media->originalPicture;
            clip.audioPath = media->audio;
        }
    }
    next.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(next));
    markAllChanged();
    if (tracksChanged) {
        m_tracks->reset(m_timeline.get());
    } else {
        m_tracks->rebind(m_timeline.get());
    }
    emit clipsChanged();
    emit timelineChanged();
    if (markersChangedValue) {
        emit markersChanged();
    }
    return true;
}

void TimelineModel::registerMedia(const nt::Clip& media) {
    const auto key = mediaKey(media.raw);
    m_media.insert(key, {media.mediaPath, media.originalMediaPath, media.audioPath});
    const QString matteId = media.raw.value("generatedMatte").toObject().value("assetId").toString();
    if (!matteId.isEmpty() && !media.generatedMattePath.empty()) {
        m_mattes.insert(matteId, media.generatedMattePath);
    }
    auto next = *m_timeline;
    bool changed = false;
    for (auto& clip : next.clips) {
        if (mediaKey(clip.raw) == key &&
            (clip.mediaPath != media.mediaPath || clip.originalMediaPath != media.originalMediaPath ||
             clip.audioPath != media.audioPath)) {
            clip.mediaPath = media.mediaPath;
            clip.originalMediaPath = media.originalMediaPath;
            clip.audioPath = media.audioPath;
            changed = true;
        }
        if (!matteId.isEmpty() && !media.generatedMattePath.empty() &&
            clip.raw.value("generatedMatte").toObject().value("assetId").toString() == matteId &&
            clip.generatedMattePath != media.generatedMattePath) {
            clip.generatedMattePath = media.generatedMattePath;
            changed = true;
        }
    }
    if (!changed) { return; }
    next.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(next));
    markAllChanged();
    m_tracks->rebind(m_timeline.get());
    emit clipsChanged();
    emit timelineChanged();
}

QSet<QString> TimelineModel::resolvedMediaPaths() const {
    QSet<QString> paths;
    for (const auto& media : m_media) {
        if (!media.picture.empty()) paths.insert(QString::fromStdString(media.picture));
        if (!media.originalPicture.empty()) paths.insert(QString::fromStdString(media.originalPicture));
        if (!media.audio.empty()) paths.insert(QString::fromStdString(media.audio));
    }
    for (const auto& matte : m_mattes) {
        if (!matte.empty()) paths.insert(QString::fromStdString(matte));
    }
    return paths;
}

void TimelineModel::registerMatteMedia(const QString& assetId, const std::string& path) {
    if (assetId.isEmpty()) { return; }
    m_mattes.insert(assetId, path);
    auto next = *m_timeline;
    bool changed = false;
    for (auto& clip : next.clips) {
        if (clip.raw.value("generatedMatte").toObject().value("assetId").toString() == assetId &&
            clip.generatedMattePath != path) {
            clip.generatedMattePath = path;
            changed = true;
        }
    }
    if (!changed) { return; }
    next.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(next));
    markAllChanged();
    m_tracks->rebind(m_timeline.get());
    emit clipsChanged();
    emit timelineChanged();
}

bool TimelineModel::settleDocument(const QJsonObject& document) {
    if (!nt::parseTimeline(document).timeline) { return false; }
    const auto before = m_timeline->raw;
    const QJsonObject incoming = document;
    emit beforeCommand();
    const auto restored = m_timeline->raw;
    const auto after = before == restored ? incoming : nt::motion::rebaseDocumentDelta(restored, before, incoming);
    if (!replaceDocument(after)) { return false; }
    emit commandSettled();
    return true;
}

bool TimelineModel::settleCommand(quint64 token, const QJsonObject& document) {
    if (token == 0) { return false; }
    for (int i = 0; i < m_undo->count(); ++i) {
        const auto* command = dynamic_cast<const DocumentCommand*>(m_undo->command(i));
        if (!command || command->token() != token) { continue; }
        if (i + 1 != m_undo->count()) { return false; }
        if (!nt::parseTimeline(document).timeline) {
            return false;
        }
        QJsonObject settled = document;
        const bool current = m_undo->index() == i + 1;
        if (current) {
            const auto before = m_timeline->raw;
            emit beforeCommand();
            const auto restored = m_timeline->raw;
            if (before != restored) { settled = nt::motion::rebaseDocumentDelta(restored, before, settled); }
        }
        if (!nt::parseTimeline(settled).timeline) {
            return false;
        }
        // QUndoStack exposes commands as const, but owns the mutable command.
        const_cast<DocumentCommand*>(command)->settle(settled);
        if (current && replaceDocument(settled)) { emit commandSettled(); }
        return true;
    }
    return false;
}
