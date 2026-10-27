#include <QGuiApplication>
#include <QQuickItem>
#include <QQuickWindow>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJSValue>
#include <QtTest>
#include <memory>

class TestFxControls : public QObject {
    Q_OBJECT
private slots:
    void knobGestures() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
FxKnob { def: ({id:"gain", label:"Gain", min:-1, max:1, def:0, curve:"lin"}); value: 0
    onChange: next => value = next; onSet: next => value = next })", QUrl());
        std::unique_ptr<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* knob = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(knob);
        QQuickWindow window;
        window.resize(240, 200);
        knob->setParentItem(window.contentItem());
        knob->setPosition({70, 60});
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QSignalSpy changes(object.get(), SIGNAL(change(double)));
        QSignalSpy ends(object.get(), SIGNAL(gestureEnd()));
        QSignalSpy sets(object.get(), SIGNAL(setValue(double)));
        QVERIFY(changes.isValid()); QVERIFY(ends.isValid()); QVERIFY(sets.isValid());
        const QPoint point(90, 80);
        QTest::mousePress(&window, Qt::LeftButton, Qt::NoModifier, point);
        QTest::mouseMove(&window, point - QPoint(0, 10));
        QTest::mouseRelease(&window, Qt::LeftButton, Qt::NoModifier, point - QPoint(0, 10));
        QVERIFY(std::abs(object->property("value").toDouble() - .1) < 1e-8);
        QCOMPARE(ends.count(), 1);
        QTest::mousePress(&window, Qt::LeftButton, Qt::ShiftModifier, point);
        QMouseEvent fineMove(QEvent::MouseMove, point - QPoint(0, 10), window.mapToGlobal(point - QPoint(0, 10)),
                             Qt::NoButton, Qt::LeftButton, Qt::ShiftModifier);
        QCoreApplication::sendEvent(&window, &fineMove);
        QTest::mouseRelease(&window, Qt::LeftButton, Qt::ShiftModifier, point - QPoint(0, 10));
        QVERIFY(std::abs(object->property("value").toDouble() - .116) < 1e-8);
        knob->forceActiveFocus();
        QTest::keyPress(&window, Qt::Key_Right);
        QVERIFY(std::abs(object->property("value").toDouble() - .156) < 1e-8);
        const int beforeRelease = ends.count();
        QTest::keyRelease(&window, Qt::Key_Right);
        QCOMPARE(ends.count(), beforeRelease + 1);
        QTest::keyClick(&window, Qt::Key_Left, Qt::ShiftModifier);
        QVERIFY(std::abs(object->property("value").toDouble() - .146) < 1e-8);
        QWheelEvent wheel(point, window.mapToGlobal(point), {}, {0, 120}, Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
        QCoreApplication::sendEvent(&window, &wheel);
        QVERIFY(std::abs(object->property("value").toDouble() - .206) < 1e-8);
        const int beforeWheel = ends.count();
        QTest::qWait(150);
        QWheelEvent fineWheel(point, window.mapToGlobal(point), {}, {0, -120}, Qt::NoButton, Qt::ShiftModifier, Qt::NoScrollPhase, false);
        QCoreApplication::sendEvent(&window, &fineWheel);
        QVERIFY(std::abs(object->property("value").toDouble() - .196) < 1e-8);
        QTest::qWait(150); QCOMPARE(ends.count(), beforeWheel);
        QTRY_COMPARE_WITH_TIMEOUT(ends.count(), beforeWheel + 1, 300);
        const int beforeTrackpad = ends.count();
        QWheelEvent noMovement(point, window.mapToGlobal(point), {}, {}, Qt::NoButton, Qt::NoModifier, Qt::ScrollBegin, false);
        QCoreApplication::sendEvent(&window, &noMovement);
        QVERIFY(std::abs(object->property("value").toDouble() - .196) < 1e-8);
        QWheelEvent pixelUp(point, window.mapToGlobal(point), {0, 12}, {}, Qt::NoButton, Qt::NoModifier, Qt::ScrollUpdate, false);
        QCoreApplication::sendEvent(&window, &pixelUp);
        QVERIFY(std::abs(object->property("value").toDouble() - .256) < 1e-8);
        QWheelEvent pixelDown(point, window.mapToGlobal(point), {0, -12}, {}, Qt::NoButton, Qt::ShiftModifier, Qt::ScrollUpdate, false);
        QCoreApplication::sendEvent(&window, &pixelDown);
        QVERIFY(std::abs(object->property("value").toDouble() - .246) < 1e-8);
        QTRY_COMPARE_WITH_TIMEOUT(ends.count(), beforeTrackpad + 1, 350);
        QTest::mouseDClick(&window, Qt::LeftButton, Qt::NoModifier, point);
        QCOMPARE(sets.count(), 1); QCOMPARE(object->property("value").toDouble(), 0.);
        knob->forceActiveFocus();
        const int beforeBlur = ends.count();
        knob->setFocus(false);
        QTRY_COMPARE(ends.count(), beforeBlur + 1);
        for (const auto& size : {"lg", "md", "sm", "xs"}) {
            knob->setProperty("size", size);
            const double expected = QString(size) == "lg" ? 74 : QString(size) == "md" ? 56 : QString(size) == "sm" ? 44 : 34;
            QCOMPARE(knob->width(), expected);
        }
    }
    void offscreenAppearance() {
        QQmlEngine engine; QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
Rectangle { width:360; height:160; color:Theme.backgroundDefault
 Row { x:20; y:12; spacing:20
  FxKnob { size:"lg"; label:"GAIN"; value:.25; accent:"a"; def:({min:-1,max:1,def:0}) }
  FxKnob { size:"md"; label:"TONE"; value:.7; accent:"b"; def:({min:0,max:1,def:0}) }
  FxKnob { size:"sm"; label:"MIX"; value:.5; accent:"f"; def:({min:0,max:1,def:0}) }
  FxKnob { size:"xs"; value:.5; def:({min:0,max:1,def:0}) }
 }
 FxPower { x:20; y:125; on:true; label:"Effect" }
 FxStepper { x:60; y:120; accent:"a"; def:({options:["LOW","MID","HIGH"]}); value:1 }
})", QUrl());
        std::unique_ptr<QObject> root(component.create());
        QVERIFY2(root, qPrintable(component.errorString()));
        QQuickWindow window; window.resize(360,160);
        qobject_cast<QQuickItem*>(root.get())->setParentItem(window.contentItem());
        window.show(); QVERIFY(QTest::qWaitForWindowExposed(&window));
        QImage image;
        QTRY_VERIFY_WITH_TIMEOUT(([&] {
            window.requestUpdate();
            image = window.grabWindow();
            return !image.isNull() && image.pixelColor(27,132) != image.pixelColor(350,150) &&
                image.pixelColor(57,49) != image.pixelColor(350,150);
        })(), 2000);
        QVERIFY(image.save(QCoreApplication::applicationDirPath() + "/p1-fx-controls.png"));
    }
    void buttons() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
Item { width:200; height:80
FxPower { objectName:"power"; on:true; label:"Gain"; onToggle: on = !on }
FxStepper { objectName:"stepper"; y:30; def: ({options:["A","B","C"]}); value:0; onSet: next => value = next }
})", QUrl());
        std::unique_ptr<QObject> root(component.create());
        QVERIFY2(root, qPrintable(component.errorString()));
        QQuickWindow window; window.resize(220,100);
        qobject_cast<QQuickItem*>(root.get())->setParentItem(window.contentItem());
        window.show(); QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* power = root->findChild<QQuickItem*>("power");
        auto* stepper = root->findChild<QQuickItem*>("stepper");
        QVERIFY(power); QVERIFY(stepper);
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, {7,7});
        QCOMPARE(power->property("on").toBool(), false);
        power->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space);
        QCOMPARE(power->property("on").toBool(), true);
        auto* ring = power->findChild<QQuickItem*>("focusRing");
        QVERIFY(ring);
        auto* border = ring->property("border").value<QObject*>();
        QVERIFY(border); QCOMPARE(border->property("width").toDouble(), 1.);
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, {9,39});
        QCOMPARE(stepper->property("value").toInt(), 2);
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, {89,39});
        QCOMPARE(stepper->property("value").toInt(), 0);
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    if (app.arguments().contains("--helpers")) {
        QQmlEngine engine; QQmlComponent component(&engine);
        component.setData(R"(import QtQml
import "qrc:/qt/qml/NodeTool/Timeline/qml/fx/FxParams.js" as Params
QtObject { function call(name, args) { return Params[name].apply(null, args) } })", QUrl());
        std::unique_ptr<QObject> helper(component.create());
        if (!helper) { qWarning() << component.errors(); return 1; }
        QFile input; if (!input.open(stdin, QIODevice::ReadOnly)) { return 1; }
        const auto requests = QJsonDocument::fromJson(input.readAll()).array();
        QJsonArray results;
        for (const auto& value : requests) {
            const auto request = value.toArray(); QVariant result;
            if (!QMetaObject::invokeMethod(helper.get(), "call", Q_RETURN_ARG(QVariant, result),
                Q_ARG(QVariant, request[0].toString()), Q_ARG(QVariant, request[1].toArray().toVariantList()))) { return 1; }
            if (result.metaType() == QMetaType::fromType<QJSValue>()) { result = result.value<QJSValue>().toVariant(); }
            results.append(QJsonValue::fromVariant(result));
        }
        QFile output; if (!output.open(stdout, QIODevice::WriteOnly)) { return 1; }
        output.write(QJsonDocument(results).toJson(QJsonDocument::Compact)); return 0;
    }
    TestFxControls test; return QTest::qExec(&test, argc, argv);
}
#include "tst_fxcontrols.moc"
