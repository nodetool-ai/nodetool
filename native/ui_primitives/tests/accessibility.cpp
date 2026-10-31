#include <QAccessible>
#include <QGuiApplication>
#include <QFontDatabase>
#include <QFontInfo>
#include <QRawFont>
#include <QTextLayout>
#include <QGlyphRun>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <QTest>
#include <memory>

class AccessibilityTest : public QObject {
    Q_OBJECT
private slots:
    void fontWeights() {
        const QStringList families = {QStringLiteral("inter"), QStringLiteral("jetbrains-mono")};
        const QList<int> weights = {400, 500, 600};
        for (const auto &family : families) {
            for (const int weight : weights) {
                const QString path = QStringLiteral(":/qt/qml/NodeTool/UiPrimitives/fonts/%1-latin-%2-normal.ttf").arg(family).arg(weight);
                const int id = QFontDatabase::addApplicationFont(path);
                QVERIFY2(id >= 0, qPrintable(path));
                const QStringList names = QFontDatabase::applicationFontFamilies(id);
                QVERIFY(!names.isEmpty());
            }
        }
        for (const auto &family : {QStringLiteral("Inter"), QStringLiteral("JetBrains Mono")}) {
            for (const int weight : weights) {
                QFont font(family);
                font.setPixelSize(18);
                font.setWeight(static_cast<QFont::Weight>(weight));
                const QRawFont raw = QRawFont::fromFont(font);
                QVERIFY(raw.isValid());
                QCOMPARE(raw.familyName(), family);
                QCOMPARE(raw.styleName(), weight == 400 ? QStringLiteral("Regular") : weight == 500 ? QStringLiteral("Medium") : QStringLiteral("SemiBold"));
                QVERIFY(raw.ascent() > 0);
                QVERIFY(raw.advancesForGlyphIndexes(raw.glyphIndexesForString(QStringLiteral("A"))).first().x() > 0);
                QVERIFY(raw.supportsCharacter(U'A'));
                QVERIFY(raw.supportsCharacter(U'\u0301'));
                for (char32_t sample : {U'\u0105', U'\u0416', U'\u03a9', U'\u4e2d', U'\u0645', U'\U0001f600'}) {
                    QVERIFY(!raw.supportsCharacter(sample));
                }
            }
        }
    }
    void renderedUiFonts() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.UiPrimitives as Ui
Item {
    Ui.Text { objectName: "title"; text: "Title"; role: Ui.Typography.SansTitle }
    Ui.Text { objectName: "body"; text: "Body"; role: Ui.Typography.SansBody }
    Ui.EditorButton { objectName: "button"; text: "Action" }
})", QUrl());
        std::unique_ptr<QObject> root(component.create());
        QVERIFY2(root, qPrintable(component.errorString()));
        auto *title = root->findChild<QObject *>(QStringLiteral("title"));
        auto *body = root->findChild<QObject *>(QStringLiteral("body"));
        auto *button = root->findChild<QObject *>(QStringLiteral("button"));
        QVERIFY(title); QVERIFY(body); QVERIFY(button);
        auto *label = button->findChild<QObject *>(QStringLiteral("nativeButtonLabel"));
        QVERIFY(label);
        for (const auto &[object, style] : {std::pair{title, QStringLiteral("SemiBold")}, std::pair{body, QStringLiteral("Regular")}, std::pair{label, QStringLiteral("Medium")}}) {
            const QFont font = object->property("font").value<QFont>();
            QCOMPARE(QFontInfo(font).family(), QStringLiteral("Inter"));
            QTextLayout layout(QStringLiteral("Sample"), font);
            layout.beginLayout(); layout.createLine(); layout.endLayout();
            const auto runs = layout.glyphRuns();
            QVERIFY(!runs.isEmpty());
            QCOMPARE(runs.first().rawFont().familyName(), QStringLiteral("Inter"));
            QCOMPARE(runs.first().rawFont().styleName(), style);
            QVERIFY(runs.first().rawFont().ascent() > 0);
        }
    }
    void roleFontGetter() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.UiPrimitives as Ui
Item {
    property font sansRole: Ui.Typography.font(Ui.Typography.SansLabel)
    property font monoRole: Ui.Typography.font(Ui.Typography.MonoCaption)
})", QUrl());
        std::unique_ptr<QObject> root(component.create());
        QVERIFY2(root, qPrintable(component.errorString()));
        const QFont sans = root->property("sansRole").value<QFont>();
        const QFont mono = root->property("monoRole").value<QFont>();
        QCOMPARE(QFontInfo(sans).family(), QStringLiteral("Inter"));
        QCOMPARE(QRawFont::fromFont(sans).styleName(), QStringLiteral("Medium"));
        QCOMPARE(QFontInfo(mono).family(), QStringLiteral("JetBrains Mono"));
        QCOMPARE(QRawFont::fromFont(mono).styleName(), QStringLiteral("Regular"));
        QVERIFY(sans.pixelSize() > 0);
        QVERIFY(mono.pixelSize() > 0);
    }
    void fallbackIsResolved() {
        QVERIFY(QFontDatabase::addApplicationFont(QStringLiteral(":/qt/qml/NodeTool/UiPrimitives/fonts/inter-latin-400-normal.ttf")) >= 0);
        QFont font(QStringLiteral("Inter"));
        font.setPixelSize(18);
        QTextLayout layout(QString::fromUtf8("A中م😀"), font);
        layout.beginLayout();
        layout.createLine();
        layout.endLayout();
        const auto runs = layout.glyphRuns();
        QVERIFY(!runs.isEmpty());
        bool usedFallback = false;
        for (const auto &run : runs) {
            qInfo() << "Fallback run:" << run.rawFont().familyName();
            if (run.rawFont().familyName() != QStringLiteral("Inter")) usedFallback = true;
        }
        QVERIFY(usedFallback);
    }
    void faderAccessibleActions() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData("import QtQuick\nimport NodeTool.UiPrimitives as Ui\nUi.Fader { accessibleName: 'Volume'; value: 0.5; stepSize: 0.1 }", QUrl());
        std::unique_ptr<QObject> fader(component.create());
        QVERIFY2(fader, qPrintable(component.errorString()));
        auto *interface = QAccessible::queryAccessibleInterface(fader.get());
        QVERIFY(interface);
        auto *actions = interface->actionInterface();
        QVERIFY(actions);
        QSignalSpy committed(fader.get(), SIGNAL(valueCommitted(double)));
        QVERIFY(committed.isValid());
        actions->doAction(QAccessibleActionInterface::increaseAction());
        QCOMPARE(committed.count(), 1);
        QCOMPARE(committed.first().first().toDouble(), 0.6);
        actions->doAction(QAccessibleActionInterface::decreaseAction());
        QCOMPARE(committed.count(), 2);
        QCOMPARE(committed.last().first().toDouble(), 0.4);
    }
    void menuButtonState() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData("import QtQuick\nimport NodeTool.UiPrimitives as Ui\nUi.EditorButton { menuButton: true; accessibleName: 'Choose' }", QUrl());
        std::unique_ptr<QObject> button(component.create());
        QVERIFY2(button, qPrintable(component.errorString()));
        auto *interface = QAccessible::queryAccessibleInterface(button.get());
        QVERIFY(interface);
        QVERIFY(interface->state().expandable);
        QVERIFY(!interface->state().expanded);
        button->setProperty("menuExpanded", true);
        QVERIFY(interface->state().expanded);
        QVERIFY(!interface->state().checkable);
    }
    void loadingBlocksPress() {
        QTest::failOnWarning(QRegularExpression(QStringLiteral(".*TypeError.*")));
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData("import QtQuick\nimport NodeTool.UiPrimitives as Ui\nUi.EditorButton { accessibleName: 'Run' }", QUrl());
        std::unique_ptr<QObject> button(component.create());
        QVERIFY2(button, qPrintable(component.errorString()));
        QAccessibleInterface *interface = QAccessible::queryAccessibleInterface(button.get());
        QVERIFY(interface);
        QAccessibleActionInterface *actions = interface->actionInterface();
        QVERIFY(actions);
        QSignalSpy clicked(button.get(), SIGNAL(clicked()));
        QVERIFY(clicked.isValid());
        actions->doAction(QAccessibleActionInterface::pressAction());
        QCOMPARE(clicked.count(), 1);
        button->setProperty("loading", true);
        actions->doAction(QAccessibleActionInterface::pressAction());
        QCOMPARE(clicked.count(), 1);
    }
};
QTEST_MAIN(AccessibilityTest)
#include "accessibility.moc"
