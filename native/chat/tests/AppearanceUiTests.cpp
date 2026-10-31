#include "appearance/AppearanceSettings.h"
#include "runtime/ChatSession.h"

#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickItem>
#include <QQuickWindow>
#include <QFontInfo>
#include <QSettings>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QTest>
#include <QtQml/QQmlExtensionPlugin>

Q_IMPORT_QML_PLUGIN(NodeTool_ChatPlugin)

namespace {
QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) return root;
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) return found;
    }
    return nullptr;
}
}
class AppearanceUiTests : public QObject {
    Q_OBJECT
private slots:
    void selectThemeAndReturnFocus() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        QSettings settings(directory.filePath("appearance.ini"), QSettings::IniFormat);
        nt::chat::AppearanceSettings appearance(settings);
        nt::chat::ChatSession session;
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("chatAppearance", &appearance);
        engine.rootContext()->setContextProperty("chatSession", &session);
        engine.loadFromModule("NodeTool.Chat", "Main");
        QVERIFY(!engine.rootObjects().isEmpty());
        auto* window = qobject_cast<QQuickWindow*>(engine.rootObjects().first());
        QVERIFY(window);
        QTRY_VERIFY(window->isVisible());
        auto* status = findItem(window->contentItem(), "chatConversationTitle");
        QVERIFY(status);
        QCOMPARE(QFontInfo(qvariant_cast<QFont>(status->property("font"))).family(), QStringLiteral("Inter"));
        auto* button = findItem(window->contentItem(), "chatAppearanceButton");
        QVERIFY(button);
        const auto point = button->mapToScene({button->width() / 2, button->height() / 2});
        QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, point.toPoint());
        auto* dialog = window->findChild<QObject*>("chatAppearanceDialog");
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("visible").toBool());
        auto* theme = findItem(window->contentItem(), "chatAppearanceTheme");
        QVERIFY(theme);
        theme->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QTest::keyClick(window, Qt::Key_Down);
        QTest::keyClick(window, Qt::Key_Return);
        QTRY_COMPARE(appearance.themePreference(), QStringLiteral("Dark"));
        QCOMPARE(settings.value("appearance/themePreference").toString(), QStringLiteral("Dark"));
        auto* uiScale = findItem(window->contentItem(), "chatAppearanceUiScale");
        auto* textScale = findItem(window->contentItem(), "chatAppearanceTextScale");
        auto* motion = findItem(window->contentItem(), "chatAppearanceMotion");
        QVERIFY(uiScale && textScale && motion);
        uiScale->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QTest::keyClick(window, Qt::Key_Down);
        QTest::keyClick(window, Qt::Key_Return);
        QTRY_COMPARE(appearance.uiScale(), 1.25);
        textScale->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QTest::keyClick(window, Qt::Key_Down);
        QTest::keyClick(window, Qt::Key_Return);
        QTRY_COMPARE(appearance.textScale(), 1.25);
        motion->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QTest::keyClick(window, Qt::Key_Down);
        QTest::keyClick(window, Qt::Key_Return);
        QTRY_COMPARE(appearance.motionPreference(), QStringLiteral("Reduce"));
        QVERIFY(appearance.reducedMotion());
        window->resize(320, 300);
        appearance.setUiScale(2.0);
        appearance.setTextScale(2.0);
        QCoreApplication::processEvents();
        QVERIFY(dialog->property("x").toDouble() >= 0);
        QVERIFY(dialog->property("y").toDouble() >= 0);
        QVERIFY(dialog->property("x").toDouble() + dialog->property("width").toDouble() <= window->width());
        QVERIFY(dialog->property("y").toDouble() + dialog->property("height").toDouble() <= window->height());
        auto* scroll = findItem(window->contentItem(), "chatAppearanceScroll");
        QVERIFY(scroll);
        motion->forceActiveFocus();
        QTRY_VERIFY(scroll->property("contentY").toDouble() > 0);
        QTRY_VERIFY(motion->mapToItem(scroll, {0, 0}).y() < scroll->height());
        QVERIFY(motion->mapToItem(scroll, {0, 0}).y() + motion->height() > 0);
        const auto screenshot = qEnvironmentVariable("CHAT_APPEARANCE_SCREENSHOT");
        if (!screenshot.isEmpty()) {
            QSignalSpy frame(window, &QQuickWindow::frameSwapped);
            window->requestUpdate();
            QVERIFY(frame.count() > 0 || frame.wait(2000));
            QVERIFY(window->grabWindow().save(screenshot));
        }
        QTest::keyClick(window, Qt::Key_Escape);
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QTRY_VERIFY(button->hasActiveFocus());
    }
};
QTEST_MAIN(AppearanceUiTests)
#include "AppearanceUiTests.moc"
