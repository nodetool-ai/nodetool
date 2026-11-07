#include "server/MsgPack.h"
#include "ui/EditorWindow.h"
#include <QDockWidget>
#include <QFile>
#include <QJsonDocument>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSettings>
#include <QStandardPaths>
#include <QToolTip>
#include <QWebSocket>
#include <QWebSocketServer>
#include <QtTest>

using namespace nodetool;

namespace {
QJsonObject fixture() {
    QFile file(QStringLiteral(WINDOW_PARITY_FIXTURE));
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }
    return QJsonDocument::fromJson(file.readAll()).object();
}

QQuickItem *find(QQuickItem *root, const QString &name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = find(child, name)) {
            return found;
        }
    }
    return nullptr;
}

// Counts visible text items, not buttons, that show the given text.
int countLabels(QQuickItem *root, const QString &text) {
    int count = 0;
    if (root->isVisible() && root->metaObject()->indexOfProperty("role") >= 0 && root->property("text").toString() == text) {
        ++count;
    }
    for (auto *child : root->childItems()) {
        count += countLabels(child, text);
    }
    return count;
}

QJsonObject nodeMetadata(const QString &type, const QString &outputType, bool autoSave = false) {
    QJsonObject metadata{{"node_type", type}, {"title", type.section('.', -1)},
        {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", QJsonObject{{"type", outputType}, {"type_args", QJsonArray{}}}}}}}};
    if (autoSave) {
        metadata["auto_save_asset"] = true;
    }
    return metadata;
}
} // namespace

class ChromeParityTest final : public QObject {
    Q_OBJECT

    static QQuickWidget *panel(EditorWindow &window, const QString &file) {
        for (auto *widget : window.findChildren<QQuickWidget *>()) {
            if (widget->source().fileName() == file + QStringLiteral(".qml")) {
                return widget;
            }
        }
        return nullptr;
    }

    static QPoint center(QQuickItem *item) {
        return item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
    }

    static void click(QQuickWidget *host, QQuickItem *item) {
        QVERIFY(host);
        QVERIFY(item);
        QVERIFY(item->isVisible());
        QTest::mouseClick(host->quickWindow(), Qt::LeftButton, Qt::NoModifier, center(item));
        QCoreApplication::processEvents();
    }

    static void hover(QQuickWidget *host, QQuickItem *item) {
        QVERIFY(host);
        QVERIFY(item);
        QTest::mouseMove(host->quickWindow(), QPoint(2, 2));
        QTest::mouseMove(host->quickWindow(), center(item));
        QCoreApplication::processEvents();
    }

    static void openCatalog(EditorWindow &window) {
        auto *rail = panel(window, QStringLiteral("Rail"));
        if (!window.catalogVisible()) {
            click(rail, find(rail->rootObject(), QStringLiteral("rail-nodes")));
        }
        QTRY_VERIFY(window.catalogVisible());
        QTest::qWait(60);
    }

    static QQuickItem *catalogRoot(EditorWindow &window) {
        return panel(window, QStringLiteral("Catalog"))->rootObject();
    }

    static QVariantList categories(EditorWindow &window) {
        return catalogRoot(window)->property("categories").toList();
    }

    static QMap<QString, int> counts(EditorWindow &window) {
        QMap<QString, int> result;
        for (const auto &value : categories(window)) {
            result.insert(value.toMap()["id"].toString(), value.toMap()["count"].toInt());
        }
        return result;
    }

    static void show(EditorWindow &window, const QJsonArray &metadata) {
        window.setDarkTheme(true);
        window.resize(1440, 900);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        window.setCatalog(metadata);
        QTest::qWait(60);
    }

private slots:
    void initTestCase() {
        QCoreApplication::setApplicationName(QStringLiteral("chrome-parity-tests"));
        QStandardPaths::setTestModeEnabled(true);
        QVERIFY(!fixture().isEmpty());
    }

    void init() {
        QSettings().remove(QStringLiteral("minimap/visible"));
    }

    // web/src/stores/PanelStore.ts opens with every side panel closed.
    void catalogStartsClosedAndTheRailNodesEntryTogglesIt() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        QVERIFY(!window.catalogVisible());
        auto *rail = panel(window, QStringLiteral("Rail"));
        auto *nodes = find(rail->rootObject(), QStringLiteral("rail-nodes"));
        click(rail, nodes);
        QTRY_VERIFY(window.catalogVisible());
        QVERIFY(nodes->property("active").toBool());
        click(rail, nodes);
        QTRY_VERIFY(!window.catalogVisible());
    }

    // The fixture holds eleven node types. The web counts them over its category filters in
    // web/src/config/quickAccessCategories.tsx, and lists every category even at zero.
    void catalogCategoriesFollowTheWebOrderLabelsAndCounts() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        openCatalog(window);
        const QStringList ids{"all", "io", "image", "image-ai", "video", "video-ai", "audio", "audio-ai", "3d-models", "agents", "control-flow"};
        const QStringList labels{"All", "I/O", "Image", "Image AI", "Video", "Video AI", "Audio", "Audio AI", "3D", "Agents", "Control"};
        const QList<int> expected{11, 4, 4, 0, 0, 0, 0, 0, 0, 1, 0};
        const auto rows = categories(window);
        QCOMPARE(rows.size(), ids.size());
        for (int i = 0; i < ids.size(); ++i) {
            const auto row = rows[i].toMap();
            QCOMPARE(row["id"].toString(), ids[i]);
            QCOMPARE(row["label"].toString(), labels[i]);
            QCOMPARE(row["count"].toInt(), expected[i]);
        }
        auto *list = catalogRoot(window)->findChild<QQuickItem *>(QStringLiteral("catalog-categories"));
        QVERIFY(list);
        QTRY_COMPARE(list->property("count").toInt(), ids.size());
        QCOMPARE(catalogRoot(window)->findChild<QQuickItem *>(QStringLiteral("catalog-count"))->property("text").toString(), QString("11"));
    }

    // D1: nodes without a namespace used to form a second row named "All" beside the sentinel row.
    void catalogShowsOneAllRowWhenNodesHaveNoNamespace() {
        EditorWindow window;
        auto metadata = fixture()["metadata"].toArray();
        metadata.append(QJsonObject{{"node_type", "Loose"}, {"title", "Loose"}});
        metadata.append(QJsonObject{{"node_type", "Another"}, {"title", "Another"}});
        show(window, metadata);
        openCatalog(window);
        auto *root = catalogRoot(window);
        // One category row and the footer name the "All" category. A second row would make three.
        QTRY_COMPARE(countLabels(root, QStringLiteral("All")), 2);
        QCOMPARE(counts(window)["all"], 13);
        QCOMPARE(categories(window).size(), 11);
        auto *rows = root->findChild<QQuickItem *>(QStringLiteral("catalog-rows"));
        QTRY_COMPARE(rows->property("count").toInt(), 13);
    }

    void catalogCategoryClickFiltersTheList() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        openCatalog(window);
        auto *host = panel(window, QStringLiteral("Catalog"));
        auto *rows = host->rootObject()->findChild<QQuickItem *>(QStringLiteral("catalog-rows"));
        QTRY_COMPARE(rows->property("count").toInt(), 11);
        click(host, find(host->rootObject(), QStringLiteral("catalog-category-image")));
        QTRY_COMPARE(rows->property("count").toInt(), 4);
        QCOMPARE(find(host->rootObject(), QStringLiteral("catalog-footer-category"))->property("text").toString(), QString("Image"));
        QCOMPARE(find(host->rootObject(), QStringLiteral("catalog-count"))->property("text").toString(), QString("4"));
        click(host, find(host->rootObject(), QStringLiteral("catalog-category-agents")));
        QTRY_COMPARE(rows->property("count").toInt(), 1);
        QVERIFY(find(host->rootObject(), QStringLiteral("catalog-node-nodetool.agents.Agent")));
        click(host, find(host->rootObject(), QStringLiteral("catalog-category-image-ai")));
        QTRY_COMPARE(rows->property("count").toInt(), 0);
        QVERIFY(find(host->rootObject(), QStringLiteral("catalog-empty-state"))->isVisible());
        click(host, find(host->rootObject(), QStringLiteral("catalog-category-all")));
        QTRY_COMPARE(rows->property("count").toInt(), 11);
    }

    // The web filters read the primary output kind and whether the node runs a model.
    void catalogClassifiesNodesAsTheWebDoes() {
        EditorWindow window;
        QJsonArray metadata{
            nodeMetadata("fal.image.Flux", "image"),
            nodeMetadata("nodetool.image.Resize", "image"),
            nodeMetadata("nodetool.image.TextToImage", "image", true),
            nodeMetadata("nodetool.video.Trim", "video"),
            nodeMetadata("nodetool.video.TextToVideo", "video", true),
            nodeMetadata("nodetool.audio.Normalize", "audio"),
            nodeMetadata("elevenlabs.audio.Speak", "audio"),
            nodeMetadata("nodetool.mesh.Repair", "model_3d"),
            nodeMetadata("nodetool.control.If", "any"),
            nodeMetadata("nodetool.agents.Agent", "str", true),
            nodeMetadata("nodetool.input.StringInput", "str"),
            nodeMetadata("nodetool.output.Output", "any"),
        };
        auto listOfImages = nodeMetadata("nodetool.image.Split", "list");
        listOfImages["outputs"] = QJsonArray{QJsonObject{{"name", "output"},
            {"type", QJsonObject{{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", "image"}}}}}}}};
        metadata.append(listOfImages);
        auto hidden = nodeMetadata("nodetool.image.Hidden", "image");
        hidden["hidden"] = true;
        metadata.append(hidden);
        show(window, metadata);
        openCatalog(window);
        const auto found = counts(window);
        QCOMPARE(found["all"], 13);
        QCOMPARE(found["io"], 2);
        QCOMPARE(found["image"], 2);
        QCOMPARE(found["image-ai"], 2);
        QCOMPARE(found["video"], 1);
        QCOMPARE(found["video-ai"], 1);
        QCOMPARE(found["audio"], 1);
        QCOMPARE(found["audio-ai"], 1);
        QCOMPARE(found["3d-models"], 1);
        QCOMPARE(found["agents"], 1);
        QCOMPARE(found["control-flow"], 1);
    }

    void railHasTheWebEntriesInOrder() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        auto *rail = panel(window, QStringLiteral("Rail"));
        const QStringList names{"rail-projects", "rail-documents", "rail-chats", "rail-library", "rail-entities",
                                "rail-examples", "rail-nodes", "rail-more", "rail-theme", "rail-panel"};
        const QStringList labels{"Projects", "Documents", "Chats", "Library", "Entities", "Examples", "Nodes", "More", "Light", "Toggle panel"};
        const QStringList icons{"toolProjects", "folderCopyOutlined", "forumOutlined", "collectionsOutlined", "personOutline",
                                "exploreOutlined", "hub", "moreHoriz", "sunny", "code"};
        qreal previous = -1;
        for (int i = 0; i < names.size(); ++i) {
            auto *entry = find(rail->rootObject(), names[i]);
            QVERIFY2(entry, qPrintable(names[i]));
            QCOMPARE(entry->property("label").toString(), labels[i]);
            QCOMPARE(entry->property("glyph").toString(), icons[i]);
            const auto y = entry->mapToItem(rail->rootObject(), QPointF()).y();
            QVERIFY2(y > previous, qPrintable(names[i]));
            previous = y;
        }
        // The theme toggle and the panel toggle sit below the divider, apart from the views.
        QVERIFY(find(rail->rootObject(), "rail-theme")->mapToItem(rail->rootObject(), QPointF()).y()
                > find(rail->rootObject(), "rail-more")->mapToItem(rail->rootObject(), QPointF()).y() + 100);
        // The native entries the web does not have stay reachable elsewhere.
        QVERIFY(!find(rail->rootObject(), "rail-inspector"));
        QVERIFY(!find(rail->rootObject(), "rail-output"));
    }

    void railTooltipsNameEntriesAndExplainDisabledOnes() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        auto *rail = panel(window, QStringLiteral("Rail"));
        const QList<QPair<QString, QString>> tips{
            {"rail-documents", "Documents"},
            {"rail-chats", "Chats"},
            {"rail-nodes", "Nodes"},
            {"rail-theme", "Switch to light mode"},
            {"rail-panel", "Toggle panel"},
            {"rail-projects", "Projects has no native surface yet. Switch projects from the project menu in the tab strip."},
            {"rail-library", "The asset library has no native panel yet."},
            {"rail-entities", "Entities has no native panel yet."},
            {"rail-examples", "Examples has no native panel yet."},
            {"rail-more", "The More panel has no native equivalent. Native commands are in the toolbar More menu."},
        };
        for (const auto &tip : tips) {
            auto *entry = find(rail->rootObject(), tip.first);
            QVERIFY2(entry, qPrintable(tip.first));
            hover(rail, entry);
            QTRY_COMPARE_WITH_TIMEOUT(QToolTip::text(), tip.second, 1000);
            const bool unavailable = !entry->property("unavailable").toString().isEmpty();
            QCOMPARE(entry->property("button").value<QObject *>()->property("enabled").toBool(), !unavailable);
        }
    }

    void railEntriesOpenTheirNativePanels() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        auto *rail = panel(window, QStringLiteral("Rail"));
        const auto entry = [&](const char *name) { return find(rail->rootObject(), QString::fromLatin1(name)); };
        // Documents shows the workflow browser.
        click(rail, entry("rail-documents"));
        QTRY_VERIFY(window.browserVisible());
        QVERIFY(entry("rail-documents")->property("active").toBool());
        // The panel toggle closes the left panel that is open.
        click(rail, entry("rail-panel"));
        QTRY_VERIFY(!window.browserVisible());
        QVERIFY(!window.catalogVisible());
        click(rail, entry("rail-panel"));
        QTRY_VERIFY(window.catalogVisible());
        click(rail, entry("rail-nodes"));
        QTRY_VERIFY(!window.catalogVisible());
        // Chats shows the native conversation.
        click(rail, entry("rail-chats"));
        QTRY_VERIFY(window.chatVisible());
        click(rail, entry("rail-chats"));
        QTRY_VERIFY(!window.chatVisible());
        // A disabled entry changes nothing.
        for (const auto *name : {"rail-projects", "rail-library", "rail-entities", "rail-examples", "rail-more"}) {
            click(rail, entry(name));
            QTest::qWait(30);
            QVERIFY2(!window.catalogVisible() && !window.browserVisible() && !window.chatVisible(), name);
        }
        // The theme toggle follows the web: the sun in the dark theme, the moon in the light theme.
        click(rail, entry("rail-theme"));
        QTRY_COMPARE(entry("rail-theme")->property("glyph").toString(), QString("darkMode"));
        click(rail, entry("rail-theme"));
        QTRY_COMPARE(entry("rail-theme")->property("glyph").toString(), QString("sunny"));
    }

    void statusBarHasTheWebItemsInOrder() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        QVERIFY(window.document()->load(fixture()["workflow"].toObject()));
        QTest::qWait(120);
        auto *status = panel(window, QStringLiteral("StatusBar"));
        auto *root = status->rootObject();
        // No server is configured, so the connection reads idle, as the web socket does before it starts.
        QCOMPARE(find(root, "status-connection")->property("text").toString(), QString("Idle"));
        const QStringList names{"status-connection", "status-logs", "status-queue", "status-generations", "status-workers",
                                "status-versions", "status-trace", "status-nodes", "status-edges"};
        qreal previous = -1;
        for (const auto &name : names) {
            auto *item = find(root, name);
            QVERIFY2(item, qPrintable(name));
            const auto x = item->mapToItem(root, QPointF()).x();
            QVERIFY2(x > previous, qPrintable(name));
            previous = x;
        }
        const QStringList tabs{"Logs", "Queue", "Generations", "Workers", "Versions", "Trace"};
        const QStringList glyphs{"article", "playlistPlay", "autoAwesomeOutlined", "memory", "history", "timeline"};
        for (int i = 0; i < tabs.size(); ++i) {
            auto *tab = find(root, QString("status-%1").arg(tabs[i].toLower()));
            QCOMPARE(tab->property("label").toString(), tabs[i]);
            QCOMPARE(tab->property("glyph").toString(), glyphs[i]);
        }
        QCOMPARE(find(root, "status-nodes-value")->property("text").toString(), QString("12"));
        QCOMPARE(find(root, "status-nodes-key")->property("text").toString(), QString("nodes"));
        QCOMPARE(find(root, "status-edges-value")->property("text").toString(), QString("11"));
        QCOMPARE(find(root, "status-edges-key")->property("text").toString(), QString("edges"));
        // The counts read "12 nodes". The system readout reads "cpu 41%".
        const auto x = [&](const char *name) { return find(root, QString::fromLatin1(name))->mapToItem(root, QPointF()).x(); };
        QVERIFY(x("status-nodes-value") < x("status-nodes-key"));
        QVERIFY(x("status-edges-value") < x("status-edges-key"));
        // The system readout needs the server's stats, so it is absent until then.
        QVERIFY(!find(root, "status-cpu")->isVisible());
        QVERIFY(!find(root, "status-memory")->isVisible());
    }

    void statusBarTabsOpenNativePanelsOrExplainWhyNot() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        QVERIFY(window.document()->load(fixture()["workflow"].toObject()));
        QTest::qWait(120);
        auto *status = panel(window, QStringLiteral("StatusBar"));
        auto *root = status->rootObject();
        const QList<QPair<QString, QString>> reasons{
            {"status-queue", "The queue opens while jobs are queued or running."},
            {"status-generations", "Generations across workflows have no native panel. Select a node and open History in the inspector."},
            {"status-workers", "Workers has no native panel yet."},
        };
        for (const auto &reason : reasons) {
            auto *tab = find(root, reason.first);
            hover(status, tab);
            QTRY_COMPARE_WITH_TIMEOUT(QToolTip::text(), reason.second, 1000);
            click(status, tab);
            QTest::qWait(30);
            QVERIFY(!window.outputVisible());
        }
        // Logs shows the run output panel. Versions opens the version history panel.
        click(status, find(root, "status-logs"));
        QTRY_VERIFY(window.outputVisible());
        QVERIFY(find(root, "status-logs")->property("active").toBool());
        click(status, find(root, "status-logs"));
        QTRY_VERIFY(!window.outputVisible());
        click(status, find(root, "status-versions"));
        QTRY_VERIFY(window.findChild<QDockWidget *>(QStringLiteral("workflow-versions-dock")));
        QTRY_VERIFY(window.findChild<QDockWidget *>(QStringLiteral("workflow-versions-dock"))->isVisible());
    }

    void statusBarShowsServerStatsAndTheQueue() {
        QWebSocketServer server("chrome parity", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost));
        QPointer<QWebSocket> peer;
        QList<QJsonObject> commands;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            peer = server.nextPendingConnection();
            peer->setParent(&server);
            connect(peer, &QWebSocket::binaryMessageReceived, this, [&](const QByteArray &bytes) {
                const auto message = node_editor::decodeMsgPack(bytes);
                QVERIFY(message);
                commands.append(message->toObject());
            });
        });
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        QVERIFY(window.document()->load(fixture()["workflow"].toObject()));
        window.session()->connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
        QTRY_VERIFY(window.session()->connected());
        window.setCatalog(fixture()["metadata"].toArray());
        QTest::qWait(60);
        auto *status = panel(window, QStringLiteral("StatusBar"));
        auto *root = status->rootObject();
        QTRY_COMPARE(find(root, "status-connection")->property("text").toString(), QString("Connected"));
        QVERIFY(!find(root, "status-reconnect")->isVisible());
        // The server broadcasts system_stats on the socket the editor already holds.
        QTRY_VERIFY(peer);
        peer->sendBinaryMessage(node_editor::encodeMsgPack(QJsonObject{{"type", "system_stats"},
            {"stats", QJsonObject{{"cpu_percent", 41.4}, {"memory_percent", 63.0}, {"memory_used_gb", 20.14}}}}));
        QTRY_VERIFY(find(root, "status-cpu")->isVisible());
        QCOMPARE(find(root, "status-cpu-key")->property("text").toString(), QString("cpu"));
        QCOMPARE(find(root, "status-cpu-value")->property("text").toString(), QString("41%"));
        QCOMPARE(find(root, "status-memory-key")->property("text").toString(), QString("mem"));
        QCOMPARE(find(root, "status-memory-value")->property("text").toString(), QString("20.1G"));
        const auto x = [&](const char *name) { return find(root, QString::fromLatin1(name))->mapToItem(root, QPointF()).x(); };
        QVERIFY(x("status-cpu-key") < x("status-cpu-value"));
        QVERIFY(x("status-memory-key") < x("status-memory-value"));
        // Without a used-memory figure the readout falls back to the percentage.
        peer->sendBinaryMessage(node_editor::encodeMsgPack(QJsonObject{{"type", "system_stats"},
            {"stats", QJsonObject{{"cpu_percent", 7.0}, {"memory_percent", 63.0}}}}));
        QTRY_COMPARE(find(root, "status-memory-value")->property("text").toString(), QString("63%"));
        // A started run makes the queue tab available, and the tab expands the queue panel.
        auto *queue = find(root, "status-queue");
        QVERIFY(!queue->property("unavailable").toString().isEmpty());
        window.action("Run");
        QTRY_VERIFY_WITH_TIMEOUT(!commands.isEmpty(), 2000);
        QTRY_VERIFY(window.queueAvailable());
        QTRY_COMPARE(queue->property("unavailable").toString(), QString());
        auto *overlay = panel(window, QStringLiteral("QueueOverlay"));
        QVERIFY(overlay);
        QVERIFY(!overlay->rootObject()->property("expanded").toBool());
        click(status, queue);
        QTRY_VERIFY(overlay->rootObject()->property("expanded").toBool());
        // A dropped socket drops the stats, and the web names a started but closed connection offline.
        peer->close();
        QTRY_COMPARE(find(root, "status-connection")->property("text").toString(), QString("Offline"));
        QVERIFY(find(root, "status-reconnect")->isVisible());
        QTRY_VERIFY(!find(root, "status-cpu")->isVisible());
        // Closing the session on purpose leaves nothing started, so the connection reads idle again.
        window.session()->disconnectFromServer();
        QTRY_COMPARE(find(root, "status-connection")->property("text").toString(), QString("Idle"));
    }

    // The web hides the mini-map until the header toggle turns it on, and remembers the choice.
    // Source: web/src/stores/MiniMapStore.ts.
    void miniMapIsHiddenByDefaultAndTheChoiceIsRemembered() {
        {
            EditorWindow window;
            show(window, fixture()["metadata"].toArray());
            QVERIFY(window.document()->load(fixture()["workflow"].toObject()));
            QTest::qWait(120);
            auto *map = window.findChild<QWidget *>(QStringLiteral("mini-map"));
            QVERIFY(map);
            QVERIFY(!window.miniMapVisible());
            QVERIFY(!map->isVisible());
            window.action(QStringLiteral("Toggle mini-map"));
            QTRY_VERIFY(map->isVisible());
            QVERIFY(window.miniMapVisible());
            QVERIFY(QSettings().value(QStringLiteral("minimap/visible")).toBool());
        }
        {
            // A new window starts as the user left it.
            EditorWindow window;
            show(window, fixture()["metadata"].toArray());
            QTest::qWait(120);
            auto *map = window.findChild<QWidget *>(QStringLiteral("mini-map"));
            QVERIFY(map);
            QVERIFY(window.miniMapVisible());
            QTRY_VERIFY(map->isVisible());
            window.action(QStringLiteral("Toggle mini-map"));
            QTRY_VERIFY(!map->isVisible());
            QVERIFY(!QSettings().value(QStringLiteral("minimap/visible"), true).toBool());
        }
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        QVERIFY(!window.miniMapVisible());
    }
};

QTEST_MAIN(ChromeParityTest)
#include "ChromeParityTest.moc"
