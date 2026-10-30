#include "model/TimelineJson.h"
#include "preview/transitions/TransitionResolver.h"
#include "scene/ClipScene.h"

#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTest>

#include <algorithm>
#include <array>
#include <bit>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <map>
#include <random>
#include <span>
#include <unordered_set>

namespace reference {
using namespace nt;
using transitions::detail::incomingRecord;
using transitions::detail::outgoingRecord;
using transitions::detail::knownTransitionTypes;

const scene::ClipScene& sceneOf(const Clip& clip) {
    static const scene::ClipScene empty;
    return clip.scene ? *clip.scene : empty;
}
bool isActiveAt(const Clip& clip, double timeMs) { return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs; }
double clamp01(double v) { return v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v); }

// Verbatim quadratic reference from SceneEval.cpp before the extraction.
std::optional<TransitionPair> resolveTransition(const Clip& clip, const std::vector<const Clip*>& siblings, double t) {
    const Clip* partner = nullptr;
    double furthestEnd = clip.startMs;
    for (const Clip* prev : siblings) {
        if (prev == &clip || prev->startMs >= clip.startMs) continue;
        const double prevEnd = prev->startMs + prev->durationMs;
        if (prevEnd <= clip.startMs) continue;
        if (!partner || prevEnd > furthestEnd) {
            partner = prev;
            furthestEnd = prevEnd;
        }
    }
    const double overlapMs = partner ? std::min(furthestEnd - clip.startMs, clip.durationMs) : 0;
    double durationMs;
    if (clip.transitionIn) {
        if (clip.transitionIn->durationMs <= 0) return std::nullopt;
        durationMs = clip.transitionIn->durationMs;
    } else {
        durationMs = overlapMs;
        if (durationMs <= 0) return std::nullopt;
    }
    const double into = t - clip.startMs;
    if (into >= durationMs) return std::nullopt;
    const double raw = clamp01(into / durationMs);
    const double progress =
        clip.transitionIn && !clip.transitionIn->easing.empty() ? scene::ease(clip.transitionIn->easing, raw) : raw;
    std::string type = "crossfade";
    if (clip.transitionIn && knownTransitionTypes().count(clip.transitionIn->type)) type = clip.transitionIn->type;
    TransitionPair pair{incomingRecord(type, progress, clip), std::nullopt, nullptr};
    if (partner) {
        pair.outgoing = outgoingRecord(type, progress, clip);
        pair.outgoingClip = partner;
    }
    return pair;
}

// `resolveDocumentTransitions`: per track and per group parent.
std::unordered_map<std::string, LayerTransition> resolveDocumentTransitions(const std::vector<const Clip*>& clips,
                                                                             double t) {
    std::unordered_set<std::string> groupIds;
    for (const Clip* c : clips) {
        if (c->mediaType == MediaType::Group) groupIds.insert(c->id);
    }
    std::map<std::pair<std::string, std::string>, std::vector<const Clip*>> buckets;
    for (const Clip* c : clips) {
        if (c->mediaType == MediaType::Adjustment || c->hidden || !isActiveAt(*c, t)) continue;
        const std::string& parent = sceneOf(*c).parentId;
        const std::string key = !parent.empty() && groupIds.count(parent) ? parent : std::string("\x01none");
        buckets[{c->trackId, key}].push_back(c);
    }
    std::unordered_map<std::string, LayerTransition> out;
    for (auto& [key, siblings] : buckets) {
        std::stable_sort(siblings.begin(), siblings.end(), [](const Clip* a, const Clip* b) { return a->startMs < b->startMs; });
        for (const Clip* clip : siblings) {
            const auto pair = resolveTransition(*clip, siblings, t);
            if (!pair) continue;
            if (pair->outgoing && pair->outgoingClip) {
                const std::string& id = pair->outgoingClip->id;
                auto it = out.find(id);
                if (it != out.end()) it->second.opacity *= pair->outgoing->opacity;
                else out.emplace(id, *pair->outgoing);
            }
            auto it = out.find(clip->id);
            if (it != out.end()) {
                LayerTransition merged = pair->incoming;
                merged.opacity = pair->incoming.opacity * it->second.opacity;
                it->second = merged;
            } else {
                out.emplace(clip->id, pair->incoming);
            }
        }
    }
    return out;
}

}  // namespace reference

namespace {

bool sameDouble(double a, double b) {
    return std::bit_cast<std::uint64_t>(a) == std::bit_cast<std::uint64_t>(b);
}

template <typename T, typename Equal>
bool sameOptional(const std::optional<T>& a, const std::optional<T>& b, Equal equal) {
    return a.has_value() == b.has_value() && (!a || equal(*a, *b));
}

bool sameJson(const QJsonValue& a, const QJsonValue& b) {
    if (a.type() != b.type()) {
        return false;
    }
    if (a.isDouble()) {
        return sameDouble(a.toDouble(), b.toDouble());
    }
    if (a.isObject()) {
        const auto x = a.toObject();
        const auto y = b.toObject();
        if (x.keys() != y.keys()) {
            return false;
        }
        for (auto it = x.begin(); it != x.end(); ++it) {
            if (!sameJson(it.value(), y.value(it.key()))) {
                return false;
            }
        }
        return true;
    }
    if (a.isArray()) {
        const auto x = a.toArray();
        const auto y = b.toArray();
        if (x.size() != y.size()) {
            return false;
        }
        for (qsizetype i = 0; i < x.size(); ++i) {
            if (!sameJson(x[i], y[i])) {
                return false;
            }
        }
        return true;
    }
    return a == b;
}

bool sameLayer(const nt::LayerTransition& a, const nt::LayerTransition& b) {
    return a.type == b.type && a.role == b.role && sameDouble(a.progress, b.progress) &&
           sameDouble(a.opacity, b.opacity) && sameOptional(a.scale, b.scale, sameDouble) &&
           sameOptional(a.offset, b.offset, [](const nt::Vec2& x, const nt::Vec2& y) {
               return sameDouble(x.x, y.x) && sameDouble(x.y, y.y);
           }) &&
           sameOptional(a.mask, b.mask, [](const nt::scene::WipeMask& x, const nt::scene::WipeMask& y) {
               return x.direction == y.direction && sameDouble(x.softness, y.softness) &&
                      sameDouble(x.progress, y.progress);
           }) && a.solidColor == b.solidColor && sameDouble(a.solidOpacity, b.solidOpacity) &&
           sameOptional(a.iris, b.iris, [](const auto& x, const auto& y) {
               return sameDouble(x.first, y.first) && sameDouble(x.second, y.second);
           }) && sameOptional(a.effect, b.effect, [](const QJsonObject& x, const QJsonObject& y) {
               return sameJson(x, y);
           });
}

std::vector<const nt::Clip*> clipPointers(std::span<const nt::Clip> clips) {
    std::vector<const nt::Clip*> pointers;
    pointers.reserve(clips.size());
    for (const auto& clip : clips) {
        pointers.push_back(&clip);
    }
    return pointers;
}

QString difference(const std::vector<const nt::Clip*>& clips, double t) {
    const auto expected = reference::resolveDocumentTransitions(clips, t);
    const auto actual = nt::resolveDocumentTransitions(clips, t);
    if (actual.size() != expected.size()) {
        return QStringLiteral("map size: actual %1, expected %2 at t=%3")
            .arg(actual.size()).arg(expected.size()).arg(t, 0, 'g', 17);
    }
    for (const auto& [id, layer] : expected) {
        const auto it = actual.find(id);
        if (it == actual.end() || !sameLayer(layer, it->second)) {
            return QStringLiteral("LayerTransition differs bit for bit for clip %1 at t=%2")
                .arg(QString::fromStdString(id)).arg(t, 0, 'g', 17);
        }
    }
    return {};
}

QString compareFrames(const nt::Timeline& timeline) {
    const auto clips = clipPointers(timeline.clips);
    for (std::uint64_t frame = 0; ; ++frame) {
        const double t = static_cast<double>(frame) * 1000 / 30;
        if (t > timeline.durationMs) {
            break;
        }
        const auto error = difference(clips, t);
        if (!error.isEmpty()) {
            return error;
        }
    }
    return {};
}

std::vector<nt::Clip> overlappingClips(int count) {
    std::vector<nt::Clip> clips;
    clips.reserve(count);
    for (int i = 0; i < count; ++i) {
        nt::Clip clip;
        clip.id = std::to_string(i);
        clip.trackId = "track";
        clip.startMs = i;
        clip.durationMs = 100000;
        clip.transitionIn = nt::ClipTransitionIn{"crossfade", 100000, "linear"};
        clips.push_back(std::move(clip));
    }
    return clips;
}

double medianRuntime(std::span<const nt::Clip* const> pointers, std::size_t count) {
    if (pointers.empty() || pointers.size() % count != 0) { qFatal("timing corpus must contain complete batches"); }
    std::array<double, 5> elapsed{};
    for (auto& duration : elapsed) {
        const auto start = std::chrono::steady_clock::now();
        for (std::size_t offset = 0; offset < pointers.size(); offset += count) {
            const auto batch = pointers.subspan(offset, count);
            const auto result = nt::resolveDocumentTransitions(batch, 40000);
            if (result.size() != count) { qFatal("timing bucket did not resolve every clip"); }
        }
        const auto end = std::chrono::steady_clock::now();
        duration = std::chrono::duration<double>(end - start).count() / (pointers.size() / count);
    }
    std::sort(elapsed.begin(), elapsed.end());
    return elapsed[elapsed.size() / 2];
}

}  // namespace

class TestTransitionResolver : public QObject {
    Q_OBJECT

private slots:
    void fixturesAndExamples() {
        const QDir fixtures(QStringLiteral(NT_FIXTURES_DIR));
        int fixtureCount = 0;
        for (const auto& name : fixtures.entryList({QStringLiteral("*.json")}, QDir::Files, QDir::Name)) {
            QFile file(fixtures.filePath(name));
            QVERIFY(file.open(QIODevice::ReadOnly));
            QJsonParseError jsonError{};
            const auto json = QJsonDocument::fromJson(file.readAll(), &jsonError);
            QCOMPARE(jsonError.error, QJsonParseError::NoError);
            const auto root = json.object();
            if (!root.value(u"clips").isArray() || !root.value(u"tracks").isArray()) {
                continue;
            }
            const auto parsed = nt::loadTimelineFile(file.fileName());
            QVERIFY2(parsed.timeline.has_value(), qPrintable(name + ": " + parsed.error));
            const auto error = compareFrames(*parsed.timeline);
            QVERIFY2(error.isEmpty(), qPrintable(name + ": " + error));
            ++fixtureCount;
        }
        QVERIFY(fixtureCount > 0);

        const QDir examples(QStringLiteral(NT_EXAMPLES_DIR));
        int exampleCount = 0;
        for (const auto& name : examples.entryList({QStringLiteral("*.timeline.json")}, QDir::Files, QDir::Name)) {
            QFile file(examples.filePath(name));
            QVERIFY(file.open(QIODevice::ReadOnly));
            QJsonParseError jsonError{};
            const auto bundle = QJsonDocument::fromJson(file.readAll(), &jsonError).object();
            QCOMPARE(jsonError.error, QJsonParseError::NoError);
            QJsonObject document{{QStringLiteral("id"), "example-" + name.chopped(14)},
                                 {QStringLiteral("projectId"), QStringLiteral("examples")}};
            for (const auto* key : {"name", "fps", "width", "height", "durationMs"}) {
                document.insert(QLatin1String(key), bundle.value(QLatin1String(key)));
            }
            const auto content = bundle.value(u"document").toObject();
            for (auto it = content.begin(); it != content.end(); ++it) {
                document.insert(it.key(), it.value());
            }
            document.insert(QStringLiteral("createdAt"), QStringLiteral("1970-01-01T00:00:00.000Z"));
            document.insert(QStringLiteral("updatedAt"), QStringLiteral("1970-01-01T00:00:00.000Z"));
            const auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson(), examples.absolutePath());
            QVERIFY2(parsed.timeline.has_value(), qPrintable(name + ": " + parsed.error));
            const auto error = compareFrames(*parsed.timeline);
            QVERIFY2(error.isEmpty(), qPrintable(name + ": " + error));
            ++exampleCount;
        }
        QCOMPARE(exampleCount, 7);
        qInfo("Compared %d timeline fixtures and %d examples at every frame at 30 fps", fixtureCount, exampleCount);
    }

    void generatedBuckets() {
        std::mt19937 random(0x554c494e);
        const std::array types{"crossfade", "dipToColor", "wipe", "push", "slide", "zoom", "whip",
                               "zoomBlur", "glitch", "gradientWipe", "iris", "lightLeak", "unknown"};
        const std::array easings{"", "linear", "easeIn", "easeOut", "easeInOut", "spring(100,10,1)",
                                 "easeOutBounce", "easeOutBack", "unknown"};
        const std::array directions{"left", "right", "up", "down", "invalid"};
        const std::array parents{"", "outer", "inner", "absent"};
        for (int bucket = 0; bucket < 1000; ++bucket) {
            auto clips = overlappingClips(4);
            // Equal ends must select the first partner, including across a shared-start run.
            clips[0].durationMs = 1000;
            clips[1].startMs = 0;
            clips[1].durationMs = 1000;
            clips[2].startMs = 100;
            clips[2].durationMs = 900;
            clips[2].transitionIn = nt::ClipTransitionIn{"dipToColor", 1000, "linear"};
            clips[3].startMs = 200;
            clips[3].durationMs = 800;
            clips[3].transitionIn = nt::ClipTransitionIn{"push", 1000, "linear"};
            for (const auto* id : {"outer", "inner"}) {
                nt::Clip group;
                group.id = id;
                group.trackId = "groups";
                group.mediaType = nt::MediaType::Group;
                group.durationMs = 1500;
                auto scene = std::make_shared<nt::scene::ClipScene>();
                if (group.id == "inner") {
                    scene->parentId = "outer";
                }
                group.scene = std::move(scene);
                clips.push_back(std::move(group));
            }
            const int count = 16 + random() % 65;
            for (int i = 0; i < count; ++i) {
                nt::Clip clip;
                clip.id = "generated-" + std::to_string(i);
                clip.trackId = "track-" + std::to_string(random() % 3);
                clip.startMs = static_cast<int>(random() % 9) * 100 - 200;
                clip.durationMs = static_cast<int>(random() % 13) * 100 - 200;
                if (i % 5 == 0) {
                    clip.durationMs = 1200 - clip.startMs;
                }
                clip.hidden = random() % 7 == 0;
                clip.mediaType = random() % 7 == 0 ? nt::MediaType::Adjustment : nt::MediaType::Video;
                auto scene = std::make_shared<nt::scene::ClipScene>();
                scene->parentId = parents[random() % parents.size()];
                scene->transitionDirection = directions[random() % directions.size()];
                scene->transitionSoftness = static_cast<int>(random() % 5) * 0.13;
                scene->transitionColor = "#123456";
                clip.scene = std::move(scene);
                if (random() % 4 != 0) {
                    clip.transitionIn = nt::ClipTransitionIn{
                        types[random() % types.size()], static_cast<double>(static_cast<int>(random() % 8) * 200 - 200),
                        easings[random() % easings.size()]};
                    clip.raw.insert(QStringLiteral("transitionIn"), QJsonObject{
                        {QStringLiteral("blur"), 13.7}, {QStringLiteral("amount"), 0.73},
                        {QStringLiteral("color"), QStringLiteral("#123456")},
                        {QStringLiteral("map"), QStringLiteral("noise")}, {QStringLiteral("scale"), 2.3},
                        {QStringLiteral("seed"), 3.0}, {QStringLiteral("softness"), 0.17}});
                }
                clips.push_back(std::move(clip));
            }
            std::shuffle(clips.begin(), clips.end(), random);
            const auto pointers = clipPointers(clips);
            for (const double t : {-200.0, 0.0, 100.0, 133.33333333333334, 350.0, 700.0, 999.0, 1200.0, 1600.0}) {
                const auto error = difference(pointers, t);
                QVERIFY2(error.isEmpty(), qPrintable(QStringLiteral("bucket %1: %2").arg(bucket).arg(error)));
            }
        }
        qInfo("Compared 1000 seeded buckets at 9 sample times");
    }

    void linearScaling() {
        // Sweep the same corpus at both batch sizes instead of comparing a
        // small cache-resident corpus against a large memory-resident one.
        const auto clips = overlappingClips(32000);
        const auto pointers = clipPointers(clips);
        const double small = medianRuntime(pointers, 2000);
        const double large = medianRuntime(pointers, 32000);
        const double ratio = large / small;
        qInfo("median 2000=%.6fs, 32000=%.6fs, ratio=%.2f", small, large, ratio);
        QVERIFY2(ratio < 40, qPrintable(QStringLiteral("scaling ratio %1 must be below 40").arg(ratio)));
    }
};

QTEST_GUILESS_MAIN(TestTransitionResolver)
#include "tst_transitionresolver.moc"
