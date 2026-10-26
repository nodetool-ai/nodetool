#include "export/ExportController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QGuiApplication>
#include <QQuickItem>
#include <functional>
#include <QJSValue>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QDir>
#include <QtTest>
#include <memory>

class ExportDialogTest : public QObject {
    Q_OBJECT
private slots:
    void dialog() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "ExportVideoDialog");
        std::unique_ptr<QObject> root(component.create());
        QVERIFY2(root, qPrintable(component.errorString()));
        const auto options = root->property("formatOptions").value<QJSValue>().toVariant().toList();
        const QStringList labels{"MP4 (H.264)", "WebM (VP9)", "PNG sequence (.zip)", "WAV audio (16-bit)", "MP3 audio (320 kbps)"};
        QCOMPARE(options.size(), labels.size());
        for (int i = 0; i < labels.size(); ++i) QCOMPARE(options[i].toMap().value("label").toString(), labels[i]);
        QSignalSpy exported(root.get(), SIGNAL(exportRequested(QVariant)));
        QVERIFY(exported.isValid());
        const QStringList formats{"mp4", "webm", "png_sequence", "wav", "mp3"};
        for (const auto& format : formats) {
            root->setProperty("format", format);
            root->setProperty("alpha", true);
            QCoreApplication::processEvents();
            QCOMPARE(root->property("alphaEnabled").toBool(), false);
            QCOMPARE(root->property("alpha").toBool(), false);
            QVERIFY(QMetaObject::invokeMethod(root.get(), "confirmExport"));
            QCOMPARE(exported.last().first().toMap().value("alpha").toBool(), false);
            QCOMPARE(exported.last().first().toMap().value("format").toString(), format);
        }
        root->setProperty("alphaAvailable", true);
        for (const auto& format : formats) {
            root->setProperty("format", format);
            root->setProperty("alpha", true);
            const bool enabled = format == "webm" || format == "png_sequence";
            QCOMPARE(root->property("alphaEnabled").toBool(), enabled);
            QCOMPARE(root->property("alpha").toBool(), enabled);
        }
        root->setProperty("mp4Supported", false);
        root->setProperty("format", "mp4");
        QCOMPARE(root->property("format").toString(), QString("webm"));
        auto* select = root->findChild<QObject*>("formatSelect");
        QVERIFY(select);
        const auto updated = root->property("formatOptions").value<QJSValue>().toVariant().toList();
        QCOMPARE(updated.first().toMap().value("disabled").toBool(), true);
    }
    void panelContext() {
        auto parsed = nt::loadTimelineFile(QStringLiteral(NT_EXPORT_FIXTURES "/av-sync.json"));
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 800}, {"height", 600}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        const std::function<QQuickItem*(QQuickItem*)> findPanel = [&](QQuickItem* item) -> QQuickItem* {
            if (item->objectName() == "exportPanel") return item;
            for (auto* child : item->childItems()) {
                if (auto* found = findPanel(child)) return found;
            }
            return nullptr;
        };
        auto* item = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(item);
        QTRY_VERIFY(findPanel(item));
        auto* controller = findPanel(item)->property("controller").value<ExportController*>();
        QVERIFY(controller);
        QCOMPARE(controller->timeline(), &model);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void controllerCancelBeforeFrames() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        auto parsed = nt::loadTimelineFile(QStringLiteral(NT_EXPORT_FIXTURES "/audio-mix.json"));
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        const QByteArray before = model.documentJson();
        ExportController controller;
        controller.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        controller.setTimeline(&model);
        QSignalSpy opened(&controller, &ExportController::openRequested);
        controller.open();
        QCOMPARE(opened.size(), 1);
        QSignalSpy finished(&controller, &ExportController::finished);
        controller.start(dir.filePath("cancelled.wav"), "wav", false);
        controller.cancel();
        QTRY_VERIFY_WITH_TIMEOUT(!finished.empty(), 15000);
        QVERIFY(!finished.first().first().toBool());
        QVERIFY2(controller.error().isEmpty(), qPrintable(controller.error()));
        QCOMPARE(QDir(dir.path()).entryList(QDir::NoDotAndDotDot | QDir::AllEntries | QDir::Hidden), QStringList{});
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void controllerCancel() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        auto parsed = nt::loadTimelineFile(QStringLiteral(NT_EXPORT_FIXTURES "/av-sync.json"));
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        bool sent = false;
        ExportController controller;
        controller.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        controller.setTimeline(&model);
        QSignalSpy finished(&controller, &ExportController::finished);
        connect(&controller, &ExportController::progressChanged, &controller, [&] {
            if (controller.frame() >= 2 && !sent) { sent = true; controller.cancel(); }
        });
        controller.start(dir.filePath("cancelled.mp4"), "mp4", false);
        QTRY_VERIFY_WITH_TIMEOUT(!finished.empty(), 45000);
        QVERIFY2(sent, qPrintable(controller.error()));
        QVERIFY(!finished.first().first().toBool());
        QVERIFY(controller.error().isEmpty());
        QCOMPARE(QDir(dir.path()).entryList(QDir::NoDotAndDotDot | QDir::AllEntries | QDir::Hidden), QStringList{});
        QCOMPARE(model.undoStack()->count(), 0);
    }
};
QTEST_MAIN(ExportDialogTest)
#include "tst_exportdialog.moc"
