// The transcript derived from a document, the caption edits, and the range edit a selection drives.
// Cases marked FilmCraft are ported from crates/edit/src/transcript.rs (MIT OR Apache-2.0).
#include "app/EditRegistry.h"
#include "edit/targeting/TrackTargeting.h"
#include "transcript/TranscriptDocument.h"
#include <QElapsedTimer>
#include <QJsonDocument>
#include <QtTest>

using namespace nt::transcript;

namespace {
QJsonObject word(const QString& text, double start, double end, const QJsonObject& extra = {}) {
    QJsonObject w{{"word", text}, {"startMs", start}, {"endMs", end}};
    for (auto it = extra.begin(); it != extra.end(); ++it) { w.insert(it.key(), it.value()); }
    return w;
}
QJsonObject clip(const QString& id, const QString& track, double start, double duration, const QJsonArray& words = {},
                 const QJsonObject& extra = {}) {
    QJsonObject c{{"id", id}, {"trackId", track}, {"name", id}, {"mediaType", "audio"}, {"startMs", start},
                  {"durationMs", duration}, {"inPointMs", 0}, {"outPointMs", duration}, {"locked", false}};
    if (!words.isEmpty()) { c.insert("caption", QJsonObject{{"words", words}}); }
    for (auto it = extra.begin(); it != extra.end(); ++it) { c.insert(it.key(), it.value()); }
    return c;
}
QJsonObject track(const QString& id, const QString& type, int index, bool locked = false) {
    return {{"id", id}, {"name", id}, {"type", type}, {"index", index}, {"visible", true}, {"locked", locked}};
}
QJsonObject document(const QJsonArray& clips, const QJsonArray& tracks = {}) {
    return {{"id", "sequence"}, {"fps", 30}, {"width", 640}, {"height", 360}, {"durationMs", 60000},
            {"tracks", tracks.isEmpty() ? QJsonArray{track("v", "video", 0), track("a", "audio", 1), track("b", "audio", 2)} : tracks},
            {"clips", clips}};
}
QStringList texts(const std::vector<Word>& words) {
    QStringList out;
    for (const auto& w : words) { out << w.text; }
    return out;
}
QJsonArray wordsOf(const QJsonObject& doc, const QString& id) {
    for (const auto& value : doc.value("clips").toArray()) {
        if (value.toObject().value("id") == id) { return value.toObject().value("caption").toObject().value("words").toArray(); }
    }
    return {};
}
QJsonObject clipOf(const QJsonObject& doc, const QString& id) {
    for (const auto& value : doc.value("clips").toArray()) {
        if (value.toObject().value("id") == id) { return value.toObject(); }
    }
    return {};
}
QJsonArray hello() {
    return {word("Hello", 100, 400), word("big,", 400, 700), word("wide", 800, 1100), word("WORLD.", 1100, 1500)};
}
}

class TestTranscript : public QObject {
    Q_OBJECT
private slots:
    void wordsAreInSequenceTimeAndOrder() {
        const auto words = sequenceWords(document({clip("late", "a", 5000, 1000, {word("later", 100, 300)}),
                                                   clip("early", "a", 1000, 2000, hello(), {{"speaker", "Ana"}})}));
        QCOMPARE(texts(words), QStringList({"Hello", "big,", "wide", "WORLD.", "later"}));
        QCOMPARE(words[0].startMs, 1100.0);
        QCOMPARE(words[0].endMs, 1400.0);
        QCOMPARE(words[0].clipId, QString("early"));
        QCOMPARE(words[3].wordIndex, 3);
        QCOMPARE(words[0].speaker, QString("Ana"));
        QCOMPARE(words[4].startMs, 5100.0);
    }
    // FilmCraft: a word belongs to the clip that holds its midpoint, clamped to the clip.
    void wordCutByATrimIsShownCut() {
        const auto words = sequenceWords(document({clip("c", "a", 1000, 700, {word("gone", -500, -100), word("cut", -100, 300),
            word("kept", 300, 600), word("edge", 600, 750), word("past", 700, 1200)})}));
        QCOMPARE(texts(words), QStringList({"cut", "kept", "edge"}));
        QCOMPARE(words[0].startMs, 1000.0);
        QCOMPARE(words[2].endMs, 1700.0);
    }
    void silentAndUntimedClipsGiveNoWords() {
        const QJsonArray w{word("a", 0, 100)};
        const auto doc = document({clip("off", "a", 0, 500, w, {{"enabled", false}}),
                                   clip("back", "a", 1000, 500, w, {{"reverse", true}}),
                                   clip("remap", "a", 2000, 500, w, {{"timeRemap", QJsonObject{{"keys", QJsonArray{}}}}}),
                                   clip("on", "a", 3000, 500, w)});
        const auto words = sequenceWords(doc);
        QCOMPARE(words.size(), size_t(1));
        QCOMPARE(words[0].clipId, QString("on"));
        QCOMPARE(hiddenWordCount(doc), 3);
    }
    void pauseTokensAndEmptyWordsAreNotRead() {
        const auto words = sequenceWords(document({clip("c", "a", 0, 2000, {word("one", 0, 100), word("", 100, 900, {{"kind", "pause"}}),
                                                                           word("  ", 900, 950), word("two", 1000, 1100)})}));
        QCOMPARE(texts(words), QStringList({"one", "two"}));
        QCOMPARE(words[1].wordIndex, 3);
    }
    // FilmCraft reads a duplicate once. Different words that overlap are both kept, so two people
    // talking over each other both stay in the text.
    void duplicateDialogueReadsOnce() {
        const auto doc = document({clip("video", "v", 0, 2000, hello(), {{"mediaType", "video"}}),
                                   clip("low", "b", 0, 2000, hello()),
                                   clip("top", "a", 0, 2000, hello()),
                                   clip("other", "b", 3000, 1000, {word("Hello", 100, 400)}),
                                   clip("talk", "b", 5000, 1000, {word("yes", 0, 500)}),
                                   clip("over", "a", 5000, 1000, {word("no", 0, 500)})});
        const auto words = sequenceWords(doc);
        QCOMPARE(texts(words), QStringList({"Hello", "big,", "wide", "WORLD.", "Hello", "no", "yes"}));
        QCOMPARE(words[0].clipId, QString("top"));
    }
    // FilmCraft: paragraphs split at a speaker change and a pause.
    void paragraphsSplitAtSpeakerPauseAndClipParagraph() {
        const auto doc = document({clip("a1", "a", 0, 1000, {word("one", 0, 400), word("two", 400, 800)}, {{"speaker", "Ana"}, {"paragraphId", "p"}}),
                                   clip("a2", "a", 1000, 1000, {word("three", 0, 400)}, {{"speaker", "Ana"}, {"paragraphId", "p"}}),
                                   clip("b", "a", 2000, 1000, {word("four", 0, 400)}, {{"speaker", "Ben"}, {"paragraphId", "q"}}),
                                   clip("c", "a", 3000, 8000, {word("five", 0, 400), word("six", 3000, 3400)}, {{"speaker", "Ben"}, {"paragraphId", "q"}}),
                                   clip("d", "a", 11000, 1000, {word("seven", 0, 400)}, {{"speaker", "Ben"}, {"paragraphId", "r"}})});
        const auto list = paragraphs(sequenceWords(doc));
        QCOMPARE(list.size(), size_t(4));
        QCOMPARE((WordRange{list[0].first, list[0].count}), (WordRange{0, 3}));
        QCOMPARE(list[0].speaker, QString("Ana"));
        QCOMPARE(list[0].startMs, 0.0);
        QCOMPARE((WordRange{list[1].first, list[1].count}), (WordRange{3, 2}));
        QCOMPARE(list[1].speaker, QString("Ben"));
        QCOMPARE(list[2].first, 5);
        QCOMPARE(list[3].first, 6);
        QCOMPARE(paragraphOfWord(list, 4), 1);
        QCOMPARE(paragraphOfWord(list, 6), 3);
        QCOMPARE(paragraphOfWord(list, 7), -1);
    }
    void longRunsEndAtASentenceOrTheHardLimit() {
        QJsonArray words;
        for (int i = 0; i < 300; ++i) { words.append(word(i == 49 ? "stop." : "word", i * 100, i * 100 + 100)); }
        const auto list = paragraphs(sequenceWords(document({clip("c", "a", 0, 40000, words)})));
        QCOMPARE(list[0].count, 50);
        QCOMPARE(list[1].count, 120);
        QCOMPARE(list[2].count, 120);
        QCOMPARE(list[3].count, 10);
    }
    // FilmCraft: word_at finds the word being spoken, and nothing in a pause.
    void wordAtFollowsTheTime() {
        const auto words = sequenceWords(document({clip("c", "a", 1000, 2000, hello())}));
        QCOMPARE(wordAt(words, 1000), -1);
        QCOMPARE(wordAt(words, 1100), 0);
        QCOMPARE(wordAt(words, 1399), 0);
        QCOMPARE(wordAt(words, 1400), 1);
        QCOMPARE(wordAt(words, 1750), -1);
        QCOMPARE(wordAt(words, 2499), 3);
        QCOMPARE(wordAt(words, 2500), -1);
        QCOMPARE(wordAt({}, 0), -1);
    }
    // FilmCraft: case and punctuation are ignored, and the last word may be a prefix.
    void searchFindsPhrases() {
        const auto words = sequenceWords(document({clip("c", "a", 0, 2000, {word("Hello,", 0, 100), word("big", 100, 200), word("world!", 200, 300),
            word("hello", 300, 400), word("BIGGER", 400, 500), word("(big)", 500, 600)})}));
        QCOMPARE(search(words, "hello"), (std::vector<WordRange>{{0, 1}, {3, 1}}));
        QCOMPARE(search(words, "  BIG "), (std::vector<WordRange>{{1, 1}, {4, 1}, {5, 1}}));
        QCOMPARE(search(words, "hello, big"), (std::vector<WordRange>{{0, 2}, {3, 2}}));
        QCOMPARE(search(words, "big world"), (std::vector<WordRange>{{1, 2}}));
        QCOMPARE(search(words, "bigg hello"), std::vector<WordRange>{});
        QCOMPARE(search(words, "  ...  "), std::vector<WordRange>{});
        QCOMPARE(search({}, "hello"), std::vector<WordRange>{});
        QCOMPARE(normalizedWord(" (Wörld!) "), QString("wörld"));
    }
    // FilmCraft: word_range snaps outward, whichever way the selection was made.
    void selectionMapsToTheFrameRange() {
        const auto words = sequenceWords(document({clip("c", "a", 1000, 2000, {word("one", 10, 110), word("two", 200, 300), word("three", 400, 500)})}));
        const auto span = wordSpan(words, 0, 1, 30);
        QVERIFY(span);
        QCOMPARE(span->startMs, 1000.0);
        QVERIFY(qAbs(span->endMs - 1300.0) < 1e-6);
        const auto reversed = wordSpan(words, 2, 1, 30);
        QVERIFY(reversed);
        QVERIFY(qAbs(reversed->startMs - 1200.0) < 1e-6);
        QVERIFY(qAbs(reversed->endMs - 1500.0) < 1e-6);
        QVERIFY(!wordSpan(words, 0, 3, 30));
        QVERIFY(!wordSpan(words, -1, 0, 30));
        // A span on exact frames stays where it is, and a zero-length word still marks one frame.
        const auto exact = sequenceWords(document({clip("c", "a", 0, 2000, {word("x", 1000, 1000)})}));
        const auto one = wordSpan(exact, 0, 0, 25);
        QCOMPARE(one->startMs, 1000.0);
        QCOMPARE(one->endMs, 1040.0);
    }
    // Extract and lift are the existing range edit, driven by the span of the selected words.
    void extractRemovesTheSpanAndClosesTheGapOnSyncLockedTracks() {
        auto& targets = nt::targeting::TrackTargeting::current();
        targets.setTrackTargeted("b", false);  // sync-locked and not targeted: it moves, it is not cut
        const auto restore = qScopeGuard([&] { targets.setTrackTargeted("b", true); });
        const auto doc = document({clip("voice", "a", 0, 3000, {word("one", 0, 500), word("two", 500, 1000), word("three", 1000, 1500)}),
                                   clip("after", "v", 4000, 1000),
                                   clip("music", "b", 4000, 1000)});
        const auto words = sequenceWords(doc);
        const auto span = wordSpan(words, 1, 1, 30);
        QVERIFY(span);
        const auto edit = nt::app::findEdit("removeRange");
        QVERIFY(edit);
        const auto extracted = edit(doc, {{"startMs", span->startMs}, {"endMs", span->endMs}, {"ripple", true}});
        const auto result = sequenceWords(extracted);
        QCOMPARE(texts(result), QStringList({"one", "three"}));
        QCOMPARE(result[1].startMs, 500.0);
        QCOMPARE(clipOf(extracted, "after").value("startMs").toDouble(), 3500.0);
        QCOMPARE(clipOf(extracted, "music").value("startMs").toDouble(), 3500.0);
        double contentEnd = 0;
        for (const auto& c : extracted.value("clips").toArray()) {
            const auto o = c.toObject();
            contentEnd = std::max(contentEnd, o.value("startMs").toDouble() + o.value("durationMs").toDouble());
        }
        QCOMPARE(contentEnd, 4500.0);

        const auto lifted = edit(doc, {{"startMs", span->startMs}, {"endMs", span->endMs}, {"ripple", false}});
        const auto holes = sequenceWords(lifted);
        QCOMPARE(texts(holes), QStringList({"one", "three"}));
        QCOMPARE(holes[1].startMs, 1000.0);
        QCOMPARE(clipOf(lifted, "after").value("startMs").toDouble(), 4000.0);

        targets.setTrackSyncLocked("b", false);
        const auto restoreSync = qScopeGuard([&] { targets.setTrackSyncLocked("b", true); });
        const auto unlocked = edit(doc, {{"startMs", span->startMs}, {"endMs", span->endMs}, {"ripple", true}});
        QCOMPARE(clipOf(unlocked, "music").value("startMs").toDouble(), 4000.0);
    }
    void cuesFollowTheRendererRules() {
        // A pause of 700 ms ends a cue, and so does the tenth word.
        QJsonArray words;
        for (int i = 0; i < 12; ++i) { words.append(word(QString::number(i), i * 100, i * 100 + 100)); }
        words.append(word("far", 1900, 2000));
        words.append(word("hidden", 9000, 9100));
        const auto cues = captionCues(words, 5000);
        QCOMPARE(cues, (std::vector<std::vector<int>>{{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}, {10, 11}, {12}}));
        // The marks override both rules.
        auto marked = words;
        auto start = marked[3].toObject(); start.insert("cue", "start"); marked[3] = start;
        auto keep = marked[12].toObject(); keep.insert("cue", "continue"); marked[12] = keep;
        QCOMPARE(captionCues(marked, 5000), (std::vector<std::vector<int>>{{0, 1, 2}, {3, 4, 5, 6, 7, 8, 9, 10, 11, 12}}));
    }
    void cueRowsAreInSequenceTime() {
        const auto doc = document({clip("c", "a", 1000, 3000, {word("one", 100, 200), word("two", 200, 300), word("three", 1300, 1400)}),
                                   clip("d", "b", 5000, 500, {word("four", 0, 100)})}, {track("a", "audio", 0), track("b", "audio", 1, true)});
        const auto cues = sequenceCues(doc);
        QCOMPARE(cues.size(), size_t(3));
        QCOMPARE(cues[0].text, QString("one two"));
        QCOMPARE(cues[0].startMs, 1100.0);
        QCOMPARE(cues[0].endMs, 1300.0);
        QCOMPARE(cues[0].firstWord, 0);
        QCOMPARE(cues[0].wordCount, 2);
        QVERIFY(cues[0].canSplit);
        QVERIFY(cues[0].canMerge);
        QVERIFY(!cues[1].canSplit);
        QVERIFY(!cues[1].canMerge);  // the next cue is in another clip
        QVERIFY(!cues[1].locked);
        QVERIFY(cues[2].locked);
    }
    void setTextKeepsTimingWhenTheWordCountHolds() {
        const auto doc = document({clip("c", "a", 0, 3000, {word("teh", 100, 300, {{"confidence", 0.4}}), word("cat", 300, 500)})});
        const auto fixed = setCueText(doc, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 2}, {"text", "the  cat"}});
        const auto words = wordsOf(fixed, "c");
        QCOMPARE(words[0].toObject().value("word").toString(), QString("the"));
        QCOMPARE(words[0].toObject().value("startMs").toDouble(), 100.0);
        QCOMPARE(words[0].toObject().value("confidence").toDouble(), 0.4);
    }
    void setTextShareTimeByLengthWhenTheCountChanges() {
        const auto doc = document({clip("c", "a", 0, 3000, {word("a", 100, 300), word("b", 300, 500), word("next", 2000, 2100)})});
        const auto changed = setCueText(doc, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 2}, {"text", "one three x"}});
        const auto words = wordsOf(changed, "c");
        QCOMPARE(words.size(), 4);
        QCOMPARE(words[0].toObject().value("startMs").toDouble(), 100.0);
        QVERIFY(words[1].toObject().value("startMs").toDouble() > 100.0);
        QCOMPARE(words[2].toObject().value("endMs").toDouble(), 500.0);
        QCOMPARE(words[3].toObject().value("word").toString(), QString("next"));
        // Twelve words in one cue stay one cue, past the ten-word rule.
        const auto many = setCueText(doc, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 2}, {"text", "a b c d e f g h i j k l"}});
        const auto cues = captionCues(wordsOf(many, "c"), 3000);
        QCOMPARE(cues.size(), size_t(2));
        QCOMPARE(cues[0].size(), size_t(12));
    }
    void setTextRefusesAnEmptyTextAndAStaleCue() {
        const auto doc = document({clip("c", "a", 0, 3000, hello())});
        QCOMPARE(setCueText(doc, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 4}, {"text", "  "}}), doc);
        QCOMPARE(setCueText(doc, {{"clipId", "c"}, {"firstWord", 1}, {"wordCount", 3}, {"text", "new"}}), doc);
        QCOMPARE(setCueText(doc, {{"clipId", "missing"}, {"firstWord", 0}, {"wordCount", 4}, {"text", "new"}}), doc);
        QCOMPARE(setCueText(doc, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 4}, {"text", "Hello big, wide WORLD."}}), doc);
    }
    void setTimesScalesTheCueInsideItsNeighbours() {
        const auto doc = document({clip("c", "a", 1000, 8000, {word("before", 0, 100), word("a", 1000, 1200), word("b", 1200, 1400), word("after", 3000, 3100)})});
        const auto moved = setCueTimes(doc, {{"clipId", "c"}, {"firstWord", 1}, {"wordCount", 2}, {"startMs", 2500}, {"endMs", 3300}});
        auto words = wordsOf(moved, "c");
        QCOMPARE(words[1].toObject().value("startMs").toDouble(), 1500.0);
        QCOMPARE(words[1].toObject().value("endMs").toDouble(), 1900.0);
        QCOMPARE(words[2].toObject().value("endMs").toDouble(), 2300.0);
        // Clamped to the neighbours, which keeps the row order.
        const auto clamped = setCueTimes(doc, {{"clipId", "c"}, {"firstWord", 1}, {"wordCount", 2}, {"startMs", 0}, {"endMs", 9000}});
        words = wordsOf(clamped, "c");
        QCOMPARE(words[1].toObject().value("startMs").toDouble(), 100.0);
        QCOMPARE(words[2].toObject().value("endMs").toDouble(), 3000.0);
        // The neighbours are still separate cues although the gap closed.
        QCOMPARE(captionCues(words, 8000).size(), size_t(3));
        // An end before the start is refused.
        QCOMPARE(setCueTimes(doc, {{"clipId", "c"}, {"firstWord", 1}, {"wordCount", 2}, {"startMs", 3000}, {"endMs", 2500}}), doc);
    }
    void splitAndMergeRoundTrip() {
        const auto doc = document({clip("c", "a", 0, 9000, {word("a", 0, 100), word("b", 100, 200), word("c", 200, 300), word("d", 2000, 2100)})});
        const auto split = splitCue(doc, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 3}, {"atWord", 1}});
        auto cues = captionCues(wordsOf(split, "c"), 9000);
        QCOMPARE(cues, (std::vector<std::vector<int>>{{0}, {1, 2}, {3}}));
        QCOMPARE(wordsOf(split, "c")[1].toObject().value("cue").toString(), QString("start"));
        // Merging across the 1700 ms pause keeps one cue.
        const auto merged = mergeCue(split, {{"clipId", "c"}, {"firstWord", 1}, {"wordCount", 2}});
        cues = captionCues(wordsOf(merged, "c"), 9000);
        QCOMPARE(cues, (std::vector<std::vector<int>>{{0}, {1, 2, 3}}));
        QCOMPARE(wordsOf(merged, "c")[3].toObject().value("cue").toString(), QString("continue"));
        // Undoing the split by a merge removes the marks it needed.
        const auto rejoined = mergeCue(split, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 1}});
        QCOMPARE(rejoined, doc);
        QCOMPARE(splitCue(doc, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 3}, {"atWord", 0}}), doc);
        QCOMPARE(mergeCue(doc, {{"clipId", "c"}, {"firstWord", 3}, {"wordCount", 1}}), doc);
    }
    void deleteRemovesOnlyTheWords() {
        const auto doc = document({clip("c", "a", 0, 9000, {word("a", 0, 100), word("b", 2000, 2100)})});
        const auto gone = deleteCue(doc, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 1}});
        QCOMPARE(wordsOf(gone, "c").size(), 1);
        QCOMPARE(clipOf(gone, "c").value("durationMs").toDouble(), 9000.0);
        const auto empty = deleteCue(gone, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 1}});
        QVERIFY(clipOf(empty, "c").value("caption").isObject());
        QCOMPARE(wordsOf(empty, "c").size(), 0);
    }
    void addGoesIntoAGapOfTheClipAtTheTime() {
        const auto doc = document({clip("c", "a", 1000, 5000, {word("a", 0, 100), word("b", 200, 300), word("next", 3000, 3100)}),
                                   clip("plain", "b", 7000, 1000),
                                   clip("video", "v", 7000, 1000, {}, {{"mediaType", "video"}})});
        // Between two words of a cue: the cue parts and the new text is its own cue.
        const auto inside = addCue(doc, {{"atMs", 1150}, {"text", "x"}, {"durationMs", 500}});
        auto cues = captionCues(wordsOf(inside, "c"), 5000);
        QCOMPARE(cues, (std::vector<std::vector<int>>{{0}, {1}, {2}, {3}}));
        auto words = wordsOf(inside, "c");
        QCOMPARE(words[1].toObject().value("startMs").toDouble(), 150.0);
        QCOMPARE(words[1].toObject().value("endMs").toDouble(), 200.0);  // up to the next word
        // After the words of the clip.
        const auto later = addCue(doc, {{"atMs", 2000}, {"text", "two words"}});
        cues = captionCues(wordsOf(later, "c"), 5000);
        QCOMPARE(cues.size(), size_t(3));
        words = wordsOf(later, "c");
        QCOMPARE(words[2].toObject().value("word").toString(), QString("two"));
        QCOMPARE(words[2].toObject().value("startMs").toDouble(), 1000.0);
        QCOMPARE(words[3].toObject().value("endMs").toDouble(), 3000.0);
        // A clip with no caption gets one, audio first.
        const auto plain = addCue(doc, {{"atMs", 7500}, {"text", "new"}});
        QCOMPARE(wordsOf(plain, "plain").size(), 1);
        QCOMPARE(wordsOf(plain, "plain")[0].toObject().value("endMs").toDouble(), 1000.0);
        QVERIFY(!clipOf(plain, "video").contains("caption"));
        // Inside a word, or with no clip at the time, or no text: refused.
        QCOMPARE(addCue(doc, {{"atMs", 1050}, {"text", "x"}}), doc);
        QCOMPARE(addCue(doc, {{"atMs", 40000}, {"text", "x"}}), doc);
        QCOMPARE(addCue(doc, {{"atMs", 2000}, {"text", " "}}), doc);
    }
    void lockedClipsRefuseEveryCaptionEdit() {
        const QJsonArray w{word("a", 0, 100), word("b", 100, 200), word("c", 2000, 2100)};
        const auto doc = document({clip("c", "a", 0, 9000, w, {{"locked", true}})});
        const QJsonObject cue{{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 2}};
        auto with = [&cue](const QJsonObject& extra) { auto p = cue; for (auto it = extra.begin(); it != extra.end(); ++it) { p.insert(it.key(), it.value()); } return p; };
        QCOMPARE(setCueText(doc, with({{"text", "x"}})), doc);
        QCOMPARE(setCueTimes(doc, with({{"startMs", 10}, {"endMs", 300}})), doc);
        QCOMPARE(splitCue(doc, with({{"atWord", 1}})), doc);
        QCOMPARE(mergeCue(doc, cue), doc);
        QCOMPARE(deleteCue(doc, cue), doc);
        QCOMPARE(addCue(doc, {{"atMs", 1000}, {"text", "x"}}), doc);
    }
    void editsKeepWordsTheClipWindowHides() {
        const auto doc = document({clip("c", "a", 0, 1000, {word("head", -300, -100), word("a", 100, 200), word("tail", 2000, 2100)})});
        const auto edited = setCueText(doc, {{"clipId", "c"}, {"firstWord", 1}, {"wordCount", 1}, {"text", "b"}});
        const auto words = wordsOf(edited, "c");
        QCOMPARE(words.size(), 3);
        QCOMPARE(words[0].toObject().value("word").toString(), QString("head"));
        QCOMPARE(words[2].toObject().value("word").toString(), QString("tail"));
    }
    // A document's own fields stay as they are read.
    void editsKeepOtherFields() {
        auto doc = document({clip("c", "a", 0, 1000, hello(), {{"unknownField", "keep"}})});
        auto clipObject = clipOf(doc, "c");
        auto caption = clipObject.value("caption").toObject();
        caption.insert("style", QJsonObject{{"color", "#fff"}});
        clipObject.insert("caption", caption);
        doc.insert("clips", QJsonArray{clipObject});
        const auto edited = splitCue(doc, {{"clipId", "c"}, {"firstWord", 0}, {"wordCount", 4}, {"atWord", 2}});
        QCOMPARE(clipOf(edited, "c").value("unknownField").toString(), QString("keep"));
        QCOMPARE(clipOf(edited, "c").value("caption").toObject().value("style").toObject().value("color").toString(), QString("#fff"));
    }
    // Twenty thousand words, all of them duplicated on a second track: the projection and every
    // lookup stay cheap, which a quadratic duplicate check would not.
    void largeTranscriptsStayFast() {
        const auto build = [](int count) {
            QJsonArray clips;
            for (int c = 0; c < count / 100; ++c) {
                QJsonArray words;
                for (int i = 0; i < 100; ++i) { words.append(word("word" + QString::number(i), i * 100, i * 100 + 100)); }
                clips.append(clip("c" + QString::number(c), "a", c * 10000.0, 10000, words));
                clips.append(clip("d" + QString::number(c), "b", c * 10000.0, 10000, words));
            }
            return document(clips);
        };
        const auto doc = build(20000);
        QElapsedTimer timer;
        timer.start();
        const auto words = sequenceWords(doc);
        const auto projected = timer.elapsed();
        QCOMPARE(words.size(), size_t(20000));
        const auto list = paragraphs(words);
        QVERIFY(list.size() >= 20000 / 120);
        timer.restart();
        int found = 0;
        for (int i = 0; i < 100000; ++i) { found += wordAt(words, i * 2.0) >= 0; }
        QVERIFY2(timer.elapsed() < 200, qPrintable(QString::number(timer.elapsed())));
        QVERIFY(found > 0);
        timer.restart();
        QCOMPARE(search(words, "word7").size(), size_t(11 * 200));
        QVERIFY2(timer.elapsed() < 200, qPrintable(QString::number(timer.elapsed())));
        QVERIFY2(projected < 400, qPrintable(QString::number(projected)));
    }
};

QTEST_GUILESS_MAIN(TestTranscript)
#include "tst_transcript.moc"
