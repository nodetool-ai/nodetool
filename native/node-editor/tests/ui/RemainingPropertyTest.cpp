#include "document/WorkflowDocument.h"
#include "properties/ResourcePickerController.h"
#include "properties/PropertyFields.h"
#include "properties/AssetPickerController.h"
#include "media/VideoFrameView.h"
#include <QDir>
#include <QJsonDocument>
#include <QJSValue>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickView>
#include <QTcpServer>
#include <QTcpSocket>
#include <QtTest>
#include <memory>

using namespace nodetool::node_editor;

class RemainingPropertyTest final : public QObject {
    Q_OBJECT
private:
    static QVariant unwrap(const QVariant& value) {
        return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant() : value;
    }
    static QQuickItem* find(QQuickItem* item, const QString& name) {
        if (item->objectName() == name) {
            return item;
        }
        for (auto* child : item->childItems()) {
            if (auto* result = find(child, name)) {
                return result;
            }
        }
        return nullptr;
    }
    static void click(QQuickView& view, QQuickItem* item) {
        QVERIFY(item);
        const auto point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2));
        QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier, point.toPoint());
    }
private slots:
    void initTestCase() {
        registerMediaTypes();
    }
    void documentAsset() {
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost));
        const QString id = "abcdef1234567890abcdef1234567890";
        QList<QByteArray> requests;
        connect(&server, &QTcpServer::newConnection, &server, [&] {
            auto* socket = server.nextPendingConnection();
            connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
                const auto request = socket->readAll();
                requests.append(request);
                const bool missing = request.contains("deleted");
                const QJsonObject data{{"assets", QJsonArray{QJsonObject{{"id", id}, {"name", "Guide.pdf"}, {"content_type", "application/pdf"}}}}, {"next_cursor", QJsonValue::Null}};
                const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
                socket->write(QByteArray("HTTP/1.1 ") + (missing ? "404 Missing" : "200 OK") + "\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
                socket->disconnectFromHost();
            });
        });
        const auto origin = QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort()));
        ResourcePickerController resources;
        AssetPickerController assets;
        resources.configure(origin, "secret", "owner");
        assets.configure(origin, "secret", "owner");
        QQuickView view;
        view.engine()->rootContext()->setContextProperty("resourcePickerController", &resources);
        view.engine()->rootContext()->setContextProperty("assetPickerController", &assets);
        const QJsonObject old{{"type", "document"}, {"asset_id", "deleted"}, {"uri", "asset://deleted"}, {"future", 7}};
        view.setInitialProperties({{"descriptor", QVariantMap{{"name", "value"}, {"kind", "document"}, {"mediaType", "document"}}}, {"value", old.toVariantMap()}, {"writable", true}, {"nodeId", "n"}});
        view.setSource(QUrl("qrc:/editor/AssetPropertyEditor.qml"));
        QVERIFY2(view.status() == QQuickView::Ready, qPrintable(view.errors().isEmpty() ? QString{} : view.errors().first().toString()));
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(480, 400);
        view.show();
        auto* root = view.rootObject();
        QTRY_VERIFY(root->property("documentStatus").toString().contains("unavailable"));
        QSignalSpy commits(root, SIGNAL(valueCommitted(QVariant)));
        click(view, find(root, "asset-refresh-value"));
        auto* select = find(root, "asset-select-value");
        QTRY_VERIFY(select->isEnabled());
        click(view, select);
        QTest::keyClick(&view, Qt::Key_Down);
        QTest::keyClick(&view, Qt::Key_Return);
        QTRY_COMPARE(commits.count(), 1);
        const auto selected = QJsonValue::fromVariant(unwrap(commits.first().first())).toObject();
        QCOMPARE(selected.value("asset_id").toString(), id);
        QCOMPARE(selected.value("future").toInt(), 7);
        WorkflowDocument document;
        document.setNodeMetadata({QJsonObject{{"node_type", "fixture"}, {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "document"}}}}}}}});
        QVERIFY(document.load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "fixture"}, {"data", QJsonObject{{"value", old}}}}}}, {"edges", QJsonArray{}}}}}));
        for (int iteration = 0; iteration < 2; ++iteration) {
            QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "value"}, {"value", selected}}));
            QCOMPARE(document.undoStack()->count(), 1);
        }
        document.undo();
        QCOMPARE(document.node("n").value("data").toObject().value("value").toObject(), old);
        const auto output = qEnvironmentVariable("NODETOOL_REMAINING_PROPERTY_CAPTURE_DIR");
        if (!output.isEmpty()) {
            QVERIFY(QDir().mkpath(output));
            for (const auto& scheme : {QString("dark"), QString("light")}) {
                auto* theme = view.engine()->singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
                theme->setProperty("preference", scheme == "dark" ? 2 : 3);
                view.setColor(theme->property("surfaceCanvas").value<QColor>());
                view.resize(480, qCeil(root->implicitHeight()));
                QTest::qWait(80);
                QVERIFY(view.grabWindow().save(QDir(output).filePath("document-" + scheme + ".png")));
            }
        }
        assets.configure({}, {}, {});
        QVERIFY(!root->property("searched").toBool());
        root->setProperty("writable", false);
        QVERIFY(!select->isEnabled());
    }
    void resources_data() {
        QTest::addColumn<QString>("kind");
        for (const auto& kind : {"font", "folder", "entity", "entity_list"}) {
            QTest::newRow(kind) << QString(kind);
        }
    }
    void resources() {
        QFETCH(QString, kind);
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost));
        const QString id = "1234567890abcdef1234567890abcdef";
        QList<QByteArray> requests;
        bool delay = false;
        QPointer<QTcpSocket> pending;
        const auto respond = [&](QTcpSocket* socket) {
            const QJsonObject marker{{"kind", "character"}, {"name", "Example"}, {"descriptor", "A character"}};
            const QJsonObject asset{{"id", id}, {"name", "Example"}, {"content_type", "folder"}, {"metadata", QJsonObject{{"nodetool_entity", marker}}}};
            const QJsonObject data = kind == "font" ? QJsonObject{{"fonts", QJsonArray{QJsonObject{{"name", "Example"}, {"portable", true}}}}} : QJsonObject{{"assets", QJsonArray{asset}}, {"next", QJsonValue::Null}};
            const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
            socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
            socket->disconnectFromHost();
        };
        connect(&server, &QTcpServer::newConnection, &server, [&] {
            auto* socket = server.nextPendingConnection();
            connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
                requests.append(socket->readAll());
                if (delay) {
                    pending = socket;
                } else {
                    respond(socket);
                }
            });
        });
        ResourcePickerController controller;
        const auto origin = QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort()));
        controller.configure(origin, "secret", "owner");
        QQuickView view;
        view.engine()->rootContext()->setContextProperty("resourcePickerController", &controller);
        const QJsonObject type = kind == "entity_list" ? QJsonObject{{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", "entity"}}}}} : QJsonObject{{"type", kind}};
        WorkflowDocument document;
        document.setNodeMetadata({QJsonObject{{"node_type", "fixture"}, {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", type}}}}}});
        const QJsonObject old{{"type", kind == "entity_list" ? "entity" : kind}, {kind == "font" ? "name" : kind == "folder" ? "asset_id" : "id", "deleted"}, {"future", 7}};
        const QJsonValue initial = kind == "entity_list" ? QJsonValue(QJsonArray{old}) : QJsonValue(old);
        QVERIFY(document.load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "fixture"}, {"data", QJsonObject{{"value", initial}}}}}}, {"edges", QJsonArray{}}}}}));
        view.setInitialProperties({{"descriptor", QVariantMap{{"name", "value"}, {"kind", kind}}}, {"value", initial.toVariant()}, {"writable", true}, {"nodeId", "n"}});
        view.setSource(QUrl("qrc:/editor/RemainingResourcePropertyEditor.qml"));
        QVERIFY2(view.status() == QQuickView::Ready, qPrintable(view.errors().isEmpty() ? QString{} : view.errors().first().toString()));
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(480, 400);
        view.show();
        auto* root = view.rootObject();
        QTRY_VERIFY(root->property("loaded").toBool());
        QVERIFY(!requests.isEmpty());
        QVERIFY(requests.first().contains(kind == "font" ? "/trpc/fonts.list?" : kind == "folder" ? "/trpc/assets.list?" : "/trpc/assets.search?"));
        QVERIFY(requests.first().contains("Authorization: Bearer secret"));
        QCOMPARE(unwrap(root->property("missingTargets")).toList().size(), 1);
        QSignalSpy commits(root, SIGNAL(valueCommitted(QVariant)));
        const bool entity = kind.startsWith("entity");
        auto* select = find(root, entity ? "entity-picker-open" : "remaining-select-value");
        QVERIFY(select);
        click(view, select);
        if (entity) {
            QTRY_VERIFY(find(view.contentItem(), "entity-card-0"));
            QTest::qWait(80);
            click(view, find(view.contentItem(), "entity-card-0"));
        } else {
            QTest::keyClick(&view, Qt::Key_Down);
            QTest::keyClick(&view, Qt::Key_Return);
        }
        QTRY_COMPARE(commits.count(), 1);
        const auto selected = QJsonValue::fromVariant(unwrap(commits.last().first()));
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "value"}, {"value", selected}}));
        QCOMPARE(document.undoStack()->count(), 1);
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "value"}, {"value", selected}}));
        QCOMPARE(document.undoStack()->count(), 1);
        document.undo();
        QCOMPARE(document.node("n").value("data").toObject().value("value"), initial);
        document.redo();
        root->setProperty("value", selected.toVariant());
        QTRY_VERIFY(root->property("loaded").toBool());
        select->forceActiveFocus();
        if (entity) {
            QTest::keyClick(&view, Qt::Key_Return);
            auto* card = find(view.contentItem(), "entity-card-0");
            QVERIFY(card);
            card->forceActiveFocus();
            QTest::keyClick(&view, Qt::Key_Return);
        } else {
            QTest::keyClick(&view, Qt::Key_Home);
        }
        QCOMPARE(commits.count(), 1);
        root->setProperty("value", initial.toVariant());
        QTRY_VERIFY(root->property("loaded").toBool());
        select->forceActiveFocus();
        if (entity) {
            QTest::keyClick(&view, Qt::Key_Return);
            auto* card = find(view.contentItem(), "entity-card-0");
            QVERIFY(card);
            card->forceActiveFocus();
            QTest::keyClick(&view, Qt::Key_Space);
        } else {
            QTest::keyClick(&view, Qt::Key_Home);
        }
        QTRY_COMPARE(commits.count(), 2);
        QCOMPARE(QJsonValue::fromVariant(unwrap(commits.last().first())), selected);
        root->setProperty("value", selected.toVariant());
        QTRY_VERIFY(root->property("loaded").toBool());
        if (kind != "entity_list") {
            QCOMPARE(selected.toObject().value("future").toInt(), 7);
        } else {
            QCOMPARE(selected.toArray().first(), old);
        }
        const auto output = qEnvironmentVariable("NODETOOL_REMAINING_PROPERTY_CAPTURE_DIR");
        if (!output.isEmpty()) {
            QVERIFY(QDir().mkpath(output));
            for (const auto& scheme : {QString("dark"), QString("light")}) {
                auto theme = view.engine()->singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
                QVERIFY(theme);
                theme->setProperty("preference", scheme == "dark" ? 2 : 3);
                view.setColor(theme->property("surfaceCanvas").value<QColor>());
                view.resize(480, qCeil(root->implicitHeight()));
                QTest::qWait(80);
                QVERIFY(view.grabWindow().save(QDir(output).filePath(kind + "-" + scheme + ".png")));
                if (entity || kind == "folder") {
                    view.resize(480, 400);
                    click(view, find(root, entity ? "entity-picker-open" : "folder-create-open"));
                    QTest::qWait(80);
                    QVERIFY(view.grabWindow().save(QDir(output).filePath(kind + "-picker-" + scheme + ".png")));
                    QTest::keyClick(&view, Qt::Key_Escape);
                }
            }
        }
        delay = true;
        root->setProperty("value", initial.toVariant());
        QTRY_VERIFY(pending);
        controller.configure(origin, "new-token", "new-owner");
        if (pending && pending->state() == QAbstractSocket::ConnectedState) {
            respond(pending);
        }
        QTest::qWait(50);
        QVERIFY(!root->property("loaded").toBool());
        QCOMPARE(unwrap(root->property("resources")).toList().size(), 0);
        QCOMPARE(commits.count(), 2);
        QCOMPARE(document.node("n").value("data").toObject().value("value"), selected);
        QCOMPARE(document.undoStack()->count(), 1);
        root->setProperty("writable", false);
        QVERIFY(!select->isEnabled());
    }
    void fileReferenceDisplay() {
        QQuickView view;
        const QString id = "1234567890abcdef1234567890abcdef";
        view.setInitialProperties({{"value", QVariantMap{{"id", id}, {"future", 7}}}});
        view.setSource(QUrl("qrc:/editor/FilePropertyEditor.qml"));
        QVERIFY(view.status() == QQuickView::Ready);
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(480, 40);
        view.show();
        QCOMPARE(view.rootObject()->property("text").toString(), id);
        const auto output = qEnvironmentVariable("NODETOOL_REMAINING_PROPERTY_CAPTURE_DIR");
        if (!output.isEmpty()) {
            QVERIFY(QDir().mkpath(output));
            for (const auto& scheme : {QString("dark"), QString("light")}) {
                auto* theme = view.engine()->singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
                theme->setProperty("preference", scheme == "dark" ? 2 : 3);
                view.setColor(theme->property("surfaceCanvas").value<QColor>());
                QTest::qWait(80);
                QVERIFY(view.grabWindow().save(QDir(output).filePath("file-" + scheme + ".png")));
            }
        }
    }
    void localEditors_data() {
        QTest::addColumn<QString>("kind");
        for (const auto& kind : {"file_path", "folder_path", "tools", "media_duration", "media_strength", "media_resolution_image", "media_resolution_video", "media_aspect_ratio_image", "media_aspect_ratio_video"}) {
            QTest::newRow(kind) << QString(kind);
        }
    }
    void localEditors() {
        QFETCH(QString, kind);
        const bool path = kind.endsWith("_path");
        const bool tools = kind == "tools";
        QQuickView view;
        const auto component = path ? "PathPropertyEditor" : tools ? "ToolsPropertyEditor" : "MediaParameterPropertyEditor";
        view.setInitialProperties({{"descriptor", QVariantMap{{"name", "value"}, {"kind", kind}}}, {"value", path ? QVariant("/previous") : tools ? QVariant(QVariantList{}) : QVariant()}, {"writable", true}});
        view.setSource(QUrl(QString("qrc:/editor/%1.qml").arg(component)));
        QVERIFY2(view.status() == QQuickView::Ready, qPrintable(view.errors().isEmpty() ? QString{} : view.errors().first().toString()));
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(480, 400);
        view.show();
        auto* root = view.rootObject();
        QSignalSpy commits(root, SIGNAL(valueCommitted(QVariant)));
        if (path) {
            root->setProperty("dialogProvider", QVariant::fromValue(view.engine()->evaluate("(function() { return 'file:///tmp/selected%20path'; })")));
            click(view, find(root, "path-browse-value"));
        } else if (tools) {
            click(view, find(root, "tools-menu"));
            QTRY_VERIFY(find(view.contentItem(), "tool-toggle-0"));
            click(view, find(view.contentItem(), "tool-toggle-0"));
        } else {
            click(view, find(root, "media-parameter-select-value"));
            QTRY_VERIFY(find(view.contentItem(), "chip-option-0"));
            click(view, find(view.contentItem(), "chip-option-0"));
        }
        QTRY_COMPARE(commits.count(), 1);
        if (!path) {
            auto* trigger = find(root, tools ? "tools-menu" : "media-parameter-select-value");
            trigger->forceActiveFocus();
            QTest::keyClick(&view, Qt::Key_Return);
            QTest::keyClick(&view, Qt::Key_Down);
            QTest::keyClick(&view, Qt::Key_Return);
            QTRY_COMPARE(commits.count(), 2);
        }
        if (path) {
            QCOMPARE(unwrap(commits.first().first()).toString(), "/tmp/selected path");
            const auto epoch = root->property("generation");
            QVERIFY(QMetaObject::invokeMethod(root, "resetScope"));
            QVERIFY(QMetaObject::invokeMethod(root, "acceptPath", Q_ARG(QVariant, "file:///tmp/stale"), Q_ARG(QVariant, epoch)));
            QCOMPARE(commits.count(), 1);
        }
        const auto selected = QJsonValue::fromVariant(unwrap(commits.first().first()));
        root->setProperty("value", selected.toVariant());
        QJsonObject type{{"type", path ? kind : tools ? "list" : "str"}};
        if (tools) {
            type.insert("type_args", QJsonArray{QJsonObject{{"type", "tool_name"}}});
        }
        QJsonObject declaration{{"name", "value"}, {"type", type}};
        if (!path && !tools) {
            declaration.insert("json_schema_extra", QJsonObject{{"type", kind}});
        }
        WorkflowDocument document;
        document.setNodeMetadata({QJsonObject{{"node_type", "fixture"}, {"properties", QJsonArray{declaration}}}});
        QVERIFY(document.load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "fixture"}, {"data", QJsonObject{}}}}}, {"edges", QJsonArray{}}}}}));
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "value"}, {"value", selected}}));
        QCOMPARE(document.undoStack()->count(), 1);
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "value"}, {"value", selected}}));
        QCOMPARE(document.undoStack()->count(), 1);
        document.undo();
        QVERIFY(document.node("n").value("data").toObject().isEmpty());
        const auto output = qEnvironmentVariable("NODETOOL_REMAINING_PROPERTY_CAPTURE_DIR");
        if (!output.isEmpty()) {
            QVERIFY(QDir().mkpath(output));
            for (const auto& scheme : {QString("dark"), QString("light")}) {
                auto* theme = view.engine()->singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
                theme->setProperty("preference", scheme == "dark" ? 2 : 3);
                view.setColor(theme->property("surfaceCanvas").value<QColor>());
                view.resize(480, qCeil(root->implicitHeight()));
                QTest::qWait(80);
                QVERIFY(view.grabWindow().save(QDir(output).filePath(kind + "-" + scheme + ".png")));
                if (!path) {
                    view.resize(480, 400);
                    click(view, find(root, tools ? "tools-menu" : "media-parameter-select-value"));
                    QTest::qWait(80);
                    QVERIFY(view.grabWindow().save(QDir(output).filePath(kind + "-menu-" + scheme + ".png")));
                    QTest::keyClick(&view, Qt::Key_Escape);
                }
            }
        }
        root->setProperty("writable", false);
    }
};
QTEST_MAIN(RemainingPropertyTest)
#include "RemainingPropertyTest.moc"
