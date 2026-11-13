// DataTableEditor.qml, ColumnsEditor.qml and RecordTypeEditor.qml on their own:
// the web's ListTable, DictTable, DataTable, TableActions and ColumnsManager.
// Links the QML module and the media QML types, so it builds in the
// components-only configuration.
#include "interfaces/PropertyHost.h"
#include "media/VideoFrameView.h"

#include <QClipboard>
#include <QGuiApplication>
#include <QJSValue>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>
#include <memory>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)
Q_IMPORT_QML_PLUGIN(NodeTool_ModelPickerPlugin)

namespace {

QVariant unpack(const QVariant &value) {
    return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant() : value;
}

QVariant last(const QSignalSpy &spy) { return unpack(spy.last().first()); }

QVariant call(QObject *object, const char *method, const QVariantList &args = {}) {
    QVariant result;
    switch (args.size()) {
    case 0: QMetaObject::invokeMethod(object, method, Q_RETURN_ARG(QVariant, result)); break;
    case 1: QMetaObject::invokeMethod(object, method, Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, args[0])); break;
    case 2: QMetaObject::invokeMethod(object, method, Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, args[0]), Q_ARG(QVariant, args[1])); break;
    default: QMetaObject::invokeMethod(object, method, Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, args[0]), Q_ARG(QVariant, args[1]), Q_ARG(QVariant, args[2])); break;
    }
    return unpack(result);
}

QVariantList order(QObject *table) { return unpack(table->property("order")).toList(); }

QString json(const QVariant &value) { return QString::fromUtf8(QJsonDocument::fromVariant(value).toJson(QJsonDocument::Compact)); }

QObject *findNamed(QObject *root, const QString &name) {
    if (root->objectName() == name) { return root; }
    if (auto *item = qobject_cast<QQuickItem *>(root)) {
        for (auto *child : item->childItems()) {
            if (auto *found = findNamed(child, name)) { return found; }
        }
    }
    for (auto *child : root->children()) {
        if (auto *found = findNamed(child, name)) { return found; }
    }
    return nullptr;
}

}  // namespace

class DataTableEditorTest : public QObject {
    Q_OBJECT
    QQmlEngine engine_;

    std::unique_ptr<QObject> make(const QString &file, const QVariantMap &descriptor, const QVariant &value) {
        QQmlComponent component(&engine_, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/" + file));
        if (!component.isReady()) { qWarning() << component.errorString(); return {}; }
        return std::unique_ptr<QObject>(component.createWithInitialProperties({{"descriptor", descriptor}, {"value", value}, {"writable", true}}));
    }

private slots:
    void initTestCase() { nodetool::node_editor::registerMediaTypes(); }

    // ListProperty.tsx: the value type comes from the first value; ListTable and
    // TableActions add, delete, duplicate, sort and copy.
    void listTable() {
        auto table = make("DataTableEditor.qml", {{"kind", "list"}, {"nodeType", "nodetool.constant.List"}}, QVariantList{3, 1, 2});
        QVERIFY(table);
        QCOMPARE(table->property("valueType").toString(), QString("int"));
        QSignalSpy commits(table.get(), SIGNAL(valueCommitted(QVariant)));

        call(table.get(), "addRow");
        QCOMPARE(last(commits).toList(), QVariantList({3, 1, 2, 0}));
        QVERIFY(call(table.get(), "setCell", {1, 0, "7"}).toBool());
        QCOMPARE(last(commits).toList(), QVariantList({3, 7, 2, 0}));
        // A whole-number column refuses text and keeps the value.
        QVERIFY(!call(table.get(), "setCell", {1, 0, "seven"}).toBool());
        QCOMPARE(commits.count(), 2);
        QVERIFY(!table->property("error").toString().isEmpty());

        // A header click sorts the view only; a second click reverses it.
        call(table.get(), "sortBy", {0});
        QCOMPARE(order(table.get()), QVariantList({3, 2, 0, 1}));
        call(table.get(), "sortBy", {0});
        QCOMPARE(order(table.get()), QVariantList({1, 0, 2, 3}));
        QCOMPARE(commits.count(), 2);
        call(table.get(), "resetSorting");
        QCOMPARE(order(table.get()), QVariantList({0, 1, 2, 3}));

        call(table.get(), "toggleRow", {0, true});
        call(table.get(), "toggleRow", {2, true});
        QVERIFY(call(table.get(), "duplicateSelected").toBool());
        QCOMPARE(last(commits).toList(), QVariantList({3, 7, 2, 3, 2, 0}));
        QVERIFY(call(table.get(), "deleteSelected").toBool());
        QCOMPARE(last(commits).toList(), QVariantList({7, 3, 2, 0}));
        QVERIFY(unpack(table->property("selected")).toList().isEmpty());

        // The value type select changes the editor, not the stored values.
        table->setProperty("valueType", "string");
        QVERIFY(call(table.get(), "setCell", {0, 0, "seven"}).toBool());
        QCOMPARE(last(commits).toList().first().toString(), QString("seven"));

        // DataTableEditors.datetimeEditor stores a parsed date as ISO 8601.
        table->setProperty("valueType", "datetime");
        QVERIFY(!call(table.get(), "setCell", {1, 0, "not a date"}).toBool());
        QVERIFY(call(table.get(), "setCell", {1, 0, "2026-01-02T03:04:05Z"}).toBool());
        QCOMPARE(last(commits).toList().at(1).toString(), QString("2026-01-02T03:04:05.000Z"));
        table->setProperty("valueType", "string");

        call(table.get(), "copyJson");
        QCOMPARE(QGuiApplication::clipboard()->text(), QString(R"(["seven","2026-01-02T03:04:05.000Z",2,0])"));
        QCOMPARE(table->property("status").toString(), QString("Copied to clipboard"));
    }

    // DictProperty.tsx and DictTable.tsx: key renames keep the order and refuse a taken key.
    void dictTable() {
        auto table = make("DataTableEditor.qml", {{"kind", "dict"}, {"nodeType", "nodetool.constant.Dict"}}, QVariantMap{{"a", 1.5}, {"b", 2.5}});
        QVERIFY(table);
        QCOMPARE(table->property("valueType").toString(), QString("float"));
        QVERIFY(!table->property("showSelect").toBool());
        QSignalSpy commits(table.get(), SIGNAL(valueCommitted(QVariant)));

        QVERIFY(!call(table.get(), "setCell", {0, 0, "b"}).toBool());
        QCOMPARE(commits.count(), 0);
        QVERIFY(call(table.get(), "setCell", {0, 0, "z"}).toBool());
        QCOMPARE(json(last(commits)), QString(R"({"b":2.5,"z":1.5})"));
        QCOMPARE(unpack(table->property("keys")).toStringList(), QStringList({"z", "b"}));

        QVERIFY(call(table.get(), "setCell", {1, 1, "4"}).toBool());
        QCOMPARE(last(commits).toMap().value("b").toDouble(), 4.0);
        call(table.get(), "addRow");
        QVERIFY(last(commits).toMap().contains("new_key_2"));
        call(table.get(), "toggleRow", {0, true});
        QVERIFY(call(table.get(), "deleteSelected").toBool());
        QCOMPARE(last(commits).toMap().keys(), QStringList({"b", "new_key_2"}));
    }

    // DataframeProperty.tsx, ColumnsManager.tsx, DataTable.tsx and the dialog's paste and export.
    void dataframeTable() {
        auto table = make("DataTableEditor.qml", {{"kind", "dataframe"}}, QVariantMap{{"type", "dataframe"}, {"uri", "keep"}});
        QVERIFY(table);
        QSignalSpy commits(table.get(), SIGNAL(valueCommitted(QVariant)));

        call(table.get(), "addColumn");
        QCOMPARE(last(commits).toMap().value("columns").toList().first().toMap().value("name").toString(), QString("Column 1"));
        QCOMPARE(last(commits).toMap().value("uri").toString(), QString("keep"));
        table->setProperty("value", last(commits));
        call(table.get(), "addColumn");
        table->setProperty("value", last(commits));
        QVariantList columns = last(commits).toMap().value("columns").toList();
        auto second = columns[1].toMap();
        second["data_type"] = "int";
        columns[1] = second;
        call(table.get(), "setColumns", QVariantList{QVariant(columns)});
        table->setProperty("value", last(commits));

        call(table.get(), "addRow");
        QCOMPARE(json(last(commits).toMap().value("data")), QString(R"([["",0]])"));
        QVERIFY(call(table.get(), "setCell", {0, 1, "12"}).toBool());
        QCOMPARE(json(last(commits).toMap().value("data")), QString(R"([["",12]])"));

        // A header row maps pasted cells by name; rows go after the selection.
        call(table.get(), "toggleRow", {0, true});
        QVERIFY(call(table.get(), "pasteText", {"Column 2,Column 1\n5,\"a, b\"\n6,c"}).toBool());
        QCOMPARE(json(last(commits).toMap().value("data")), QString(R"([["",12],["a, b",5],["c",6]])"));
        QCOMPARE(table->property("status").toString(), QString("Pasted 2 rows"));
        QVERIFY(!call(table.get(), "pasteText", {"  "}).toBool());
        // The dialog's search keeps rows with a matching cell.
        table->setProperty("filterText", "A, B");
        QCOMPARE(order(table.get()), QVariantList({1}));
        table->setProperty("filterText", "");

        call(table.get(), "copyJson");
        QCOMPARE(QGuiApplication::clipboard()->text(), QString(R"([{"Column 1":"","Column 2":12},{"Column 1":"a, b","Column 2":5},{"Column 1":"c","Column 2":6}])"));
        call(table.get(), "copyCsv");
        QCOMPARE(QGuiApplication::clipboard()->text(), QString("\"Column 1\",\"Column 2\"\n\"\",\"12\"\n\"a, b\",\"5\"\n\"c\",\"6\""));

        // Deleting a column drops its cells from every row.
        QVERIFY(call(table.get(), "removeColumn", {0}).toBool());
        QCOMPARE(json(last(commits).toMap().value("data")), QString(R"([[12],[5],[6]])"));
        QCOMPARE(last(commits).toMap().value("columns").toList().size(), 1);
    }

    // ColumnsManager.tsx refuses a name another column holds.
    void columnsEditor() {
        QQmlComponent component(&engine_, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/ColumnsEditor.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        const QVariantList columns{QVariantMap{{"name", "a"}, {"data_type", "string"}}, QVariantMap{{"name", "b"}, {"data_type", "int"}, {"future", 3}}};
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({{"columns", columns}, {"writable", true}}));
        QVERIFY(editor);
        QSignalSpy commits(editor.get(), SIGNAL(columnsCommitted(QVariant)));
        QSignalSpy deletes(editor.get(), SIGNAL(columnDeleted(int)));
        QVERIFY(!call(editor.get(), "rename", {0, "b"}).toBool());
        QCOMPARE(commits.count(), 0);
        QVERIFY(call(editor.get(), "rename", {1, "c"}).toBool());
        QCOMPARE(last(commits).toList().at(1).toMap().value("future").toInt(), 3);
        call(editor.get(), "setType", {0, "float"});
        QCOMPARE(last(commits).toList().at(0).toMap().value("data_type").toString(), QString("float"));
        call(editor.get(), "setType", {0, "uuid"});
        QCOMPARE(commits.count(), 2);
        call(editor.get(), "remove", {1});
        QCOMPARE(deletes.count(), 1);
        QCOMPARE(deletes.first().first().toInt(), 1);
    }

    // RecordTypeProperty.tsx: Add column, and fields the editor does not know survive.
    void recordType() {
        const QVariantMap record{{"type", "record_type"}, {"columns", QVariantList{QVariantMap{{"name", "Column 1"}, {"data_type", "string"}}}}, {"future", 9}};
        auto editor = make("RecordTypeEditor.qml", {{"kind", "record_type"}}, record);
        QVERIFY(editor);
        QSignalSpy commits(editor.get(), SIGNAL(valueCommitted(QVariant)));
        call(editor.get(), "addColumn");
        const auto value = last(commits).toMap();
        QCOMPARE(value.value("future").toInt(), 9);
        QCOMPARE(value.value("columns").toList().at(1).toMap().value("name").toString(), QString("Column 2"));
    }

    // PropertyField picks the table for the constant List and Dict nodes and every
    // dataframe, and keeps the row editor for other lists.
    void propertyFieldRouting() {
        nodetool::node_editor::PropertyHost host;
        const auto mount = [&](const QVariantMap &descriptor) {
            QQmlComponent component(&engine_, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/PropertyField.qml"));
            if (!component.isReady()) { qWarning() << component.errorString(); return std::unique_ptr<QObject>{}; }
            return std::unique_ptr<QObject>(component.createWithInitialProperties({{"descriptor", descriptor}, {"host", QVariant::fromValue(&host)}, {"nodeId", "node-1"}}));
        };
        const auto field = [](const QString &kind, const QString &nodeType, const QVariant &value) {
            return QVariantMap{{"name", "value"}, {"kind", kind}, {"nodeType", nodeType}, {"value", value}, {"hasValue", true}, {"editable", true}};
        };
        auto list = mount(field("list", "nodetool.constant.List", QVariantList{1}));
        QVERIFY(list);
        QVERIFY(findNamed(list.get(), "data-table"));
        auto dict = mount(field("dict", "nodetool.constant.Dict", QVariantMap{{"a", 1}}));
        QVERIFY(findNamed(dict.get(), "data-table"));
        auto frame = mount(field("dataframe", "nodetool.constant.DataFrame", QVariantMap{{"type", "dataframe"}}));
        QVERIFY(findNamed(frame.get(), "data-table"));
        auto record = mount(field("record_type", "nodetool.data.FromList", QVariantMap{{"type", "record_type"}, {"columns", QVariantList{}}}));
        QVERIFY(findNamed(record.get(), "record-type-editor"));
        auto other = mount(field("list", "nodetool.text.Join", QVariantList{"a"}));
        QVERIFY(!findNamed(other.get(), "data-table"));
        QVERIFY(findNamed(other.get(), "structured-editor"));
    }
};

QTEST_MAIN(DataTableEditorTest)
#include "DataTableEditorTest.moc"
