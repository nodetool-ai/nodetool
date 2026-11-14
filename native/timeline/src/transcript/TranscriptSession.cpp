#include "transcript/TranscriptSession.h"

#include "playback/PlaybackClock.h"
#include "ui/TimelineViewState.h"

#include <QSet>
#include <algorithm>
#include <cmath>

namespace {
constexpr int SETTLE_MS = 60;
constexpr double RANGE_TOLERANCE_MS = 0.001;
const QString NEW_CAPTION_REFUSAL = QStringLiteral("A caption needs an unlocked audio or video clip under the playhead, with no caption there yet. For words over a picture, use Add text in the timeline toolbar.");
const QString LOCKED_REFUSAL = QStringLiteral("Unlock the clip to edit this caption.");
}

TranscriptRows::TranscriptRows(QStringList roles, QObject* parent) : QAbstractListModel(parent), m_roles(std::move(roles)) {}
int TranscriptRows::rowCount(const QModelIndex& parent) const { return parent.isValid() ? 0 : static_cast<int>(m_rows.size()); }
QVariant TranscriptRows::data(const QModelIndex& index, int role) const {
    const auto column = role - Qt::UserRole;
    if (!index.isValid() || index.row() >= m_rows.size() || column < 0 || column >= m_roles.size()) { return {}; }
    return m_rows.at(index.row()).value(m_roles.at(column));
}
QHash<int, QByteArray> TranscriptRows::roleNames() const {
    QHash<int, QByteArray> names;
    for (int i = 0; i < m_roles.size(); ++i) { names.insert(Qt::UserRole + i, m_roles.at(i).toUtf8()); }
    return names;
}
void TranscriptRows::setRows(QList<QVariantMap> rows) {
    if (rows.size() != m_rows.size()) {
        beginResetModel();
        m_rows = std::move(rows);
        endResetModel();
        return;
    }
    for (int i = 0; i < rows.size(); ++i) {
        if (rows.at(i) == m_rows.at(i)) { continue; }
        m_rows[i] = rows.at(i);
        emit dataChanged(index(i), index(i));
    }
}

TranscriptSession::TranscriptSession(QObject* parent)
    : QObject(parent),
      m_paragraphRows(new TranscriptRows({"firstWord", "wordCount", "speaker", "startMs", "text"}, this)),
      m_cueRows(new TranscriptRows({"clipId", "firstWord", "wordCount", "text", "startMs", "endMs", "canSplit", "canMerge", "locked"}, this)) {
    m_settle.setSingleShot(true);
    m_settle.setInterval(SETTLE_MS);
    connect(&m_settle, &QTimer::timeout, this, &TranscriptSession::flush);
}

void TranscriptSession::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) { return; }
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = timeline;
    if (timeline) {
        connect(timeline, &TimelineModel::clipsChanged, this, &TranscriptSession::scheduleRefresh);
    }
    m_dirty = true;
    flush();
    emit timelineChanged();
}

void TranscriptSession::setGestures(ClipGestureController* gestures) {
    if (m_gestures == gestures) { return; }
    if (m_gestures) {
        disconnect(m_gestures, nullptr, this, nullptr);
        if (m_gestures->viewState()) { disconnect(m_gestures->viewState(), nullptr, this, nullptr); }
    }
    m_gestures = gestures;
    if (gestures) {
        connect(gestures, &ClipGestureController::selectionChanged, this, &TranscriptSession::refreshTranscribeTarget);
        if (gestures->viewState()) { connect(gestures->viewState(), &TimelineViewState::rangeChanged, this, &TranscriptSession::rangeChanged); }
    }
    refreshTranscribeTarget();
    emit gesturesChanged();
}

void TranscriptSession::setActive(bool active) {
    if (m_active == active) { return; }
    m_active = active;
    if (active) { flush(); }
    emit activeChanged();
}

QJsonObject TranscriptSession::document() const { return m_timeline ? m_timeline->timeline().raw : QJsonObject{}; }
double TranscriptSession::fps() const { return document().value("fps").toDouble(30); }
double TranscriptSession::playheadMs() const { return m_gestures && m_gestures->clock() ? m_gestures->clock()->time() : 0; }

void TranscriptSession::scheduleRefresh() {
    m_dirty = true;
    if (m_active) { m_settle.start(); }
}

void TranscriptSession::flush() {
    m_settle.stop();
    if (m_dirty && (m_active || !m_timeline)) { refresh(); }
}

void TranscriptSession::refresh() {
    m_dirty = false;
    const auto raw = document();
    auto words = nt::transcript::sequenceWords(raw);
    const int hidden = nt::transcript::hiddenWordCount(raw);
    const bool wordsSame = words == m_words;
    if (!wordsSame) {
        m_words = std::move(words);
        m_paragraphs = nt::transcript::paragraphs(m_words);
        dropSelection();
        QList<QVariantMap> rows;
        rows.reserve(static_cast<qsizetype>(m_paragraphs.size()));
        for (const auto& paragraph : m_paragraphs) {
            QStringList text;
            for (int i = paragraph.first; i < paragraph.first + paragraph.count; ++i) { text << m_words[static_cast<size_t>(i)].text; }
            rows.append({{"firstWord", paragraph.first}, {"wordCount", paragraph.count}, {"speaker", paragraph.speaker},
                         {"startMs", paragraph.startMs}, {"text", text.join(' ')}});
        }
        m_paragraphRows->setRows(std::move(rows));
        setMatches();
    }
    if (!wordsSame || hidden != m_hiddenWords) {
        m_hiddenWords = hidden;
        emit wordsChanged();
    }
    auto cues = nt::transcript::sequenceCues(raw);
    if (cues != m_cues) {
        m_cues = std::move(cues);
        QList<QVariantMap> rows;
        rows.reserve(static_cast<qsizetype>(m_cues.size()));
        for (const auto& cue : m_cues) {
            rows.append({{"clipId", cue.clipId}, {"firstWord", cue.firstWord}, {"wordCount", cue.wordCount}, {"text", cue.text},
                         {"startMs", cue.startMs}, {"endMs", cue.endMs}, {"canSplit", cue.canSplit}, {"canMerge", cue.canMerge}, {"locked", cue.locked}});
        }
        m_cueRows->setRows(std::move(rows));
        emit cuesChanged();
    }
    refreshTranscribeTarget();
}

// The selected clip when it can be transcribed, else the first clip with media and no words.
void TranscriptSession::refreshTranscribeTarget() {
    const QStringList selected = m_gestures ? m_gestures->selection() : QStringList{};
    const QSet<QString> chosen(selected.begin(), selected.end());
    QString id, name;
    double earliest = 0;
    bool haveSelected = false;
    for (const auto& value : document().value("clips").toArray()) {
        const auto clip = value.toObject();
        const auto type = clip.value("mediaType").toString();
        if ((type != "audio" && type != "video") || clip.value("currentAssetId").toString().isEmpty()) { continue; }
        if (clip.value("reverse").toBool() || clip.contains("timeRemap") || !clip.value("caption").toObject().value("words").toArray().isEmpty()) { continue; }
        const bool isSelected = chosen.contains(clip.value("id").toString());
        const double start = clip.value("startMs").toDouble();
        if (id.isEmpty() || (isSelected && !haveSelected) || (isSelected == haveSelected && start < earliest)) {
            id = clip.value("id").toString();
            name = clip.value("name").toString();
            earliest = start;
            haveSelected = isSelected;
        }
    }
    if (id != m_transcribeId || name != m_transcribeName) {
        m_transcribeId = id;
        m_transcribeName = name;
        emit transcribeTargetChanged();
    }
}

QString TranscriptSession::selectionText() const {
    if (m_first < 0) { return {}; }
    const int count = m_last - m_first + 1;
    return count == 1 ? QStringLiteral("1 word selected") : QStringLiteral("%1 words selected").arg(count);
}

double TranscriptSession::wordStartMs(int word) const {
    return word >= 0 && word < wordCount() ? m_words[static_cast<size_t>(word)].startMs : -1;
}
double TranscriptSession::wordEndMs(int word) const {
    return word >= 0 && word < wordCount() ? m_words[static_cast<size_t>(word)].endMs : -1;
}
int TranscriptSession::cueAt(double timeMs) const {
    for (int row = 0; row < cueCount(); ++row) {
        const auto& cue = m_cues[static_cast<size_t>(row)];
        if (timeMs >= cue.startMs && timeMs < cue.endMs) { return row; }
    }
    return -1;
}
double TranscriptSession::cueStartMs(int row) const { return row >= 0 && row < cueCount() ? m_cues[static_cast<size_t>(row)].startMs : -1; }
double TranscriptSession::cueEndMs(int row) const { return row >= 0 && row < cueCount() ? m_cues[static_cast<size_t>(row)].endMs : -1; }

QVariantMap TranscriptSession::cueFlags(int row, int) const {
    if (row < 0 || row >= cueCount()) { return {}; }
    const auto& cue = m_cues[static_cast<size_t>(row)];
    return {{"canSplit", cue.canSplit}, {"canMerge", cue.canMerge}, {"locked", cue.locked}};
}

void TranscriptSession::select(int anchor, int focus) {
    const auto span = nt::transcript::wordSpan(m_words, anchor, focus, fps());
    if (!span) { return; }
    m_anchor = anchor;
    m_focus = focus;
    m_first = std::min(anchor, focus);
    m_last = std::max(anchor, focus);
    m_span = *span;
    setStatus({});
    markRange();
    if (m_gestures && m_gestures->clock()) { m_gestures->clock()->seek(m_span.startMs); }
    emit selectionChanged();
    emit matchesChanged();
    emit revealWord(focus);
}

void TranscriptSession::markRange() {
    if (!m_gestures || !m_gestures->viewState()) { return; }
    m_settingRange = true;
    auto* view = m_gestures->viewState();
    view->clearRange();
    view->setRangeIn(m_span.startMs);
    view->setRangeOut(m_span.endMs);
    m_settingRange = false;
}

void TranscriptSession::selectWord(int word, bool extend) {
    flush();
    if (word < 0 || word >= wordCount()) { return; }
    select(extend && m_anchor >= 0 ? m_anchor : word, word);
}

void TranscriptSession::moveSelection(int delta, bool extend) {
    flush();
    if (m_words.empty()) { return; }
    int from = m_focus;
    if (from < 0) {
        const double now = playheadMs();
        const auto next = std::partition_point(m_words.begin(), m_words.end(), [now](const auto& w) { return w.endMs <= now; });
        from = static_cast<int>(next - m_words.begin()) - (delta > 0 ? 1 : 0);
    }
    const int target = std::clamp(from + delta, 0, wordCount() - 1);
    select(extend && m_anchor >= 0 ? m_anchor : target, target);
}

void TranscriptSession::dropSelection() {
    if (m_first < 0) { return; }
    m_anchor = m_focus = m_first = m_last = -1;
    emit selectionChanged();
    emit matchesChanged();
}

void TranscriptSession::clearSelection() {
    if (m_first < 0) { return; }
    if (m_gestures && m_gestures->viewState()) {
        m_settingRange = true;
        m_gestures->viewState()->clearRange();
        m_settingRange = false;
    }
    dropSelection();
}

// I, O, the ruler or a clip mark can move the range. The selection follows only its own range.
void TranscriptSession::rangeChanged() {
    if (m_settingRange || m_first < 0 || !m_gestures || !m_gestures->viewState()) { return; }
    const auto* view = m_gestures->viewState();
    if (std::abs(view->rangeInMs() - m_span.startMs) > RANGE_TOLERANCE_MS || std::abs(view->rangeOutMs() - m_span.endMs) > RANGE_TOLERANCE_MS) {
        dropSelection();
    }
}

bool TranscriptSession::cut(bool ripple) {
    flush();
    if (m_first < 0) {
        setStatus(QStringLiteral("Select words first."));
        return false;
    }
    if (!m_gestures || !m_timeline) { return false; }
    const auto before = document().value("clips");
    m_settingRange = true;
    m_gestures->runAction(ripple ? QStringLiteral("extractRange") : QStringLiteral("liftRange"));
    m_settingRange = false;
    if (document().value("clips") == before) {
        // The range edit clears In and Out even when it changes nothing, so they go back.
        markRange();
        setStatus(QStringLiteral("Nothing was cut. Unlock or target a track under these words."));
        return false;
    }
    dropSelection();
    setStatus({});
    m_dirty = true;
    flush();
    return true;
}

void TranscriptSession::setQuery(const QString& query) {
    if (m_query == query) { return; }
    m_query = query;
    flush();
    setMatches();
    if (!m_matches.empty()) {
        const double now = playheadMs();
        const auto next = std::find_if(m_matches.begin(), m_matches.end(), [this, now](const auto& match) {
            return m_words[static_cast<size_t>(match.first)].startMs >= now;
        });
        emit revealWord((next == m_matches.end() ? m_matches.front() : *next).first);
    }
}

void TranscriptSession::setMatches() {
    m_matches = nt::transcript::search(m_words, m_query);
    emit matchesChanged();
}

int TranscriptSession::currentMatch() const {
    if (m_first < 0) { return -1; }
    const auto it = std::lower_bound(m_matches.begin(), m_matches.end(), m_first, [](const auto& match, int first) { return match.first < first; });
    return it != m_matches.end() && it->first == m_first && it->first + it->count - 1 == m_last ? static_cast<int>(it - m_matches.begin()) : -1;
}

void TranscriptSession::stepMatch(int delta) {
    flush();
    if (m_matches.empty()) { return; }
    const int total = matchCount();
    int target = currentMatch();
    if (target >= 0) {
        target = (target + delta + total) % total;
    } else {
        const int reference = m_first >= 0 ? m_first : wordCount() ? static_cast<int>(std::partition_point(m_words.begin(), m_words.end(), [now = playheadMs()](const auto& w) { return w.startMs < now; }) - m_words.begin()) : 0;
        const auto next = std::lower_bound(m_matches.begin(), m_matches.end(), reference, [](const auto& match, int first) { return match.first < first; });
        const int after = static_cast<int>(next - m_matches.begin());
        target = delta > 0 ? (after < total ? after : 0) : (after > 0 ? after - 1 : total - 1);
    }
    const auto& match = m_matches[static_cast<size_t>(target)];
    select(match.first, match.first + match.count - 1);
}

void TranscriptSession::setStatus(const QString& status) {
    if (m_status == status) { return; }
    m_status = status;
    emit statusChanged();
}

bool TranscriptSession::applyCueEdit(const QString& name, int row, QJsonObject payload, const QString& refusal) {
    flush();
    if (!m_timeline || row < 0 || row >= cueCount()) { return false; }
    const auto& cue = m_cues[static_cast<size_t>(row)];
    payload.insert("clipId", cue.clipId);
    payload.insert("firstWord", cue.firstWord);
    payload.insert("wordCount", cue.wordCount);
    if (m_timeline->applyEdit(name, payload) == 0) {
        setStatus(refusal);
        return false;
    }
    setStatus({});
    m_dirty = true;
    flush();
    return true;
}

bool TranscriptSession::setCueText(int row, const QString& text) {
    flush();
    if (row >= 0 && row < cueCount() && m_cues[static_cast<size_t>(row)].text == text.simplified()) { return true; }
    return applyCueEdit("captions.setText", row, {{"text", text}},
                        text.simplified().isEmpty() ? QStringLiteral("Enter some text, or delete the caption.") : LOCKED_REFUSAL);
}
bool TranscriptSession::setCueTimes(int row, double startMs, double endMs) {
    return applyCueEdit("captions.setTimes", row, {{"startMs", startMs}, {"endMs", endMs}},
                        QStringLiteral("Enter an out time after the in time. A caption stays between its neighbours in an unlocked clip."));
}
bool TranscriptSession::splitCue(int row) {
    flush();
    if (row < 0 || row >= cueCount()) { return false; }
    const auto& cue = m_cues[static_cast<size_t>(row)];
    int atWord = cue.firstWord + cue.wordCount / 2;
    // At the playhead when it is inside the caption, as a razor would cut.
    const double now = playheadMs();
    if (now > cue.startMs && now < cue.endMs) {
        for (const auto& value : document().value("clips").toArray()) {
            const auto clip = value.toObject();
            if (clip.value("id").toString() != cue.clipId) { continue; }
            const auto words = clip.value("caption").toObject().value("words").toArray();
            const double local = now - clip.value("startMs").toDouble();
            for (int i = cue.firstWord + 1; i < cue.firstWord + cue.wordCount; ++i) {
                if (words.at(i).toObject().value("startMs").toDouble() >= local) {
                    atWord = i;
                    break;
                }
            }
            break;
        }
    }
    return applyCueEdit("captions.split", row, {{"atWord", atWord}}, LOCKED_REFUSAL);
}
bool TranscriptSession::mergeCue(int row) { return applyCueEdit("captions.merge", row, {}, LOCKED_REFUSAL); }
bool TranscriptSession::deleteCue(int row) { return applyCueEdit("captions.delete", row, {}, LOCKED_REFUSAL); }

int TranscriptSession::addCue(const QString& text) {
    flush();
    if (!m_timeline) { return -1; }
    const double now = playheadMs();
    if (m_timeline->applyEdit("captions.add", {{"atMs", now}, {"text", text}}) == 0) {
        setStatus(NEW_CAPTION_REFUSAL);
        return -1;
    }
    setStatus({});
    m_dirty = true;
    flush();
    return cueAt(now);
}
