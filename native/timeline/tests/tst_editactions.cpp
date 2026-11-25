// The editor's clip actions (src/edit/EditActions) on cases the web store
// differential cannot reach: native refusals that must be atomic (a linked
// unit, a group tree) and the media-track ownership guard on drops.
#include "edit/EditActions.h"
#include "edit/groups/GroupOps.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/clipboard/ClipboardOps.h"
#include "midi/PatternExpand.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <limits>
#include <QTest>
#include <QSet>
#include <algorithm>
#include <cmath>

using namespace nt::edit;

namespace {

QJsonObject clip(const QString& id, const QString& track, double start, double duration,
                 const QString& mediaType = QStringLiteral("video")) {
    return {{"id", id},         {"trackId", track},           {"name", id},          {"startMs", start},
            {"durationMs", duration}, {"mediaType", mediaType}, {"sourceType", "imported"}, {"status", "generated"},
            {"versions", QJsonArray()}};
}

EditDoc docOf(ClipList clips) {
    EditDoc doc;
    doc.clips = std::move(clips);
    doc.tracks = {{"v1", "video", false}, {"v2", "video", false}, {"a1", "audio", false}};
    return doc;
}

const QJsonObject* find(const ClipList& clips, const QString& id) {
    for (const auto& c : clips)
        if (clipId(c) == id) return &c;
    return nullptr;
}

QJsonArray sourceAnchoredAnimation() {
    const QJsonArray keyframes{QJsonObject{{"t", 0}, {"value", 0}, {"sourceMs", 0}},
                              QJsonObject{{"t", 1}, {"value", 1}, {"sourceMs", 4000}}};
    return {QJsonObject{{"id", "anim"},
                        {"role", "emphasis"},
                        {"preset", "custom"},
                        {"custom", QJsonObject{{"timeBase", "source"},
                                               {"curves", QJsonArray{QJsonObject{{"property", "opacity"},
                                                                                {"keyframes", keyframes}}}}}}}};
}

}  // namespace

class TestEditActions : public QObject {
    Q_OBJECT

private slots:
    void reviewPatternSpeedAndDuration() {
        auto c = clip("a", "v1", 0, 1000, "midi");
        c.insert("pattern", QJsonObject{{"notes", QJsonArray{}}});
        c.insert("speedMultiplier", 2);
        QJsonObject raw{{"clips", QJsonArray{c}}};
        try {
            raw = applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"inPointMs", 1500}});
            const auto slipped = raw.value("clips").toArray()[0].toObject();
            QCOMPARE(slipped.value("patternPhaseTicks").toDouble(), 2880.0);
            QCOMPARE(slipped.value("outPointMs").toDouble(), 2000.0);
            raw = applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"durationMs", 500}});
            const auto trimmed = raw.value("clips").toArray()[0].toObject();
            QCOMPARE(trimmed.value("patternPhaseTicks").toDouble(), 2880.0);
            QCOMPARE(trimmed.value("outPointMs").toDouble(), 1000.0);
        } catch (const OpError& error) { QFAIL(error.what()); }
    }
    void reviewLinkedGroupTrimOptions() {
        auto group = clip("g", "v1", 0, 2000, "group");
        group.insert("linkId", "pair");
        auto child = clip("child", "v1", 0, 2000);
        child.insert("parentId", "g");
        auto partner = clip("b", "a1", 0, 2000, "audio");
        partner.insert("linkId", "pair");
        const QJsonObject raw{{"clips", QJsonArray{group, child, partner}}};
        for (bool linked : {true, false}) {
            const auto result = applyMusicClipEdit(raw, "set_clip_params", {{"target", "g"}, {"durationMs", 1000}, {"linked", linked}});
            const auto clips = result.value("clips").toArray();
            QCOMPARE(clips[0].toObject().value("durationMs").toDouble(), 1000.0);
            QCOMPARE(clips[1].toObject().value("durationMs").toDouble(), 1000.0);
            QCOMPARE(clips[2].toObject().value("durationMs").toDouble(), linked ? 1000.0 : 2000.0);
        }
    }
    void reviewLargeGroupLinkedTrim() {
        QJsonArray clips{clip("g", "v1", 0, 2000, "group")};
        for (int i = 0; i < 5000; ++i) {
            const auto id = QString::number(i);
            auto child = clip("child-" + id, "v1", 0, 2000);
            child.insert("parentId", "g"); child.insert("linkId", "pair-" + id);
            auto partner = clip("partner-" + id, "a1", 0, 2000, "audio");
            partner.insert("linkId", "pair-" + id);
            clips.append(child); clips.append(partner);
        }
        const auto result = applyMusicClipEdit({{"clips", clips}}, "set_clip_params", {{"target", "g"}, {"durationMs", 1000}});
        const auto next = result.value("clips").toArray();
        QCOMPARE(next.size(), clips.size());
        for (const auto& value : next) { QCOMPARE(value.toObject().value("durationMs").toDouble(), 1000.0); }
    }
    void reviewGroupChildLinkedPartner() {
        auto group = clip("g", "v1", 0, 2000, "group");
        auto child = clip("child", "v1", 0, 2000);
        child.insert("parentId", "g"); child.insert("linkId", "pair");
        auto partner = clip("b", "a1", 0, 2000, "audio");
        partner.insert("linkId", "pair");
        const auto result = applyMusicClipEdit({{"clips", QJsonArray{group, child, partner}}}, "set_clip_params", {{"target", "g"}, {"durationMs", 1000}});
        QCOMPARE(result.value("clips").toArray()[2].toObject().value("durationMs").toDouble(), 1000.0);
    }
    void reviewOptionalTextResetAndValidStyles() {
        auto c = clip("a", "v1", 0, 1000, "text");
        QJsonObject style{{"text", "Title"}, {"fontSizePx", 40}, {"color", "white"}};
        QJsonObject reset;
        for (const auto* key : {"fontFamily", "fontWeight", "fontStyle", "verticalAlign", "maxWidthFrac", "strikethrough", "stroke", "shadow", "background", "fill"}) {
            style.insert(QLatin1String(key), "old");
            reset.insert(QLatin1String(key), QJsonValue::Null);
        }
        c.insert("textStyle", style);
        const auto result = applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params", {{"target", "a"}, {"textStyle", reset}, {"maxSourceDurationMs", 2000}});
        QCOMPARE(result.value("clips").toArray()[0].toObject().value("textStyle").toObject(), (QJsonObject{{"text", "Title"}, {"fontSizePx", 40}, {"color", "white"}}));
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(result, "set_clip_params", {{"target", "a"}, {"textStyle", QJsonObject{{"text", QJsonValue::Null}}}}));
        const auto valid = applyMusicClipEdit(result, "set_clip_params", {{"target", "a"}, {"borderRadius", 0}, {"textStyle", QJsonObject{
            {"fontFamily", "Inter"}, {"fontStyle", "italic"}, {"verticalAlign", "top"}, {"maxWidthFrac", 1}, {"fontWeight", 600}, {"lineHeight", 1.2},
            {"shadow", QJsonObject{{"color", "black"}, {"blurPx", 0}, {"offsetX", -4}, {"offsetY", -2}}}}}});
        QCOMPARE(valid.value("clips").toArray()[0].toObject().value("textStyle").toObject().value("fontFamily").toString(), QString("Inter"));
    }
    void reviewRegressions_data() {
        QTest::addColumn<QJsonObject>("raw");
        QTest::addColumn<QJsonArray>("patches");
        QTest::addColumn<QJsonObject>("expected");
        QTest::addColumn<bool>("reject");
        QTest::newRow("C1-slip-past-out") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"inPointMs\":5000}]").array() << QJsonDocument::fromJson("{\"a\":{\"inPointMs\":5000,\"outPointMs\":6000}}").object() << false;
        QTest::newRow("C2-combined-bound") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":500,\"inPointMs\":1500,\"outPointMs\":2000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"durationMs\":1500,\"inPointMs\":0,\"outPointMs\":1500,\"maxSourceDurationMs\":2000}]").array() << QJsonDocument::fromJson("{\"a\":{\"durationMs\":1500,\"inPointMs\":0,\"outPointMs\":1500}}").object() << false;
        QTest::newRow("C3-duration-500") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"durationMs\":500,\"inPointMs\":500}]").array() << QJsonDocument::fromJson("{\"a\":{\"durationMs\":500,\"inPointMs\":500,\"outPointMs\":1000}}").object() << false;
        QTest::newRow("C3-duration-2000") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"durationMs\":2000,\"inPointMs\":500}]").array() << QJsonDocument::fromJson("{\"a\":{\"durationMs\":2000,\"inPointMs\":500,\"outPointMs\":2500}}").object() << false;
        QTest::newRow("C4-slip-bound") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":2000,\"inPointMs\":0,\"outPointMs\":null,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"inPointMs\":2500,\"maxSourceDurationMs\":3000}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C5-slip-zero") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":116,\"outPointMs\":1866,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"speedMultiplier\":1.75}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"inPointMs\":0}]").array() << QJsonDocument::fromJson("{\"a\":{\"inPointMs\":0}}").object() << false;
        QTest::newRow("C6-linked-pattern-backward") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"linkId\":\"pair\"},{\"id\":\"b\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"midi\",\"sourceType\":\"imported\",\"pattern\":{\"notes\":[]},\"patternPhaseTicks\":0,\"linkId\":\"pair\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"inPointMs\":500},{\"target\":\"a\",\"inPointMs\":250}]").array() << QJsonDocument::fromJson("{\"b\":{\"patternPhaseTicks\":480}}").object() << false;
        QTest::newRow("C6-direct-pattern-backward") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"midi\",\"sourceType\":\"imported\",\"pattern\":{\"notes\":[]}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"inPointMs\":500},{\"target\":\"a\",\"inPointMs\":250}]").array() << QJsonDocument::fromJson("{\"a\":{\"patternPhaseTicks\":480}}").object() << false;
        QTest::newRow("C7-group-child-track-lock") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":2000,\"inPointMs\":0,\"outPointMs\":2000,\"mediaType\":\"group\",\"sourceType\":\"imported\"},{\"id\":\"child\",\"trackId\":\"v2\",\"startMs\":0,\"durationMs\":2000,\"inPointMs\":0,\"outPointMs\":2000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"parentId\":\"a\"}],\"tracks\":[{\"id\":\"v1\"},{\"id\":\"v2\",\"locked\":true}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"durationMs\":1000}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C7-group-linked-lock") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":2000,\"inPointMs\":0,\"outPointMs\":2000,\"mediaType\":\"group\",\"sourceType\":\"imported\",\"linkId\":\"pair\"},{\"id\":\"child\",\"trackId\":\"v2\",\"startMs\":0,\"durationMs\":2000,\"inPointMs\":0,\"outPointMs\":2000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"parentId\":\"a\"},{\"id\":\"b\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"linkId\":\"pair\",\"locked\":true}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"durationMs\":1000}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C7-group-source-bound") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":2000,\"inPointMs\":0,\"outPointMs\":2000,\"mediaType\":\"group\",\"sourceType\":\"imported\"},{\"id\":\"child\",\"trackId\":\"v2\",\"startMs\":0,\"durationMs\":2000,\"inPointMs\":0,\"outPointMs\":2000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"parentId\":\"a\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"durationMs\":3000,\"maxSourceDurationMs\":2500}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C8-linked-window") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"linkId\":\"pair\"},{\"id\":\"b\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"linkId\":\"pair\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"durationMs\":750,\"inPointMs\":250,\"outPointMs\":1000}]").array() << QJsonDocument::fromJson("{\"b\":{\"durationMs\":750,\"inPointMs\":250,\"outPointMs\":1000}}").object() << false;
        QTest::newRow("C9-caption-retime") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"caption\":{\"words\":[{\"text\":\"Hello\",\"startMs\":750,\"endMs\":1000}],\"style\":{\"fontFamily\":\"Inter\",\"fontSizeFrac\":0.05,\"color\":\"yellow\"}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"durationMs\":500,\"inPointMs\":500,\"outPointMs\":1000}]").array() << QJsonDocument::fromJson("{\"a\":{\"caption\":{\"words\":[{\"text\":\"Hello\",\"startMs\":250,\"endMs\":500}],\"style\":{\"fontFamily\":\"Inter\",\"fontSizeFrac\":0.05,\"color\":\"yellow\"}}}}").object() << false;
        QTest::newRow("C10-caption-merge") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"caption\":{\"words\":[{\"text\":\"Hello\",\"startMs\":750,\"endMs\":1000}],\"style\":{\"fontFamily\":\"Inter\",\"fontSizeFrac\":0.05,\"color\":\"yellow\"}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"captionStyle\":{\"color\":\"white\"}}]").array() << QJsonDocument::fromJson("{\"a\":{\"caption\":{\"words\":[{\"text\":\"Hello\",\"startMs\":750,\"endMs\":1000}],\"style\":{\"fontFamily\":\"Inter\",\"fontSizeFrac\":0.05,\"color\":\"white\"}}}}").object() << false;
        QTest::newRow("C11-caption-generic") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"caption\":{\"words\":[{\"text\":\"Hello\",\"startMs\":750,\"endMs\":1000}],\"style\":{\"fontFamily\":\"Inter\",\"fontSizeFrac\":0.05,\"color\":\"yellow\"}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"captionStyle\":{\"fontFamily\":\"\\\"sans-serif\\\"\"}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C12-clear-optional") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"textStyle\":{\"stroke\":null}}]").array() << QJsonDocument::fromJson("{\"a\":{\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\"}}}").object() << false;
        QTest::newRow("C13-blend-invalid-mode") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"blendMode\":\"invalid-mode\"}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C13-blend-empty") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"blendMode\":\"\"}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C13-blend-clear") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"blendMode\":\"multiply\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"blendMode\":null}]").array() << QJsonDocument::fromJson("{\"a\":{}}").object() << false;
        QTest::newRow("C14-radius") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"borderRadius\":-25}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C15-gradient-20") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"fillStyle\":{\"type\":\"linear\",\"angle\":45,\"stops\":[]}}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C15-gradient-21") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"fillStyle\":{\"type\":\"linear\",\"angle\":45,\"stops\":[{\"offset\":0,\"color\":\"white\"}]}}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C15-gradient-22") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"fillStyle\":{\"type\":\"linear\",\"angle\":45,\"stops\":[{\"offset\":-2,\"color\":\"white\"},{\"offset\":5,\"color\":\"black\"}]}}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C16-stroke") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"textStyle\":{\"stroke\":{\"color\":\"white\",\"widthPx\":-10}}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C16-shadow") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"textStyle\":{\"shadow\":{\"color\":\"black\",\"blurPx\":-5,\"offsetX\":0,\"offsetY\":0}}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C16-background") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"textStyle\":{\"background\":{\"color\":\"black\",\"paddingPx\":0,\"radiusPx\":-4}}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C17-fontSizePx") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"textStyle\":{\"fontSizePx\":-12}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C17-lineHeight") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"textStyle\":{\"lineHeight\":0}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C17-fontWeight") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"textStyle\":{\"fontWeight\":0}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C17-maxWidthFrac") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"textStyle\":{\"maxWidthFrac\":1.1}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C17-fontStyle") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"textStyle\":{\"fontStyle\":\"bogus\"}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C17-verticalAlign") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"textStyle\":{\"verticalAlign\":\"sideways\"}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C17-size-shorthand") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"textStyle\":{\"text\":\"Title\",\"fontSizePx\":40,\"color\":\"white\",\"stroke\":{\"color\":\"black\",\"widthPx\":2}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"fontSizePx\":0}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C17-fontSizeFrac") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"caption\":{\"words\":[{\"text\":\"Hello\",\"startMs\":750,\"endMs\":1000}],\"style\":{\"fontFamily\":\"Inter\",\"fontSizeFrac\":0.05,\"color\":\"yellow\"}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"captionStyle\":{\"fontSizeFrac\":0}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C17-bottomMarginFrac") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\",\"caption\":{\"words\":[{\"text\":\"Hello\",\"startMs\":750,\"endMs\":1000}],\"style\":{\"fontFamily\":\"Inter\",\"fontSizeFrac\":0.05,\"color\":\"yellow\"}}}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"captionStyle\":{\"bottomMarginFrac\":-1}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-kind") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"invalid\"}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-strokeWidthPx") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"strokeWidthPx\":-4}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-width") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"width\":-1}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-height") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"height\":-1}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-sides") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"sides\":1}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-innerRadius") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"innerRadius\":-1}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-cornerRadius") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"cornerRadius\":-1}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-trimStart") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"trimStart\":2}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-trimEnd") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"trimEnd\":-1}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-dash") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"dash\":[-5,0]}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-lineCap") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"lineCap\":\"pointy\"}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C18-lineJoin") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"shapeStyle\":{\"kind\":\"rect\",\"lineJoin\":\"bogus\"}}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C20-bound-2000") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"maxSourceDurationMs\":\"2000\"}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C20-bound-0") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"maxSourceDurationMs\":0}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C20-bound--1") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"maxSourceDurationMs\":-1}]").array() << QJsonDocument::fromJson("{}").object() << true;
        QTest::newRow("C20-bound-None") << QJsonDocument::fromJson("{\"clips\":[{\"id\":\"a\",\"trackId\":\"v1\",\"startMs\":0,\"durationMs\":1000,\"inPointMs\":0,\"outPointMs\":1000,\"mediaType\":\"audio\",\"sourceType\":\"imported\"}]}").object() << QJsonDocument::fromJson("[{\"target\":\"a\",\"maxSourceDurationMs\":null}]").array() << QJsonDocument::fromJson("{}").object() << true;
    }
    void reviewRegressions() {
        QFETCH(QJsonObject, raw);
        QFETCH(QJsonArray, patches);
        QFETCH(QJsonObject, expected);
        QFETCH(bool, reject);
        try {
            for (const auto& patch : patches) { raw = applyMusicClipEdit(raw, "set_clip_params", patch.toObject()); }
            QVERIFY2(!reject, "Invalid edit was accepted");
            for (auto it = expected.begin(); it != expected.end(); ++it) {
                QJsonObject actual;
                for (const auto& v : raw.value("clips").toArray()) {
                    if (v.toObject().value("id").toString() == it.key()) { actual = v.toObject(); }
                }
                QVERIFY(!actual.isEmpty());
                const auto fields = it.value().toObject();
                for (auto field = fields.begin(); field != fields.end(); ++field) { QCOMPARE(actual.value(field.key()), field.value()); }
                if (qPrintable(QTest::currentDataTag()) == QString("C13-blend-clear")) { QVERIFY(!actual.contains("blendMode")); }
            }
        } catch (const OpError& error) { QVERIFY2(reject, error.what()); }
    }
    void reviewC19Nonfinite_data() {
        QTest::addColumn<QJsonObject>("patch");
        for (double n : {std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::infinity()}) {
            const auto tag = std::isnan(n) ? QString("nan") : QString("inf");
            const QJsonObject patches[] = {
                {{"crop", QJsonObject{{"left", n}, {"right", 0}, {"top", 0}, {"bottom", 0}}}},
                {{"transform", QJsonObject{{"perspective", n}}}},
                {{"transform", QJsonObject{{"position", QJsonObject{{"x", n}}}}}},
                {{"fontSizePx", n}}, {{"textStyle", QJsonObject{{"lineHeight", n}}}},
                {{"shapeStyle", QJsonObject{{"kind", "rect"}, {"width", n}}}},
                {{"captionStyle", QJsonObject{{"fontSizeFrac", n}}}},
                {{"textStyle", QJsonObject{{"stroke", QJsonObject{{"color", "white"}, {"widthPx", n}}}}}},
                {{"shapeStyle", QJsonObject{{"kind", "rect"}, {"fillStyle", QJsonObject{{"type", "linear"}, {"angle", n}, {"stops", QJsonArray{QJsonObject{{"offset", 0}, {"color", "white"}}, QJsonObject{{"offset", 1}, {"color", "black"}}}}}}}}},
                {{"maxSourceDurationMs", n}, {"outPointMs", 500}}};
            int i = 0;
            for (const auto& patch : patches) { QTest::newRow(qPrintable(tag + QString::number(i++))) << patch; }
        }
    }
    void reviewC19Nonfinite() {
        QFETCH(QJsonObject, patch);
        auto c = clip("a", "v1", 0, 1000);
        c.insert("textStyle", QJsonObject{{"text", "Title"}, {"fontSizePx", 40}, {"color", "white"}});
        c.insert("caption", QJsonObject{{"words", QJsonArray{}}});
        patch.insert("target", "a");
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params", patch));
    }
    void reviewC21CropKeepsNoPicture() {
        const QJsonObject raw{{"clips", QJsonArray{clip("a", "v1", 0, 1000)}}};
        try {
            applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"crop", QJsonObject{{"left", 0.8}, {"right", 0.2}, {"top", 0}, {"bottom", 0}}}});
            QFAIL("Empty crop accepted");
        } catch (const OpError& error) { QCOMPARE(QString(error.what()), QString("Crop keeps no picture")); }
    }
    void clipParamsSlipReslicesSourceAnimations() {
        auto a = clip("a", "v1", 0, 1000);
        auto b = clip("b", "v1", 0, 500);
        a.insert("linkId", "pair");
        b.insert("linkId", "pair");
        b.insert("speedMultiplier", 2);
        a.insert("animations", sourceAnchoredAnimation());
        b.insert("animations", sourceAnchoredAnimation());
        const auto result = applyMusicClipEdit({{"clips", QJsonArray{a, b}}}, "set_clip_params",
                                              {{"target", "a"}, {"inPointMs", 1000}});
        const auto clips = result.value("clips").toArray();
        for (qsizetype i = 0; i < clips.size(); ++i) {
            const auto keys = clips[i].toObject().value("animations").toArray()[0].toObject()
                                  .value("custom").toObject().value("curves").toArray()[0].toObject()
                                  .value("keyframes").toArray();
            QCOMPARE(keys.first().toObject().value("value").toDouble(), i == 0 ? 0.25 : 0.5);
            QCOMPARE(keys.last().toObject().value("value").toDouble(), i == 0 ? 0.5 : 0.75);
            QCOMPARE(keys.first().toObject().value("t").toDouble(), 0.0);
            QCOMPARE(keys.last().toObject().value("t").toDouble(), 1.0);
        }
    }
    void clipParamsSlipRejectsTimeRemap_data() {
        QTest::addColumn<bool>("linkedRemap");
        QTest::newRow("primary") << false;
        QTest::newRow("linked") << true;
    }
    void clipParamsSlipRejectsTimeRemap() {
        QFETCH(bool, linkedRemap);
        auto a = clip("a", "v1", 0, 1000);
        auto b = clip("b", "v1", 0, 1000);
        a.insert("linkId", "pair");
        b.insert("linkId", "pair");
        const QJsonObject remap{{"keyframes", QJsonArray{
            QJsonObject{{"t", 0}, {"sourceMs", 0}},
            QJsonObject{{"t", 0.5}, {"sourceMs", 250}},
            QJsonObject{{"t", 1}, {"sourceMs", 1000}}}}};
        if (linkedRemap) { b.insert("timeRemap", remap); }
        else { a.insert("timeRemap", remap); }
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit({{"clips", QJsonArray{a, b}}},
            "set_clip_params", {{"target", "a"}, {"inPointMs", 500}}));
    }
    void clipParamsSourceWindow() {
        auto c = clip("a", "a", 0, 2000, "audio");
        c.insert("inPointMs", 0); c.insert("outPointMs", 2000);
        QJsonObject result;
        try { result = applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params", {{"target", "a"}, {"inPointMs", 500}}); }
        catch (const OpError& error) { QFAIL(error.what()); }
        const auto next = result.value("clips").toArray()[0].toObject();
        QCOMPARE(next.value("inPointMs").toDouble(), 500.0);
        QCOMPARE(next.value("outPointMs").toDouble(), 2500.0);
        QCOMPARE(next.value("durationMs").toDouble(), 2000.0);
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(result, "set_clip_params", {{"target", "a"}, {"outPointMs", 400}}));
    }
    void clipParamsReslicesLinkedMedia() {
        auto a = clip("a", "v", 0, 1000);
        auto b = clip("b", "v", 0, 500, "audio");
        a.insert("linkId", "pair"); b.insert("linkId", "pair"); b.insert("speedMultiplier", 2);
        const QJsonObject track{{"id", "tracking"}, {"clipId", "a"}, {"samples", QJsonArray{
            QJsonObject{{"sourceMs", 0}, {"x", 0}}, QJsonObject{{"sourceMs", 2000}, {"x", 20}}}}};
        const QJsonObject raw{{"clips", QJsonArray{a, b}}, {"mediaTracks", QJsonArray{track}}};
        const auto result = applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"inPointMs", 500}});
        const auto partner = result.value("clips").toArray()[1].toObject();
        QCOMPARE(partner.value("inPointMs").toDouble(), 1000.0);
        QCOMPARE(partner.value("outPointMs").toDouble(), 2000.0);
        const auto sliced = result.value("mediaTracks").toArray()[0].toObject();
        QCOMPARE(sliced.value("id").toString(), QString("tracking"));
        QCOMPARE(sliced.value("sourceStartMs").toDouble(), 500.0);
        QCOMPARE(sliced.value("sourceEndMs").toDouble(), 1500.0);
        QCOMPARE(sliced.value("samples").toArray()[0].toObject().value("x").toDouble(), 5.0);
        const auto explicitWindow = applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"durationMs", 750}, {"inPointMs", 250}, {"outPointMs", 1000}});
        const auto explicitPartner = explicitWindow.value("clips").toArray()[1].toObject();
        QCOMPARE(explicitPartner.value("durationMs").toDouble(), 250.0);
        QCOMPARE(explicitPartner.value("inPointMs").toDouble(), 500.0);
        QCOMPARE(explicitPartner.value("outPointMs").toDouble(), 1000.0);
        const auto next = explicitWindow.value("clips").toArray()[0].toObject();
        QCOMPARE(next.value("inPointMs").toDouble(), 250.0);
        QCOMPARE(next.value("outPointMs").toDouble(), 1000.0);
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"outPointMs", 2001}, {"maxSourceDurationMs", 2000}}));
        b.insert("locked", true);
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit({{"clips", QJsonArray{a, b}}}, "set_clip_params", {{"target", "a"}, {"inPointMs", 500}}));
    }
    void clipParamsSlipsPastPreviousOut() {
        auto c = clip("a", "v", 0, 1000, "audio");
        c.insert("outPointMs", 1000);
        QJsonObject result;
        try { result = applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params", {{"target", "a"}, {"inPointMs", 1000}}); }
        catch (const OpError& error) { QFAIL(error.what()); }
        QCOMPARE(result.value("clips").toArray()[0].toObject().value("outPointMs").toDouble(), 2000.0);
    }
    void clipParamsReslicesLargeDocument() {
        QJsonArray clips, tracks;
        for (int i = 0; i < 10000; ++i) {
            const auto id = QString::number(i);
            auto c = clip(id, "v", 0, 1000, "audio");
            c.insert("linkId", "pair"); clips.append(c);
            tracks.append(QJsonObject{{"id", "track-" + id}, {"clipId", id}, {"samples", QJsonArray{}}});
        }
        const auto result = applyMusicClipEdit({{"clips", clips}, {"mediaTracks", tracks}}, "set_clip_params", {{"target", "0"}, {"inPointMs", 250}});
        QCOMPARE(result.value("mediaTracks").toArray().size(), 10000);
        QCOMPARE(result.value("mediaTracks").toArray().last().toObject().value("sourceStartMs").toDouble(), 250.0);
        QCOMPARE(result.value("clips").toArray().last().toObject().value("outPointMs").toDouble(), 1250.0);
    }
    void clipParamsSlipIgnoresInactiveLoopWindow() {
        auto c = clip("a", "v", 0, 1000, "audio");
        c.insert("loopLengthMs", 2000);
        const auto result = applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params", {{"target", "a"}, {"inPointMs", 250}});
        QCOMPARE(result.value("clips").toArray()[0].toObject().value("outPointMs").toDouble(), 1250.0);
    }
    void clipParamsGroupDuration() {
        auto g = clip("g", "v", 0, 2000, "group");
        auto child = clip("child", "v", 500, 1500);
        child.insert("parentId", "g");
        QJsonObject result;
        try { result = applyMusicClipEdit({{"clips", QJsonArray{g, child}}}, "set_clip_params", {{"target", "g"}, {"durationMs", 1000}}); }
        catch (const OpError& error) { QFAIL(error.what()); }
        QCOMPARE(result.value("clips").toArray()[0].toObject().value("durationMs").toDouble(), 1000.0);
        QCOMPARE(result.value("clips").toArray()[1].toObject().value("durationMs").toDouble(), 500.0);
    }
    void clipParamsVisualFields() {
        auto c = clip("v", "v", 0, 1000);
        c.insert("transform", QJsonObject{{"position", QJsonObject{{"x", 10}, {"y", 20}}}});
        const QJsonObject crop{{"left", 0.1}, {"right", 0.2}, {"top", 0}, {"bottom", 0}};
        QJsonObject result;
        try { result = applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params", {{"target", "v"},
            {"transform", QJsonObject{{"position", QJsonObject{{"x", 30}}}}}, {"crop", crop}, {"blendMode", "multiply"}, {"borderRadius", 8}}); }
        catch (const OpError& error) { QFAIL(error.what()); }
        const auto next = result.value("clips").toArray()[0].toObject();
        QCOMPARE(next.value("transform").toObject().value("position").toObject(), (QJsonObject{{"x", 30}, {"y", 20}}));
        QCOMPARE(next.value("transform").toObject().value("scale").toObject(), (QJsonObject{{"x", 1}, {"y", 1}}));
        QCOMPARE(next.value("crop").toObject(), crop);
        QCOMPARE(next.value("blendMode").toString(), QString("multiply"));
        QCOMPARE(next.value("borderRadius").toDouble(), 8.0);
        const auto cleared = applyMusicClipEdit(result, "set_clip_params", {{"target", "v"}, {"crop", QJsonValue::Null}});
        QVERIFY(!cleared.value("clips").toArray()[0].toObject().contains("crop"));
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(result, "set_clip_params", {{"target", "v"}, {"crop", QJsonObject{{"left", 0.8}, {"right", 0.2}, {"top", 0}, {"bottom", 0}}}}));
    }
    void clipParamsTextStyles() {
        auto c = clip("t", "v", 0, 1000, "text");
        c.insert("textStyle", QJsonObject{{"text", "Title"}, {"fontSizePx", 40}, {"color", "red"}});
        QJsonObject result;
        try { result = applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params", {{"target", "t"}, {"fontSizePx", 72},
            {"textStyle", QJsonObject{{"color", "blue"}, {"strikethrough", true}, {"stroke", QJsonObject{{"color", "white"}, {"widthPx", 2}}}}}}); }
        catch (const OpError& error) { QFAIL(error.what()); }
        const auto style = result.value("clips").toArray()[0].toObject().value("textStyle").toObject();
        QCOMPARE(style.value("text").toString(), QString("Title"));
        QCOMPARE(style.value("fontSizePx").toDouble(), 72.0);
        QCOMPARE(style.value("color").toString(), QString("blue"));
        QVERIFY(style.value("strikethrough").toBool());
        QCOMPARE(style.value("stroke").toObject().value("widthPx").toDouble(), 2.0);
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit({{"clips", QJsonArray{clip("v", "v", 0, 1000)}}}, "set_clip_params", {{"target", "v"}, {"fontSizePx", 72}}));
    }
    void clipParamsShapeAndCaptionStyles() {
        auto c = clip("s", "v", 0, 1000, "shape");
        c.insert("caption", QJsonObject{{"words", QJsonArray{QJsonObject{{"text", "Hello"}, {"startMs", 0}, {"endMs", 500}}}}});
        const QJsonObject captionStyle{{"fontFamily", "Inter"}, {"fontSizeFrac", 0.05}, {"color", "yellow"}};
        QJsonObject result;
        try { result = applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params", {{"target", "s"},
            {"shapeStyle", QJsonObject{{"kind", "line"}}}, {"captionStyle", captionStyle}}); }
        catch (const OpError& error) { QFAIL(error.what()); }
        const auto next = result.value("clips").toArray()[0].toObject();
        QCOMPARE(next.value("shapeStyle").toObject().value("stroke").toString(), QString("#FFFFFF"));
        QCOMPARE(next.value("shapeStyle").toObject().value("strokeWidthPx").toDouble(), 8.0);
        QCOMPARE(next.value("caption").toObject().value("style").toObject(), captionStyle);
        QCOMPARE(next.value("caption").toObject().value("words"), c.value("caption").toObject().value("words"));
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit({{"clips", QJsonArray{clip("v", "v", 0, 1000)}}}, "set_clip_params", {{"target", "v"}, {"captionStyle", captionStyle}}));
    }
    void clipParamsRejectsMalformedStyles_data() {
        QTest::addColumn<QJsonObject>("patch");
        QTest::newRow("generic-font") << QJsonObject{{"textStyle", QJsonObject{{"fontFamily", "sans-serif"}}}};
        QTest::newRow("stroke-width") << QJsonObject{{"textStyle", QJsonObject{{"stroke", QJsonObject{{"color", "white"}, {"widthPx", "wide"}}}}}};
        QTest::newRow("shape-width") << QJsonObject{{"shapeStyle", QJsonObject{{"kind", "rect"}, {"width", "wide"}}}};
        QTest::newRow("caption-size") << QJsonObject{{"captionStyle", QJsonObject{{"fontSizeFrac", "large"}}}};
    }
    void clipParamsRejectsMalformedStyles() {
        QFETCH(QJsonObject, patch);
        auto c = clip("t", "v", 0, 1000, "text");
        c.insert("textStyle", QJsonObject{{"text", "Title"}, {"fontSizePx", 40}, {"color", "white"}});
        c.insert("caption", QJsonObject{{"words", QJsonArray{}}});
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params", {{"target", "t"}, {"patch", patch}}));
    }
    void clipParamsMovesAndTrimsLinkedClips() {
        auto a = clip("a", "a", 1000, 2000, "audio");
        auto b = clip("b", "b", 1000, 2000, "audio");
        a.insert("linkId", "pair"); b.insert("linkId", "pair");
        const QJsonObject raw{{"clips", QJsonArray{a, b}}, {"tracks", QJsonArray{
            QJsonObject{{"id", "a"}, {"type", "audio"}}, QJsonObject{{"id", "b"}, {"type", "audio"}},
            QJsonObject{{"id", "c"}, {"type", "audio"}}}}};
        QJsonObject result;
        try { result = applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"startMs", 500},
            {"trackId", "c"}, {"durationMs", 1000}, {"name", "Short"}}); }
        catch (const OpError& error) { QFAIL(error.what()); }
        const auto clips = result.value("clips").toArray();
        for (const auto& value : clips) {
            const auto c = value.toObject();
            QCOMPARE(c.value("startMs").toDouble(), 500.0);
            QCOMPARE(c.value("durationMs").toDouble(), 1000.0);
            QCOMPARE(c.value("outPointMs").toDouble(), 1000.0);
        }
        QCOMPARE(clips[0].toObject().value("trackId").toString(), QString("c"));
        QCOMPARE(clips[1].toObject().value("trackId").toString(), QString("b"));
        QCOMPARE(clips[0].toObject().value("name").toString(), QString("Short"));
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"durationMs", 0}}));
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"startMs", -1}}));
    }
    void clipParamsCanLockAfterChangingTiming() {
        const QJsonObject raw{{"clips", QJsonArray{clip("a", "a", 1000, 2000, "audio")}}};
        QJsonObject result;
        try { result = applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"durationMs", 1000}, {"locked", true}}); }
        catch (const OpError& error) { QFAIL(error.what()); }
        const auto c = result.value("clips").toArray()[0].toObject();
        QVERIFY(c.value("locked").toBool());
        QCOMPARE(c.value("durationMs").toDouble(), 1000.0);
    }
    void clipParamsRetimesLinkedAudio() {
        auto a = clip("a", "a", 0, 2000, "audio");
        auto b = clip("b", "b", 0, 2000, "audio");
        a.insert("linkId", "pair"); b.insert("linkId", "pair");
        a.insert("outPointMs", 2000); b.insert("outPointMs", 2000);
        const QJsonObject raw{{"clips", QJsonArray{a, b}}};
        QJsonObject result;
        try { result = applyMusicClipEdit(raw, "set_clip_params", {{"target", "a"}, {"speedMultiplier", 2}}); }
        catch (const OpError& error) { QFAIL(error.what()); }
        for (const auto& value : result.value("clips").toArray()) {
            const auto c = value.toObject();
            QCOMPARE(c.value("speedMultiplier").toDouble(), 2.0);
            QCOMPARE(c.value("durationMs").toDouble(), 1000.0);
            QCOMPARE(c.value("outPointMs").toDouble(), 2000.0);
        }
        b.insert("locked", true);
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit({{"clips", QJsonArray{a, b}}},
            "set_clip_params", {{"target", "a"}, {"speedMultiplier", 2}}));
    }
    void clipboardSplitsUseProjectTempoAndOrigin_data() {
        QTest::addColumn<QString>("mode");
        QTest::newRow("insert") << QString("insert");
        QTest::newRow("overwrite") << QString("overwrite");
    }
    void clipboardSplitsUseProjectTempoAndOrigin() {
        QFETCH(QString, mode);
        auto c = clip("m", "m", 0, 2000, "midi");
        c.insert("quantize", QJsonObject{{"grid", "1/4"}, {"strength", 100}});
        c.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 100}, {"durationTick", 100}}});
        const QJsonObject raw{{"clips", QJsonArray{c}}, {"tracks", QJsonArray{QJsonObject{{"id", "m"}, {"type", "midi"}}}},
            {"tempo", QJsonObject{{"bpm", 90}, {"offsetMs", 125}}}};
        clipboard::copyClipsToClipboard({clip("paste", "m", 0, 100, "midi")});
        const auto result = clipboard::applyClipboardEdit("paste", raw, {{"atMs", 50}, {"mode", mode}});
        clipboard::clearClipClipboard();
        const auto clips = result.value("clips").toArray();
        QJsonObject left, right;
        for (const auto& value : clips) {
            const auto part = value.toObject();
            if (part.value("startMs").toDouble() == 0) { left = part; }
            if (part.value("startMs").toDouble() == 150) { right = part; }
        }
        QVERIFY(!left.isEmpty());
        QVERIFY(left.value("notes").toArray().isEmpty());
        if (mode == u"insert") {
            QCOMPARE(right.value("notes").toArray()[0].toObject().value("startTick").toInt(), 108);
        }
    }
    void joinPatternRegions_data() {
        QTest::addColumn<double>("nextStart");
        QTest::addColumn<bool>("keepsPattern");
        QTest::newRow("continuous") << 2000.0 << true;
        QTest::newRow("gap") << 3000.0 << false;
    }
    void joinPatternRegions() {
        QFETCH(double, nextStart); QFETCH(bool, keepsPattern);
        const auto pattern = nt::midi::normalizePattern({{"lengthSteps", 4}, {"stepRate", "1/4"}, {"rows", QJsonArray{
            QJsonObject{{"id", "r"}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", 60}}}, {"lengthSteps", 4},
                {"stepRate", "1/4"}, {"steps", QJsonArray{QJsonObject{{"on", true}}, QJsonObject{}, QJsonObject{}, QJsonObject{}}}}}}});
        auto a = clip("a", "m", 0, 2000, "midi");
        auto b = clip("b", "m", nextStart, 2000, "midi");
        a.insert("pattern", pattern); b.insert("pattern", pattern);
        QJsonArray joined;
        try { joined = applyMusicClipEdit({{"clips", QJsonArray{a, b}}}, "join_clips", {{"clips", QJsonArray{"a", "b"}}}).value("clips").toArray(); }
        catch (const OpError& error) { QFAIL(error.what()); }
        QCOMPARE(joined.size(), 1);
        QCOMPARE(joined[0].toObject().contains("pattern"), keepsPattern);
        if (!keepsPattern) { QCOMPARE(joined[0].toObject().value("notes").toArray().size(), 2); }
    }
    void joinManyMidiClips() {
        QJsonArray clips, ids;
        for (int i = 0; i < 2000; ++i) {
            const auto id = QString::number(i);
            auto c = clip(id, "m", i * 10, 10, "midi"); c.insert("notes", QJsonArray{});
            clips.append(c); ids.append(id);
        }
        const auto joined = applyMusicClipEdit({{"clips", clips}}, "join_clips", {{"clips", ids}}).value("clips").toArray();
        QCOMPARE(joined.size(), 1);
        QCOMPARE(joined[0].toObject().value("durationMs").toDouble(), 20000.0);
    }
    void uiSplitUsesRegionQuantizeTempoOrigin() {
        auto c = clip("m", "m", 0, 1000, "midi");
        c.insert("quantize", QJsonObject{{"grid", "1/4"}, {"strength", 100}});
        c.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 100}, {"durationTick", 100}}});
        const QJsonObject raw{{"clips", QJsonArray{c}}, {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 125}}}};
        const auto result = splitClipAtTime(nt::edit::structure::editDocument(raw), "m", 50);
        QCOMPARE(result.size(), size_t(2));
        QVERIFY(result[0].value("notes").toArray().isEmpty());
        QCOMPARE(result[1].value("notes").toArray()[0].toObject().value("startTick").toInt(), 144);
    }
    void splitBakesQuantizeBeforePartitioning() {
        auto c = clip("m", "m", 0, 1000, "midi");
        c.insert("transpose", 12);
        c.insert("quantize", QJsonObject{{"grid", "1/4"}, {"strength", 100}});
        c.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 100}, {"durationTick", 240}}});
        const auto [left, right] = splitClip(c, 50);
        QCOMPARE(left.value("notes").toArray().size(), 1);
        QCOMPARE(right.value("notes").toArray().size(), 0);
        QCOMPARE(left.value("notes").toArray()[0].toObject().value("durationTick").toInt(), 96);
        QCOMPARE(left.value("transpose").toInt(), 12);
        QCOMPARE(right.value("transpose").toInt(), 12);
        QVERIFY(!left.contains("quantize"));
        QVERIFY(!right.contains("quantize"));
    }
    void regionParamsAreStoredWithoutChangingNotes() {
        auto c = clip("m", "m", 0, 2000, "midi");
        const QJsonArray notes{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 100}, {"durationTick", 240}}};
        c.insert("notes", notes);
        const auto result = applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params",
            {{"clipId", "m"}, {"transpose", 12}, {"velocityOffset", -20}, {"quantize", QJsonObject{{"grid", "1/16"}, {"strength", 100}}}});
        const auto changed = result.value("clips").toArray()[0].toObject();
        QCOMPARE(changed.value("transpose").toInt(), 12);
        QCOMPARE(changed.value("notes").toArray(), notes);
    }
    void joinBakesDifferentMidiParameters() {
        auto a = clip("a", "m", 0, 500, "midi");
        auto b = clip("b", "m", 1000, 500, "midi");
        a.insert("transpose", 12); b.insert("transpose", -12);
        const QJsonArray notes{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 0}, {"durationTick", 240}}};
        a.insert("notes", notes); b.insert("notes", notes);
        const auto joined = applyMusicClipEdit({{"clips", QJsonArray{a, b}}}, "join_clips", {{"clips", QJsonArray{"a", "b"}}}).value("clips").toArray()[0].toObject();
        QVERIFY(!joined.contains("transpose"));
        QCOMPARE(joined.value("notes").toArray()[0].toObject().value("pitch").toInt(), 72);
        QCOMPARE(joined.value("notes").toArray()[1].toObject().value("pitch").toInt(), 48);
    }
    void joinAudioRequiresContinuousSource() {
        auto a = clip("a", "a", 0, 1000, "audio");
        auto b = clip("b", "a", 1000, 1000, "audio");
        a.insert("currentAssetId", "source"); b.insert("currentAssetId", "source");
        b.insert("inPointMs", 1000);
        const QJsonObject raw{{"clips", QJsonArray{a, b}}};
        const QJsonObject params{{"clips", QJsonArray{"a", "b"}}};
        const auto joined = applyMusicClipEdit(raw, "join_clips", params).value("clips").toArray();
        QCOMPARE(joined.size(), 1);
        QCOMPARE(joined[0].toObject().value("durationMs").toDouble(), 2000.0);
        b.insert("currentAssetId", "other");
        try {
            applyMusicClipEdit({{"clips", QJsonArray{a, b}}}, "join_clips", params);
            QFAIL("Different sources must need a bounce");
        } catch (const OpError& error) { QVERIFY(QString::fromUtf8(error.what()).contains("needs bounce")); }
        b.insert("currentAssetId", "source"); b.insert("locked", true);
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit({{"clips", QJsonArray{a, b}}}, "join_clips", params));
    }
    void regionParamsRefuseInvalidValuesAtomically() {
        auto c = clip("m", "m", 0, 2000, "midi");
        const QJsonObject raw{{"clips", QJsonArray{c}}};
        for (double value : {49.0, -49.0, 1.5}) {
            QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(raw, "set_clip_params", {{"clipId", "m"}, {"transpose", value}}));
        }
        c.insert("mediaType", "audio");
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit({{"clips", QJsonArray{c}}}, "set_clip_params", {{"clipId", "m"}, {"transpose", 12}}));
    }
    void joinMidiRebasesControllersAndFitsExpression() {
        auto a = clip("a", "m", 1000, 500, "midi");
        auto b = clip("b", "m", 2000, 500, "midi");
        a.insert("inPointMs", 250);
        a.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 480}, {"durationTick", 1200},
            {"expression", QJsonObject{{"pitch", QJsonArray{QJsonObject{{"tick", 0}, {"value", 0}}, QJsonObject{{"tick", 1200}, {"value", 12}}}}}}}});
        b.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 64}, {"velocity", 90}, {"startTick", 0}, {"durationTick", 240}}});
        a.insert("controllers", QJsonArray{QJsonObject{{"id", "cc-a"}, {"kind", "cc"}, {"cc", 1}, {"points", QJsonArray{
            QJsonObject{{"id", "p1"}, {"tick", 480}, {"value", 64}}, QJsonObject{{"id", "p2"}, {"tick", 960}, {"value", 100}}}}}});
        b.insert("controllers", QJsonArray{QJsonObject{{"id", "cc-b"}, {"kind", "cc"}, {"cc", 1}, {"points", QJsonArray{
            QJsonObject{{"id", "p3"}, {"tick", 0}, {"value", 32}}}}}});
        const auto joined = applyMusicClipEdit({{"clips", QJsonArray{a, b}}}, "join_clips", {{"clips", QJsonArray{"a", "b"}}}).value("clips").toArray()[0].toObject();
        const auto notes = joined.value("notes").toArray();
        QCOMPARE(notes[0].toObject().value("startTick").toInt(), 0);
        QCOMPARE(notes[0].toObject().value("durationTick").toInt(), 960);
        const auto expression = notes[0].toObject().value("expression").toObject().value("pitch").toArray();
        QCOMPARE(expression.last().toObject().value("tick").toInt(), 960);
        QCOMPARE(expression.last().toObject().value("value").toDouble(), 9.6);
        QCOMPARE(notes[1].toObject().value("startTick").toInt(), 1920);
        QVERIFY(notes[0].toObject().value("id") != notes[1].toObject().value("id"));
        const auto lanes = joined.value("controllers").toArray();
        QCOMPARE(lanes.size(), 1);
        const auto points = lanes[0].toObject().value("points").toArray();
        QCOMPARE(points.size(), 3);
        QCOMPARE(points[0].toObject().value("tick").toInt(), 0);
        QCOMPARE(points[1].toObject().value("tick").toInt(), 480);
        QCOMPARE(points[2].toObject().value("tick").toInt(), 1920);
    }
    void joinDropsControllersOutsideTheOriginalWindows() {
        auto a = clip("a", "m", 0, 500, "midi");
        auto b = clip("b", "m", 2000, 500, "midi");
        a.insert("controllers", QJsonArray{QJsonObject{{"id", "lane"}, {"kind", "cc"}, {"cc", 1}, {"points", QJsonArray{
            QJsonObject{{"id", "point"}, {"tick", 1920}, {"value", 100}}}}}});
        const auto joined = applyMusicClipEdit({{"clips", QJsonArray{a, b}}}, "join_clips", {{"clips", QJsonArray{"a", "b"}}}).value("clips").toArray()[0].toObject();
        QVERIFY(joined.value("controllers").toArray().isEmpty());
    }
    void joinMidiKeepsGapAndRebasesNotes() {
        auto a = clip("a", "m", 1000, 500, "midi");
        auto b = clip("b", "m", 2000, 500, "midi");
        a.insert("notes", QJsonArray{QJsonObject{{"id", "n1"}, {"pitch", 60}, {"velocity", 90}, {"startTick", 0}, {"durationTick", 240}}});
        b.insert("notes", QJsonArray{QJsonObject{{"id", "n2"}, {"pitch", 64}, {"velocity", 80}, {"startTick", 0}, {"durationTick", 240}}});
        const auto after = applyMusicClipEdit({{"clips", QJsonArray{a, b}}}, "join_clips", {{"clips", QJsonArray{"b", "a"}}});
        QVERIFY(!after.contains("selectedClipIds"));
        const auto result = after.value("clips").toArray();
        QCOMPARE(result.size(), 1);
        QCOMPARE(result[0].toObject().value("durationMs").toDouble(), 1500.0);
        QCOMPARE(result[0].toObject().value("notes").toArray()[1].toObject().value("startTick").toInt(), 1920);
    }
    void loopUnrollSlicesWholeClipCurves_data() {
        QTest::addColumn<bool>("animation");
        QTest::newRow("parameter-curve") << false;
        QTest::newRow("keyframe-animation") << true;
    }
    void loopUnrollSlicesWholeClipCurves() {
        QFETCH(bool, animation);
        auto source = clip("a", "aud", 0, 6000, "audio");
        source.insert("loopLengthMs", 2000);
        source.insert("outPointMs", 2000);
        const QJsonArray curves{QJsonObject{{"property", "volumeDb"}, {"keyframes", QJsonArray{
            QJsonObject{{"t", 0}, {"value", 0}}, QJsonObject{{"t", 1}, {"value", 1}}}}}};
        if (animation) {
            source.insert("animations", QJsonArray{QJsonObject{{"id", "anim"}, {"preset", "custom"}, {"role", "emphasis"},
                {"params", QJsonObject{{"keyframed", true}}}, {"custom", QJsonObject{{"curves", curves}}}}});
        } else { source.insert("paramCurves", curves); }
        const auto copies = expandMusicLoops({{"clips", QJsonArray{source}}}).value("clips").toArray();
        QCOMPARE(copies.size(), 3);
        for (qsizetype i = 0; i < copies.size(); ++i) {
            const auto copy = copies[i].toObject();
            const auto sliced = animation ? copy.value("animations").toArray()[0].toObject().value("custom").toObject().value("curves").toArray()
                                          : copy.value("paramCurves").toArray();
            const auto keys = sliced[0].toObject().value("keyframes").toArray();
            QCOMPARE(keys.first().toObject().value("value").toDouble(), double(i) / 3);
            QCOMPARE(keys.last().toObject().value("value").toDouble(), double(i + 1) / 3);
        }
    }
    void barMoveKeepsLinkedOffsetsAndDestination() {
        auto source = clip("a", "aud", 2000, 2000, "audio");
        auto partner = clip("b", "other", 3000, 2000, "audio");
        source.insert("linkId", "L"); partner.insert("linkId", "L");
        const QJsonObject raw{{"clips", QJsonArray{source, partner}}, {"tracks", QJsonArray{
            QJsonObject{{"id", "aud"}, {"type", "audio"}}, QJsonObject{{"id", "other"}, {"type", "audio"}},
            QJsonObject{{"id", "destination"}, {"type", "audio"}}}}};
        const auto result = applyMusicClipEdit(raw, "move_clip", {{"clipId", "a"}, {"atBar", 4}, {"trackId", "destination"}}).value("clips").toArray();
        QCOMPARE(clipStartMs(result[0].toObject()), 6000.0);
        QCOMPARE(clipTrackId(result[0].toObject()), QStringLiteral("destination"));
        QCOMPARE(clipStartMs(result[1].toObject()), 7000.0);
        QCOMPARE(clipTrackId(result[1].toObject()), QStringLiteral("other"));
    }
    void musicTrimKeepsLinkedEdges_data() {
        QTest::addColumn<QString>("mode");
        for (const auto* mode : {"head", "tail", "locked"}) { QTest::newRow(mode) << QString::fromLatin1(mode); }
    }
    void musicTrimKeepsLinkedEdges() {
        QFETCH(QString, mode);
        auto source = clip("a", "aud", 2000, 4000, "audio");
        source.insert("inPointMs", 0); source.insert("outPointMs", 4000); source.insert("linkId", "L");
        auto partner = source; partner.insert("id", "b"); partner.insert("trackId", "other");
        if (mode == "locked") { partner.insert("locked", true); }
        const QJsonObject raw{{"clips", QJsonArray{source, partner}}, {"tracks", QJsonArray{QJsonObject{{"id", "aud"}}, QJsonObject{{"id", "other"}}}}};
        const QJsonObject payload = mode == "head" ? QJsonObject{{"clipId", "a"}, {"startMs", 3000}} : QJsonObject{{"clipId", "a"}, {"atBar", 3}};
        if (mode == "locked") { QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(raw, "trim_clip", payload)); return; }
        const auto result = applyMusicClipEdit(raw, "trim_clip", payload).value("clips").toArray();
        QCOMPARE(clipStartMs(result[1].toObject()), mode == "head" ? 3000.0 : 2000.0);
        QCOMPARE(clipDurationMs(result[1].toObject()), mode == "head" ? 3000.0 : 2000.0);
    }
    void nativeTrimActionsFollowLoopRules_data() {
        QTest::addColumn<bool>("head");
        QTest::newRow("head-unrolls") << true;
        QTest::newRow("tail-keeps-window-with-source-cap") << false;
    }
    void nativeTrimActionsFollowLoopRules() {
        QFETCH(bool, head);
        auto source = clip("a", "aud", 0, 6000, "audio");
        source.insert("inPointMs", 0); source.insert("outPointMs", 2000); source.insert("loopLengthMs", 2000);
        EditDoc doc; doc.clips = {source}; doc.tracks = {{"aud", "audio", false}};
        const auto result = head ? trimClipStart(doc, "a", -1000, true) : trimClipEnd(doc, "a", 2000, 2000, true);
        QCOMPARE(result.size(), head ? size_t(3) : size_t(1));
        QCOMPARE(clipDurationMs(result[0]), head ? 1000.0 : 8000.0);
        QCOMPARE(result[0].contains("loopLengthMs"), !head);
    }

    void loopHeadTrimKeepsOrdinaryTrimBounds_data() {
        QTest::addColumn<QString>("mode");
        for (const auto* mode : {"extend", "before-source", "empty", "past-first-window"}) { QTest::newRow(mode) << QString::fromLatin1(mode); }
    }
    void loopHeadTrimKeepsOrdinaryTrimBounds() {
        QFETCH(QString, mode);
        auto source = clip("a", "aud", 2000, 6000, "audio");
        source.insert("inPointMs", mode == "before-source" ? 0 : 500);
        source.insert("outPointMs", mode == "before-source" ? 2000 : 2500);
        source.insert("loopLengthMs", 2000);
        const QJsonObject raw{{"clips", QJsonArray{source}}, {"tracks", QJsonArray{QJsonObject{{"id", "aud"}}}}};
        const QJsonObject payload{{"clipId", "a"}, {"startMs", mode == "empty" ? 8000 : mode == "past-first-window" ? 4500 : 1800}};
        if (mode != "extend") { QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(raw, "trim_clip", payload)); return; }
        const auto clips = applyMusicClipEdit(raw, "trim_clip", payload).value("clips").toArray();
        QCOMPARE(clips.size(), 3);
        QCOMPARE(clipStartMs(clips[0].toObject()), 1800.0);
        QCOMPARE(clipDurationMs(clips[0].toObject()), 2200.0);
        QCOMPARE(clips[0].toObject().value("inPointMs").toDouble(), 300.0);
        QCOMPARE(clipStartMs(clips[1].toObject()), 4000.0);
    }

    void pastedSectionsResolveAgentTrackPrefixes_data() {
        QTest::addColumn<bool>("locked");
        QTest::newRow("writable") << false;
        QTest::newRow("locked") << true;
    }
    void pastedSectionsResolveAgentTrackPrefixes() {
        QFETCH(bool, locked);
        const QString trackId = "abcdef01234500000000000000000000";
        const QJsonObject raw{{"clips", QJsonArray{}}, {"tracks", QJsonArray{QJsonObject{{"id", trackId}, {"locked", locked}, {"name", "Receiving track"}}}}};
        const QJsonObject payload{{"atMs", 0}, {"content", QJsonObject{{"lengthMs", 1000},
            {"clips", QJsonArray{clip("copy", "abcdef012345", 0, 1000, "audio")}}}}};
        if (locked) {
            QVERIFY_THROWS_EXCEPTION(OpError, applySectionEdit(raw, "paste_range", payload));
        } else {
            const auto result = applySectionEdit(raw, "paste_range", payload).value("clips").toArray();
            QCOMPARE(result.size(), 1);
            QCOMPARE(result[0].toObject().value("trackId"), QJsonValue(trackId));
        }
    }

    void sectionEditsPreserveUnrelatedLinks_data() {
        QTest::addColumn<bool>("insert");
        QTest::newRow("insert") << true;
        QTest::newRow("delete") << false;
    }
    void sectionEditsPreserveUnrelatedLinks() {
        QFETCH(bool, insert);
        auto unrelated = clip("a", "a", 10000, 2000, "audio");
        unrelated.insert("linkId", "legacy");
        const QJsonObject raw{{"clips", QJsonArray{unrelated, clip("b", "b", 0, 4000, "audio")}},
            {"tracks", QJsonArray{QJsonObject{{"id", "a"}}, QJsonObject{{"id", "b"}}}}};
        const QJsonObject payload = insert ? QJsonObject{{"atMs", 2000}, {"ms", 1000}, {"trackIds", QJsonArray{"b"}}} :
            QJsonObject{{"fromMs", 1000}, {"toMs", 2000}, {"trackIds", QJsonArray{"b"}}};
        const auto result = applySectionEdit(raw, insert ? "insert_time" : "delete_time", payload);
        QCOMPARE(result.value("clips").toArray()[0].toObject().value("linkId"), QJsonValue("legacy"));
    }
    void repeatDoesNotCreateASingletonLink() {
        auto source = clip("a", "a", 0, 2000, "audio");
        source.insert("linkId", "legacy");
        const QJsonObject raw{{"clips", QJsonArray{source}}, {"tracks", QJsonArray{QJsonObject{{"id", "a"}}}}};
        const auto clips = applyMusicClipEdit(raw, "duplicate_clip", {{"clipId", "a"}, {"count", 1}}).value("clips").toArray();
        QCOMPARE(clips[0].toObject().value("linkId"), QJsonValue("legacy"));
        QVERIFY(!clips[1].toObject().contains("linkId"));
    }

    void musicTrimHonorsTheResolvedSourceBound() {
        auto source = clip("a", "aud", 0, 2000, "audio");
        source.insert("inPointMs", 0);
        source.insert("outPointMs", 2000);
        const QJsonObject raw{{"clips", QJsonArray{source}}, {"tracks", QJsonArray{QJsonObject{{"id", "aud"}}}}};
        QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(raw, "trim_clip", {{"clipId", "a"}, {"durationMs", 4000}, {"maxSourceDurationMs", 2000}}));
    }

    void splitMusicAliasKeepsCrossingTail() {
        auto source = clip("a", "m", 0, 1000, "midi");
        source.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"pitch", 60}, {"startTick", 0}, {"durationTick", 1920}}});
        const QJsonObject raw{{"clips", QJsonArray{source}}, {"tracks", QJsonArray{QJsonObject{{"id", "m"}}}}};
        const auto result = applyMusicClipEdit(raw, "split_clip", {{"clipId", "a"}, {"atMs", 500}, {"crossing", "split"}}).value("clips").toArray();
        QCOMPARE(result.size(), 2);
        const auto notes = result[1].toObject().value("notes").toArray();
        QCOMPARE(notes.size(), 1);
        QCOMPARE(notes[0].toObject().value("durationTick").toDouble(), 960.0);
    }

    void musicTrimAcceptsExistingMillisecondShape() {
        auto source = clip("a", "aud", 2000, 4000, "audio");
        source.insert("inPointMs", 0);
        source.insert("outPointMs", 4000);
        const QJsonObject raw{{"clips", QJsonArray{source}}, {"tracks", QJsonArray{QJsonObject{{"id", "aud"}}}}};
        QJsonObject result;
        QVERIFY_THROWS_NO_EXCEPTION(result = applyMusicClipEdit(raw, "trim_clip", {{"clipId", "a"}, {"durationMs", 2000}}));
        QCOMPARE(clipDurationMs(result.value("clips").toArray()[0].toObject()), 2000.0);
    }
    void splitMusicActionUnrollsAsOneResult() {
        auto source = clip("a", "aud", 0, 6000, "audio");
        source.insert("inPointMs", 0);
        source.insert("outPointMs", 2000);
        source.insert("loopLengthMs", 2000);
        EditDoc doc;
        doc.clips = {source};
        doc.tracks = {{"aud", "audio", false}};
        const auto result = splitClipAtTime(doc, "a", 3000);
        QCOMPARE(result.size(), size_t(4));
        for (const auto& piece : result) { QVERIFY(!piece.contains("loopLengthMs")); }
    }

    void sectionTrackIdsMustBeAnArray() {
        const QJsonObject raw{{"clips", QJsonArray{clip("a", "t", 4000, 1000, "audio")}},
            {"tracks", QJsonArray{QJsonObject{{"id", "t"}}}}};
        QVERIFY_THROWS_EXCEPTION(OpError, applySectionEdit(raw, "insert_time", {{"atMs", 0}, {"ms", 1000}, {"trackIds", "t"}}));
    }

    void scopedSectionEditsKeepGroupsEnclosingChildren_data() {
        QTest::addColumn<bool>("insert");
        QTest::newRow("insert-grows-tail") << true;
        QTest::newRow("delete-grows-head") << false;
    }
    void scopedSectionEditsKeepGroupsEnclosingChildren() {
        QFETCH(bool, insert);
        auto group = clip("g", "groups", insert ? 0 : 5000, 4000, "group");
        auto child = clip("c", "aud", insert ? 0 : 6000, insert ? 4000 : 2000, "audio");
        child.insert("parentId", "g");
        const QJsonObject raw{{"clips", QJsonArray{group, child}}, {"tracks", QJsonArray{QJsonObject{{"id", "groups"}}, QJsonObject{{"id", "aud"}}}}};
        const QJsonObject payload = insert ? QJsonObject{{"atMs", 2000}, {"ms", 2000}, {"trackIds", QJsonArray{"aud"}}} :
            QJsonObject{{"fromMs", 0}, {"toMs", 4000}, {"trackIds", QJsonArray{"aud"}}};
        const auto result = applySectionEdit(raw, insert ? "insert_time" : "delete_time", payload).value("clips").toArray();
        QCOMPARE(clipStartMs(result[0].toObject()), insert ? 0.0 : 2000.0);
        QCOMPARE(clipDurationMs(result[0].toObject()), insert ? 6000.0 : 7000.0);
        if (insert) {
            QJsonArray chain;
            for (int i = 0; i < 1000; ++i) {
                auto parent = clip(QStringLiteral("g%1").arg(i), "groups", 0, 4000, "group");
                if (i > 0) { parent.insert("parentId", QStringLiteral("g%1").arg(i - 1)); }
                chain.append(parent);
            }
            child.insert("parentId", "g999");
            chain.append(child);
            auto large = raw;
            large.insert("clips", chain);
            const auto expanded = applySectionEdit(large, "insert_time", payload).value("clips").toArray();
            QCOMPARE(clipDurationMs(expanded[0].toObject()), 6000.0);
        }
    }

    void sectionEditsKeepTrackingResources_data() {
        QTest::addColumn<QString>("operation");
        for (const auto* name : {"insert_time", "delete_time", "duplicate_range", "paste_range", "split_clip"}) { QTest::newRow(name) << QString::fromLatin1(name); }
    }
    void sectionEditsKeepTrackingResources() {
        QFETCH(QString, operation);
        auto source = clip("v", "v", 0, 4000, "video");
        source.insert("inPointMs", 0);
        source.insert("outPointMs", 4000);
        source.insert("reframe", QJsonObject{{"trackId", "mt"}});
        const QJsonObject media{{"id", "mt"}, {"clipId", "v"}, {"sourceStartMs", 0}, {"sourceEndMs", 4000},
            {"samples", QJsonArray{QJsonObject{{"sourceMs", 0}, {"x", 0}, {"y", 0}, {"width", 1}, {"height", 1}},
                QJsonObject{{"sourceMs", 4000}, {"x", 4}, {"y", 0}, {"width", 1}, {"height", 1}}}}};
        auto bound = clip("bound", "v", 5000, 1000, "video");
        bound.insert("trackBinding", QJsonObject{{"trackId", "mt"}, {"mode", "position"}});
        const QJsonObject raw{{"clips", operation == "delete_time" ? QJsonArray{source, bound} : QJsonArray{source}},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}}}}, {"mediaTracks", QJsonArray{media}}};
        QJsonObject payload;
        if (operation == "insert_time") { payload = {{"atMs", 2000}, {"ms", 1000}}; }
        if (operation == "delete_time") { payload = {{"fromMs", 0}, {"toMs", 4000}}; }
        if (operation == "duplicate_range") { payload = {{"fromMs", 0}, {"toMs", 2000}}; }
        if (operation == "split_clip") { payload = {{"clipId", "v"}, {"atMs", 2000}}; }
        if (operation == "paste_range") {
            auto copy = source;
            copy.insert("durationMs", 2000); copy.insert("outPointMs", 2000);
            auto copiedMedia = media;
            copiedMedia.insert("sourceEndMs", 2000);
            copiedMedia.insert("samples", QJsonArray{QJsonObject{{"sourceMs", 0}, {"x", 0}}, QJsonObject{{"sourceMs", 2000}, {"x", 2}}});
            payload = {{"atMs", 2000}, {"content", QJsonObject{{"lengthMs", 2000}, {"clips", QJsonArray{copy}}, {"mediaTracks", QJsonArray{copiedMedia}}}}};
        }
        const auto result = operation == "split_clip" ? applyMusicClipEdit(raw, operation, payload) : applySectionEdit(raw, operation, payload);
        const auto resources = result.value("mediaTracks").toArray();
        if (operation == "delete_time") {
            QCOMPARE(resources.size(), 0);
            QVERIFY(!result.value("clips").toArray()[0].toObject().contains("trackBinding"));
            return;
        }
        const auto clips = result.value("clips").toArray();
        QCOMPARE(resources.size(), operation == "insert_time" || operation == "split_clip" ? 2 : 3);
        QCOMPARE(resources.size(), clips.size());
        for (const auto& value : clips) {
            const auto c = value.toObject();
            QJsonObject resource;
            for (const auto& item : resources) {
                if (item.toObject().value("id") == c.value("reframe").toObject().value("trackId")) { resource = item.toObject(); }
            }
            QVERIFY(!resource.isEmpty());
            QCOMPARE(resource.value("clipId"), c.value("id"));
            const bool tail = clipStartMs(c) == (operation == "insert_time" ? 3000 : operation == "split_clip" ? 2000 : 4000);
            QCOMPARE(resource.value("sourceStartMs").toDouble(), tail ? 2000.0 : 0.0);
            QCOMPARE(resource.value("sourceEndMs").toDouble(), tail ? 4000.0 : 2000.0);
            QCOMPARE(resource.value("samples").toArray().first().toObject().value("x").toDouble(), tail ? 2.0 : 0.0);
        }
    }

    void midiPatternSplitKeepsPhaseAndIndependentWindows() {
        auto c = clip("p", "aud", 0, 2000, "midi");
        const QJsonObject pattern{{"version", 1}, {"seed", 1}, {"lengthSteps", 16}, {"stepRate", "1/16"},
            {"playback", "forward"}, {"legato", false}, {"swing", 0}, {"swingDivision", "1/16"},
            {"pitchSource", "off"}, {"scale", "chromatic"}, {"noTranspose", false}, {"scaleQuantize", false},
            {"midiChannel", 1}, {"automationMode", "latch"}, {"mono", false}, {"name", "Pattern"}, {"rows", QJsonArray{}}};
        c.insert("pattern", pattern);
        c.insert("patternPhaseTicks", 480);
        c.insert("inPointMs", 250);
        c.insert("outPointMs", 2250);
        const auto [left, right] = splitClip(c, 500);
        QCOMPARE(left.value("patternPhaseTicks").toDouble(), 960.0);
        QCOMPARE(right.value("patternPhaseTicks").toDouble(), 1920.0);
        QCOMPARE(left.value("inPointMs").toDouble(), 0.0);
        QCOMPARE(right.value("inPointMs").toDouble(), 0.0);
        QCOMPARE(left.value("outPointMs").toDouble(), 500.0);
        QCOMPARE(right.value("outPointMs").toDouble(), 1500.0);
        QCOMPARE(left.value("pattern"), QJsonValue(pattern));
        QCOMPARE(right.value("pattern"), QJsonValue(pattern));
        QVERIFY(!left.contains("notes"));
        QVERIFY(!right.contains("notes"));
    }

    void musicClipEditsResolveUniqueResourcePrefixes() {
        const QString first = "abcdef01234500000000000000000000";
        const QString second = "abcdef01234511111111111111111111";
        const QJsonObject raw{{"clips", QJsonArray{clip(first, "t", 0, 1000, "audio")}},
            {"tracks", QJsonArray{QJsonObject{{"id", "t"}}}}};
        QJsonObject result;
        QVERIFY_THROWS_NO_EXCEPTION(result = applyMusicClipEdit(raw, "loop_clip", {{"clipId", "abcdef012345"}, {"times", 2}}));
        QCOMPARE(result.value("clips").toArray()[0].toObject().value("durationMs").toDouble(), 2000.0);
        auto ambiguous = raw;
        ambiguous.insert("clips", QJsonArray{clip(first, "t", 0, 1000, "audio"), clip(second, "t", 2000, 1000, "audio")});
        bool refused = false;
        try { applyMusicClipEdit(ambiguous, "loop_clip", {{"clipId", "abcdef012345"}, {"times", 2}}); }
        catch (const OpError& e) { refused = QString::fromUtf8(e.what()).contains("ambiguous", Qt::CaseInsensitive); }
        QVERIFY(refused);
    }
    void sectionEditsResolveUniqueTrackPrefixes() {
        const QString first = "abcdef01234500000000000000000000";
        const QString second = "abcdef01234511111111111111111111";
        const QJsonObject raw{{"clips", QJsonArray{clip("a", first, 4000, 1000, "audio")}},
            {"tracks", QJsonArray{QJsonObject{{"id", first}}}}};
        QJsonObject result;
        QVERIFY_THROWS_NO_EXCEPTION(result = applySectionEdit(raw, "insert_time", {{"atMs", 0}, {"ms", 1000}, {"trackIds", QJsonArray{"abcdef012345"}}}));
        QCOMPARE(result.value("clips").toArray()[0].toObject().value("startMs").toDouble(), 5000.0);
        auto ambiguous = raw;
        ambiguous.insert("tracks", QJsonArray{QJsonObject{{"id", first}}, QJsonObject{{"id", second}}});
        bool refused = false;
        try { applySectionEdit(ambiguous, "insert_time", {{"atMs", 0}, {"ms", 1000}, {"trackIds", QJsonArray{"abcdef012345"}}}); }
        catch (const OpError& e) { refused = QString::fromUtf8(e.what()).contains("ambiguous", Qt::CaseInsensitive); }
        QVERIFY(refused);
    }

    void deleteLockedTrackMetadata_data() {
        QTest::addColumn<bool>("automation");
        QTest::newRow("chord") << false;
        QTest::newRow("crossing-ramp") << true;
    }
    void deleteLockedTrackMetadata() {
        QFETCH(bool, automation);
        QJsonObject track{{"id", "t"}, {"name", "Locked track"}, {"locked", true}};
        if (automation) { track.insert("automation", QJsonArray{QJsonObject{{"id", "lane"}, {"points", QJsonArray{
            QJsonObject{{"timeMs", 0}, {"value", 0}}, QJsonObject{{"timeMs", 4000}, {"value", 4}}}}}}); }
        else { track.insert("chords", QJsonArray{QJsonObject{{"id", "c"}, {"startTick", 0}, {"durationTick", 7680}}}); }
        const QJsonObject raw{{"tracks", QJsonArray{track}}, {"clips", QJsonArray{}}};
        bool refused = false;
        try { applySectionEdit(raw, "delete_time", {{"fromMs", 1000}, {"toMs", 3000}}); }
        catch (const OpError& e) { refused = QString::fromUtf8(e.what()).contains("Locked track"); }
        QVERIFY(refused);
    }
    void deletionMovesTempoOrigin_data() {
        QTest::addColumn<QString>("mode");
        for (const auto* mode : {"before-origin", "through-origin", "scoped-refusal"}) { QTest::newRow(mode) << QString::fromLatin1(mode); }
    }
    void deletionMovesTempoOrigin() {
        QFETCH(QString, mode);
        const QJsonObject raw{{"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 2000}}},
            {"clips", QJsonArray{clip("a", "t", 2000, 2000, "audio")}},
            {"tracks", QJsonArray{QJsonObject{{"id", "t"}, {"chords", QJsonArray{QJsonObject{{"id", "c"}, {"startTick", 0}, {"durationTick", 3840}}}}}}}};
        QJsonObject payload = mode == "through-origin" ? QJsonObject{{"fromMs", 500}, {"toMs", 2500}} : QJsonObject{{"fromMs", 0}, {"toMs", 1000}};
        if (mode == "scoped-refusal") {
            payload.insert("trackIds", QJsonArray{"t"});
            QVERIFY_THROWS_EXCEPTION(OpError, applySectionEdit(raw, "delete_time", payload));
            return;
        }
        const auto result = applySectionEdit(raw, "delete_time", payload);
        QCOMPARE(result.value("tempo").toObject().value("offsetMs").toDouble(), mode == "through-origin" ? 500.0 : 1000.0);
        const auto chord = result.value("tracks").toArray()[0].toObject().value("chords").toArray()[0].toObject();
        QCOMPARE(chord.value("startTick").toDouble(), 0.0);
        QCOMPARE(chord.value("durationTick").toDouble(), mode == "through-origin" ? 2880.0 : 3840.0);
    }
    void sectionSplitLinksStayIndependent_data() {
        QTest::addColumn<bool>("restricted");
        QTest::newRow("all-tracks") << false;
        QTest::newRow("one-track") << true;
    }
    void sectionSplitLinksStayIndependent() {
        QFETCH(bool, restricted);
        auto a = clip("a", "a", 0, 4000, "audio");
        auto b = clip("b", "b", 0, 4000, "audio");
        a.insert("linkId", "L"); b.insert("linkId", "L");
        const QJsonObject raw{{"clips", QJsonArray{a, b}}, {"tracks", QJsonArray{QJsonObject{{"id", "a"}}, QJsonObject{{"id", "b"}}}}};
        QJsonObject payload{{"atMs", 2000}, {"ms", 1000}};
        if (restricted) { payload.insert("trackIds", QJsonArray{"a"}); }
        const auto result = applySectionEdit(raw, "insert_time", payload).value("clips").toArray();
        if (restricted) {
            QVERIFY(!result[1].toObject().contains("linkId"));
            QCOMPARE(result[0].toObject().value("linkId"), result[2].toObject().value("linkId"));
        } else {
            QVERIFY(result[0].toObject().value("linkId") != result[1].toObject().value("linkId"));
            QCOMPARE(result[0].toObject().value("linkId"), result[2].toObject().value("linkId"));
            QCOMPARE(result[1].toObject().value("linkId"), result[3].toObject().value("linkId"));
        }
    }

    void loopEndTrimKeepsSourceWindow_data() {
        QTest::addColumn<bool>("shorten");
        QTest::newRow("grow-with-source-bound") << false;
        QTest::newRow("below-one-window") << true;
    }
    void loopEndTrimKeepsSourceWindow() {
        QFETCH(bool, shorten);
        auto c = clip("loop", "aud", 0, 6000, "audio");
        c.insert("loopLengthMs", 2000);
        c.insert("inPointMs", 200);
        c.insert("outPointMs", 4200);
        c.insert("speedMultiplier", 2);
        QJsonObject result;
        QVERIFY_THROWS_NO_EXCEPTION(result = trimClip(c, "end", shorten ? -5000 : 2000, 4200));
        QCOMPARE(clipDurationMs(result), shorten ? 1000.0 : 8000.0);
        QCOMPARE(result.value("outPointMs").toDouble(), shorten ? 2200.0 : 4200.0);
        QCOMPARE(result.contains("loopLengthMs"), !shorten);
    }

    void barAddressedClipEdits_data() {
        QTest::addColumn<QString>("operation");
        for (const auto* name : {"move_clip", "split_clip", "trim-tail", "trim-head", "mixed-time"}) { QTest::newRow(name) << QString::fromLatin1(name); }
    }
    void barAddressedClipEdits() {
        QFETCH(QString, operation);
        auto c = clip("a", "aud", 2000, 4000, "audio");
        c.insert("inPointMs", 0);
        c.insert("outPointMs", 4000);
        const QJsonObject raw{{"clips", QJsonArray{c}}, {"tracks", QJsonArray{QJsonObject{{"id", "aud"}}}}};
        QJsonObject payload{{"clipId", "a"}, {"atBar", 3}};
        QString action = operation;
        if (operation == "mixed-time") {
            payload.insert("startMs", 1000);
            QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(raw, "move_clip", payload));
            return;
        }
        if (operation == "trim-tail") { action = "trim_clip"; }
        if (operation == "trim-head") { action = "trim_clip"; payload = {{"clipId", "a"}, {"startMs", 3000}}; }
        const auto result = applyMusicClipEdit(raw, action, payload).value("clips").toArray();
        if (operation == "split_clip") {
            QCOMPARE(result.size(), 2);
            QCOMPARE(clipStartMs(result[1].toObject()), 4000.0);
            QCOMPARE(clipDurationMs(result[0].toObject()), 2000.0);
        } else {
            const auto changed = result[0].toObject();
            QCOMPARE(clipStartMs(changed), operation == "move_clip" ? 4000.0 : operation == "trim-head" ? 3000.0 : 2000.0);
            QCOMPARE(clipDurationMs(changed), operation == "trim-tail" ? 2000.0 : operation == "trim-head" ? 3000.0 : 4000.0);
        }
    }
    void musicEditsUnrollLoops_data() {
        QTest::addColumn<QString>("operation");
        QTest::addColumn<QString>("type");
        for (const auto* operation : {"split_clip", "insert_time", "duplicate_range", "trim-head"}) {
            for (const auto* type : {"audio", "midi"}) { QTest::newRow(qPrintable(QString::fromLatin1(operation) + '-' + type)) << QString::fromLatin1(operation) << QString::fromLatin1(type); }
        }
    }
    void musicEditsUnrollLoops() {
        QFETCH(QString, operation);
        QFETCH(QString, type);
        auto c = clip("loop", "aud", 0, 6000, type);
        c.insert("loopLengthMs", 2000);
        c.insert("inPointMs", 0);
        c.insert("outPointMs", 2000);
        if (type == "midi") { c.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"startTick", 0}, {"durationTick", 5000}}}); }
        const QJsonObject raw{{"clips", QJsonArray{c}}, {"tracks", QJsonArray{QJsonObject{{"id", "aud"}}}}};
        QJsonObject result;
        if (operation == "split_clip") { result = applyMusicClipEdit(raw, operation, {{"clipId", "loop"}, {"atMs", 3000}}); }
        else if (operation == "trim-head") { result = applyMusicClipEdit(raw, "trim_clip", {{"clipId", "loop"}, {"startMs", 1000}}); }
        else if (operation == "insert_time") { result = applySectionEdit(raw, operation, {{"atMs", 3000}, {"ms", 1000}}); }
        else { result = applySectionEdit(raw, operation, {{"fromMs", 1000}, {"toMs", 5000}}); }
        const auto pieces = result.value("clips").toArray();
        QCOMPARE(pieces.size(), operation == "duplicate_range" ? 7 : operation == "trim-head" ? 3 : 4);
        for (const auto& value : pieces) { QVERIFY(!value.toObject().contains("loopLengthMs")); }
        if (operation == "split_clip") {
            const QList<double> starts{0, 2000, 3000, 4000};
            const QList<double> durations{2000, 1000, 1000, 2000};
            for (qsizetype i = 0; i < pieces.size(); ++i) {
                QCOMPARE(clipStartMs(pieces[i].toObject()), starts[i]);
                QCOMPARE(clipDurationMs(pieces[i].toObject()), durations[i]);
            }
            if (type == "midi") {
                QCOMPARE(pieces[0].toObject().value("notes").toArray()[0].toObject().value("durationTick").toDouble(), 3840.0);
                QCOMPARE(pieces[1].toObject().value("notes").toArray()[0].toObject().value("durationTick").toDouble(), 1920.0);
                QVERIFY(pieces[2].toObject().value("notes").toArray().isEmpty());
            }
        }
    }

    void repeatClipCountAndBarPosition_data() {
        QTest::addColumn<QString>("mode");
        for (const auto* mode : {"back-to-back", "at-bar-beat", "invalid-count", "null-count"}) { QTest::newRow(mode) << QString::fromLatin1(mode); }
    }
    void repeatClipCountAndBarPosition() {
        QFETCH(QString, mode);
        const QJsonObject raw{{"clips", QJsonArray{clip("a", "aud", 0, 1000, "audio")}},
            {"tracks", QJsonArray{QJsonObject{{"id", "aud"}}}}};
        QJsonObject payload{{"clipId", "a"}, {"count", 3}};
        if (mode == "at-bar-beat") { payload.insert("atBar", 2); payload.insert("beat", 2); }
        if (mode == "invalid-count" || mode == "null-count") {
            payload.insert("count", mode == "null-count" ? QJsonValue(QJsonValue::Null) : QJsonValue(0));
            QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(raw, "duplicate_clip", payload));
            return;
        }
        const auto result = applyMusicClipEdit(raw, "duplicate_clip", payload).value("clips").toArray();
        QCOMPARE(result.size(), 4);
        QSet<QString> ids;
        for (qsizetype i = 0; i < result.size(); ++i) {
            const auto c = result[i].toObject();
            ids.insert(clipId(c));
            QCOMPARE(clipStartMs(c), i == 0 ? 0.0 : (mode == "at-bar-beat" ? 2500.0 : 1000.0) + (i - 1) * 1000);
        }
        QCOMPARE(ids.size(), 4);
        if (mode == "back-to-back") {
            QJsonArray family{clip("root", "aud", 0, 12000, "group")};
            for (int i = 0; i < 10000; ++i) {
                auto child = clip(QStringLiteral("child-%1").arg(i), "aud", i, 1, "audio");
                child.insert("parentId", "root");
                family.append(child);
            }
            const QJsonObject large{{"clips", family}, {"tracks", raw.value("tracks")}};
            const auto copied = applyMusicClipEdit(large, "duplicate_clip", {{"clipId", "root"}, {"count", 1}}).value("clips").toArray();
            QCOMPARE(copied.size(), 20002);
            QCOMPARE(copied.last().toObject().value("parentId"), copied[10001].toObject().value("id"));
        }
    }

    void loopClipEndpoints_data() {
        QTest::addColumn<QString>("mode");
        for (const auto* mode : {"times", "untilBar", "remove", "locked"}) { QTest::newRow(mode) << QString::fromLatin1(mode); }
    }
    void loopClipEndpoints() {
        QFETCH(QString, mode);
        auto c = clip("a", "aud", 1000, 1000, "audio");
        c.insert("inPointMs", 200);
        c.insert("outPointMs", mode == "remove" ? 700 : 1200);
        if (mode == "remove") { c.insert("loopLengthMs", 500); }
        if (mode == "locked") { c.insert("locked", true); }
        const QJsonObject raw{{"clips", QJsonArray{c}}, {"tracks", QJsonArray{QJsonObject{{"id", "aud"}}}}};
        QJsonObject payload{{"clipId", "a"}, {"times", 3}};
        if (mode == "untilBar") { payload = {{"clipId", "a"}, {"untilBar", 3}}; }
        if (mode == "remove") { payload = {{"clipId", "a"}, {"loopLengthMs", QJsonValue::Null}}; }
        if (mode == "locked") { QVERIFY_THROWS_EXCEPTION(OpError, applyMusicClipEdit(raw, "loop_clip", payload)); return; }
        const auto result = applyMusicClipEdit(raw, "loop_clip", payload).value("clips").toArray()[0].toObject();
        if (mode == "remove") { QVERIFY(!result.contains("loopLengthMs")); }
        else {
            QCOMPARE(result.value("durationMs").toDouble(), 3000.0);
            QCOMPARE(result.value("loopLengthMs").toDouble(), 1000.0);
        }
        QCOMPARE(result.value("outPointMs").toDouble(), 1200.0);
        if (mode == "times") {
            payload.insert("times", 2.5);
            const auto partial = applyMusicClipEdit(raw, "loop_clip", payload).value("clips").toArray()[0].toObject();
            QCOMPARE(clipDurationMs(partial), 2500.0);
            QCOMPARE(partial.value("loopLengthMs").toDouble(), 1000.0);
        }
    }

    void pasteSongSection_data() {
        QTest::addColumn<QString>("mode");
        for (const auto* mode : {"insert", "overwrite", "locked-track", "locked-clip"}) { QTest::newRow(mode) << QString::fromLatin1(mode); }
    }
    void pasteSongSection() {
        QFETCH(QString, mode);
        auto existing = clip("a", "aud", 0, 8000, "audio");
        if (mode == "locked-clip") { existing.insert("locked", true); existing.insert("name", "Vox"); }
        const QJsonObject raw{{"clips", QJsonArray{existing, clip("other", "other", 4000, 2000, "audio")}},
            {"tracks", QJsonArray{QJsonObject{{"id", "aud"}, {"name", "Audio"}, {"locked", mode == "locked-track"}}, QJsonObject{{"id", "other"}}}}};
        const QJsonObject content{{"lengthMs", 2000}, {"clips", QJsonArray{clip("copy", "aud", 0, 2000, "audio")}},
            {"markers", QJsonArray{QJsonObject{{"id", "k"}, {"timeMs", 500}}}}};
        const QJsonObject payload{{"atBar", 3}, {"content", content}, {"mode", mode == "insert" ? "insert" : "overwrite"}};
        if (mode.startsWith("locked")) {
            bool refused = false;
            try { applySectionEdit(raw, "paste_range", payload); }
            catch (const OpError& e) { refused = QString::fromUtf8(e.what()).contains(mode == "locked-clip" ? "Vox" : "Audio"); }
            QVERIFY(refused);
            return;
        }
        const auto result = applySectionEdit(raw, "paste_range", payload);
        const auto clips = result.value("clips").toArray();
        QCOMPARE(clips.size(), 4);
        double tailEnd = 0;
        double otherStart = -1;
        for (const auto& value : clips) {
            const auto c = value.toObject();
            if (c.value("trackId") == QJsonValue("aud")) { tailEnd = std::max(tailEnd, clipEndMs(c)); }
            else { otherStart = clipStartMs(c); }
        }
        QCOMPARE(tailEnd, mode == "insert" ? 10000.0 : 8000.0);
        QCOMPARE(otherStart, mode == "insert" ? 6000.0 : 4000.0);
        QCOMPARE(result.value("markers").toArray()[0].toObject().value("timeMs").toDouble(), 4500.0);
        QVERIFY(clips.last().toObject().value("id") != QJsonValue("copy"));
    }

    void duplicateSongSection_data() {
        QTest::addColumn<bool>("crossing");
        QTest::newRow("audio-and-metadata") << false;
        QTest::newRow("crossing-midi") << true;
    }
    void duplicateSongSection() {
        QFETCH(bool, crossing);
        auto midi = clip("m", "aud", 0, 8000, "midi");
        midi.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"startTick", 7680}, {"durationTick", 480}}});
        const QJsonArray clips = crossing ? QJsonArray{midi} : QJsonArray{clip("a", "aud", 2000, 2000, "audio"), clip("b", "aud", 6000, 2000, "audio")};
        const QJsonObject raw{{"clips", clips}, {"tracks", QJsonArray{QJsonObject{{"id", "aud"},
            {"chords", QJsonArray{QJsonObject{{"id", "c"}, {"startTick", 3840}, {"durationTick", 1920}}}},
            {"automation", QJsonArray{QJsonObject{{"id", "lane"}, {"points", QJsonArray{
                QJsonObject{{"timeMs", 0}, {"value", 0}}, QJsonObject{{"timeMs", 8000}, {"value", 8}}}}}}}}}},
            {"markers", QJsonArray{QJsonObject{{"id", "k"}, {"timeMs", 2500}}}}};
        const auto result = applySectionEdit(raw, "duplicate_range", {{"fromBar", 2}, {"toBar", 3}});
        const auto copied = result.value("clips").toArray();
        QCOMPARE(copied.size(), 3);
        QList<double> starts;
        QSet<QString> ids;
        for (const auto& value : copied) {
            const auto c = value.toObject();
            starts.append(c.value("startMs").toDouble());
            ids.insert(c.value("id").toString());
            if (crossing && c.value("startMs").toDouble() == 4000) {
                QCOMPARE(c.value("durationMs").toDouble(), 2000.0);
                QVERIFY(c.value("notes").toArray().isEmpty());
            }
        }
        std::sort(starts.begin(), starts.end());
        QCOMPARE(starts, crossing ? QList<double>({0, 4000, 6000}) : QList<double>({2000, 4000, 8000}));
        QCOMPARE(ids.size(), 3);
        QCOMPARE(result.value("markers").toArray().size(), 2);
        QCOMPARE(result.value("markers").toArray()[1].toObject().value("timeMs").toDouble(), 4500.0);
        const auto track = result.value("tracks").toArray()[0].toObject();
        QCOMPARE(track.value("chords").toArray().size(), 2);
        const auto points = track.value("automation").toArray()[0].toObject().value("points").toArray();
        QCOMPARE(points.last().toObject().value("timeMs").toDouble(), 10000.0);
        QCOMPARE(points[2].toObject().value("value").toDouble(), 2.0);
    }

    void deleteSectionTrimsMetadataAndPreservesAutomationSides() {
        const QJsonObject track{{"id", "t"},
            {"chords", QJsonArray{QJsonObject{{"id", "c1"}, {"startTick", 0}, {"durationTick", 3840}},
                QJsonObject{{"id", "c2"}, {"startTick", 3840}, {"durationTick", 3840}}}},
            {"automation", QJsonArray{QJsonObject{{"id", "lane"}, {"points", QJsonArray{
                QJsonObject{{"timeMs", 0}, {"value", 0}}, QJsonObject{{"timeMs", 4000}, {"value", 4}}}}}}}};
        const QJsonObject raw{{"clips", QJsonArray{}}, {"tracks", QJsonArray{track}},
            {"markers", QJsonArray{QJsonObject{{"id", "k"}, {"timeMs", 5000}}}}};
        const auto result = applySectionEdit(raw, "delete_time", {{"fromMs", 1000}, {"toMs", 3000}});
        QCOMPARE(result.value("markers").toArray()[0].toObject().value("timeMs").toDouble(), 3000.0);
        const auto changed = result.value("tracks").toArray()[0].toObject();
        const auto chords = changed.value("chords").toArray();
        QCOMPARE(chords[0].toObject().value("durationTick").toDouble(), 1920.0);
        QCOMPARE(chords[1].toObject().value("startTick").toDouble(), 1920.0);
        QCOMPARE(chords[1].toObject().value("durationTick").toDouble(), 1920.0);
        const auto points = changed.value("automation").toArray()[0].toObject().value("points").toArray();
        QCOMPARE(points.size(), 4);
        QCOMPARE(points[1].toObject().value("timeMs").toDouble(), 1000.0);
        QCOMPARE(points[1].toObject().value("value").toDouble(), 1.0);
        QCOMPARE(points[2].toObject().value("timeMs").toDouble(), 1000.0);
        QCOMPARE(points[2].toObject().value("value").toDouble(), 3.0);
    }

    void deleteSongSection_data() {
        QTest::addColumn<QString>("mode");
        for (const auto* mode : {"all", "restricted", "locked-cut", "locked-after"}) {
            QTest::newRow(mode) << QString::fromLatin1(mode);
        }
    }
    void deleteSongSection() {
        QFETCH(QString, mode);
        auto midi = clip("m", "keys", 0, 8000, "midi");
        auto audio = clip("a", "aud", 4000, 2000, "audio");
        if (mode.startsWith("locked")) { audio.insert("locked", true); audio.insert("name", "Vox"); }
        const QJsonObject raw{{"clips", QJsonArray{midi, audio}},
            {"tracks", QJsonArray{QJsonObject{{"id", "keys"}}, QJsonObject{{"id", "aud"}}}}};
        if (mode == "locked-cut") {
            bool refused = false;
            try { applySectionEdit(raw, "delete_time", {{"fromMs", 4500}, {"toMs", 5000}}); }
            catch (const OpError& e) { refused = QString::fromUtf8(e.what()).contains("Vox"); }
            QVERIFY(refused);
            return;
        }
        QJsonObject payload{{"fromBar", 2}, {"toBar", 3}};
        if (mode == "restricted") { payload.insert("trackIds", QJsonArray{"aud"}); }
        if (mode == "locked-after") { payload = {{"fromMs", 0}, {"toMs", 2000}}; }
        const auto result = applySectionEdit(raw, "delete_time", payload).value("clips").toArray();
        QCOMPARE(result.last().toObject().value("startMs").toDouble(), 2000.0);
        if (mode == "all") {
            QCOMPARE(result.size(), 3);
            QCOMPARE(result[0].toObject().value("durationMs").toDouble(), 2000.0);
            QCOMPARE(result[1].toObject().value("startMs").toDouble(), 2000.0);
            QCOMPARE(result[1].toObject().value("durationMs").toDouble(), 4000.0);
        } else if (mode == "restricted") { QCOMPARE(result[0], QJsonValue(midi)); }
    }

    void insertSectionMovesMetadataAndHoldsAutomation() {
        auto audio = clip("a", "aud", 4000, 2000, "audio");
        audio.insert("locked", true);
        const QJsonArray points{QJsonObject{{"timeMs", 1000}, {"value", 0}}, QJsonObject{{"timeMs", 5000}, {"value", -6}}};
        const QJsonObject raw{{"clips", QJsonArray{audio}},
            {"markers", QJsonArray{QJsonObject{{"id", "k"}, {"timeMs", 5000}}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "aud"}, {"automation", QJsonArray{QJsonObject{{"id", "lane"}, {"points", points}}}}},
                QJsonObject{{"id", "chd"}, {"chords", QJsonArray{QJsonObject{{"id", "c"}, {"startTick", 3840}, {"durationTick", 3840}}}}}}}};
        const auto result = applySectionEdit(raw, "insert_time", {{"atMs", 2000}, {"ms", 2000}});
        QCOMPARE(result.value("markers").toArray()[0].toObject().value("timeMs").toDouble(), 7000.0);
        QCOMPARE(result.value("clips").toArray()[0].toObject().value("startMs").toDouble(), 6000.0);
        const auto tracks = result.value("tracks").toArray();
        QCOMPARE(tracks[1].toObject().value("chords").toArray()[0].toObject().value("startTick").toDouble(), 7680.0);
        const auto ramp = tracks[0].toObject().value("automation").toArray()[0].toObject().value("points").toArray();
        QCOMPARE(ramp.size(), 4);
        QCOMPARE(ramp[1].toObject().value("timeMs").toDouble(), 2000.0);
        QCOMPARE(ramp[2].toObject().value("timeMs").toDouble(), 4000.0);
        QCOMPARE(ramp[1].toObject().value("value").toDouble(), -1.5);
        QCOMPARE(ramp[2].toObject().value("value").toDouble(), -1.5);
        const auto restricted = applySectionEdit(raw, "insert_time", {{"atMs", 2000}, {"ms", 2000}, {"trackIds", QJsonArray{"aud"}}});
        QCOMPARE(restricted.value("markers"), raw.value("markers"));
        QCOMPARE(restricted.value("tracks").toArray()[1], raw.value("tracks").toArray()[1]);
    }

    void insertSongSectionMatchesTypeScriptExample() {
        auto midi = clip("m", "keys", 0, 8000, "midi");
        midi.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"startTick", 7680}, {"durationTick", 480}}});
        const QJsonObject raw{{"clips", QJsonArray{midi, clip("a", "aud", 4000, 2000, "audio")}},
            {"tracks", QJsonArray{QJsonObject{{"id", "keys"}}, QJsonObject{{"id", "aud"}}}}};
        const auto result = applySectionEdit(raw, "insert_time", {{"atBar", 3}, {"bars", 1}});
        const auto clips = result.value("clips").toArray();
        QCOMPARE(clips.size(), 3);
        QCOMPARE(clips[0].toObject().value("durationMs").toDouble(), 4000.0);
        QCOMPARE(clips[1].toObject().value("startMs").toDouble(), 6000.0);
        QCOMPARE(clips[1].toObject().value("durationMs").toDouble(), 4000.0);
        QCOMPARE(clips[1].toObject().value("notes").toArray()[0].toObject().value("startTick").toDouble(), 0.0);
        QCOMPARE(clips[2].toObject().value("startMs").toDouble(), 6000.0);
        QJsonArray many;
        for (int i = 0; i < 10000; ++i) { many.append(clip(QStringLiteral("clip-%1").arg(i), "aud", 0, 8000, "audio")); }
        const QJsonObject large{{"clips", many}, {"tracks", raw.value("tracks")}};
        QCOMPARE(applySectionEdit(large, "insert_time", {{"atMs", 4000}, {"ms", 2000}}).value("clips").toArray().size(), 20000);
    }

    void splitActionUsesDocumentTempoAndCrossing() {
        auto c = clip("m", "a1", 0, 1000, "midi");
        c.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"startTick", 600}, {"durationTick", 240}}});
        auto doc = docOf({c});
        doc.bpm = 90;
        doc.splitCrossing = "split";
        const auto result = splitClipAtTime(doc, "m", 500);
        QCOMPARE(result.size(), size_t(2));
        QCOMPARE(result[0].value("notes").toArray()[0].toObject().value("durationTick").toDouble(), 120.0);
        QCOMPARE(result[1].value("notes").toArray().size(), 1);
    }

    void midiSplitCrossingAtDocumentTempo() {
        auto c = clip("m", "a1", 0, 1000, "midi");
        c.insert("notes", QJsonArray{QJsonObject{{"id", "n"}, {"startTick", 600}, {"durationTick", 240},
            {"expression", QJsonObject{{"pitch", QJsonArray{QJsonObject{{"tick", 0}, {"value", 0}},
                QJsonObject{{"tick", 240}, {"value", 1}}}}}}}});
        const auto [left, right] = splitClip(c, 500, 90, "split");
        QCOMPARE(left.value("notes").toArray()[0].toObject().value("durationTick").toDouble(), 120.0);
        const auto tail = right.value("notes").toArray()[0].toObject();
        QCOMPARE(tail.value("startTick").toDouble(), 0.0);
        QCOMPARE(tail.value("durationTick").toDouble(), 120.0);
        QVERIFY(tail.value("id") != QJsonValue("n"));
        const auto expression = tail.value("expression").toObject().value("pitch").toArray();
        QCOMPARE(expression.first().toObject().value("tick").toDouble(), 0.0);
        QCOMPARE(expression.first().toObject().value("value").toDouble(), 0.5);
        QCOMPARE(expression.last().toObject().value("tick").toDouble(), 120.0);
    }

    void midiSplitCutsExpressionAndCarriesControllerRamp() {
        auto c = clip("m", "a1", 0, 1000, "midi");
        c.insert("notes", QJsonArray{QJsonObject{{"id", "crossing"}, {"startTick", 720}, {"durationTick", 480},
            {"expression", QJsonObject{{"pitch", QJsonArray{QJsonObject{{"tick", 0}, {"value", 0}},
                QJsonObject{{"tick", 480}, {"value", 1}}}}}}}});
        c.insert("controllers", QJsonArray{QJsonObject{{"id", "cc"}, {"kind", "cc"}, {"cc", 1},
            {"points", QJsonArray{QJsonObject{{"id", "p0"}, {"tick", 0}, {"value", 0}},
                QJsonObject{{"id", "p1"}, {"tick", 1920}, {"value", 100}}}}}});
        const auto [left, right] = splitClip(c, 500);
        const auto note = left.value("notes").toArray()[0].toObject();
        QCOMPARE(note.value("durationTick").toDouble(), 240.0);
        const auto expression = note.value("expression").toObject().value("pitch").toArray();
        QCOMPARE(expression.last().toObject().value("tick").toDouble(), 240.0);
        QCOMPARE(expression.last().toObject().value("value").toDouble(), 0.5);
        QVERIFY(right.value("notes").toArray().isEmpty());
        const auto before = left.value("controllers").toArray()[0].toObject().value("points").toArray();
        const auto after = right.value("controllers").toArray()[0].toObject().value("points").toArray();
        QCOMPARE(before.last().toObject().value("tick").toDouble(), 959.0);
        QCOMPARE(after.first().toObject().value("tick").toDouble(), 0.0);
        QCOMPARE(after.first().toObject().value("value").toDouble(), 50.0);
        QCOMPARE(after.last().toObject().value("tick").toDouble(), 959.0);
    }

    void midiSplitPartitionsVisibleNotes() {
        auto c = clip("m", "a1", 0, 1000, "midi");
        c.insert("notes", QJsonArray{
            QJsonObject{{"id", "left"}, {"startTick", 240}, {"durationTick", 480}},
            QJsonObject{{"id", "right"}, {"startTick", 960}, {"durationTick", 120}},
            QJsonObject{{"id", "hidden"}, {"startTick", 2000}, {"durationTick", 120}}});
        const auto [left, right] = splitClip(c, 500);
        QCOMPARE(left.value("notes").toArray().size(), 1);
        QCOMPARE(left.value("notes").toArray()[0].toObject().value("durationTick").toDouble(), 480.0);
        QCOMPARE(right.value("notes").toArray().size(), 1);
        QCOMPARE(right.value("notes").toArray()[0].toObject().value("startTick").toDouble(), 0.0);
        QCOMPARE(right.value("inPointMs").toDouble(), 0.0);
        c.insert("inPointMs", 250);
        c.insert("notes", QJsonArray{
            QJsonObject{{"id", "hidden-before"}, {"startTick", 240}, {"durationTick", 120}},
            QJsonObject{{"id", "visible-left"}, {"startTick", 720}, {"durationTick", 480}},
            QJsonObject{{"id", "visible-right"}, {"startTick", 1440}, {"durationTick", 240}},
            QJsonObject{{"id", "hidden-after"}, {"startTick", 2400}, {"durationTick", 120}}});
        const auto slipped = splitClip(c, 500);
        QCOMPARE(slipped.first.value("notes").toArray().size(), 1);
        QCOMPARE(slipped.second.value("notes").toArray().size(), 1);
        QCOMPARE(slipped.second.value("notes").toArray()[0].toObject().value("startTick").toDouble(), 0.0);
    }

    void moveClipRefusesALockedDestination_data() {
        QTest::addColumn<bool>("group");
        QTest::newRow("ordinary") << false;
        QTest::newRow("group") << true;
    }
    void moveClipRefusesALockedDestination() {
        QFETCH(bool, group);
        const QJsonObject target = clip("c", "v1", 500, 1000, group ? "group" : "video");
        QJsonObject raw{{"tracks", QJsonArray{QJsonObject{{"id", "v1"}, {"type", "video"}},
                                             QJsonObject{{"id", "v2"}, {"type", "video"}, {"locked", true}}}},
                        {"clips", QJsonArray{target}}};
        const auto result = nt::edit::groups::applyGroupEdit("moveClip", raw,
            {{"clipId", "c"}, {"deltaMs", 100}, {"toTrackId", "v2"}});
        QCOMPARE(result, raw);
    }

    void startRateStretchStopsEveryLinkedMemberAtTheOrigin_data() {
        QTest::addColumn<bool>("linked");
        QTest::newRow("single") << false;
        QTest::newRow("linked") << true;
    }

    void startRateStretchStopsEveryLinkedMemberAtTheOrigin() {
        QFETCH(bool, linked);
        QJsonObject video = clip("v", "v1", 1000, 1000);
        video.insert("linkId", "L");
        QJsonObject audio = clip("a", "a1", 500, 1000, "audio");
        audio.insert("linkId", "L");
        const ClipList result = rateStretchClip(docOf(linked ? ClipList{video, audio} : ClipList{video}),
                                               "v", "start", 3000, true);
        QCOMPARE(result.size(), linked ? size_t(2) : size_t(1));
        const double expectedDuration = linked ? 1500.0 : 2000.0;
        for (const auto& member : result) {
            QCOMPARE(clipDurationMs(member), expectedDuration);
            QCOMPARE(member.value("speedMultiplier").toDouble(), 1000.0 / expectedDuration);
        }
        QCOMPARE(clipStartMs(result[0]), linked ? 500.0 : 0.0);
        QCOMPARE(clipEndMs(result[0]), 2000.0);
        if (linked) {
            QCOMPARE(clipStartMs(result[1]), 0.0);
            QCOMPARE(clipEndMs(result[1]), 1500.0);
        }
    }

    // F3: a linked unit splits whole or not at all.
    void aLinkedUnitSplitsWholeOrNotAtAll() {
        QJsonObject video = clip("v", "v1", 0, 2000);
        video.insert("linkId", "L");
        QJsonObject audio = clip("a", "a1", 0, 2000, "audio");
        audio.insert("linkId", "L");
        // The web and native split both refuse a time-remapped member. A remap
        // with one source time is a hold, which splits, so this one has to move.
        audio.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", 0}},
                                                                       QJsonObject{{"t", 1}, {"sourceMs", 2000}}}}});
        const EditDoc doc = docOf({video, audio});
        QCOMPARE(splitClipAtTime(doc, "v", 1000), doc.clips);
        QCOMPARE(splitSelectedAtPlayhead(doc, 1000, {"v"}).clips, doc.clips);
        QCOMPARE(splitSelectedAtPlayhead(doc, 1000, {}).clips, doc.clips);
        // Without the time remap both halves of the unit split, with fresh links.
        audio.remove("timeRemap");
        const ClipList split = splitClipAtTime(docOf({video, audio}), "v", 1000);
        QCOMPARE(split.size(), size_t(4));
    }

    void aLinkedUnitSplitsSourceAnchoredAudioCurves() {
        QJsonObject video = clip("v", "v1", 0, 2000);
        video.insert("linkId", "L");
        QJsonObject audio = clip("a", "a1", 0, 2000, "audio");
        audio.insert("linkId", "L");
        audio.insert("inPointMs", 500);
        audio.insert("outPointMs", 2500);
        audio.insert("animations", sourceAnchoredAnimation());
        const ClipList split = splitClipAtTime(docOf({video, audio}), "v", 1000);
        QCOMPARE(split.size(), size_t(4));

        for (const QString& track : {QStringLiteral("v1"), QStringLiteral("a1")}) {
            for (const double startMs : {0.0, 1000.0}) {
                const QJsonObject* half = nullptr;
                for (const auto& c : split) {
                    if (clipTrackId(c) == track && clipStartMs(c) == startMs) {
                        half = &c;
                    }
                }
                QVERIFY(half);
                QCOMPARE(clipDurationMs(*half), 1000.0);
                if (track == u"v1") {
                    continue;
                }

                const double fromMs = 500 + startMs;
                const double toMs = 1500 + startMs;
                QCOMPARE(half->value(u"inPointMs").toDouble(), fromMs);
                QCOMPARE(half->value(u"outPointMs").toDouble(), toMs);
                const QJsonArray animations = half->value(u"animations").toArray();
                QCOMPARE(animations.size(), 1);
                const QJsonObject animation = animations.first().toObject();
                QCOMPARE(animation.value(u"custom").toObject().value(u"timeBase").toString(), QStringLiteral("source"));
                const QJsonArray curves = animation.value(u"custom").toObject().value(u"curves").toArray();
                QCOMPARE(curves.size(), 1);
                const QJsonObject curve = curves.first().toObject();
                QCOMPARE(curve.value(u"property").toString(), QStringLiteral("opacity"));
                const QJsonArray keyframes = curve.value(u"keyframes").toArray();
                // sourceCurves.ts interpolates linearly and normalizes t to each source window.
                const QJsonArray expected{QJsonObject{{"t", 0}, {"value", fromMs / 4000}, {"sourceMs", fromMs}},
                                          QJsonObject{{"t", 1}, {"value", toMs / 4000}, {"sourceMs", toMs}}};
                QCOMPARE(keyframes, expected);
                QCOMPARE(keyframes.first().toObject().value(u"sourceMs"), half->value(u"inPointMs"));
                QCOMPARE(keyframes.last().toObject().value(u"sourceMs"), half->value(u"outPointMs"));
            }
        }
    }

    // F4: a drop never splits or removes a clip that owns a media track (its
    // `mediaTracks[].clipId` would dangle); the drop stays an overlap.
    void dropsKeepMediaTrackOwners() {
        const QJsonObject owner = clip("owner", "v1", 0, 4000);
        const QJsonObject mover = clip("mover", "v1", 1000, 1000);
        EditDoc doc = docOf({owner, mover});
        doc.clipsWithMediaTracks = {"owner"};
        QCOMPARE(resolveDropAction(doc, {"mover"}, "overwrite"), doc.clips);
        QCOMPARE(resolveDropAction(doc, {"mover"}, "insert"), doc.clips);
        // A drop that covers an owner whole would delete it: refused too.
        EditDoc cover = docOf({clip("owner", "v1", 1000, 500), clip("mover", "v1", 900, 1000)});
        cover.clipsWithMediaTracks = {"owner"};
        QCOMPARE(resolveDropAction(cover, {"mover"}, "overwrite"), cover.clips);
        // Without ownership the same drop cuts the clip as the web does.
        doc.clipsWithMediaTracks.clear();
        QCOMPARE(resolveDropAction(doc, {"mover"}, "overwrite").size(), size_t(3));
    }

    // F5: a ripple moves a group and its children together.
    void rippleMovesAGroupTreeTogether() {
        QJsonObject group = clip("g", "v2", 1000, 2000, "group");
        QJsonObject child = clip("child", "v1", 1000, 500);
        child.insert("parentId", "g");
        const QJsonObject before = clip("x", "v1", 0, 1000);
        const EditDoc doc = docOf({before, group, child});
        const ClipList out = rippleTrimClipEnd(doc, "x", 100, std::nullopt, true);
        QCOMPARE(clipStartMs(*find(out, "child")), 1100.0);
        QCOMPARE(clipStartMs(*find(out, "g")), 1100.0);
        const ClipList deleted = rippleDeleteSelected(doc, {"x"});
        QCOMPARE(clipStartMs(*find(deleted, "child")), clipStartMs(*find(deleted, "g")));
        // A group itself is not an edit target natively: refused, unchanged.
        QCOMPARE(moveClip(doc, "g", 500, {}, true), doc.clips);
        QCOMPARE(trimClipEnd(doc, "g", 500, std::nullopt, true), doc.clips);
        QCOMPARE(deleteSelected(doc, {"g"}), doc.clips);
    }
};

QTEST_APPLESS_MAIN(TestEditActions)
#include "tst_editactions.moc"
