#include <QApplication>
#include <QJSValue>
#include <memory>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QSignalSpy>
#include <QtTest>

class StructuredPropertyUiTest : public QObject {
    Q_OBJECT
private:
    static QVariant unpack(const QVariant& value) {
        return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant() : value;
    }
private slots:
    void listActions() {
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/editor/StructuredPropertyEditor.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        const QVariantMap descriptor{{"kind", "list"}, {"dataType", QVariantMap{{"type", "list"}, {"type_args", QVariantList{QVariantMap{{"type", "int"}}}}}}};
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({{"descriptor", descriptor}, {"value", QVariantList{1, 2}}, {"writable", true}}));
        QVERIFY(editor);
        QSignalSpy commits(editor.get(), SIGNAL(valueCommitted(QVariant)));
        QVERIFY(QMetaObject::invokeMethod(editor.get(), "add"));
        QCOMPARE(commits.count(), 1);
        QCOMPARE(unpack(commits.last().first()).toList(), QVariantList({1, 2, 0}));
        QVERIFY(QMetaObject::invokeMethod(editor.get(), "move", Q_ARG(QVariant, 2), Q_ARG(QVariant, -1)));
        QCOMPARE(unpack(commits.last().first()).toList(), QVariantList({1, 0, 2}));
        QVERIFY(QMetaObject::invokeMethod(editor.get(), "remove", Q_ARG(QVariant, 1)));
        QCOMPARE(unpack(commits.last().first()).toList(), QVariantList({1, 2}));
        editor->setProperty("writable", false);
        QVERIFY(QMetaObject::invokeMethod(editor.get(), "add"));
        QCOMPARE(commits.count(), 3);
    }
    void dictionaryAndRecord() {
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/editor/StructuredPropertyEditor.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> dict(component.createWithInitialProperties({{"descriptor", QVariantMap{{"kind", "dict"}}}, {"value", QVariantMap{{"first", 1}, {"second", 2}}}, {"writable", true}}));
        QVERIFY(dict);
        QSignalSpy writes(dict.get(), SIGNAL(valueCommitted(QVariant)));
        QVERIFY(QMetaObject::invokeMethod(dict.get(), "rename", Q_ARG(QVariant, 0), Q_ARG(QVariant, "second")));
        QCOMPARE(writes.count(), 0);
        QVERIFY(QMetaObject::invokeMethod(dict.get(), "rename", Q_ARG(QVariant, 0), Q_ARG(QVariant, "renamed")));
        QCOMPARE(unpack(writes.first().first()).toMap(), QVariantMap({{"renamed", 1}, {"second", 2}}));
        const QVariantMap record{{"type", "record_type"}, {"columns", QVariantList{QVariantMap{{"name", "old"}, {"data_type", "string"}, {"future", 8}}}}, {"data", QVariantList{1}}, {"future", 9}};
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({{"descriptor", QVariantMap{{"kind", "record_type"}}}, {"value", record}, {"writable", true}}));
        QVERIFY(editor);
        QSignalSpy commits(editor.get(), SIGNAL(valueCommitted(QVariant)));
        QVERIFY(QMetaObject::invokeMethod(editor.get(), "column", Q_ARG(QVariant, 0), Q_ARG(QVariant, "name"), Q_ARG(QVariant, "new")));
        const auto result = unpack(commits.first().first()).toMap();
        QCOMPARE(result.value("future").toInt(), 9);
        QCOMPARE(result.value("columns").toList().first().toMap().value("future").toInt(), 8);
        QCOMPARE(result.value("data"), record.value("data"));
    }
    void jsonDraft() {
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/editor/StructuredPropertyEditor.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({{"descriptor", QVariantMap{{"kind", "json"}}}, {"value", QVariantMap{{"type", "json"}, {"data", "{}"}, {"future", 7}}}, {"writable", true}}));
        QVERIFY(editor);
        QSignalSpy commits(editor.get(), SIGNAL(valueCommitted(QVariant)));
        editor->setProperty("jsonDraft", "{");
        QVERIFY(QMetaObject::invokeMethod(editor.get(), "applyJson"));
        QCOMPARE(commits.count(), 0);
        QCOMPARE(editor->property("jsonDraft").toString(), QString("{"));
        QVERIFY(!editor->property("error").toString().isEmpty());
        editor->setProperty("jsonDraft", "[true]");
        QVERIFY(QMetaObject::invokeMethod(editor.get(), "applyJson"));
        QCOMPARE(commits.count(), 1);
        const auto value = unpack(commits.first().first()).toMap();
        QCOMPARE(value.value("data").toString(), QString("[true]"));
        QCOMPARE(value.value("future").toInt(), 7);
    }
};
QTEST_MAIN(StructuredPropertyUiTest)
#include "StructuredPropertyUiTest.moc"
