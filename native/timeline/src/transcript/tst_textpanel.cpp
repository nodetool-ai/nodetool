// The Text panel through the production editor: real clicks and keys on mounted QML, the range edits
// a selection drives, one undo entry per action, and no model or delegate work during playback.
#include "render2d/Rasterizer.h"
#include "transcript/TranscriptSession.h"
#include "transcript/TranscriptWords.h"
#include "wiring/WiringFixture.h"
#include "platform/SanitizerBuild.h"
#include <QElapsedTimer>
#include <QSignalSpy>
#include <QUndoStack>

using nt::targeting::TrackTargeting;

class TestTextPanel : public WiringFixture {
    Q_OBJECT
    static QJsonObject word(const QString& text, double start, double end) {
        return {{"word", text}, {"startMs", start}, {"endMs", end}};
    }
    // Ana: "one two three four" at 1000, then Ben after a pause. A later clip and music follow.
    static QJsonObject document() {
        const QJsonArray ana{word("one", 0, 500), word("two", 500, 1000), word("three", 1000, 1500), word("four", 1500, 2000)};
        const QJsonArray ben{word("Find", 0, 400), word("the", 400, 800), word("word,", 800, 1200), word("find", 3000, 3400), word("it.", 3400, 3800)};
        return {{"id", "seq"}, {"name", "Text"}, {"fps", 30}, {"width", 640}, {"height", 360}, {"durationMs", 20000},
            {"tracks", QJsonArray{
                QJsonObject{{"id", "v"}, {"name", "Video"}, {"type", "video"}, {"index", 0}, {"heightPx", 80}, {"visible", true}, {"locked", false}},
                QJsonObject{{"id", "a"}, {"name", "Voice"}, {"type", "audio"}, {"index", 1}, {"heightPx", 80}, {"visible", true}, {"locked", false}},
                QJsonObject{{"id", "m"}, {"name", "Music"}, {"type", "audio"}, {"index", 2}, {"heightPx", 80}, {"visible", true}, {"locked", false}}}},
            {"clips", QJsonArray{
                QJsonObject{{"id", "ana"}, {"trackId", "a"}, {"name", "Ana"}, {"mediaType", "audio"}, {"startMs", 1000}, {"durationMs", 2000}, {"inPointMs", 0}, {"outPointMs", 2000}, {"speaker", "Ana"}, {"caption", QJsonObject{{"words", ana}}}},
                QJsonObject{{"id", "ben"}, {"trackId", "a"}, {"name", "Ben"}, {"mediaType", "audio"}, {"startMs", 5000}, {"durationMs", 4000}, {"inPointMs", 0}, {"outPointMs", 4000}, {"speaker", "Ben"}, {"caption", QJsonObject{{"words", ben}}}},
                QJsonObject{{"id", "shot"}, {"trackId", "v"}, {"name", "Shot"}, {"mediaType", "image"}, {"startMs", 10000}, {"durationMs", 1000}},
                QJsonObject{{"id", "music"}, {"trackId", "m"}, {"name", "Music"}, {"mediaType", "audio"}, {"startMs", 10000}, {"durationMs", 1000}}}}};
    }
    void load(const QJsonObject& raw) {
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        clock.setDurationMs(raw.value("durationMs").toDouble());
        clock.seek(0);
        settle();
        panelItem()->setProperty("tab", "transcript");
        settle();
        QVERIFY2(panelItem()->isVisible(), "The Text panel is not the active tab of its group.");
    }
    void settle() {
        QCoreApplication::processEvents();
        QTest::qWait(100);
        QCoreApplication::processEvents();
    }
    QQuickItem* panelItem() const { return item("timelineTextPanel"); }
    TranscriptSession* session() const { return panelItem()->findChild<TranscriptSession*>(); }
    TranscriptWords* wordsOf(int word) const {
        const int row = session()->paragraphOfWord(word);
        auto* paragraph = item("transcriptParagraph_" + QString::number(row));
        return paragraph ? paragraph->findChild<TranscriptWords*>() : nullptr;
    }
    QPoint wordPoint(int word) const {
        auto* words = wordsOf(word);
        if (!words) { return {}; }
        const auto box = words->wordRect(word);
        return words->mapToScene(box.center()).toPoint();
    }
    void clickWord(int word, Qt::KeyboardModifiers mods = Qt::NoModifier) {
        const auto point = wordPoint(word);
        QVERIFY2(!point.isNull(), qPrintable("no point for word " + QString::number(word)));
        QTest::mouseClick(view.get(), Qt::LeftButton, mods, point);
        QCoreApplication::processEvents();
    }
    QStringList transcriptWords() const {
        QStringList out;
        for (const auto& w : nt::transcript::sequenceWords(doc())) { out << w.text; }
        return out;
    }
    QQuickItem* childNamed(const QString& row, const QString& name) const {
        auto* parent = item(row);
        return parent ? named(parent, name) : nullptr;
    }
    void typeInto(QQuickItem* field, const QString& text) {
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(field));
        QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier);
        typeText(text);
    }
    void typeText(const QString& text) {
        for (const QChar c : text) { QTest::keyClick(view.get(), c.toLatin1()); }
    }
    // A click on the row's edge, past its fields.
    void chooseRow(int row) {
        auto* target = item("captionRow_" + QString::number(row));
        QVERIFY(target);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, target->mapToScene({target->width() - 2, 4}).toPoint());
        QCoreApplication::processEvents();
    }
    void shot(const QString& name) {
        if (qEnvironmentVariableIsSet("NT_SHOT_DIR")) { view->grabWindow().save(qEnvironmentVariable("NT_SHOT_DIR") + "/" + name + ".png"); }
    }
private slots:
    // As main() does. A font added after the UI has text garbles that text (see loadTimelineFonts).
    void initTestCase() { nt::render2d::loadTimelineFonts(); }
    void init() { open(300); }
    void cleanup() { view.reset(); }

    void panelIsADockTabWithTwoTabs() {
        QVERIFY(panelItem());
        QVERIFY(panelItem()->isVisible());
        QVERIFY(item("textTab_transcript"));
        QVERIFY(item("dockTab_transcript"));
        click("textTab_captions");
        QCOMPARE(panelItem()->property("tab").toString(), QString("captions"));
        QVERIFY(item("captionsTab")->isVisible());
        QVERIFY(!item("transcriptTab")->isVisible());
    }
    void noWordTimingShowsANextStep() {
        const auto* step = item("transcriptNextStep");
        QVERIFY(step && step->isVisible());
        auto* state = item("transcriptEmptyState");
        QCOMPARE(state->property("title").toString(), QString("No word timing yet"));
        QVERIFY(state->property("message").toString().contains("Add an audio or video clip"));
        QCOMPARE(state->property("actionText").toString(), QString());
        shot("next-step-no-media");
        // With media and no words the step names the clip and offers to transcribe it.
        auto raw = document();
        auto clips = raw.value("clips").toArray();
        auto ana = clips[0].toObject();
        ana.remove("caption");
        ana.insert("currentAssetId", "asset");
        auto ben = clips[1].toObject();
        ben.remove("caption");
        clips[0] = ana;
        clips[1] = ben;
        raw.insert("clips", clips);
        load(raw);
        QVERIFY(state->property("message").toString().contains("“Ana”"));
        QCOMPARE(state->property("actionText").toString(), QString("Transcribe clip"));
        shot("next-step-transcribe");
        // The next step tells why it cannot start with no server.
        QVERIFY(QMetaObject::invokeMethod(state, "actionTriggered"));
        settle();
        QVERIFY(item("transcriptRequestError")->isVisible());
        QVERIFY(item("transcriptRequestError")->property("text").toString().contains("server"));
        // Words only on a reversed clip say why they are missing.
        raw = document();
        clips = raw.value("clips").toArray();
        ana = clips[0].toObject();
        ana.insert("reverse", true);
        clips[0] = ana;
        clips.removeAt(1);
        raw.insert("clips", clips);
        load(raw);
        QVERIFY(state->property("message").toString().contains("reversed"));
        click("textTab_captions");
        QVERIFY(!item("captionsEmptyState")->isVisible());
    }
    void clickSelectsAWordAndShiftClickExtends() {
        load(document());
        QVERIFY(!item("transcriptNextStep")->isVisible());
        auto* s = session();
        QCOMPARE(s->wordCount(), 9);
        clickWord(1);
        QCOMPARE(s->selectionFirst(), 1);
        QCOMPARE(s->selectionLast(), 1);
        auto* viewState = gestures()->viewState();
        QCOMPARE(viewState->rangeInMs(), 1500.0);
        QVERIFY(qAbs(viewState->rangeOutMs() - 2000.0) < 1e-6);
        QCOMPARE(clock.time(), 1500.0);
        QCOMPARE(item("transcriptSelection")->property("text").toString(), QString("1 word selected"));
        clickWord(3, Qt::ShiftModifier);
        QCOMPARE(s->selectionFirst(), 1);
        QCOMPARE(s->selectionLast(), 3);
        QVERIFY(qAbs(viewState->rangeOutMs() - 3000.0) < 1e-6);
        // Extending the other way keeps the anchor.
        clickWord(0, Qt::ShiftModifier);
        QCOMPARE(s->selectionFirst(), 0);
        QCOMPARE(s->selectionLast(), 1);
        QCOMPARE(viewState->rangeInMs(), 1000.0);
        shot("selection");
        // Selecting makes no undo entry and no edit.
        QCOMPARE(model.undoStack()->count(), 0);
        // Marking In elsewhere ends the selection without moving what the person set.
        viewState->setRangeIn(400);
        QCOMPARE(s->selectionFirst(), -1);
        QCOMPARE(viewState->rangeInMs(), 400.0);
    }
    void arrowKeysMoveAndExtendTheSelection() {
        load(document());
        auto* s = session();
        clickWord(1);
        QTest::keyClick(view.get(), Qt::Key_Right);
        QCOMPARE(s->selectionFirst(), 2);
        QTest::keyClick(view.get(), Qt::Key_Right, Qt::ShiftModifier);
        QCOMPARE(s->selectionFirst(), 2);
        QCOMPARE(s->selectionLast(), 3);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QCOMPARE(s->selectionFirst(), -1);
        QCOMPARE(gestures()->viewState()->rangeInMs(), -1.0);
    }
    void deleteLiftsWithOneUndoEntry() {
        load(document());
        clickWord(1);
        clickWord(2, Qt::ShiftModifier);
        const auto before = model.undoStack()->count();
        QTest::keyClick(view.get(), Qt::Key_Delete);
        settle();
        QCOMPARE(model.undoStack()->count(), before + 1);
        QCOMPARE(transcriptWords(), QStringList({"one", "four", "Find", "the", "word,", "find", "it."}));
        // A hole: Ben stays where he was.
        QCOMPARE(clip("ben").value("startMs").toDouble(), 5000.0);
        QCOMPARE(session()->selectionFirst(), -1);
        QCOMPARE(session()->wordCount(), 7);
        QCOMPARE(gestures()->viewState()->rangeInMs(), -1.0);
        model.undoStack()->undo();
        settle();
        QCOMPARE(session()->wordCount(), 9);
        QCOMPARE(model.undoStack()->count(), before + 1);
    }
    void shiftDeleteAndBackspaceExtractWithOneUndoEntry() {
        for (const auto& key : {std::pair{Qt::Key_Delete, Qt::ShiftModifier}, std::pair{Qt::Key_Backspace, Qt::NoModifier}}) {
            load(document());
            clickWord(1);
            clickWord(2, Qt::ShiftModifier);
            const auto before = model.undoStack()->count();
            QTest::keyClick(view.get(), key.first, key.second);
            settle();
            QCOMPARE(model.undoStack()->count(), before + 1);
            QCOMPARE(transcriptWords(), QStringList({"one", "four", "Find", "the", "word,", "find", "it."}));
            // The gap closed on every sync-locked track.
            QCOMPARE(clip("ben").value("startMs").toDouble(), 4000.0);
            QCOMPARE(clip("shot").value("startMs").toDouble(), 9000.0);
            QCOMPARE(clip("music").value("startMs").toDouble(), 9000.0);
            model.undoStack()->undo();
            settle();
            QCOMPARE(clip("ben").value("startMs").toDouble(), 5000.0);
            QCOMPARE(session()->wordCount(), 9);
        }
    }
    void buttonsLiftAndExtract() {
        load(document());
        QVERIFY(!item("transcriptLift")->isEnabled());
        clickWord(0);
        QVERIFY(item("transcriptLift")->isEnabled());
        click("transcriptExtract");
        settle();
        QCOMPARE(transcriptWords().first(), QString("two"));
        QCOMPARE(clip("ben").value("startMs").toDouble(), 4500.0);
        clickWord(0);
        click("transcriptLift");
        settle();
        QCOMPARE(transcriptWords().first(), QString("three"));
        QCOMPARE(clip("ben").value("startMs").toDouble(), 4500.0);
    }
    void extractObeysTargetingAndSyncLocks() {
        auto& targets = TrackTargeting::current();
        targets.setTrackTargeted("m", false);
        targets.setTrackSyncLocked("m", false);
        load(document());
        clickWord(0);
        QTest::keyClick(view.get(), Qt::Key_Backspace);
        settle();
        QCOMPARE(clip("ben").value("startMs").toDouble(), 4500.0);
        QCOMPARE(clip("music").value("startMs").toDouble(), 10000.0);
    }
    void aLockedRangeSaysWhyNothingHappened() {
        auto raw = document();
        auto tracks = raw.value("tracks").toArray();
        for (qsizetype i = 0; i < tracks.size(); ++i) {
            auto t = tracks[i].toObject();
            t.insert("locked", true);
            tracks[i] = t;
        }
        raw.insert("tracks", tracks);
        load(raw);
        clickWord(1);
        const auto in = gestures()->viewState()->rangeInMs();
        QTest::keyClick(view.get(), Qt::Key_Delete);
        settle();
        QCOMPARE(session()->wordCount(), 9);
        QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(item("textStatus")->isVisible());
        QVERIFY(item("textStatus")->property("text").toString().contains("Unlock"));
        // The selection and its In and Out are still there to try again.
        QCOMPARE(session()->selectionFirst(), 1);
        QCOMPARE(gestures()->viewState()->rangeInMs(), in);
    }
    void searchFindsJumpsAndSteps() {
        load(document());
        auto* s = session();
        auto* field = item("transcriptSearch");
        typeInto(field, "find");
        settle();
        QCOMPARE(s->matchCount(), 2);
        QCOMPARE(item("transcriptMatchCount")->property("text").toString(), QString("2 matches"));
        QCOMPARE(s->selectionFirst(), -1);
        shot("search");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(s->selectionFirst(), 4);
        QCOMPARE(clock.time(), 5000.0);
        QCOMPARE(item("transcriptMatchCount")->property("text").toString(), QString("1 of 2"));
        click("transcriptNextMatch");
        QCOMPARE(s->selectionFirst(), 7);
        QCOMPARE(clock.time(), 8000.0);
        QCOMPARE(item("transcriptMatchCount")->property("text").toString(), QString("2 of 2"));
        click("transcriptNextMatch");
        QCOMPARE(s->selectionFirst(), 4);
        click("transcriptPreviousMatch");
        QCOMPARE(s->selectionFirst(), 7);
        typeInto(field, "nothing here");
        settle();
        QCOMPARE(item("transcriptMatchCount")->property("text").toString(), QString("No matches"));
        QVERIFY(!item("transcriptNextMatch")->isEnabled());
    }
    void currentWordFollowsThePlayheadWithoutModelWork() {
        load(document());
        auto* s = session();
        QSignalSpy paragraphsData(s->paragraphs(), &QAbstractItemModel::dataChanged);
        QSignalSpy paragraphsReset(s->paragraphs(), &QAbstractItemModel::modelReset);
        QSignalSpy cuesData(s->cues(), &QAbstractItemModel::dataChanged);
        QSignalSpy clipsChanged(&model, &TimelineModel::clipsChanged);
        auto* mark = item("transcriptCurrentWord");
        QVERIFY(mark);
        QVERIFY(!mark->isVisible());
        auto* first = wordsOf(0);
        const int paints = first->paintCount();
        clock.seek(1600);
        QCoreApplication::processEvents();
        QVERIFY(mark->isVisible());
        const auto box = first->wordRect(1);
        const auto expected = first->mapToScene(box.topLeft());
        QVERIFY(qAbs(mark->mapToScene({0, 0}).x() - expected.x()) < 1);
        QVERIFY(qAbs(mark->mapToScene({0, 0}).y() - expected.y()) < 1);
        QCOMPARE(mark->width(), box.width());
        // A later word on the same line moves the mark along.
        clock.seek(2600);
        QCoreApplication::processEvents();
        QVERIFY(qAbs(mark->mapToScene({0, 0}).x() - first->mapToScene(first->wordRect(3).topLeft()).x()) < 1);
        // A pause shows nothing.
        clock.seek(4000);
        QCoreApplication::processEvents();
        QVERIFY(!mark->isVisible());
        for (double t = 0; t < 9000; t += 33) {
            clock.seek(t);
            QCoreApplication::processEvents();
        }
        QTest::qWait(30);
        QCOMPARE(paragraphsData.count(), 0);
        QCOMPARE(paragraphsReset.count(), 0);
        QCOMPARE(cuesData.count(), 0);
        QCOMPARE(clipsChanged.count(), 0);
        QCOMPARE(first->paintCount(), paints);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void listScrollsToFollowAWordOutOfView() {
        QJsonArray clips;
        QJsonArray words;
        for (int i = 0; i < 2000; ++i) { words.append(word("word" + QString::number(i), i * 200, i * 200 + 150)); }
        auto raw = document();
        clips.append(QJsonObject{{"id", "long"}, {"trackId", "a"}, {"name", "Long"}, {"mediaType", "audio"}, {"startMs", 0}, {"durationMs", 400000}, {"inPointMs", 0}, {"outPointMs", 400000}, {"caption", QJsonObject{{"words", words}}}});
        raw.insert("clips", clips);
        raw.insert("durationMs", 400000);
        load(raw);
        clock.seek(300000);
        QCoreApplication::processEvents();
        QTest::qWait(30);
        auto* mark = item("transcriptCurrentWord");
        auto* list = item("transcriptParagraphs");
        QVERIFY(mark->isVisible());
        const auto y = mark->mapToItem(list, {0, 0}).y();
        QVERIFY2(y >= 0 && y + mark->height() <= list->height() + 1, qPrintable(QString::number(y)));
    }
    // 20 000 words on the real list: a frame of scrolling stays inside the 60 Hz budget, including
    // the delegates it creates, and only the delegates in view exist.
    void longTranscriptScrollsWithinTheBudget() {
        QJsonArray words;
        for (int i = 0; i < 20000; ++i) { words.append(word(i % 12 == 11 ? "sentence." : "transcript", i * 200, i * 200 + 150)); }
        auto raw = document();
        raw.insert("clips", QJsonArray{QJsonObject{{"id", "long"}, {"trackId", "a"}, {"name", "Long"}, {"mediaType", "audio"}, {"startMs", 0}, {"durationMs", 4000000}, {"inPointMs", 0}, {"outPointMs", 4000000}, {"caption", QJsonObject{{"words", words}}}}});
        raw.insert("durationMs", 4000000);
        load(raw);
        QElapsedTimer timer;
        auto* list = qobject_cast<QQuickItem*>(item("transcriptParagraphs"));
        QVERIFY(list);
        QCOMPARE(session()->wordCount(), 20000);
        auto* content = list->property("contentItem").value<QQuickItem*>();
        QVERIFY(content);
        std::vector<qint64> frames;
        int most = 0;
        // input + polish + sync, the GUI thread's share of a frame in --ui-bench and its 8 ms p95.
        QElapsedTimer syncTimer;
        qint64 syncUs = 0;
        connect(view.get(), &QQuickWindow::beforeSynchronizing, this, [&] { syncTimer.restart(); }, Qt::DirectConnection);
        connect(view.get(), &QQuickWindow::afterSynchronizing, this, [&] { syncUs = syncTimer.nsecsElapsed() / 1000; }, Qt::DirectConnection);
        QSignalSpy swapped(view.get(), &QQuickWindow::frameSwapped);
        for (int i = 0; i < 600; ++i) {
            QWheelEvent wheel(center(list), list->mapToGlobal(list->width() / 2, list->height() / 2), QPoint(0, -120), QPoint(0, -120), Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
            timer.restart();
            QCoreApplication::sendEvent(view.get(), &wheel);
            list->setProperty("contentY", list->property("contentY").toDouble() + 40);
            QMetaObject::invokeMethod(list, "forceLayout");
            const auto input = timer.nsecsElapsed() / 1000;
            syncUs = 0;
            if (i % 10 == 0) {
                // Rendering 1800x900 in software is not the budget, so only some steps draw.
                swapped.clear();
                view->requestUpdate();
                if (swapped.wait(500)) { frames.push_back(input + syncUs); continue; }
            }
            frames.push_back(input);
            most = std::max(most, static_cast<int>(content->childItems().size()));
        }
        std::sort(frames.begin(), frames.end());
        const auto p95 = frames[frames.size() * 95 / 100];
        const auto p99 = frames[frames.size() * 99 / 100];
        qInfo() << "scroll step us p50" << frames[frames.size() / 2] << "p95" << p95 << "p99" << p99 << "max" << frames.back() << "delegates" << most;
        QVERIFY2(p95 < 8000, qPrintable(QString::number(p95)));
#ifndef NT_SANITIZED
        // A shared runner can stall any single step, so the frame budget holds 99% of them.
        // A sanitizer's allocator adds slow steps too, so only the plain build is held to it.
        QVERIFY2(p99 < 16000, qPrintable(QString::number(p99)));
#endif
        QVERIFY2(most > 2 && most < 60, qPrintable(QString::number(most)));
        shot("long-transcript");
    }
    // The caption list has edit fields on each row, and the same document gives thousands of rows.
    void longCaptionListScrollsWithinTheBudget() {
        QJsonArray words;
        for (int i = 0; i < 20000; ++i) { words.append(word("caption", i * 200, i * 200 + 150)); }
        auto raw = document();
        raw.insert("clips", QJsonArray{QJsonObject{{"id", "long"}, {"trackId", "a"}, {"name", "Long"}, {"mediaType", "audio"}, {"startMs", 0}, {"durationMs", 4000000}, {"inPointMs", 0}, {"outPointMs", 4000000}, {"caption", QJsonObject{{"words", words}}}}});
        raw.insert("durationMs", 4000000);
        load(raw);
        click("textTab_captions");
        settle();
        QCOMPARE(session()->cueCount(), 2000);
        auto* list = item("captionRows");
        QVERIFY(list);
        std::vector<qint64> frames;
        QElapsedTimer timer;
        for (int i = 0; i < 300; ++i) {
            timer.restart();
            list->setProperty("contentY", list->property("contentY").toDouble() + 40);
            QMetaObject::invokeMethod(list, "forceLayout");
            frames.push_back(timer.nsecsElapsed() / 1000);
        }
        std::sort(frames.begin(), frames.end());
        qInfo() << "caption scroll step us p50" << frames[frames.size() / 2] << "p95" << frames[frames.size() * 95 / 100] << "max" << frames.back();
        QVERIFY2(frames[frames.size() * 95 / 100] < 8000, qPrintable(QString::number(frames[frames.size() * 95 / 100])));
    }
    void aWordChangeKeepsTheListWhereItWas() {
        load(document());
        auto* s = session();
        // Correcting a word updates its paragraph in place and keeps the delegates.
        auto* first = wordsOf(0);
        QVERIFY(model.applyEdit("assist.correctTranscript", {{"clipId", "ana"}, {"wordIndex", 1}, {"text", "TWO"}}));
        settle();
        QCOMPARE(s->words()[1].text, QString("TWO"));
        QCOMPARE(wordsOf(0), first);
        QCOMPARE(first->property("text").toString(), QString("one TWO three four"));
    }
    void captionRowsEditTextAndTimesWithOneUndoEntryEach() {
        load(document());
        click("textTab_captions");
        settle();
        QVERIFY(item("captionsTab")->isVisible());
        QVERIFY(!item("captionsEmptyState")->isVisible());
        QCOMPARE(session()->cueCount(), 3);
        auto* undo = model.undoStack();
        shot("captions");

        auto* textField = childNamed("captionRow_0", "captionText");
        QVERIFY(textField);
        QCOMPARE(textField->property("text").toString(), QString("one two three four"));
        typeInto(textField, "one two tree four");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(undo->count(), 1);
        QCOMPARE(clip("ana").value("caption").toObject().value("words").toArray().at(2).toObject().value("word").toString(), QString("tree"));
        QCOMPARE(clip("ana").value("caption").toObject().value("words").toArray().at(2).toObject().value("startMs").toDouble(), 1000.0);

        auto* out = childNamed("captionRow_0", "captionOut");
        QCOMPARE(out->property("text").toString(), QString("00:00:03:00"));
        typeInto(out, "00:00:02:15");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(undo->count(), 2);
        QCOMPARE(childNamed("captionRow_0", "captionOut")->property("text").toString(), QString("00:00:02:15"));
        QCOMPARE(clip("ana").value("caption").toObject().value("words").toArray().last().toObject().value("endMs").toDouble(), 1500.0);
        QCOMPARE(clip("ana").value("durationMs").toDouble(), 2000.0);  // the audio is not touched

        // A bad timecode says what to enter and changes nothing.
        typeInto(childNamed("captionRow_0", "captionOut"), "soon");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(undo->count(), 2);
        QVERIFY(item("textStatus")->property("text").toString().contains("timecode"));
        QCOMPARE(childNamed("captionRow_0", "captionOut")->property("text").toString(), QString("00:00:02:15"));

        // An out before the in is refused the same way.
        typeInto(childNamed("captionRow_0", "captionOut"), "00:00:00:10");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(undo->count(), 2);
        QVERIFY(item("textStatus")->property("text").toString().contains("after the in time"));
        QCOMPARE(childNamed("captionRow_0", "captionOut")->property("text").toString(), QString("00:00:02:15"));

        undo->undo();
        undo->undo();
        settle();
        QCOMPARE(clip("ana").value("caption").toObject().value("words").toArray().at(2).toObject().value("word").toString(), QString("three"));
        QCOMPARE(childNamed("captionRow_0", "captionText")->property("text").toString(), QString("one two three four"));
    }
    void captionRowsSplitMergeDeleteAndAdd() {
        load(document());
        click("textTab_captions");
        settle();
        auto* undo = model.undoStack();
        auto* s = session();
        QCOMPARE(s->cueCount(), 3);
        QVERIFY(!item("captionSplit")->isEnabled());
        QVERIFY(!item("captionDelete")->isEnabled());
        // Selecting a row moves the playhead to it.
        chooseRow(0);
        QCOMPARE(clock.time(), 1000.0);
        click("captionSplit");
        settle();
        QCOMPARE(undo->count(), 1);
        QCOMPARE(s->cueCount(), 4);
        QCOMPARE(childNamed("captionRow_0", "captionText")->property("text").toString(), QString("one two"));
        QCOMPARE(childNamed("captionRow_1", "captionText")->property("text").toString(), QString("three four"));

        click("captionMerge");
        settle();
        QCOMPARE(undo->count(), 2);
        QCOMPARE(s->cueCount(), 3);
        // The next cue of the first clip is on Ben's clip. Ben's first cue merges across the pause.
        QVERIFY(!item("captionMerge")->isEnabled());
        chooseRow(2);
        QVERIFY(!item("captionMerge")->isEnabled());
        chooseRow(1);
        QVERIFY(item("captionMerge")->isEnabled());
        click("captionMerge");
        settle();
        QCOMPARE(undo->count(), 3);
        QCOMPARE(s->cueCount(), 2);
        QCOMPARE(childNamed("captionRow_1", "captionText")->property("text").toString(), QString("Find the word, find it."));

        QVERIFY(item("captionDelete")->isEnabled());
        click("captionDelete");
        settle();
        QCOMPARE(undo->count(), 4);
        QCOMPARE(s->cueCount(), 1);
        QCOMPARE(clip("ben").value("durationMs").toDouble(), 4000.0);
        QVERIFY(!item("captionDelete")->isEnabled());

        // Add at the playhead over the clip that lost its words: the new row takes the focus.
        clock.seek(6000);
        settle();
        click("captionAdd");
        settle();
        QCOMPARE(undo->count(), 5);
        QCOMPARE(s->cueCount(), 2);
        auto* added = childNamed("captionRow_1", "captionText");
        QCOMPARE(added->property("text").toString(), QString("New caption"));
        QVERIFY(added->hasActiveFocus());
        typeText("Hello there");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(undo->count(), 6);
        QCOMPARE(clip("ben").value("caption").toObject().value("words").toArray().size(), 2);

        // No room here: the reason is shown and nothing changes.
        clock.seek(15000);
        settle();
        click("captionAdd");
        settle();
        QCOMPARE(undo->count(), 6);
        QCOMPARE(item("textStatus")->property("text").toString(), QString("A caption needs an unlocked audio or video clip under the playhead, with no caption there yet. For words over a picture, use Add text in the timeline toolbar."));
        shot("captions-edited");
    }
    void captionsTabOffersAddWhenThereAreNoCaptions() {
        auto raw = document();
        auto clips = raw.value("clips").toArray();
        for (int i : {0, 1}) { auto c = clips[i].toObject(); c.remove("caption"); clips[i] = c; }
        raw.insert("clips", clips);
        load(raw);
        click("textTab_captions");
        settle();
        QVERIFY(item("captionsEmptyState")->isVisible());
        shot("captions-empty");
        clock.seek(1500);
        settle();
        QVERIFY(QMetaObject::invokeMethod(item("captionsEmptyState"), "actionTriggered"));
        settle();
        QCOMPARE(session()->cueCount(), 1);
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(!item("captionsEmptyState")->isVisible());
    }
    void lockedCaptionsCannotBeEdited() {
        auto raw = document();
        auto clips = raw.value("clips").toArray();
        auto c = clips[0].toObject();
        c.insert("locked", true);
        clips[0] = c;
        raw.insert("clips", clips);
        load(raw);
        click("textTab_captions");
        settle();
        QVERIFY(!childNamed("captionRow_0", "captionText")->isEnabled());
        chooseRow(0);
        QVERIFY(!item("captionDelete")->isEnabled());
        QVERIFY(!item("captionSplit")->isEnabled());
        QVERIFY(childNamed("captionRow_1", "captionText")->isEnabled());
        chooseRow(1);
        QVERIFY(item("captionDelete")->isEnabled());
    }
    void currentCaptionIsMarkedWithoutModelWork() {
        load(document());
        click("textTab_captions");
        settle();
        QSignalSpy cuesData(session()->cues(), &QAbstractItemModel::dataChanged);
        auto* mark = item("captionCurrent");
        QVERIFY(mark);
        clock.seek(5100);
        QCoreApplication::processEvents();
        QVERIFY(mark->isVisible());
        QVERIFY(qAbs(mark->mapToScene({0, 0}).y() - item("captionRow_1")->mapToScene({0, 0}).y()) < 1);
        clock.seek(100);
        QCoreApplication::processEvents();
        QVERIFY(!mark->isVisible());
        QCOMPARE(cuesData.count(), 0);
    }
    // A caption drawn in Program adds no font: a change to the font database under laid-out text
    // draws it with the wrong glyphs, all over the editor.
    void drawingACaptionAddsNoFont() {
        QSignalSpy changed(qApp, &QGuiApplication::fontDatabaseChanged);
        load(document());
        clock.seek(1500);
        settle();
        QImage grabbed = view->grabWindow();
        QVERIFY(!grabbed.isNull());
        QCOMPARE(changed.count(), 0);
    }
    void panelActionRevealsTheTab() {
        QVERIFY(gestures()->runAction("panelText"));
        settle();
        QVERIFY(panelItem()->isVisible());
    }
    // A long word that wraps, and text that is not Latin, still map clicks to words.
    void wordRectsHoldForWrappedAndNonLatinWords() {
        auto raw = document();
        const QJsonArray words{word(QString(200, 'x'), 0, 500), word("次の", 500, 900), word("كلمة", 900, 1300)};
        raw.insert("clips", QJsonArray{QJsonObject{{"id", "w"}, {"trackId", "a"}, {"name", "W"}, {"mediaType", "audio"}, {"startMs", 0}, {"durationMs", 3000}, {"inPointMs", 0}, {"outPointMs", 3000}, {"caption", QJsonObject{{"words", words}}}}});
        load(raw);
        auto* items = wordsOf(0);
        QVERIFY(items);
        for (int i = 0; i < 3; ++i) {
            const auto box = items->wordRect(i);
            QVERIFY2(box.width() > 0, qPrintable(QString("word %1 in width %2 height %3 lines").arg(i).arg(items->width()).arg(items->implicitHeight())));
            QCOMPARE(items->wordAt(box.center().x(), box.center().y()), i);
        }
        QCOMPARE(items->wordAt(items->width() - 0.5, items->implicitHeight() + 40), -1);
        QCOMPARE(items->wordAt(-1, 0), -1);
    }
};

QTEST_MAIN(TestTextPanel)
#include "tst_textpanel.moc"
