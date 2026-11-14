// ExampleGallery and ExamplesPanel.qml on their own: the web left panel's
// Examples view (web/src/components/examples/ExamplesPanel.tsx and
// useExampleGroups.ts), limited to workflow examples. Links the QML module
// and the media QML types, so it builds in the components-only configuration.
#include "interfaces/ExampleGallery.h"
#include "media/VideoFrameView.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QTcpServer>
#include <QTcpSocket>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)
Q_IMPORT_QML_PLUGIN(NodeTool_ModelPickerPlugin)

using namespace nodetool::node_editor;

namespace {

QQuickItem *named(QObject *root, const QString &name) {
    if (root->objectName() == name) { return qobject_cast<QQuickItem *>(root); }
    if (auto *item = qobject_cast<QQuickItem *>(root)) {
        for (auto *child : item->childItems()) {
            if (auto *found = named(child, name)) { return found; }
        }
    }
    for (auto *child : root->children()) {
        if (auto *found = named(child, name)) { return found; }
    }
    return nullptr;
}

void click(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QVERIFY(item->isVisible());
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier, item->mapToScene({item->width() / 2, item->height() / 2}).toPoint());
}

QJsonObject workflow(const QString &id, const QString &name, const QStringList &tags, const QString &description = {}, int nodes = 2) {
    QJsonArray graphNodes;
    for (int i = 0; i < nodes; ++i) { graphNodes.append(QJsonObject{{"id", QString::number(i)}}); }
    return {{"id", id},
            {"name", name},
            {"description", description},
            {"package_name", "nodetool-base"},
            {"tags", QJsonArray::fromStringList(tags)},
            {"thumbnail_url", "/api/workflows/examples/thumbnails/" + name + ".jpg"},
            {"graph", QJsonObject{{"nodes", graphNodes}, {"edges", QJsonArray{}}}}};
}

QJsonArray serverExamples() {
    return {workflow("compare.json", "Image Comparison", {"image"}, "Compare two images side by side"),
            workflow("Flux Text To Image", "Flux Text To Image", {"comfy", "image"}),
            workflow("summarize.json", "Summarize", {"text"}, {}, 1)};
}

QVariantList bundled() {
    return {QVariantMap{{"resource", ":/editor/examples/live-synth.json"}, {"name", "Live Synth in a Room"},
                        {"description", "Play a synth"}, {"tags", QStringList{"audio"}}},
            QVariantMap{{"resource", ":/editor/examples/fix-a-flat-image.json"}, {"name", "Fix a Flat Image"},
                        {"description", ""}, {"tags", QStringList{"image"}}}};
}

QStringList keys(const ExampleGallery &gallery) {
    QStringList result;
    for (const auto &row : gallery.rows()) { result.append(row.toMap()["key"].toString()); }
    return result;
}

// One-request-at-a-time HTTP server that records each request and answers
// with the queued body.
class FakeServer : public QObject {
public:
    struct Request { QByteArray method, target, body, user; };
    FakeServer() {
        QVERIFY(server_.listen(QHostAddress::LocalHost));
        connect(&server_, &QTcpServer::newConnection, this, [this] {
            while (auto *socket = server_.nextPendingConnection()) {
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] { read(socket); });
            }
        });
    }
    QUrl origin() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(server_.serverPort())); }
    QList<Request> requests;
    QList<QPair<int, QByteArray>> responses;

private:
    void read(QTcpSocket *socket) {
        auto &buffer = buffers_[socket];
        buffer += socket->readAll();
        const auto end = buffer.indexOf("\r\n\r\n");
        if (end < 0) { return; }
        const auto head = buffer.left(end);
        qsizetype length = 0;
        QByteArray user;
        for (const auto &line : head.split('\n')) {
            const auto lower = line.trimmed().toLower();
            if (lower.startsWith("content-length:")) { length = lower.mid(15).trimmed().toLongLong(); }
            if (lower.startsWith("x-user-id:")) { user = line.trimmed().mid(10).trimmed(); }
        }
        if (buffer.size() < end + 4 + length) { return; }
        const auto first = head.left(head.indexOf("\r\n")).split(' ');
        requests.append({first.value(0), first.value(1), buffer.mid(end + 4, length), user});
        buffer.clear();
        const auto response = responses.isEmpty() ? qMakePair(500, QByteArray("{}")) : responses.takeFirst();
        socket->write("HTTP/1.1 " + QByteArray::number(response.first) + " X\r\nContent-Type: application/json\r\nContent-Length: " +
                      QByteArray::number(response.second.size()) + "\r\nConnection: close\r\n\r\n" + response.second);
        socket->disconnectFromHost();
    }
    QTcpServer server_;
    QHash<QTcpSocket *, QByteArray> buffers_;
};

}  // namespace

class ExamplesPanelTest : public QObject {
    Q_OBJECT
private slots:
    void initTestCase() { registerMediaTypes(); }

    // matchesSearch in web/src/utils/matchesSearch.ts.
    void searchMatchesEveryWordAndDropsEndings() {
        QVERIFY(ExampleGallery::matchesSearch("Image Comparison", ""));
        QVERIFY(ExampleGallery::matchesSearch("Image Comparison", "compare"));
        QVERIFY(ExampleGallery::matchesSearch("Image Comparison", "IMAGES compar"));
        QVERIFY(!ExampleGallery::matchesSearch("Image Comparison", "image video"));
        // Too short a stem keeps its ending.
        QVERIFY(!ExampleGallery::matchesSearch("bus", "buses"));
    }

    // useExampleGroups: server examples split into Workflows and ComfyUI by the
    // comfy tag, then the bundled examples, each filtered by type and search.
    void rowsFollowTheGroupsTheFilterAndTheSearch() {
        ExampleGallery gallery;
        gallery.setBundled(bundled());
        gallery.setServerExamples(serverExamples());
        QCOMPARE(keys(gallery), (QStringList{"server:compare.json", "server:summarize.json", "server:Flux Text To Image",
                                             "builtin::/editor/examples/fix-a-flat-image.json",
                                             "builtin::/editor/examples/live-synth.json"}));
        const auto rows = gallery.rows();
        QCOMPARE(rows[0].toMap()["secondary"].toString(), QString("Compare two images side by side"));
        QCOMPARE(rows[1].toMap()["secondary"].toString(), QString("1 node"));
        QCOMPARE(rows[2].toMap()["secondary"].toString(), QString("2 nodes"));
        QCOMPARE(rows[2].toMap()["group"].toString(), QString("comfy"));
        QCOMPARE(rows[3].toMap()["secondary"].toString(), QString("Runs on this computer"));
        QCOMPARE(rows[0].toMap()["thumbnail"].toString(), QString("/api/workflows/examples/thumbnails/Image Comparison.jpg"));

        gallery.setFilter("comfy");
        QCOMPARE(keys(gallery), QStringList{"server:Flux Text To Image"});
        gallery.setFilter("all");
        gallery.setSearch("compare");
        QCOMPARE(keys(gallery), QStringList{"server:compare.json"});
        QStringList counts;
        for (const auto &group : gallery.groups()) {
            counts.append(group.toMap()["key"].toString() + "=" + group.toMap()["count"].toString());
        }
        QCOMPARE(counts, (QStringList{"workflows=1", "comfy=0", "builtin=0"}));
    }

    void bundledExampleOpensThroughItsResource() {
        ExampleGallery gallery;
        gallery.setBundled(bundled());
        QSignalSpy opened(&gallery, &ExampleGallery::bundledRequested);
        gallery.open("builtin::/editor/examples/live-synth.json");
        QCOMPARE(opened.size(), 1);
        QCOMPARE(opened.first().first().toString(), QString(":/editor/examples/live-synth.json"));
        // A key that is not listed does nothing.
        gallery.open("builtin:missing");
        QCOMPARE(opened.size(), 1);
    }

    // handleExampleClick: the list comes from GET /api/workflows/examples, and
    // opening copies the example with POST /api/workflows?from_example_*.
    void serverExampleListsAndOpensAsACopy() {
        FakeServer server;
        ExampleGallery gallery;
        gallery.configure(server.origin(), {}, "7");
        QVERIFY(gallery.connected());
        server.responses.append({200, QJsonDocument(QJsonObject{{"workflows", serverExamples()}, {"next", QJsonValue()}}).toJson()});
        gallery.refresh();
        QVERIFY(gallery.loading());
        QTRY_VERIFY(!gallery.loading());
        QCOMPARE(gallery.error(), QString());
        QCOMPARE(gallery.rows().size(), 3);
        QCOMPARE(server.requests.first().target, QByteArray("/api/workflows/examples"));
        QCOMPARE(server.requests.first().user, QByteArray("7"));

        QSignalSpy copied(&gallery, &ExampleGallery::workflowCopied);
        server.responses.append({200, QJsonDocument(QJsonObject{{"id", "abc123"}, {"name", "Image Comparison"}}).toJson()});
        gallery.open("server:compare.json");
        QCOMPARE(gallery.openingKey(), QString("server:compare.json"));
        // One copy at a time.
        gallery.open("server:summarize.json");
        QTRY_COMPARE(copied.size(), 1);
        QCOMPARE(copied.first().first().toString(), QString("abc123"));
        QCOMPARE(gallery.openingKey(), QString());
        QCOMPARE(server.requests.size(), 2);
        const auto post = server.requests[1];
        QCOMPARE(post.method, QByteArray("POST"));
        QCOMPARE(post.target, QByteArray("/api/workflows?from_example_package=nodetool-base&from_example_name=compare"));
        const auto body = QJsonDocument::fromJson(post.body).object();
        QCOMPARE(body["name"].toString(), QString("Image Comparison"));
        QCOMPARE(body["access"].toString(), QString("private"));
        QCOMPARE(body["tags"].toArray(), (QJsonArray{"image", "example"}));
        QVERIFY(body["graph"].toObject()["nodes"].toArray().isEmpty());

        // A failed copy says so and frees the panel.
        QSignalSpy failed(&gallery, &ExampleGallery::copyFailed);
        server.responses.append({500, "{}"});
        gallery.open("server:summarize.json");
        QTRY_COMPARE(failed.size(), 1);
        QCOMPARE(gallery.openingKey(), QString());

        // A failed list shows the error on the server groups only.
        server.responses.append({503, "{}"});
        gallery.refresh();
        QTRY_VERIFY(!gallery.loading());
        QVERIFY(!gallery.error().isEmpty());
        const auto groups = gallery.groups();
        QVERIFY(!groups[0].toMap()["error"].toString().isEmpty());
        QVERIFY(groups[2].toMap()["error"].toString().isEmpty());
    }

    void panelShowsCardsFiltersAndOpens() {
        ExampleGallery gallery;
        gallery.setBundled(bundled());
        gallery.setServerExamples(serverExamples());
        QSignalSpy opened(&gallery, &ExampleGallery::bundledRequested);
        QSignalSpy closed(&gallery, &ExampleGallery::closeRequested);
        QSignalSpy connect(&gallery, &ExampleGallery::connectRequested);
        QQuickView view;
        view.setInitialProperties({{"gallery", QVariant::fromValue(&gallery)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/ExamplesPanel.qml"));
        QVERIFY2(view.rootObject(), qPrintable(view.errors().isEmpty() ? QString() : view.errors().first().toString()));
        view.resize(360, 900);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();

        QVERIFY(named(root, "examples-section-workflows"));
        QVERIFY(named(root, "examples-section-comfy"));
        QVERIFY(named(root, "examples-section-builtin"));
        QVERIFY(named(root, "example-card-server:compare.json"));
        // With no server, the panel offers to connect.
        QVERIFY(named(root, "examples-connect")->isVisible());
        QMetaObject::invokeMethod(named(root, "examples-connect"), "actionTriggered");
        QCOMPARE(connect.size(), 1);

        // A type chip narrows the list to its group.
        click(view, named(root, "examples-filter-builtin"));
        QTRY_COMPARE(gallery.filter(), QString("builtin"));
        QTRY_VERIFY(!named(root, "examples-section-workflows"));
        QVERIFY(!named(root, "examples-connect")->isVisible());
        click(view, named(root, "example-card-builtin::/editor/examples/live-synth.json"));
        QTRY_COMPARE(opened.size(), 1);
        QCOMPARE(opened.first().first().toString(), QString(":/editor/examples/live-synth.json"));

        // A search with no match shows the empty state, and Clear search resets it.
        click(view, named(root, "examples-filter-all"));
        QTRY_COMPARE(gallery.filter(), QString("all"));
        gallery.setSearch("zebra");
        QTRY_VERIFY(named(root, "examples-empty")->isVisible());
        QVERIFY(!named(root, "examples-list")->isVisible());
        QMetaObject::invokeMethod(named(root, "examples-empty"), "actionTriggered");
        QCOMPARE(gallery.search(), QString());
        QTRY_VERIFY(named(root, "examples-list")->isVisible());

        click(view, named(root, "examples-close"));
        QTRY_COMPARE(closed.size(), 1);
    }
};

QTEST_MAIN(ExamplesPanelTest)
#include "ExamplesPanelTest.moc"
