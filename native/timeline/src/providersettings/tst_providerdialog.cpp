#include "ProviderSettings.h"
#include <QGuiApplication>
#include <QJsonArray>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QRegularExpression>
#include <QtTest>
#include <atomic>

class TestProviderDialog : public QObject {
    Q_OBJECT
    static QQuickItem* item(QQuickItem* root, const QString& name) {
        if (root->objectName() == name) { return root; }
        for (auto* child : root->childItems()) {
            if (auto* found = item(child, name)) { return found; }
        }
        return nullptr;
    }
private slots:
    void keyboardAndSmallWindows() {
        QTest::failOnWarning(QRegularExpression(".*Binding loop.*"));
        QTest::failOnWarning(QRegularExpression(".*Cannot load font.*"));
        std::atomic_int saves = 0;
        std::atomic_int removals = 0;
        ProviderSettings controller;
        controller.setTargetForTest({QUrl("http://127.0.0.1:12345"), "fake-token", {}, {}, {}});
        controller.setCallForTest([&saves, &removals](bool, const QString& procedure, const QJsonObject&) {
            nt::server::QueryResult result;
            if (procedure == "settings.list") {
                result.data = QJsonObject{{"settings", QJsonArray{
                    QJsonObject{{"env_var", "ALPHA_API_KEY"}, {"group", "Alpha"}, {"description", "Connect Alpha with your account key."}, {"is_secret", true}, {"value", "****"}},
                    QJsonObject{{"env_var", "ALPHA_MODE"}, {"group", "Alpha"}, {"description", "Optional provider mode."}, {"is_secret", false}, {"enum", QJsonArray{"first", "second"}}, {"value", QJsonValue::Null}},
                    QJsonObject{{"env_var", "BETA_URL"}, {"group", "Beta"}, {"description", "Local model server endpoint."}, {"is_secret", false}, {"value", "http://localhost:1234"}}
                }}};
            } else if (procedure == "settings.providerCatalog") {
                result.data = QJsonArray{
                    QJsonObject{{"provider", "alpha"}, {"name", "Alpha"}, {"configured", true}, {"keys", QJsonArray{"ALPHA_API_KEY", "ALPHA_MODE"}}},
                    QJsonObject{{"provider", "beta"}, {"name", "Beta"}, {"configured", true}, {"keys", QJsonArray{"BETA_URL"}}}};
            } else if (procedure == "settings.secrets.list") {
                result.data = QJsonObject{{"secrets", QJsonArray{QJsonObject{{"key", "ALPHA_API_KEY"}, {"id", "12345678901234567890123456789012"}, {"is_configured", true}}}}};
            } else if (procedure == "settings.update") {
                ++saves;
                result.data = QJsonObject{{"message", "Saved"}};
            } else if (procedure == "settings.secrets.delete") {
                ++removals;
                result.data = QJsonObject{{"message", "Deleted"}};
            } else {
                result.data = QJsonArray{};
            }
            return result;
        });
        QQmlEngine engine;
        // Prefer this test's embedded module over a sibling app build's qmldir.
        engine.addImportPath("qrc:/qt/qml");
        QQuickWindow window;
        window.resize(640, 480);
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "ProviderSettingsDialog");
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> dialog(component.createWithInitialProperties({
            {"parent", QVariant::fromValue(window.contentItem())},
            {"controller", QVariant::fromValue(&controller)}}));
        QVERIFY2(dialog, qPrintable(component.errorString()));
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "open"));
        QTRY_VERIFY(!controller.busy() && !controller.fields().isEmpty());
        QTRY_VERIFY(item(window.contentItem(), "providerField_ALPHA_API_KEY"));
        auto* mode = item(window.contentItem(), "providerChoice_ALPHA_MODE");
        QVERIFY(mode);
        QCOMPARE(mode->property("currentIndex").toInt(), -1);
        QCOMPARE(mode->property("displayText").toString(), QString("Not set"));
        QVERIFY(!controller.dirty());
        auto* key = item(window.contentItem(), "providerField_ALPHA_API_KEY");
        QCOMPARE(key->property("text").toString(), QString{});
        QCOMPARE(key->property("echoMode").toInt(), 2); // QQuickTextInput::Password
        key->forceActiveFocus();
        for (const char character : QByteArray("fake-draft")) { QTest::keyClick(&window, character); }
        QTRY_VERIFY(controller.dirty());
        QCOMPARE(key->property("displayText").toString().contains("fake-draft"), false);
        QTest::keyClick(&window, Qt::Key_Tab);
        QVERIFY(window.activeFocusItem() != key);
        QTest::keyClick(&window, Qt::Key_Escape);
        auto* confirm = dialog->findChild<QObject*>("discardProviderDrafts");
        QVERIFY(confirm);
        QTRY_VERIFY(confirm->property("visible").toBool());
        QVERIFY(dialog->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(confirm, "reject"));
        QTRY_VERIFY(!confirm->property("visible").toBool());
        QVERIFY(controller.dirty());
        QVERIFY(dialog->property("visible").toBool());
        auto* picker = item(window.contentItem(), "providerGroup");
        QVERIFY(picker);
        picker->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_Down);
        QTRY_VERIFY(confirm->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(confirm, "reject"));
        QTRY_VERIFY(!confirm->property("visible").toBool());
        QCOMPARE(controller.selectedGroup(), QString("Alpha"));
        QCOMPARE(picker->property("currentText").toString(), QString("Alpha"));
        QVERIFY(controller.dirty());
        QCOMPARE(item(window.contentItem(), "providerField_ALPHA_API_KEY")->property("text").toString(), QString("fake-draft"));
        controller.discard();
        controller.selectGroup("Beta");
        QTRY_COMPARE(picker->property("currentText").toString(), QString("Beta"));
        QTRY_VERIFY(item(window.contentItem(), "providerField_BETA_URL"));
        controller.selectGroup("Alpha");
        QTRY_VERIFY(item(window.contentItem(), "providerField_ALPHA_API_KEY"));
        QCOMPARE(item(window.contentItem(), "providerField_ALPHA_API_KEY")->property("text").toString(), QString{});
        item(window.contentItem(), "providerField_ALPHA_API_KEY")->forceActiveFocus();
        QTest::keyClick(&window, 'x');
        QTRY_VERIFY(controller.dirty());
        for (const auto& size : {QSize(1280,720), QSize(1366,768), QSize(1024,768), QSize(960,1000), QSize(480,360)}) {
            window.resize(size);
            QCoreApplication::processEvents();
            QVERIFY(dialog->property("width").toReal() <= size.width());
            QVERIFY(dialog->property("height").toReal() <= size.height());
            auto* close = item(window.contentItem(), "cancelProviderSettings");
            QVERIFY(close);
            const auto pos = close->mapToScene(QPointF(close->width() / 2, close->height() / 2));
            QVERIFY(pos.x() >= 0 && pos.x() <= size.width());
            QVERIFY(pos.y() >= 0 && pos.y() <= size.height());
        }
        auto* narrowKey = item(window.contentItem(), "providerField_ALPHA_API_KEY");
        auto* narrowMode = item(window.contentItem(), "providerChoice_ALPHA_MODE");
        auto* scroll = item(window.contentItem(), "providerSettingsScroll");
        QVERIFY(narrowKey && narrowMode && scroll);
        auto* viewport = qobject_cast<QQuickItem*>(scroll->property("contentItem").value<QObject*>());
        QVERIFY(viewport);
        narrowKey->forceActiveFocus();
        for (int step = 0; step < 6 && !narrowMode->hasActiveFocus(); ++step) {
            QTest::keyClick(&window, Qt::Key_Tab);
        }
        QVERIFY(narrowMode->hasActiveFocus());
        QTRY_VERIFY(narrowMode->mapToItem(viewport, QPointF()).y() >= 0);
        QTRY_VERIFY(narrowMode->mapToItem(viewport, QPointF()).y() + narrowMode->height() <= viewport->height());
        window.grabWindow().save("/tmp/nodetool-provider-dialog.png");
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "requestClose"));
        QTRY_VERIFY(confirm->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(confirm, "discarded"));
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QVERIFY(!controller.dirty());
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "open"));
        QTRY_VERIFY(!controller.busy() && item(window.contentItem(), "providerField_ALPHA_API_KEY"));
        QCOMPARE(item(window.contentItem(), "providerField_ALPHA_API_KEY")->property("text").toString(), QString{});
        QCOMPARE(saves.load(), 0);
        QCOMPARE(removals.load(), 0);
        auto* replacement = item(window.contentItem(), "providerField_ALPHA_API_KEY");
        replacement->forceActiveFocus();
        QTest::keyClick(&window, 'x');
        QTRY_VERIFY(controller.dirty());
        QCOMPARE(saves.load(), 0);
        auto* save = item(window.contentItem(), "saveProviderSettings");
        QVERIFY(save);
        save->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_Space);
        QTRY_COMPARE(saves.load(), 1);
        QTRY_VERIFY(!controller.busy() && !controller.dirty());
        QTRY_VERIFY(item(window.contentItem(), "providerField_ALPHA_API_KEY"));
        QCOMPARE(item(window.contentItem(), "providerField_ALPHA_API_KEY")->property("text").toString(), QString{});
        auto* remove = item(window.contentItem(), "removeProvider_ALPHA_API_KEY");
        QVERIFY(remove);
        remove->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_Space);
        auto* removalDialog = dialog->findChild<QObject*>("confirmProviderRemoval");
        QVERIFY(removalDialog);
        QTRY_VERIFY(removalDialog->property("visible").toBool());
        QCOMPARE(removals.load(), 0);
        QVERIFY(QMetaObject::invokeMethod(removalDialog, "reject"));
        QTRY_VERIFY(!removalDialog->property("visible").toBool());
        QCOMPARE(removals.load(), 0);
        remove->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_Space);
        QTRY_VERIFY(removalDialog->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(removalDialog, "accept"));
        QTRY_COMPARE(removals.load(), 1);
        QTRY_VERIFY(!controller.busy());
    }
};
QTEST_MAIN(TestProviderDialog)
#include "tst_providerdialog.moc"
