#include "midi/PatternExpand.h"
#include "model/StepPatternValidation.h"

#include "audio/automation/AutomationCurves.h"

#include <QCollator>
#include <QLocale>
#include <QHash>
#include <QRegularExpression>
#include <QSet>

#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>
#include <stdexcept>
#include <unordered_map>

namespace nt::midi {
namespace {

// Exact JavaScript `Math.round` semantics (ties toward +infinity, never -0).
double jsRound(double x) noexcept {
    if (!std::isfinite(x)) return x;
    const double f = std::floor(x);
    const double r = (x - f >= 0.5) ? (f + 1.0) : f;
    return r == 0.0 ? 0.0 : r;
}

std::int64_t jsRoundInt64(double x) noexcept {
    // Keep tick arithmetic inside the JavaScript safe-integer domain.
    if (!std::isfinite(x)) return 0;
    return static_cast<std::int64_t>(std::clamp(jsRound(x), -9007199254740991.0, 9007199254740991.0));
}

int clampInt(double v, int lo, int hi) noexcept {
    if (!std::isfinite(v)) return lo;
    const double r = jsRound(v);
    if (r <= static_cast<double>(lo)) return lo;
    if (r >= static_cast<double>(hi)) return hi;
    return static_cast<int>(r);
}

int floorMod(int a, int m) noexcept {
    return ((a % m) + m) % m;
}

double msPerQuarter(double bpm) noexcept {
    return 60000.0 / bpm;
}

double ticksToMs(double ticks, double bpm) noexcept {
    return (ticks / static_cast<double>(kMidiPpq)) * msPerQuarter(bpm);
}

double msToTicks(double ms, double bpm) noexcept {
    return (ms / msPerQuarter(bpm)) * static_cast<double>(kMidiPpq);
}

// ── Step rate table (SQ6) ───────────────────────────────────────────────────

struct RateEntry {
    std::string_view name;
    int ticks;
};

constexpr std::array<RateEntry, 22> kRateTable{{
    {"4", 15360},  {"2", 7680},  {"1", 3840},   {"1/2", 1920}, {"1/4", 960},  {"1/8", 480},
    {"1/16", 240}, {"1/32", 120}, {"1/64", 60}, {"1T", 2560},  {"2T", 1280},  {"4T", 640},
    {"8T", 320},   {"16T", 160}, {"32T", 80},   {"1D", 5760},  {"2D", 2880},  {"4D", 1440},
    {"8D", 720},   {"16D", 360}, {"32D", 180},  {"64D", 90},
}};

int stepRateTicksOrDefault(const QString& rate, int fallback = 240) noexcept {
    const auto utf8 = rate.toUtf8();
    const auto ticks = stepRateTicks(std::string_view(utf8.constData(), static_cast<std::size_t>(utf8.size())));
    return ticks.value_or(fallback);
}

constexpr std::uint32_t kPlayOrderSaltShuffle = 0x51a7f1e1u;
constexpr std::uint32_t kPlayOrderSaltRandom = 0x72616e64u;
constexpr std::uint32_t kPlayOrderSaltWander = 0x77616e64u;

std::vector<int> wanderCycle(int n, std::uint32_t wSeed, std::uint32_t rowKey, std::uint32_t cycle, int startPos,
                             bool startAtZero) {
    std::vector<int> out;
    out.reserve(static_cast<std::size_t>(n));
    int pos = startPos;
    if (startAtZero) {
        out.push_back(pos);
        for (int i = 1; i < n; ++i) {
            const int dir = stepHash(wSeed, rowKey, static_cast<std::uint32_t>(i), cycle) < 0.5 ? -1 : 1;
            pos = (pos + dir + n) % n;
            out.push_back(pos);
        }
    } else {
        for (int i = 0; i < n; ++i) {
            const int dir = stepHash(wSeed, rowKey, static_cast<std::uint32_t>(i), cycle) < 0.5 ? -1 : 1;
            pos = (pos + dir + n) % n;
            out.push_back(pos);
        }
    }
    return out;
}

// ── Harmony tables (mirrors packages/timeline/src/harmony/{scales,chords}.ts)

struct ScaleDef {
    std::string_view id;
    std::array<int, 8> iv;
    std::size_t count;
};

constexpr std::array<ScaleDef, 19> kScales{{
    {"major", {0, 2, 4, 5, 7, 9, 11, 0}, 7},
    {"minor", {0, 2, 3, 5, 7, 8, 10, 0}, 7},
    {"dorian", {0, 2, 3, 5, 7, 9, 10, 0}, 7},
    {"mixolydian", {0, 2, 4, 5, 7, 9, 10, 0}, 7},
    {"phrygian", {0, 1, 3, 5, 7, 8, 10, 0}, 7},
    {"lydian", {0, 2, 4, 6, 7, 9, 11, 0}, 7},
    {"locrian", {0, 1, 3, 5, 6, 8, 10, 0}, 7},
    {"harmMinor", {0, 2, 3, 5, 7, 8, 11, 0}, 7},
    {"melMinor", {0, 2, 3, 5, 7, 9, 11, 0}, 7},
    {"phrygDom", {0, 1, 4, 5, 7, 8, 10, 0}, 7},
    {"lydDom", {0, 2, 4, 6, 7, 9, 10, 0}, 7},
    {"locrian2", {0, 2, 3, 5, 6, 8, 10, 0}, 7},
    {"altered", {0, 1, 3, 4, 6, 8, 10, 0}, 7},
    {"wholeTone", {0, 2, 4, 6, 8, 10, 0, 0}, 6},
    {"dimHW", {0, 1, 3, 4, 6, 7, 9, 10}, 8},
    {"dimWH", {0, 2, 3, 5, 6, 8, 9, 11}, 8},
    {"majPent", {0, 2, 4, 7, 9, 0, 0, 0}, 5},
    {"minPent", {0, 3, 5, 7, 10, 0, 0, 0}, 5},
    {"blues", {0, 3, 5, 6, 7, 10, 0, 0}, 6},
}};

// Chord scales CHORDS picks from, in exact TS tie-break order (first 16 entries of kScales).
constexpr std::size_t kChordCandidateCount = 16;

const ScaleDef* findScale(std::string_view id) noexcept {
    for (const auto& s : kScales) {
        if (s.id == id) return &s;
    }
    return nullptr;
}

struct ChordQualityDef {
    std::string_view id;
    std::array<int, 6> iv;
    std::size_t count;
};

constexpr std::array<ChordQualityDef, 28> kChordQualities{{
    {"maj", {0, 4, 7, 0, 0, 0}, 3},
    {"min", {0, 3, 7, 0, 0, 0}, 3},
    {"dim", {0, 3, 6, 0, 0, 0}, 3},
    {"aug", {0, 4, 8, 0, 0, 0}, 3},
    {"sus2", {0, 2, 7, 0, 0, 0}, 3},
    {"sus4", {0, 5, 7, 0, 0, 0}, 3},
    {"five", {0, 7, 12, 0, 0, 0}, 3},
    {"six", {0, 4, 7, 9, 0, 0}, 4},
    {"m6", {0, 3, 7, 9, 0, 0}, 4},
    {"dom7", {0, 4, 7, 10, 0, 0}, 4},
    {"maj7", {0, 4, 7, 11, 0, 0}, 4},
    {"m7", {0, 3, 7, 10, 0, 0}, 4},
    {"mMaj7", {0, 3, 7, 11, 0, 0}, 4},
    {"m7b5", {0, 3, 6, 10, 0, 0}, 4},
    {"dim7", {0, 3, 6, 9, 0, 0}, 4},
    {"aug7", {0, 4, 8, 10, 0, 0}, 4},
    {"sus7", {0, 5, 7, 10, 0, 0}, 4},
    {"add9", {0, 4, 7, 14, 0, 0}, 4},
    {"madd9", {0, 3, 7, 14, 0, 0}, 4},
    {"dom9", {0, 4, 7, 10, 14, 0}, 5},
    {"maj9", {0, 4, 7, 11, 14, 0}, 5},
    {"m9", {0, 3, 7, 10, 14, 0}, 5},
    {"dom7b9", {0, 4, 7, 10, 13, 0}, 5},
    {"dom7s9", {0, 4, 7, 10, 15, 0}, 5},
    {"m11", {0, 3, 7, 10, 14, 17}, 6},
    {"dom11", {0, 4, 7, 10, 14, 17}, 6},
    {"maj13", {0, 4, 7, 11, 14, 21}, 6},
    {"dom13", {0, 4, 7, 10, 14, 21}, 6},
}};

const ChordQualityDef* findChordQuality(std::string_view id) noexcept {
    for (const auto& q : kChordQualities) {
        if (q.id == id) return &q;
    }
    return nullptr;
}

int popcount12(int m) noexcept {
    int n = 0;
    for (int b = m & 0xfff; b != 0; b &= b - 1) ++n;
    return n;
}

int scaleMask(int root, std::string_view scaleId) noexcept {
    const auto* def = findScale(scaleId);
    if (!def) def = &kScales[0];
    int m = 0;
    for (std::size_t i = 0; i < def->count; ++i) {
        m |= (1 << floorMod(root + def->iv[i], 12));
    }
    return m;
}

int chordMask(int root, const ChordQualityDef& q) noexcept {
    int m = 0;
    for (std::size_t i = 0; i < q.count; ++i) {
        m |= (1 << floorMod(root + q.iv[i], 12));
    }
    return m;
}

const ScaleDef& chordScale(int root, const ChordQualityDef& q, int keyMask) noexcept {
    const int t = chordMask(root, q);
    const int above = (((t << 1) | (t >> 11)) & 0xfff) & ~t;
    const ScaleDef* best = &kScales[0];
    int bestScore = std::numeric_limits<int>::min();
    for (std::size_t i = 0; i < kChordCandidateCount; ++i) {
        const auto& cand = kScales[i];
        const int s = scaleMask(root, cand.id);
        const int score = popcount12(s & t) * 100 + 4 * (popcount12(s & keyMask) - popcount12(s & ~keyMask)) -
                          3 * popcount12(s & above);
        if (score > bestScore) {
            best = &cand;
            bestScore = score;
        }
    }
    return *best;
}

std::array<int, 12> scaleRemap(int mask, int prefer = 0) noexcept {
    auto has = [](int pc, int m) noexcept -> bool { return ((m >> floorMod(pc, 12)) & 1) == 1; };
    std::array<int, 12> table{};
    for (int pc = 0; pc < 12; ++pc) {
        if (has(pc, mask)) {
            table[static_cast<std::size_t>(pc)] = 0;
            continue;
        }
        int offset = 0;
        for (int d = 1; d < 12; ++d) {
            const bool down = has(pc - d, mask);
            const bool up = has(pc + d, mask);
            if (down && up) {
                offset = (has(pc + d, prefer) && !has(pc - d, prefer)) ? d : -d;
                break;
            }
            if (down) {
                offset = -d;
                break;
            }
            if (up) {
                offset = d;
                break;
            }
        }
        table[static_cast<std::size_t>(pc)] = offset;
    }
    return table;
}

int remapNote(const std::array<int, 12>& table, int note) noexcept {
    return std::clamp(note + table[static_cast<std::size_t>(floorMod(note, 12))], 0, 127);
}

int degreeSemitones(std::string_view degree, int root, const ChordQualityDef& q, int keyMask) noexcept {
    std::array<int, 6> mods{};
    for (std::size_t i = 0; i < q.count; ++i) {
        mods[i] = floorMod(q.iv[i], 12);
    }
    const auto& sc = chordScale(root, q, keyMask);
    auto findIn = [&](std::initializer_list<int> cands) -> std::optional<int> {
        for (int c : cands) {
            for (std::size_t i = 0; i < q.count; ++i) {
                if (mods[i] == c) return c;
            }
        }
        return std::nullopt;
    };
    auto scaleAt = [&](std::size_t idx, int fallback) noexcept -> int {
        return idx < sc.count ? sc.iv[idx] : fallback;
    };
    if (degree == "root") return 0;
    if (degree == "2nd") return findIn({2, 1}).value_or(scaleAt(1, 2));
    if (degree == "3rd") return findIn({4, 3}).value_or(scaleAt(2, 4));
    if (degree == "4th") return findIn({5, 6}).value_or(scaleAt(3, 5));
    if (degree == "5th") return findIn({7, 6, 8}).value_or(scaleAt(4, 7));
    if (degree == "6th") return findIn({9, 8}).value_or(scaleAt(5, 9));
    if (degree == "7th") {
        if (q.id == "dim7") return 9;
        return findIn({10, 11}).value_or(scaleAt(6, 10));
    }
    return 0;
}

std::optional<QJsonObject> chordAtTick(const QJsonArray& chords, double tick) {
    for (const auto& entry : chords) {
        const auto c = entry.toObject();
        const double st = c.value(u"startTick").toDouble();
        const double dur = c.value(u"durationTick").toDouble();
        if (tick >= st && tick < st + dur) return c;
    }
    return std::nullopt;
}

// ── GM drum lanes & aliases (mirrors stepEditor.ts + stepPattern.ts) ────────

struct GmDrumLane {
    int pitch;
    const char* name;
};

constexpr std::array<GmDrumLane, 16> kGmDrumLanes{{
    {36, "Kick"},         {38, "Snare"},         {40, "Snare 2"},     {37, "Side Stick"},
    {39, "Clap"},         {42, "Closed Hi-Hat"}, {44, "Pedal Hi-Hat"}, {46, "Open Hi-Hat"},
    {41, "Low Tom"},      {45, "Mid Tom"},       {48, "High Tom"},    {49, "Crash"},
    {51, "Ride"},         {53, "Ride Bell"},     {54, "Tambourine"},  {56, "Cowbell"},
}};

struct DrumAlias {
    const char* key;
    int pitch;
};

constexpr std::array<DrumAlias, 29> kDrumAliases{{
    {"kick", 36},          {"bd", 36},            {"bass drum", 36}, {"snare", 38},
    {"sd", 38},            {"snare 2", 40},       {"side stick", 37}, {"rim", 37},
    {"rimshot", 37},       {"clap", 39},          {"cp", 39},        {"closed hi-hat", 42},
    {"closed hat", 42},    {"hi-hat", 42},        {"hihat", 42},     {"hat", 42},
    {"ch", 42},            {"hh", 42},            {"pedal hi-hat", 44}, {"pedal hat", 44},
    {"open hi-hat", 46},   {"open hat", 46},      {"oh", 46},        {"low tom", 41},
    {"mid tom", 45},       {"high tom", 48},      {"crash", 49},     {"ride", 51},
    {"ride bell", 53},
}};

std::optional<int> findDrumAlias(const QString& lower) {
    for (const auto& a : kDrumAliases) {
        if (lower == QLatin1String(a.key)) return a.pitch;
    }
    if (lower == u"tambourine" || lower == u"tamb") return 54;
    if (lower == u"cowbell" || lower == u"cb") return 56;
    return std::nullopt;
}

const char* gmLaneNameForPitch(int pitch) noexcept {
    for (const auto& l : kGmDrumLanes) {
        if (l.pitch == pitch) return l.name;
    }
    return nullptr;
}

std::optional<int> tonicToPc(const QString& tonic) {
    static const QHash<QString, int> kMap{
        {QStringLiteral("C"), 0},   {QStringLiteral("C#"), 1}, {QStringLiteral("Db"), 1},
        {QStringLiteral("D"), 2},   {QStringLiteral("D#"), 3}, {QStringLiteral("Eb"), 3},
        {QStringLiteral("E"), 4},   {QStringLiteral("F"), 5},  {QStringLiteral("F#"), 6},
        {QStringLiteral("Gb"), 6},  {QStringLiteral("G"), 7},  {QStringLiteral("G#"), 8},
        {QStringLiteral("Ab"), 8},  {QStringLiteral("A"), 9},  {QStringLiteral("A#"), 10},
        {QStringLiteral("Bb"), 10}, {QStringLiteral("B"), 11},
    };
    const auto it = kMap.constFind(tonic);
    return it == kMap.constEnd() ? std::nullopt : std::optional<int>(it.value());
}

bool isValidRowSort(const QString& sort) {
    static const QSet<QString> kValid{
        QStringLiteral("none"),             QStringLiteral("typeAsc"),
        QStringLiteral("typeDesc"),         QStringLiteral("typeAndNoteAsc"),
        QStringLiteral("typeAndNoteDesc"),  QStringLiteral("typeAndNameAsc"),
        QStringLiteral("typeAndNameDesc"),  QStringLiteral("typeAndKitPadAsc"),
        QStringLiteral("typeAndKitPadDesc"),
    };
    return kValid.contains(sort);
}

bool isNoteRowObj(const QJsonObject& row) {
    return row.value(u"assignment").toObject().value(u"type").toString() != u"automation";
}

// ── Expansion internals ─────────────────────────────────────────────────────

bool conditionPasses(const QJsonObject& cond, std::int64_t cycle, std::int64_t lastCycle) {
    if (cond.isEmpty()) return true;
    const auto type = cond.value(u"type").toString();
    if (type.isEmpty() || type == u"always") return true;
    if (type == u"first") return cycle == 0;
    if (type == u"last") return cycle == lastCycle;
    if (type == u"recurrence") {
        const int cycles = std::max(1, cond.value(u"cycles").toInt(2));
        const int iteration = cond.value(u"iteration").toInt(1);
        return (cycle % cycles) == (iteration - 1);
    }
    return true;
}

struct Segment {
    int segIdx = 0;
    std::int64_t segStart = 0;
    std::int64_t segEnd = 0;
    std::int64_t segLen = 0;
    std::int64_t phase = 0;
};

struct ScheduledOccurrence {
    int stepIndex = 0;
    QJsonObject step;
    std::int64_t rawStartTick = 0;
    int lengthTicks = 0;
    std::int64_t cycle = 0;
};

std::vector<Segment> buildSegments(double clipLengthTicks, std::optional<double> loopLengthTicks,
                                   double patternPhaseTicks) {
    const std::int64_t total = std::max<std::int64_t>(0, jsRoundInt64(clipLengthTicks));
    if (total <= 0) return {};
    const std::int64_t phase = std::max<std::int64_t>(0, jsRoundInt64(patternPhaseTicks));
    const bool hasLoop = loopLengthTicks.has_value() && std::isfinite(*loopLengthTicks) && *loopLengthTicks > 0.0 &&
                         *loopLengthTicks < static_cast<double>(total);
    if (!hasLoop) {
        return {Segment{0, 0, total, total, phase}};
    }
    const std::int64_t loopLen = std::max<std::int64_t>(1, jsRoundInt64(*loopLengthTicks));
    std::vector<Segment> out;
    for (int r = 0; static_cast<std::int64_t>(r) * loopLen < total; ++r) {
        const std::int64_t segStart = static_cast<std::int64_t>(r) * loopLen;
        const std::int64_t segEnd = segStart + std::min(loopLen, total - segStart);
        out.push_back(Segment{r, segStart, segEnd, segEnd - segStart, r == 0 ? phase : 0});
    }
    return out;
}

struct RowOccurrencesResult {
    std::vector<std::vector<ScheduledOccurrence>> perSegment;
    std::int64_t lastCycle = -1;
    bool exceededBudget = false;
};

RowOccurrencesResult rowSegmentOccurrences(const QJsonObject& row, std::uint32_t seed,
                                           const std::vector<Segment>& segments, const QJsonObject& rowState, std::size_t& budget) {
    const auto steps = row.value(u"steps").toArray();
    const int nSteps = static_cast<int>(steps.size());
    const int start = std::max(0, std::min(nSteps, row.value(u"loopStart").toInt(0)));
    const int end = std::max(start, std::min(nSteps, row.value(u"loopEnd").toInt(nSteps)));
    const auto rowRate = row.value(u"stepRate").toString(QStringLiteral("1/16"));
    const auto playback = row.value(u"playback").toString(QStringLiteral("forward")).toStdString();

    std::vector<int> active;
    std::int64_t maxNegPull = 0;
    for (int i = start; i < end; ++i) {
        const auto st = steps.at(i).toObject();
        if (st.value(u"skip").toBool(false)) continue;
        active.push_back(i);
        const double off = st.value(u"offset").toDouble(0.0);
        if (off < 0.0) {
            const int len = stepRateTicksOrDefault(st.contains(u"stepRate") ? st.value(u"stepRate").toString() : rowRate);
            const std::int64_t pull = -jsRoundInt64((off / 100.0) * static_cast<double>(len));
            if (pull > maxNegPull) maxNegPull = pull;
        }
    }

    const bool hasRowState = !rowState.isEmpty();
    const bool hasExplicitLast = hasRowState && rowState.value(u"lastCycle").isDouble();
    if (active.empty()) {
        return {std::vector<std::vector<ScheduledOccurrence>>(segments.size()),
                hasExplicitLast ? jsRoundInt64(rowState.value(u"lastCycle").toDouble(-1)) : -1};
    }

    const auto rowIdUtf8 = row.value(u"id").toString().toUtf8();
    const std::uint32_t rk = rowKeyHash(std::string_view(rowIdUtf8.constData(), static_cast<std::size_t>(rowIdUtf8.size())));

    std::vector<std::vector<ScheduledOccurrence>> perSegment;
    perSegment.reserve(segments.size());
    std::int64_t cycle = hasRowState ? jsRoundInt64(rowState.value(u"cycleOffset").toDouble(0)) : 0;
    std::int64_t lastCycle = -1;
    std::optional<int> prevWanderPos;
    if (hasRowState && rowState.value(u"wanderPos").isDouble()) {
        prevWanderPos = static_cast<int>(std::fmod(rowState.value(u"wanderPos").toDouble(), static_cast<double>(active.size())));
    }

    for (const auto& seg : segments) {
        const std::int64_t limit = seg.phase + seg.segLen;
        const std::int64_t passLimit = (segments.size() == 1) ? (limit + maxNegPull) : limit;
        std::vector<ScheduledOccurrence> occs;
        std::int64_t passStart = 0;
        int safety = 0;
        while (passStart < passLimit && safety < 16384) {
            ++safety;
            const auto order = playOrder(static_cast<int>(active.size()), playback, seed,
                                         cycle, rk, prevWanderPos);
            if (order.empty()) break;
            prevWanderPos = order.back();
            std::int64_t cursor = 0;
            if (passStart < limit) {
                lastCycle = cycle;
            }
            for (int pos : order) {
                const int stepIndex = active[static_cast<std::size_t>(pos)];
                const auto step = steps.at(stepIndex).toObject();
                const int lengthTicks =
                    stepRateTicksOrDefault(step.contains(u"stepRate") ? step.value(u"stepRate").toString() : rowRate);
                if (budget == 0) return {{}, -1, true};
                --budget;
                occs.push_back(ScheduledOccurrence{stepIndex, step, passStart + cursor, lengthTicks, cycle});
                cursor += lengthTicks;
            }
            if (cursor <= 0) break;
            passStart += cursor;
            ++cycle;
        }
        perSegment.push_back(std::move(occs));
    }

    return {std::move(perSegment), hasExplicitLast ? jsRoundInt64(rowState.value(u"lastCycle").toDouble()) : lastCycle};
}

double defaultAutomationValue(const QJsonObject& target) noexcept {
    if (target.value(u"kind").toString() == u"cc" && target.value(u"cc").toInt(-1) == 10) return 64.0;
    return 0.0;
}

std::pair<int, int> controllerValueRange(const QString& kind) noexcept {
    if (kind == u"pitchBend") return {-8192, 8191};
    return {0, 127};
}

std::optional<double> controllerValueAt(const QJsonObject& lane, double tick) {
    const auto points = lane.value(u"points").toArray();
    if (points.isEmpty()) return std::nullopt;
    if (tick < points.at(0).toObject().value(u"tick").toDouble()) return std::nullopt;
    const bool linear = lane.value(u"interpolation").toString() != u"step";
    qsizetype lo = 0;
    qsizetype hi = points.size() - 1;
    while (lo < hi) {
        const qsizetype mid = (lo + hi + 1) >> 1;
        if (points.at(mid).toObject().value(u"tick").toDouble() <= tick) lo = mid;
        else hi = mid - 1;
    }
    const auto a = points.at(lo).toObject();
    const double aTick = a.value(u"tick").toDouble();
    const double aVal = a.value(u"value").toDouble();
    if (!linear || lo + 1 >= points.size()) return aVal;
    const auto b = points.at(lo + 1).toObject();
    const double bTick = b.value(u"tick").toDouble();
    const double bVal = b.value(u"value").toDouble();
    if (bTick == aTick) return aVal;
    return jsRound(aVal + ((bVal - aVal) * (tick - aTick)) / (bTick - aTick));
}

QJsonArray sortNotes(QJsonArray notes) {
    std::vector<QJsonObject> vec;
    vec.reserve(static_cast<std::size_t>(notes.size()));
    for (const auto& v : notes) vec.push_back(v.toObject());
    const QCollator collator(QLocale(QLocale::English, QLocale::UnitedStates));
    std::stable_sort(vec.begin(), vec.end(), [&collator](const QJsonObject& a, const QJsonObject& b) {
        const std::int64_t sa = static_cast<std::int64_t>(a.value(u"startTick").toDouble());
        const std::int64_t sb = static_cast<std::int64_t>(b.value(u"startTick").toDouble());
        if (sa != sb) return sa < sb;
        const int pa = a.value(u"pitch").toInt();
        const int pb = b.value(u"pitch").toInt();
        if (pa != pb) return pa < pb;
        return collator.compare(
            a.value(u"id").toString(), b.value(u"id").toString()) < 0;
    });
    QJsonArray out;
    for (auto& o : vec) out.append(std::move(o));
    return out;
}

std::uint32_t readSeed(const QJsonValue& val, std::uint32_t fallback = 1u) noexcept {
    if (!val.isDouble()) return fallback;
    const double d = val.toDouble();
    if (!std::isfinite(d)) return fallback;
    const double modular = std::fmod(std::trunc(d), 4294967296.0);
    return static_cast<std::uint32_t>(modular < 0 ? modular + 4294967296.0 : modular);
}

double resolveDocBpm(const QJsonObject& doc) noexcept {
    const double bpm = doc.value(u"tempo").toObject().value(u"bpm").toDouble(120.0);
    return (std::isfinite(bpm) && bpm > 0.0) ? bpm : 120.0;
}

double resolveDocOffsetMs(const QJsonObject& doc) noexcept {
    const double off = doc.value(u"tempo").toObject().value(u"offsetMs").toDouble(0.0);
    return std::isfinite(off) ? off : 0.0;
}

std::optional<double> activeLoopMsOf(const QJsonObject& clip) noexcept {
    if (!clip.value(u"loopLengthMs").isDouble()) return std::nullopt;
    const double len = clip.value(u"loopLengthMs").toDouble();
    const double dur = clip.value(u"durationMs").toDouble(0.0);
    if (!std::isfinite(len) || len <= 0.0 || len >= dur) return std::nullopt;
    return len;
}

// ── CE6 region params for playback (mirrors regionParams.ts + edit.ts) ──────

std::optional<double> quantizeDivisionTicks(const QString& grid) noexcept {
    if (grid == u"1/4") return static_cast<double>(kMidiPpq);
    if (grid == u"1/8") return static_cast<double>(kMidiPpq) / 2.0;
    if (grid == u"1/16") return static_cast<double>(kMidiPpq) / 4.0;
    if (grid == u"1/32") return static_cast<double>(kMidiPpq) / 8.0;
    if (grid == u"1/8T") return (static_cast<double>(kMidiPpq) / 2.0) * (2.0 / 3.0);
    if (grid == u"1/16T") return (static_cast<double>(kMidiPpq) / 4.0) * (2.0 / 3.0);
    return std::nullopt;
}

double expressionValueAt(const QJsonArray& points, double tick, double neutral) {
    if (points.isEmpty() || tick < points.at(0).toObject().value(u"tick").toDouble()) return neutral;
    const auto last = points.at(points.size() - 1).toObject();
    if (tick >= last.value(u"tick").toDouble()) return last.value(u"value").toDouble();
    for (qsizetype i = 1; i < points.size(); ++i) {
        const auto b = points.at(i).toObject();
        const double bt = b.value(u"tick").toDouble();
        if (tick < bt) {
            const auto a = points.at(i - 1).toObject();
            const double at = a.value(u"tick").toDouble();
            const double span = bt - at;
            const double av = a.value(u"value").toDouble();
            const double bv = b.value(u"value").toDouble();
            return span <= 0.0 ? bv : av + ((bv - av) * (tick - at)) / span;
        }
    }
    return last.value(u"value").toDouble();
}

QJsonObject fitExpressionToDuration(QJsonObject note) {
    if (!note.value(u"expression").isObject()) return note;
    const auto expr = note.value(u"expression").toObject();
    const double dur = note.value(u"durationTick").toDouble();
    struct Spec {
        QLatin1StringView key;
        double neutral;
    };
    constexpr std::array<Spec, 4> kSpecs{{
        {QLatin1StringView("pitch"), 0.0},
        {QLatin1StringView("volume"), 1.0},
        {QLatin1StringView("pan"), 0.0},
        {QLatin1StringView("brightness"), 0.5},
    }};
    QJsonObject nextExpr;
    bool changed = false;
    for (const auto& s : kSpecs) {
        const QString k = QString(s.key);
        if (!expr.value(k).isArray()) continue;
        const auto pts = expr.value(k).toArray();
        bool allInside = true;
        for (const auto& pv : pts) {
            if (pv.toObject().value(u"tick").toDouble() > dur) {
                allInside = false;
                break;
            }
        }
        if (allInside) {
            nextExpr.insert(k, pts);
            continue;
        }
        changed = true;
        QJsonArray kept;
        for (const auto& pv : pts) {
            if (pv.toObject().value(u"tick").toDouble() <= dur) kept.append(pv);
        }
        const double endVal = expressionValueAt(pts, dur, s.neutral);
        if (kept.isEmpty() || kept.at(kept.size() - 1).toObject().value(u"tick").toDouble() < dur) {
            kept.append(QJsonObject{{QStringLiteral("tick"), dur}, {QStringLiteral("value"), endVal}});
        }
        nextExpr.insert(k, kept);
    }
    if (changed) note.insert(QStringLiteral("expression"), nextExpr);
    return note;
}

bool notesOverlap(const QJsonObject& a, const QJsonObject& b) noexcept {
    const std::int64_t a0 = static_cast<std::int64_t>(a.value(u"startTick").toDouble());
    const std::int64_t a1 = a0 + static_cast<std::int64_t>(a.value(u"durationTick").toDouble());
    const std::int64_t b0 = static_cast<std::int64_t>(b.value(u"startTick").toDouble());
    const std::int64_t b1 = b0 + static_cast<std::int64_t>(b.value(u"durationTick").toDouble());
    return a0 < b1 && b0 < a1;
}

QJsonArray applyMidiRegionParamsToExpandedNotes(const QJsonArray& rawNotes, const QJsonObject& clip, double bpm,
                                                double gridOffsetMs) {
    std::vector<QJsonObject> out;
    out.reserve(static_cast<std::size_t>(rawNotes.size()));
    for (const auto& v : rawNotes) out.push_back(v.toObject());

    const auto q = clip.value(u"quantize").toObject();
    const double qStrength = q.value(u"strength").toDouble(0.0);
    if (!q.isEmpty() && std::isfinite(qStrength) && qStrength > 0.0) {
        if (const auto gridOpt = quantizeDivisionTicks(q.value(u"grid").toString())) {
            const double grid = *gridOpt;
            const double strength = std::clamp(qStrength / 100.0, 0.0, 1.0);
            // Expanded pattern clip is materialized at inPointMs = 0 (clipLoop.ts line 208).
            const double phase = msToTicks(gridOffsetMs - clip.value(u"startMs").toDouble(0.0), bpm);
            const std::int64_t from = 0;
            const std::int64_t to = jsRoundInt64(msToTicks(clip.value(u"durationMs").toDouble(0.0), bpm));

            std::vector<QJsonObject> raw = out;
            for (std::size_t i = 0; i < out.size(); ++i) {
                const double rawStart = raw[i].value(u"startTick").toDouble();
                const double k = jsRound((rawStart - phase) / grid);
                const double startTarget = phase + k * grid;
                const std::int64_t qStart =
                    std::max<std::int64_t>(0, jsRoundInt64(rawStart + (startTarget - rawStart) * strength));
                const bool wasShown = static_cast<std::int64_t>(rawStart) >= from &&
                                      static_cast<std::int64_t>(rawStart) < to;
                const bool isShown = qStart >= from && qStart < to;
                out[i].insert(QStringLiteral("startTick"),
                              static_cast<double>(wasShown && !isShown ? static_cast<std::int64_t>(rawStart) : qStart));
            }

            // trimNewOverlaps (regionParams.ts lines 106-136).
            std::unordered_map<std::int64_t, std::vector<std::size_t>> groups;
            for (std::size_t i = 0; i < out.size(); ++i) {
                if (out[i].value(u"muted").toBool(false)) continue;
                const int ch = out[i].value(u"channel").toInt(0);
                const int pitch = out[i].value(u"pitch").toInt(0);
                groups[(static_cast<std::int64_t>(ch) << 8) | pitch].push_back(i);
            }
            std::vector<bool> dropped(out.size(), false);
            for (auto& [_, idxs] : groups) {
                if (idxs.size() < 2) continue;
                std::stable_sort(idxs.begin(), idxs.end(), [&](std::size_t x, std::size_t y) {
                    return out[x].value(u"startTick").toDouble() < out[y].value(u"startTick").toDouble();
                });
                for (std::size_t k = 0; k + 1 < idxs.size(); ++k) {
                    const std::size_t a = idxs[k];
                    const std::size_t b = idxs[k + 1];
                    if (!notesOverlap(out[a], out[b]) || notesOverlap(raw[a], raw[b])) continue;
                    const std::int64_t gap = static_cast<std::int64_t>(out[b].value(u"startTick").toDouble()) -
                                             static_cast<std::int64_t>(out[a].value(u"startTick").toDouble());
                    if (gap <= 0) {
                        dropped[a] = true;
                    } else {
                        out[a].insert(QStringLiteral("durationTick"), static_cast<double>(gap));
                        out[a] = fitExpressionToDuration(std::move(out[a]));
                    }
                }
            }
            std::vector<QJsonObject> filtered;
            filtered.reserve(out.size());
            for (std::size_t i = 0; i < out.size(); ++i) {
                if (!dropped[i]) filtered.push_back(std::move(out[i]));
            }
            out = std::move(filtered);
        }
    }

    const int transpose = clampInt(clip.value(u"transpose").toDouble(0.0), -127, 127);
    if (transpose != 0) {
        for (auto& n : out) {
            const int p = std::clamp(n.value(u"pitch").toInt(60) + transpose, 0, 127);
            n.insert(QStringLiteral("pitch"), p);
        }
    }
    const double velOffset = clip.value(u"velocityOffset").toDouble(0.0);
    if (std::isfinite(velOffset) && velOffset != 0.0) {
        for (auto& n : out) {
            const int v = clampInt(n.value(u"velocity").toDouble(100.0) + velOffset, 1, 127);
            n.insert(QStringLiteral("velocity"), v);
        }
    }

    QJsonArray res;
    for (auto& n : out) res.append(std::move(n));
    return res;
}

int assignmentTypeRank(const QJsonObject& a) {
    const auto type = a.value(u"type").toString();
    if (type == u"note" || type == u"kit") return 0;
    if (type == u"melodic" || type == u"degree") return 1;
    if (type == u"automation") {
        const auto kind = a.value(u"target").toObject().value(u"kind").toString();
        if (kind == u"cc") return 2;
        if (kind == u"pitchBend") return 3;
        if (kind == u"channelPressure") return 4;
        return 5;
    }
    return 6;
}

int degreeIndex(const QString& deg) {
    if (deg == u"root") return 0;
    if (deg == u"2nd") return 1;
    if (deg == u"3rd") return 2;
    if (deg == u"4th") return 3;
    if (deg == u"5th") return 4;
    if (deg == u"6th") return 5;
    if (deg == u"7th") return 6;
    return 0;
}

int assignmentNoteKey(const QJsonObject& a, const QJsonObject& instrument) {
    const auto type = a.value(u"type").toString();
    if (type == u"note" || type == u"melodic") return a.value(u"pitch").toInt(60);
    if (type == u"kit") return kitPadPitch(a.value(u"pad").toInt(0), instrument);
    if (type == u"degree") return (a.value(u"octave").toInt(3) + 2) * 12 + degreeIndex(a.value(u"degree").toString());
    if (type == u"automation") {
        const auto target = a.value(u"target").toObject();
        return target.value(u"kind").toString() == u"cc" ? target.value(u"cc").toInt(0) : 0;
    }
    return 0;
}

QString modeToField(const QString& mode) {
    if (mode == u"onOff") return QStringLiteral("on");
    if (mode == u"velocity" || mode == u"value" || mode == u"gate" || mode == u"tie" || mode == u"note" ||
        mode == u"octave" || mode == u"repeat" || mode == u"chance" || mode == u"offset" || mode == u"stepRate" ||
        mode == u"skip") {
        return mode;
    }
    return {};
}

}  // namespace

// ── Step rates ──────────────────────────────────────────────────────────────

std::optional<int> stepRateTicks(std::string_view rate) noexcept {
    for (const auto& e : kRateTable) {
        if (e.name == rate) return e.ticks;
    }
    return std::nullopt;
}

bool isValidStepRate(std::string_view rate) noexcept {
    return stepRateTicks(rate).has_value();
}

std::string_view nudgeStepRate(std::string_view rate, int delta) noexcept {
    int idx = -1;
    for (std::size_t i = 0; i < kStepRatesByTicks.size(); ++i) {
        if (kStepRatesByTicks[i] == rate) {
            idx = static_cast<int>(i);
            break;
        }
    }
    if (idx < 0) return rate;
    const int next = std::clamp(idx + delta, 0, static_cast<int>(kStepRatesByTicks.size()) - 1);
    return kStepRatesByTicks[static_cast<std::size_t>(next)];
}

// ── Deterministic hashing ───────────────────────────────────────────────────

std::uint32_t fnv1a32Bytes(std::span<const std::uint8_t> bytes) noexcept {
    std::uint32_t h = 0x811c9dc5u;
    for (std::uint8_t b : bytes) {
        h ^= static_cast<std::uint32_t>(b);
        h *= 0x01000193u;
    }
    return h;
}

std::uint32_t rowKeyHash(std::string_view rowId) noexcept {
    return fnv1a32Bytes(
        std::span<const std::uint8_t>(reinterpret_cast<const std::uint8_t*>(rowId.data()), rowId.size()));
}

std::uint32_t fnv1a32Uints(std::uint32_t a, std::uint32_t b, std::uint32_t c, std::uint32_t d) noexcept {
    const std::array<std::uint32_t, 4> u{a, b, c, d};
    std::uint32_t h = 0x811c9dc5u;
    for (std::uint32_t v : u) {
        h ^= (v & 0xffu);
        h *= 0x01000193u;
        h ^= ((v >> 8) & 0xffu);
        h *= 0x01000193u;
        h ^= ((v >> 16) & 0xffu);
        h *= 0x01000193u;
        h ^= ((v >> 24) & 0xffu);
        h *= 0x01000193u;
    }
    return h;
}

double mulberry32(std::uint32_t state) noexcept {
    std::uint32_t t = state + 0x6d2b79f5u;
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + ((t ^ (t >> 7)) * (t | 61u));
    return static_cast<double>(t ^ (t >> 14)) / 4294967296.0;
}

double stepHash(std::uint32_t seed, std::uint32_t rowKey, std::uint32_t step, std::uint32_t cycle) noexcept {
    return mulberry32(fnv1a32Uints(seed, rowKey, step, cycle));
}

double stepHash(std::uint32_t seed, std::string_view rowId, std::uint32_t step, std::uint32_t cycle) noexcept {
    return stepHash(seed, rowKeyHash(rowId), step, cycle);
}

// ── Playback order & scheduling ─────────────────────────────────────────────

std::vector<int> playOrder(int n, std::string_view mode, std::uint32_t seed, std::int64_t cycle, std::uint32_t rowKey,
                           std::optional<int> prevPos) {
    if (n <= 0) return {};
    if (n == 1) return {0};
    if (mode == "forward") {
        std::vector<int> out(static_cast<std::size_t>(n));
        std::iota(out.begin(), out.end(), 0);
        return out;
    }
    if (mode == "backward") {
        std::vector<int> out(static_cast<std::size_t>(n));
        for (int i = 0; i < n; ++i) out[static_cast<std::size_t>(i)] = n - 1 - i;
        return out;
    }
    if (mode == "pingPong") {
        std::vector<int> out;
        out.reserve(static_cast<std::size_t>(n * 2));
        for (int i = 0; i < n; ++i) out.push_back(i);
        for (int i = n - 1; i >= 0; --i) out.push_back(i);
        return out;
    }
    if (mode == "pendulum") {
        std::vector<int> out;
        out.reserve(static_cast<std::size_t>(n * 2 - 2));
        for (int i = 0; i < n; ++i) out.push_back(i);
        for (int i = n - 2; i >= 1; --i) out.push_back(i);
        return out;
    }
    if (mode == "shuffle") {
        const std::uint32_t sSeed = seed ^ kPlayOrderSaltShuffle;
        std::vector<int> arr(static_cast<std::size_t>(n));
        std::iota(arr.begin(), arr.end(), 0);
        for (int i = n - 1; i > 0; --i) {
            const int j = static_cast<int>(
                std::floor(stepHash(sSeed, rowKey, static_cast<std::uint32_t>(i), cycle) * static_cast<double>(i + 1)));
            std::swap(arr[static_cast<std::size_t>(i)], arr[static_cast<std::size_t>(j)]);
        }
        return arr;
    }
    if (mode == "random") {
        const std::uint32_t rSeed = seed ^ kPlayOrderSaltRandom;
        std::vector<int> out;
        out.reserve(static_cast<std::size_t>(n));
        for (int i = 0; i < n; ++i) {
            out.push_back(static_cast<int>(
                std::floor(stepHash(rSeed, rowKey, static_cast<std::uint32_t>(i), cycle) * static_cast<double>(n))));
        }
        return out;
    }
    if (mode == "wander") {
        const std::uint32_t wSeed = seed ^ kPlayOrderSaltWander;
        if (cycle <= 0) return wanderCycle(n, wSeed, rowKey, 0u, 0, true);
        if (prevPos.has_value()) {
            return wanderCycle(n, wSeed, rowKey, cycle, floorMod(*prevPos, n), false);
        }
        if (cycle > 16384) throw std::length_error("Wander replay exceeds the work budget. Supply wanderPos.");
        int pos = 0;
        for (std::int64_t c = 0; c < cycle; ++c) {
            const auto ord = wanderCycle(n, wSeed, rowKey, c, pos, c == 0);
            pos = ord.back();
        }
        return wanderCycle(n, wSeed, rowKey, cycle, pos, false);
    }
    // Unknown mode falls back to forward.
    std::vector<int> out(static_cast<std::size_t>(n));
    std::iota(out.begin(), out.end(), 0);
    return out;
}

std::vector<int> playOrder(int n, std::string_view mode, std::uint32_t seed, std::int64_t cycle,
                           std::string_view rowId, std::optional<int> prevPos) {
    return playOrder(n, mode, seed, cycle, rowKeyHash(rowId), prevPos);
}

std::vector<RowScheduleEntry> rowSchedule(const QJsonObject& row, std::uint32_t seed, std::uint32_t cycle) {
    const auto steps = row.value(u"steps").toArray();
    const int nSteps = static_cast<int>(steps.size());
    const int start = std::max(0, std::min(nSteps, row.value(u"loopStart").toInt(0)));
    const int end = std::max(start, std::min(nSteps, row.value(u"loopEnd").toInt(nSteps)));
    std::vector<int> active;
    for (int i = start; i < end; ++i) {
        if (!steps.at(i).toObject().value(u"skip").toBool(false)) active.push_back(i);
    }
    if (active.empty()) return {};
    const auto rowIdUtf8 = row.value(u"id").toString().toUtf8();
    const auto playback = row.value(u"playback").toString(QStringLiteral("forward")).toStdString();
    const auto rowRate = row.value(u"stepRate").toString(QStringLiteral("1/16"));
    const auto order = playOrder(static_cast<int>(active.size()), playback, seed, cycle,
                                 rowKeyHash(std::string_view(rowIdUtf8.constData(), static_cast<std::size_t>(rowIdUtf8.size()))));
    std::vector<RowScheduleEntry> out;
    out.reserve(order.size());
    std::int64_t cursor = 0;
    for (int pos : order) {
        const int stepIndex = active[static_cast<std::size_t>(pos)];
        const auto step = steps.at(stepIndex).toObject();
        const int len = stepRateTicksOrDefault(step.contains(u"stepRate") ? step.value(u"stepRate").toString() : rowRate);
        out.push_back(RowScheduleEntry{stepIndex, cursor, len});
        cursor += len;
    }
    return out;
}

std::int64_t patternMusicalLengthTicks(const QJsonObject& pattern, std::int64_t barTicks) {
    const auto cap = static_cast<std::uint64_t>(std::max<std::int64_t>(1, jsRoundInt64(64.0 * static_cast<double>(barTicks))));
    const std::uint32_t seed = readSeed(pattern.value(u"seed"), 1u);
    std::uint64_t acc = 0;
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        const auto row = rv.toObject();
        if (row.value(u"playback").toString() == u"random") continue;
        const auto sched = rowSchedule(row, seed, 0u);
        std::uint64_t cycleLen = 0;
        for (const auto& e : sched) cycleLen += static_cast<std::uint64_t>(std::max(0, e.lengthTicks));
        if (cycleLen == 0) continue;
        if (acc == 0) {
            acc = cycleLen;
        } else {
            const std::uint64_t g = std::gcd(acc, cycleLen);
            const std::uint64_t q = acc / g;
            if (q >= cap || cycleLen >= cap || q > cap / cycleLen) return static_cast<std::int64_t>(cap);
            acc = q * cycleLen;
        }
        if (acc >= cap) return static_cast<std::int64_t>(cap);
    }
    if (acc == 0) {
        const std::uint64_t lenSteps = static_cast<std::uint64_t>(std::max(1, pattern.value(u"lengthSteps").toInt(16)));
        const std::uint64_t rateTicks = static_cast<std::uint64_t>(
            stepRateTicksOrDefault(pattern.value(u"stepRate").toString(QStringLiteral("1/16"))));
        return static_cast<std::int64_t>(std::min(cap, lenSteps * rateTicks));
    }
    return static_cast<std::int64_t>(acc);
}

// ── Swing & repeats ─────────────────────────────────────────────────────────

std::int64_t swingDelay(std::int64_t tick, std::string_view division, double swing) noexcept {
    if (swing <= 0) return 0;
    const auto divOpt = stepRateTicks(division);
    if (!divOpt) return 0;
    const std::int64_t divTicks = *divOpt;
    if (tick < 0 || tick % divTicks != 0) return 0;
    const std::int64_t slot = tick / divTicks;
    if (slot % 2 != 1) return 0;
    return jsRoundInt64((static_cast<double>(divTicks) * static_cast<double>(swing)) / 200.0);
}

std::vector<std::int64_t> repeatPositions(std::int64_t totalTicks, int repeat, double distribution) {
    const int n = std::max(1, repeat);
    if (n == 1) return {0};
    const double exponent = std::pow(2.0, -static_cast<double>(distribution) / 100.0);
    std::vector<std::int64_t> out;
    out.reserve(static_cast<std::size_t>(n));
    for (int k = 0; k < n; ++k) {
        out.push_back(jsRoundInt64(static_cast<double>(totalTicks) *
                                   std::pow(static_cast<double>(k) / static_cast<double>(n), exponent)));
    }
    return out;
}

std::vector<int> repeatVelocities(int velocity, int repeat, double velocityRamp, double velocityCurve) {
    const int n = std::max(1, repeat);
    if (n == 1) return {clampInt(velocity, 1, 127)};
    const double curveExp = std::pow(2.0, static_cast<double>(velocityCurve) / 50.0);
    std::vector<int> out;
    out.reserve(static_cast<std::size_t>(n));
    for (int k = 0; k < n; ++k) {
        const double x = static_cast<double>(k) / static_cast<double>(n - 1);
        const double scaled =
            static_cast<double>(velocity) * (1.0 + (static_cast<double>(velocityRamp) / 100.0) * std::pow(x, curveExp));
        out.push_back(clampInt(scaled, 1, 127));
    }
    return out;
}

// ── Pitch resolution ────────────────────────────────────────────────────────

StepKey resolveStepKey(const QJsonValue& keyValue) {
    if (!keyValue.isObject()) return StepKey{0, "major"};
    const auto obj = keyValue.toObject();
    const auto mode = obj.value(u"mode").toString(QStringLiteral("major")).toStdString();
    const auto tonicVal = obj.value(u"tonic");
    if (tonicVal.isDouble()) {
        return StepKey{floorMod(static_cast<int>(std::fmod(jsRound(tonicVal.toDouble()), 12.0)), 12), mode};
    }
    if (tonicVal.isString()) {
        return StepKey{tonicToPc(tonicVal.toString()).value_or(0), mode};
    }
    return StepKey{0, mode};
}

int shortestTonicDelta(int fromTonic, int toTonic) noexcept {
    int d = floorMod(toTonic - fromTonic, 12);
    if (d > 6) d -= 12;
    return d;
}

int kitPadPitch(int pad, const QJsonObject& instrument) {
    const auto type = instrument.value(u"type").toString();
    if (type == u"drum") {
        return clampInt(instrument.value(u"baseNote").toDouble(36) + static_cast<double>(pad), 0, 127);
    }
    if (type == u"sampler") {
        const auto zones = instrument.value(u"zones").toArray();
        if (pad >= 0 && pad < zones.size()) {
            return std::clamp(zones.at(pad).toObject().value(u"rootNote").toInt(60), 0, 127);
        }
    }
    return clampInt(36.0 + static_cast<double>(pad), 0, 127);
}

int kitStepPitchBend(int padPitch, const QJsonObject& step) noexcept {
    const int baseOctave = static_cast<int>(std::floor(static_cast<double>(padPitch) / 12.0)) - 2;
    const double octShift = step.value(u"octave").isDouble() ? (step.value(u"octave").toDouble() - baseOctave) * 12.0 : 0;
    return clampInt(step.value(u"note").toDouble(0.0) + static_cast<double>(octShift), -48, 48);
}

std::optional<int> stepPitch(const QJsonObject& row, const QJsonObject& step, const QJsonObject& ctx) {
    const auto assign = row.value(u"assignment").toObject();
    const auto type = assign.value(u"type").toString();
    if (type == u"automation") return std::nullopt;
    if (type == u"kit") {
        return kitPadPitch(assign.value(u"pad").toInt(0), ctx.value(u"instrument").toObject());
    }

    const bool hasPattern = ctx.value(u"pattern").isObject();
    const auto pattern = hasPattern ? ctx.value(u"pattern").toObject() : QJsonObject{};
    const auto pitchSource = hasPattern ? pattern.value(u"pitchSource").toString() : QString{};
    const auto patternKey = resolveStepKey(hasPattern ? pattern.value(u"key") : QJsonValue{});
    const auto projectKey =
        resolveStepKey(ctx.contains(u"key") && !ctx.value(u"key").isNull() ? ctx.value(u"key")
                                                                           : (hasPattern ? pattern.value(u"key") : QJsonValue{}));
    const auto activeKey = (pitchSource == u"key") ? projectKey : patternKey;

    double pitch = 0.0;
    if (type == u"degree") {
        if (hasPattern && pitchSource != u"chords") return std::nullopt;
        if (!ctx.value(u"chords").isArray()) return std::nullopt;
        const auto chordOpt = chordAtTick(ctx.value(u"chords").toArray(), ctx.value(u"docTick").toDouble(0.0));
        if (!chordOpt) return std::nullopt;
        const auto& chord = *chordOpt;
        const auto qName = chord.value(u"quality").toString().toStdString();
        const auto* qDef = findChordQuality(qName);
        if (!qDef) return std::nullopt;
        const int root = chord.value(u"root").toInt(0);
        const int keyMask = scaleMask(activeKey.tonic, activeKey.mode);
        const int semi = degreeSemitones(assign.value(u"degree").toString().toStdString(), root, *qDef, keyMask);
        const double octave = step.value(u"octave").isDouble() ? step.value(u"octave").toDouble() : assign.value(u"octave").toDouble(3);
        pitch = static_cast<double>((octave + 2) * 12 + root + semi) + step.value(u"note").toDouble(0.0);
    } else {
        const double basePitch = assign.value(u"pitch").toDouble(60);
        const double pc = std::fmod(std::fmod(basePitch, 12.0) + 12.0, 12.0);
        const double base = step.value(u"octave").isDouble() ? (step.value(u"octave").toDouble() + 2) * 12 + pc : basePitch;
        pitch = static_cast<double>(base) + step.value(u"note").toDouble(0.0);
        if (hasPattern && pitchSource == u"key" && !pattern.value(u"noTranspose").toBool(false)) {
            pitch += static_cast<double>(shortestTonicDelta(patternKey.tonic, projectKey.tonic));
        }
        if (hasPattern && pattern.value(u"scaleQuantize").toBool(false)) {
            const auto patScale = pattern.value(u"scale").toString(QStringLiteral("chromatic")).toStdString();
            const std::string scaleId =
                (patScale != "chromatic") ? patScale : (pitchSource == u"key" ? activeKey.mode : std::string("chromatic"));
            if (scaleId != "chromatic") {
                const auto table = scaleRemap(scaleMask(activeKey.tonic, scaleId), 0);
                pitch = static_cast<double>(remapNote(table, clampInt(pitch, 0, 127)));
            }
        }
    }

    return clampInt(pitch, 0, 127);
}

// ── Normalization, compaction, validation, labels ───────────────────────────

QJsonObject normalizeStep(const QJsonObject& step) {
    QJsonObject cond;
    const auto rawCond = step.value(u"condition").toObject();
    const auto cType = rawCond.value(u"type").toString();
    if (cType == u"recurrence") {
        const int cycles = clampInt(rawCond.value(u"cycles").toDouble(2.0), 2, 16);
        const int iteration = clampInt(rawCond.value(u"iteration").toDouble(1.0), 1, cycles);
        cond = QJsonObject{{QStringLiteral("type"), QStringLiteral("recurrence")},
                           {QStringLiteral("cycles"), cycles},
                           {QStringLiteral("iteration"), iteration}};
    } else if (cType == u"first" || cType == u"last") {
        cond = QJsonObject{{QStringLiteral("type"), cType}};
    } else {
        cond = QJsonObject{{QStringLiteral("type"), QStringLiteral("always")}};
    }

    QJsonObject out{
        {QStringLiteral("on"), step.value(u"on").toBool(false)},
        {QStringLiteral("velocity"),
         step.value(u"velocity").isDouble() ? clampInt(step.value(u"velocity").toDouble(), 1, 127) : 100},
        {QStringLiteral("gate"), step.value(u"gate").isDouble() ? clampInt(step.value(u"gate").toDouble(), 1, 100) : 100},
        {QStringLiteral("tie"), step.value(u"tie").toBool(false)},
        {QStringLiteral("note"), step.value(u"note").isDouble() ? clampInt(step.value(u"note").toDouble(), -12, 12) : 0},
        {QStringLiteral("repeat"), step.value(u"repeat").isDouble() ? clampInt(step.value(u"repeat").toDouble(), 1, 16) : 1},
        {QStringLiteral("chance"),
         step.value(u"chance").isDouble() ? clampInt(step.value(u"chance").toDouble(), 0, 100) : 100},
        {QStringLiteral("offset"),
         step.value(u"offset").isDouble() ? clampInt(step.value(u"offset").toDouble(), -50, 50) : 0},
        {QStringLiteral("skip"), step.value(u"skip").toBool(false)},
        {QStringLiteral("condition"), cond},
        {QStringLiteral("articulation"),
         step.value(u"articulation").isDouble() ? clampInt(step.value(u"articulation").toDouble(), 0, 255) : 0},
        {QStringLiteral("velocityRamp"),
         step.value(u"velocityRamp").isDouble() ? clampInt(step.value(u"velocityRamp").toDouble(), -100, 100) : 0},
        {QStringLiteral("velocityCurve"),
         step.value(u"velocityCurve").isDouble() ? clampInt(step.value(u"velocityCurve").toDouble(), -100, 100) : 0},
        {QStringLiteral("distribution"),
         step.value(u"distribution").isDouble() ? clampInt(step.value(u"distribution").toDouble(), -100, 100) : 0},
    };
    if (step.value(u"octave").isDouble()) {
        out.insert(QStringLiteral("octave"), clampInt(step.value(u"octave").toDouble(), -2, 8));
    }
    if (step.value(u"stepRate").isString() && !step.value(u"stepRate").toString().isEmpty()) {
        out.insert(QStringLiteral("stepRate"), step.value(u"stepRate").toString());
    }
    if (step.value(u"value").isDouble() && std::isfinite(step.value(u"value").toDouble())) {
        const double v = step.value(u"value").toDouble();
        out.insert(QStringLiteral("value"), v == 0.0 ? 0.0 : v);
    }
    if (step.value(u"midiChannel").isDouble()) {
        out.insert(QStringLiteral("midiChannel"), clampInt(step.value(u"midiChannel").toDouble(), 1, 16));
    }
    return out;
}

QJsonObject compactStep(const QJsonObject& step) {
    const auto n = normalizeStep(step);
    QJsonObject out;
    if (n.value(u"on").toBool()) out.insert(QStringLiteral("on"), true);
    if (n.value(u"velocity").toInt() != 100) out.insert(QStringLiteral("velocity"), n.value(u"velocity").toInt());
    if (n.value(u"gate").toInt() != 100) out.insert(QStringLiteral("gate"), n.value(u"gate").toInt());
    if (n.value(u"tie").toBool()) out.insert(QStringLiteral("tie"), true);
    if (n.value(u"note").toInt() != 0) out.insert(QStringLiteral("note"), n.value(u"note").toInt());
    if (n.contains(u"octave")) out.insert(QStringLiteral("octave"), n.value(u"octave").toInt());
    if (n.value(u"repeat").toInt() != 1) out.insert(QStringLiteral("repeat"), n.value(u"repeat").toInt());
    if (n.value(u"chance").toInt() != 100) out.insert(QStringLiteral("chance"), n.value(u"chance").toInt());
    if (n.value(u"offset").toInt() != 0) out.insert(QStringLiteral("offset"), n.value(u"offset").toInt());
    if (n.contains(u"stepRate")) out.insert(QStringLiteral("stepRate"), n.value(u"stepRate").toString());
    if (n.value(u"skip").toBool()) out.insert(QStringLiteral("skip"), true);
    if (n.contains(u"value")) out.insert(QStringLiteral("value"), n.value(u"value"));
    if (n.value(u"condition").toObject().value(u"type").toString() != u"always") {
        out.insert(QStringLiteral("condition"), n.value(u"condition").toObject());
    }
    if (n.contains(u"midiChannel")) out.insert(QStringLiteral("midiChannel"), n.value(u"midiChannel").toInt());
    if (n.value(u"articulation").toInt() != 0) out.insert(QStringLiteral("articulation"), n.value(u"articulation").toInt());
    if (n.value(u"velocityRamp").toInt() != 0) out.insert(QStringLiteral("velocityRamp"), n.value(u"velocityRamp").toInt());
    if (n.value(u"velocityCurve").toInt() != 0) {
        out.insert(QStringLiteral("velocityCurve"), n.value(u"velocityCurve").toInt());
    }
    if (n.value(u"distribution").toInt() != 0) out.insert(QStringLiteral("distribution"), n.value(u"distribution").toInt());
    return out;
}

QJsonArray defaultSubrowsForAssignment(const QJsonObject& assignment) {
    const auto type = assignment.value(u"type").toString();
    if (type == u"melodic") return QJsonArray{QStringLiteral("note"), QStringLiteral("octave")};
    if (type == u"degree") return QJsonArray{QStringLiteral("velocity"), QStringLiteral("octave")};
    if (type == u"automation") return QJsonArray{QStringLiteral("value")};
    return QJsonArray{QStringLiteral("velocity"), QStringLiteral("gate")};
}

QJsonObject normalizeRow(const QJsonObject& partial, const QJsonObject& patternDefaults) {
    const int maxLen = clampInt(patternDefaults.value(u"lengthSteps").toDouble(16.0), 1, kStepPatternMaxSteps);
    const int lengthSteps =
        clampInt(partial.value(u"lengthSteps").isDouble() ? partial.value(u"lengthSteps").toDouble() : maxLen, 1, maxLen);
    const int loopEnd =
        clampInt(partial.value(u"loopEnd").isDouble() ? partial.value(u"loopEnd").toDouble() : lengthSteps, 1, lengthSteps);
    const int loopStart =
        clampInt(partial.value(u"loopStart").isDouble() ? partial.value(u"loopStart").toDouble() : 0.0, 0, loopEnd - 1);

    const auto assignment = partial.value(u"assignment").toObject();
    QJsonArray subrows;
    if (partial.value(u"subrows").isArray()) {
        QSet<QString> seen;
        for (const auto& sv : partial.value(u"subrows").toArray()) {
            const auto s = sv.toString();
            if (!seen.contains(s)) {
                seen.insert(s);
                subrows.append(s);
            }
        }
    } else {
        subrows = defaultSubrowsForAssignment(assignment);
    }

    const auto srcSteps = partial.value(u"steps").toArray();
    QJsonArray steps;
    for (int i = 0; i < lengthSteps; ++i) {
        steps.append(i < srcSteps.size() && srcSteps.at(i).isObject() ? compactStep(srcSteps.at(i).toObject())
                                                                      : QJsonObject{});
    }

    const QString defRate = patternDefaults.value(u"stepRate").toString(QStringLiteral("1/16"));
    const QString defPlay = patternDefaults.value(u"playback").toString(QStringLiteral("forward"));
    const double defChan = patternDefaults.value(u"midiChannel").toDouble(1);
    const QString defAuto = patternDefaults.value(u"automationMode").toString(QStringLiteral("latch"));

    QJsonObject row{
        {QStringLiteral("id"), partial.value(u"id").toString()},
        {QStringLiteral("assignment"), assignment},
        {QStringLiteral("mute"), partial.value(u"mute").toBool(false)},
        {QStringLiteral("solo"), partial.value(u"solo").toBool(false)},
        {QStringLiteral("lengthSteps"), lengthSteps},
        {QStringLiteral("loopStart"), loopStart},
        {QStringLiteral("loopEnd"), loopEnd},
        {QStringLiteral("stepRate"), partial.value(u"stepRate").isString() ? partial.value(u"stepRate").toString() : defRate},
        {QStringLiteral("playback"), partial.value(u"playback").isString() ? partial.value(u"playback").toString() : defPlay},
        {QStringLiteral("midiChannel"),
         clampInt(partial.value(u"midiChannel").isDouble() ? partial.value(u"midiChannel").toDouble() : defChan, 1, 16)},
        {QStringLiteral("automationMode"),
         partial.value(u"automationMode").isString() ? partial.value(u"automationMode").toString() : defAuto},
        {QStringLiteral("subrows"), subrows},
        {QStringLiteral("steps"), steps},
    };
    if (partial.value(u"name").isString()) row.insert(QStringLiteral("name"), partial.value(u"name").toString());
    if (partial.value(u"color").isString()) row.insert(QStringLiteral("color"), partial.value(u"color").toString());
    if (partial.value(u"subrowsExpanded").isBool()) {
        row.insert(QStringLiteral("subrowsExpanded"), partial.value(u"subrowsExpanded").toBool());
    }
    return row;
}

QJsonObject normalizePattern(const QJsonObject& partial) {
    const int lengthSteps =
        clampInt(partial.value(u"lengthSteps").isDouble() ? partial.value(u"lengthSteps").toDouble() : 16.0, 1,
                 kStepPatternMaxSteps);
    const QString stepRate =
        partial.value(u"stepRate").isString() ? partial.value(u"stepRate").toString() : QStringLiteral("1/16");
    const QString playback =
        partial.value(u"playback").isString() ? partial.value(u"playback").toString() : QStringLiteral("forward");
    const int midiChannel =
        clampInt(partial.value(u"midiChannel").isDouble() ? partial.value(u"midiChannel").toDouble() : 1.0, 1, 16);
    const QString automationMode =
        partial.value(u"automationMode").isString() ? partial.value(u"automationMode").toString() : QStringLiteral("latch");
    const std::uint32_t seed = readSeed(partial.value(u"seed"), 1u);

    const QJsonObject defaults{
        {QStringLiteral("lengthSteps"), lengthSteps},
        {QStringLiteral("stepRate"), stepRate},
        {QStringLiteral("playback"), playback},
        {QStringLiteral("midiChannel"), midiChannel},
        {QStringLiteral("automationMode"), automationMode},
    };
    QJsonArray rows;
    const auto srcRows = partial.value(u"rows").toArray();
    const qsizetype count = std::min<qsizetype>(srcRows.size(), kStepPatternMaxRows);
    for (qsizetype i = 0; i < count; ++i) {
        rows.append(normalizeRow(srcRows.at(i).toObject(), defaults));
    }

    QJsonObject out{
        {QStringLiteral("version"), 1},
        {QStringLiteral("seed"), static_cast<double>(seed)},
        {QStringLiteral("lengthSteps"), lengthSteps},
        {QStringLiteral("stepRate"), stepRate},
        {QStringLiteral("playback"), playback},
        {QStringLiteral("legato"), partial.value(u"legato").toBool(false)},
        {QStringLiteral("swing"), clampInt(partial.value(u"swing").toDouble(0.0), 0, 100)},
        {QStringLiteral("swingDivision"), partial.value(u"swingDivision").isString()
                                              ? partial.value(u"swingDivision").toString()
                                              : QStringLiteral("1/16")},
        {QStringLiteral("pitchSource"), partial.value(u"pitchSource").isString()
                                            ? partial.value(u"pitchSource").toString()
                                            : QStringLiteral("off")},
        {QStringLiteral("scale"), partial.value(u"scale").isString() ? partial.value(u"scale").toString()
                                                                     : QStringLiteral("chromatic")},
        {QStringLiteral("noTranspose"), partial.value(u"noTranspose").toBool(false)},
        {QStringLiteral("scaleQuantize"), partial.value(u"scaleQuantize").toBool(false)},
        {QStringLiteral("midiChannel"), midiChannel},
        {QStringLiteral("automationMode"), automationMode},
        {QStringLiteral("mono"), partial.value(u"mono").toBool(false)},
        {QStringLiteral("name"), partial.value(u"name").isString() ? partial.value(u"name").toString()
                                                                   : QStringLiteral("Pattern")},
        {QStringLiteral("rows"), rows},
    };
    if (partial.value(u"key").isObject()) {
        const auto k = resolveStepKey(partial.value(u"key"));
        out.insert(QStringLiteral("key"), QJsonObject{{QStringLiteral("tonic"), k.tonic},
                                                      {QStringLiteral("mode"), QString::fromStdString(k.mode)}});
    }
    if (partial.value(u"rowSort").isString()) {
        const auto rs = partial.value(u"rowSort").toString();
        if (rs != u"none" && isValidRowSort(rs)) out.insert(QStringLiteral("rowSort"), rs);
    }
    return out;
}

QStringList validateStepPattern(const QJsonObject& pattern) {
    return validateStoredStepPattern(pattern);
}

QString stepNoteName(int pitch) {
    static constexpr std::array<const char*, 12> kNames{
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
    const int p = std::clamp(pitch, 0, 127);
    const int oct = static_cast<int>(std::floor(static_cast<double>(p) / 12.0)) - 2;
    return QString::fromLatin1(kNames[static_cast<std::size_t>(p % 12)]) + QString::number(oct);
}

std::optional<int> parseStepNoteName(const QString& name) {
    static const QRegularExpression re(QStringLiteral("^([A-Ga-g])([#b]?)(-?\\d)$"));
    const auto m = re.match(name.trimmed());
    if (!m.hasMatch()) return std::nullopt;
    const QChar letter = m.captured(1).toUpper().at(0);
    int base = 0;
    switch (letter.toLatin1()) {
        case 'C': base = 0; break;
        case 'D': base = 2; break;
        case 'E': base = 4; break;
        case 'F': base = 5; break;
        case 'G': base = 7; break;
        case 'A': base = 9; break;
        case 'B': base = 11; break;
        default: return std::nullopt;
    }
    const QString accStr = m.captured(2);
    const int acc = (accStr == u"#") ? 1 : (accStr == u"b" ? -1 : 0);
    const int oct = m.captured(3).toInt();
    const int pitch = (oct + 2) * 12 + base + acc;
    return (pitch >= 0 && pitch <= 127) ? std::optional<int>(pitch) : std::nullopt;
}

QString rowLabel(const QJsonObject& row, const QJsonObject& instrument) {
    const auto explicitName = row.value(u"name").toString();
    if (!explicitName.trimmed().isEmpty()) return explicitName;
    const auto a = row.value(u"assignment").toObject();
    const auto type = a.value(u"type").toString();
    const auto instType = instrument.value(u"type").toString();
    if (type == u"kit") {
        const int pad = a.value(u"pad").toInt(0);
        if (instType == u"drum") {
            const auto pads = instrument.value(u"pads").toArray();
            if (pad >= 0 && pad < pads.size()) {
                const auto pn = pads.at(pad).toObject().value(u"name").toString();
                if (!pn.isEmpty()) return pn;
            }
            return QStringLiteral("Pad %1").arg(pad + 1);
        }
        if (instType == u"sampler") {
            const auto zones = instrument.value(u"zones").toArray();
            if (pad >= 0 && pad < zones.size()) {
                const auto zn = zones.at(pad).toObject().value(u"name").toString();
                if (!zn.isEmpty()) return zn;
            }
            return QStringLiteral("Pad %1").arg(pad + 1);
        }
        if (const char* gm = gmLaneNameForPitch(36 + pad)) return QString::fromLatin1(gm);
        return QStringLiteral("Pad %1").arg(pad + 1);
    }
    if (type == u"note") {
        const int pitch = a.value(u"pitch").toInt(60);
        const bool isNonMelodic =
            (instType == u"drum") || (instType == u"sampler" && instrument.value(u"oneShot").toBool(false));
        if (isNonMelodic) {
            if (const char* gm = gmLaneNameForPitch(pitch)) return QString::fromLatin1(gm);
        }
        return stepNoteName(pitch);
    }
    if (type == u"melodic") return stepNoteName(a.value(u"pitch").toInt(60));
    if (type == u"degree") {
        const auto deg = a.value(u"degree").toString();
        const QString lbl = (deg == u"root") ? QStringLiteral("Root") : deg;
        return QStringLiteral("%1 : %2").arg(lbl).arg(a.value(u"octave").toInt(3));
    }
    if (type == u"automation") {
        const auto t = a.value(u"target").toObject();
        const auto kind = t.value(u"kind").toString();
        if (kind == u"cc") return QStringLiteral("CC %1").arg(t.value(u"cc").toInt(0));
        if (kind == u"pitchBend") return QStringLiteral("Pitch Bend");
        if (kind == u"channelPressure") return QStringLiteral("Channel Pressure");
        return t.value(u"param").toString();
    }
    return QStringLiteral("Row");
}

InferredAssignment assignmentFromRowName(const QString& name, const QJsonObject& instrument) {
    const QString trimmed = name.trimmed();
    const QString lower = trimmed.toLower();
    const auto instType = instrument.value(u"type").toString();

    if (instType == u"drum") {
        const auto pads = instrument.value(u"pads").toArray();
        for (qsizetype i = 0; i < pads.size(); ++i) {
            if (pads.at(i).toObject().value(u"name").toString().toLower() == lower) {
                return {QJsonObject{{QStringLiteral("type"), QStringLiteral("kit")},
                                    {QStringLiteral("pad"), static_cast<int>(i)}},
                        std::nullopt};
            }
        }
    } else if (instType == u"sampler") {
        const auto zones = instrument.value(u"zones").toArray();
        for (qsizetype i = 0; i < zones.size() && i < 16; ++i) {
            if (zones.at(i).toObject().value(u"name").toString().toLower() == lower) {
                return {QJsonObject{{QStringLiteral("type"), QStringLiteral("kit")},
                                    {QStringLiteral("pad"), static_cast<int>(i)}},
                        std::nullopt};
            }
        }
    }

    static const QRegularExpression ccRe(QStringLiteral("^cc\\s*(\\d+)$"), QRegularExpression::CaseInsensitiveOption);
    if (const auto m = ccRe.match(trimmed); m.hasMatch()) {
        const int cc = m.captured(1).toInt();
        if (cc >= 0 && cc <= 127) {
            return {QJsonObject{{QStringLiteral("type"), QStringLiteral("automation")},
                                {QStringLiteral("target"),
                                 QJsonObject{{QStringLiteral("kind"), QStringLiteral("cc")}, {QStringLiteral("cc"), cc}}}},
                    std::nullopt};
        }
    }
    if (lower == u"pitch bend" || lower == u"pitchbend") {
        return {QJsonObject{{QStringLiteral("type"), QStringLiteral("automation")},
                            {QStringLiteral("target"),
                             QJsonObject{{QStringLiteral("kind"), QStringLiteral("pitchBend")}}}},
                std::nullopt};
    }
    if (lower == u"channel pressure" || lower == u"channelpressure") {
        return {QJsonObject{{QStringLiteral("type"), QStringLiteral("automation")},
                            {QStringLiteral("target"),
                             QJsonObject{{QStringLiteral("kind"), QStringLiteral("channelPressure")}}}},
                std::nullopt};
    }

    static const QRegularExpression degRe(QStringLiteral("^(root|2nd|3rd|4th|5th|6th|7th)\\s*:\\s*(-?\\d+)$"),
                                          QRegularExpression::CaseInsensitiveOption);
    if (const auto m = degRe.match(trimmed); m.hasMatch()) {
        return {QJsonObject{{QStringLiteral("type"), QStringLiteral("degree")},
                            {QStringLiteral("degree"), m.captured(1).toLower()},
                            {QStringLiteral("octave"), clampInt(m.captured(2).toInt(), -2, 8)}},
                std::nullopt};
    }

    for (const auto& gm : kGmDrumLanes) {
        if (lower == QString::fromLatin1(gm.name).toLower()) {
            if (instType == u"drum") {
                const int idx = gm.pitch - instrument.value(u"baseNote").toInt(36);
                if (idx >= 0 && idx < instrument.value(u"pads").toArray().size()) {
                    return {QJsonObject{{QStringLiteral("type"), QStringLiteral("kit")}, {QStringLiteral("pad"), idx}},
                            std::nullopt};
                }
            }
            return {QJsonObject{{QStringLiteral("type"), QStringLiteral("note")}, {QStringLiteral("pitch"), gm.pitch}},
                    QString::fromLatin1(gm.name)};
        }
    }
    if (const auto aliasPitch = findDrumAlias(lower)) {
        if (instType == u"drum") {
            const int idx = *aliasPitch - instrument.value(u"baseNote").toInt(36);
            if (idx >= 0 && idx < instrument.value(u"pads").toArray().size()) {
                return {QJsonObject{{QStringLiteral("type"), QStringLiteral("kit")}, {QStringLiteral("pad"), idx}},
                        std::nullopt};
            }
        }
        return {QJsonObject{{QStringLiteral("type"), QStringLiteral("note")}, {QStringLiteral("pitch"), *aliasPitch}},
                trimmed};
    }

    if (const auto notePitch = parseStepNoteName(trimmed)) {
        return {QJsonObject{{QStringLiteral("type"), QStringLiteral("note")}, {QStringLiteral("pitch"), *notePitch}},
                std::nullopt};
    }

    return {QJsonObject{{QStringLiteral("type"), QStringLiteral("note")}, {QStringLiteral("pitch"), 60}}, trimmed};
}

// ── Pattern text format (SQ47) ──────────────────────────────────────────────

QString patternToText(const QJsonObject& pattern, const QJsonObject& instrument) {
    const auto patRate = pattern.value(u"stepRate").toString(QStringLiteral("1/16"));
    QStringList lines;
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        const auto row = rv.toObject();
        const QString label = rowLabel(row, instrument);
        const auto rowRate = row.value(u"stepRate").toString(patRate);
        const QString ratePart = (rowRate != patRate) ? QStringLiteral(" | %1").arg(rowRate) : QString{};
        const auto steps = row.value(u"steps").toArray();
        QString chars;
        chars.reserve(steps.size());
        for (const auto& sv : steps) {
            const auto st = sv.toObject();
            if (st.value(u"skip").toBool(false)) chars.append(u'_');
            else if (st.value(u"tie").toBool(false)) chars.append(u'-');
            else if (!st.value(u"on").toBool(false)) chars.append(u'.');
            else {
                const int vel = st.value(u"velocity").toInt(100);
                if (vel >= 120) chars.append(u'X');
                else if (vel <= 60) chars.append(u'o');
                else chars.append(u'x');
            }
        }
        QStringList groups;
        for (qsizetype i = 0; i < chars.size(); i += 4) groups.append(chars.mid(i, 4));
        lines.append(QStringLiteral("%1%2: %3").arg(label, ratePart, groups.join(u' ')));
    }
    return lines.join(u'\n');
}

std::vector<ParsedPatternLine> parsePatternTextLines(const QString& text, QString* error) {
    if (error) error->clear();
    static const QRegularExpression lineSplit(QStringLiteral("\\r?\\n"));
    static const QRegularExpression wsOrPipe(QStringLiteral("[\\s|]+"));
    const QStringList lines = text.split(lineSplit);
    std::vector<ParsedPatternLine> parsed;
    for (const QString& raw : lines) {
        const QString trimmed = raw.trimmed();
        if (trimmed.isEmpty() || trimmed.startsWith(u'#')) continue;
        const qsizetype colon = trimmed.lastIndexOf(u':');
        if (colon <= 0) {
            if (error) {
                *error = QStringLiteral("Invalid pattern text line \"%1\". Expected \"<row name> [| rate]: <steps>\".")
                             .arg(trimmed);
            }
            return {};
        }
        const QString header = trimmed.left(colon).trimmed();
        const QString stepsPart = trimmed.mid(colon + 1);
        QString name = header;
        std::optional<QString> stepRate;
        const qsizetype pipe = header.lastIndexOf(u'|');
        if (pipe > 0) {
            name = header.left(pipe).trimmed();
            const QString rateText = header.mid(pipe + 1).trimmed();
            if (!isValidStepRate(rateText.toStdString())) {
                if (error) *error = QStringLiteral("Invalid step rate \"%1\" on row \"%2\".").arg(rateText, name);
                return {};
            }
            stepRate = rateText;
        }
        QString compactChars = stepsPart;
        compactChars.remove(wsOrPipe);
        if (compactChars.isEmpty()) {
            if (error) *error = QStringLiteral("Row \"%1\" has no step characters after \":\".").arg(name);
            return {};
        }
        if (compactChars.size() > kStepPatternMaxSteps) {
            if (error) {
                *error = QStringLiteral("Row \"%1\" has %2 steps; maximum is %3.")
                             .arg(name)
                             .arg(compactChars.size())
                             .arg(kStepPatternMaxSteps);
            }
            return {};
        }
        QJsonArray steps;
        for (qsizetype i = 0; i < compactChars.size(); ++i) {
            const QChar ch = compactChars.at(i);
            if (ch == u'x') steps.append(QJsonObject{{QStringLiteral("on"), true}});
            else if (ch == u'X') steps.append(QJsonObject{{QStringLiteral("on"), true}, {QStringLiteral("velocity"), 127}});
            else if (ch == u'o') steps.append(QJsonObject{{QStringLiteral("on"), true}, {QStringLiteral("velocity"), 50}});
            else if (ch == u'.') steps.append(QJsonObject{});
            else if (ch == u'-') steps.append(QJsonObject{{QStringLiteral("tie"), true}});
            else if (ch == u'_') steps.append(QJsonObject{{QStringLiteral("skip"), true}});
            else {
                if (error) {
                    *error = QStringLiteral(
                                 "Invalid pattern step character \"%1\". Valid characters: x (on), X (vel 127), o "
                                 "(vel 50), . (off), - (tie), _ (skip).")
                                 .arg(ch);
                }
                return {};
            }
        }
        parsed.push_back(ParsedPatternLine{name, stepRate, steps});
    }
    return parsed;
}

QJsonObject patternFromText(const QString& text, const QJsonObject& options, QString* error) {
    QString parseErr;
    const auto lines = parsePatternTextLines(text, &parseErr);
    if (!parseErr.isEmpty()) {
        if (error) *error = parseErr;
        return {};
    }
    int lengthSteps = 16;
    if (!lines.empty()) {
        int maxSteps = 1;
        for (const auto& l : lines) maxSteps = std::max(maxSteps, static_cast<int>(l.steps.size()));
        lengthSteps = clampInt(maxSteps, 1, kStepPatternMaxSteps);
    }
    const QString baseRate =
        options.value(u"stepRate").isString() ? options.value(u"stepRate").toString() : QStringLiteral("1/16");
    const auto instrument = options.value(u"instrument").toObject();
    const QJsonObject defaults{
        {QStringLiteral("lengthSteps"), lengthSteps},
        {QStringLiteral("stepRate"), baseRate},
        {QStringLiteral("playback"), QStringLiteral("forward")},
        {QStringLiteral("midiChannel"), 1},
        {QStringLiteral("automationMode"), QStringLiteral("latch")},
    };
    QJsonArray rows;
    for (std::size_t i = 0; i < lines.size(); ++i) {
        const auto& line = lines[i];
        const auto inferred = assignmentFromRowName(line.name, instrument);
        QJsonObject partial{
            {QStringLiteral("id"), QStringLiteral("row_%1").arg(i + 1)},
            {QStringLiteral("assignment"), inferred.assignment},
            {QStringLiteral("lengthSteps"), static_cast<int>(line.steps.size())},
            {QStringLiteral("loopStart"), 0},
            {QStringLiteral("loopEnd"), static_cast<int>(line.steps.size())},
            {QStringLiteral("stepRate"), line.stepRate.value_or(baseRate)},
            {QStringLiteral("steps"), line.steps},
        };
        if (inferred.customName.has_value()) partial.insert(QStringLiteral("name"), *inferred.customName);
        rows.append(normalizeRow(partial, defaults));
    }
    QJsonObject pat{
        {QStringLiteral("name"), options.value(u"name").isString() ? options.value(u"name").toString()
                                                                   : QStringLiteral("Pattern")},
        {QStringLiteral("seed"), static_cast<double>(readSeed(options.value(u"seed"), 1u))},
        {QStringLiteral("lengthSteps"), lengthSteps},
        {QStringLiteral("stepRate"), baseRate},
        {QStringLiteral("rows"), rows},
    };
    return normalizePattern(pat);
}

// ── Pattern expansion (SQ9-SQ19, SQ41-SQ42, SQ60) ───────────────────────────

QJsonObject expandPattern(const QJsonObject& pattern, const QJsonObject& ctx) {
    const double clipLengthTicks = ctx.value(u"clipLengthTicks").toDouble(0.0);
    std::optional<double> loopLengthTicks;
    if (ctx.value(u"loopLengthTicks").isDouble()) loopLengthTicks = ctx.value(u"loopLengthTicks").toDouble();
    const double patternPhaseTicks = ctx.value(u"patternPhaseTicks").toDouble(0.0);
    const auto resourceError = [](const QString& message) {
        return QJsonObject{{"notes", QJsonArray{}}, {"controllers", QJsonArray{}},
                           {"deviceAutomation", QJsonArray{}}, {"error", message}};
    };
    if (loopLengthTicks && *loopLengthTicks > 0 &&
        std::ceil(std::max(0.0, clipLengthTicks) / std::max(1.0, jsRound(*loopLengthTicks))) > 16384) {
        return resourceError(QStringLiteral("Pattern expansion exceeds 16384 loop segments."));
    }
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        const auto row = rv.toObject();
        const auto state = ctx.value(u"rowCycles").toObject().value(row.value(u"id").toString()).toObject();
        if (row.value(u"steps").toArray().size() > 1 && row.value(u"playback").toString() == u"wander" &&
            state.value(u"cycleOffset").toDouble() > 16384 &&
            !state.value(u"wanderPos").isDouble()) {
            return resourceError(QStringLiteral("Wander replay exceeds the work budget. Supply wanderPos."));
        }
    }
    std::size_t occurrenceBudget = 262144;
    const auto segments = buildSegments(clipLengthTicks, loopLengthTicks, patternPhaseTicks);
    const auto rows = pattern.value(u"rows").toArray();
    if (segments.empty() || rows.isEmpty()) {
        return QJsonObject{{QStringLiteral("notes"), QJsonArray{}},
                           {QStringLiteral("controllers"), QJsonArray{}},
                           {QStringLiteral("deviceAutomation"), QJsonArray{}}};
    }

    bool hasSolo = false;
    for (const auto& rv : rows) {
        if (rv.toObject().value(u"solo").toBool(false)) {
            hasSolo = true;
            break;
        }
    }

    const std::uint32_t seed = readSeed(pattern.value(u"seed"), 1u);
    const double patMidiChannel = pattern.value(u"midiChannel").toDouble(1);
    const double patSwing = pattern.value(u"swing").toDouble(0);
    const auto patSwingDiv = pattern.value(u"swingDivision").toString(QStringLiteral("1/16")).toStdString();
    const bool patLegato = pattern.value(u"legato").toBool(false);
    const double clipStartDocTick = ctx.value(u"clipStartDocTick").toDouble(0.0);
    const auto rowCycles = ctx.value(u"rowCycles").toObject();

    QJsonArray notes;
    std::vector<QJsonObject> controllerLanes;
    QHash<QString, std::size_t> controllerIndex;
    QJsonArray deviceAutomation;

    QJsonObject pitchCtxBase;
    pitchCtxBase.insert(QStringLiteral("pattern"), pattern);
    if (ctx.value(u"chords").isArray()) pitchCtxBase.insert(QStringLiteral("chords"), ctx.value(u"chords"));
    if (ctx.contains(u"key") && !ctx.value(u"key").isNull()) pitchCtxBase.insert(QStringLiteral("key"), ctx.value(u"key"));
    if (ctx.value(u"instrument").isObject()) {
        pitchCtxBase.insert(QStringLiteral("instrument"), ctx.value(u"instrument"));
    }

    for (const auto& rv : rows) {
        const auto row = rv.toObject();
        const bool muted = row.value(u"mute").toBool(false) || (hasSolo && !row.value(u"solo").toBool(false));
        if (muted) continue;

        const QString rowId = row.value(u"id").toString();
        const auto rowIdUtf8 = rowId.toUtf8();
        const std::uint32_t rowKey =
            rowKeyHash(std::string_view(rowIdUtf8.constData(), static_cast<std::size_t>(rowIdUtf8.size())));
        const auto occurrences = rowSegmentOccurrences(row, seed, segments, rowCycles.value(rowId).toObject(), occurrenceBudget);
        if (occurrences.exceededBudget) return resourceError(QStringLiteral("Pattern expansion exceeds 262144 scheduled steps."));
        const auto& perSegment = occurrences.perSegment;
        const auto lastCycle = occurrences.lastCycle;

        const auto assignment = row.value(u"assignment").toObject();
        const auto assignType = assignment.value(u"type").toString();

        if (assignType == u"automation") {
            const auto target = assignment.value(u"target").toObject();
            const double rCh = row.value(u"midiChannel").toDouble(0);
            const double effectiveCh = (rCh != 0) ? rCh : (patMidiChannel != 0 ? patMidiChannel : 1);
            const double rowChannel = std::clamp(effectiveCh - 1, 0.0, 15.0);
            const auto autoMode = row.value(u"automationMode").toString(QStringLiteral("latch"));
            const QString interpolation = (autoMode == u"slide") ? QStringLiteral("linear") : QStringLiteral("step");

            struct AutoPt {
                QString id;
                std::int64_t tick = 0;
                double value = 0.0;
            };
            std::vector<AutoPt> pts;
            for (std::size_t sIdx = 0; sIdx < segments.size(); ++sIdx) {
                const auto& seg = segments[sIdx];
                for (const auto& occ : perSegment[sIdx]) {
                    const auto& step = occ.step;
                    if (!step.value(u"on").toBool(false)) continue;
                    if (!conditionPasses(step.value(u"condition").toObject(), occ.cycle, lastCycle)) continue;
                    const double chance = step.value(u"chance").toDouble(100);
                    if (chance <= 0) continue;
                    if (chance < 100 &&
                        stepHash(seed, rowKey, static_cast<std::uint32_t>(occ.stepIndex),
                                 static_cast<std::uint32_t>(occ.cycle)) *
                                100.0 >=
                            static_cast<double>(chance)) {
                        continue;
                    }
                    const std::int64_t swung = occ.rawStartTick + swingDelay(occ.rawStartTick, patSwingDiv, patSwing);
                    const std::int64_t offsetTicks =
                        jsRoundInt64((step.value(u"offset").toDouble(0.0) / 100.0) * static_cast<double>(occ.lengthTicks));
                    std::int64_t rawTick = swung + offsetTicks;
                    if (seg.phase == 0 && rawTick < 0) rawTick = 0;
                    if (rawTick < seg.phase || rawTick >= seg.phase + seg.segLen) continue;
                    const std::int64_t tick = seg.segStart + (rawTick - seg.phase);
                    const double val =
                        step.value(u"value").isDouble() ? step.value(u"value").toDouble() : defaultAutomationValue(target);
                    pts.push_back(AutoPt{
                        QStringLiteral("pa:%1:%2:%3:%4").arg(rowId).arg(seg.segIdx).arg(occ.cycle).arg(occ.stepIndex),
                        tick, val == 0.0 ? 0.0 : val});
                }
            }
            if (pts.empty()) continue;
            std::stable_sort(pts.begin(), pts.end(), [](const AutoPt& a, const AutoPt& b) { return a.tick < b.tick; });
            std::vector<AutoPt> deduped;
            deduped.reserve(pts.size());
            for (const auto& pt : pts) {
                if (!deduped.empty() && deduped.back().tick == pt.tick) deduped.back() = pt;
                else deduped.push_back(pt);
            }

            const auto kind = target.value(u"kind").toString();
            if (kind == u"device") {
                QJsonArray outPts;
                for (const auto& pt : deduped) {
                    outPts.append(QJsonObject{{QStringLiteral("tick"), static_cast<double>(pt.tick)},
                                              {QStringLiteral("value"), pt.value}});
                }
                deviceAutomation.append(QJsonObject{{QStringLiteral("rowId"), rowId},
                                                    {QStringLiteral("target"), target},
                                                    {QStringLiteral("automationMode"), autoMode},
                                                    {QStringLiteral("points"), outPts}});
            } else {
                const auto [lo, hi] = controllerValueRange(kind);
                const QString key = QStringLiteral("%1|%2|%3")
                                        .arg(kind,
                                             kind == u"cc" ? QString::number(target.value(u"cc").toInt(0)) : QString{},
                                             QString::number(rowChannel));
                QJsonArray clampedPoints;
                for (const auto& pt : deduped) {
                    clampedPoints.append(QJsonObject{{QStringLiteral("id"), pt.id},
                                                     {QStringLiteral("tick"), static_cast<double>(pt.tick)},
                                                     {QStringLiteral("value"), clampInt(pt.value, lo, hi)}});
                }
                if (const auto it = controllerIndex.constFind(key); it != controllerIndex.constEnd()) {
                    auto& lane = controllerLanes[it.value()];
                    std::vector<QJsonObject> merged;
                    for (const auto& pv : lane.value(u"points").toArray()) merged.push_back(pv.toObject());
                    for (const auto& pv : clampedPoints) merged.push_back(pv.toObject());
                    std::stable_sort(merged.begin(), merged.end(), [](const QJsonObject& a, const QJsonObject& b) {
                        return a.value(u"tick").toDouble() < b.value(u"tick").toDouble();
                    });
                    QJsonArray mergedArr;
                    for (auto& m : merged) mergedArr.append(std::move(m));
                    lane.insert(QStringLiteral("points"), mergedArr);
                } else {
                    QJsonObject lane{
                        {QStringLiteral("id"), QStringLiteral("p:%1").arg(rowId)},
                        {QStringLiteral("kind"), kind},
                        {QStringLiteral("channel"), rowChannel},
                        {QStringLiteral("interpolation"), interpolation},
                        {QStringLiteral("points"), clampedPoints},
                    };
                    if (kind == u"cc") lane.insert(QStringLiteral("cc"), target.value(u"cc").toInt(0));
                    controllerIndex.insert(key, controllerLanes.size());
                    controllerLanes.push_back(std::move(lane));
                }
            }
            continue;
        }

        // Note, melodic, kit or degree row.
        for (std::size_t sIdx = 0; sIdx < segments.size(); ++sIdx) {
            const auto& seg = segments[sIdx];
            const auto& occs = perSegment[sIdx];
            for (std::size_t i = 0; i < occs.size(); ++i) {
                const auto& occ = occs[i];
                const auto& step = occ.step;
                if (step.value(u"tie").toBool(false)) continue;
                if (!step.value(u"on").toBool(false)) continue;
                if (!conditionPasses(step.value(u"condition").toObject(), occ.cycle, lastCycle)) continue;
                const double chance = step.value(u"chance").toDouble(100);
                if (chance <= 0) continue;
                if (chance < 100 &&
                    stepHash(seed, rowKey, static_cast<std::uint32_t>(occ.stepIndex),
                             static_cast<std::uint32_t>(occ.cycle)) *
                            100.0 >=
                        static_cast<double>(chance)) {
                    continue;
                }

                // Tie chain (SQ12).
                std::vector<const ScheduledOccurrence*> chain;
                chain.push_back(&occ);
                for (std::size_t j = i + 1; j < occs.size(); ++j) {
                    const auto& next = occs[j];
                    if (!next.step.value(u"tie").toBool(false)) break;
                    if (!conditionPasses(next.step.value(u"condition").toObject(), next.cycle, lastCycle)) break;
                    const double nextChance = next.step.value(u"chance").toDouble(100);
                    if (nextChance <= 0) break;
                    if (nextChance < 100 &&
                        stepHash(seed, rowKey, static_cast<std::uint32_t>(next.stepIndex),
                                 static_cast<std::uint32_t>(next.cycle)) *
                                100.0 >=
                            static_cast<double>(nextChance)) {
                        break;
                    }
                    chain.push_back(&next);
                }

                const std::int64_t swung = occ.rawStartTick + swingDelay(occ.rawStartTick, patSwingDiv, patSwing);
                const std::int64_t offsetTicks =
                    jsRoundInt64((step.value(u"offset").toDouble(0.0) / 100.0) * static_cast<double>(occ.lengthTicks));
                std::int64_t rawTick = swung + offsetTicks;
                if (seg.phase == 0 && rawTick < 0) rawTick = 0;
                if (rawTick < seg.phase || rawTick >= seg.phase + seg.segLen) continue;

                const std::int64_t contentStart = seg.segStart + (rawTick - seg.phase);
                pitchCtxBase.insert(QStringLiteral("docTick"), clipStartDocTick + static_cast<double>(contentStart));
                const auto pitchOpt = stepPitch(row, step, pitchCtxBase);
                if (!pitchOpt) continue;
                const int pitch = *pitchOpt;

                const auto& lastOcc = *chain.back();
                const double lastGate = lastOcc.step.value(u"gate").toDouble(100);
                const int repeat = clampInt(step.value(u"repeat").toDouble(1.0), 1, 16);
                const int velocity = clampInt(step.value(u"velocity").toDouble(100.0), 1, 127);
                const double ch1 = step.value(u"midiChannel").isDouble()
                                    ? step.value(u"midiChannel").toDouble()
                                    : (row.value(u"midiChannel").isDouble() ? row.value(u"midiChannel").toDouble()
                                                                            : patMidiChannel);
                const int channel = clampInt(ch1 - 1, 0, 15);
                const int kitBend = (assignType == u"kit") ? kitStepPitchBend(pitch, step) : 0;

                if (repeat == 1) {
                    std::int64_t prefixTicks = 0;
                    for (std::size_t c = 0; c + 1 < chain.size(); ++c) prefixTicks += chain[c]->lengthTicks;
                    std::int64_t durationTick = std::max<std::int64_t>(
                        1, prefixTicks + jsRoundInt64((static_cast<double>(lastOcc.lengthTicks) * lastGate) / 100.0));
                    if (patLegato && lastGate == 100) durationTick += 1;
                    const std::int64_t maxDur = seg.segEnd - contentStart;
                    if (maxDur <= 0) continue;
                    if (durationTick > maxDur) durationTick = maxDur;
                    QJsonObject note{
                        {QStringLiteral("id"),
                         QStringLiteral("p:%1:%2:%3:%4:0").arg(rowId).arg(seg.segIdx).arg(occ.cycle).arg(occ.stepIndex)},
                        {QStringLiteral("pitch"), pitch},
                        {QStringLiteral("velocity"), velocity},
                        {QStringLiteral("startTick"), static_cast<double>(contentStart)},
                        {QStringLiteral("durationTick"), static_cast<double>(durationTick)},
                        {QStringLiteral("channel"), channel},
                    };
                    if (kitBend != 0) {
                        note.insert(QStringLiteral("expression"),
                                    QJsonObject{{QStringLiteral("pitch"),
                                                 QJsonArray{QJsonObject{{QStringLiteral("tick"), 0},
                                                                        {QStringLiteral("value"), kitBend}}}}});
                    }
                    notes.append(std::move(note));
                } else {
                    std::int64_t chainLen = 0;
                    for (const auto* c : chain) chainLen += c->lengthTicks;
                    const auto positions = repeatPositions(chainLen, repeat, step.value(u"distribution").toDouble(0));
                    const auto velocities = repeatVelocities(velocity, repeat, step.value(u"velocityRamp").toDouble(0),
                                                             step.value(u"velocityCurve").toDouble(0));
                    for (int k = 0; k < repeat; ++k) {
                        const std::int64_t subStart = contentStart + positions[static_cast<std::size_t>(k)];
                        if (subStart >= seg.segEnd) break;
                        const std::int64_t nextPos =
                            (k + 1 < repeat) ? positions[static_cast<std::size_t>(k + 1)] : chainLen;
                        const std::int64_t subSpan =
                            std::max<std::int64_t>(1, nextPos - positions[static_cast<std::size_t>(k)]);
                        std::int64_t subDur =
                            std::max<std::int64_t>(1, jsRoundInt64((static_cast<double>(subSpan) * lastGate) / 100.0));
                        if (patLegato && lastGate == 100) subDur += 1;
                        const std::int64_t maxDur = seg.segEnd - subStart;
                        if (maxDur <= 0) continue;
                        if (subDur > maxDur) subDur = maxDur;
                        QJsonObject note{
                            {QStringLiteral("id"), QStringLiteral("p:%1:%2:%3:%4:%5")
                                                       .arg(rowId)
                                                       .arg(seg.segIdx)
                                                       .arg(occ.cycle)
                                                       .arg(occ.stepIndex)
                                                       .arg(k)},
                            {QStringLiteral("pitch"), pitch},
                            {QStringLiteral("velocity"), velocities[static_cast<std::size_t>(k)]},
                            {QStringLiteral("startTick"), static_cast<double>(subStart)},
                            {QStringLiteral("durationTick"), static_cast<double>(subDur)},
                            {QStringLiteral("channel"), channel},
                        };
                        if (kitBend != 0) {
                            note.insert(QStringLiteral("expression"),
                                        QJsonObject{{QStringLiteral("pitch"),
                                                     QJsonArray{QJsonObject{{QStringLiteral("tick"), 0},
                                                                            {QStringLiteral("value"), kitBend}}}}});
                        }
                        notes.append(std::move(note));
                    }
                }
            }
        }
    }

    QJsonArray controllers;
    for (auto& lane : controllerLanes) controllers.append(std::move(lane));
    return QJsonObject{{QStringLiteral("notes"), sortNotes(std::move(notes))},
                       {QStringLiteral("controllers"), controllers},
                       {QStringLiteral("deviceAutomation"), deviceAutomation}};
}

QJsonObject expandPatternClip(const QJsonObject& clip, const QJsonObject& doc) {
    if (!clip.value(u"pattern").isObject()) return {};
    const double bpm = resolveDocBpm(doc);
    const double offsetMs = resolveDocOffsetMs(doc);
    const std::int64_t clipLengthTicks =
        std::max<std::int64_t>(0, jsRoundInt64(msToTicks(clip.value(u"durationMs").toDouble(0.0), bpm)));
    const auto loopMs = activeLoopMsOf(clip);
    const std::int64_t inPointTicks =
        std::max<std::int64_t>(0, jsRoundInt64(msToTicks(clip.value(u"inPointMs").toDouble(0.0), bpm)));
    const std::int64_t patternPhaseTicks =
        jsRoundInt64(clip.value(u"patternPhaseTicks").toDouble(0.0)) + inPointTicks;
    const std::int64_t clipStartDocTick =
        jsRoundInt64(msToTicks(clip.value(u"startMs").toDouble(0.0) - offsetMs, bpm));

    QJsonObject ctx{
        {QStringLiteral("clipLengthTicks"), static_cast<double>(clipLengthTicks)},
        {QStringLiteral("patternPhaseTicks"), static_cast<double>(patternPhaseTicks)},
        {QStringLiteral("clipStartDocTick"), static_cast<double>(clipStartDocTick)},
    };
    if (loopMs.has_value()) {
        ctx.insert(QStringLiteral("loopLengthTicks"),
                   static_cast<double>(std::max<std::int64_t>(1, jsRoundInt64(msToTicks(*loopMs, bpm)))));
    }
    if (clip.value(u"patternRowCycles").isObject()) {
        ctx.insert(QStringLiteral("rowCycles"), clip.value(u"patternRowCycles").toObject());
    }
    const auto tempoKey = doc.value(u"tempo").toObject().value(u"key");
    if (tempoKey.isObject()) ctx.insert(QStringLiteral("key"), tempoKey);

    const auto trackId = clip.value(u"trackId").toString();
    const auto tracks = doc.value(u"tracks").toArray();
    for (const auto& tv : tracks) {
        const auto t = tv.toObject();
        if (t.value(u"id").toString() == trackId && t.value(u"instrument").isObject()) {
            ctx.insert(QStringLiteral("instrument"), t.value(u"instrument").toObject());
        }
        if (t.value(u"type").toString() == u"chord" && !ctx.contains(u"chords")) {
            ctx.insert(QStringLiteral("chords"), t.value(u"chords").toArray());
        }
    }

    return expandPattern(clip.value(u"pattern").toObject(), ctx);
}

QJsonObject expandPatternClipForPlayback(const QJsonObject& clip, const QJsonObject& doc) {
    if (!clip.value(u"pattern").isObject()) return {};
    auto expanded = expandPatternClip(clip, doc);
    const double bpm = resolveDocBpm(doc);
    const double offsetMs = resolveDocOffsetMs(doc);

    const bool hasRegionParams =
        (clip.value(u"transpose").toDouble(0.0) != 0.0) || (clip.value(u"velocityOffset").toDouble(0.0) != 0.0) ||
        (clip.value(u"quantize").isObject() && clip.value(u"quantize").toObject().value(u"strength").toDouble(0.0) > 0.0);
    if (!hasRegionParams) return expanded;

    expanded.insert(QStringLiteral("notes"),
                    applyMidiRegionParamsToExpandedNotes(expanded.value(u"notes").toArray(), clip, bpm, offsetMs));
    const int transpose = clampInt(clip.value(u"transpose").toDouble(0.0), -127, 127);
    if (transpose != 0 && expanded.value(u"controllers").isArray()) {
        QJsonArray nextCtrl;
        for (const auto& lv : expanded.value(u"controllers").toArray()) {
            auto lane = lv.toObject();
            if (lane.value(u"kind").toString() == u"polyPressure" && lane.value(u"pitch").isDouble()) {
                lane.insert(QStringLiteral("pitch"), std::clamp(lane.value(u"pitch").toInt() + transpose, 0, 127));
            }
            nextCtrl.append(std::move(lane));
        }
        expanded.insert(QStringLiteral("controllers"), nextCtrl);
    }
    return expanded;
}

// ── Track device-automation overlay (SQ41) ──────────────────────────────────

QJsonArray deriveTrackAutomationFromPatterns(const QJsonObject& track, const QJsonArray& clips, const QJsonObject& doc) {
    constexpr double kBoundaryEpsMs = 1e-3;
    const double bpm = resolveDocBpm(doc);
    const QString trackId = track.value(u"id").toString();

    std::vector<QJsonObject> patternClips;
    for (const auto& cv : clips) {
        const auto c = cv.toObject();
        if (c.value(u"trackId").toString() == trackId && c.value(u"pattern").isObject() &&
            !c.value(u"muted").toBool(false) && !c.value(u"hidden").toBool(false)) {
            patternClips.push_back(c);
        }
    }
    std::stable_sort(patternClips.begin(), patternClips.end(), [](const QJsonObject& a, const QJsonObject& b) {
        return a.value(u"startMs").toDouble() < b.value(u"startMs").toDouble();
    });

    std::vector<QJsonObject> base;
    for (const auto& lv : track.value(u"automation").toArray()) base.push_back(lv.toObject());
    if (patternClips.empty()) {
        QJsonArray out;
        for (auto& l : base) out.append(std::move(l));
        return out;
    }

    QHash<QString, std::size_t> byKey;
    QHash<QString, QJsonArray> originalStored;
    for (std::size_t i = 0; i < base.size(); ++i) {
        const auto target = base[i].value(u"target").toObject();
        if (target.value(u"kind").toString() == u"device") {
            const QString key = target.value(u"deviceId").toString() + u':' + target.value(u"param").toString();
            byKey.insert(key, i);
            const auto pts = base[i].value(u"points").toArray();
            if (!pts.isEmpty()) originalStored.insert(key, pts);
        }
    }

    QJsonObject expandDoc = doc;
    if (!expandDoc.value(u"tracks").isArray()) expandDoc.insert(QStringLiteral("tracks"), QJsonArray{track});

    for (const auto& clip : patternClips) {
        const auto expanded = expandPatternClip(clip, expandDoc);
        const auto devAuto = expanded.value(u"deviceAutomation").toArray();
        if (devAuto.isEmpty()) continue;
        const double clipStart = clip.value(u"startMs").toDouble(0.0);
        const double clipEnd = clipStart + clip.value(u"durationMs").toDouble(0.0);

        for (const auto& dv : devAuto) {
            const auto derived = dv.toObject();
            const auto dPts = derived.value(u"points").toArray();
            if (dPts.isEmpty()) continue;
            const auto target = derived.value(u"target").toObject();
            const QString key = target.value(u"deviceId").toString() + u':' + target.value(u"param").toString();
            const bool isLatch = derived.value(u"automationMode").toString() == u"latch";

            std::vector<QJsonObject> clipPoints;
            clipPoints.reserve(static_cast<std::size_t>(dPts.size()));
            for (qsizetype idx = 0; idx < dPts.size(); ++idx) {
                const auto p = dPts.at(idx).toObject();
                QJsonObject pt{{QStringLiteral("timeMs"), clipStart + ticksToMs(p.value(u"tick").toDouble(), bpm)},
                               {QStringLiteral("value"), p.value(u"value").toDouble()}};
                if (idx > 0 && isLatch) pt.insert(QStringLiteral("easing"), QStringLiteral("hold"));
                clipPoints.push_back(std::move(pt));
            }

            if (const auto it = byKey.constFind(key); it == byKey.constEnd()) {
                QJsonArray ptsArr;
                for (auto& pt : clipPoints) ptsArr.append(std::move(pt));
                QJsonObject created{
                    {QStringLiteral("id"), QStringLiteral("pattern-auto:%1:%2")
                                               .arg(clip.value(u"id").toString(), derived.value(u"rowId").toString())},
                    {QStringLiteral("target"), target},
                    {QStringLiteral("points"), ptsArr},
                    {QStringLiteral("enabled"), true},
                };
                byKey.insert(key, base.size());
                base.push_back(std::move(created));
            } else {
                auto& existing = base[it.value()];
                const auto existingPts = existing.value(u"points").toArray();
                const double entryTime = clipPoints.front().value(u"timeMs").toDouble();

                std::vector<QJsonObject> combined;
                QJsonObject lastBefore;
                bool hasLastBefore = false;
                for (const auto& pv : existingPts) {
                    const auto p = pv.toObject();
                    if (p.value(u"timeMs").toDouble() < entryTime) {
                        combined.push_back(p);
                        lastBefore = p;
                        hasLastBefore = true;
                    }
                }
                if (!existingPts.isEmpty() && entryTime > 0.0) {
                    const double preTime = std::max(0.0, entryTime - kBoundaryEpsMs);
                    if (!hasLastBefore || lastBefore.value(u"timeMs").toDouble() < preTime - 1e-6) {
                        combined.push_back(QJsonObject{
                            {QStringLiteral("timeMs"), preTime},
                            {QStringLiteral("value"), nt::automation::automationValueAt(existingPts, preTime)}});
                    }
                    clipPoints.front().insert(QStringLiteral("easing"), QStringLiteral("hold"));
                }
                for (const auto& pt : clipPoints) combined.push_back(pt);

                if (const auto origIt = originalStored.constFind(key); origIt != originalStored.constEnd() && !origIt->isEmpty()) {
                    const double lastClipTime = clipPoints.back().value(u"timeMs").toDouble();
                    if (clipEnd > lastClipTime) {
                        combined.push_back(QJsonObject{
                            {QStringLiteral("timeMs"), clipEnd},
                            {QStringLiteral("value"), nt::automation::automationValueAt(*origIt, clipEnd)},
                            {QStringLiteral("easing"), QStringLiteral("hold")}});
                    }
                }
                for (const auto& pv : existingPts) {
                    const auto p = pv.toObject();
                    if (p.value(u"timeMs").toDouble() > clipEnd) combined.push_back(p);
                }

                std::stable_sort(combined.begin(), combined.end(), [](const QJsonObject& a, const QJsonObject& b) {
                    return a.value(u"timeMs").toDouble() < b.value(u"timeMs").toDouble();
                });
                QJsonArray ptsArr;
                for (auto& pt : combined) ptsArr.append(std::move(pt));
                existing.insert(QStringLiteral("points"), ptsArr);
            }
        }
    }

    QJsonArray out;
    for (auto& l : base) out.append(std::move(l));
    return out;
}

// ── MIDI -> Pattern conversion (SQ21, SQ60) ─────────────────────────────────

QJsonObject midiToPattern(const QJsonArray& notes, const QJsonArray& controllers, const QJsonObject& options) {
    if (options.contains(u"stepRate") && (!options.value(u"stepRate").isString() ||
        !isValidStepRate(options.value(u"stepRate").toString().toStdString()))) {
        return {{"error", "Invalid stepRate."}};
    }
    const QString stepRate =
        options.value(u"stepRate").isString() ? options.value(u"stepRate").toString() : QStringLiteral("1/16");
    const int stepTicks = stepRateTicksOrDefault(stepRate, 240);
    const double windowStart = options.value(u"windowStartTick").toDouble(0.0);
    const double clipLengthTicks = options.value(u"clipLengthTicks").toDouble(3840.0);
    const int rawSteps = clampInt(std::ceil(std::max(1.0, clipLengthTicks) / static_cast<double>(stepTicks)), 1, kStepPatternMaxSteps);
    const int lengthSteps = std::clamp(rawSteps, 1, kStepPatternMaxSteps);
    const double windowEnd = windowStart + clipLengthTicks;
    const auto instrument = options.value(u"instrument").toObject();

    std::unordered_map<int, std::vector<QJsonObject>> byPitch;
    for (const auto& nv : notes) {
        const auto n = nv.toObject();
        if (n.value(u"muted").toBool(false)) continue;
        const double st = n.value(u"startTick").toDouble(-1.0);
        if (st >= windowStart && st < windowEnd) {
            byPitch[n.value(u"pitch").toInt(60)].push_back(n);
        }
    }
    std::vector<int> pitches;
    pitches.reserve(byPitch.size());
    for (const auto& [p, _] : byPitch) pitches.push_back(p);
    std::sort(pitches.begin(), pitches.end(), std::greater<int>{});

    int droppedNotes = 0;
    int mergedCollisions = 0;
    QJsonArray rows;
    int rowCounter = 0;
    auto nextRowId = [&rowCounter]() { return QStringLiteral("row_%1").arg(++rowCounter); };
    const QJsonObject patternDefaults{
        {QStringLiteral("lengthSteps"), lengthSteps},
        {QStringLiteral("stepRate"), stepRate},
        {QStringLiteral("playback"), QStringLiteral("forward")},
        {QStringLiteral("midiChannel"), 1},
        {QStringLiteral("automationMode"), QStringLiteral("latch")},
    };

    for (int pitch : pitches) {
        auto& pitchNotes = byPitch[pitch];
        if (rows.size() >= kStepPatternMaxRows) {
            droppedNotes += static_cast<int>(pitchNotes.size());
            continue;
        }
        std::stable_sort(pitchNotes.begin(), pitchNotes.end(), [](const QJsonObject& a, const QJsonObject& b) {
            return a.value(u"startTick").toDouble() < b.value(u"startTick").toDouble();
        });

        struct Placed {
            int idx = 0;
            QJsonObject note;
            int offset = 0;
        };
        std::vector<Placed> placed;
        std::unordered_map<int, std::size_t> byStep;
        for (const auto& note : pitchNotes) {
            const double rel = note.value(u"startTick").toDouble() - windowStart;
            if (rel < 0.0 || rel >= static_cast<double>(lengthSteps * stepTicks)) {
                ++droppedNotes;
                continue;
            }
            const int idx = std::min(lengthSteps - 1, clampInt(rel / static_cast<double>(stepTicks), 0, lengthSteps));
            const double rem = rel - static_cast<double>(idx * stepTicks);
            const int offset = clampInt((rem / static_cast<double>(stepTicks)) * 100.0, -50, 50);
            if (const auto it = byStep.find(idx); it != byStep.end()) {
                ++mergedCollisions;
                if (note.value(u"velocity").toInt(100) > placed[it->second].note.value(u"velocity").toInt(100)) {
                    placed[it->second].note = note;
                    placed[it->second].offset = offset;
                }
            } else {
                byStep.emplace(idx, placed.size());
                placed.push_back(Placed{idx, note, offset});
            }
        }
        if (placed.empty()) continue;
        std::sort(placed.begin(), placed.end(), [](const Placed& a, const Placed& b) { return a.idx < b.idx; });

        std::vector<QJsonObject> stepsVec(static_cast<std::size_t>(lengthSteps));
        for (std::size_t p = 0; p < placed.size(); ++p) {
            const auto& entry = placed[p];
            const int nextNoteIdx = (p + 1 < placed.size()) ? placed[p + 1].idx : lengthSteps;
            const int maxSpan = std::max(1, nextNoteIdx - entry.idx);
            const double durTick = entry.note.value(u"durationTick").toDouble(static_cast<double>(stepTicks));
            const int desiredSpan = clampInt(std::ceil(durTick / static_cast<double>(stepTicks)), 1, maxSpan);
            const int span = std::min(maxSpan, desiredSpan);
            const int ch1 = entry.note.value(u"channel").toInt(0) + 1;
            const int vel = entry.note.value(u"velocity").toInt(100);

            if (span == 1) {
                const int gate = clampInt((durTick / static_cast<double>(stepTicks)) * 100.0, 1, 100);
                QJsonObject st{{QStringLiteral("on"), true},
                               {QStringLiteral("velocity"), vel},
                               {QStringLiteral("gate"), gate},
                               {QStringLiteral("offset"), entry.offset}};
                if (ch1 != 1) st.insert(QStringLiteral("midiChannel"), ch1);
                stepsVec[static_cast<std::size_t>(entry.idx)] = compactStep(st);
            } else {
                QJsonObject st{{QStringLiteral("on"), true},
                               {QStringLiteral("velocity"), vel},
                               {QStringLiteral("gate"), 100},
                               {QStringLiteral("offset"), entry.offset}};
                if (ch1 != 1) st.insert(QStringLiteral("midiChannel"), ch1);
                stepsVec[static_cast<std::size_t>(entry.idx)] = compactStep(st);
                for (int k = 1; k < span; ++k) {
                    const bool isLast = (k == span - 1);
                    const double tailTicks = durTick - static_cast<double>((span - 1) * stepTicks);
                    const int gate = isLast ? clampInt((tailTicks / static_cast<double>(stepTicks)) * 100.0, 1, 100) : 100;
                    stepsVec[static_cast<std::size_t>(entry.idx + k)] =
                        compactStep(QJsonObject{{QStringLiteral("tie"), true}, {QStringLiteral("gate"), gate}});
                }
            }
        }

        QJsonObject assignment{{QStringLiteral("type"), QStringLiteral("note")}, {QStringLiteral("pitch"), pitch}};
        const auto instType = instrument.value(u"type").toString();
        if (instType == u"drum") {
            const int pad = pitch - instrument.value(u"baseNote").toInt(36);
            if (pad >= 0 && pad < instrument.value(u"pads").toArray().size()) {
                assignment = QJsonObject{{QStringLiteral("type"), QStringLiteral("kit")}, {QStringLiteral("pad"), pad}};
            }
        } else if (instType == u"sampler") {
            const auto zones = instrument.value(u"zones").toArray();
            for (qsizetype z = 0; z < zones.size() && z < 16; ++z) {
                if (zones.at(z).toObject().value(u"rootNote").toInt(-1) == pitch) {
                    assignment = QJsonObject{{QStringLiteral("type"), QStringLiteral("kit")},
                                             {QStringLiteral("pad"), static_cast<int>(z)}};
                    break;
                }
            }
        }

        QJsonArray stepsArr;
        for (auto& s : stepsVec) stepsArr.append(std::move(s));
        rows.append(normalizeRow(QJsonObject{{QStringLiteral("id"), nextRowId()},
                                             {QStringLiteral("assignment"), assignment},
                                             {QStringLiteral("lengthSteps"), lengthSteps},
                                             {QStringLiteral("loopStart"), 0},
                                             {QStringLiteral("loopEnd"), lengthSteps},
                                             {QStringLiteral("steps"), stepsArr}},
                                 patternDefaults));
    }

    for (const auto& lv : controllers) {
        if (rows.size() >= kStepPatternMaxRows) break;
        const auto lane = lv.toObject();
        const auto kind = lane.value(u"kind").toString();
        QJsonObject target;
        if (kind == u"cc" && lane.value(u"cc").isDouble()) {
            target = QJsonObject{{QStringLiteral("kind"), QStringLiteral("cc")},
                                 {QStringLiteral("cc"), lane.value(u"cc").toInt()}};
        } else if (kind == u"pitchBend" || kind == u"channelPressure") {
            target = QJsonObject{{QStringLiteral("kind"), kind}};
        } else {
            continue;
        }

        const auto lanePts = lane.value(u"points").toArray();
        QJsonArray stepsArr;
        bool anyOn = false;
        for (int i = 0; i < lengthSteps; ++i) {
            const double s0 = windowStart + static_cast<double>(i * stepTicks);
            const double s1 = s0 + static_cast<double>(stepTicks);
            std::optional<double> firstInStep;
            for (const auto& pv : lanePts) {
                const auto p = pv.toObject();
                const double t = p.value(u"tick").toDouble();
                if (t >= s0 && t < s1) {
                    firstInStep = p.value(u"value").toDouble();
                    break;
                }
            }
            if (!firstInStep.has_value()) {
                stepsArr.append(QJsonObject{});
                continue;
            }
            const double val = controllerValueAt(lane, s0).value_or(*firstInStep);
            stepsArr.append(compactStep(QJsonObject{{QStringLiteral("on"), true},
                                                    {QStringLiteral("value"), static_cast<double>(jsRoundInt64(val))}}));
            anyOn = true;
        }
        if (!anyOn) continue;

        rows.append(normalizeRow(
            QJsonObject{{QStringLiteral("id"), nextRowId()},
                        {QStringLiteral("assignment"),
                         QJsonObject{{QStringLiteral("type"), QStringLiteral("automation")},
                                     {QStringLiteral("target"), target}}},
                        {QStringLiteral("lengthSteps"), lengthSteps},
                        {QStringLiteral("loopStart"), 0},
                        {QStringLiteral("loopEnd"), lengthSteps},
                        {QStringLiteral("midiChannel"), lane.value(u"channel").toInt(0) + 1},
                        {QStringLiteral("automationMode"), lane.value(u"interpolation").toString() == u"step"
                                                               ? QStringLiteral("latch")
                                                               : QStringLiteral("slide")},
                        {QStringLiteral("steps"), stepsArr}},
            patternDefaults));
    }

    const QJsonObject pattern = normalizePattern(QJsonObject{
        {QStringLiteral("name"), options.value(u"name").isString() ? options.value(u"name").toString()
                                                                   : QStringLiteral("Pattern")},
        {QStringLiteral("seed"), static_cast<double>(readSeed(options.value(u"seed"), 1u))},
        {QStringLiteral("lengthSteps"), lengthSteps},
        {QStringLiteral("stepRate"), stepRate},
        {QStringLiteral("rows"), rows},
    });
    return QJsonObject{{QStringLiteral("pattern"), pattern},
                       {QStringLiteral("droppedNotes"), droppedNotes},
                       {QStringLiteral("mergedCollisions"), mergedCollisions}};
}

// ── Pattern-level mutation helpers ──────────────────────────────────────────

QJsonObject resizeRowLength(const QJsonObject& row, int newLength) {
    const int nextLen = clampInt(newLength, 1, kStepPatternMaxSteps);
    const auto oldSteps = row.value(u"steps").toArray();
    const int oldLen = static_cast<int>(oldSteps.size());
    QJsonArray steps;
    for (int i = 0; i < nextLen; ++i) {
        steps.append(oldLen > 0 ? oldSteps.at(i % oldLen).toObject() : QJsonObject{});
    }
    const int curLen = row.value(u"lengthSteps").toInt(oldLen);
    const int curLoopEnd = row.value(u"loopEnd").toInt(curLen);
    const int loopEnd = (curLoopEnd == curLen) ? nextLen : std::min(curLoopEnd, nextLen);
    const int loopStart = std::min(row.value(u"loopStart").toInt(0), loopEnd - 1);
    QJsonObject out = row;
    out.insert(QStringLiteral("lengthSteps"), nextLen);
    out.insert(QStringLiteral("loopStart"), loopStart);
    out.insert(QStringLiteral("loopEnd"), loopEnd);
    out.insert(QStringLiteral("steps"), steps);
    return out;
}

QJsonObject resizePatternLength(const QJsonObject& pattern, int newLength) {
    const int nextLen = clampInt(newLength, 1, kStepPatternMaxSteps);
    const int oldLen = pattern.value(u"lengthSteps").toInt(16);
    QJsonArray rows;
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        const auto row = rv.toObject();
        const int rLen = row.value(u"lengthSteps").toInt(oldLen);
        rows.append((rLen == oldLen || rLen > nextLen) ? resizeRowLength(row, nextLen) : row);
    }
    QJsonObject out = pattern;
    out.insert(QStringLiteral("lengthSteps"), nextLen);
    out.insert(QStringLiteral("rows"), rows);
    return out;
}

QJsonObject setPatternStepRate(const QJsonObject& pattern, const QString& stepRate) {
    QJsonArray rows;
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        auto row = rv.toObject();
        row.insert(QStringLiteral("stepRate"), stepRate);
        rows.append(std::move(row));
    }
    QJsonObject out = pattern;
    out.insert(QStringLiteral("stepRate"), stepRate);
    out.insert(QStringLiteral("rows"), rows);
    return out;
}

QJsonObject setPatternPlayback(const QJsonObject& pattern, const QString& playback) {
    QJsonArray rows;
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        auto row = rv.toObject();
        row.insert(QStringLiteral("playback"), playback);
        rows.append(std::move(row));
    }
    QJsonObject out = pattern;
    out.insert(QStringLiteral("playback"), playback);
    out.insert(QStringLiteral("rows"), rows);
    return out;
}

QJsonObject setPatternMidiChannel(const QJsonObject& pattern, int midiChannel) {
    const int ch = clampInt(midiChannel, 1, 16);
    QJsonArray rows;
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        auto row = rv.toObject();
        row.insert(QStringLiteral("midiChannel"), ch);
        rows.append(std::move(row));
    }
    QJsonObject out = pattern;
    out.insert(QStringLiteral("midiChannel"), ch);
    out.insert(QStringLiteral("rows"), rows);
    return out;
}

QJsonObject setPatternAutomationMode(const QJsonObject& pattern, const QString& automationMode) {
    QJsonArray rows;
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        auto row = rv.toObject();
        row.insert(QStringLiteral("automationMode"), automationMode);
        rows.append(std::move(row));
    }
    QJsonObject out = pattern;
    out.insert(QStringLiteral("automationMode"), automationMode);
    out.insert(QStringLiteral("rows"), rows);
    return out;
}

QJsonObject setPatternLoop(const QJsonObject& pattern, std::optional<int> loopStart0, std::optional<int> loopEndExcl) {
    QJsonArray rows;
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        auto row = rv.toObject();
        const int rLen = row.value(u"lengthSteps").toInt(16);
        const int nextEnd = loopEndExcl.has_value() ? clampInt(*loopEndExcl, 1, rLen) : row.value(u"loopEnd").toInt(rLen);
        const int nextStart = loopStart0.has_value() ? clampInt(*loopStart0, 0, nextEnd - 1)
                                                     : std::min(row.value(u"loopStart").toInt(0), nextEnd - 1);
        row.insert(QStringLiteral("loopStart"), nextStart);
        row.insert(QStringLiteral("loopEnd"), nextEnd);
        rows.append(std::move(row));
    }
    QJsonObject out = pattern;
    out.insert(QStringLiteral("rows"), rows);
    return out;
}

QJsonObject setPatternKey(const QJsonObject& pattern, const QJsonObject& nextKey) {
    const auto oldK = resolveStepKey(pattern.value(u"key"));
    const auto newK = resolveStepKey(nextKey);
    const QJsonObject keyObj{{QStringLiteral("tonic"), newK.tonic},
                             {QStringLiteral("mode"), QString::fromStdString(newK.mode)}};
    QJsonObject out = pattern;
    out.insert(QStringLiteral("key"), keyObj);
    if (pattern.value(u"noTranspose").toBool(false) || oldK.tonic == newK.tonic) return out;
    const int delta = shortestTonicDelta(oldK.tonic, newK.tonic);
    QJsonArray rows;
    for (const auto& rv : pattern.value(u"rows").toArray()) {
        auto row = rv.toObject();
        auto assign = row.value(u"assignment").toObject();
        const auto type = assign.value(u"type").toString();
        if (type != u"note" && type != u"melodic") {
            rows.append(std::move(row));
            continue;
        }
        const int oldPitch = assign.value(u"pitch").toInt(60);
        const int oldPc = floorMod(oldPitch, 12);
        const int octWrap = static_cast<int>(std::floor(static_cast<double>(oldPc + delta) / 12.0));
        assign.insert(QStringLiteral("pitch"), clampInt(oldPitch + delta, 0, 127));
        row.insert(QStringLiteral("assignment"), assign);
        if (octWrap != 0) {
            QJsonArray nextSteps;
            for (const auto& sv : row.value(u"steps").toArray()) {
                auto st = sv.toObject();
                if (st.value(u"octave").isDouble()) {
                    st.insert(QStringLiteral("octave"), clampInt(st.value(u"octave").toInt() + octWrap, -2, 8));
                    st = compactStep(st);
                }
                nextSteps.append(std::move(st));
            }
            row.insert(QStringLiteral("steps"), nextSteps);
        }
        rows.append(std::move(row));
    }
    out.insert(QStringLiteral("rows"), rows);
    return out;
}

QJsonObject setStepValue(const QJsonObject& row, int stepIndex, const QJsonObject& values, bool keepOff,
                         QString* error) {
    if (error) error->clear();
    const auto steps = row.value(u"steps").toArray();
    if (stepIndex < 0 || stepIndex >= steps.size()) {
        if (error) {
            *error = QStringLiteral("Step %1 is outside row length 1..%2.").arg(stepIndex + 1).arg(steps.size());
        }
        return row;
    }
    auto assign = row.value(u"assignment").toObject();
    if (assign.value(u"type").toString() == u"note" &&
        (values.contains(u"note") || values.contains(u"octave"))) {
        assign.insert(QStringLiteral("type"), QStringLiteral("melodic"));
    }
    const auto current = steps.at(stepIndex).toObject();
    auto merged = current;
    for (auto it = values.begin(); it != values.end(); ++it) {
        if (it.value().isNull() || it.value().isUndefined()) merged.remove(it.key());
        else merged.insert(it.key(), it.value());
    }
    static constexpr std::array<const char*, 14> kActivationKeys{
        "velocity", "gate", "note", "octave", "repeat", "chance", "offset",
        "value", "condition", "midiChannel", "articulation", "velocityRamp", "velocityCurve", "distribution"};
    bool setsValue = false;
    for (const char* k : kActivationKeys) {
        if (values.contains(QLatin1String(k)) && !values.value(QLatin1String(k)).isUndefined()) {
            setsValue = true;
            break;
        }
    }
    if (setsValue && !values.contains(u"on") && !keepOff && !current.value(u"on").toBool(false)) {
        merged.insert(QStringLiteral("on"), true);
    }
    auto nextSteps = steps;
    nextSteps.replace(stepIndex, compactStep(merged));
    QJsonObject out = row;
    out.insert(QStringLiteral("assignment"), assign);
    out.insert(QStringLiteral("steps"), nextSteps);
    return out;
}

QJsonObject applyMonoAtSteps(const QJsonObject& pattern, const QString& activeRowId,
                             const std::vector<int>& stepIndices) {
    if (!pattern.value(u"mono").toBool(false) || stepIndices.empty()) return pattern;
    const auto rows = pattern.value(u"rows").toArray();
    bool activeIsNote = false;
    for (const auto& rv : rows) {
        const auto r = rv.toObject();
        if (r.value(u"id").toString() == activeRowId) {
            activeIsNote = isNoteRowObj(r);
            break;
        }
    }
    if (!activeIsNote) return pattern;
    QSet<int> idxSet;
    for (int i : stepIndices) idxSet.insert(i);
    QJsonArray nextRows;
    for (const auto& rv : rows) {
        auto r = rv.toObject();
        if (r.value(u"id").toString() == activeRowId || !isNoteRowObj(r)) {
            nextRows.append(std::move(r));
            continue;
        }
        auto steps = r.value(u"steps").toArray();
        bool changed = false;
        for (qsizetype i = 0; i < steps.size(); ++i) {
            auto st = steps.at(i).toObject();
            if (!idxSet.contains(static_cast<int>(i)) || !st.value(u"on").toBool(false)) continue;
            st.insert(QStringLiteral("on"), false);
            steps.replace(i, compactStep(st));
            changed = true;
        }
        if (changed) r.insert(QStringLiteral("steps"), steps);
        nextRows.append(std::move(r));
    }
    QJsonObject out = pattern;
    out.insert(QStringLiteral("rows"), nextRows);
    return out;
}

QJsonObject clearRowSteps(const QJsonObject& row, const std::optional<std::vector<int>>& indices, const QString& mode) {
    QSet<int> target;
    if (indices.has_value()) {
        for (int i : *indices) target.insert(i);
    }
    const QString field = mode.isEmpty() ? QString{} : modeToField(mode);
    const auto steps = row.value(u"steps").toArray();
    QJsonArray nextSteps;
    for (qsizetype i = 0; i < steps.size(); ++i) {
        const auto st = steps.at(i).toObject();
        if (indices.has_value() && !target.contains(static_cast<int>(i))) {
            nextSteps.append(st);
            continue;
        }
        if (mode.isEmpty()) {
            nextSteps.append(QJsonObject{});
            continue;
        }
        if (field.isEmpty()) {
            nextSteps.append(st);
            continue;
        }
        auto copy = st;
        copy.remove(field);
        nextSteps.append(compactStep(copy));
    }
    QJsonObject out = row;
    out.insert(QStringLiteral("steps"), nextSteps);
    return out;
}

QJsonObject applyPatternRowSort(const QJsonObject& pattern, const QJsonObject& instrument) {
    const auto rs = pattern.value(u"rowSort").toString();
    if (rs.isEmpty() || rs == u"none") return pattern;
    QString by;
    bool desc = false;
    if (rs == u"typeAsc") { by = QStringLiteral("type"); desc = false; }
    else if (rs == u"typeDesc") { by = QStringLiteral("type"); desc = true; }
    else if (rs == u"typeAndNoteAsc") { by = QStringLiteral("typeAndNote"); desc = false; }
    else if (rs == u"typeAndNoteDesc") { by = QStringLiteral("typeAndNote"); desc = true; }
    else if (rs == u"typeAndNameAsc") { by = QStringLiteral("typeAndName"); desc = false; }
    else if (rs == u"typeAndNameDesc") { by = QStringLiteral("typeAndName"); desc = true; }
    else if (rs == u"typeAndKitPadAsc") { by = QStringLiteral("typeAndKitPad"); desc = false; }
    else if (rs == u"typeAndKitPadDesc") { by = QStringLiteral("typeAndKitPad"); desc = true; }
    else return pattern;

    const int dir = desc ? -1 : 1;
    std::vector<QJsonObject> rows;
    for (const auto& rv : pattern.value(u"rows").toArray()) rows.push_back(rv.toObject());
    std::stable_sort(rows.begin(), rows.end(), [&](const QJsonObject& a, const QJsonObject& b) {
        const auto aa = a.value(u"assignment").toObject();
        const auto ba = b.value(u"assignment").toObject();
        const int typeCmp = assignmentTypeRank(aa) - assignmentTypeRank(ba);
        if (typeCmp != 0) return typeCmp * dir < 0;
        if (by == u"typeAndNote") {
            const int noteCmp = assignmentNoteKey(aa, instrument) - assignmentNoteKey(ba, instrument);
            if (noteCmp != 0) return noteCmp * dir < 0;
        } else if (by == u"typeAndName") {
            const int nameCmp = QString::localeAwareCompare(rowLabel(a, instrument), rowLabel(b, instrument));
            if (nameCmp != 0) return nameCmp * dir < 0;
        } else if (by == u"typeAndKitPad") {
            const int padA = (aa.value(u"type").toString() == u"kit") ? aa.value(u"pad").toInt(0)
                                                                      : assignmentNoteKey(aa, instrument);
            const int padB = (ba.value(u"type").toString() == u"kit") ? ba.value(u"pad").toInt(0)
                                                                      : assignmentNoteKey(ba, instrument);
            if (padA != padB) return (padA - padB) * dir < 0;
        }
        return false;
    });
    QJsonArray sorted;
    for (auto& r : rows) sorted.append(std::move(r));
    QJsonObject out = pattern;
    out.insert(QStringLiteral("rows"), sorted);
    return out;
}

std::optional<std::vector<int>> parseStepSelection(const QJsonValue& spec, int maxSteps, QString* error) {
    if (error) error->clear();
    QSet<int> out;
    auto add1Based = [&](double d) -> bool {
        if (!std::isfinite(d) || std::floor(d) != d || d < 1.0 || d > static_cast<double>(maxSteps)) {
            if (error) *error = QStringLiteral("Step %1 is out of range. Valid steps are 1..%2.").arg(d).arg(maxSteps);
            return false;
        }
        out.insert(static_cast<int>(d) - 1);
        return true;
    };
    if (spec.isArray()) {
        for (const auto& item : spec.toArray()) {
            if (!item.isDouble() || !add1Based(item.toDouble())) return std::nullopt;
        }
    } else if (spec.isString()) {
        const QString trimmed = spec.toString().trimmed();
        if (trimmed.isEmpty()) {
            if (error) *error = QStringLiteral("Empty step list. Valid steps are 1..%1.").arg(maxSteps);
            return std::nullopt;
        }
        static const QRegularExpression rangeRe(QStringLiteral("^(\\d+)\\s*-\\s*(\\d+)$"));
        static const QRegularExpression numRe(QStringLiteral("^\\d+$"));
        for (const QString& part : trimmed.split(u',')) {
            const QString token = part.trimmed();
            if (token.isEmpty()) continue;
            if (const auto m = rangeRe.match(token); m.hasMatch()) {
                const int a = m.captured(1).toInt();
                const int b = m.captured(2).toInt();
                if (a > b) {
                    if (error) *error = QStringLiteral("Invalid step range \"%1\": start must be <= end.").arg(token);
                    return std::nullopt;
                }
                for (int k = a; k <= b; ++k) {
                    if (!add1Based(static_cast<double>(k))) return std::nullopt;
                }
            } else if (numRe.match(token).hasMatch()) {
                if (!add1Based(static_cast<double>(token.toInt()))) return std::nullopt;
            } else {
                if (error) {
                    *error = QStringLiteral("Invalid step selector \"%1\". Use 1-based numbers or ranges like \"1-4,9\".")
                                 .arg(token);
                }
                return std::nullopt;
            }
        }
    } else {
        if (error) *error = QStringLiteral("Invalid step selector. Use 1-based numbers or ranges like \"1-4,9\".");
        return std::nullopt;
    }
    std::vector<int> sorted(out.begin(), out.end());
    std::sort(sorted.begin(), sorted.end());
    return sorted;
}

}  // namespace nt::midi
