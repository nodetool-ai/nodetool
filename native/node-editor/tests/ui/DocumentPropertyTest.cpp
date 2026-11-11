#include "properties/DocumentPickerController.h"
#include "document/WorkflowDocument.h"
#include "ui/EditorWindow.h"
#include "properties/AssetPickerController.h"
#include <QQuickWidget>
#include <QDropEvent>
#include <QDragEnterEvent>
#include <QMimeData>
#include <QTemporaryDir>
#include <QFile>
#include <QtTest>
#include <QTcpServer>
#include <QTcpSocket>
#include <QQmlEngine>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQuickWindow>
#include <QQuickItem>
#include <QJSValue>
#include <QDesktopServices>
#include <QDir>
#include <QJsonDocument>
#include <QBuffer>
#include <QImage>
#include <QPainter>
#include <memory>

using namespace nodetool::node_editor;
class DocumentPropertyTest final : public QObject {
    Q_OBJECT
public slots:
    void receiveUrl(const QUrl& url) { opened_ = url; }
private:
    QUrl opened_;
    static QVariant unwrap(const QVariant& value) {
        return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant() : value;
    }
    static QQuickItem* find(QQuickItem* root, const QString& name) {
        if (root->objectName() == name) { return root; }
        for (auto* child : root->childItems()) {
            if (auto* result = find(child, name)) { return result; }
        }
        return nullptr;
    }
    static QQuickItem* findImage(QQuickItem* root) {
        if (QString::fromLatin1(root->metaObject()->className()) == "QQuickImage") { return root; }
        for (auto* child : root->childItems()) {
            if (auto* result = findImage(child)) { return result; }
        }
        return nullptr;
    }
    static QString imageStatus(QQuickItem* image) {
        const auto* meta = image->metaObject();
        const auto property = meta->property(meta->indexOfProperty("status"));
        return QString::fromLatin1(property.enumerator().valueToKey(property.read(image).toInt()));
    }
private slots:
    void inspectorModelAndTabClose() {
        using nodetool::EditorWindow;
        const QString assetId = "1234567890abcdef1234567890abcdef";
        QByteArray thumbnail;
        {
            QImage image(64, 48, QImage::Format_ARGB32);
            image.fill(QColor(40, 90, 160));
            QPainter painter(&image);
            painter.fillRect(QRect(32, 0, 32, 48), QColor(230, 140, 40));
            painter.end();
            QBuffer buffer(&thumbnail);
            QVERIFY(buffer.open(QIODevice::WriteOnly));
            QVERIFY(image.save(&buffer, "PNG"));
        }
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost));
        QList<QPointer<QTcpSocket>> pending;
        bool delay = false;
        int uploads = 0;
        connect(&server, &QTcpServer::newConnection, &server, [&] {
            auto* socket = server.nextPendingConnection();
            connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
                auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
                socket->setProperty("bytes", bytes);
                const auto end = bytes.indexOf("\r\n\r\n");
                if (end < 0 || socket->property("done").toBool()) { return; }
                int length = 0;
                for (const auto& line : bytes.left(end).split('\n')) {
                    if (line.toLower().startsWith("content-length:")) { length = line.mid(15).trimmed().toInt(); }
                }
                if (bytes.size() < end + 4 + length) { return; }
                socket->setProperty("done", true);
                if (delay && bytes.contains("sketch.list")) {
                    pending.append(socket);
                    return;
                }
                if (bytes.startsWith("GET /thumbs/model.png ")) {
                    socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: image/png\r\nContent-Length: " + QByteArray::number(thumbnail.size()) + "\r\n\r\n" + thumbnail);
                    socket->disconnectFromHost();
                    return;
                }
                QJsonObject response;
                if (bytes.startsWith("POST /api/assets ")) {
                    ++uploads;
                    QVERIFY(bytes.contains("model.glb"));
                    QVERIFY(bytes.contains("glTF"));
                    response = {{"id", assetId}, {"name", "model.glb"}, {"content_type", "model/gltf-binary"}};
                } else if (bytes.contains("assets.get")) {
                    response = {{"result", QJsonObject{{"data", QJsonObject{{"id", assetId}, {"name", "model.glb"}, {"content_type", "model/gltf-binary"}, {"thumb_url", "/thumbs/model.png"}}}}}};
                } else {
                    const QJsonArray rows{QJsonObject{{"id", assetId}, {"name", "Sketch"}}};
                    response = {{"result", QJsonObject{{"data", rows}}}};
                }
                const auto body = QJsonDocument(response).toJson(QJsonDocument::Compact);
                socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
                socket->disconnectFromHost();
            });
        });
        const QUrl origin(QString("http://127.0.0.1:%1").arg(server.serverPort()));
        EditorWindow window;
        window.resize(1100, 850);
        const auto load = [&](const QString& kind) {
            window.setCatalog({QJsonObject{{"node_type", "fixture.Doc"}, {"title", "Document"}, {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"required", true}, {"type", QJsonObject{{"type", kind}}}}}}}});
            return window.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "fixture.Doc"}, {"data", QJsonObject{}}}}}, {"edges", QJsonArray{}}}}});
        };
        QVERIFY(load("model_3d"));
        window.show();
        QVERIFY(window.selectNode("n"));
        QQuickWidget* panel = nullptr;
        const auto control = [&](const QString& name) -> QQuickItem* {
            for (auto* widget : window.findChildren<QQuickWidget*>()) {
                if (widget->rootObject()) {
                    if (auto* found = find(widget->rootObject(), name)) {
                        panel = widget;
                        return found;
                    }
                }
            }
            return nullptr;
        };
        const auto click = [&](const QString& name) {
            auto* item = control(name);
            if (!item) { return false; }
            QTest::mouseClick(panel->quickWindow(), Qt::LeftButton, Qt::NoModifier, item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
            return true;
        };
        QTRY_VERIFY(control("model3d-toggle-url"));
        auto* assets = qobject_cast<AssetPickerController*>(panel->engine()->rootContext()->contextProperty("assetPickerController").value<QObject*>());
        QVERIFY(assets);
        assets->configure(origin, {}, "owner");
        QVERIFY(click("model3d-toggle-url"));
        QVERIFY(click("model3d-url"));
        QTest::keyClicks(panel, "https://example.org/model.glb");
        QTest::keyClick(panel->quickWindow(), Qt::Key_Return);
        const QJsonObject urlRef{{"uri", "https://example.org/model.glb"}, {"type", "model_3d"}};
        QTRY_COMPARE(window.document()->node("n")["data"].toObject()["value"].toObject(), urlRef);
        QCOMPARE(window.document()->undoStack()->count(), 1);
        QTest::keyClick(panel->quickWindow(), Qt::Key_Return);
        QCoreApplication::processEvents();
        QCOMPARE(window.document()->undoStack()->count(), 1);
        window.document()->undo();
        QTRY_VERIFY(!window.document()->node("n")["data"].toObject().contains("value"));
        const auto capture = [&](const QString& state) {
            const auto dir = qEnvironmentVariable("NODETOOL_DOCUMENT_PROPERTY_CAPTURE_DIR");
            if (dir.isEmpty()) { return; }
            QVERIFY(QDir().mkpath(dir));
            for (bool dark : {true, false}) {
                window.setDarkTheme(dark);
                QTest::qWait(80);
                QVERIFY(panel->grab().save(dir + "/model3d-" + state + (dark ? "-dark.png" : "-light.png")));
            }
        };
        capture("empty");
        QTemporaryDir files;
        QFile file(files.filePath("model.glb"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write("glTF");
        file.close();
        auto* drop = control("model3d-drop");
        QVERIFY(drop);
        const auto point = drop->mapToScene(QPointF(drop->width() / 2, drop->height() / 2)).toPoint();
        QMimeData mime;
        mime.setUrls({QUrl::fromLocalFile(file.fileName())});
        QDragEnterEvent enter(QPointF(point), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(panel, &enter);
        QDragMoveEvent move(QPointF(point), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(panel, &move);
        QDropEvent dropped(point, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(panel, &dropped);
        QTRY_COMPARE(uploads, 1);
        const QJsonObject uploaded{{"type", "model_3d"}, {"uri", "asset://" + assetId}, {"asset_id", assetId}};
        QTRY_COMPARE(window.document()->node("n")["data"].toObject()["value"].toObject(), uploaded);
        QTRY_COMPARE(control("model3d-preview-name")->property("text").toString(), QString("model.glb"));
        const auto thumbnailImage = [&] {
            auto* drop = control("model3d-drop");
            return drop ? findImage(drop) : nullptr;
        };
        QTRY_VERIFY(thumbnailImage() && imageStatus(thumbnailImage()) == "Ready");
        QCOMPARE(thumbnailImage()->property("source").toUrl().path(), QString("/thumbs/model.png"));
        QVERIFY(thumbnailImage()->width() > 0);
        QVERIFY(thumbnailImage()->height() > 0);
        capture("filled");
        const auto undoCount = window.document()->undoStack()->count();
        QDragEnterEvent repeatEnter(QPointF(point), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(panel, &repeatEnter);
        QDragMoveEvent repeatMove(QPointF(point), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(panel, &repeatMove);
        QDropEvent repeatDrop(point, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(panel, &repeatDrop);
        QTRY_COMPARE(uploads, 2);
        QTest::qWait(30);
        QCOMPARE(window.document()->undoStack()->count(), undoCount);
        window.document()->undo();
        QVERIFY(!window.document()->node("n")["data"].toObject().contains("value"));
        window.document()->redo();
        QCOMPARE(window.document()->node("n")["data"].toObject()["value"].toObject(), uploaded);
        window.document()->undoStack()->setClean();
        window.newTab();
        QVERIFY(load("sketch"));
        QVERIFY(window.selectNode("n"));
        QTRY_VERIFY(control("document-select"));
        auto* documents = qobject_cast<DocumentPickerController*>(panel->engine()->rootContext()->contextProperty("documentPickerController").value<QObject*>());
        QVERIFY(documents);
        documents->configure(origin, {}, "owner");
        delay = true;
        auto* docField = control("document-select")->parentItem()->parentItem();
        QVERIFY(QMetaObject::invokeMethod(docField, "refresh"));
        QTRY_VERIFY(!pending.isEmpty());
        const auto loadingOptions = unwrap(control("document-select")->property("options")).toList();
        QVERIFY(!loadingOptions.isEmpty());
        QCOMPARE(loadingOptions.first().toMap().value("label").toString(), QString("Loading…"));
        QCOMPARE(loadingOptions.first().toMap().value("enabled").toBool(), false);
        QVERIFY(!control("document-create"));
        QVERIFY(!control("document-refresh"));
        QVERIFY(!control("document-status"));
        window.document()->undoStack()->setClean();
        QVERIFY(window.closeTab(window.activeTab()));
        for (auto socket : pending) {
            if (socket) {
                socket->write("HTTP/1.1 200 OK\r\nContent-Length: 22\r\n\r\n{\"result\":{\"data\":[]}}");
                socket->disconnectFromHost();
            }
        }
        QTest::qWait(30);
        QCOMPARE(window.document()->node("n")["data"].toObject()["value"].toObject(), uploaded);
    }
    void documents_data() {
        QTest::addColumn<QString>("kind");
        for (const auto& kind : {"sketch", "timeline", "script", "storyboard"}) {
            QTest::newRow(kind) << QString(kind);
        }
    }
    void documents() {
        QFETCH(QString, kind);
        const QString first = "1234567890abcdef1234567890abcdef";
        const QString second = "abcdef1234567890abcdef1234567890";
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost));
        QList<QByteArray> requests;
        bool missing = false;
        bool fail = false;
        bool delay = false;
        QList<QPointer<QTcpSocket>> pending;
        const auto row = [&](QString id) {
            return QJsonObject{{"id", id}, {"name", "Example " + kind}, {"projectId", "default"}, {"updatedAt", "2026-01-01T00:00:00Z"}};
        };
        connect(&server, &QTcpServer::newConnection, &server, [&] {
            auto* socket = server.nextPendingConnection();
            // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
            auto buffer = std::make_shared<QByteArray>();
            connect(socket, &QTcpSocket::readyRead, socket, [&, socket, buffer] {
                *buffer += socket->readAll();
                const auto end = buffer->indexOf("\r\n\r\n");
                if (end < 0) { return; }
                const auto header = buffer->left(end).toLower();
                const auto lengthIndex = header.indexOf("content-length: ");
                const auto length = lengthIndex < 0 ? 0 : header.mid(lengthIndex + 16).split('\r').first().toInt();
                if (buffer->size() < end + 4 + length) { return; }
                requests.append(*buffer);
                if (delay) {
                    pending.append(socket);
                    buffer->clear();
                    return;
                }
                const QJsonValue data = missing ? QJsonArray{} : QJsonArray{row(first), row(second)};
                const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
                socket->write(QByteArray("HTTP/1.1 ") + (fail ? "500 Failed" : "200 OK") + "\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
                socket->disconnectFromHost();
                buffer->clear();
            });
        });
        const QUrl origin(QString("http://127.0.0.1:%1").arg(server.serverPort()));
        DocumentPickerController controller;
        controller.configure(origin, "secret", "owner");
        QQmlEngine engine;
        engine.rootContext()->setContextProperty("documentPickerController", &controller);
        QQmlComponent component(&engine, QUrl("qrc:/editor/DocumentPropertyEditor.qml"));
        QTRY_VERIFY(component.status() != QQmlComponent::Loading);
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        const QVariantMap descriptor{{"name", "document"}, {"dataType", QVariantMap{{"type", kind}}}};
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"descriptor", descriptor}, {"value", QVariantMap{}}, {"writable", true}, {"nodeId", "n"}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(item);
        QQuickWindow window;
        window.resize(480, 220);
        item->setParentItem(window.contentItem());
        item->setWidth(460);
        item->setX(10);
        item->setY(10);
        window.show();
        QTRY_VERIFY(object->property("loaded").toBool());
        QCOMPARE(object->property("state").toString(), "empty");
        auto* select = find(item, "document-select");
        QVERIFY(select);
        QCOMPARE(select->property("accessibleName").toString(), "Select " + kind);
        QVERIFY(!find(item, "document-open")->isEnabled());
        QCOMPARE(find(item, "document-open")->property("accessibleName").toString(), "Open in " + kind + " editor");
        const auto freshRequests = requests.size();
        QSignalSpy commits(object.get(), SIGNAL(valueCommitted(QVariant)));
        WorkflowDocument document;
        document.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{QJsonObject{{"name", "document"}, {"type", QJsonObject{{"type", kind}}}}}}}});
        const QJsonObject prior{{"type", kind}, {"id", first}, {"future", 7}};
        QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"document", prior}}}}}}, {"edges", QJsonArray{}}}}}));
        object->setProperty("value", prior.toVariantMap());
        QTRY_VERIFY(!object->property("loading").toBool());
        const auto click = [&](const QString& name) {
            auto* control = find(item, name);
            if (!control) { return false; }
            QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, control->mapToScene(QPointF(control->width() / 2, control->height() / 2)).toPoint());
            return true;
        };
        QVERIFY(click("document-select"));
        QTest::keyClick(&window, Qt::Key_Down);
        QTest::keyClick(&window, Qt::Key_Return);
        QTRY_COMPARE(commits.count(), 1);
        auto reference = QJsonObject::fromVariantMap(unwrap(commits.last().first()).toMap());
        QCOMPARE(reference.value("id").toString(), second);
        QVERIFY(!reference.contains("future"));
        QCOMPARE(reference, (kind == "storyboard" ? QJsonObject{{"type", kind}, {"id", second}, {"data", QJsonValue::Null}} : QJsonObject{{"type", kind}, {"id", second}}));
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "document"}, {"value", reference}}));
        QCOMPARE(document.undoStack()->count(), 1);
        document.undo();
        QCOMPARE(document.node("n").value("data").toObject().value("document").toObject(), prior);
        document.redo();
        object->setProperty("value", reference.toVariantMap());
        QTRY_VERIFY(!object->property("loading").toBool());
        // A real pointer selection of the current row must emit no commit.
        QVERIFY(click("document-select"));
        QTest::keyClick(&window, Qt::Key_Return);
        QCoreApplication::processEvents();
        QCOMPARE(commits.count(), 1);
        QDesktopServices::setUrlHandler("http", this, "receiveUrl");
        QVERIFY(click("document-open"));
        QTRY_COMPARE(opened_, controller.targetUrl(kind, second));
        const QString prefix = kind == "script" || kind == "storyboard" ? "/studio/" : "/";
        QCOMPARE(opened_.path(), prefix + kind + "/" + second);
        QDesktopServices::unsetUrlHandler("http");
        QVERIFY(!find(item, "document-create"));
        QVERIFY(!find(item, "document-refresh"));
        QVERIFY(!find(item, "document-status"));
        QCOMPARE(requests.size(), freshRequests);
        missing = true;
        object->setProperty("fetchedAt", 0);
        QVERIFY(click("document-select"));
        QTest::keyClick(&window, Qt::Key_Escape);
        QTRY_COMPARE(object->property("state").toString(), "missing");
        QCOMPARE(select->property("displayText").toString(), QString{});
        QVERIFY(find(item, "document-open")->isEnabled());
        QCOMPARE(unwrap(object->property("value")).toMap().value("id").toString(), second);
        QCOMPARE(commits.count(), 1);
        missing = false;
        object->setProperty("fetchedAt", 0);
        QVERIFY(click("document-select"));
        QTest::keyClick(&window, Qt::Key_Escape);
        QTRY_VERIFY(!object->property("loading").toBool());
        const auto directory = qEnvironmentVariable("NODETOOL_DOCUMENT_PROPERTY_CAPTURE_DIR");
        if (!directory.isEmpty()) {
            QVERIFY(QDir().mkpath(directory));
            nodetool::EditorWindow host;
            host.resize(1100, 850);
            const QJsonObject field{{"name", "document"}, {"required", true}, {"type", QJsonObject{{"type", kind}}}};
            host.setCatalog({QJsonObject{{"node_type", "test"}, {"title", "Document"}, {"properties", QJsonArray{field}}}});
            QVERIFY(host.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"document", reference}}}}}}, {"edges", QJsonArray{}}}}}));
            host.show();
            QVERIFY(host.selectNode("n"));
            QQuickWidget* inspector = nullptr;
            QTRY_VERIFY(([&] {
                for (auto* widget : host.findChildren<QQuickWidget*>()) {
                    if (widget->rootObject() && find(widget->rootObject(), "document-select")) {
                        inspector = widget;
                        return true;
                    }
                }
                return false;
            })());
            auto* picker = qobject_cast<DocumentPickerController*>(inspector->engine()->rootContext()->contextProperty("documentPickerController").value<QObject*>());
            QVERIFY(picker);
            picker->configure(origin, "secret", "owner");
            auto* hostSelect = find(inspector->rootObject(), "document-select");
            QVERIFY(QMetaObject::invokeMethod(hostSelect->parentItem()->parentItem(), "refresh"));
            QTRY_COMPARE(hostSelect->property("displayText").toString(), "Example " + kind);
            for (bool dark : {true, false}) {
                host.setDarkTheme(dark);
                QTest::qWait(80);
                QVERIFY(inspector->grab().save(directory + "/" + kind + (dark ? "-dark.png" : "-light.png")));
            }
        }
        fail = true;
        object->setProperty("fetchedAt", 0);
        QVERIFY(click("document-select"));
        QTest::keyClick(&window, Qt::Key_Escape);
        QTRY_COMPARE(object->property("state").toString(), "error");
        const auto options = unwrap(select->property("options")).toList();
        QVERIFY(!options.first().toMap().value("enabled").toBool());
        QVERIFY(options.first().toMap().value("label").toString().startsWith("Error:"));
        fail = false;
        delay = true;
        QSignalSpy listed(&controller, &DocumentPickerController::listed);
        QSignalSpy failed(&controller, &DocumentPickerController::failed);
        controller.load("stale", kind);
        QTRY_VERIFY(!pending.isEmpty());
        controller.configure(origin, "other", "other-owner");
        QTest::qWait(30);
        QCOMPARE(listed.count(), 0);
        QCOMPARE(failed.count(), 0);
        // Deliver a prior field-generation result after changing the field.
        const auto oldKey = object->property("key").toString();
        object->setProperty("nodeId", "other-node");
        controller.listed(oldKey, {row(first).toVariantMap()});
        QCOMPARE(unwrap(object->property("rows")).toList().size(), 0);
        QCOMPARE(commits.count(), 1);
        for (const auto& request : requests) {
            QVERIFY(request.startsWith("GET "));
            QVERIFY(request.contains("Authorization: Bearer secret"));
            QVERIFY(request.toLower().contains("x-user-id: owner"));
        }
    }
};
QTEST_MAIN(DocumentPropertyTest)
#include "DocumentPropertyTest.moc"
