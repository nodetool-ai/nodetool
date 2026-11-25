#include "midi/PatternOps.h"

#include "midi/PatternExpand.h"

#include <QCoreApplication>
#include <QThread>
#include <QSaveFile>
#include <QFileInfo>
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QHash>
#include <QJsonDocument>
#include <QRegularExpression>
#include <QSet>
#include <QUuid>

#include <limits>

#include <algorithm>
#include <array>
#include <cmath>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace nt::midi {
namespace {

// Every op of timeline-tool-contracts.ts (SQ49-SQ55) in contract order, then
// Learn and step recording (SQ38, SQ40).
constexpr std::array<const char*, 34> kPatternOps{{
    "get_pattern",
    "create_pattern_region",
    "convert_pattern_to_midi",
    "convert_midi_to_pattern",
    "separate_pattern_rows",
    "set_pattern",
    "set_pattern_seed",
    "add_pattern_rows",
    "set_pattern_row",
    "remove_pattern_rows",
    "move_pattern_row",
    "sort_pattern_rows",
    "set_pattern_row_sort",
    "copy_pattern_row",
    "set_steps",
    "set_pattern_text",
    "clear_pattern",
    "copy_steps",
    "repeat_step",
    "rotate_pattern",
    "transpose_pattern",
    "randomize_pattern",
    "nudge_pattern_values",
    "tie_steps",
    "list_step_patterns",
    "apply_step_pattern",
    "save_step_pattern",
    "set_track_step_template",
    "create_step_pattern_folder",
    "rename_step_pattern_folder",
    "delete_step_pattern_folder",
    "move_step_pattern",
    "learn_pattern_row",
    "step_record",
}};

constexpr QLatin1StringView kPrefix("ui_timeline_");

double jsRound(double x) noexcept {
    if (!std::isfinite(x)) return x;
    const double f = std::floor(x);
    const double r = (x - f >= 0.5) ? (f + 1.0) : f;
    return r == 0.0 ? 0.0 : r;
}

std::int64_t tickInt64(double value) noexcept {
    if (!std::isfinite(value)) return 0;
    return static_cast<std::int64_t>(std::clamp(jsRound(value), -9007199254740991.0, 9007199254740991.0));
}

int clampInt(double v, int lo, int hi) noexcept {
    if (!std::isfinite(v)) return lo;
    const double r = jsRound(v);
    if (r <= static_cast<double>(lo)) return lo;
    if (r >= static_cast<double>(hi)) return hi;
    return static_cast<int>(r);
}

bool isShortResourceId(const QString& s) {
    if (s.size() != 12) return false;
    for (QChar c : s) {
        if (!((c >= u'0' && c <= u'9') || (c >= u'a' && c <= u'f'))) return false;
    }
    return true;
}

std::uint32_t seedForClipId(const QString& clipId) {
    const auto utf8 = clipId.toUtf8();
    const std::uint32_t h = rowKeyHash(std::string_view(utf8.constData(), static_cast<std::size_t>(utf8.size())));
    return h == 0u ? 1u : h;
}

QString mintRowId(const QJsonObject& pattern) {
    QSet<QString> used;
    for (const auto& rv : pattern.value(u"rows").toArray()) used.insert(rv.toObject().value(u"id").toString());
    int k = 1;
    while (used.contains(QStringLiteral("r%1").arg(k))) ++k;
    return QStringLiteral("r%1").arg(k);
}

QString patternSummary(const QJsonObject& pattern) {
    return QStringLiteral("%1 rows x %2 @%3")
        .arg(pattern.value(u"rows").toArray().size())
        .arg(pattern.value(u"lengthSteps").toInt(16))
        .arg(pattern.value(u"stepRate").toString(QStringLiteral("1/16")));
}

double resolveBpm(const QJsonObject& doc) noexcept {
    const double bpm = doc.value(u"tempo").toObject().value(u"bpm").toDouble(120.0);
    return (std::isfinite(bpm) && bpm > 0.0) ? bpm : 120.0;
}

double resolveOffsetMs(const QJsonObject& doc) noexcept {
    const double off = doc.value(u"tempo").toObject().value(u"offsetMs").toDouble(0.0);
    return std::isfinite(off) ? off : 0.0;
}

double barDurationMs(const QJsonObject& doc) noexcept {
    const auto tempo = doc.value(u"tempo").toObject();
    const double bpm = resolveBpm(doc);
    const auto ts = tempo.value(u"timeSignature").toObject();
    const double beatsPerBar = ts.value(u"beatsPerBar").toDouble(4.0);
    const double beatUnit = ts.value(u"beatUnit").toDouble(4.0);
    const double quarterMs = 60000.0 / bpm;
    return quarterMs * (beatsPerBar * (4.0 / (beatUnit > 0.0 ? beatUnit : 4.0)));
}

double msToTicks(double ms, double bpm) noexcept {
    return (ms / (60000.0 / bpm)) * static_cast<double>(kMidiPpq);
}

std::optional<double> activeLoopMs(const QJsonObject& clip) noexcept {
    if (!clip.value(u"loopLengthMs").isDouble()) return std::nullopt;
    const double len = clip.value(u"loopLengthMs").toDouble();
    const double dur = clip.value(u"durationMs").toDouble(0.0);
    if (!std::isfinite(len) || len <= 0.0 || len >= dur) return std::nullopt;
    return len;
}

StepPatternOpOutcome fail(const QString& error) {
    return StepPatternOpOutcome{false, false, {}, {}, error};
}

QJsonArray uniqueBakedEventIds(const QJsonArray& events) {
    QJsonArray result;
    QSet<QString> ids;
    QHash<QString, int> nextSuffix;
    for (const auto& value : events) {
        auto event = value.toObject();
        const auto original = event.value(u"id").toString();
        if (!original.isEmpty()) {
            auto id = original;
            int& occurrence = nextSuffix[original];
            while (ids.contains(id)) id = original + QStringLiteral(":baked:%1").arg(++occurrence);
            ids.insert(id);
            event.insert("id", id);
        }
        result.append(event);
    }
    return result;
}

// ── Document entity resolution ──────────────────────────────────────────────

struct ResolvedTrack {
    int index = -1;
    QJsonObject track;
};

std::optional<ResolvedTrack> resolveMidiTrack(const QJsonArray& tracks, const QString& target, QString* error) {
    for (int i = 0; i < tracks.size(); ++i) {
        const auto t = tracks.at(i).toObject();
        if (t.value(u"id").toString() == target) {
            if (t.value(u"type").toString() != u"midi") {
                *error = QStringLiteral("Track \"%1\" is not a MIDI track.").arg(t.value(u"name").toString());
                return std::nullopt;
            }
            return ResolvedTrack{i, t};
        }
    }
    if (isShortResourceId(target)) {
        std::vector<ResolvedTrack> matches;
        for (int i = 0; i < tracks.size(); ++i) {
            const auto t = tracks.at(i).toObject();
            if (t.value(u"id").toString().startsWith(target)) matches.push_back({i, t});
        }
        if (matches.size() > 1) {
            *error = QStringLiteral("Track prefix \"%1\" matches %2 tracks; pass the full id.").arg(target).arg(matches.size());
            return std::nullopt;
        }
        if (matches.size() == 1) {
            if (matches[0].track.value(u"type").toString() != u"midi") {
                *error = QStringLiteral("Track \"%1\" is not a MIDI track.").arg(matches[0].track.value(u"name").toString());
                return std::nullopt;
            }
            return matches[0];
        }
    }
    const QString lower = target.trimmed().toLower();
    std::vector<ResolvedTrack> byName;
    for (int i = 0; i < tracks.size(); ++i) {
        const auto t = tracks.at(i).toObject();
        if (t.value(u"name").toString().trimmed().toLower() == lower) byName.push_back({i, t});
    }
    if (byName.size() == 1) {
        if (byName[0].track.value(u"type").toString() != u"midi") {
            *error = QStringLiteral("Track \"%1\" is not a MIDI track.").arg(byName[0].track.value(u"name").toString());
            return std::nullopt;
        }
        return byName[0];
    }
    if (byName.size() > 1) {
        *error = QStringLiteral("Track name \"%1\" matches %2 tracks; pass a track id.").arg(target).arg(byName.size());
        return std::nullopt;
    }
    *error = QStringLiteral("No track found matching \"%1\".").arg(target);
    return std::nullopt;
}

struct ResolvedClip {
    int index = -1;
    QJsonObject clip;
};

std::optional<ResolvedClip> resolveMidiClip(const QJsonArray& clips, const QString& target, QString* error) {
    for (int i = 0; i < clips.size(); ++i) {
        const auto c = clips.at(i).toObject();
        if (c.value(u"id").toString() == target) {
            if (c.value(u"mediaType").toString() != u"midi") {
                *error = QStringLiteral("Clip \"%1\" is not a MIDI clip.").arg(c.value(u"name").toString());
                return std::nullopt;
            }
            return ResolvedClip{i, c};
        }
    }
    if (isShortResourceId(target)) {
        std::vector<ResolvedClip> matches;
        for (int i = 0; i < clips.size(); ++i) {
            const auto c = clips.at(i).toObject();
            if (c.value(u"id").toString().startsWith(target)) matches.push_back({i, c});
        }
        if (matches.size() > 1) {
            *error = QStringLiteral("Clip prefix \"%1\" matches %2 clips; pass the full id.").arg(target).arg(matches.size());
            return std::nullopt;
        }
        if (matches.size() == 1) {
            if (matches[0].clip.value(u"mediaType").toString() != u"midi") {
                *error = QStringLiteral("Clip \"%1\" is not a MIDI clip.").arg(matches[0].clip.value(u"name").toString());
                return std::nullopt;
            }
            return matches[0];
        }
    }
    *error = QStringLiteral("No clip found matching \"%1\".").arg(target);
    return std::nullopt;
}

QJsonObject findTrackById(const QJsonArray& tracks, const QString& trackId) {
    for (const auto& tv : tracks) {
        const auto t = tv.toObject();
        if (t.value(u"id").toString() == trackId) return t;
    }
    return {};
}

bool checkWritable(const QJsonArray& tracks, const QJsonObject& clip, QString* error) {
    if (clip.value(u"locked").toBool(false)) {
        *error = QStringLiteral("Clip \"%1\" is locked.").arg(clip.value(u"name").toString());
        return false;
    }
    const auto track = findTrackById(tracks, clip.value(u"trackId").toString());
    if (track.value(u"locked").toBool(false)) {
        *error = QStringLiteral("Track \"%1\" is locked.").arg(track.value(u"name").toString());
        return false;
    }
    return true;
}

QString formatValidRows(const QJsonObject& pattern, const QJsonObject& instrument) {
    const auto rows = pattern.value(u"rows").toArray();
    if (rows.isEmpty()) return QStringLiteral("This pattern has no rows yet.");
    QStringList names;
    const qsizetype cap = std::min<qsizetype>(rows.size(), 16);
    for (qsizetype i = 0; i < cap; ++i) {
        const auto r = rows.at(i).toObject();
        names.append(QStringLiteral("%1 (\"%2\")").arg(r.value(u"id").toString(), rowLabel(r, instrument)));
    }
    const QString more = rows.size() > 16 ? QStringLiteral(", and %1 more").arg(rows.size() - 16) : QString{};
    return QStringLiteral("Valid rows: %1%2.").arg(names.join(QStringLiteral(", ")), more);
}

struct ResolvedRow {
    int index = -1;
    QJsonObject row;
};

std::optional<ResolvedRow> resolveRow(const QJsonObject& pattern, const QString& target, const QJsonObject& instrument,
                                      QString* error) {
    const auto rows = pattern.value(u"rows").toArray();
    for (int i = 0; i < rows.size(); ++i) {
        const auto r = rows.at(i).toObject();
        if (r.value(u"id").toString() == target) return ResolvedRow{i, r};
    }
    if (isShortResourceId(target)) {
        std::vector<ResolvedRow> matches;
        for (int i = 0; i < rows.size(); ++i) {
            const auto r = rows.at(i).toObject();
            if (r.value(u"id").toString().startsWith(target)) matches.push_back({i, r});
        }
        if (matches.size() > 1) {
            *error = QStringLiteral("Row prefix \"%1\" matches %2 rows; use a full row id.").arg(target).arg(matches.size());
            return std::nullopt;
        }
        if (matches.size() == 1) return matches[0];
    }
    const QString lower = target.trimmed().toLower();
    std::vector<ResolvedRow> matches;
    for (int i = 0; i < rows.size(); ++i) {
        const auto r = rows.at(i).toObject();
        const QString lbl = rowLabel(r, instrument).toLower();
        const QString exp = r.value(u"name").toString().trimmed().toLower();
        if (lbl == lower || (!exp.isEmpty() && exp == lower)) matches.push_back({i, r});
    }
    if (matches.size() == 1) return matches[0];
    if (matches.size() > 1) {
        *error = QStringLiteral("Row name \"%1\" matches %2 rows; address one by rowId.").arg(target).arg(matches.size());
        return std::nullopt;
    }
    *error = QStringLiteral("No row found matching \"%1\". %2").arg(target, formatValidRows(pattern, instrument));
    return std::nullopt;
}

// ── Serialization helpers (matching TS ops/stepPattern.ts) ──────────────────

QJsonValue modeValueAtStep(const QJsonObject& row, int stepIndex, const QString& mode, const QJsonObject& instrument) {
    const auto raw = row.value(u"steps").toArray().at(stepIndex).toObject();
    const auto n = normalizeStep(raw);
    if (mode == u"onOff") return n.value(u"on").toBool();
    if (mode == u"velocity") return raw.contains(u"velocity") ? n.value(u"velocity").toInt() : (n.value(u"on").toBool() ? 100 : 0);
    if (mode == u"value") return raw.contains(u"value") ? n.value(u"value") : QJsonValue(n.value(u"on").toBool() ? 64 : 0);
    if (mode == u"gate") return n.value(u"gate").toInt();
    if (mode == u"tie") return n.value(u"tie").toBool();
    if (mode == u"note") return n.value(u"note").toInt();
    if (mode == u"octave") {
        if (n.contains(u"octave")) return n.value(u"octave").toInt();
        const auto a = row.value(u"assignment").toObject();
        const auto t = a.value(u"type").toString();
        if (t == u"degree") return a.value(u"octave").toInt(3);
        if (t == u"kit") return static_cast<int>(std::floor(kitPadPitch(a.value(u"pad").toInt(0), instrument) / 12.0)) - 2;
        if (t == u"note" || t == u"melodic") {
            return static_cast<int>(std::floor(a.value(u"pitch").toInt(60) / 12.0)) - 2;
        }
        return 3;
    }
    if (mode == u"repeat") return n.value(u"repeat").toInt();
    if (mode == u"chance") return n.value(u"chance").toInt();
    if (mode == u"offset") return n.value(u"offset").toInt();
    if (mode == u"stepRate") return n.contains(u"stepRate") ? n.value(u"stepRate") : row.value(u"stepRate");
    if (mode == u"skip") return n.value(u"skip").toBool();
    if (mode == u"loop") {
        return stepIndex >= row.value(u"loopStart").toInt(0) &&
               stepIndex < row.value(u"loopEnd").toInt(row.value(u"lengthSteps").toInt(16));
    }
    return QJsonValue{};
}

QJsonObject serializePatternRow(const QJsonObject& row, const QJsonObject& instrument, const QJsonArray& modes = {}) {
    QJsonObject out{
        {QStringLiteral("id"), row.value(u"id")},
        {QStringLiteral("name"), rowLabel(row, instrument)},
        {QStringLiteral("assignment"), row.value(u"assignment")},
        {QStringLiteral("stepRate"), row.value(u"stepRate")},
        {QStringLiteral("lengthSteps"), row.value(u"lengthSteps")},
        {QStringLiteral("playback"), row.value(u"playback")},
        {QStringLiteral("mute"), row.value(u"mute").toBool(false)},
        {QStringLiteral("solo"), row.value(u"solo").toBool(false)},
        // 1-based inclusive loop bounds for agent output (D97).
        {QStringLiteral("loopStart"), row.value(u"loopStart").toInt(0) + 1},
        {QStringLiteral("loopEnd"), row.value(u"loopEnd").toInt(row.value(u"lengthSteps").toInt(16))},
        {QStringLiteral("midiChannel"), row.value(u"midiChannel").toInt(1)},
        {QStringLiteral("automationMode"), row.value(u"automationMode").toString(QStringLiteral("latch"))},
        {QStringLiteral("subrows"), row.value(u"subrows").toArray()},
    };
    if (row.contains(u"color")) out.insert(QStringLiteral("color"), row.value(u"color"));
    if (row.contains(u"subrowsExpanded")) out.insert(QStringLiteral("subrowsExpanded"), row.value(u"subrowsExpanded"));
    if (!modes.isEmpty()) {
        QJsonObject values;
        const int len = row.value(u"lengthSteps").toInt(row.value(u"steps").toArray().size());
        for (const auto& mv : modes) {
            const auto mode = mv.toString();
            QJsonArray arr;
            for (int i = 0; i < len; ++i) arr.append(modeValueAtStep(row, i, mode, instrument));
            values.insert(mode, arr);
        }
        out.insert(QStringLiteral("values"), values);
    }
    return out;
}

QJsonObject serializePatternSettings(const QJsonObject& pattern) {
    QJsonObject out{
        {QStringLiteral("name"), pattern.value(u"name")},
        {QStringLiteral("lengthSteps"), pattern.value(u"lengthSteps")},
        {QStringLiteral("stepRate"), pattern.value(u"stepRate")},
        {QStringLiteral("playback"), pattern.value(u"playback")},
        {QStringLiteral("swing"), pattern.value(u"swing")},
        {QStringLiteral("swingDivision"), pattern.value(u"swingDivision")},
        {QStringLiteral("legato"), pattern.value(u"legato")},
        {QStringLiteral("mono"), pattern.value(u"mono")},
        {QStringLiteral("midiChannel"), pattern.value(u"midiChannel")},
        {QStringLiteral("pitchSource"), pattern.value(u"pitchSource")},
        {QStringLiteral("scale"), pattern.value(u"scale")},
        {QStringLiteral("noTranspose"), pattern.value(u"noTranspose")},
        {QStringLiteral("scaleQuantize"), pattern.value(u"scaleQuantize")},
        {QStringLiteral("automationMode"), pattern.value(u"automationMode")},
        {QStringLiteral("seed"), pattern.value(u"seed")},
    };
    if (pattern.value(u"key").isObject()) out.insert(QStringLiteral("key"), pattern.value(u"key").toObject());
    if (pattern.contains(u"rowSort")) out.insert(QStringLiteral("rowSort"), pattern.value(u"rowSort"));
    return out;
}

QJsonObject clipOut(const QJsonObject& clip) {
    QJsonObject out{
        {QStringLiteral("id"), clip.value(u"id")},
        {QStringLiteral("trackId"), clip.value(u"trackId")},
        {QStringLiteral("name"), clip.value(u"name")},
        {QStringLiteral("startMs"), clip.value(u"startMs")},
        {QStringLiteral("durationMs"), clip.value(u"durationMs")},
        {QStringLiteral("mediaType"), clip.value(u"mediaType")},
    };
    if (clip.value(u"pattern").isObject()) {
        out.insert(QStringLiteral("patternSummary"), patternSummary(clip.value(u"pattern").toObject()));
    } else if (clip.value(u"notes").isArray()) {
        out.insert(QStringLiteral("noteCount"), clip.value(u"notes").toArray().size());
    }
    return out;
}

QString resolveDeviceId(const QString& deviceId, const QJsonObject& track, QString* error) {
    if (deviceId.isEmpty() || deviceId == u"instrument") return QStringLiteral("instrument");
    const auto effects = track.value(u"effects").toArray();
    for (const auto& ev : effects) {
        const auto id = ev.toObject().value(u"id").toString();
        if (id == deviceId) return id;
    }
    if (isShortResourceId(deviceId)) {
        QStringList matches;
        for (const auto& ev : effects) {
            const auto id = ev.toObject().value(u"id").toString();
            if (id.startsWith(deviceId)) matches.append(id);
        }
        if (matches.size() > 1) {
            *error = QStringLiteral("Device prefix \"%1\" matches %2 effects on track \"%3\"; use a full effect id.")
                         .arg(deviceId)
                         .arg(matches.size())
                         .arg(track.value(u"name").toString());
            return {};
        }
        if (matches.size() == 1) return matches.first();
    }
    return deviceId;
}

bool assertAssignmentAllowed(const QJsonObject& assignment, const QJsonObject& pattern, const QJsonObject& instrument,
                             QString* error) {
    const auto type = assignment.value(u"type").toString();
    if (type == u"degree" && pattern.value(u"pitchSource").toString() != u"chords") {
        *error = QStringLiteral(
            "Degree rows require pattern pitchSource \"chords\" (call set_pattern with pitchSource: \"chords\" first).");
        return false;
    }
    const auto instType = instrument.value(u"type").toString();
    if (type == u"kit" && instType != u"drum" && instType != u"sampler") {
        *error = QStringLiteral("Kit rows require a DR-1 drum or Sampler track (this track uses %1 instrument).")
                     .arg(instType.isEmpty() ? QStringLiteral("no") : instType);
        return false;
    }
    return true;
}

bool assertUniqueSubrows(const QJsonValue& subrowsVal, QString* error) {
    if (!subrowsVal.isArray()) return true;
    QSet<QString> seen;
    for (const auto& v : subrowsVal.toArray()) {
        const auto mode = v.toString();
        if (seen.contains(mode)) {
            *error = QStringLiteral("Duplicate subrow mode \"%1\". Two subrows on the same row cannot share an edit mode.")
                         .arg(mode);
            return false;
        }
        seen.insert(mode);
    }
    return true;
}

struct LoopBounds {
    int loopStart = 0;
    int loopEnd = 16;
};

std::optional<LoopBounds> validateLoopBounds1Based(const QJsonValue& loopStart1, const QJsonValue& loopEnd1,
                                                   int lengthSteps, int currentStart0, int currentEndExcl,
                                                   QString* error) {
    const int nextStart0 = loopStart1.isDouble() ? (loopStart1.toInt() - 1) : currentStart0;
    const int nextEndExcl = loopEnd1.isDouble() ? loopEnd1.toInt() : currentEndExcl;
    if (nextStart0 < 0 || nextStart0 >= lengthSteps) {
        *error = QStringLiteral("loopStart must be between 1 and %1.").arg(lengthSteps);
        return std::nullopt;
    }
    if (nextEndExcl < 1 || nextEndExcl > lengthSteps) {
        *error = QStringLiteral("loopEnd must be between 1 and %1.").arg(lengthSteps);
        return std::nullopt;
    }
    if (nextStart0 >= nextEndExcl) {
        *error = QStringLiteral("loopStart (%1) must be <= loopEnd (%2).").arg(nextStart0 + 1).arg(nextEndExcl);
        return std::nullopt;
    }
    return LoopBounds{nextStart0, nextEndExcl};
}

QJsonObject applyPatternTextToPattern(const QJsonObject& base, const QString& text, const QString& mode,
                                      const QJsonObject& instrument, QString* error) {
    QString parseErr;
    const auto lines = parsePatternTextLines(text, &parseErr);
    if (!parseErr.isEmpty()) {
        *error = parseErr;
        return {};
    }
    if (lines.empty()) {
        *error = QStringLiteral(
            "Pattern text contained no rows. Format each line as \"<Row> [| rate] : <steps>\", e.g. \"Kick: x... "
            "x... x... x...\".");
        return {};
    }
    if (mode == u"replace") {
        const auto parsed = patternFromText(text,
                                            QJsonObject{{QStringLiteral("name"), base.value(u"name")},
                                                        {QStringLiteral("seed"), base.value(u"seed")},
                                                        {QStringLiteral("stepRate"), base.value(u"stepRate")},
                                                        {QStringLiteral("instrument"), instrument}},
                                            &parseErr);
        if (!parseErr.isEmpty()) {
            *error = parseErr;
            return {};
        }
        auto next = base;
        next.insert(QStringLiteral("lengthSteps"), parsed.value(u"lengthSteps"));
        next.insert(QStringLiteral("rows"), parsed.value(u"rows"));
        return normalizePattern(next);
    }

    QJsonObject pattern = base;
    int maxLineLen = 1;
    for (const auto& l : lines) maxLineLen = std::max(maxLineLen, static_cast<int>(l.steps.size()));
    if (maxLineLen > pattern.value(u"lengthSteps").toInt(16)) {
        pattern = resizePatternLength(pattern, std::min(kStepPatternMaxSteps, maxLineLen));
    }

    for (const auto& line : lines) {
        const QString lower = line.name.trimmed().toLower();
        auto rows = pattern.value(u"rows").toArray();
        int existingIdx = -1;
        for (int i = 0; i < rows.size(); ++i) {
            const auto r = rows.at(i).toObject();
            const QString lbl = rowLabel(r, instrument).toLower();
            const QString exp = r.value(u"name").toString().trimmed().toLower();
            if (lbl == lower || (!exp.isEmpty() && exp == lower)) {
                existingIdx = i;
                break;
            }
        }
        if (existingIdx >= 0) {
            const auto existing = rows.at(existingIdx).toObject();
            const int nextLen = static_cast<int>(line.steps.size());
            const int curLen = existing.value(u"lengthSteps").toInt(nextLen);
            const int curLoopEnd = existing.value(u"loopEnd").toInt(curLen);
            auto partial = existing;
            partial.insert(QStringLiteral("lengthSteps"), nextLen);
            partial.insert(QStringLiteral("loopStart"), std::min(existing.value(u"loopStart").toInt(0), nextLen - 1));
            partial.insert(QStringLiteral("loopEnd"), (curLoopEnd == curLen) ? nextLen : std::min(curLoopEnd, nextLen));
            partial.insert(QStringLiteral("stepRate"),
                           line.stepRate.value_or(existing.value(u"stepRate").toString(QStringLiteral("1/16"))));
            partial.insert(QStringLiteral("steps"), line.steps);
            const auto updatedRow = normalizeRow(partial, pattern);
            rows.replace(existingIdx, updatedRow);
            pattern.insert(QStringLiteral("rows"), rows);
            if (pattern.value(u"mono").toBool(false) &&
                updatedRow.value(u"assignment").toObject().value(u"type").toString() != u"automation") {
                std::vector<int> turnedOn;
                const auto st = updatedRow.value(u"steps").toArray();
                for (int i = 0; i < st.size(); ++i) {
                    if (st.at(i).toObject().value(u"on").toBool(false)) turnedOn.push_back(i);
                }
                pattern = applyMonoAtSteps(pattern, updatedRow.value(u"id").toString(), turnedOn);
            }
        } else {
            if (rows.size() >= kStepPatternMaxRows) {
                *error = QStringLiteral("Cannot add row \"%1\": a pattern holds at most %2 rows.")
                             .arg(line.name)
                             .arg(kStepPatternMaxRows);
                return {};
            }
            const auto inferred = assignmentFromRowName(line.name, instrument);
            const QString id = mintRowId(pattern);
            const auto newRow = normalizeRow(
                QJsonObject{{QStringLiteral("id"), id},
                            {QStringLiteral("name"), inferred.customName.value_or(line.name)},
                            {QStringLiteral("assignment"), inferred.assignment},
                            {QStringLiteral("lengthSteps"), static_cast<int>(line.steps.size())},
                            {QStringLiteral("loopStart"), 0},
                            {QStringLiteral("loopEnd"), static_cast<int>(line.steps.size())},
                            {QStringLiteral("stepRate"),
                             line.stepRate.value_or(pattern.value(u"stepRate").toString(QStringLiteral("1/16")))},
                            {QStringLiteral("steps"), line.steps}},
                pattern);
            rows.append(newRow);
            pattern.insert(QStringLiteral("rows"), rows);
            pattern = applyPatternRowSort(pattern, instrument);
            if (pattern.value(u"mono").toBool(false) &&
                newRow.value(u"assignment").toObject().value(u"type").toString() != u"automation") {
                std::vector<int> turnedOn;
                const auto st = newRow.value(u"steps").toArray();
                for (int i = 0; i < st.size(); ++i) {
                    if (st.at(i).toObject().value(u"on").toBool(false)) turnedOn.push_back(i);
                }
                pattern = applyMonoAtSteps(pattern, id, turnedOn);
            }
        }
    }
    return pattern;
}

// ── User step pattern library (SQ44): JSON files under the root ─────────────
// <root>/<Patterns|Templates>/<folder>/<slug>.json, each {id, name, kind,
// category, tags, pattern}. UI thread only.

bool onLibraryThread() {
    const auto* app = QCoreApplication::instance();
    return app && QThread::currentThread() == app->thread();
}

QString userLibraryRoot() {
    return onLibraryThread() ? QCoreApplication::instance()->property("ntStepPatternLibraryRoot").toString() : QString();
}

bool containedPath(const QString& path) {
    const auto root = QFileInfo(userLibraryRoot()).canonicalFilePath();
    if (root.isEmpty()) return false;
    auto current = QFileInfo(path).absoluteFilePath();
    while (!QFileInfo::exists(current)) {
        if (QFileInfo(current).isSymLink()) return false;
        const auto parent = QFileInfo(current).absolutePath();
        if (parent == current) return false;
        current = parent;
    }
    const auto canonical = QFileInfo(current).canonicalFilePath();
    if (canonical != root && !canonical.startsWith(root + u'/')) return false;
    const auto lexicalRoot = QFileInfo(userLibraryRoot()).absoluteFilePath();
    current = QFileInfo(path).absoluteFilePath();
    while (current != lexicalRoot) {
        if (QFileInfo(current).isSymLink()) return false;
        const auto parent = QFileInfo(current).absolutePath();
        if (parent == current) return false;
        current = parent;
    }
    return true;
}

bool sameFile(const QString& a, const QString& b) { // NOLINT(bugprone-easily-swappable-parameters): file identity comparison is symmetric.
    const auto ca = QFileInfo(a).canonicalFilePath();
    return !ca.isEmpty() && ca == QFileInfo(b).canonicalFilePath();
}

QString kindDirName(const QString& kind) { return kind == u"template" ? QStringLiteral("Templates") : QStringLiteral("Patterns"); }

// The folder as "a/b" relative to its kind root, or nullopt for a path that leaves it.
std::optional<QString> cleanFolder(const QString& folder) {
    if (folder.startsWith(u'/') || folder.startsWith(u'\\')) return std::nullopt;
    for (const auto c : folder) {
        if (c == u':' || c.unicode() < 32 || c.unicode() == 127) return std::nullopt;
    }
    QStringList parts;
    for (const auto& part : QString(folder).replace(u'\\', u'/').split(u'/')) {
        const auto p = part.trimmed();
        if (p.isEmpty()) continue;
        if (p.startsWith(u'.')) return std::nullopt;
        parts.append(p);
    }
    return parts.join(u'/');
}

QString kindRootDir(const QString& kind) { return QDir(userLibraryRoot()).filePath(kindDirName(kind)); }

struct UserPatternFile {
    QJsonObject entry;
    QString path;
    QString folder;
};

std::vector<UserPatternFile> userPatternFiles() {
    std::vector<UserPatternFile> out;
    if (userLibraryRoot().isEmpty()) return out;
    for (const QString& kind : {QStringLiteral("pattern"), QStringLiteral("template")}) {
        const QDir base(kindRootDir(kind));
        QDirIterator it(base.path(), {QStringLiteral("*.json")}, QDir::Files, QDirIterator::Subdirectories);
        while (it.hasNext()) {
            const auto path = it.next();
            if (!containedPath(path)) continue;
            QFile file(path);
            if (!file.open(QIODevice::ReadOnly)) continue;
            const auto entry = QJsonDocument::fromJson(file.readAll()).object();
            if (!entry.value(u"pattern").isObject() || entry.value(u"id").toString().isEmpty()) continue;
            const auto rel = base.relativeFilePath(QFileInfo(path).path());
            out.push_back({entry, path, rel == u"." ? QString() : rel});
        }
    }
    std::ranges::sort(out, [](const UserPatternFile& a, const UserPatternFile& b) { return a.path < b.path; });
    return out;
}

QStringList userPatternFolders(const QString& kind) {
    QStringList out;
    if (userLibraryRoot().isEmpty()) return out;
    const QDir base(kindRootDir(kind));
    QDirIterator it(base.path(), QDir::Dirs | QDir::NoDotAndDotDot, QDirIterator::Subdirectories);
    while (it.hasNext()) {
        const auto path = it.next();
        if (containedPath(path)) out.append(base.relativeFilePath(path));
    }
    out.sort();
    return out;
}

std::optional<UserPatternFile> findUserPattern(const QString& ref) {
    const auto needle = ref.trimmed().toLower();
    if (needle.isEmpty()) return std::nullopt;
    for (const auto& f : userPatternFiles()) {
        if (f.entry.value(u"id").toString().toLower() == needle || f.entry.value(u"name").toString().toLower() == needle) return f;
    }
    return std::nullopt;
}

bool writeJsonFile(const QString& path, const QJsonObject& json) {
    if (!QDir().mkpath(QFileInfo(path).path())) return false;
    QSaveFile file(path);
    const auto payload = QJsonDocument(json).toJson(QJsonDocument::Indented);
    return file.open(QIODevice::WriteOnly) && file.write(payload) == payload.size() && file.commit();
}

std::optional<QJsonObject> findFactoryEntry(const QString& ref) {
    const QString needle = ref.trimmed().toLower();
    if (needle.isEmpty()) return std::nullopt;
    const auto lib = factoryStepPatternLibrary();
    for (const auto& ev : lib) {
        const auto e = ev.toObject();
        if (e.value(u"id").toString().toLower() == needle || e.value(u"name").toString().toLower() == needle) {
            return e;
        }
    }
    if (const auto user = findUserPattern(ref)) return user->entry;
    return std::nullopt;
}

double trackEndMs(const QJsonArray& clips, const QString& trackId) noexcept {
    double end = 0.0;
    for (const auto& cv : clips) {
        const auto c = cv.toObject();
        if (c.value(u"trackId").toString() != trackId) continue;
        end = std::max(end, c.value(u"startMs").toDouble(0.0) + c.value(u"durationMs").toDouble(0.0));
    }
    return end;
}

// ── Argument contracts (timeline-tool-params.ts, strictParams) ──────────────
// Every op rejects unknown keys and wrong types before it touches the document,
// like the TS zod schemas. `timeline_id` is the assistant's routing key.

enum class ArgKind { Str, NonEmpty, Int, Num, Bool, StrList, StrListMin1, Obj, ObjListMin1, Enum, EnumList, Steps, IntListMin1 };

struct ArgSpec {
    QString key;
    ArgKind kind = ArgKind::Str;
    bool required = false;
    double min = -std::numeric_limits<double>::infinity();
    double max = std::numeric_limits<double>::infinity();
    QStringList values;
    bool nullable = false;
    QString description;
};

struct OpSpec {
    QString description;
    std::vector<ArgSpec> args;
};

const QStringList& editModeNames() {
    static const QStringList modes{"onOff", "velocity", "value", "gate", "tie", "note", "octave", "repeat", "chance", "offset", "stepRate", "skip", "loop"};
    return modes;
}

ArgSpec arg(const char* key, ArgKind kind, bool required = false, QString description = {}) {
    return ArgSpec{QString::fromLatin1(key), kind, required, -std::numeric_limits<double>::infinity(),
                   std::numeric_limits<double>::infinity(), {}, false, std::move(description)};
}
ArgSpec intArg(const char* key, double min, double max, bool required = false, QString description = {}) {
    auto a = arg(key, ArgKind::Int, required, std::move(description));
    a.min = min;
    a.max = max;
    return a;
}
ArgSpec numArg(const char* key, double min, double max, bool required = false, QString description = {}) {
    auto a = arg(key, ArgKind::Num, required, std::move(description));
    a.min = min;
    a.max = max;
    return a;
}
ArgSpec enumArg(const char* key, QStringList values, bool required = false, QString description = {}) {
    auto a = arg(key, ArgKind::Enum, required, std::move(description));
    a.values = std::move(values);
    return a;
}
ArgSpec clipArg(const char* key = "clipId") { return arg(key, ArgKind::NonEmpty, true, QStringLiteral("Pattern region clip id or name.")); }
ArgSpec rowArg(bool required = true) { return arg("row", ArgKind::NonEmpty, required, QStringLiteral("Row id or unique case-insensitive row name.")); }
ArgSpec stepsArg(bool required) {
    return arg("steps", ArgKind::Steps, required, QStringLiteral("1-based steps: \"1-4,9\" or an integer array."));
}
ArgSpec modeArg(bool required) { return enumArg("mode", editModeNames(), required, QStringLiteral("Step edit mode.")); }

const QHash<QString, OpSpec>& opSpecs() {
    static const QHash<QString, OpSpec> specs = [] {
        constexpr double kMaxSteps = 64;
        constexpr double kMaxSeed = 4294967295.0;
        const QStringList playback{"forward", "backward", "pingPong", "shuffle", "pendulum", "wander", "random"};
        const QStringList automation{"latch", "slide"};
        const QStringList kinds{"pattern", "template"};
        const QStringList rowSorts{"none", "typeAsc", "typeDesc", "typeAndNoteAsc", "typeAndNoteDesc", "typeAndNameAsc",
                                   "typeAndNameDesc", "typeAndKitPadAsc", "typeAndKitPadDesc"};
        const auto barTime = [](std::vector<ArgSpec> args) {
            args.push_back(intArg("atBar", 1, std::numeric_limits<double>::infinity(), false, QStringLiteral("Start bar, counted from 1. Use it or atMs, never both.")));
            args.push_back(numArg("beat", 1, std::numeric_limits<double>::infinity(), false, QStringLiteral("Beat in atBar, counted from 1.")));
            args.push_back(numArg("atMs", 0, std::numeric_limits<double>::infinity(), false, QStringLiteral("Start time in ms.")));
            auto bars = numArg("bars", 0, std::numeric_limits<double>::infinity(), false, QStringLiteral("Length in bars. Default 1."));
            bars.min = std::nextafter(0.0, 1.0);
            args.push_back(bars);
            return args;
        };
        auto key = arg("key", ArgKind::Obj);
        key.nullable = true;
        auto color = arg("color", ArgKind::NonEmpty);
        color.nullable = true;
        auto folderNullable = arg("folder", ArgKind::Str, false, QStringLiteral("Destination folder path or id; empty or null is the section root."));
        folderNullable.nullable = true;
        auto subrows = arg("subrows", ArgKind::EnumList);
        subrows.values = editModeNames();
        auto modes = arg("modes", ArgKind::EnumList, false, QStringLiteral("Edit modes whose per-step values to include."));
        modes.values = editModeNames();
        QHash<QString, OpSpec> s;
        s.insert("get_pattern", {QStringLiteral("Read a step sequencer pattern region: settings, SQ47 ASCII grid text, and rows (with optional per-step edit mode values)."),
                                 {clipArg(), modes}});
        s.insert("create_pattern_region", {QStringLiteral("Create an empty, templated or text-authored step sequencer pattern region on a MIDI track."),
                                           barTime({arg("trackId", ArgKind::NonEmpty, true, QStringLiteral("MIDI track id or name.")),
                                                    arg("name", ArgKind::NonEmpty), arg("template", ArgKind::NonEmpty, false, QStringLiteral("Factory pattern or template id or name, or \"track default\".")),
                                                    arg("text", ArgKind::Str, false, QStringLiteral("SQ47 pattern text."))})});
        s.insert("convert_pattern_to_midi", {QStringLiteral("Bake step sequencer pattern regions into plain MIDI notes, controllers, and track automation."),
                                             {arg("clipIds", ArgKind::StrListMin1, true)}});
        s.insert("convert_midi_to_pattern", {QStringLiteral("Quantize plain MIDI clips into step sequencer pattern regions."),
                                             {arg("clipIds", ArgKind::StrListMin1, true), arg("stepRate", ArgKind::Str)}});
        s.insert("separate_pattern_rows", {QStringLiteral("Split a pattern region into one pattern region per row, each on a new MIDI track under the source track."),
                                           {clipArg()}});
        s.insert("set_pattern", {QStringLiteral("Update pattern-level settings (lengthSteps, stepRate, playback, swing, key, scale, legato, mono, midiChannel, pitchSource, automationMode, loopStart, loopEnd)."),
                                 {clipArg(), arg("name", ArgKind::Str), intArg("lengthSteps", 1, kMaxSteps), arg("stepRate", ArgKind::Str),
                                  enumArg("playback", playback), intArg("swing", 0, 100), enumArg("swingDivision", {"1/8", "1/16"}),
                                  arg("legato", ArgKind::Bool), arg("mono", ArgKind::Bool), intArg("midiChannel", 1, 16), key,
                                  enumArg("pitchSource", {"off", "key", "chords"}), arg("scale", ArgKind::Str), arg("scaleQuantize", ArgKind::Bool),
                                  arg("noTranspose", ArgKind::Bool), enumArg("automationMode", automation), intArg("loopStart", 1, kMaxSteps),
                                  intArg("loopEnd", 1, kMaxSteps)}});
        s.insert("set_pattern_seed", {QStringLiteral("Set the pattern's random seed (chance, shuffle, random playback). Absent seed picks a new one and returns it."),
                                      {clipArg(), intArg("seed", 0, kMaxSeed)}});
        s.insert("add_pattern_rows", {QStringLiteral("Add note, melodic, kit, degree, or automation rows to a step pattern (max 128 rows)."),
                                      {clipArg(), arg("rows", ArgKind::ObjListMin1, true)}});
        s.insert("set_pattern_row", {QStringLiteral("Change one row's settings: name, assignment, stepRate, playback, mute, solo, midiChannel, automationMode, color, subrows, subrowsExpanded, lengthSteps, loopStart, loopEnd (1-based)."),
                                     {clipArg(), rowArg(), arg("name", ArgKind::NonEmpty), arg("assignment", ArgKind::Obj), arg("stepRate", ArgKind::Str),
                                      intArg("lengthSteps", 1, kMaxSteps), enumArg("playback", playback), arg("mute", ArgKind::Bool), arg("solo", ArgKind::Bool),
                                      intArg("loopStart", 1, kMaxSteps), intArg("loopEnd", 1, kMaxSteps), intArg("midiChannel", 1, 16),
                                      enumArg("automationMode", automation), color, subrows, arg("subrowsExpanded", ArgKind::Bool)}});
        s.insert("remove_pattern_rows", {QStringLiteral("Remove rows by id or name, or every row with no step on (unused: true)."),
                                         {clipArg(), arg("rows", ArgKind::StrList), arg("unused", ArgKind::Bool)}});
        s.insert("move_pattern_row", {QStringLiteral("Move one row to a 0-based index. Clears the stored row sort."),
                                      {clipArg(), rowArg(), intArg("toIndex", 0, std::numeric_limits<double>::infinity(), true)}});
        s.insert("sort_pattern_rows", {QStringLiteral("Sort rows once: by type, typeAndNote, typeAndName or typeAndKitPad, optionally descending."),
                                       {clipArg(), enumArg("by", {"type", "typeAndNote", "typeAndName", "typeAndKitPad"}, true), arg("descending", ArgKind::Bool)}});
        s.insert("set_pattern_row_sort", {QStringLiteral("Set or clear the persistent row sort mode of a step sequencer pattern (\"none\" or a sort mode); sorts existing rows immediately when not \"none\" and keeps newly added rows in sorted order."),
                                          {clipArg(), enumArg("rowSort", rowSorts, true)}});
        s.insert("copy_pattern_row", {QStringLiteral("Copy a row onto another row or as a new row, in the same or another pattern region. settingsOnly copies row settings without steps."),
                                      {clipArg(), arg("row", ArgKind::NonEmpty, true), arg("toClipId", ArgKind::NonEmpty), arg("toRow", ArgKind::NonEmpty),
                                       arg("asNew", ArgKind::Bool), arg("settingsOnly", ArgKind::Bool), arg("nextAssignment", ArgKind::Bool)}});
        s.insert("set_steps", {QStringLiteral("Set step fields and/or a linear ramp across 1-based step indices on one pattern row."),
                               {clipArg(), rowArg(), stepsArg(true), arg("values", ArgKind::Obj), arg("ramp", ArgKind::Obj)}});
        s.insert("set_pattern_text", {QStringLiteral("Author or update pattern rows from SQ47 ASCII step text (merge or replace)."),
                                      {clipArg(), arg("text", ArgKind::NonEmpty, true), enumArg("mode", {"merge", "replace"})}});
        s.insert("clear_pattern", {QStringLiteral("Clear steps, a row, or the full pattern (optionally only one edit mode)."),
                                   {clipArg(), enumArg("scope", {"steps", "row", "pattern"}, true), rowArg(false), stepsArg(false), modeArg(false),
                                    enumArg("rowType", {"note", "automation"})}});
        s.insert("copy_steps", {QStringLiteral("Copy (or cut) steps from one row to a start step on another row of the same type, in the same or another pattern region."),
                                {clipArg(), arg("row", ArgKind::NonEmpty, true), stepsArg(true), arg("toRow", ArgKind::NonEmpty, true),
                                 intArg("toStep", 1, kMaxSteps, true), arg("toClipId", ArgKind::NonEmpty), arg("cut", ArgKind::Bool)}});
        s.insert("repeat_step", {QStringLiteral("Copy one step into the step after it on the same row."),
                                 {clipArg(), rowArg(), intArg("step", 1, kMaxSteps, true)}});
        s.insert("rotate_pattern", {QStringLiteral("Rotate steps right (by > 0) or left, on one row or all rows. With mode, only that edit mode's values move."),
                                    {clipArg(), intArg("by", -std::numeric_limits<double>::infinity(), std::numeric_limits<double>::infinity(), true), rowArg(false), modeArg(false)}});
        s.insert("transpose_pattern", {QStringLiteral("Transpose note and melodic rows (or selected steps) by semitones."),
                                       {clipArg(), intArg("semitones", -std::numeric_limits<double>::infinity(), std::numeric_limits<double>::infinity(), true),
                                        rowArg(false), stepsArg(false)}});
        s.insert("randomize_pattern", {QStringLiteral("Seeded randomize of one edit mode on rows and steps. density 0..100 applies to onOff. Same seed, same result."),
                                       {clipArg(), modeArg(true), arg("rows", ArgKind::StrList), stepsArg(false), intArg("seed", 0, kMaxSeed), numArg("density", 0, 100)}});
        s.insert("nudge_pattern_values", {QStringLiteral("Increment (delta > 0) or decrement one edit mode's values on a row or all rows. onOff: all on/off. tie: tie all/untie all."),
                                          {clipArg(), modeArg(true), arg("delta", ArgKind::Num, true), rowArg(false)}});
        s.insert("tie_steps", {QStringLiteral("Tie (tie: true) or untie the 1-based steps from..to on one row."),
                               {clipArg(), rowArg(), intArg("from", 1, kMaxSteps, true), intArg("to", 1, kMaxSteps, true), arg("tie", ArgKind::Bool, true)}});
        s.insert("list_step_patterns", {QStringLiteral("List step patterns and templates: entries (id, name, kind, category, tags, source, instrumentPreset) and folders."),
                                        {arg("query", ArgKind::Str), enumArg("kind", kinds), arg("category", ArgKind::Str), arg("folder", ArgKind::Str)}});
        s.insert("apply_step_pattern", {QStringLiteral("Load a factory step pattern or template onto an existing clip or a new clip on a MIDI track."),
                                        barTime({arg("clipId", ArgKind::NonEmpty), arg("trackId", ArgKind::NonEmpty), arg("pattern", ArgKind::NonEmpty, true),
                                                 arg("useProjectKey", ArgKind::Bool)})});
        s.insert("save_step_pattern", {QStringLiteral("Save a pattern region as a reusable pattern or step-free template."),
                                       {clipArg(), arg("name", ArgKind::NonEmpty, true), enumArg("kind", kinds, true), arg("folder", ArgKind::Str)}});
        s.insert("set_track_step_template", {QStringLiteral("Store a pattern region's rows (without steps) as the track's default template, or clear it."),
                                             {arg("trackId", ArgKind::NonEmpty, true), arg("fromClipId", ArgKind::NonEmpty), arg("clear", ArgKind::Bool)}});
        s.insert("create_step_pattern_folder", {QStringLiteral("Create a folder in the step pattern library."),
                                                {arg("name", ArgKind::NonEmpty, true), enumArg("kind", kinds), arg("parentFolder", ArgKind::Str)}});
        s.insert("rename_step_pattern_folder", {QStringLiteral("Rename a folder in the step pattern library."),
                                                {arg("folder", ArgKind::NonEmpty, true), arg("newName", ArgKind::NonEmpty, true), enumArg("kind", kinds)}});
        s.insert("delete_step_pattern_folder", {QStringLiteral("Delete a folder in the step pattern library."),
                                                {arg("folder", ArgKind::NonEmpty, true), enumArg("kind", kinds)}});
        s.insert("move_step_pattern", {QStringLiteral("Move a saved step pattern to another library folder."),
                                       {arg("pattern", ArgKind::NonEmpty, true), folderNullable}});
        auto pitches = arg("pitches", ArgKind::IntListMin1, true, QStringLiteral("MIDI note numbers 0..127 played together."));
        pitches.min = 0;
        pitches.max = 127;
        s.insert("learn_pattern_row", {QStringLiteral("Learn a played note or controller (SQ38). mode add (default): add a row for a note or controller that has none; a known one changes nothing. mode assign: give `row` this sound."),
                                       {clipArg(), enumArg("mode", {"add", "assign"}), intArg("pitch", 0, 127),
                                        arg("controller", ArgKind::Obj, false, QStringLiteral("Automation target: {kind: cc, cc} or {kind: pitchBend} or {kind: channelPressure}.")),
                                        rowArg(false)}});
        s.insert("step_record", {QStringLiteral("Step-record a chord (SQ40): turn on the 1-based step on the row of each pitch, add missing rows, and return nextStep."),
                                 {clipArg(), intArg("step", 1, kMaxSteps, true), pitches, intArg("velocity", 1, 127)}});
        return s;
    }();
    return specs;
}

QString describeKind(const ArgSpec& a) {
    switch (a.kind) {
    case ArgKind::Str: return QStringLiteral("a string");
    case ArgKind::NonEmpty: return QStringLiteral("a nonempty string");
    case ArgKind::Int:
        if (std::isfinite(a.min) && std::isfinite(a.max)) return QStringLiteral("an integer %1..%2").arg(a.min, 0, 'f', 0).arg(a.max, 0, 'f', 0);
        if (std::isfinite(a.min)) return QStringLiteral("an integer >= %1").arg(a.min, 0, 'f', 0);
        return QStringLiteral("an integer");
    case ArgKind::Num:
        if (std::isfinite(a.min) && std::isfinite(a.max)) return QStringLiteral("a number %1..%2").arg(a.min).arg(a.max);
        if (std::isfinite(a.min)) return a.min > 0 && a.min < 1e-300 ? QStringLiteral("a positive number") : QStringLiteral("a number >= %1").arg(a.min);
        return QStringLiteral("a finite number");
    case ArgKind::Bool: return QStringLiteral("true or false");
    case ArgKind::StrList: return QStringLiteral("an array of nonempty strings");
    case ArgKind::StrListMin1: return QStringLiteral("a nonempty array of nonempty strings");
    case ArgKind::Obj: return QStringLiteral("an object");
    case ArgKind::ObjListMin1: return QStringLiteral("a nonempty array of objects");
    case ArgKind::Enum: return QStringLiteral("one of %1").arg(a.values.join(QStringLiteral(", ")));
    case ArgKind::EnumList: return QStringLiteral("an array of %1").arg(a.values.join(QStringLiteral(", ")));
    case ArgKind::Steps: return QStringLiteral("a step string like \"1-4,9\" or a nonempty array of integers 1..64");
    case ArgKind::IntListMin1: return QStringLiteral("a nonempty array of integers %1..%2").arg(a.min).arg(a.max);
    }
    return {};
}

bool isWholeIn(const QJsonValue& v, double min, double max) {
    if (!v.isDouble()) return false;
    const double d = v.toDouble();
    return std::isfinite(d) && std::trunc(d) == d && d >= min && d <= max;
}

bool argMatches(const ArgSpec& a, const QJsonValue& v) {
    if (v.isNull()) return a.nullable;
    switch (a.kind) {
    case ArgKind::Str: return v.isString();
    case ArgKind::NonEmpty: return v.isString() && !v.toString().trimmed().isEmpty();
    case ArgKind::Int: return isWholeIn(v, a.min, a.max);
    case ArgKind::Num: return v.isDouble() && std::isfinite(v.toDouble()) && v.toDouble() >= a.min && v.toDouble() <= a.max;
    case ArgKind::Bool: return v.isBool();
    case ArgKind::StrList:
    case ArgKind::StrListMin1: {
        if (!v.isArray()) return false;
        const auto list = v.toArray();
        if (a.kind == ArgKind::StrListMin1 && list.isEmpty()) return false;
        return std::ranges::all_of(list, [](const QJsonValue& item) { return item.isString() && !item.toString().isEmpty(); });
    }
    case ArgKind::Obj: return v.isObject();
    case ArgKind::ObjListMin1: {
        if (!v.isArray() || v.toArray().isEmpty()) return false;
        const auto list = v.toArray();
        return std::ranges::all_of(list, [](const QJsonValue& item) { return item.isObject(); });
    }
    case ArgKind::Enum: return v.isString() && a.values.contains(v.toString());
    case ArgKind::EnumList: {
        if (!v.isArray()) return false;
        const auto list = v.toArray();
        return std::ranges::all_of(list, [&](const QJsonValue& item) { return item.isString() && a.values.contains(item.toString()); });
    }
    case ArgKind::Steps: {
        if (v.isString()) return !v.toString().isEmpty();
        if (!v.isArray() || v.toArray().isEmpty()) return false;
        const auto list = v.toArray();
        return std::ranges::all_of(list, [](const QJsonValue& item) { return isWholeIn(item, 1, 64); });
    }
    case ArgKind::IntListMin1: {
        if (!v.isArray() || v.toArray().isEmpty()) return false;
        const auto list = v.toArray();
        return std::ranges::all_of(list, [&](const QJsonValue& item) { return isWholeIn(item, a.min, a.max); });
    }
    }
    return false;
}

// Empty when `args` satisfies the op's contract, else the error to return.
QString validateArgs(const QString& op, const QJsonObject& args) {
    const auto it = opSpecs().constFind(op);
    if (it == opSpecs().constEnd()) return QStringLiteral("Unknown step sequencer tool \"%1\".").arg(op);
    QStringList names;
    for (const auto& a : it->args) names.append(a.key);
    for (auto entry = args.begin(); entry != args.end(); ++entry) {
        if (entry.key() == u"timeline_id") continue;
        const auto spec = std::ranges::find_if(it->args, [&](const ArgSpec& a) { return a.key == entry.key(); });
        if (spec == it->args.end()) {
            return QStringLiteral("Unknown argument \"%1\" for %2. Valid arguments: %3.").arg(entry.key(), op, names.join(QStringLiteral(", ")));
        }
        if (!argMatches(*spec, entry.value())) {
            return QStringLiteral("%1 must be %2%3.").arg(spec->key, describeKind(*spec), spec->nullable ? QStringLiteral(" or null") : QString{});
        }
    }
    for (const auto& a : it->args) {
        if (a.required && !args.contains(a.key)) return QStringLiteral("%1 is required for %2.").arg(a.key, op);
    }
    return {};
}

QVariantMap schemaFor(const ArgSpec& a) {
    QVariantMap out;
    const auto typed = [&](const QString& type) {
        return a.nullable ? QVariant(QVariantList{type, QStringLiteral("null")}) : QVariant(type);
    };
    const QVariantMap stringItem{{QStringLiteral("type"), QStringLiteral("string")}, {QStringLiteral("minLength"), 1}};
    switch (a.kind) {
    case ArgKind::Str: out.insert("type", typed("string")); break;
    case ArgKind::NonEmpty: out.insert("type", typed("string")); out.insert("minLength", 1); break;
    case ArgKind::Int:
    case ArgKind::Num:
        out.insert("type", typed(a.kind == ArgKind::Int ? QStringLiteral("integer") : QStringLiteral("number")));
        if (std::isfinite(a.min)) out.insert(a.min > 0 && a.min < 1e-300 ? QStringLiteral("exclusiveMinimum") : QStringLiteral("minimum"), a.min > 0 && a.min < 1e-300 ? 0.0 : a.min);
        if (std::isfinite(a.max)) out.insert("maximum", a.max);
        break;
    case ArgKind::Bool: out.insert("type", typed("boolean")); break;
    case ArgKind::StrList:
    case ArgKind::StrListMin1:
        out.insert("type", "array");
        out.insert("items", stringItem);
        if (a.kind == ArgKind::StrListMin1) out.insert("minItems", 1);
        break;
    case ArgKind::Obj: out.insert("type", typed("object")); break;
    case ArgKind::ObjListMin1:
        out.insert("type", "array");
        out.insert("items", QVariantMap{{QStringLiteral("type"), QStringLiteral("object")}});
        out.insert("minItems", 1);
        break;
    case ArgKind::Enum: out.insert("type", typed("string")); out.insert("enum", a.values); break;
    case ArgKind::EnumList:
        out.insert("type", "array");
        out.insert("items", QVariantMap{{QStringLiteral("type"), QStringLiteral("string")}, {QStringLiteral("enum"), a.values}});
        break;
    case ArgKind::Steps:
        out.insert("anyOf", QVariantList{QVariantMap{{QStringLiteral("type"), QStringLiteral("string")}, {QStringLiteral("minLength"), 1}},
                                         QVariantMap{{QStringLiteral("type"), QStringLiteral("array")}, {QStringLiteral("minItems"), 1},
                                                     {QStringLiteral("items"), QVariantMap{{QStringLiteral("type"), QStringLiteral("integer")},
                                                                                          {QStringLiteral("minimum"), 1}, {QStringLiteral("maximum"), 64}}}}});
        break;
    case ArgKind::IntListMin1:
        out.insert("type", "array");
        out.insert("minItems", 1);
        out.insert("items", QVariantMap{{QStringLiteral("type"), QStringLiteral("integer")}, {QStringLiteral("minimum"), a.min}, {QStringLiteral("maximum"), a.max}});
        break;
    }
    if (!a.description.isEmpty()) out.insert("description", a.description);
    return out;
}

// JS `value >>> 0` for a stored seed.
std::uint32_t seedU32(const QJsonValue& value) noexcept {
    if (!value.isDouble() || !std::isfinite(value.toDouble())) return 0;
    const double modular = std::fmod(std::trunc(value.toDouble()), 4294967296.0);
    return static_cast<std::uint32_t>(modular < 0 ? modular + 4294967296.0 : modular);
}

bool isNoteRow(const QJsonObject& row) { return row.value(u"assignment").toObject().value(u"type").toString() != u"automation"; }

QJsonObject stripPatternSteps(const QJsonObject& pattern) {
    auto out = pattern;
    QJsonArray rows;
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        auto row = rv.toObject();
        QJsonArray steps;
        for (int i = 0; i < row.value(u"lengthSteps").toInt(16); ++i) steps.append(QJsonObject{});
        row.insert(QStringLiteral("steps"), steps);
        rows.append(row);
    }
    out.insert(QStringLiteral("rows"), rows);
    return out;
}

QJsonObject advanceAssignment(const QJsonObject& assignment, const QJsonObject& instrument) {
    const QString type = assignment.value(u"type").toString();
    if (type == u"note" || type == u"melodic") {
        return QJsonObject{{QStringLiteral("type"), type}, {QStringLiteral("pitch"), std::min(127, assignment.value(u"pitch").toInt() + 1)}};
    }
    if (type == u"kit") {
        int maxPad = 15;
        if (instrument.value(u"type").toString() == u"drum") {
            maxPad = std::max(0, static_cast<int>(instrument.value(u"pads").toArray().size()) - 1);
        } else if (instrument.value(u"type").toString() == u"sampler") {
            maxPad = std::max(0, std::min(15, static_cast<int>(instrument.value(u"zones").toArray().size()) - 1));
        }
        return QJsonObject{{QStringLiteral("type"), type}, {QStringLiteral("pad"), std::min(maxPad, assignment.value(u"pad").toInt() + 1)}};
    }
    if (type == u"degree") {
        static const QStringList degrees{"root", "2nd", "3rd", "4th", "5th", "6th", "7th"};
        const auto idx = degrees.indexOf(assignment.value(u"degree").toString());
        const auto nextIdx = (idx + 1) % degrees.size();
        const int octave = assignment.value(u"octave").toInt(3);
        return QJsonObject{{QStringLiteral("type"), type}, {QStringLiteral("degree"), degrees.at(nextIdx)},
                           {QStringLiteral("octave"), nextIdx == 0 ? std::min(8, octave + 1) : octave}};
    }
    const auto target = assignment.value(u"target").toObject();
    if (type == u"automation" && target.value(u"kind").toString() == u"cc") {
        return QJsonObject{{QStringLiteral("type"), type},
                           {QStringLiteral("target"), QJsonObject{{QStringLiteral("kind"), QStringLiteral("cc")},
                                                                 {QStringLiteral("cc"), std::min(127, target.value(u"cc").toInt() + 1)}}}};
    }
    return assignment;
}

// TS midi/stepPattern.ts transposeRowSteps.
QJsonObject transposeRowSteps(const QJsonObject& row, double semitones, const std::optional<std::vector<int>>& indices,
                              const QJsonObject& instrument) {
    const auto assignment = row.value(u"assignment").toObject();
    const QString type = assignment.value(u"type").toString();
    if (type == u"automation" || semitones == 0 || !std::isfinite(semitones)) return row;
    // Every result is clamped to MIDI ranges, so a bound far outside them keeps TS results.
    const int semi = static_cast<int>(std::trunc(std::clamp(semitones, -1e6, 1e6)));
    if (semi == 0) return row;
    if (!indices) {
        if (type == u"note" || type == u"melodic") {
            const int oldPitch = assignment.value(u"pitch").toInt();
            const int nextPitch = std::clamp(oldPitch + semi, 0, 127);
            const int actualSemi = nextPitch - oldPitch;
            const int oldPc = ((oldPitch % 12) + 12) % 12;
            const int octWrap = static_cast<int>(std::floor((oldPc + actualSemi) / 12.0));
            auto out = row;
            auto nextAssignment = assignment;
            nextAssignment.insert(QStringLiteral("pitch"), nextPitch);
            out.insert(QStringLiteral("assignment"), nextAssignment);
            if (octWrap != 0) {
                QJsonArray steps;
                for (const auto& sv : row.value(u"steps").toArray()) {
                    auto s = sv.toObject();
                    if (s.contains(u"octave")) s.insert(QStringLiteral("octave"), std::clamp(s.value(u"octave").toInt() + octWrap, -2, 8));
                    steps.append(s.contains(u"octave") ? QJsonValue(compactStep(s)) : QJsonValue(sv));
                }
                out.insert(QStringLiteral("steps"), steps);
            }
            return out;
        }
        if (type == u"degree") {
            auto out = row;
            auto nextAssignment = assignment;
            nextAssignment.insert(QStringLiteral("octave"), std::clamp(assignment.value(u"octave").toInt(3) + semi / 12, -2, 8));
            out.insert(QStringLiteral("assignment"), nextAssignment);
            return out;
        }
        if (type == u"kit") {
            std::vector<int> target;
            const auto steps = row.value(u"steps").toArray();
            for (int i = 0; i < steps.size(); ++i) {
                const auto s = steps.at(i).toObject();
                if (s.value(u"on").toBool(false) || s.contains(u"note") || s.contains(u"octave")) target.push_back(i);
            }
            return target.empty() ? row : transposeRowSteps(row, semi, target, instrument);
        }
        return row;
    }
    auto next = row;
    for (int idx : *indices) {
        const auto cur = next.value(u"steps").toArray().at(idx).toObject();
        const auto nextAssignment = next.value(u"assignment").toObject();
        const QString nextType = nextAssignment.value(u"type").toString();
        int baseOct = 3;
        if (cur.contains(u"octave")) baseOct = cur.value(u"octave").toInt();
        else if (nextType == u"degree") baseOct = nextAssignment.value(u"octave").toInt(3);
        else if (nextType == u"kit") baseOct = static_cast<int>(std::floor(kitPadPitch(nextAssignment.value(u"pad").toInt(), instrument) / 12.0)) - 2;
        else if (nextType == u"note" || nextType == u"melodic") baseOct = static_cast<int>(std::floor(nextAssignment.value(u"pitch").toInt() / 12.0)) - 2;
        int noteVal = cur.value(u"note").toInt(0) + semi;
        std::optional<int> octaveVal;
        if (cur.contains(u"octave")) octaveVal = cur.value(u"octave").toInt();
        if (noteVal > 12 || noteVal < -12) {
            const int octShift = noteVal / 12;
            noteVal -= octShift * 12;
            octaveVal = std::clamp(baseOct + octShift, -2, 8);
        }
        QJsonObject values{{QStringLiteral("note"), std::clamp(noteVal, -12, 12)}};
        if (octaveVal) values.insert(QStringLiteral("octave"), *octaveVal);
        next = setStepValue(next, idx, values, !cur.value(u"on").toBool(false));
    }
    return next;
}

QJsonArray defaultRowsForTrack(const QJsonObject& track) {
    const QJsonObject defaults{{QStringLiteral("lengthSteps"), 16}, {QStringLiteral("stepRate"), QStringLiteral("1/16")},
                               {QStringLiteral("playback"), QStringLiteral("forward")}, {QStringLiteral("midiChannel"), 1},
                               {QStringLiteral("automationMode"), QStringLiteral("latch")}};
    QJsonArray rows;
    const auto inst = track.value(u"instrument").toObject();
    const auto named = [&](int idx, const QString& name, const QJsonObject& assignment) {
        rows.append(normalizeRow(QJsonObject{{QStringLiteral("id"), QStringLiteral("r%1").arg(idx + 1)},
                                             {QStringLiteral("name"), name},
                                             {QStringLiteral("assignment"), assignment}},
                                 defaults));
    };
    if (inst.value(u"type").toString() == u"drum" && !inst.value(u"pads").toArray().isEmpty()) {
        const auto pads = inst.value(u"pads").toArray();
        for (int i = 0; i < pads.size(); ++i) {
            named(i, pads.at(i).toObject().value(u"name").toString(), {{QStringLiteral("type"), QStringLiteral("kit")}, {QStringLiteral("pad"), i}});
        }
        return rows;
    }
    if (inst.value(u"type").toString() == u"sampler" && !inst.value(u"zones").toArray().isEmpty()) {
        const auto zones = inst.value(u"zones").toArray();
        for (int i = 0; i < std::min<qsizetype>(16, zones.size()); ++i) {
            named(i, zones.at(i).toObject().value(u"name").toString(), {{QStringLiteral("type"), QStringLiteral("kit")}, {QStringLiteral("pad"), i}});
        }
        return rows;
    }
    if (track.value(u"musicRole").toString() == u"drums") {
        const std::array<std::pair<const char*, int>, 4> drums{{{"Kick", 36}, {"Snare", 38}, {"Closed Hat", 42}, {"Clap", 39}}};
        for (int i = 0; i < 4; ++i) {
            named(i, QString::fromLatin1(drums[static_cast<std::size_t>(i)].first),
                  {{QStringLiteral("type"), QStringLiteral("note")}, {QStringLiteral("pitch"), drums[static_cast<std::size_t>(i)].second}});
        }
        return rows;
    }
    named(0, QStringLiteral("C3"), {{QStringLiteral("type"), QStringLiteral("melodic")}, {QStringLiteral("pitch"), 60}});
    return rows;
}

QJsonObject trackOut(const QJsonObject& track) {
    QJsonObject out{{QStringLiteral("id"), track.value(u"id")}, {QStringLiteral("name"), track.value(u"name")},
                    {QStringLiteral("type"), track.value(u"type")}, {QStringLiteral("index"), track.value(u"index")}};
    if (track.contains(u"stepTemplate")) out.insert(QStringLiteral("hasStepTemplate"), true);
    return out;
}

// `Step Patterns/<Patterns|Templates>[/sub/path]` (stepPatternLibrary.ts).
QString stepPatternFolderPath(const QString& kind, const QString& folder) {
    const QString root = kind == u"template" ? QStringLiteral("Step Patterns/Templates") : QStringLiteral("Step Patterns/Patterns");
    QStringList parts;
    for (const auto& part : QString(folder).replace(u'\\', u'/').split(u'/')) {
        if (!part.trimmed().isEmpty()) parts.append(part.trimmed());
    }
    return parts.isEmpty() ? root : root + u'/' + parts.join(u'/');
}

}  // namespace

QString stepPatternLibraryRootForAppData(const QString& appData) { return appData.isEmpty() ? QString() : QDir(appData).filePath(QStringLiteral("Step Patterns")); }

void setUserStepPatternLibraryRoot(const QString& root) {
    if (!onLibraryThread()) return;
    if (!root.isEmpty()) QDir().mkpath(root);
    QCoreApplication::instance()->setProperty("ntStepPatternLibraryRoot", root);
}
QString userStepPatternLibraryRoot() { return userLibraryRoot(); }

QVariantList stepPatternAssistantTools() {
    QVariantList out;
    for (const char* name : kPatternOps) {
        const auto& spec = opSpecs()[QLatin1String(name)];
        QVariantMap properties{{QStringLiteral("timeline_id"), QVariantMap{{QStringLiteral("type"), QStringLiteral("string")}}}};
        QStringList required{QStringLiteral("timeline_id")};
        for (const auto& a : spec.args) {
            properties.insert(a.key, schemaFor(a));
            if (a.required) required.append(a.key);
        }
        out.append(QVariantMap{
            {QStringLiteral("name"), QString(kPrefix) + QLatin1String(name)},
            {QStringLiteral("description"), spec.description},
            {QStringLiteral("parameters"), QVariantMap{{QStringLiteral("type"), QStringLiteral("object")},
                                                       {QStringLiteral("properties"), properties},
                                                       {QStringLiteral("required"), required},
                                                       {QStringLiteral("additionalProperties"), false}}},
        });
    }
    return out;
}

bool stepPatternOpTakes(const QString& op, const QString& key) {
    const auto it = opSpecs().constFind(canonicalStepPatternOp(op));
    return it != opSpecs().constEnd() && std::ranges::any_of(it->args, [&](const ArgSpec& a) { return a.key == key; });
}

QString canonicalStepPatternOp(const QString& name) {
    QString bare = name;
    if (bare.startsWith(kPrefix)) bare = bare.mid(kPrefix.size());
    for (const char* op : kPatternOps) {
        if (bare == QLatin1String(op)) return bare;
    }
    return {};
}

bool isStepPatternTool(const QString& name) {
    return !canonicalStepPatternOp(name).isEmpty();
}

QJsonArray factoryStepPatternLibrary() {
    static constexpr std::array kChunks
#include "midi/StepPatternFactoryLibrary.inc"
        ;
    std::size_t total = 0;
    for (std::string_view sv : kChunks) total += sv.size();
    QByteArray joined;
    joined.reserve(static_cast<qsizetype>(total));
    for (std::string_view sv : kChunks) joined.append(sv.data(), static_cast<qsizetype>(sv.size()));
    return QJsonDocument::fromJson(joined).array();
}

static StepPatternOpOutcome runStepPatternOpImpl(const QJsonObject& document, const QString& name, const QJsonObject& args) {
    if (!onLibraryThread()) return fail(QStringLiteral("Step pattern operations must run on the application thread."));
    const QString op = canonicalStepPatternOp(name);
    if (op.isEmpty()) return fail(QStringLiteral("Unknown step sequencer tool \"%1\".").arg(name));
    if (const auto problem = validateArgs(op, args); !problem.isEmpty()) return fail(problem);

    // Validate before resolving or mutating any target. The document validator
    // also checks complete patterns at load time.
    if (args.contains(u"stepRate") && !isValidStepRate(args.value(u"stepRate").toString().toStdString())) {
        return fail(QStringLiteral("Invalid stepRate."));
    }
    const QStringList editModes{"onOff", "velocity", "value", "gate", "tie", "note", "octave", "repeat", "chance", "offset", "stepRate", "skip", "loop"};
    if (op == u"clear_pattern") {
        if ((args.contains(u"scope") && !QStringList{"pattern", "row", "steps"}.contains(args.value(u"scope").toString())) ||
            (args.contains(u"mode") && !editModes.contains(args.value(u"mode").toString())) ||
            (args.contains(u"rowType") && !QStringList{"note", "automation"}.contains(args.value(u"rowType").toString()))) {
            return fail(QStringLiteral("scope must be pattern, row or steps. mode must be a step edit mode. rowType must be note or automation."));
        }
    }
    if (op == u"set_pattern") {
        auto candidate = normalizePattern();
        for (auto it = args.begin(); it != args.end(); ++it) {
            if (candidate.contains(it.key()) || it.key() == u"key") candidate.insert(it.key(), it.value());
        }
        if (candidate.value(u"key").isNull()) candidate.remove("key");
        const auto problems = validateStepPattern(candidate);
        if (!problems.isEmpty()) return fail(problems.join(' '));
        for (const char* field : {"loopStart", "loopEnd"}) {
            const auto v = args.value(QLatin1String(field));
            if (!v.isUndefined() && (!v.isDouble() || v.toDouble() != std::floor(v.toDouble()) || v.toDouble() < 1 || v.toDouble() > 64)) {
                return fail(QStringLiteral("Loop endpoints must be integers 1..64."));
            }
        }
    }
    if (op == u"set_steps") {
        auto candidate = normalizePattern({{"lengthSteps", 1}, {"rows", QJsonArray{QJsonObject{{"id", "validation"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}}}}});
        auto row = candidate.value(u"rows").toArray().first().toObject();
        auto values = args.value(u"values").toObject();
        const QStringList stepFields{"on", "velocity", "gate", "tie", "note", "octave", "repeat", "chance", "offset",
            "stepRate", "skip", "value", "condition", "midiChannel", "articulation", "velocityRamp", "velocityCurve", "distribution"};
        for (auto it = values.begin(); it != values.end(); ++it) {
            if (!stepFields.contains(it.key())) return fail(QStringLiteral("Unknown step field %1.").arg(it.key()));
        }
        // Null is a patch operation that clears the override, never a stored rate.
        if (values.value(u"stepRate").isNull()) { values.remove("stepRate"); }
        row.insert("steps", QJsonArray{values});
        candidate.insert("rows", QJsonArray{row});
        const auto problems = validateStepPattern(candidate);
        if (!problems.isEmpty()) return fail(problems.join(' '));
        if (args.contains(u"ramp")) {
            const auto ramp = args.value(u"ramp").toObject();
            if (!QStringList{"velocity", "gate", "note", "octave", "repeat", "chance", "offset", "value", "velocityRamp", "velocityCurve", "distribution"}.contains(ramp.value(u"field").toString()) ||
                !ramp.value(u"from").isDouble() || !ramp.value(u"to").isDouble() ||
                !std::isfinite(ramp.value(u"from").toDouble()) || !std::isfinite(ramp.value(u"to").toDouble())) {
                return fail(QStringLiteral("ramp requires a valid field and finite numeric from/to."));
            }
        }
    }
    if (op == u"add_pattern_rows") {
        if (!args.value(u"rows").isArray() || args.value(u"rows").toArray().isEmpty()) return fail(QStringLiteral("rows must be a nonempty array."));
        for (const auto& value : args.value(u"rows").toArray()) {
            if (!value.isObject()) return fail(QStringLiteral("Each row must be an object."));
            const auto input = value.toObject();
            auto candidate = normalizePattern({{"rows", QJsonArray{QJsonObject{{"id", "validation"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}}}}});
            auto row = candidate.value(u"rows").toArray().first().toObject();
            for (const char* field : {"stepRate", "playback", "automationMode", "midiChannel", "subrows", "assignment", "name", "color"}) {
                if (input.contains(QLatin1String(field))) row.insert(QLatin1String(field), input.value(QLatin1String(field)));
            }
            if (input.contains(u"degree")) row.insert("assignment", QJsonObject{{"type", "degree"}, {"degree", input.value(u"degree")}, {"octave", input.value(u"octave").toDouble(3)}});
            candidate.insert("rows", QJsonArray{row});
            const auto problems = validateStepPattern(candidate);
            if (!problems.isEmpty()) return fail(problems.join(' '));
        }
    }

    QJsonObject doc = document;
    QJsonArray tracks = doc.value(u"tracks").toArray();
    QJsonArray clips = doc.value(u"clips").toArray();

    auto resolvePatClip = [&](const QString& clipId, int& outIndex, QJsonObject& outClip, QJsonObject& outPattern,
                              QJsonObject& outInstrument, QString* error) -> bool {
        const auto resolved = resolveMidiClip(clips, clipId, error);
        if (!resolved) return false;
        if (!resolved->clip.value(u"pattern").isObject()) {
            *error = QStringLiteral(
                         "Clip \"%1\" is a regular MIDI clip, not a step sequencer pattern region. Convert it with "
                         "convert_midi_to_pattern or create one with create_pattern_region.")
                         .arg(resolved->clip.value(u"name").toString());
            return false;
        }
        outIndex = resolved->index;
        outClip = resolved->clip;
        outPattern = resolved->clip.value(u"pattern").toObject();
        outInstrument = findTrackById(tracks, outClip.value(u"trackId").toString()).value(u"instrument").toObject();
        return true;
    };

    // ── 1. get_pattern ──────────────────────────────────────────────────────
    if (op == u"get_pattern") {
        int idx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), idx, clip, pattern, instrument, &err)) return fail(err);
        const auto modes = args.value(u"modes").toArray();
        QJsonArray rowsOut;
        for (const auto& rv : pattern.value(u"rows").toArray()) {
            rowsOut.append(serializePatternRow(rv.toObject(), instrument, modes));
        }
        return {true,
                false,
                document,
                QJsonObject{{QStringLiteral("ok"), true},
                            {QStringLiteral("clipId"), clip.value(u"id")},
                            {QStringLiteral("name"), clip.value(u"name")},
                            {QStringLiteral("summary"), patternSummary(pattern)},
                            {QStringLiteral("settings"), serializePatternSettings(pattern)},
                            {QStringLiteral("text"), patternToText(pattern, instrument)},
                            {QStringLiteral("rows"), rowsOut}},
                {}};
    }

    // ── 2. set_steps ────────────────────────────────────────────────────────
    if (op == u"set_steps") {
        int clipIdx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), clipIdx, clip, pattern, instrument, &err)) return fail(err);
        if (!checkWritable(tracks, clip, &err)) return fail(err);
        const bool hasValues = args.value(u"values").isObject();
        const bool hasRamp = args.value(u"ramp").isObject();
        if (!hasValues && !hasRamp) return fail(QStringLiteral("set_steps requires `values` and/or `ramp`."));

        const auto resolvedRow = resolveRow(pattern, args.value(u"row").toString(), instrument, &err);
        if (!resolvedRow) return fail(err);
        const int rowLen = resolvedRow->row.value(u"lengthSteps").toInt(resolvedRow->row.value(u"steps").toArray().size());
        const auto stepIndicesOpt = parseStepSelection(args.value(u"steps"), rowLen, &err);
        if (!stepIndicesOpt) return fail(err);
        const auto& stepIndices = *stepIndicesOpt;

        const auto valuesObj = hasValues ? args.value(u"values").toObject() : QJsonObject{};
        const auto rampObj = hasRamp ? args.value(u"ramp").toObject() : QJsonObject{};
        QJsonObject updated = resolvedRow->row;
        std::vector<int> turnedOn;

        for (std::size_t pos = 0; pos < stepIndices.size(); ++pos) {
            const int stepIdx = stepIndices[pos];
            QJsonObject patch;
            if (hasValues) {
                for (auto it = valuesObj.begin(); it != valuesObj.end(); ++it) {
                    if (it.key() == u"stepRate" && it.value().isNull()) {
                        patch.insert(QStringLiteral("stepRate"), QJsonValue::Null);
                    } else if (!it.value().isUndefined()) {
                        patch.insert(it.key(), it.value());
                    }
                }
            }
            if (hasRamp) {
                const QString field = rampObj.value(u"field").toString();
                const double from = rampObj.value(u"from").toDouble();
                const double to = rampObj.value(u"to").toDouble();
                const bool isDeviceVal =
                    (field == u"value") &&
                    updated.value(u"assignment").toObject().value(u"type").toString() == u"automation" &&
                    updated.value(u"assignment").toObject().value(u"target").toObject().value(u"kind").toString() ==
                        u"device";
                const double raw = (stepIndices.size() <= 1)
                                       ? from
                                       : from + ((to - from) * static_cast<double>(pos)) /
                                                    static_cast<double>(stepIndices.size() - 1);
                patch.insert(field, isDeviceVal ? raw : jsRound(raw));
            }
            const bool keepOff = hasRamp && rampObj.value(u"leaveOff").toBool(false) &&
                                 !(hasValues && valuesObj.value(u"on").toBool(false));
            updated = setStepValue(updated, stepIdx, patch, keepOff, &err);
            if (!err.isEmpty()) return fail(err);
            if (updated.value(u"steps").toArray().at(stepIdx).toObject().value(u"on").toBool(false)) {
                turnedOn.push_back(stepIdx);
            }
        }

        auto rows = pattern.value(u"rows").toArray();
        rows.replace(resolvedRow->index, updated);
        pattern.insert(QStringLiteral("rows"), rows);
        if (pattern.value(u"mono").toBool(false) && !turnedOn.empty()) {
            pattern = applyMonoAtSteps(pattern, updated.value(u"id").toString(), turnedOn);
        }
        clip.insert(QStringLiteral("pattern"), pattern);
        clips.replace(clipIdx, clip);
        doc.insert(QStringLiteral("clips"), clips);

        QJsonArray editedSteps1;
        for (int i : stepIndices) editedSteps1.append(i + 1);
        return {true,
                true,
                doc,
                QJsonObject{{QStringLiteral("ok"), true},
                            {QStringLiteral("clipId"), clip.value(u"id")},
                            {QStringLiteral("row"),
                             serializePatternRow(pattern.value(u"rows").toArray().at(resolvedRow->index).toObject(),
                                                 instrument)},
                            {QStringLiteral("editedSteps"), editedSteps1},
                            {QStringLiteral("text"), patternToText(pattern, instrument)}},
                {}};
    }

    // ── 3. set_pattern_text ─────────────────────────────────────────────────
    if (op == u"set_pattern_text") {
        int clipIdx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), clipIdx, clip, pattern, instrument, &err)) return fail(err);
        if (!checkWritable(tracks, clip, &err)) return fail(err);
        const QString mode = args.value(u"mode").toString(QStringLiteral("merge"));
        if (mode != u"merge" && mode != u"replace") {
            return fail(QStringLiteral("Invalid mode \"%1\"; expected \"merge\" or \"replace\".").arg(mode));
        }
        const auto next = applyPatternTextToPattern(pattern, args.value(u"text").toString(), mode, instrument, &err);
        if (!err.isEmpty()) return fail(err);
        clip.insert(QStringLiteral("pattern"), next);
        clips.replace(clipIdx, clip);
        doc.insert(QStringLiteral("clips"), clips);
        return {true,
                true,
                doc,
                QJsonObject{{QStringLiteral("ok"), true},
                            {QStringLiteral("clip"), clipOut(clip)},
                            {QStringLiteral("pattern"), patternSummary(next)},
                            {QStringLiteral("text"), patternToText(next, instrument)}},
                {}};
    }

    // ── 4. set_pattern ──────────────────────────────────────────────────────
    if (op == u"set_pattern") {
        int clipIdx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), clipIdx, clip, pattern, instrument, &err)) return fail(err);
        if (!checkWritable(tracks, clip, &err)) return fail(err);

        if (args.value(u"name").isString()) pattern.insert(QStringLiteral("name"), args.value(u"name").toString());
        if (args.value(u"lengthSteps").isDouble()) {
            pattern = resizePatternLength(pattern, args.value(u"lengthSteps").toInt());
        }
        if (args.value(u"stepRate").isString()) {
            const auto r = args.value(u"stepRate").toString();
            if (!isValidStepRate(r.toStdString())) return fail(QStringLiteral("Unknown stepRate \"%1\".").arg(r));
            pattern = setPatternStepRate(pattern, r);
        }
        if (args.value(u"playback").isString()) pattern = setPatternPlayback(pattern, args.value(u"playback").toString());
        if (args.value(u"swing").isDouble()) {
            pattern.insert(QStringLiteral("swing"), clampInt(args.value(u"swing").toDouble(), 0, 100));
        }
        if (args.value(u"swingDivision").isString()) {
            pattern.insert(QStringLiteral("swingDivision"), args.value(u"swingDivision").toString());
        }
        if (args.value(u"legato").isBool()) pattern.insert(QStringLiteral("legato"), args.value(u"legato").toBool());
        if (args.value(u"mono").isBool()) pattern.insert(QStringLiteral("mono"), args.value(u"mono").toBool());
        if (args.value(u"midiChannel").isDouble()) {
            pattern = setPatternMidiChannel(pattern, args.value(u"midiChannel").toInt());
        }
        if (args.value(u"pitchSource").isString()) {
            pattern.insert(QStringLiteral("pitchSource"), args.value(u"pitchSource").toString());
        }
        if (args.value(u"scale").isString()) pattern.insert(QStringLiteral("scale"), args.value(u"scale").toString());
        if (args.value(u"scaleQuantize").isBool()) {
            pattern.insert(QStringLiteral("scaleQuantize"), args.value(u"scaleQuantize").toBool());
        }
        if (args.value(u"noTranspose").isBool()) {
            pattern.insert(QStringLiteral("noTranspose"), args.value(u"noTranspose").toBool());
        }
        if (args.contains(u"key")) {
            if (args.value(u"key").isNull()) pattern.remove(QStringLiteral("key"));
            else if (args.value(u"key").isObject()) pattern = setPatternKey(pattern, args.value(u"key").toObject());
        }
        if (args.value(u"automationMode").isString()) {
            pattern = setPatternAutomationMode(pattern, args.value(u"automationMode").toString());
        }
        if (args.value(u"loopStart").isDouble() || args.value(u"loopEnd").isDouble()) {
            const std::optional<int> start0 =
                args.value(u"loopStart").isDouble() ? std::optional<int>(args.value(u"loopStart").toInt() - 1)
                                                   : std::nullopt;
            const std::optional<int> endExcl =
                args.value(u"loopEnd").isDouble() ? std::optional<int>(args.value(u"loopEnd").toInt()) : std::nullopt;
            if (start0.has_value() && endExcl.has_value() && *start0 >= *endExcl) {
                return fail(QStringLiteral("loopStart (%1) must be <= loopEnd (%2).")
                                .arg(*start0 + 1)
                                .arg(*endExcl));
            }
            pattern = setPatternLoop(pattern, start0, endExcl);
        }

        clip.insert(QStringLiteral("pattern"), pattern);
        clips.replace(clipIdx, clip);
        doc.insert(QStringLiteral("clips"), clips);
        return {true,
                true,
                doc,
                QJsonObject{{QStringLiteral("ok"), true},
                            {QStringLiteral("clip"), clipOut(clip)},
                            {QStringLiteral("settings"), serializePatternSettings(pattern)},
                            {QStringLiteral("text"), patternToText(pattern, instrument)}},
                {}};
    }

    // ── 5. add_pattern_rows ─────────────────────────────────────────────────
    if (op == u"add_pattern_rows") {
        int clipIdx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), clipIdx, clip, pattern, instrument, &err)) return fail(err);
        if (!checkWritable(tracks, clip, &err)) return fail(err);
        const auto track = findTrackById(tracks, clip.value(u"trackId").toString());
        const auto inRows = args.value(u"rows").toArray();
        const int curCount = static_cast<int>(pattern.value(u"rows").toArray().size());
        if (curCount + inRows.size() > kStepPatternMaxRows) {
            return fail(QStringLiteral("Cannot add %1 row(s): pattern already has %2 rows and supports at most %3.")
                            .arg(inRows.size())
                            .arg(curCount)
                            .arg(kStepPatternMaxRows));
        }

        QJsonArray addedIds;
        for (const auto& rv : inRows) {
            const auto rowIn = rv.toObject();
            if (!assertUniqueSubrows(rowIn.value(u"subrows"), &err)) return fail(err);

            QJsonObject assignment;
            std::optional<QString> defaultName;
            if (rowIn.value(u"assignment").isObject()) {
                assignment = rowIn.value(u"assignment").toObject();
                if (assignment.value(u"type").toString() == u"automation" &&
                    assignment.value(u"target").toObject().value(u"kind").toString() == u"device") {
                    auto t = assignment.value(u"target").toObject();
                    const QString did = resolveDeviceId(t.value(u"deviceId").toString(), track, &err);
                    if (!err.isEmpty()) return fail(err);
                    t.insert(QStringLiteral("deviceId"), did);
                    assignment.insert(QStringLiteral("target"), t);
                }
            } else if (rowIn.contains(u"pad") && !rowIn.value(u"pad").isUndefined() && !rowIn.value(u"pad").isNull()) {
                if (rowIn.value(u"pad").isDouble()) {
                    assignment = QJsonObject{{QStringLiteral("type"), QStringLiteral("kit")},
                                             {QStringLiteral("pad"), clampInt(rowIn.value(u"pad").toDouble(), 0, 15)}};
                } else {
                    const QString padStr = rowIn.value(u"pad").toString();
                    const QString lower = padStr.trimmed().toLower();
                    const auto instType = instrument.value(u"type").toString();
                    if (instType == u"drum") {
                        const auto pads = instrument.value(u"pads").toArray();
                        int found = -1;
                        for (int p = 0; p < pads.size(); ++p) {
                            if (pads.at(p).toObject().value(u"name").toString().toLower() == lower) {
                                found = p;
                                break;
                            }
                        }
                        if (found < 0) return fail(QStringLiteral("No drum pad named \"%1\".").arg(padStr));
                        assignment = QJsonObject{{QStringLiteral("type"), QStringLiteral("kit")},
                                                 {QStringLiteral("pad"), found}};
                        defaultName = pads.at(found).toObject().value(u"name").toString();
                    } else {
                        const auto inf = assignmentFromRowName(padStr, instrument);
                        assignment = inf.assignment;
                        defaultName = inf.customName.value_or(padStr);
                    }
                }
            } else if (rowIn.contains(u"pitch") && !rowIn.value(u"pitch").isUndefined() && !rowIn.value(u"pitch").isNull()) {
                std::optional<int> pitch;
                if (rowIn.value(u"pitch").isDouble()) pitch = clampInt(rowIn.value(u"pitch").toDouble(), 0, 127);
                else if (rowIn.value(u"pitch").isString()) pitch = parseStepNoteName(rowIn.value(u"pitch").toString());
                if (!pitch) {
                    return fail(QStringLiteral("Invalid pitch \"%1\". Pass an integer 0..127 or a note name like \"C3\".")
                                    .arg(rowIn.value(u"pitch").toVariant().toString()));
                }
                assignment = QJsonObject{{QStringLiteral("type"), QStringLiteral("note")},
                                         {QStringLiteral("pitch"), *pitch}};
            } else if (rowIn.contains(u"degree") && !rowIn.value(u"degree").isUndefined() && !rowIn.value(u"degree").isNull()) {
                static constexpr std::array<const char*, 7> kDegs{"root", "2nd", "3rd", "4th", "5th", "6th", "7th"};
                QString deg;
                if (rowIn.value(u"degree").isDouble()) {
                    deg = QString::fromLatin1(kDegs[static_cast<std::size_t>(clampInt(rowIn.value(u"degree").toDouble(), 0, 6))]);
                } else {
                    deg = rowIn.value(u"degree").toString();
                }
                const int oct = rowIn.value(u"octave").isDouble() ? clampInt(rowIn.value(u"octave").toDouble(), -2, 8) : 3;
                assignment = QJsonObject{{QStringLiteral("type"), QStringLiteral("degree")},
                                         {QStringLiteral("degree"), deg},
                                         {QStringLiteral("octave"), oct}};
            } else if (rowIn.value(u"cc").isDouble()) {
                assignment = QJsonObject{
                    {QStringLiteral("type"), QStringLiteral("automation")},
                    {QStringLiteral("target"),
                     QJsonObject{{QStringLiteral("kind"), QStringLiteral("cc")},
                                 {QStringLiteral("cc"), clampInt(rowIn.value(u"cc").toDouble(), 0, 127)}}}};
            } else if (rowIn.value(u"param").isString()) {
                const QString param = rowIn.value(u"param").toString();
                const QString lower = param.trimmed().toLower();
                if (lower == u"pitchbend" || lower == u"pitch bend") {
                    assignment = QJsonObject{{QStringLiteral("type"), QStringLiteral("automation")},
                                             {QStringLiteral("target"),
                                              QJsonObject{{QStringLiteral("kind"), QStringLiteral("pitchBend")}}}};
                } else if (lower == u"channelpressure" || lower == u"channel pressure") {
                    assignment = QJsonObject{{QStringLiteral("type"), QStringLiteral("automation")},
                                             {QStringLiteral("target"),
                                              QJsonObject{{QStringLiteral("kind"), QStringLiteral("channelPressure")}}}};
                } else {
                    const QString did = resolveDeviceId(rowIn.value(u"deviceId").toString(), track, &err);
                    if (!err.isEmpty()) return fail(err);
                    assignment = QJsonObject{
                        {QStringLiteral("type"), QStringLiteral("automation")},
                        {QStringLiteral("target"), QJsonObject{{QStringLiteral("kind"), QStringLiteral("device")},
                                                               {QStringLiteral("deviceId"), did},
                                                               {QStringLiteral("param"), param}}}};
                }
            } else if (rowIn.value(u"name").isString() && !rowIn.value(u"name").toString().isEmpty()) {
                const auto inf = assignmentFromRowName(rowIn.value(u"name").toString(), instrument);
                assignment = inf.assignment;
                defaultName = rowIn.value(u"name").toString();
            } else {
                return fail(QStringLiteral(
                    "Each row in add_pattern_rows needs one of: assignment, pitch, pad, degree, cc, param, or name."));
            }

            if (!assertAssignmentAllowed(assignment, pattern, instrument, &err)) return fail(err);

            const QString id = mintRowId(pattern);
            const int patLen = pattern.value(u"lengthSteps").toInt(16);
            int lengthSteps = rowIn.value(u"lengthSteps").isDouble() ? rowIn.value(u"lengthSteps").toInt() : patLen;
            QString stepRate = rowIn.value(u"stepRate").isString()
                                   ? rowIn.value(u"stepRate").toString()
                                   : pattern.value(u"stepRate").toString(QStringLiteral("1/16"));
            QJsonArray steps;
            bool hasSteps = false;
            if (rowIn.value(u"text").isString()) {
                const QString rawText = rowIn.value(u"text").toString();
                const QString lineText =
                    rawText.contains(u':')
                        ? rawText
                        : QStringLiteral("%1: %2")
                              .arg(rowIn.value(u"name").toString(defaultName.value_or(QStringLiteral("Row"))), rawText);
                const auto parsed = parsePatternTextLines(lineText, &err);
                if (!err.isEmpty()) return fail(err);
                if (!parsed.empty()) {
                    steps = parsed[0].steps;
                    hasSteps = true;
                    if (!rowIn.value(u"lengthSteps").isDouble()) lengthSteps = static_cast<int>(steps.size());
                    if (!rowIn.value(u"stepRate").isString() && parsed[0].stepRate.has_value()) {
                        stepRate = *parsed[0].stepRate;
                    }
                }
            }
            if (lengthSteps > patLen) {
                return fail(QStringLiteral("Row lengthSteps (%1) cannot exceed pattern lengthSteps (%2). Resize the pattern length first.")
                                .arg(lengthSteps)
                                .arg(patLen));
            }
            const auto bounds = validateLoopBounds1Based(rowIn.value(u"loopStart"), rowIn.value(u"loopEnd"),
                                                         lengthSteps, 0, lengthSteps, &err);
            if (!bounds) return fail(err);

            QJsonObject partial{
                {QStringLiteral("id"), id},
                {QStringLiteral("assignment"), assignment},
                {QStringLiteral("stepRate"), stepRate},
                {QStringLiteral("lengthSteps"), lengthSteps},
                {QStringLiteral("playback"), rowIn.value(u"playback").isString()
                                                 ? rowIn.value(u"playback").toString()
                                                 : pattern.value(u"playback").toString(QStringLiteral("forward"))},
                {QStringLiteral("mute"), rowIn.value(u"mute").toBool(false)},
                {QStringLiteral("solo"), rowIn.value(u"solo").toBool(false)},
                {QStringLiteral("loopStart"), bounds->loopStart},
                {QStringLiteral("loopEnd"), bounds->loopEnd},
                {QStringLiteral("midiChannel"), rowIn.value(u"midiChannel").isDouble()
                                                    ? rowIn.value(u"midiChannel").toInt()
                                                    : pattern.value(u"midiChannel").toInt(1)},
                {QStringLiteral("automationMode"),
                 rowIn.value(u"automationMode").isString()
                     ? rowIn.value(u"automationMode").toString()
                     : pattern.value(u"automationMode").toString(QStringLiteral("latch"))},
                {QStringLiteral("subrows"), rowIn.value(u"subrows").isArray() ? rowIn.value(u"subrows").toArray()
                                                                              : defaultSubrowsForAssignment(assignment)},
            };
            if (rowIn.value(u"name").isString()) partial.insert(QStringLiteral("name"), rowIn.value(u"name").toString());
            else if (defaultName.has_value()) partial.insert(QStringLiteral("name"), *defaultName);
            if (rowIn.value(u"color").isString()) partial.insert(QStringLiteral("color"), rowIn.value(u"color").toString());
            if (rowIn.value(u"subrowsExpanded").isBool()) {
                partial.insert(QStringLiteral("subrowsExpanded"), rowIn.value(u"subrowsExpanded").toBool());
            }
            if (hasSteps) partial.insert(QStringLiteral("steps"), steps);

            auto rows = pattern.value(u"rows").toArray();
            rows.append(normalizeRow(partial, pattern));
            pattern.insert(QStringLiteral("rows"), rows);
            pattern = applyPatternRowSort(pattern, instrument);
            addedIds.append(id);
        }

        clip.insert(QStringLiteral("pattern"), pattern);
        clips.replace(clipIdx, clip);
        doc.insert(QStringLiteral("clips"), clips);
        QJsonArray rowsOut;
        for (const auto& rv : pattern.value(u"rows").toArray()) rowsOut.append(serializePatternRow(rv.toObject(), instrument));
        return {true,
                true,
                doc,
                QJsonObject{{QStringLiteral("ok"), true},
                            {QStringLiteral("clipId"), clip.value(u"id")},
                            {QStringLiteral("addedRowIds"), addedIds},
                            {QStringLiteral("rows"), rowsOut}},
                {}};
    }

    // ── 6. clear_pattern ────────────────────────────────────────────────────
    if (op == u"clear_pattern") {
        int clipIdx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), clipIdx, clip, pattern, instrument, &err)) return fail(err);
        if (!checkWritable(tracks, clip, &err)) return fail(err);

        const QString scopeStr = args.value(u"scope").toString(QStringLiteral("pattern"));
        const QString modeStr = args.value(u"mode").toString();
        auto rows = pattern.value(u"rows").toArray();

        if (scopeStr == u"steps") {
            if (!args.value(u"row").isString() || !args.contains(u"steps")) {
                return fail(QStringLiteral("clear_pattern with scope \"steps\" requires `row` and `steps`."));
            }
            const auto resolvedRow = resolveRow(pattern, args.value(u"row").toString(), instrument, &err);
            if (!resolvedRow) return fail(err);
            const auto indices = parseStepSelection(
                args.value(u"steps"),
                resolvedRow->row.value(u"lengthSteps").toInt(resolvedRow->row.value(u"steps").toArray().size()), &err);
            if (!indices) return fail(err);
            rows.replace(resolvedRow->index, clearRowSteps(resolvedRow->row, indices, modeStr));
        } else if (scopeStr == u"row") {
            if (!args.value(u"row").isString()) {
                return fail(QStringLiteral("clear_pattern with scope \"row\" requires `row`."));
            }
            const auto resolvedRow = resolveRow(pattern, args.value(u"row").toString(), instrument, &err);
            if (!resolvedRow) return fail(err);
            rows.replace(resolvedRow->index, clearRowSteps(resolvedRow->row, std::nullopt, modeStr));
        } else {
            const QString rowType = args.value(u"rowType").toString();
            for (int i = 0; i < rows.size(); ++i) {
                const auto r = rows.at(i).toObject();
                const bool isNote = r.value(u"assignment").toObject().value(u"type").toString() != u"automation";
                if (rowType == u"note" && !isNote) continue;
                if (rowType == u"automation" && isNote) continue;
                rows.replace(i, clearRowSteps(r, std::nullopt, modeStr));
            }
        }

        pattern.insert(QStringLiteral("rows"), rows);
        clip.insert(QStringLiteral("pattern"), pattern);
        clips.replace(clipIdx, clip);
        doc.insert(QStringLiteral("clips"), clips);
        return {true,
                true,
                doc,
                QJsonObject{{QStringLiteral("ok"), true},
                            {QStringLiteral("clipId"), clip.value(u"id")},
                            {QStringLiteral("text"), patternToText(pattern, instrument)}},
                {}};
    }

    // ── 7. convert_pattern_to_midi ──────────────────────────────────────────
    if (op == u"convert_pattern_to_midi") {
        const auto idsArr = args.value(u"clipIds").toArray();
        if (idsArr.isEmpty()) return fail(QStringLiteral("convert_pattern_to_midi requires `clipIds`."));
        const double bpm = resolveBpm(doc);
        const double offsetMs = resolveOffsetMs(doc);

        struct Target {
            int index = -1;
            QJsonObject clip;
            QJsonObject pattern;
            QJsonObject instrument;
        };
        std::vector<Target> targets;
        QString err;
        for (const auto& iv : idsArr) {
            Target t;
            if (!resolvePatClip(iv.toString(), t.index, t.clip, t.pattern, t.instrument, &err)) return fail(err);
            if (!checkWritable(tracks, t.clip, &err)) return fail(err);
            targets.push_back(std::move(t));
        }

        QJsonArray chords;
        for (const auto& tv : tracks) {
            const auto t = tv.toObject();
            if (t.value(u"type").toString() == u"chord") {
                chords = t.value(u"chords").toArray();
                break;
            }
        }

        QJsonArray converted;
        for (auto& t : targets) {
            const auto loopMs = activeLoopMs(t.clip);
            const std::int64_t inPointTicks =
                std::max<std::int64_t>(0, tickInt64(jsRound(msToTicks(t.clip.value(u"inPointMs").toDouble(0.0), bpm))));
            const std::int64_t phaseTicks =
                tickInt64(t.clip.value(u"patternPhaseTicks").toDouble(0.0)) + inPointTicks;

            bool hasCycleDependentRow = false;
            for (const auto& rv : t.pattern.value(u"rows").toArray()) {
                const auto r = rv.toObject();
                const auto pb = r.value(u"playback").toString();
                if (pb == u"shuffle" || pb == u"random" || pb == u"wander") {
                    hasCycleDependentRow = true;
                    break;
                }
                for (const auto& sv : r.value(u"steps").toArray()) {
                    const auto s = sv.toObject();
                    if ((s.value(u"chance").isDouble() && s.value(u"chance").toDouble() < 100.0) ||
                        (s.value(u"condition").isObject() &&
                         s.value(u"condition").toObject().value(u"type").toString() != u"always")) {
                        hasCycleDependentRow = true;
                        break;
                    }
                }
                if (hasCycleDependentRow) break;
            }

            const bool repeatVaries = loopMs.has_value() &&
                                      (phaseTicks > 0 || t.pattern.value(u"pitchSource").toString() == u"chords" ||
                                       hasCycleDependentRow);
            const double durMs = t.clip.value(u"durationMs").toDouble(0.0);
            const double expandDurMs = repeatVaries ? durMs : loopMs.value_or(durMs);
            const std::int64_t clipLengthTicks =
                std::max<std::int64_t>(1, tickInt64(jsRound(msToTicks(expandDurMs, bpm))));

            QJsonObject ctx{
                {QStringLiteral("clipLengthTicks"), static_cast<double>(clipLengthTicks)},
                {QStringLiteral("patternPhaseTicks"), static_cast<double>(phaseTicks)},
                {QStringLiteral("clipStartDocTick"),
                 jsRound(msToTicks(t.clip.value(u"startMs").toDouble(0.0) - offsetMs, bpm))},
            };
            if (repeatVaries && loopMs.has_value()) {
                ctx.insert(QStringLiteral("loopLengthTicks"),
                           static_cast<double>(std::max<std::int64_t>(1, tickInt64(jsRound(msToTicks(*loopMs, bpm))))));
            }
            if (t.clip.value(u"patternRowCycles").isObject()) {
                ctx.insert(QStringLiteral("rowCycles"), t.clip.value(u"patternRowCycles").toObject());
            }
            if (!t.instrument.isEmpty()) ctx.insert(QStringLiteral("instrument"), t.instrument);
            if (!chords.isEmpty()) ctx.insert(QStringLiteral("chords"), chords);
            if (doc.value(u"tempo").toObject().value(u"key").isObject()) {
                ctx.insert(QStringLiteral("key"), doc.value(u"tempo").toObject().value(u"key").toObject());
            }

            const auto expanded = expandPattern(t.pattern, ctx);
            if (expanded.contains(u"error")) return fail(expanded.value(u"error").toString());
            if (!expanded.value(u"deviceAutomation").toArray().isEmpty()) {
                const QString trackId = t.clip.value(u"trackId").toString();
                for (int ti = 0; ti < tracks.size(); ++ti) {
                    auto tr = tracks.at(ti).toObject();
                    if (tr.value(u"id").toString() == trackId) {
                        tr.insert(QStringLiteral("automation"),
                                  deriveTrackAutomationFromPatterns(tr, QJsonArray{t.clip}, doc));
                        tracks.replace(ti, tr);
                        break;
                    }
                }
            }

            t.clip.remove(QStringLiteral("pattern"));
            t.clip.remove(QStringLiteral("patternPhaseTicks"));
            t.clip.remove(QStringLiteral("patternRowCycles"));
            if (repeatVaries) t.clip.remove(QStringLiteral("loopLengthMs"));
            t.clip.insert(QStringLiteral("inPointMs"), 0.0);
            if (t.clip.contains(u"outPointMs")) {
                t.clip.insert(QStringLiteral("outPointMs"), repeatVaries ? durMs : loopMs.value_or(durMs));
            }
            t.clip.insert(QStringLiteral("notes"), uniqueBakedEventIds(expanded.value(u"notes").toArray()));
            QJsonArray ctrls;
            for (const auto& value : expanded.value(u"controllers").toArray()) {
                auto lane = value.toObject();
                lane.insert("points", uniqueBakedEventIds(lane.value(u"points").toArray()));
                ctrls.append(lane);
            }
            if (!ctrls.isEmpty()) t.clip.insert(QStringLiteral("controllers"), ctrls);
            else t.clip.remove(QStringLiteral("controllers"));

            clips.replace(t.index, t.clip);
            converted.append(clipOut(t.clip));
        }

        doc.insert(QStringLiteral("tracks"), tracks);
        doc.insert(QStringLiteral("clips"), clips);
        return {true, true, doc, QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("clips"), converted}}, {}};
    }

    // ── 8. convert_midi_to_pattern ──────────────────────────────────────────
    if (op == u"convert_midi_to_pattern") {
        const auto idsArr = args.value(u"clipIds").toArray();
        if (idsArr.isEmpty()) return fail(QStringLiteral("convert_midi_to_pattern requires `clipIds`."));
        const double bpm = resolveBpm(doc);

        std::vector<ResolvedClip> targets;
        QString err;
        for (const auto& iv : idsArr) {
            const auto resolved = resolveMidiClip(clips, iv.toString(), &err);
            if (!resolved) return fail(err);
            if (!checkWritable(tracks, resolved->clip, &err)) return fail(err);
            if (resolved->clip.value(u"pattern").isObject()) {
                return fail(QStringLiteral("Clip \"%1\" is already a step sequencer pattern region.")
                                .arg(resolved->clip.value(u"name").toString()));
            }
            targets.push_back(*resolved);
        }

        int totalDropped = 0;
        int totalCollisions = 0;
        QJsonArray conversions;
        QJsonArray clipsOut;
        for (auto& t : targets) {
            const auto inst = findTrackById(tracks, t.clip.value(u"trackId").toString()).value(u"instrument").toObject();
            const std::int64_t windowStartTick = std::max<std::int64_t>(
                0, tickInt64(jsRound(msToTicks(t.clip.value(u"inPointMs").toDouble(0.0), bpm))));
            const double durMs = activeLoopMs(t.clip).value_or(t.clip.value(u"durationMs").toDouble(0.0));
            const std::int64_t clipLengthTicks =
                std::max<std::int64_t>(1, tickInt64(jsRound(msToTicks(durMs, bpm))));

            QJsonObject opts{
                {QStringLiteral("clipLengthTicks"), static_cast<double>(clipLengthTicks)},
                {QStringLiteral("windowStartTick"), static_cast<double>(windowStartTick)},
                {QStringLiteral("seed"), static_cast<double>(seedForClipId(t.clip.value(u"id").toString()))},
                {QStringLiteral("name"), t.clip.value(u"name").toString()},
            };
            if (args.value(u"stepRate").isString()) opts.insert(QStringLiteral("stepRate"), args.value(u"stepRate"));
            if (!inst.isEmpty()) opts.insert(QStringLiteral("instrument"), inst);

            const auto res =
                midiToPattern(t.clip.value(u"notes").toArray(), t.clip.value(u"controllers").toArray(), opts);
            const auto pat = res.value(u"pattern").toObject();
            t.clip.remove(QStringLiteral("notes"));
            t.clip.remove(QStringLiteral("controllers"));
            t.clip.remove(QStringLiteral("patternPhaseTicks"));
            t.clip.insert(QStringLiteral("inPointMs"), 0.0);
            t.clip.insert(QStringLiteral("pattern"), pat);
            clips.replace(t.index, t.clip);

            const int dropped = res.value(u"droppedNotes").toInt();
            const int coll = res.value(u"mergedCollisions").toInt();
            totalDropped += dropped;
            totalCollisions += coll;
            conversions.append(QJsonObject{{QStringLiteral("clipId"), t.clip.value(u"id")},
                                           {QStringLiteral("droppedNotes"), dropped},
                                           {QStringLiteral("collisions"), coll},
                                           {QStringLiteral("stepRate"), pat.value(u"stepRate")},
                                           {QStringLiteral("lengthSteps"), pat.value(u"lengthSteps")},
                                           {QStringLiteral("rowCount"), pat.value(u"rows").toArray().size()}});
            clipsOut.append(clipOut(t.clip));
        }

        doc.insert(QStringLiteral("clips"), clips);
        return {true,
                true,
                doc,
                QJsonObject{{QStringLiteral("ok"), true},
                            {QStringLiteral("droppedNotes"), totalDropped},
                            {QStringLiteral("collisions"), totalCollisions},
                            {QStringLiteral("conversions"), conversions},
                            {QStringLiteral("clips"), clipsOut}},
                {}};
    }

    // ── 9. apply_step_pattern ───────────────────────────────────────────────
    if (op == u"apply_step_pattern") {
        const QString clipIdArg = args.value(u"clipId").toString();
        const QString trackIdArg = args.value(u"trackId").toString();
        if (clipIdArg.isEmpty() && trackIdArg.isEmpty()) {
            return fail(QStringLiteral(
                "apply_step_pattern requires either `clipId` (existing clip) or `trackId` (create a new pattern region)."));
        }
        const QString ref = args.value(u"pattern").toString();
        const auto entryOpt = findFactoryEntry(ref);
        if (!entryOpt) {
            return fail(QStringLiteral("No step pattern or template found matching \"%1\".").arg(ref));
        }
        const auto& entry = *entryOpt;
        QJsonObject loaded = normalizePattern(entry.value(u"pattern").toObject());
        if (args.value(u"useProjectKey").toBool(false)) {
            const auto projKey = doc.value(u"tempo").toObject().value(u"key");
            if (projKey.isObject()) {
                const auto k = resolveStepKey(projKey);
                loaded = setPatternKey(loaded, QJsonObject{{QStringLiteral("tonic"), k.tonic},
                                                           {QStringLiteral("mode"), QString::fromStdString(k.mode)}});
            }
        }

        QString err;
        if (!clipIdArg.isEmpty()) {
            auto resolved = resolveMidiClip(clips, clipIdArg, &err);
            if (!resolved) return fail(err);
            if (!checkWritable(tracks, resolved->clip, &err)) return fail(err);
            if (!resolved->clip.value(u"pattern").isObject() && !resolved->clip.value(u"notes").toArray().isEmpty()) {
                return fail(QStringLiteral(
                                "Clip \"%1\" already holds MIDI notes. Convert it with convert_midi_to_pattern or pass "
                                "trackId to create a new pattern region.")
                                .arg(resolved->clip.value(u"name").toString()));
            }
            const auto existingPat = resolved->clip.value(u"pattern").toObject();
            const double seed = existingPat.value(u"seed").isDouble()
                                    ? existingPat.value(u"seed").toDouble()
                                    : static_cast<double>(seedForClipId(resolved->clip.value(u"id").toString()));
            loaded.insert(QStringLiteral("seed"), seed);
            resolved->clip.remove(QStringLiteral("notes"));
            resolved->clip.remove(QStringLiteral("controllers"));
            resolved->clip.insert(QStringLiteral("pattern"), loaded);
            clips.replace(resolved->index, resolved->clip);
            doc.insert(QStringLiteral("clips"), clips);
            const auto inst =
                findTrackById(tracks, resolved->clip.value(u"trackId").toString()).value(u"instrument").toObject();
            return {true,
                    true,
                    doc,
                    QJsonObject{{QStringLiteral("ok"), true},
                                {QStringLiteral("clip"), clipOut(resolved->clip)},
                                {QStringLiteral("appliedPattern"), entry.value(u"name")},
                                {QStringLiteral("source"), QStringLiteral("factory")},
                                {QStringLiteral("text"), patternToText(loaded, inst)}},
                    {}};
        }

        const auto trackRes = resolveMidiTrack(tracks, trackIdArg, &err);
        if (!trackRes) return fail(err);
        if (trackRes->track.value(u"locked").toBool(false)) {
            return fail(QStringLiteral("Track \"%1\" is locked.").arg(trackRes->track.value(u"name").toString()));
        }
        const QString trackId = trackRes->track.value(u"id").toString();
        if (args.contains(u"atBar") && args.contains(u"atMs")) return fail(QStringLiteral("Use atBar or atMs, never both."));
        if (args.contains(u"atBar") && (!args.value(u"atBar").isDouble() || args.value(u"atBar").toDouble() < 1 ||
            std::floor(args.value(u"atBar").toDouble()) != args.value(u"atBar").toDouble())) return fail(QStringLiteral("atBar must be a positive integer."));
        const double startMs = args.value(u"atBar").isDouble()
            ? resolveOffsetMs(doc) + (args.value(u"atBar").toDouble() - 1) * barDurationMs(doc)
            : (args.value(u"atMs").isDouble() ? std::max(0.0, args.value(u"atMs").toDouble()) : trackEndMs(clips, trackId));
        static constexpr std::array presetChunks
#include "midi/StepInstrumentPresets.inc"
            ;
        QByteArray presetJson;
        for (const auto chunk : presetChunks) presetJson.append(chunk.data(), static_cast<qsizetype>(chunk.size()));
        const auto instrumentLibrary = QJsonDocument::fromJson(presetJson).object();
        const auto oldInstrument = trackRes->track.value(u"instrument");
        const bool emptyTrack = std::ranges::none_of(clips, [&](const QJsonValue& value) {
            return value.toObject().value(u"trackId").toString() == trackId;
        });
        bool instrumentApplied = false;
        QJsonObject appliedTrack = trackRes->track;
        if (emptyTrack && (oldInstrument.isUndefined() || oldInstrument == instrumentLibrary.value(u"defaultInstrument"))) {
            for (const auto& value : instrumentLibrary.value(u"presets").toArray()) {
                const auto preset = value.toObject();
                if (preset.value(u"id") != entry.value(u"instrumentPreset")) continue;
                appliedTrack.insert("instrument", preset.value(u"instrument"));
                tracks.replace(trackRes->index, appliedTrack);
                doc.insert("tracks", tracks);
                instrumentApplied = true;
                break;
            }
        }
        const double bars = args.value(u"bars").isDouble() ? std::max(0.25, args.value(u"bars").toDouble()) : 1.0;
        const double durationMs = std::max(1.0, jsRound(bars * barDurationMs(doc)));
        const QString newClipId = QUuid::createUuid().toString(QUuid::Id128);
        loaded.insert(QStringLiteral("seed"), static_cast<double>(seedForClipId(newClipId)));

        const QJsonObject newClip{
            {QStringLiteral("id"), newClipId},
            {QStringLiteral("trackId"), trackId},
            {QStringLiteral("name"), entry.value(u"name").toString()},
            {QStringLiteral("startMs"), startMs},
            {QStringLiteral("durationMs"), durationMs},
            {QStringLiteral("inPointMs"), 0.0},
            {QStringLiteral("outPointMs"), durationMs},
            {QStringLiteral("mediaType"), QStringLiteral("midi")},
            {QStringLiteral("sourceType"), QStringLiteral("imported")},
            {QStringLiteral("status"), QStringLiteral("generated")},
            {QStringLiteral("locked"), false},
            {QStringLiteral("pattern"), loaded},
        };
        clips.append(newClip);
        doc.insert(QStringLiteral("clips"), clips);
        if (startMs + durationMs > doc.value(u"durationMs").toDouble(0.0)) {
            doc.insert(QStringLiteral("durationMs"), startMs + durationMs);
        }
        QJsonObject response{{QStringLiteral("ok"), true},
                             {QStringLiteral("clip"), clipOut(newClip)},
                             {QStringLiteral("appliedPattern"), entry.value(u"name")},
                             {QStringLiteral("source"), QStringLiteral("factory")},
                             {QStringLiteral("text"), patternToText(loaded, appliedTrack.value(u"instrument").toObject())}};
        if (instrumentApplied) {
            response.insert("instrumentApplied", true);
            response.insert("instrumentPreset", entry.value(u"instrumentPreset"));
            response.insert("track", appliedTrack);
        }
        return {true, true, doc, response, {}};
    }

    // ── list_step_patterns (SQ43, SQ54). Native sessions hold factory entries only. ──
    if (op == u"list_step_patterns") {
        const QString q = args.value(u"query").toString().trimmed().toLower();
        const QString kind = args.value(u"kind").toString();
        const QString cat = args.value(u"category").toString().trimmed().toLower();
        // A folder filter selects user entries only (TS lists no factory entry then).
        const bool folderFilter = !args.value(u"folder").toString().trimmed().isEmpty();
        QJsonArray entries;
        for (const auto& ev : folderFilter ? QJsonArray{} : factoryStepPatternLibrary()) {
            const auto e = ev.toObject();
            const QString eKind = e.value(u"kind").toString(QStringLiteral("pattern"));
            if (!kind.isEmpty() && eKind != kind) continue;
            if (!cat.isEmpty() && e.value(u"category").toString().toLower() != cat) continue;
            if (!q.isEmpty()) {
                QStringList hay{e.value(u"id").toString(), e.value(u"name").toString(), e.value(u"category").toString()};
                for (const auto& t : e.value(u"tags").toArray()) hay.append(t.toString());
                if (!hay.join(u' ').toLower().contains(q)) continue;
            }
            QJsonObject item{{QStringLiteral("id"), e.value(u"id")}, {QStringLiteral("name"), e.value(u"name")},
                             {QStringLiteral("kind"), eKind}, {QStringLiteral("category"), e.value(u"category")},
                             {QStringLiteral("tags"), e.value(u"tags")}, {QStringLiteral("source"), QStringLiteral("factory")}};
            if (e.value(u"instrumentPreset").isString()) item.insert(QStringLiteral("instrumentPreset"), e.value(u"instrumentPreset"));
            entries.append(item);
        }
        const auto folderArg = cleanFolder(args.value(u"folder").toString());
        for (const auto& f : userPatternFiles()) {
            const auto& e = f.entry;
            const QString eKind = e.value(u"kind").toString(QStringLiteral("pattern"));
            if (!kind.isEmpty() && eKind != kind) continue;
            if (!cat.isEmpty() && e.value(u"category").toString().toLower() != cat) continue;
            if (folderFilter && (!folderArg || f.folder.compare(*folderArg, Qt::CaseInsensitive) != 0)) continue;
            if (!q.isEmpty()) {
                QStringList hay{e.value(u"id").toString(), e.value(u"name").toString(), e.value(u"category").toString(), f.folder};
                if (!hay.join(u' ').toLower().contains(q)) continue;
            }
            entries.append(QJsonObject{{QStringLiteral("id"), e.value(u"id")}, {QStringLiteral("name"), e.value(u"name")},
                                       {QStringLiteral("kind"), eKind}, {QStringLiteral("category"), e.value(u"category")},
                                       {QStringLiteral("tags"), e.value(u"tags")}, {QStringLiteral("source"), QStringLiteral("user")},
                                       {QStringLiteral("folder"), f.folder}});
        }
        QJsonArray folders;
        for (const QString& k : {QStringLiteral("pattern"), QStringLiteral("template")}) {
            if (!kind.isEmpty() && k != kind) continue;
            for (const auto& name : userPatternFolders(k)) {
                if (!folders.contains(QJsonValue(name))) folders.append(name);
            }
        }
        return {true, false, document,
                QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("entries"), entries}, {QStringLiteral("folders"), folders}}, {}};
    }

    // ── Library folders and moves (SQ43, SQ44). Without a library root they fail like TS. ──
    if (op == u"create_step_pattern_folder" || op == u"rename_step_pattern_folder" || op == u"delete_step_pattern_folder") {
        if (userLibraryRoot().isEmpty()) return fail(QStringLiteral("This session's step pattern library does not support folder operations."));
        const QString kind = args.value(u"kind").toString(QStringLiteral("pattern"));
        const QDir base(kindRootDir(kind));
        if (op == u"create_step_pattern_folder") {
            const auto parent = cleanFolder(args.value(u"parentFolder").toString());
            const auto name = cleanFolder(args.value(u"name").toString());
            if (!parent || !name || name->isEmpty() || name->contains(u'/')) return fail(QStringLiteral("Folder name must be one plain name."));
            const auto rel = parent->isEmpty() ? *name : *parent + u'/' + *name;
            if (!containedPath(base.filePath(rel))) return fail(QStringLiteral("folder must stay inside the library."));
            if (QFileInfo::exists(base.filePath(rel))) return fail(QStringLiteral("Folder \"%1\" already exists.").arg(rel));
            if (!QDir().mkpath(base.filePath(rel))) return fail(QStringLiteral("Could not create folder \"%1\".").arg(rel));
            return {true, false, document, QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("folder"), rel}}, {}};
        }
        const auto folder = cleanFolder(args.value(u"folder").toString());
        if (!folder || folder->isEmpty() || !containedPath(base.filePath(*folder)) || !QFileInfo(base.filePath(*folder)).isDir()) {
            return fail(QStringLiteral("No %1 folder \"%2\".").arg(kind, args.value(u"folder").toString()));
        }
        if (op == u"rename_step_pattern_folder") {
            const auto name = cleanFolder(args.value(u"newName").toString());
            if (!name || name->isEmpty() || name->contains(u'/')) return fail(QStringLiteral("newName must be one plain name."));
            const auto parent = QFileInfo(*folder).path();
            const auto rel = parent == u"." ? *name : parent + u'/' + *name;
            if (!containedPath(base.filePath(rel))) return fail(QStringLiteral("folder must stay inside the library."));
            if (QFileInfo::exists(base.filePath(rel)) && !sameFile(base.filePath(*folder), base.filePath(rel))) return fail(QStringLiteral("Folder \"%1\" already exists.").arg(rel));
            if (!QDir().rename(base.filePath(*folder), base.filePath(rel))) return fail(QStringLiteral("Could not rename folder \"%1\".").arg(*folder));
            return {true, false, document, QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("folder"), rel}}, {}};
        }
        if (!QDir(base.filePath(*folder)).isEmpty(QDir::AllEntries | QDir::Hidden | QDir::System | QDir::NoDotAndDotDot)) return fail(QStringLiteral("Folder \"%1\" is not empty. Move or delete its patterns first.").arg(*folder));
        if (!base.rmdir(*folder)) return fail(QStringLiteral("Could not delete folder \"%1\".").arg(*folder));
        return {true, false, document, QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("deleted"), *folder}}, {}};
    }
    if (op == u"move_step_pattern") {
        if (userLibraryRoot().isEmpty()) return fail(QStringLiteral("This session's step pattern library does not support moving patterns between folders."));
        const auto found = findUserPattern(args.value(u"pattern").toString());
        if (!found) return fail(QStringLiteral("No saved step pattern \"%1\".").arg(args.value(u"pattern").toString()));
        const auto folder = cleanFolder(args.value(u"folder").toString());
        if (!folder) return fail(QStringLiteral("folder must stay inside the library."));
        const QString kind = found->entry.value(u"kind").toString(QStringLiteral("pattern"));
        const auto target = QDir(QDir(kindRootDir(kind)).filePath(*folder)).filePath(QFileInfo(found->path).fileName());
        if (!containedPath(target)) return fail(QStringLiteral("folder must stay inside the library."));
        if (target != found->path && !sameFile(target, found->path)) {
            if (QFileInfo::exists(target)) return fail(QStringLiteral("Folder \"%1\" already holds a pattern with that name.").arg(*folder));
            if (!QDir().mkpath(QFileInfo(target).path()) || !QFile::rename(found->path, target)) return fail(QStringLiteral("Could not move the pattern."));
        }
        return {true, false, document,
                QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("id"), found->entry.value(u"id")}, {QStringLiteral("folder"), *folder}}, {}};
    }

    // ── learn_pattern_row (SQ38): add a row for an unknown sound, or reassign one ──
    if (op == u"learn_pattern_row") {
        int idx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), idx, clip, pattern, instrument, &err)) return fail(err);
        if (!checkWritable(tracks, clip, &err)) return fail(err);
        const bool assign = args.value(u"mode").toString() == u"assign";
        if (assign && !args.contains(u"row")) return fail(QStringLiteral("row is required for mode assign."));
        QJsonObject assignment;
        const auto rows = pattern.value(u"rows").toArray();
        std::optional<QJsonObject> known;
        if (args.contains(u"pitch")) {
            const int pitch = args.value(u"pitch").toInt();
            const QJsonObject pitchCtx{{QStringLiteral("instrument"), instrument}, {QStringLiteral("pattern"), pattern},
                                      {QStringLiteral("key"), document.value(u"key")}, {QStringLiteral("chords"), document.value(u"chords")}};
            const QJsonObject on{{QStringLiteral("on"), true}};
            int storedPitch = pitch;
            if (pattern.value(u"pitchSource").toString() == u"key" && !pattern.value(u"noTranspose").toBool(false)) {
                const auto patternKey = resolveStepKey(pattern.value(u"key"));
                const auto projectKey = resolveStepKey(document.value(u"key").isNull() || document.value(u"key").isUndefined()
                                                           ? pattern.value(u"key") : document.value(u"key"));
                storedPitch = std::clamp(pitch - shortestTonicDelta(patternKey.tonic, projectKey.tonic), 0, 127);
            }
            assignment = QJsonObject{{QStringLiteral("type"), QStringLiteral("note")}, {QStringLiteral("pitch"), storedPitch}};
            // A kit track learns the pad that plays this pitch.
            if (instrument.value(u"type").toString() == u"drum") {
                for (int pad = 0; pad < instrument.value(u"pads").toArray().size(); ++pad) {
                    const QJsonObject kit{{QStringLiteral("type"), QStringLiteral("kit")}, {QStringLiteral("pad"), pad}};
                    if (const auto p = stepPitch(QJsonObject{{QStringLiteral("assignment"), kit}}, on, pitchCtx); p && *p == pitch) {
                        assignment = kit;
                        break;
                    }
                }
            }
            for (const auto& rv : rows) {
                const auto r = rv.toObject();
                if (r.value(u"assignment").toObject().value(u"type").toString() == u"automation") continue;
                if (const auto p = stepPitch(r, on, pitchCtx); p && *p == pitch) {
                    known = r;
                    break;
                }
            }
        } else if (args.value(u"controller").isObject()) {
            const auto target = args.value(u"controller").toObject();
            const auto kind = target.value(u"kind").toString();
            if (kind == u"cc") {
                if (!isWholeIn(target.value(u"cc"), 0, 127)) return fail(QStringLiteral("controller.cc must be an integer 0..127."));
            } else if (kind != u"pitchBend" && kind != u"channelPressure") {
                return fail(QStringLiteral("controller.kind must be cc, pitchBend or channelPressure."));
            }
            const QJsonObject cleanTarget = kind == u"cc" ? QJsonObject{{QStringLiteral("kind"), kind}, {QStringLiteral("cc"), target.value(u"cc").toInt()}}
                                                          : QJsonObject{{QStringLiteral("kind"), kind}};
            assignment = QJsonObject{{QStringLiteral("type"), QStringLiteral("automation")}, {QStringLiteral("target"), cleanTarget}};
            for (const auto& rv : rows) {
                if (rv.toObject().value(u"assignment").toObject() == assignment) {
                    known = rv.toObject();
                    break;
                }
            }
        } else {
            return fail(QStringLiteral("pitch or controller is required."));
        }
        const QString clipId = clip.value(u"id").toString();
        if (assign) {
            auto out = runStepPatternOp(document, QStringLiteral("set_pattern_row"),
                                        QJsonObject{{QStringLiteral("clipId"), clipId}, {QStringLiteral("row"), args.value(u"row")}, {QStringLiteral("assignment"), assignment}});
            if (out.ok) out.result.insert(QStringLiteral("added"), false);
            return out;
        }
        if (known) {
            return {true, false, document,
                    QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("clipId"), clipId}, {QStringLiteral("added"), false},
                                {QStringLiteral("row"), serializePatternRow(*known, instrument)}},
                    {}};
        }
        QSet<QString> before;
        for (const auto& rv : rows) before.insert(rv.toObject().value(u"id").toString());
        auto out = runStepPatternOp(document, QStringLiteral("add_pattern_rows"),
                                    QJsonObject{{QStringLiteral("clipId"), clipId}, {QStringLiteral("rows"), QJsonArray{QJsonObject{{QStringLiteral("assignment"), assignment}}}}});
        if (!out.ok) return out;
        for (const auto& cv : out.nextDocument.value(u"clips").toArray()) {
            if (cv.toObject().value(u"id").toString() != clipId) continue;
            for (const auto& rv : cv.toObject().value(u"pattern").toObject().value(u"rows").toArray()) {
                if (!before.contains(rv.toObject().value(u"id").toString())) {
                    out.result = QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("clipId"), clipId}, {QStringLiteral("added"), true},
                                             {QStringLiteral("row"), serializePatternRow(rv.toObject(), instrument)}};
                }
            }
        }
        return out;
    }

    // ── step_record (SQ40): one chord at one step, missing rows added as in Learn ──
    if (op == u"step_record") {
        int idx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), idx, clip, pattern, instrument, &err)) return fail(err);
        if (!checkWritable(tracks, clip, &err)) return fail(err);
        const QString clipId = clip.value(u"id").toString();
        const int step = args.value(u"step").toInt();
        const int length = pattern.value(u"lengthSteps").toInt(16);
        if (step > length) return fail(QStringLiteral("step %1 is past the pattern length %2.").arg(step).arg(length));
        QJsonObject values{{QStringLiteral("on"), true}};
        if (args.contains(u"velocity")) values.insert(QStringLiteral("velocity"), args.value(u"velocity").toInt());
        QJsonObject current = document;
        QJsonArray rowIds;
        for (const auto& pv : args.value(u"pitches").toArray()) {
            const auto learned = runStepPatternOp(current, QStringLiteral("learn_pattern_row"),
                                                  QJsonObject{{QStringLiteral("clipId"), clipId}, {QStringLiteral("pitch"), pv.toInt()}});
            if (!learned.ok) return learned;
            if (learned.mutated) current = learned.nextDocument;
            const auto learnedRow = learned.result.value(u"row").toObject();
            const auto rowId = learnedRow.value(u"id").toString();
            const int rowLength = learnedRow.value(u"lengthSteps").toInt(length);
            const int rowStep = (step - 1) % rowLength + 1;
            const auto set = runStepPatternOp(current, QStringLiteral("set_steps"),
                                              QJsonObject{{QStringLiteral("clipId"), clipId}, {QStringLiteral("row"), rowId},
                                                          {QStringLiteral("steps"), QJsonArray{rowStep}}, {QStringLiteral("values"), values}});
            if (!set.ok) return set;
            current = set.nextDocument;
            rowIds.append(rowId);
        }
        return {true, true, current,
                QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("clipId"), clipId}, {QStringLiteral("rows"), rowIds},
                            {QStringLiteral("nextStep"), step % length + 1}},
                {}};
    }

    const auto commitClip = [&](int index, QJsonObject clip, const QJsonObject& pattern) {
        clip.insert(QStringLiteral("pattern"), pattern);
        clips.replace(index, clip);
        doc.insert(QStringLiteral("clips"), clips);
    };
    const auto startMsFor = [&](const QString& trackId, QString* error) -> std::optional<double> {
        if (args.contains(u"atBar") && args.contains(u"atMs")) {
            *error = QStringLiteral("Use atBar or atMs, never both.");
            return std::nullopt;
        }
        if (args.contains(u"beat") && !args.contains(u"atBar")) {
            *error = QStringLiteral("beat needs atBar.");
            return std::nullopt;
        }
        if (args.value(u"atBar").isDouble()) {
            const auto ts = doc.value(u"tempo").toObject().value(u"timeSignature").toObject();
            const double beatUnit = ts.value(u"beatUnit").toDouble(4.0);
            const double beatMs = (60000.0 / resolveBpm(doc)) * (4.0 / (beatUnit > 0.0 ? beatUnit : 4.0));
            return resolveOffsetMs(doc) + (args.value(u"atBar").toDouble() - 1) * barDurationMs(doc) +
                   (args.value(u"beat").toDouble(1) - 1) * beatMs;
        }
        if (args.value(u"atMs").isDouble()) return args.value(u"atMs").toDouble();
        return trackEndMs(clips, trackId);
    };

    // ── create_pattern_region (SQ1, SQ49) ───────────────────────────────────
    if (op == u"create_pattern_region") {
        QString err;
        const auto trackRes = resolveMidiTrack(tracks, args.value(u"trackId").toString(), &err);
        if (!trackRes) return fail(err);
        const auto track = trackRes->track;
        if (track.value(u"locked").toBool(false)) return fail(QStringLiteral("Track \"%1\" is locked.").arg(track.value(u"name").toString()));
        const auto startMs = startMsFor(track.value(u"id").toString(), &err);
        if (!startMs) return fail(err);
        const double durationMs = std::max(1.0, jsRound(args.value(u"bars").toDouble(1.0) * barDurationMs(doc)));
        const QString clipId = QUuid::createUuid().toString(QUuid::Id128);
        const double seed = static_cast<double>(seedForClipId(clipId));
        const auto instrument = track.value(u"instrument").toObject();
        const QString name = args.value(u"name").toString();
        const auto withSeed = [&](QJsonObject p) {
            p.insert(QStringLiteral("seed"), seed);
            return normalizePattern(p);
        };
        const auto defaultPattern = [&] {
            return withSeed(QJsonObject{{QStringLiteral("name"), name.isEmpty() ? QStringLiteral("Pattern") : name},
                                        {QStringLiteral("rows"), defaultRowsForTrack(track)}});
        };
        QJsonObject pattern;
        if (args.contains(u"template")) {
            if (args.value(u"template").toString().trimmed().toLower() == u"track default") {
                pattern = track.value(u"stepTemplate").isObject() ? withSeed(track.value(u"stepTemplate").toObject()) : defaultPattern();
            } else {
                const auto entry = findFactoryEntry(args.value(u"template").toString());
                if (!entry) return fail(QStringLiteral("No step pattern or template found matching \"%1\".").arg(args.value(u"template").toString()));
                pattern = withSeed(entry->value(u"pattern").toObject());
            }
            if (args.contains(u"text")) {
                pattern = applyPatternTextToPattern(pattern, args.value(u"text").toString(), QStringLiteral("merge"), instrument, &err);
                if (!err.isEmpty()) return fail(err);
            }
        } else if (args.contains(u"text")) {
            pattern = patternFromText(args.value(u"text").toString(),
                                      QJsonObject{{QStringLiteral("name"), name.isEmpty() ? QStringLiteral("Pattern") : name},
                                                  {QStringLiteral("seed"), seed}, {QStringLiteral("instrument"), instrument}},
                                      &err);
            if (!err.isEmpty()) return fail(err);
        } else if (track.value(u"stepTemplate").isObject()) {
            auto tpl = track.value(u"stepTemplate").toObject();
            if (!name.isEmpty()) tpl.insert(QStringLiteral("name"), name);
            pattern = withSeed(tpl);
        } else {
            pattern = defaultPattern();
        }
        if (!name.isEmpty()) pattern.insert(QStringLiteral("name"), name);
        const QJsonObject clip{
            {QStringLiteral("id"), clipId}, {QStringLiteral("trackId"), track.value(u"id")},
            {QStringLiteral("name"), name.isEmpty() ? pattern.value(u"name").toString() : name},
            {QStringLiteral("startMs"), *startMs}, {QStringLiteral("durationMs"), durationMs},
            {QStringLiteral("inPointMs"), 0.0}, {QStringLiteral("outPointMs"), durationMs},
            {QStringLiteral("mediaType"), QStringLiteral("midi")}, {QStringLiteral("sourceType"), QStringLiteral("imported")},
            {QStringLiteral("status"), QStringLiteral("generated")}, {QStringLiteral("locked"), false},
            {QStringLiteral("pattern"), pattern}};
        clips.append(clip);
        doc.insert(QStringLiteral("clips"), clips);
        if (*startMs + durationMs > doc.value(u"durationMs").toDouble(0.0)) doc.insert(QStringLiteral("durationMs"), *startMs + durationMs);
        return {true, true, doc,
                QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("clip"), clipOut(clip)},
                            {QStringLiteral("pattern"), patternSummary(pattern)}, {QStringLiteral("text"), patternToText(pattern, instrument)}},
                {}};
    }

    // ── separate_pattern_rows (SQ22, SQ49) ──────────────────────────────────
    if (op == u"separate_pattern_rows") {
        int clipIdx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), clipIdx, clip, pattern, instrument, &err)) return fail(err);
        if (!checkWritable(tracks, clip, &err)) return fail(err);
        const auto rows = pattern.value(u"rows").toArray();
        if (rows.isEmpty()) return fail(QStringLiteral("Pattern \"%1\" has no rows to separate.").arg(clip.value(u"name").toString()));
        int srcIdx = -1;
        for (int i = 0; i < tracks.size(); ++i) {
            if (tracks.at(i).toObject().value(u"id") == clip.value(u"trackId")) srcIdx = i;
        }
        if (srcIdx < 0) return fail(QStringLiteral("Source track \"%1\" not found.").arg(clip.value(u"trackId").toString()));
        const auto srcTrack = tracks.at(srcIdx).toObject();
        const bool anySolo = std::ranges::any_of(rows, [](const QJsonValue& r) { return r.toObject().value(u"solo").toBool(false); });
        QJsonArray newTracks, newClips, tracksOut, clipsOut;
        for (const auto& rv : rows) {
            const auto row = rv.toObject();
            const QString name = rowLabel(row, instrument);
            const QString trackId = QUuid::createUuid().toString(QUuid::Id128);
            QJsonObject track{{QStringLiteral("id"), trackId}, {QStringLiteral("type"), QStringLiteral("midi")},
                              {QStringLiteral("name"), name}, {QStringLiteral("index"), 0},
                              {QStringLiteral("visible"), true}, {QStringLiteral("locked"), false}};
            for (const char* field : {"instrument", "volumeDb", "pan", "effects", "folderId", "musicRole"}) {
                if (srcTrack.contains(QLatin1String(field))) track.insert(QLatin1String(field), srcTrack.value(QLatin1String(field)));
            }
            auto cloned = row;
            if (anySolo) {
                cloned.insert(QStringLiteral("mute"), !row.value(u"solo").toBool(false));
                cloned.insert(QStringLiteral("solo"), false);
            }
            auto oneRow = pattern;
            oneRow.insert(QStringLiteral("name"), name);
            oneRow.insert(QStringLiteral("rows"), QJsonArray{cloned});
            QJsonObject newClip{{QStringLiteral("id"), QUuid::createUuid().toString(QUuid::Id128)}, {QStringLiteral("trackId"), trackId},
                                {QStringLiteral("name"), name}, {QStringLiteral("pattern"), oneRow}};
            for (const char* field : {"startMs", "durationMs", "inPointMs", "outPointMs", "mediaType", "sourceType", "status", "loopLengthMs",
                                      "transpose", "velocityOffset", "quantize", "harmony", "patternPhaseTicks"}) {
                if (clip.contains(QLatin1String(field))) newClip.insert(QLatin1String(field), clip.value(QLatin1String(field)));
            }
            newClip.insert(QStringLiteral("locked"), false);
            const auto cycles = clip.value(u"patternRowCycles").toObject().value(row.value(u"id").toString());
            if (cycles.isObject()) newClip.insert(QStringLiteral("patternRowCycles"), QJsonObject{{row.value(u"id").toString(), cycles}});
            newTracks.append(track);
            newClips.append(newClip);
        }
        QJsonArray nextTracks;
        for (int i = 0; i < tracks.size(); ++i) {
            nextTracks.append(tracks.at(i));
            if (i == srcIdx) {
                for (const auto& t : newTracks) nextTracks.append(t);
            }
        }
        for (int i = 0; i < nextTracks.size(); ++i) {
            auto t = nextTracks.at(i).toObject();
            t.insert(QStringLiteral("index"), i);
            nextTracks.replace(i, t);
            if (std::ranges::any_of(newTracks, [&](const QJsonValue& n) { return n.toObject().value(u"id") == t.value(u"id"); })) tracksOut.append(trackOut(t));
        }
        clips.removeAt(clipIdx);
        for (const auto& c : newClips) {
            clips.append(c);
            clipsOut.append(clipOut(c.toObject()));
        }
        doc.insert(QStringLiteral("tracks"), nextTracks);
        doc.insert(QStringLiteral("clips"), clips);
        return {true, true, doc,
                QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("removedClipId"), clip.value(u"id")},
                            {QStringLiteral("tracks"), tracksOut}, {QStringLiteral("clips"), clipsOut}},
                {}};
    }

    // ── set_track_step_template (SQ45, SQ54) ────────────────────────────────
    if (op == u"set_track_step_template") {
        QString err;
        const auto trackRes = resolveMidiTrack(tracks, args.value(u"trackId").toString(), &err);
        if (!trackRes) return fail(err);
        auto track = trackRes->track;
        if (track.value(u"locked").toBool(false)) return fail(QStringLiteral("Track \"%1\" is locked.").arg(track.value(u"name").toString()));
        QJsonObject response{{QStringLiteral("ok"), true}};
        if (args.value(u"clear").toBool(false)) {
            track.remove(QStringLiteral("stepTemplate"));
            response.insert(QStringLiteral("cleared"), true);
        } else {
            if (!args.contains(u"fromClipId")) return fail(QStringLiteral("set_track_step_template requires `fromClipId` or `clear: true`."));
            int idx = -1;
            QJsonObject clip, pattern, instrument;
            if (!resolvePatClip(args.value(u"fromClipId").toString(), idx, clip, pattern, instrument, &err)) return fail(err);
            const auto tpl = stripPatternSteps(pattern);
            track.insert(QStringLiteral("stepTemplate"), tpl);
            response.insert(QStringLiteral("rowCount"), tpl.value(u"rows").toArray().size());
        }
        tracks.replace(trackRes->index, track);
        doc.insert(QStringLiteral("tracks"), tracks);
        response.insert(QStringLiteral("track"), trackOut(track));
        return {true, true, doc, response, {}};
    }

    // ── save_step_pattern (SQ44, SQ54): without a library the result carries the pattern ──
    if (op == u"save_step_pattern") {
        int idx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), idx, clip, pattern, instrument, &err)) return fail(err);
        const QString kind = args.value(u"kind").toString();
        const QString name = args.value(u"name").toString().trimmed();
        auto saved = kind == u"template" ? stripPatternSteps(pattern) : pattern;
        saved.insert(QStringLiteral("name"), name);
        saved = normalizePattern(saved);
        QString slug = name.toLower();
        slug.replace(QRegularExpression(QStringLiteral("[^a-z0-9]+")), QStringLiteral("-"));
        slug.remove(QRegularExpression(QStringLiteral("^-|-$")));
        QJsonObject result{{QStringLiteral("ok"), true},
                           {QStringLiteral("id"), QStringLiteral("user:%1:%2").arg(kind, slug.isEmpty() ? QStringLiteral("pattern") : slug)},
                           {QStringLiteral("name"), name}, {QStringLiteral("kind"), kind},
                           {QStringLiteral("folder"), stepPatternFolderPath(kind, args.value(u"folder").toString())},
                           {QStringLiteral("contentType"), QStringLiteral("application/x-nodetool-step-pattern+json")},
                           {QStringLiteral("clipId"), clip.value(u"id")}, {QStringLiteral("pattern"), saved}};
        if (!instrument.isEmpty()) result.insert(QStringLiteral("instrument"), instrument);
        if (!userLibraryRoot().isEmpty()) {
            const auto folder = cleanFolder(args.value(u"folder").toString());
            if (!folder) return fail(QStringLiteral("folder must stay inside the library."));
            const auto baseSlug = result.value(u"id").toString().section(u':', 2);
            auto uniqueSlug = baseSlug;
            QSet<QString> savedIds;
            for (const auto& file : userPatternFiles()) savedIds.insert(file.entry.value(u"id").toString());
            int suffix = 2;
            while (savedIds.contains(QStringLiteral("user:%1:%2").arg(kind, uniqueSlug)) ||
                   QFileInfo::exists(QDir(QDir(kindRootDir(kind)).filePath(*folder)).filePath(uniqueSlug + QStringLiteral(".json")))) {
                uniqueSlug = baseSlug + u'-' + QString::number(suffix++);
            }
            const auto id = QStringLiteral("user:%1:%2").arg(kind, uniqueSlug);
            result.insert(QStringLiteral("id"), id);

            QJsonObject entry{{QStringLiteral("id"), id}, {QStringLiteral("name"), name}, {QStringLiteral("kind"), kind},
                              {QStringLiteral("category"), QStringLiteral("User")}, {QStringLiteral("tags"), QJsonArray{}},
                              {QStringLiteral("pattern"), saved}};
            const auto path = QDir(QDir(kindRootDir(kind)).filePath(*folder)).filePath(id.section(u':', 2) + QStringLiteral(".json"));
            if (!containedPath(path)) return fail(QStringLiteral("folder must stay inside the library."));
            if (!writeJsonFile(path, entry)) return fail(QStringLiteral("Could not save the step pattern."));
            result.insert(QStringLiteral("saved"), true);
        }
        return {true, false, document, result, {}};
    }

    // ── copy_pattern_row (SQ35, SQ51) and copy_steps (SQ35, SQ52) ───────────
    if (op == u"copy_pattern_row" || op == u"copy_steps") {
        int srcIdx = -1, dstIdx = -1;
        QJsonObject srcClip, srcPattern, srcInst, dstClip, dstPattern, dstInst;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), srcIdx, srcClip, srcPattern, srcInst, &err)) return fail(err);
        if (args.contains(u"toClipId")) {
            if (!resolvePatClip(args.value(u"toClipId").toString(), dstIdx, dstClip, dstPattern, dstInst, &err)) return fail(err);
        } else {
            dstIdx = srcIdx; dstClip = srcClip; dstPattern = srcPattern; dstInst = srcInst;
        }
        const bool sameClip = dstIdx == srcIdx;
        if (!checkWritable(tracks, dstClip, &err)) return fail(err);
        const auto src = resolveRow(srcPattern, args.value(u"row").toString(), srcInst, &err);
        if (!src) return fail(err);
        const int dstLen = dstPattern.value(u"lengthSteps").toInt(16);
        auto dstRows = dstPattern.value(u"rows").toArray();
        if (op == u"copy_pattern_row") {
            const auto srcRow = src->row;
            const int srcRowLen = srcRow.value(u"lengthSteps").toInt(16);
            if (args.contains(u"toRow") && !args.value(u"asNew").toBool(false) && !args.value(u"nextAssignment").toBool(false)) {
                const auto dst = resolveRow(dstPattern, args.value(u"toRow").toString(), dstInst, &err);
                if (!dst) return fail(err);
                const auto dstRow = dst->row;
                if (isNoteRow(srcRow) != isNoteRow(dstRow)) {
                    return fail(QStringLiteral("Cannot copy %1 row \"%2\" onto %3 row \"%4\": row types must match (note vs automation).")
                                    .arg(srcRow.value(u"assignment").toObject().value(u"type").toString(), rowLabel(srcRow, srcInst),
                                         dstRow.value(u"assignment").toObject().value(u"type").toString(), rowLabel(dstRow, dstInst)));
                }
                QJsonObject updated;
                if (args.value(u"settingsOnly").toBool(false)) {
                    const int targetLen = std::min(srcRowLen, dstLen);
                    const int loopEnd = std::min(srcRow.value(u"loopEnd").toInt(srcRowLen), targetLen);
                    const int loopStart = std::min(srcRow.value(u"loopStart").toInt(0), loopEnd - 1);
                    updated = resizeRowLength(dstRow, targetLen);
                    for (const char* field : {"stepRate", "playback", "mute", "solo", "midiChannel", "automationMode", "subrows"}) {
                        if (srcRow.contains(QLatin1String(field))) updated.insert(QLatin1String(field), srcRow.value(QLatin1String(field)));
                        else updated.remove(QLatin1String(field));
                    }
                    updated.insert(QStringLiteral("loopStart"), loopStart);
                    updated.insert(QStringLiteral("loopEnd"), loopEnd);
                } else {
                    updated = srcRowLen > dstLen ? resizeRowLength(srcRow, dstLen) : srcRow;
                    const bool melodicOffsets = std::ranges::any_of(updated.value(u"steps").toArray(), [](const QJsonValue& s) {
                        return s.toObject().contains(u"note") || s.toObject().contains(u"octave");
                    });
                    const auto dstAssign = dstRow.value(u"assignment").toObject();
                    const QString srcType = srcRow.value(u"assignment").toObject().value(u"type").toString();
                    updated.insert(QStringLiteral("assignment"),
                                   dstAssign.value(u"type").toString() == u"note" && (srcType == u"melodic" || melodicOffsets)
                                       ? QJsonObject{{QStringLiteral("type"), QStringLiteral("melodic")}, {QStringLiteral("pitch"), dstAssign.value(u"pitch")}}
                                       : dstAssign);
                    updated.insert(QStringLiteral("id"), dstRow.value(u"id"));
                    if (dstRow.contains(u"name")) updated.insert(QStringLiteral("name"), dstRow.value(u"name"));
                    else updated.remove(QStringLiteral("name"));
                }
                dstRows.replace(dst->index, updated);
                dstPattern.insert(QStringLiteral("rows"), dstRows);
                commitClip(dstIdx, dstClip, dstPattern);
                return {true, true, doc,
                        QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("clipId"), dstClip.value(u"id")},
                                    {QStringLiteral("row"), serializePatternRow(updated, dstInst)}},
                        {}};
            }
            if (dstRows.size() >= 128) return fail(QStringLiteral("Cannot copy row: destination pattern already has 128 rows."));
            auto cloned = srcRowLen > dstLen ? resizeRowLength(srcRow, dstLen) : srcRow;
            cloned.insert(QStringLiteral("id"), mintRowId(dstPattern));
            if (args.value(u"settingsOnly").toBool(false)) {
                QJsonArray empty;
                for (int i = 0; i < cloned.value(u"lengthSteps").toInt(16); ++i) empty.append(QJsonObject{});
                cloned.insert(QStringLiteral("steps"), empty);
            }
            if (args.value(u"nextAssignment").toBool(false)) {
                cloned.insert(QStringLiteral("assignment"), advanceAssignment(srcRow.value(u"assignment").toObject(), dstInst));
                cloned.remove(QStringLiteral("name"));
            }
            if (!assertAssignmentAllowed(cloned.value(u"assignment").toObject(), dstPattern, dstInst, &err)) return fail(err);
            dstRows.insert(sameClip ? src->index + 1 : dstRows.size(), cloned);
            dstPattern.insert(QStringLiteral("rows"), dstRows);
            commitClip(dstIdx, dstClip, dstPattern);
            return {true, true, doc,
                    QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("clipId"), dstClip.value(u"id")},
                                {QStringLiteral("row"), serializePatternRow(cloned, dstInst)}},
                    {}};
        }
        // copy_steps
        const bool cut = args.value(u"cut").toBool(false);
        if (cut && !sameClip && !checkWritable(tracks, srcClip, &err)) return fail(err);
        const auto dst = resolveRow(dstPattern, args.value(u"toRow").toString(), dstInst, &err);
        if (!dst) return fail(err);
        const auto srcRow = src->row;
        if (isNoteRow(srcRow) != isNoteRow(dst->row)) {
            return fail(QStringLiteral("Cannot paste steps from %1 row \"%2\" to %3 row \"%4\": row types must match (note vs automation).")
                            .arg(srcRow.value(u"assignment").toObject().value(u"type").toString(), rowLabel(srcRow, srcInst),
                                 dst->row.value(u"assignment").toObject().value(u"type").toString(), rowLabel(dst->row, dstInst)));
        }
        const auto srcIndices = parseStepSelection(args.value(u"steps"), srcRow.value(u"lengthSteps").toInt(16), &err);
        if (!srcIndices) return fail(err);
        const int dstRowLen = dst->row.value(u"lengthSteps").toInt(16);
        const int dstStart = args.value(u"toStep").toInt() - 1;
        if (dstStart < 0 || dstStart >= dstRowLen) {
            return fail(QStringLiteral("toStep %1 is out of range. Valid steps are 1..%2.").arg(dstStart + 1).arg(dstRowLen));
        }
        const int base = srcIndices->front();
        const auto srcSteps = srcRow.value(u"steps").toArray();
        const auto dstStepsBefore = dst->row.value(u"steps").toArray();
        std::vector<QJsonObject> copied;
        std::vector<QJsonValue> prevRates;
        for (int idx : *srcIndices) {
            copied.push_back(srcSteps.at(idx).toObject());
            const int target = dstStart + (idx - base);
            prevRates.push_back(target >= 0 && target < dstRowLen ? dstStepsBefore.at(target).toObject().value(u"stepRate") : QJsonValue(QJsonValue::Undefined));
        }
        // Clear the source first, so a cut and paste on the same row keeps the pasted steps.
        if (cut) {
            auto srcRows = srcPattern.value(u"rows").toArray();
            srcRows.replace(src->index, clearRowSteps(srcRow, *srcIndices));
            srcPattern.insert(QStringLiteral("rows"), srcRows);
            if (sameClip) dstPattern = srcPattern;
            else commitClip(srcIdx, srcClip, srcPattern);
        }
        dstRows = dstPattern.value(u"rows").toArray();
        auto active = dstRows.at(dst->index).toObject();
        auto nextSteps = active.value(u"steps").toArray();
        std::vector<int> pastedOn;
        QJsonArray pasted;
        bool pastedMelodic = false;
        for (std::size_t k = 0; k < srcIndices->size(); ++k) {
            const int target = dstStart + ((*srcIndices)[k] - base);
            if (target < 0 || target >= dstRowLen) continue;
            auto incoming = copied[k];
            if (incoming.contains(u"note") || incoming.contains(u"octave")) pastedMelodic = true;
            if (!incoming.contains(u"stepRate") && !prevRates[k].isUndefined()) incoming.insert(QStringLiteral("stepRate"), prevRates[k]);
            const auto compact = compactStep(incoming);
            nextSteps.replace(target, compact);
            pasted.append(target + 1);
            if (compact.value(u"on").toBool(false)) pastedOn.push_back(target);
        }
        const auto activeAssign = active.value(u"assignment").toObject();
        if (pastedMelodic && activeAssign.value(u"type").toString() == u"note") {
            active.insert(QStringLiteral("assignment"), QJsonObject{{QStringLiteral("type"), QStringLiteral("melodic")}, {QStringLiteral("pitch"), activeAssign.value(u"pitch")}});
        }
        active.insert(QStringLiteral("steps"), nextSteps);
        dstRows.replace(dst->index, active);
        dstPattern.insert(QStringLiteral("rows"), dstRows);
        if (dstPattern.value(u"mono").toBool(false) && !pastedOn.empty()) dstPattern = applyMonoAtSteps(dstPattern, active.value(u"id").toString(), pastedOn);
        commitClip(dstIdx, dstClip, dstPattern);
        return {true, true, doc,
                QJsonObject{{QStringLiteral("ok"), true}, {QStringLiteral("clipId"), dstClip.value(u"id")},
                            {QStringLiteral("pastedSteps"), pasted}, {QStringLiteral("text"), patternToText(dstPattern, dstInst)}},
                {}};
    }

    // ── 11-18. Row settings and transforms (SQ50, SQ51, SQ53) ─────────────────
    if (op == u"set_pattern_seed" || op == u"set_pattern_row" || op == u"remove_pattern_rows" || op == u"move_pattern_row" ||
        op == u"rotate_pattern" || op == u"randomize_pattern" || op == u"nudge_pattern_values" || op == u"tie_steps" ||
        op == u"sort_pattern_rows" || op == u"set_pattern_row_sort" || op == u"repeat_step" || op == u"transpose_pattern") {
        int clipIdx = -1;
        QJsonObject clip, pattern, instrument;
        QString err;
        if (!resolvePatClip(args.value(u"clipId").toString(), clipIdx, clip, pattern, instrument, &err)) return fail(err);
        if (!checkWritable(tracks, clip, &err)) return fail(err);
        auto rows = pattern.value(u"rows").toArray();
        const auto needMode = [&](bool required) -> bool {
            const QString mode = args.value(u"mode").toString();
            if (mode.isEmpty()) {
                if (required) err = QStringLiteral("mode is required. Valid modes: %1.").arg(editModes.join(QStringLiteral(", ")));
                return !required;
            }
            if (!editModes.contains(mode)) {
                err = QStringLiteral("Unknown mode \"%1\". Valid modes: %2.").arg(mode, editModes.join(QStringLiteral(", ")));
                return false;
            }
            return true;
        };
        QJsonObject response{{QStringLiteral("ok"), true}, {QStringLiteral("clipId"), clip.value(u"id")}};
        const auto rowsOut = [&]() {
            QJsonArray out;
            for (const auto& rv : pattern.value(u"rows").toArray()) out.append(serializePatternRow(rv.toObject(), instrument));
            return out;
        };

        if (op == u"set_pattern_seed") {
            std::uint32_t seed = 0;
            if (args.value(u"seed").isDouble()) {
                seed = static_cast<std::uint32_t>(args.value(u"seed").toDouble());
            } else {
                const auto cur = seedU32(pattern.value(u"seed"));
                const auto id = clip.value(u"id").toString().toUtf8();
                seed = fnv1a32Uints(rowKeyHash(std::string_view(id.constData(), static_cast<std::size_t>(id.size()))), cur, 0x9e3779b9u, 1u);
                if (seed == 0 || seed == cur) seed = (cur + 1u) == 0u ? 1u : cur + 1u;
            }
            pattern.insert(QStringLiteral("seed"), static_cast<double>(seed));
            response.insert(QStringLiteral("seed"), static_cast<double>(seed));
        } else if (op == u"set_pattern_row") {
            const auto resolved = resolveRow(pattern, args.value(u"row").toString(), instrument, &err);
            if (!resolved) return fail(err);
            QJsonObject next = resolved->row;
            if (args.contains(u"subrows") && !assertUniqueSubrows(args.value(u"subrows"), &err)) return fail(err);
            if (args.value(u"lengthSteps").isDouble()) {
                const int len = args.value(u"lengthSteps").toInt();
                const int patLen = pattern.value(u"lengthSteps").toInt(16);
                if (len > patLen) {
                    return fail(QStringLiteral("Row lengthSteps (%1) cannot exceed pattern lengthSteps (%2). Resize the pattern length first.").arg(len).arg(patLen));
                }
                if (len < 1) return fail(QStringLiteral("Row lengthSteps must be 1..%1.").arg(patLen));
                if (len != next.value(u"lengthSteps").toInt()) next = resizeRowLength(next, len);
            }
            if (args.value(u"name").isString()) next.insert(QStringLiteral("name"), args.value(u"name"));
            if (args.value(u"assignment").isObject()) {
                auto assign = args.value(u"assignment").toObject();
                if (assign.value(u"type").toString() == u"automation" && assign.value(u"target").toObject().value(u"kind").toString() == u"device") {
                    auto target = assign.value(u"target").toObject();
                    const auto deviceId = resolveDeviceId(target.value(u"deviceId").toString(), findTrackById(tracks, clip.value(u"trackId").toString()), &err);
                    if (!err.isEmpty()) return fail(err);
                    target.insert(QStringLiteral("deviceId"), deviceId);
                    assign.insert(QStringLiteral("target"), target);
                }
                if (!assertAssignmentAllowed(assign, pattern, instrument, &err)) return fail(err);
                // A new sound drops the old name, so the label follows the sound (S-F32).
                if (assign != next.value(u"assignment").toObject() && !args.value(u"name").isString()) next.remove(QStringLiteral("name"));
                next.insert(QStringLiteral("assignment"), assign);
            }
            if (args.value(u"stepRate").isString()) next.insert(QStringLiteral("stepRate"), args.value(u"stepRate"));
            if (args.value(u"playback").isString()) {
                static const QStringList modes{"forward", "backward", "pingPong", "shuffle", "pendulum", "wander", "random"};
                if (!modes.contains(args.value(u"playback").toString())) {
                    return fail(QStringLiteral("Unknown playback \"%1\". Valid values: %2.").arg(args.value(u"playback").toString(), modes.join(QStringLiteral(", "))));
                }
                next.insert(QStringLiteral("playback"), args.value(u"playback"));
            }
            for (const char* field : {"mute", "solo", "subrowsExpanded"}) {
                if (args.value(QLatin1String(field)).isBool()) next.insert(QLatin1String(field), args.value(QLatin1String(field)));
            }
            if (args.value(u"midiChannel").isDouble()) next.insert(QStringLiteral("midiChannel"), args.value(u"midiChannel"));
            if (args.value(u"automationMode").isString()) next.insert(QStringLiteral("automationMode"), args.value(u"automationMode"));
            if (args.contains(u"color")) {
                if (args.value(u"color").isNull()) next.remove(QStringLiteral("color"));
                else next.insert(QStringLiteral("color"), args.value(u"color"));
            }
            if (args.value(u"subrows").isArray()) next.insert(QStringLiteral("subrows"), args.value(u"subrows"));
            if (args.contains(u"loopStart") || args.contains(u"loopEnd")) {
                const auto bounds = validateLoopBounds1Based(args.value(u"loopStart"), args.value(u"loopEnd"),
                                                             next.value(u"lengthSteps").toInt(16), next.value(u"loopStart").toInt(0),
                                                             next.value(u"loopEnd").toInt(16), &err);
                if (!bounds) return fail(err);
                next.insert(QStringLiteral("loopStart"), bounds->loopStart);
                next.insert(QStringLiteral("loopEnd"), bounds->loopEnd);
            }
            rows.replace(resolved->index, next);
            pattern.insert(QStringLiteral("rows"), rows);
            // The patched row must be a valid row (stepRate, assignment, subrows, color).
            if (const auto problems = validateStepPattern(pattern); !problems.isEmpty()) return fail(problems.join(u' '));
            response.insert(QStringLiteral("row"), serializePatternRow(next, instrument));
        } else if (op == u"remove_pattern_rows") {
            const bool unused = args.value(u"unused").toBool(false);
            const auto refs = args.value(u"rows").toArray();
            if (!unused && refs.isEmpty()) return fail(QStringLiteral("remove_pattern_rows requires `rows` (row ids or names) or `unused: true`."));
            QSet<QString> remove;
            for (const auto& ref : refs) {
                const auto resolved = resolveRow(pattern, ref.toString(), instrument, &err);
                if (!resolved) return fail(err);
                remove.insert(resolved->row.value(u"id").toString());
            }
            if (unused) {
                for (const auto& rv : rows) {
                    bool any = false;
                    for (const auto& sv : rv.toObject().value(u"steps").toArray()) any = any || sv.toObject().value(u"on").toBool(false);
                    if (!any) remove.insert(rv.toObject().value(u"id").toString());
                }
            }
            QJsonArray kept, removed;
            for (const auto& rv : rows) {
                const QString id = rv.toObject().value(u"id").toString();
                if (remove.contains(id)) removed.append(id);
                else kept.append(rv);
            }
            pattern.insert(QStringLiteral("rows"), kept);
            response.insert(QStringLiteral("removedRowIds"), removed);
            response.insert(QStringLiteral("rows"), rowsOut());
        } else if (op == u"move_pattern_row") {
            const auto resolved = resolveRow(pattern, args.value(u"row").toString(), instrument, &err);
            if (!resolved) return fail(err);
            const auto toIndex = args.value(u"toIndex");
            if (toIndex.toDouble() >= static_cast<double>(rows.size())) {
                return fail(QStringLiteral("toIndex %1 is out of range. Valid indices are 0..%2.").arg(toIndex.toDouble(), 0, 'f', 0).arg(std::max<qsizetype>(0, rows.size() - 1)));
            }
            rows.removeAt(resolved->index);
            rows.insert(static_cast<qsizetype>(toIndex.toDouble()), resolved->row);
            pattern.insert(QStringLiteral("rows"), rows);
            pattern.remove(QStringLiteral("rowSort"));
            response.insert(QStringLiteral("rows"), rowsOut());
        } else if (op == u"rotate_pattern" || op == u"nudge_pattern_values") {
            const bool rotate = op == u"rotate_pattern";
            if (!needMode(!rotate)) return fail(err);
            const QString key = rotate ? QStringLiteral("by") : QStringLiteral("delta");
            const double amount = args.value(key).toDouble();
            const QString mode = args.value(u"mode").toString();
            const auto apply = [&](const QJsonObject& r) {
                return rotate ? rotateRowSteps(r, amount, mode) : nudgeRowValues(r, mode, amount, instrument);
            };
            if (args.contains(u"row")) {
                const auto resolved = resolveRow(pattern, args.value(u"row").toString(), instrument, &err);
                if (!resolved) return fail(err);
                rows.replace(resolved->index, apply(resolved->row));
            } else {
                for (qsizetype i = 0; i < rows.size(); ++i) rows.replace(i, apply(rows.at(i).toObject()));
            }
            pattern.insert(QStringLiteral("rows"), rows);
        } else if (op == u"randomize_pattern") {
            if (!needMode(true)) return fail(err);
            const QString mode = args.value(u"mode").toString();
            std::optional<QSet<QString>> rowIds;
            if (args.contains(u"rows") && !args.value(u"rows").toArray().isEmpty()) {
                rowIds.emplace();
                for (const auto& ref : args.value(u"rows").toArray()) {
                    const auto resolved = resolveRow(pattern, ref.toString(), instrument, &err);
                    if (!resolved) return fail(err);
                    rowIds->insert(resolved->row.value(u"id").toString());
                }
            }
            int maxLen = pattern.value(u"lengthSteps").toInt(16);
            if (!rows.isEmpty()) {
                maxLen = 0;
                for (const auto& rv : rows) maxLen = std::max(maxLen, rv.toObject().value(u"lengthSteps").toInt(16));
            }
            std::optional<std::vector<int>> stepIndices;
            if (args.contains(u"steps")) {
                stepIndices = parseStepSelection(args.value(u"steps"), maxLen, &err);
                if (!stepIndices) return fail(err);
            }
            const double density = args.value(u"density").toDouble(50);
            std::uint32_t seed = 0;
            if (args.value(u"seed").isDouble()) {
                seed = static_cast<std::uint32_t>(args.value(u"seed").toDouble());
            } else {
                const auto id = clip.value(u"id").toString().toUtf8();
                const auto m = mode.toUtf8();
                seed = fnv1a32Uints(seedU32(pattern.value(u"seed")),
                                    rowKeyHash(std::string_view(id.constData(), static_cast<std::size_t>(id.size()))),
                                    rowKeyHash(std::string_view(m.constData(), static_cast<std::size_t>(m.size()))),
                                    static_cast<std::uint32_t>(jsRound(density)));
                if (seed == 0) seed = 1;
            }
            pattern = randomizePatternSteps(pattern, mode, rowIds, stepIndices, seed, density);
            response.insert(QStringLiteral("seed"), static_cast<double>(seed));
        } else if (op == u"sort_pattern_rows") {
            static const QStringList sorts{"type", "typeAndNote", "typeAndName", "typeAndKitPad"};
            const QString by = args.value(u"by").toString();
            if (!sorts.contains(by)) return fail(QStringLiteral("Unknown sort \"%1\". Valid values: %2.").arg(by, sorts.join(QStringLiteral(", "))));
            const auto kept = pattern.value(u"rowSort");
            pattern.insert(QStringLiteral("rowSort"), by + (args.value(u"descending").toBool(false) ? u"Desc" : u"Asc"));
            pattern = applyPatternRowSort(pattern, instrument);
            if (kept.isUndefined()) pattern.remove(QStringLiteral("rowSort"));
            else pattern.insert(QStringLiteral("rowSort"), kept);
            response.insert(QStringLiteral("rows"), rowsOut());
        } else if (op == u"set_pattern_row_sort") {
            const QString rowSort = args.value(u"rowSort").toString();
            if (rowSort == u"none") {
                pattern.remove(QStringLiteral("rowSort"));
            } else {
                pattern.insert(QStringLiteral("rowSort"), rowSort);
                pattern = applyPatternRowSort(pattern, instrument);
            }
            response.insert(QStringLiteral("rowSort"), pattern.value(u"rowSort").toString(QStringLiteral("none")));
            response.insert(QStringLiteral("rows"), rowsOut());
        } else if (op == u"repeat_step") {
            const auto resolved = resolveRow(pattern, args.value(u"row").toString(), instrument, &err);
            if (!resolved) return fail(err);
            const int len = resolved->row.value(u"lengthSteps").toInt(16);
            const int idx = args.value(u"step").toInt() - 1;
            if (idx < 0 || idx >= len) return fail(QStringLiteral("Step %1 is out of range. Valid steps are 1..%2.").arg(idx + 1).arg(len));
            if (idx + 1 >= len) {
                return fail(QStringLiteral("Step %1 is the last step of row \"%2\" (length %3); there is no following step to repeat into.")
                                .arg(idx + 1).arg(rowLabel(resolved->row, instrument)).arg(len));
            }
            auto row = resolved->row;
            auto steps = row.value(u"steps").toArray();
            const auto copied = compactStep(steps.at(idx).toObject());
            steps.replace(idx + 1, copied);
            row.insert(QStringLiteral("steps"), steps);
            rows.replace(resolved->index, row);
            pattern.insert(QStringLiteral("rows"), rows);
            if (pattern.value(u"mono").toBool(false) && copied.value(u"on").toBool(false)) {
                pattern = applyMonoAtSteps(pattern, row.value(u"id").toString(), {idx + 1});
            }
            response.insert(QStringLiteral("repeatedToStep"), idx + 2);
        } else if (op == u"transpose_pattern") {
            const double semitones = args.value(u"semitones").toDouble();
            const auto transposed = [&](const QJsonObject& r) -> std::optional<QJsonObject> {
                std::optional<std::vector<int>> indices;
                if (args.contains(u"steps")) {
                    indices = parseStepSelection(args.value(u"steps"), r.value(u"lengthSteps").toInt(16), &err);
                    if (!indices) return std::nullopt;
                }
                return transposeRowSteps(r, semitones, indices, instrument);
            };
            if (args.contains(u"row")) {
                const auto resolved = resolveRow(pattern, args.value(u"row").toString(), instrument, &err);
                if (!resolved) return fail(err);
                const auto next = transposed(resolved->row);
                if (!next) return fail(err);
                rows.replace(resolved->index, *next);
            } else {
                for (qsizetype i = 0; i < rows.size(); ++i) {
                    const auto next = transposed(rows.at(i).toObject());
                    if (!next) return fail(err);
                    rows.replace(i, *next);
                }
            }
            pattern.insert(QStringLiteral("rows"), rows);
            response.insert(QStringLiteral("rows"), rowsOut());
        } else {  // tie_steps
            const auto resolved = resolveRow(pattern, args.value(u"row").toString(), instrument, &err);
            if (!resolved) return fail(err);
            const int len = resolved->row.value(u"lengthSteps").toInt(16);
            const int from = args.value(u"from").toInt(0);
            const int to = args.value(u"to").toInt(0);
            if (from < 1 || from > len || to < 1 || to > len) {
                return fail(QStringLiteral("tie_steps range [%1, %2] is outside 1..%3.").arg(from).arg(to).arg(len));
            }
            if (!args.value(u"tie").isBool()) return fail(QStringLiteral("tie must be true or false."));
            rows.replace(resolved->index, tieRowSteps(resolved->row, from - 1, to - 1, args.value(u"tie").toBool()));
            pattern.insert(QStringLiteral("rows"), rows);
        }
        response.insert(QStringLiteral("text"), patternToText(pattern, instrument));
        clip.insert(QStringLiteral("pattern"), pattern);
        clips.replace(clipIdx, clip);
        doc.insert(QStringLiteral("clips"), clips);
        return {true, true, doc, response, {}};
    }

    return fail(QStringLiteral("Unsupported step sequencer tool \"%1\".").arg(name));
}

StepPatternOpOutcome runStepPatternOp(const QJsonObject& document, const QString& name, const QJsonObject& args) {
    auto out = runStepPatternOpImpl(document, name, args);
    const auto op = canonicalStepPatternOp(name);
    if (out.ok && onLibraryThread() && !userLibraryRoot().isEmpty() &&
        (op == u"save_step_pattern" || op == u"create_step_pattern_folder" || op == u"rename_step_pattern_folder" ||
         op == u"delete_step_pattern_folder" || op == u"move_step_pattern")) {
        auto* app = QCoreApplication::instance();
        app->setProperty("ntStepPatternLibraryRevision", app->property("ntStepPatternLibraryRevision").toULongLong() + 1);
    }
    return out;
}

}  // namespace nt::midi
