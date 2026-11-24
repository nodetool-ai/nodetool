#include "midi/PatternOps.h"

#include "midi/PatternExpand.h"

#include <QHash>
#include <QJsonDocument>
#include <QRegularExpression>
#include <QSet>
#include <QUuid>

#include <algorithm>
#include <array>
#include <cmath>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace nt::midi {
namespace {

constexpr std::array<const char*, 9> kPatternOps{{
    "get_pattern",
    "set_steps",
    "set_pattern_text",
    "set_pattern",
    "add_pattern_rows",
    "clear_pattern",
    "convert_pattern_to_midi",
    "convert_midi_to_pattern",
    "apply_step_pattern",
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

QVariantMap makeTool(const QString& opName, const QString& description, QVariantMap properties, QStringList required) {
    properties.insert(QStringLiteral("timeline_id"), QVariantMap{{QStringLiteral("type"), QStringLiteral("string")}});
    required.prepend(QStringLiteral("timeline_id"));
    return QVariantMap{
        {QStringLiteral("name"), QString(kPrefix) + opName},
        {QStringLiteral("description"), description},
        {QStringLiteral("parameters"),
         QVariantMap{{QStringLiteral("type"), QStringLiteral("object")},
                     {QStringLiteral("properties"), properties},
                     {QStringLiteral("required"), required},
                     {QStringLiteral("additionalProperties"), true}}},
    };
}

}  // namespace

QVariantList stepPatternAssistantTools() {
    const QVariantMap strType{{QStringLiteral("type"), QStringLiteral("string")}};
    const QVariantMap intType{{QStringLiteral("type"), QStringLiteral("integer")}};
    const QVariantMap numType{{QStringLiteral("type"), QStringLiteral("number")}};
    const QVariantMap boolType{{QStringLiteral("type"), QStringLiteral("boolean")}};
    const QVariantMap strArray{{QStringLiteral("type"), QStringLiteral("array")}, {QStringLiteral("items"), strType}};
    return QVariantList{
        makeTool(QStringLiteral("get_pattern"),
                 QStringLiteral("Read a step sequencer pattern region: settings, SQ47 ASCII grid text, and rows "
                                "(with optional per-step edit mode values)."),
                 {{QStringLiteral("clipId"), strType}, {QStringLiteral("modes"), strArray}},
                 {QStringLiteral("clipId")}),
        makeTool(QStringLiteral("set_steps"),
                 QStringLiteral("Set step fields and/or a linear ramp across 1-based step indices on one pattern row."),
                 {{QStringLiteral("clipId"), strType},
                  {QStringLiteral("row"), strType},
                  {QStringLiteral("steps"), QVariantMap{{QStringLiteral("description"), QStringLiteral("1-based steps string (e.g. \"1-4,9\") or integer array.")}}},
                  {QStringLiteral("values"), QVariantMap{{QStringLiteral("type"), QStringLiteral("object")}}},
                  {QStringLiteral("ramp"), QVariantMap{{QStringLiteral("type"), QStringLiteral("object")}}}},
                 {QStringLiteral("clipId"), QStringLiteral("row"), QStringLiteral("steps")}),
        makeTool(QStringLiteral("set_pattern_text"),
                 QStringLiteral("Author or update pattern rows from SQ47 ASCII step text (merge or replace)."),
                 {{QStringLiteral("clipId"), strType},
                  {QStringLiteral("text"), strType},
                  {QStringLiteral("mode"),
                   QVariantMap{{QStringLiteral("type"), QStringLiteral("string")},
                               {QStringLiteral("enum"), QVariantList{QStringLiteral("merge"), QStringLiteral("replace")}}}}},
                 {QStringLiteral("clipId"), QStringLiteral("text")}),
        makeTool(QStringLiteral("set_pattern"),
                 QStringLiteral("Update pattern-level settings (lengthSteps, stepRate, playback, swing, key, scale, "
                                "legato, mono, midiChannel, pitchSource, automationMode, loopStart, loopEnd)."),
                 {{QStringLiteral("clipId"), strType},
                  {QStringLiteral("name"), strType},
                  {QStringLiteral("key"), QVariantMap{{QStringLiteral("type"), QVariantList{"object", "null"}},
                      {QStringLiteral("properties"), QVariantMap{{"tonic", intType}, {"mode", QVariantMap{{"type", "string"}, {"enum", QVariantList{"major", "minor"}}}}}},
                      {QStringLiteral("required"), QStringList{"tonic", "mode"}}}},
                  {QStringLiteral("lengthSteps"), intType},
                  {QStringLiteral("stepRate"), strType},
                  {QStringLiteral("playback"), strType},
                  {QStringLiteral("swing"), intType},
                  {QStringLiteral("swingDivision"), strType},
                  {QStringLiteral("legato"), boolType},
                  {QStringLiteral("mono"), boolType},
                  {QStringLiteral("midiChannel"), intType},
                  {QStringLiteral("pitchSource"), strType},
                  {QStringLiteral("scale"), strType},
                  {QStringLiteral("scaleQuantize"), boolType},
                  {QStringLiteral("noTranspose"), boolType},
                  {QStringLiteral("automationMode"), strType},
                  {QStringLiteral("loopStart"), intType},
                  {QStringLiteral("loopEnd"), intType}},
                 {QStringLiteral("clipId")}),
        makeTool(QStringLiteral("add_pattern_rows"),
                 QStringLiteral("Add note, melodic, kit, degree, or automation rows to a step pattern (max 128 rows)."),
                 {{QStringLiteral("clipId"), strType},
                  {QStringLiteral("rows"),
                   QVariantMap{{QStringLiteral("type"), QStringLiteral("array")},
                               {QStringLiteral("items"), QVariantMap{{QStringLiteral("type"), QStringLiteral("object")}}}}}},
                 {QStringLiteral("clipId"), QStringLiteral("rows")}),
        makeTool(QStringLiteral("clear_pattern"),
                 QStringLiteral("Clear steps, a row, or the full pattern (optionally only one edit mode)."),
                 {{QStringLiteral("clipId"), strType},
                  {QStringLiteral("scope"),
                   QVariantMap{{QStringLiteral("type"), QStringLiteral("string")},
                               {QStringLiteral("enum"),
                                QVariantList{QStringLiteral("pattern"), QStringLiteral("row"), QStringLiteral("steps")}}}},
                  {QStringLiteral("row"), strType},
                  {QStringLiteral("steps"), QVariantMap{{QStringLiteral("description"), QStringLiteral("1-based steps when scope is \"steps\".")}}},
                  {QStringLiteral("mode"), strType},
                  {QStringLiteral("rowType"), strType}},
                 {QStringLiteral("clipId")}),
        makeTool(QStringLiteral("convert_pattern_to_midi"),
                 QStringLiteral("Bake step sequencer pattern regions into plain MIDI notes, controllers, and track automation."),
                 {{QStringLiteral("clipIds"), strArray}}, {QStringLiteral("clipIds")}),
        makeTool(QStringLiteral("convert_midi_to_pattern"),
                 QStringLiteral("Quantize plain MIDI clips into step sequencer pattern regions."),
                 {{QStringLiteral("clipIds"), strArray}, {QStringLiteral("stepRate"), strType}},
                 {QStringLiteral("clipIds")}),
        makeTool(QStringLiteral("apply_step_pattern"),
                 QStringLiteral("Load a factory step pattern or template onto an existing clip or a new clip on a MIDI track."),
                 {{QStringLiteral("pattern"), strType},
                  {QStringLiteral("clipId"), strType},
                  {QStringLiteral("trackId"), strType},
                  {QStringLiteral("bars"), numType},
                  {QStringLiteral("atMs"), numType},
                  {QStringLiteral("atBar"), intType},
                  {QStringLiteral("useProjectKey"), boolType}},
                 {QStringLiteral("pattern")}),
    };
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

StepPatternOpOutcome runStepPatternOp(const QJsonObject& document, const QString& name, const QJsonObject& args) {
    const QString op = canonicalStepPatternOp(name);
    if (op.isEmpty()) return fail(QStringLiteral("Unknown step sequencer tool \"%1\".").arg(name));

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

    return fail(QStringLiteral("Unsupported step sequencer tool \"%1\".").arg(name));
}

}  // namespace nt::midi
