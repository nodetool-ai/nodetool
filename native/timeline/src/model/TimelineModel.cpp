#include "model/TimelineModel.h"

#include "model/TimelineJson.h"

#include <QHash>
#include <QJsonDocument>
#include <QUndoCommand>
#include <QUuid>

#include <algorithm>
#include <cmath>

namespace {

// The media identity of a clip: every field that decides which files a
// loader resolves (the picture, the sound and the asset).
QString mediaKey(const QJsonObject& raw) {
    return raw.value(u"mediaType").toString() + QChar(0x1f) + raw.value(u"mediaPath").toString() + QChar(0x1f) +
           raw.value(u"audioPath").toString() + QChar(0x1f) + raw.value(u"currentAssetId").toString();
}

// One edit of the clips array: undo restores the array that was there.
class ClipsCommand : public QUndoCommand {
public:
    ClipsCommand(TimelineModel* model, QJsonArray before, QJsonArray after, const QString& text, int mergeId,
                 bool continuation)
        : QUndoCommand(text),
          m_model(model),
          m_before(std::move(before)),
          m_after(std::move(after)),
          m_id(mergeId > 0 ? mergeId : -1),
          m_continuation(continuation) {}
    void redo() override { m_model->replaceClips(m_after); }
    void undo() override { m_model->replaceClips(m_before); }
    int id() const override { return m_id; }
    bool mergeWith(const QUndoCommand* other) override {
        const auto* next = static_cast<const ClipsCommand*>(other);
        if (!next->m_continuation) return false;
        m_after = next->m_after;
        return true;
    }

private:
    TimelineModel* m_model;
    QJsonArray m_before;
    QJsonArray m_after;
    int m_id;
    bool m_continuation;
};

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

}  // namespace

TimelineModel::TimelineModel(QObject* parent)
    : QObject(parent),
      m_timeline(std::make_shared<const nt::Timeline>()),
      m_tracks(new TrackListModel(this)),
      m_undo(new QUndoStack(this)) {}

void TimelineModel::setTimeline(nt::Timeline timeline) {
    m_media.clear();
    for (const auto& c : timeline.clips) {
        if (!c.mediaPath.empty() || !c.audioPath.empty()) m_media.insert(mediaKey(c.raw), {c.mediaPath, c.audioPath});
    }
    timeline.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(timeline));
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
    // only the changed clips are parsed, in a document of their own with the
    // sequence's fields and tracks. A whole-document parse costs ~13 ms at
    // 2000 clips, too much for a live gesture update.
    const nt::Timeline& old = *m_timeline;
    QHash<QString, int> oldIndex;
    oldIndex.reserve(static_cast<int>(old.clips.size()));
    for (size_t i = 0; i < old.clips.size(); ++i) {
        oldIndex.insert(QString::fromStdString(old.clips[i].id), static_cast<int>(i));
    }
    std::vector<int> reuse(static_cast<size_t>(clips.size()), -1);
    QJsonArray changed;
    bool same = clips.size() == static_cast<int>(old.clips.size());
    for (int i = 0; i < clips.size(); ++i) {
        const QJsonObject c = clips.at(i).toObject();
        const int j = oldIndex.value(c.value(u"id").toString(), -1);
        if (j >= 0 && old.clips[static_cast<size_t>(j)].raw == c) {
            reuse[static_cast<size_t>(i)] = j;
            same = same && j == i;
        } else {
            changed.append(c);
            same = false;
        }
    }
    if (same) return false;

    QJsonObject raw = old.raw;
    raw.insert(QStringLiteral("clips"), clips);
    std::vector<nt::Clip> parsedClips;
    if (!changed.isEmpty()) {
        QJsonObject part = raw;
        part.insert(QStringLiteral("clips"), changed);
        nt::ParseResult parsed = nt::parseTimelineJson(QJsonDocument(part).toJson(QJsonDocument::Compact));
        if (!parsed.timeline || parsed.timeline->clips.size() != static_cast<size_t>(changed.size())) return false;
        parsedClips = std::move(parsed.timeline->clips);
        // The parse knows neither the load's base folder nor the server's
        // asset cache: take the media the document's load resolved.
        for (auto& c : parsedClips) {
            const auto it = m_media.constFind(mediaKey(c.raw));
            if (it != m_media.constEnd()) {
                c.mediaPath = it->first;
                c.audioPath = it->second;
            }
        }
    }
    std::vector<nt::Clip> nextClips;
    nextClips.reserve(static_cast<size_t>(clips.size()));
    size_t k = 0;
    for (size_t i = 0; i < reuse.size(); ++i) {
        nextClips.push_back(reuse[i] >= 0 ? old.clips[static_cast<size_t>(reuse[i])] : std::move(parsedClips[k++]));
    }
    // Every other field (the sequence's and the tracks') stays as loaded.
    nt::Timeline full = old;
    full.raw = raw;
    full.clips = std::move(nextClips);
    full.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(full));
    m_tracks->rebind(m_timeline.get());
    emit clipsChanged();
    emit timelineChanged();
    return true;
}

bool TimelineModel::commitEdit(const QString& text, const QJsonArray& before, const QJsonArray& after, int mergeId,
                               bool continuation) {
    if (before == after) return false;
    m_undo->push(new ClipsCommand(this, before, after, text, mergeId, continuation));
    return true;
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

bool TimelineModel::replaceMarkers(const QJsonArray& markers) {
    if (markers == markersJson()) return false;
    nt::Timeline next = *m_timeline;
    next.raw.insert(QStringLiteral("markers"), markers);
    next.revision = nt::nextTimelineRevision();
    m_timeline = std::make_shared<const nt::Timeline>(std::move(next));
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
