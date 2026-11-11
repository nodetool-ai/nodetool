#include "transcript/TranscriptDocument.h"

#include "edit/clipboard/RawDocument.h"

#include <QHash>
#include <QSet>
#include <algorithm>
#include <cmath>
#include <functional>

namespace nt::transcript {
namespace {
constexpr double FRAME_SNAP_TOLERANCE = 1e-6;
constexpr double DEFAULT_ADDED_CUE_MS = 2000;

bool readableTiming(const QJsonObject& clip) {
    return clip.value("enabled").toBool(true) && !clip.value("reverse").toBool() && !clip.contains("timeRemap");
}
QJsonArray captionWords(const QJsonObject& clip) { return clip.value("caption").toObject().value("words").toArray(); }
// Audio tracks read first, each kind in track order.
QHash<QString, int> trackRanks(const QJsonObject& document) {
    struct Entry { QString id; bool audio; double index; };
    std::vector<Entry> entries;
    for (const auto& value : document.value("tracks").toArray()) {
        const auto track = value.toObject();
        entries.push_back({track.value("id").toString(), track.value("type").toString() == "audio", track.value("index").toDouble()});
    }
    std::stable_sort(entries.begin(), entries.end(), [](const Entry& a, const Entry& b) {
        return a.audio != b.audio ? a.audio : a.index < b.index;
    });
    QHash<QString, int> ranks;
    for (int i = 0; i < static_cast<int>(entries.size()); ++i) { ranks.insert(entries[static_cast<size_t>(i)].id, i); }
    return ranks;
}
QStringList tokens(const QString& text) { return text.simplified().split(' ', Qt::SkipEmptyParts); }
QString cueText(const QJsonArray& words, const std::vector<int>& cue) {
    QStringList parts;
    for (const int index : cue) {
        const auto text = words.at(index).toObject().value("word").toString().trimmed();
        if (!text.isEmpty()) { parts << text; }
    }
    return parts.join(' ');
}
double documentFrameMs(const QJsonObject& document) {
    const double fps = document.value("fps").toDouble(30);
    return fps > 0 ? 1000 / fps : 1000.0 / 30;
}

// One clip's words as the caption edits see them: the cues, and the words the clip window hides.
struct ClipCaption {
    QJsonObject clip;
    qsizetype clipAt = -1;
    double duration = 0;
    QJsonArray before;
    std::vector<QJsonArray> cues;
    std::vector<int> firstRaw;
    QJsonArray after;

    static ClipCaption of(const QJsonObject& clip, qsizetype at) {
        ClipCaption result;
        result.clip = clip;
        result.clipAt = at;
        result.duration = clip.value("durationMs").toDouble();
        const auto words = captionWords(clip);
        const auto groups = captionCues(words, result.duration);
        std::vector<bool> shown(static_cast<size_t>(words.size()));
        for (const auto& group : groups) {
            QJsonArray cue;
            for (const int index : group) {
                cue.append(words.at(index));
                shown[static_cast<size_t>(index)] = true;
            }
            result.cues.push_back(cue);
            result.firstRaw.push_back(group.front());
        }
        const int first = groups.empty() ? static_cast<int>(words.size()) : groups.front().front();
        for (qsizetype i = 0; i < words.size(); ++i) {
            if (!shown[static_cast<size_t>(i)]) { (i < first ? result.before : result.after).append(words.at(i)); }
        }
        return result;
    }
    int rowOf(int firstWord, int wordCount) const {
        for (int row = 0; row < static_cast<int>(cues.size()); ++row) {
            if (firstRaw[static_cast<size_t>(row)] == firstWord && cues[static_cast<size_t>(row)].size() == wordCount) { return row; }
        }
        return -1;
    }
    // Writes the smallest set of `cue` marks that makes captionCues read these cues back.
    void writeMarks() {
        bool started = false;
        qsizetype previousSize = 0;
        double previousEnd = 0;
        for (auto& cue : cues) {
            for (qsizetype i = 0; i < cue.size(); ++i) {
                auto word = cue.at(i).toObject();
                const double gap = word.value("startMs").toDouble() - previousEnd;
                word.remove("cue");
                if (started) {
                    const bool natural = (i == 0 ? previousSize : i) >= CUE_MAX_WORDS || gap >= CUE_GAP_MS;
                    if (i == 0 && !natural) { word.insert("cue", "start"); }
                    if (i > 0 && natural) { word.insert("cue", "continue"); }
                }
                started = true;
                previousEnd = word.value("endMs").toDouble();
                cue[i] = word;
            }
            previousSize = cue.size();
        }
    }
    QJsonObject commit(QJsonObject document) {
        writeMarks();
        auto words = before;
        for (const auto& cue : cues) {
            for (const auto& word : cue) { words.append(word); }
        }
        for (const auto& word : after) { words.append(word); }
        auto caption = clip.value("caption").toObject();
        if (caption.value("words").toArray() == words && clip.contains("caption")) { return document; }
        caption.insert("words", words);
        clip.insert("caption", caption);
        auto clips = document.value("clips").toArray();
        clips[clipAt] = clip;
        document.insert("clips", clips);
        return document;
    }
};

QSet<QString> lockedClips(const QJsonObject& document) {
    const auto locked = nt::edit::lockedUserTargetIds(nt::edit::structure::editDocument(document));
    QSet<QString> ids;
    for (const auto& id : locked) { ids.insert(id); }
    return ids;
}
// Runs an edit on the cue a payload names, or returns the document when the cue is gone or locked.
QJsonObject editCue(const QJsonObject& document, const QJsonObject& payload, const std::function<bool(ClipCaption&, int)>& edit) {
    const auto id = payload.value("clipId").toString();
    const auto clips = document.value("clips").toArray();
    for (qsizetype at = 0; at < clips.size(); ++at) {
        const auto clip = clips.at(at).toObject();
        if (clip.value("id").toString() != id) { continue; }
        if (lockedClips(document).contains(id)) { return document; }
        auto caption = ClipCaption::of(clip, at);
        const int row = caption.rowOf(payload.value("firstWord").toInt(-1), payload.value("wordCount").toInt(-1));
        if (row < 0 || !edit(caption, row)) { return document; }
        return caption.commit(document);
    }
    return document;
}
// New words for a text, sharing the span by length.
QJsonArray timedWords(const QStringList& parts, double startMs, double endMs) {
    double total = 0;
    for (const auto& part : parts) { total += part.size() + 1; }
    QJsonArray words;
    double used = 0;
    for (qsizetype i = 0; i < parts.size(); ++i) {
        const double from = startMs + (endMs - startMs) * used / total;
        used += parts.at(i).size() + 1;
        const double to = i + 1 == parts.size() ? endMs : startMs + (endMs - startMs) * used / total;
        words.append(QJsonObject{{"word", parts.at(i)}, {"startMs", from}, {"endMs", to}});
    }
    return words;
}
QJsonArray joined(const QJsonArray& a, const QJsonArray& b) {
    auto out = a;
    for (const auto& value : b) { out.append(value); }
    return out;
}
}  // namespace

QString normalizedWord(const QString& text) {
    const auto keep = [](QChar c) { return c.isLetterOrNumber() || c.isMark() || c.isSurrogate(); };
    qsizetype from = 0;
    qsizetype to = text.size();
    while (from < to && !keep(text.at(from))) { ++from; }
    while (to > from && !keep(text.at(to - 1))) { --to; }
    return text.sliced(from, to - from).toLower();
}

std::vector<Word> sequenceWords(const QJsonObject& document) {
    const auto ranks = trackRanks(document);
    struct Candidate { Word word; int rank; };
    std::vector<Candidate> candidates;
    for (const auto& value : document.value("clips").toArray()) {
        const auto clip = value.toObject();
        if (!clip.contains("caption") || !readableTiming(clip)) { continue; }
        const double start = clip.value("startMs").toDouble();
        const double end = start + clip.value("durationMs").toDouble();
        const auto id = clip.value("id").toString();
        const auto speaker = clip.value("speaker").toString();
        const auto paragraph = clip.value("paragraphId").toString(id);
        const int rank = ranks.value(clip.value("trackId").toString(), static_cast<int>(ranks.size()));
        const auto words = captionWords(clip);
        for (qsizetype i = 0; i < words.size(); ++i) {
            const auto word = words.at(i).toObject();
            const auto text = word.value("word").toString().trimmed();
            if (text.isEmpty() || word.value("kind").toString() == "pause") { continue; }
            const double a = start + word.value("startMs").toDouble();
            const double b = std::max(a, start + word.value("endMs").toDouble());
            const double middle = (a + b) / 2;
            if (middle < start || middle >= end) { continue; }
            candidates.push_back({{text, std::max(a, start), std::min(b, end), id, static_cast<int>(i), speaker, paragraph}, rank});
        }
    }
    std::stable_sort(candidates.begin(), candidates.end(), [](const Candidate& a, const Candidate& b) {
        return a.word.startMs != b.word.startMs ? a.word.startMs < b.word.startMs : a.rank < b.rank;
    });
    // Kept words overlapping the next candidate are few, so this stays linear on real documents.
    std::vector<Word> kept;
    std::vector<QString> normalized;
    size_t window = 0;
    for (auto& candidate : candidates) {
        while (window < kept.size() && kept[window].endMs < candidate.word.startMs) { ++window; }
        const auto text = normalizedWord(candidate.word.text);
        const double middle = (candidate.word.startMs + candidate.word.endMs) / 2;
        bool repeated = false;
        for (size_t i = window; i < kept.size() && !repeated; ++i) {
            repeated = kept[i].clipId != candidate.word.clipId && normalized[i] == text && middle >= kept[i].startMs && middle <= kept[i].endMs;
        }
        if (!repeated) {
            kept.push_back(std::move(candidate.word));
            normalized.push_back(text);
        }
    }
    return kept;
}

int hiddenWordCount(const QJsonObject& document) {
    int count = 0;
    for (const auto& value : document.value("clips").toArray()) {
        const auto clip = value.toObject();
        if (!readableTiming(clip)) { count += static_cast<int>(captionWords(clip).size()); }
    }
    return count;
}

std::vector<Paragraph> paragraphs(const std::vector<Word>& words, double gapMs, int softWords, int hardWords) {
    std::vector<Paragraph> out;
    int first = 0;
    const int total = static_cast<int>(words.size());
    for (int i = 1; i <= total; ++i) {
        bool end = i == total;
        if (!end) {
            const auto& previous = words[static_cast<size_t>(i - 1)];
            const auto& word = words[static_cast<size_t>(i)];
            const int count = i - first;
            const auto last = previous.text.back();
            end = word.speaker != previous.speaker || word.paragraphKey != previous.paragraphKey
                  || word.startMs - previous.endMs >= gapMs || count >= hardWords
                  || (count >= softWords && (last == u'.' || last == u'!' || last == u'?'));
        }
        if (end) {
            const auto& head = words[static_cast<size_t>(first)];
            out.push_back({first, i - first, head.speaker, head.startMs});
            first = i;
        }
    }
    return out;
}

int paragraphOfWord(const std::vector<Paragraph>& list, int word) {
    const auto it = std::partition_point(list.begin(), list.end(), [word](const Paragraph& p) { return p.first + p.count <= word; });
    return it != list.end() && word >= it->first ? static_cast<int>(it - list.begin()) : -1;
}

int wordAt(const std::vector<Word>& words, double timeMs) {
    const auto it = std::partition_point(words.begin(), words.end(), [timeMs](const Word& w) { return w.startMs <= timeMs; });
    if (it == words.begin()) { return -1; }
    const auto at = it - 1;
    return timeMs < at->endMs ? static_cast<int>(at - words.begin()) : -1;
}

std::vector<WordRange> search(const std::vector<Word>& words, const QString& query) {
    QStringList wanted;
    for (const auto& part : tokens(query)) {
        const auto normal = normalizedWord(part);
        if (!normal.isEmpty()) { wanted << normal; }
    }
    if (wanted.isEmpty()) { return {}; }
    std::vector<QString> normal;
    normal.reserve(words.size());
    for (const auto& word : words) { normal.push_back(normalizedWord(word.text)); }
    std::vector<WordRange> out;
    const auto size = static_cast<qsizetype>(wanted.size());
    for (qsizetype i = 0; i + size <= static_cast<qsizetype>(normal.size()); ++i) {
        bool match = true;
        for (qsizetype k = 0; k < size && match; ++k) {
            const auto& have = normal[static_cast<size_t>(i + k)];
            match = k + 1 == size ? have.startsWith(wanted.at(k)) : have == wanted.at(k);
        }
        if (match) { out.push_back({static_cast<int>(i), static_cast<int>(size)}); }
    }
    return out;
}

std::optional<TimeSpan> wordSpan(const std::vector<Word>& words, int first, int last, double fps) {
    const int low = std::min(first, last);
    const int high = std::max(first, last);
    if (low < 0 || high >= static_cast<int>(words.size())) { return std::nullopt; }
    const double start = words[static_cast<size_t>(low)].startMs;
    const double end = words[static_cast<size_t>(high)].endMs;
    if (fps <= 0) { return TimeSpan{start, std::max(end, start)}; }
    const double from = std::floor(start * fps / 1000 + FRAME_SNAP_TOLERANCE);
    const double to = std::max(from + 1, std::ceil(end * fps / 1000 - FRAME_SNAP_TOLERANCE));
    return TimeSpan{from * 1000 / fps, to * 1000 / fps};
}

std::vector<std::vector<int>> captionCues(const QJsonArray& words, double durationMs) {
    std::vector<std::vector<int>> cues;
    std::vector<int> current;
    double previousEnd = 0;
    for (qsizetype i = 0; i < words.size(); ++i) {
        const auto word = words.at(i).toObject();
        const double start = word.value("startMs").toDouble();
        const double end = word.value("endMs").toDouble();
        if (end <= 0 || start >= durationMs) { continue; }
        if (!current.empty()) {
            const auto mark = word.value("cue").toString();
            const bool natural = static_cast<int>(current.size()) >= CUE_MAX_WORDS || start - previousEnd >= CUE_GAP_MS;
            if (mark == "start" || (mark != "continue" && natural)) {
                cues.push_back(std::move(current));
                current.clear();
            }
        }
        current.push_back(static_cast<int>(i));
        previousEnd = end;
    }
    if (!current.empty()) { cues.push_back(std::move(current)); }
    return cues;
}

std::vector<Cue> sequenceCues(const QJsonObject& document) {
    const auto locked = lockedClips(document);
    std::vector<QJsonObject> clips;
    for (const auto& value : document.value("clips").toArray()) {
        const auto clip = value.toObject();
        if (!captionWords(clip).isEmpty()) { clips.push_back(clip); }
    }
    std::stable_sort(clips.begin(), clips.end(), [](const QJsonObject& a, const QJsonObject& b) {
        const double x = a.value("startMs").toDouble();
        const double y = b.value("startMs").toDouble();
        return x != y ? x < y : a.value("id").toString() < b.value("id").toString();
    });
    std::vector<Cue> out;
    for (const auto& clip : clips) {
        const auto id = clip.value("id").toString();
        const double start = clip.value("startMs").toDouble();
        const double duration = clip.value("durationMs").toDouble();
        const auto words = captionWords(clip);
        const auto groups = captionCues(words, duration);
        for (size_t row = 0; row < groups.size(); ++row) {
            const auto& group = groups[row];
            const double from = words.at(group.front()).toObject().value("startMs").toDouble();
            const double to = words.at(group.back()).toObject().value("endMs").toDouble();
            out.push_back({id, group.front(), static_cast<int>(group.size()), cueText(words, group),
                           start + std::max(0.0, from), start + std::min(duration, to), group.size() > 1, row + 1 < groups.size(), locked.contains(id)});
        }
    }
    return out;
}

QJsonObject setCueText(QJsonObject document, const QJsonObject& payload) {
    const auto parts = tokens(payload.value("text").toString());
    if (parts.isEmpty()) { return document; }
    return editCue(document, payload, [&parts](ClipCaption& caption, int row) {
        auto& cue = caption.cues[static_cast<size_t>(row)];
        // A correction keeps every word's timing. Only a change in the word count retimes.
        if (cue.size() == parts.size()) {
            for (qsizetype i = 0; i < cue.size(); ++i) {
                auto word = cue.at(i).toObject();
                word.insert("word", parts.at(i));
                cue[i] = word;
            }
            return true;
        }
        cue = timedWords(parts, cue.first().toObject().value("startMs").toDouble(), cue.last().toObject().value("endMs").toDouble());
        return true;
    });
}

QJsonObject setCueTimes(QJsonObject document, const QJsonObject& payload) {
    const double frameMs = documentFrameMs(document);
    return editCue(document, payload, [&payload, frameMs](ClipCaption& caption, int row) {
        const double clipStart = caption.clip.value("startMs").toDouble();
        const auto index = static_cast<size_t>(row);
        const double lower = row > 0 ? caption.cues[index - 1].last().toObject().value("endMs").toDouble() : 0.0;
        const double upper = index + 1 < caption.cues.size() ? caption.cues[index + 1].first().toObject().value("startMs").toDouble() : caption.duration;
        const double wantedStart = payload.value("startMs").toDouble() - clipStart;
        const double wantedEnd = payload.value("endMs").toDouble() - clipStart;
        if (!std::isfinite(wantedStart) || !std::isfinite(wantedEnd) || wantedEnd <= wantedStart) { return false; }
        const double start = std::max(lower, wantedStart);
        const double end = std::min(upper, wantedEnd);
        if (end - start < frameMs) { return false; }
        auto& cue = caption.cues[index];
        const double oldStart = cue.first().toObject().value("startMs").toDouble();
        const double oldEnd = cue.last().toObject().value("endMs").toDouble();
        const double scale = oldEnd > oldStart ? (end - start) / (oldEnd - oldStart) : 0.0;
        for (qsizetype i = 0; i < cue.size(); ++i) {
            auto word = cue.at(i).toObject();
            word.insert("startMs", start + (word.value("startMs").toDouble() - oldStart) * scale);
            word.insert("endMs", i + 1 == cue.size() ? end : start + (word.value("endMs").toDouble() - oldStart) * scale);
            cue[i] = word;
        }
        return true;
    });
}

QJsonObject splitCue(QJsonObject document, const QJsonObject& payload) {
    const int atWord = payload.value("atWord").toInt(-1);
    return editCue(document, payload, [atWord](ClipCaption& caption, int row) {
        const auto index = static_cast<size_t>(row);
        const int offset = atWord - caption.firstRaw[index];
        const auto cue = caption.cues[index];
        if (offset <= 0 || offset >= cue.size()) { return false; }
        QJsonArray head;
        QJsonArray tail;
        for (qsizetype i = 0; i < cue.size(); ++i) { (i < offset ? head : tail).append(cue.at(i)); }
        caption.cues[index] = head;
        caption.cues.insert(caption.cues.begin() + row + 1, tail);
        return true;
    });
}

QJsonObject mergeCue(QJsonObject document, const QJsonObject& payload) {
    return editCue(document, payload, [](ClipCaption& caption, int row) {
        const auto index = static_cast<size_t>(row);
        if (index + 1 >= caption.cues.size()) { return false; }
        caption.cues[index] = joined(caption.cues[index], caption.cues[index + 1]);
        caption.cues.erase(caption.cues.begin() + row + 1);
        return true;
    });
}

QJsonObject deleteCue(QJsonObject document, const QJsonObject& payload) {
    return editCue(document, payload, [](ClipCaption& caption, int row) {
        caption.cues.erase(caption.cues.begin() + row);
        return true;
    });
}

QJsonObject addCue(QJsonObject document, const QJsonObject& payload) {
    const auto parts = tokens(payload.value("text").toString());
    const double atMs = payload.value("atMs").toDouble(-1);
    if (parts.isEmpty() || !std::isfinite(atMs) || atMs < 0) { return document; }
    const auto clips = document.value("clips").toArray();
    const auto ranks = trackRanks(document);
    const auto locked = lockedClips(document);
    // A clip with a caption first, then the first track in reading order.
    qsizetype target = -1;
    std::pair<bool, int> best{true, 0};
    for (qsizetype at = 0; at < clips.size(); ++at) {
        const auto clip = clips.at(at).toObject();
        const auto type = clip.value("mediaType").toString();
        const double start = clip.value("startMs").toDouble();
        if ((type != "audio" && type != "video") || atMs < start || atMs >= start + clip.value("durationMs").toDouble()
            || !readableTiming(clip) || locked.contains(clip.value("id").toString())) { continue; }
        const std::pair<bool, int> key{!clip.contains("caption"), ranks.value(clip.value("trackId").toString(), static_cast<int>(ranks.size()))};
        if (target < 0 || key < best) {
            target = at;
            best = key;
        }
    }
    if (target < 0) { return document; }
    const auto clip = clips.at(target).toObject();
    auto caption = ClipCaption::of(clip, target);
    const double local = atMs - clip.value("startMs").toDouble();
    double limit = caption.duration;
    int row = 0;
    std::optional<std::pair<int, qsizetype>> partAt;
    for (int c = 0; c < static_cast<int>(caption.cues.size()); ++c) {
        const auto& cue = caption.cues[static_cast<size_t>(c)];
        for (qsizetype i = 0; i < cue.size(); ++i) {
            const auto word = cue.at(i).toObject();
            const double start = word.value("startMs").toDouble();
            const double end = word.value("endMs").toDouble();
            if (local >= start && local < end) { return document; }
            if (end <= local) {
                row = c + 1;
                if (i + 1 < cue.size()) { partAt = {c, i + 1}; } else { partAt.reset(); }
            } else if (start >= local) {
                limit = std::min(limit, start);
            }
        }
    }
    const double end = std::min(limit, local + payload.value("durationMs").toDouble(DEFAULT_ADDED_CUE_MS));
    if (end - local < documentFrameMs(document)) { return document; }
    if (partAt) {
        const auto [cueRow, offset] = *partAt;
        const auto cue = caption.cues[static_cast<size_t>(cueRow)];
        QJsonArray head;
        QJsonArray tail;
        for (qsizetype i = 0; i < cue.size(); ++i) { (i < offset ? head : tail).append(cue.at(i)); }
        caption.cues[static_cast<size_t>(cueRow)] = head;
        caption.cues.insert(caption.cues.begin() + cueRow + 1, tail);
        row = cueRow + 1;
    }
    caption.cues.insert(caption.cues.begin() + row, timedWords(parts, local, end));
    return caption.commit(document);
}

}  // namespace nt::transcript
