// TimelinePlayerController and TimelinePlayer.qml without a GPU: the
// offscreen platform and the software scene graph, a fake loader and
// documents whose clips have no media. The picture itself is checked by
// tst_timelineplayer_render.
#include "FakeTimelineLoader.h"

#include "model/StaticTimelineSource.h"
#include "playback/PlaybackClock.h"
#include "player/TimelinePlayerController.h"
#include "preview/PreviewCompositor.h"

#include <QGuiApplication>
#include <QPointer>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickView>
#include <QQuickWindow>
#include <QSignalSpy>
#include <QTest>

#include <cstdint>
#include <memory>

using Status = TimelinePlayerController::Status;

namespace {

// A controller on a fake clock, with `loader` answered for `id`.
struct Player {
    FakeTimelineLoader loader;
    std::unique_ptr<TimelinePlayerController> controller = std::make_unique<TimelinePlayerController>();
    std::int64_t nowNs = 0;

    explicit Player(const QString& id = QStringLiteral("t1"), bool answer = true) {
        controller->clock()->setNowSource([this] { return nowNs; });
        controller->setLoader(&loader);
        controller->setTimelineId(id);
        if (answer) {
            loader.answer(id);
        }
    }
    void advance(double ms) {
        nowNs += static_cast<std::int64_t>(ms * 1e6);
        controller->clock()->tick();
    }
};

}  // namespace

class TestTimelinePlayer : public QObject {
    Q_OBJECT

private slots:
    void initTestCase() {
        QQuickWindow::setGraphicsApi(QSGRendererInterface::Software);
    }

    void idleWithoutATimeline() {
        TimelinePlayerController controller;
        QCOMPARE(controller.status(), Status::Idle);
        controller.play();
        QVERIFY(!controller.playing());
        // An ID without a loader is an error the host can see.
        controller.setTimelineId(QStringLiteral("t1"));
        QCOMPARE(controller.status(), Status::Error);
        QVERIFY(!controller.error().isEmpty());
    }

    void loadsTheDocument() {
        Player p(QStringLiteral("t1"), false);
        QCOMPARE(p.controller->status(), Status::Loading);
        QCOMPARE(p.loader.requests, QStringList{QStringLiteral("t1")});
        p.controller->play();
        QVERIFY(!p.controller->playing());
        p.loader.answer(QStringLiteral("t1"));
        QCOMPARE(p.controller->status(), Status::Ready);
        QCOMPARE(p.controller->durationMs(), 4000.0);
        QCOMPARE(p.controller->fps(), 25.0);
        QCOMPARE(p.controller->frame(), 0);
        const auto snapshot = p.controller->source()->snapshot();
        QVERIFY(snapshot);
        QCOMPARE(QString::fromStdString(snapshot->id), QStringLiteral("t1"));
        QVERIFY(snapshot->revision != 0);
        QCOMPARE(p.controller->clock()->durationMs(), 4000.0);
    }

    void failureIsReported() {
        Player p(QStringLiteral("t1"), false);
        p.loader.reject(QStringLiteral("t1"), QStringLiteral("not found"));
        QCOMPARE(p.controller->status(), Status::Error);
        QCOMPARE(p.controller->error(), QStringLiteral("not found"));
    }

    void playPauseAndSeek() {
        Player p;
        QSignalSpy playing(p.controller.get(), &TimelinePlayerController::playingChanged);
        p.controller->play();
        QVERIFY(p.controller->playing());
        QCOMPARE(playing.count(), 1);
        p.advance(1000);
        QCOMPARE(p.controller->positionMs(), 1000.0);
        QCOMPARE(p.controller->frame(), 25);
        p.controller->pause();
        QVERIFY(!p.controller->playing());
        p.advance(500);
        QCOMPARE(p.controller->positionMs(), 1000.0);
        p.controller->toggle();
        QVERIFY(p.controller->playing());
        p.controller->toggle();
        QVERIFY(!p.controller->playing());

        p.controller->seek(2000);
        QCOMPARE(p.controller->positionMs(), 2000.0);
        QCOMPARE(p.controller->frame(), 50);
        p.controller->seek(-10);
        QCOMPARE(p.controller->positionMs(), 0.0);
        p.controller->seek(1e9);
        QCOMPARE(p.controller->positionMs(), 4000.0);

        p.controller->seek(2000);
        p.controller->stepFrames(1);
        QCOMPARE(p.controller->frame(), 51);
        QCOMPARE(p.controller->positionMs(), 2040.0);
        p.controller->stepFrames(-3);
        QCOMPARE(p.controller->frame(), 48);
        p.controller->play();
        p.controller->stepFrames(1);
        QVERIFY(!p.controller->playing());
        QCOMPARE(p.controller->frame(), 49);
    }

    void playbackStopsAtTheEnd() {
        Player p;
        p.controller->play();
        p.advance(5000);
        QVERIFY(!p.controller->playing());
        QCOMPARE(p.controller->positionMs(), 4000.0);
    }

    void aSupersededLoadIsDropped() {
        Player p(QStringLiteral("t1"), false);
        p.controller->setTimelineId(QStringLiteral("t2"));
        QCOMPARE(p.loader.requests, (QStringList{QStringLiteral("t1"), QStringLiteral("t2")}));
        QCOMPARE(p.loader.cancels, 1);
        auto lease = std::make_shared<int>(1);
        const std::weak_ptr<int> leaseAlive = lease;
        p.loader.answer(QStringLiteral("t1"), lease);
        lease.reset();
        QCOMPARE(p.controller->status(), Status::Loading);
        QVERIFY(!p.controller->source()->snapshot());
        QVERIFY(leaseAlive.expired());
        p.loader.reject(QStringLiteral("t1"), QStringLiteral("late"));
        QCOMPARE(p.controller->status(), Status::Loading);
        p.loader.answer(QStringLiteral("t2"));
        QCOMPARE(p.controller->status(), Status::Ready);
        QCOMPARE(QString::fromStdString(p.controller->source()->snapshot()->id), QStringLiteral("t2"));
        // A second answer for the current ID is not a new load either.
        const auto generation = p.controller->source()->documentGeneration();
        p.loader.answer(QStringLiteral("t2"));
        QCOMPARE(p.controller->source()->documentGeneration(), generation);
    }

    void statusChangedCanReplaceTheRequest() {
        FakeTimelineLoader loader;
        TimelinePlayerController controller;
        controller.setLoader(&loader);
        connect(&controller, &TimelinePlayerController::statusChanged, this, [&controller] {
            if (controller.status() == Status::Loading && controller.timelineId() == QStringLiteral("a")) {
                controller.setTimelineId(QStringLiteral("b"));
            }
        });
        controller.setTimelineId(QStringLiteral("a"));
        QCOMPARE(loader.requests, QStringList{QStringLiteral("b")});
        QCOMPARE(controller.status(), Status::Loading);
        loader.answer(QStringLiteral("b"));
        QCOMPARE(controller.status(), Status::Ready);
    }

    void aSupersededRequestForTheSameIdIsDropped_data() {
        QTest::addColumn<bool>("success");
        QTest::newRow("loaded") << true;
        QTest::newRow("failed") << false;
    }

    void aSupersededRequestForTheSameIdIsDropped() {
        QFETCH(bool, success);
        Player p(QStringLiteral("a"), false);
        p.controller->setTimelineId(QStringLiteral("b"));
        p.controller->setTimelineId(QStringLiteral("a"));
        QCOMPARE(p.loader.requests.size(), 3);
        if (success) {
            p.loader.answerRequest(0);
        } else {
            p.loader.rejectRequest(0);
        }
        QCOMPARE(p.controller->status(), Status::Loading);
        QVERIFY(!p.controller->source()->snapshot());
        p.loader.answerRequest(2);
        QCOMPARE(p.controller->status(), Status::Ready);
    }

    void aLateResultAfterDestructionIsDropped() {
        FakeTimelineLoader loader;
        auto controller = std::make_unique<TimelinePlayerController>();
        controller->setLoader(&loader);
        controller->setTimelineId(QStringLiteral("t1"));
        controller.reset();
        QCOMPARE(loader.cancels, 1);
        auto lease = std::make_shared<int>(1);
        const std::weak_ptr<int> leaseAlive = lease;
        loader.answer(QStringLiteral("t1"), std::move(lease));
        QVERIFY(leaseAlive.expired());
    }

    void unavailableOnTheSoftwareSceneGraph() {
        FakeTimelineLoader loader;
        TimelinePlayerController controller;
        controller.setLoader(&loader);
        auto window = std::make_unique<QQuickWindow>();
        QCOMPARE(window->rendererInterface()->graphicsApi(), QSGRendererInterface::Software);
        controller.setWindow(window.get());
        controller.setTimelineId(QStringLiteral("t1"));
        QCOMPARE(controller.status(), Status::Unavailable);
        QVERIFY(loader.requests.isEmpty());
        controller.play();
        QVERIFY(!controller.playing());
        // Without the window, the controller loads.
        window.reset();
        QCOMPARE(controller.status(), Status::Loading);
        QCOMPARE(loader.requests, QStringList{QStringLiteral("t1")});
    }

    // TimelinePlayer.qml shows the message and creates no compositor.
    void theItemShowsAMessageWhenUnavailable() {
        FakeTimelineLoader loader;
        QQuickView view;
        view.setInitialProperties({{QStringLiteral("loader"), QVariant::fromValue<QObject*>(&loader)},
                                   {QStringLiteral("timelineId"), QStringLiteral("t1")},
                                   {QStringLiteral("compact"), true}});
        view.loadFromModule("NodeTool.TimelinePlayer", "TimelinePlayer");
        QVERIFY2(view.status() == QQuickView::Ready, qPrintable(view.errors().isEmpty() ? QString() : view.errors().first().toString()));
        view.resize(320, 240);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        QQuickItem* root = view.rootObject();
        auto* controller = root->property("controller").value<TimelinePlayerController*>();
        QVERIFY(controller);
        QTRY_COMPARE(controller->status(), Status::Unavailable);
        QVERIFY(loader.requests.isEmpty());
        QVERIFY(!root->findChild<PreviewCompositor*>());
        auto* message = root->findChild<QQuickItem*>(QStringLiteral("timelinePlayerStatus"));
        QVERIFY(message);
        QVERIFY(message->isVisible());
        QCOMPARE(message->property("text").toString(), QStringLiteral("Playback needs GPU rendering"));
        auto* transport = root->findChild<QQuickItem*>(QStringLiteral("timelinePlayerTransport"));
        QVERIFY(transport);
        QVERIFY(!transport->isEnabled());
    }

    void onePlayerPlaysAtATime() {
        QQmlEngine engine;
        Player a(QStringLiteral("a"));
        Player b(QStringLiteral("b"));
        QQmlEngine::setContextForObject(a.controller.get(), engine.rootContext());
        QQmlEngine::setContextForObject(b.controller.get(), engine.rootContext());
        a.controller->play();
        QVERIFY(a.controller->playing());
        b.controller->play();
        QVERIFY(b.controller->playing());
        QVERIFY(!a.controller->playing());
        a.controller->play();
        QVERIFY(!b.controller->playing());
        // A destroyed player leaves the next one free to play.
        a.controller.reset();
        b.controller->play();
        QVERIFY(b.controller->playing());
    }

    // Destroying the controller while the null audio device plays stops the
    // device callback before the clock, the source and the leases go. The
    // compositor that still points at the clock then sees none.
    void teardownDuringPlayback() {
        auto lease = std::make_shared<int>(1);
        const std::weak_ptr<int> leaseAlive = lease;
        FakeTimelineLoader loader;
        auto controller = std::make_unique<TimelinePlayerController>();
        controller->setAudioMode(TimelinePlayerController::AudioMode::Null);
        controller->setLoader(&loader);
        controller->setTimelineId(QStringLiteral("t1"));
        loader.answer(QStringLiteral("t1"), std::move(lease));
        PreviewCompositor compositor;
        compositor.setTimeline(controller->source());
        compositor.setClock(controller->clock());
        controller->play();
        QVERIFY(controller->playing());
        QVERIFY(controller->audioEnabled());
        // Let the device callback and the decode worker run.
        QTRY_VERIFY_WITH_TIMEOUT(controller->clock()->currentTimeMs() > 100.0, 5000);
        controller->clock()->tick();
        QVERIFY(!leaseAlive.expired());
        controller.reset();
        QVERIFY(leaseAlive.expired());
        QVERIFY(!compositor.clock());
        QVERIFY(!compositor.timeline());
    }

    void audioClosesWhenAnotherPlayerStarts() {
        QQmlEngine engine;
        Player a(QStringLiteral("a"));
        Player b(QStringLiteral("b"));
        QQmlEngine::setContextForObject(a.controller.get(), engine.rootContext());
        QQmlEngine::setContextForObject(b.controller.get(), engine.rootContext());
        a.controller->setAudioMode(TimelinePlayerController::AudioMode::Null);
        a.controller->play();
        QVERIFY(a.controller->audioEnabled());
        b.controller->play();
        QVERIFY(!a.controller->audioEnabled());
        QVERIFY(!a.controller->clock()->audioMaster());
    }
};

int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    TestTimelinePlayer test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_timelineplayer.moc"
