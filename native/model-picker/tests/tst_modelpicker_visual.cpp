#include <QQmlApplicationEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QTest>
#include <QSignalSpy>

namespace {
QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) return root;
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) return found;
    }
    return nullptr;
}
}
class ModelPickerVisualTest : public QObject {
    Q_OBJECT
private slots:
    void catalogMayBeTemporarilyAbsent() {
        QQmlApplicationEngine engine;
        engine.load(QUrl::fromLocalFile(MODEL_PICKER_TEST_QML));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto* popup = engine.rootObjects().first()->findChild<QObject*>("sharedModelPicker");
        QVERIFY(popup);
        const auto catalog = popup->property("catalog");
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        QVERIFY(popup->setProperty("catalog", QVariant::fromValue<QObject*>(nullptr)));
        QCoreApplication::processEvents();
        QCOMPARE(warnings.size(), 0);
        QVERIFY(popup->setProperty("catalog", catalog));
        QCoreApplication::processEvents();
        QCOMPARE(warnings.size(), 0);
    }
    void popoverFitsAndRenders() {
        QQmlApplicationEngine engine;
        engine.load(QUrl::fromLocalFile(MODEL_PICKER_TEST_QML));
        QVERIFY2(!engine.rootObjects().isEmpty(), "Model picker fixture failed to load");
        auto* window = qobject_cast<QQuickWindow*>(engine.rootObjects().first());
        QVERIFY(window);
        auto* popup = window->findChild<QObject*>("sharedModelPicker");
        QVERIFY(popup);
        QTRY_VERIFY(popup->property("visible").toBool());
        const auto x = popup->property("x").toDouble();
        const auto y = popup->property("y").toDouble();
        const auto width = popup->property("width").toDouble();
        const auto height = popup->property("height").toDouble();
        QVERIFY(x >= 0 && y >= 0);
        QVERIFY(x + width <= window->width());
        QVERIFY(y + height <= window->height());
        window->resize(320, 300);
        QTRY_VERIFY(popup->property("x").toDouble() + popup->property("width").toDouble() <= window->width());
        QTRY_VERIFY(popup->property("y").toDouble() + popup->property("height").toDouble() <= window->height());
        const auto narrowScreenshot = qEnvironmentVariable("MODEL_PICKER_NARROW_SCREENSHOT");
        if (!narrowScreenshot.isEmpty()) QVERIFY(window->grabWindow().save(narrowScreenshot));
        window->resize(800, 620);
        QTest::qWait(100);
        auto click = [window](const QString& name) {
            auto* item = findItem(window->contentItem(), name);
            if (!item) return false;
            const auto point = item->mapToScene({item->width() / 2, item->height() / 2});
            QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, point.toPoint());
            return true;
        };
        QVERIFY(click("favorite_openai_gpt-5"));
        QVERIFY(popup->property("visible").toBool());
        QTRY_COMPARE(findItem(window->contentItem(), "favorite_openai_gpt-5")->property("text").toString(), QStringLiteral("★"));
        auto* fixture = window->findChild<QObject*>("pickerFixture");
        QVERIFY(fixture);
        QCOMPARE(fixture->property("selectedModelId").toString(), QString());
        QVERIFY(click("default_openai_gpt-5"));
        QVERIFY(popup->property("visible").toBool());
        QTRY_VERIFY(findItem(window->contentItem(), "default_openai_gpt-5")->property("highlighted").toBool());
        QCOMPARE(fixture->property("selectedModelId").toString(), QString());
        QVERIFY(click("choose_openai_unavailable"));
        QVERIFY(popup->property("visible").toBool());
        QCOMPARE(fixture->property("selectedModelId").toString(), QString());
        const auto path = qEnvironmentVariable("MODEL_PICKER_SCREENSHOT");
        if (!path.isEmpty()) QVERIFY(window->grabWindow().save(path));
        QVERIFY(click("choose_openai_gpt-5"));
        QTRY_VERIFY(!popup->property("visible").toBool());
        QCOMPARE(fixture->property("selectedModelId").toString(), QStringLiteral("gpt-5"));
        auto* trigger = findItem(window->contentItem(), "visualTrigger");
        QVERIFY(trigger);
        QTRY_VERIFY(trigger->hasActiveFocus());
        QVERIFY(click("visualTrigger"));
        QTRY_VERIFY(popup->property("visible").toBool());
        QTest::keyClick(window, Qt::Key_Escape);
        QTRY_VERIFY(!popup->property("visible").toBool());
        QTRY_VERIFY(trigger->hasActiveFocus());
        QVERIFY(click("visualTrigger"));
        auto* results = findItem(window->contentItem(), "modelPickerResults");
        QVERIFY(results);
        QTRY_COMPARE(results->property("currentIndex").toInt(), 0);
        QTest::keyClick(window, Qt::Key_Down);
        QTRY_COMPARE(results->property("currentIndex").toInt(), 2);
        QTest::keyClick(window, Qt::Key_Return);
        QTRY_VERIFY(!popup->property("visible").toBool());
        QCOMPARE(fixture->property("selectedModelId").toString(), QStringLiteral("claude"));
        QVERIFY(click("visualTrigger"));
        QTRY_COMPARE(results->property("currentIndex").toInt(), 2);
        fixture->setProperty("reorderOnRefresh", true);
        QVERIFY(click("modelPickerRefresh"));
        QTRY_COMPARE(results->property("currentIndex").toInt(), 0);
        QCOMPARE(fixture->property("selectedModelId").toString(), QStringLiteral("claude"));
    }
};
QTEST_MAIN(ModelPickerVisualTest)
#include "tst_modelpicker_visual.moc"
