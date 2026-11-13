#include "FakeRunServer.h"
#include "server/MsgPack.h"
#include "ui/EditorWindow.h"
#include <QDesktopServices>
#include <QDockWidget>
#include <QGraphicsView>
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
#include <QMenu>
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
// Records the URLs the editor hands to the desktop instead of opening a browser.
class UrlCatcher final : public QObject {
    Q_OBJECT
public:
    QList<QUrl> urls;
public slots:
    void open(const QUrl &url) { urls.append(url); }
};

QList<QQuickItem *> findAll(QQuickItem *root, const QString &name) {
    QList<QQuickItem *> found;
    if (root->objectName() == name) {
        found.append(root);
    }
    for (auto *child : root->childItems()) {
        found += findAll(child, name);
    }
    return found;
}

bool showsText(QQuickItem *root, const QString &text) {
    if (root->isVisible() && root->property("text").toString() == text) {
        return true;
    }
    for (auto *child : root->childItems()) {
        if (child->isVisible() && showsText(child, text)) {
            return true;
        }
    }
    return false;
}
} // namespace

class ChromeParityTest final : public QObject {
    Q_OBJECT
public:
    static void initMain() {
        // Offscreen has no desktop hover hint, so controls would ignore the hover checks below.
        qputenv("QT_QUICK_CONTROLS_HOVER_ENABLED", "1");
    }
private:
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
        // The window tooltip opens at the cursor, so park the cursor on the item as a real pointer would be.
        // Moving it first lets the window system's enter and leave settle before the quick window sees the move.
        QCursor::setPos(host->mapToGlobal(center(item)));
        QCoreApplication::processEvents();
        QTest::mouseMove(host->quickWindow(), QPoint(2, 2));
        QTest::mouseMove(host->quickWindow(), center(item));
        QCoreApplication::processEvents();
    }

    // The text a user sees. A Ui.Tooltip that fits its panel overlay shows there. One that does not
    // (a thin QQuickWidget) hands its text to the window, which shows it through QToolTip.
    static QString shownTooltip(QQuickWidget *host) {
        for (auto *object : host->rootObject()->findChildren<QObject *>()) {
            if (object->property("followsTrigger").isValid() && object->property("visible").toBool()
                && object->property("opacity").toReal() > 0) {
                return object->property("text").toString();
            }
        }
        return QToolTip::text();
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
        QSettings().remove(QStringLiteral("catalog/showNodesWithoutKey"));
        // The web captures seed the chat window collapsed (scripts/capture-web-window-parity.mjs).
        QSettings().setValue(QStringLiteral("canvas-chat-dock/collapsed"), true);
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
            {"rail-library", "Library"},
            {"rail-entities", "Entities has no native panel yet."},
            {"rail-examples", "Examples"},
            {"rail-more", "The More panel has no native equivalent. Native commands are in the toolbar More menu."},
        };
        for (const auto &tip : tips) {
            auto *entry = find(rail->rootObject(), tip.first);
            QVERIFY2(entry, qPrintable(tip.first));
            hover(rail, entry);
            QTRY_COMPARE_WITH_TIMEOUT(shownTooltip(rail), tip.second, 1000);
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
        // Examples opens the menu of bundled examples.
        click(rail, entry("rail-examples"));
        QTRY_VERIFY(window.findChild<QMenu *>("examples-menu"));
        window.findChild<QMenu *>("examples-menu")->close();
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        // A disabled entry changes nothing.
        for (const auto *name : {"rail-projects", "rail-library", "rail-entities", "rail-more"}) {
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
            QCOMPARE(tab->property("iconName").toString(), glyphs[i]);
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
            {"status-workers", "Workers has no native panel yet."},
        };
        for (const auto &reason : reasons) {
            auto *tab = find(root, reason.first);
            hover(status, tab);
            QTRY_COMPARE_WITH_TIMEOUT(shownTooltip(status), reason.second, 1000);
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
        // Queue opens with no jobs, as the web QueuePanel does, and closes on a second click.
        auto *overlay = panel(window, QStringLiteral("QueueOverlay"));
        QVERIFY(overlay);
        QVERIFY(!window.queueAvailable());
        click(status, find(root, "status-queue"));
        QTRY_VERIFY(overlay->rootObject()->property("presented").toBool());
        QTRY_VERIFY(find(root, "status-queue")->property("active").toBool());
        QVERIFY(find(overlay->rootObject(), "queue-active-empty")->isVisible());
        click(status, find(root, "status-queue"));
        QTRY_VERIFY(!find(root, "status-queue")->property("active").toBool());
        // Generations opens its bottom panel and closes it again.
        click(status, find(root, "status-generations"));
        QTRY_VERIFY(window.findChild<QDockWidget *>(QStringLiteral("generations-dock")));
        QTRY_VERIFY(find(root, "status-generations")->property("active").toBool());
        QVERIFY(panel(window, QStringLiteral("GenerationsPanel")));
        click(status, find(root, "status-generations"));
        QTRY_VERIFY(!find(root, "status-generations")->property("active").toBool());
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
        // A started run shows the queue summary, and the tab expands the queue panel.
        auto *queue = find(root, "status-queue");
        QCOMPARE(queue->property("disabledReason").toString(), QString());
        window.action("Run");
        QTRY_VERIFY_WITH_TIMEOUT(!commands.isEmpty(), 2000);
        QTRY_VERIFY(window.queueAvailable());
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
    // W16: web/src/components/workspace/WorkspaceTabBar.tsx ends the bar with the
    // notification bell and the settings button (NotificationButton.tsx, SettingsHeaderButton.tsx).
    void tabBarEndsWithNotificationsAndSettings() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        auto *bar = panel(window, QStringLiteral("TabBar"));
        QVERIFY(bar);
        auto *root = bar->rootObject();
        auto *bell = find(root, QStringLiteral("tabbar-notifications"));
        auto *settings = find(root, QStringLiteral("tabbar-settings"));
        auto *newTab = find(root, QStringLiteral("new-workflow-tab"));
        QVERIFY(bell);
        QVERIFY(settings);
        const auto left = [root](QQuickItem *item) { return item->mapToItem(root, QPointF()).x(); };
        QVERIFY(left(newTab) < left(bell));
        QVERIFY(left(bell) < left(settings));
        // 28 px buttons, 4 px apart, 4 px from the right edge.
        QCOMPARE(bell->width(), 28.0);
        QCOMPARE(settings->height(), 28.0);
        QCOMPARE(left(settings) - left(bell), 32.0);
        QCOMPARE(root->width() - (left(settings) + settings->width()), 4.0);
        QCOMPARE(bell->property("accessibleName").toString(), QStringLiteral("Notifications, no unread notifications"));
        QCOMPARE(settings->property("accessibleName").toString(), QStringLiteral("Settings"));
        auto *dot = find(root, QStringLiteral("tabbar-notifications-unread"));
        QVERIFY(dot);
        QVERIFY(!dot->isVisible());

        // An error becomes an unread notification.
        QMetaObject::invokeMethod(window.session(), "errorOccurred", Q_ARG(QString, QStringLiteral("Upload failed")));
        QTRY_VERIFY(dot->isVisible());
        QCOMPARE(bell->property("accessibleName").toString(), QStringLiteral("Notifications, 1 unread notification"));
        click(bar, bell);
        QQuickWidget *popup = nullptr;
        QTRY_VERIFY((popup = panel(window, QStringLiteral("NotificationsPanel"))) && popup->isVisible());
        QTRY_VERIFY(showsText(popup->rootObject(), QStringLiteral("Upload failed")));
        QTRY_VERIFY(!dot->isVisible());
        QCOMPARE(bell->property("accessibleName").toString(), QStringLiteral("Notifications, no unread notifications"));
        popup->close();

        // Settings opens the settings page of the connected server.
        UrlCatcher catcher;
        QDesktopServices::setUrlHandler(QStringLiteral("http"), &catcher, "open");
        FakeRunServer server;
        window.session()->connectToServer(server.url(), {});
        QTRY_VERIFY(window.session()->connected());
        click(bar, settings);
        QTRY_COMPARE(catcher.urls.size(), 1);
        QCOMPARE(catcher.urls.first(), server.url().resolved(QUrl(QStringLiteral("/settings"))));
        QDesktopServices::unsetUrlHandler(QStringLiteral("http"));
    }

    // W17: the web left panel is position: fixed over the canvas (PanelLeft.tsx), so
    // opening it changes neither the canvas size nor the zoom. It covers the header row's left end.
    void catalogOverlaysTheCanvasWithoutChangingTheZoom() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        QVERIFY(window.document()->load(fixture()["workflow"].toObject()));
        QTest::qWait(150);
        window.fit();
        QTest::qWait(150);
        auto *view = window.activeEditor()->findChild<QGraphicsView *>();
        QVERIFY(view);
        const auto canvasWidth = view->width();
        const auto zoom = window.zoomPercent();
        const auto transform = view->transform();
        openCatalog(window);
        QTest::qWait(300);
        QCOMPARE(view->width(), canvasWidth);
        QCOMPARE(window.zoomPercent(), zoom);
        QCOMPARE(view->transform(), transform);
        auto *catalog = panel(window, QStringLiteral("Catalog"));
        auto *header = panel(window, QStringLiteral("HeaderRow"));
        const auto catalogRect = QRect(catalog->mapTo(&window, QPoint()), catalog->size());
        const auto headerRect = QRect(header->mapTo(&window, QPoint()), header->size());
        QCOMPARE(catalogRect.left(), headerRect.left());
        QCOMPARE(catalogRect.top(), headerRect.top());
        QCOMPARE(catalog->width(), 310);
        QVERIFY(catalogRect.bottom() >= QRect(view->mapTo(&window, QPoint()), view->size()).bottom());
    }

    // W17: NodeLibrary.tsx focuses the search when the library opens.
    void catalogFocusesTheSearchWhenItOpens() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        openCatalog(window);
        auto *catalog = panel(window, QStringLiteral("Catalog"));
        auto *search = find(catalog->rootObject(), QStringLiteral("nodeSearch"));
        QVERIFY(search);
        QTRY_VERIFY(catalog->hasFocus());
        QTRY_VERIFY(search->hasActiveFocus());
        for (const char key : {'b', 'l', 'u', 'r'}) {
            QTest::keyClick(catalog->quickWindow(), key);
        }
        auto *rows = find(catalog->rootObject(), QStringLiteral("catalog-rows"));
        QTRY_COMPARE(rows->property("count").toInt(), 1);
    }

    // W17: the PanelHeader in NodeLibrary.tsx names the docs topic "nodes", which
    // DocsHelpLink.tsx draws as an open-in-new link to docs.nodetool.ai/nodes/.
    void catalogHeaderLinksTheNodesDocumentation() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        openCatalog(window);
        auto *catalog = panel(window, QStringLiteral("Catalog"));
        auto *link = find(catalog->rootObject(), QStringLiteral("catalog-docs"));
        QVERIFY(link);
        auto *count = find(catalog->rootObject(), QStringLiteral("catalog-count"));
        QVERIFY(link->mapToItem(catalog->rootObject(), QPointF()).x() > count->mapToItem(catalog->rootObject(), QPointF()).x());
        QCOMPARE(link->property("accessibleName").toString(), QStringLiteral("Nodes documentation"));
        hover(catalog, link);
        QTRY_COMPARE_WITH_TIMEOUT(shownTooltip(catalog), QStringLiteral("Nodes documentation"), 1500);
        UrlCatcher catcher;
        QDesktopServices::setUrlHandler(QStringLiteral("https"), &catcher, "open");
        click(catalog, link);
        QTRY_COMPARE(catcher.urls.size(), 1);
        QCOMPARE(catcher.urls.first(), QUrl(QStringLiteral("https://docs.nodetool.ai/nodes/")));
        QDesktopServices::unsetUrlHandler(QStringLiteral("https"));
    }

    // W17: useNodeProviderFilter.ts leaves out nodes whose provider key is not set,
    // and MissingKeyNodesNotice.tsx counts them with a link that shows them.
    void catalogHidesNodesThatNeedAMissingKey() {
        FakeRunServer server;
        server.metadata = QJsonArray{nodeMetadata("fal.image.Flux", "image"), nodeMetadata("fal.image.Recraft", "image"),
            nodeMetadata("openai.text.Chat", "str"), nodeMetadata("nodetool.image.Resize", "image"),
            nodeMetadata("huggingface.image.Upscale", "image")};
        server.secrets = QJsonArray{QJsonObject{{"key", "OPENAI_API_KEY"}, {"is_configured", true}},
            QJsonObject{{"key", "FAL_API_KEY"}, {"is_configured", false}}};
        EditorWindow window;
        show(window, server.metadata);
        openCatalog(window);
        auto *catalog = panel(window, QStringLiteral("Catalog"));
        auto *rows = find(catalog->rootObject(), QStringLiteral("catalog-rows"));
        auto *notice = find(catalog->rootObject(), QStringLiteral("catalog-missing-key"));
        QVERIFY(notice);
        // Without the server's secrets the editor cannot tell, so it lists every node.
        QTRY_COMPARE(rows->property("count").toInt(), 5);
        QVERIFY(!notice->isVisible());
        window.session()->connectToServer(server.url(), {});
        QTRY_COMPARE(rows->property("count").toInt(), 3);
        QVERIFY(!find(catalog->rootObject(), QStringLiteral("catalog-node-fal.image.Flux")));
        QCOMPARE(counts(window)["all"], 3);
        QTRY_VERIFY(notice->isVisible());
        auto *text = find(catalog->rootObject(), QStringLiteral("catalog-missing-key-text"));
        auto *toggle = find(catalog->rootObject(), QStringLiteral("catalog-missing-key-toggle"));
        QCOMPARE(text->property("text").toString(), QStringLiteral("2 nodes need an API key you have not added."));
        QCOMPARE(toggle->property("text").toString(), QStringLiteral("Show them"));
        click(catalog, toggle);
        QTRY_COMPARE(rows->property("count").toInt(), 5);
        QCOMPARE(text->property("text").toString(), QStringLiteral("Showing 2 nodes that need an API key."));
        QCOMPARE(toggle->property("text").toString(), QStringLiteral("Hide them"));
        QVERIFY(QSettings().value(QStringLiteral("catalog/showNodesWithoutKey")).toBool());
        click(catalog, toggle);
        QTRY_COMPARE(rows->property("count").toInt(), 3);
    }

    // W20: Inspector.tsx ends with RunSelectedNodesSection: a Runs stepper from 1 to 32
    // and Run selected, which runs the selection that many times in sequence
    // (hooks/nodes/useRunSelectedNodes.ts).
    void inspectorFooterRunsTheSelectionRepeatedly() {
        // native-rules #2: naked new, parent set on the next line instead of in the statement
        auto *server = new FakeRunServer;
        server->setParent(this);
        server->metadata = fixture()["metadata"].toArray();
        server->workflow = fixture()["workflow"].toObject();
        server->workflow["updated_at"] = QStringLiteral("r1");
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        window.session()->setAutosaveDelay(60000);
        window.session()->connectToServer(server->url(), {});
        QTRY_VERIFY(window.session()->connected());
        window.session()->openWorkflow(server->workflow["id"].toString());
        QTRY_VERIFY(window.session()->serverBound());
        QTest::qWait(120);
        QVERIFY(window.selectNode(QStringLiteral("generate")));
        auto *inspector = panel(window, QStringLiteral("Inspector"));
        QTRY_VERIFY(inspector->isVisible());
        auto *root = inspector->rootObject();
        auto *label = find(root, QStringLiteral("inspector-runs-label"));
        auto *value = find(root, QStringLiteral("inspector-runs-value"));
        auto *decrease = find(root, QStringLiteral("inspector-runs-decrease"));
        auto *increase = find(root, QStringLiteral("inspector-runs-increase"));
        auto *run = find(root, QStringLiteral("inspector-run-selected"));
        QVERIFY(label && value && decrease && increase && run);
        QTRY_VERIFY(run->isVisible());
        QCOMPARE(label->property("text").toString(), QStringLiteral("Runs"));
        QCOMPARE(value->property("text").toString(), QStringLiteral("1"));
        QVERIFY(!decrease->isEnabled());
        QCOMPARE(decrease->property("accessibleName").toString(), QStringLiteral("Decrease runs"));
        QCOMPARE(increase->property("accessibleName").toString(), QStringLiteral("Increase runs"));
        QCOMPARE(run->property("text").toString(), QStringLiteral("Run selected"));
        QCOMPARE(run->property("accessibleName").toString(), QStringLiteral("Run selected nodes"));
        // The footer sits under the fields, at the bottom of the panel.
        auto *scroll = find(root, QStringLiteral("property-scroll"));
        QTRY_VERIFY(run->mapToItem(root, QPointF()).y() > root->height() / 2);
        QVERIFY(run->mapToItem(root, QPointF()).y() > scroll->mapToItem(root, QPointF()).y() + scroll->height() - 1);
        click(inspector, increase);
        QTRY_COMPARE(value->property("text").toString(), QStringLiteral("2"));
        QVERIFY(decrease->isEnabled());
        click(inspector, run);
        QTRY_COMPARE(server->commands.size(), 1);
        QCOMPARE(server->commands.first()["command"].toString(), QStringLiteral("run_job"));
        auto *progress = find(root, QStringLiteral("inspector-run-progress"));
        QVERIFY(progress);
        QTRY_COMPARE(progress->property("text").toString(), QStringLiteral("Run 1/2"));
        // The run controls follow the debounced run state.
        QTRY_VERIFY(!run->isEnabled());
        const auto first = server->commands.first()["data"].toObject()["job_id"].toString();
        server->update(first, QStringLiteral("running"));
        server->update(first, QStringLiteral("completed"));
        QTRY_COMPARE(server->commands.size(), 2);
        QCOMPARE(server->commands.last()["command"].toString(), QStringLiteral("run_job"));
        QTRY_COMPARE(progress->property("text").toString(), QStringLiteral("Run 2/2"));
        const auto second = server->commands.last()["data"].toObject()["job_id"].toString();
        QVERIFY(second != first);
        server->update(second, QStringLiteral("running"));
        server->update(second, QStringLiteral("completed"));
        QTRY_VERIFY(!progress->isVisible());
        QTest::qWait(100);
        QCOMPARE(server->commands.size(), 2);
        QTRY_VERIFY(run->isEnabled());
    }

    // W20: PanelRight.tsx puts the cost estimate under the inspector. It is a
    // collapsed "Cost estimate" row whose caption is the per-run total
    // (costs/WorkflowCostEstimatePanel.tsx). Native asks the server's preflight,
    // which runs the same estimateWorkflowCost (sdk-static-preflight-service.ts).
    void inspectorShowsTheServerCostEstimate() {
        // native-rules #2: naked new, parent set on the next line instead of in the statement
        auto *server = new FakeRunServer;
        server->setParent(this);
        server->metadata = fixture()["metadata"].toArray();
        server->workflow = fixture()["workflow"].toObject();
        server->workflow["updated_at"] = QStringLiteral("r1");
        const auto summary = [](const QJsonValue &amount, const QString &confidence, const QJsonArray &unknown) {
            return QJsonObject{{"version", 1}, {"level", "static"}, {"workflow_id", "a1windowparity0000000000000000a1"},
                {"workflow_etag", QJsonValue::Null}, {"runnable", true}, {"issues", QJsonArray{}}, {"requirements", QJsonArray{}},
                {"cost", QJsonObject{{"amount", amount}, {"currency", "USD"}, {"confidence", confidence},
                    {"unknown_cost_nodes", unknown}, {"approval_required", false}}}};
        };
        server->preflight = summary(0.12, QStringLiteral("estimate"), {});
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        window.session()->setAutosaveDelay(60000);
        window.session()->connectToServer(server->url(), {});
        QTRY_VERIFY(window.session()->connected());
        window.session()->openWorkflow(server->workflow["id"].toString());
        QTRY_VERIFY(window.session()->serverBound());
        QVERIFY(window.selectNode(QStringLiteral("agent")));
        auto *inspector = panel(window, QStringLiteral("Inspector"));
        QTRY_VERIFY(inspector->isVisible());
        auto *root = inspector->rootObject();
        auto *title = find(root, QStringLiteral("inspector-cost-title"));
        auto *caption = find(root, QStringLiteral("inspector-cost-caption"));
        QVERIFY(title && caption);
        QCOMPARE(title->property("text").toString(), QStringLiteral("Cost estimate"));
        QTRY_COMPARE(caption->property("text").toString(), QStringLiteral("~$0.12 / run"));
        QVERIFY(!server->preflights.isEmpty());
        const auto request = server->preflights.last();
        QCOMPARE(request["workflow_id"].toString(), server->workflow["id"].toString());
        QCOMPARE(request["level"].toString(), QStringLiteral("static"));
        QCOMPARE(request["interface_version"].toInt(), 1);
        // The row sits under the run footer.
        auto *run = find(root, QStringLiteral("inspector-run-selected"));
        QTRY_VERIFY(title->mapToItem(root, QPointF()).y() > run->mapToItem(root, QPointF()).y());
        // A save prices the graph again. An unpriced node marks the total incomplete.
        server->preflight = summary(0.12, QStringLiteral("partial"), QJsonArray{"generate"});
        const auto asked = server->preflights.size();
        window.session()->save();
        QTRY_VERIFY(server->preflights.size() > asked);
        QTRY_COMPARE(caption->property("text").toString(), QStringLiteral("$0.12 · incomplete"));
        // Nothing priceable reads "Per run".
        server->preflight = summary(0, QStringLiteral("exact"), {});
        window.session()->save();
        QTRY_COMPARE(caption->property("text").toString(), QStringLiteral("Per run"));
    }

    // W21: ImageListProperty.tsx gives a media list one click-or-drop zone and no search,
    // browse or select controls.
    void inspectorMediaListHasOneDropZone() {
        EditorWindow window;
        const QJsonObject listType{{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", "image"}}}}};
        window.setCatalog({QJsonObject{{"node_type", "fixture.MediaList"}, {"title", "Image references"},
            {"properties", QJsonArray{QJsonObject{{"name", "images"}, {"title", "Reference images"}, {"type", listType}}}}}});
        window.resize(1440, 900);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QVERIFY(window.document()->load(QJsonObject{{"name", "Media list"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            QJsonObject{{"id", "media"}, {"type", "fixture.MediaList"}, {"data", QJsonObject{{"images", QJsonArray{}}}}}}}, {"edges", QJsonArray{}}}}}));
        QTest::qWait(120);
        QVERIFY(window.selectNode(QStringLiteral("media")));
        auto *inspector = panel(window, QStringLiteral("Inspector"));
        QTRY_VERIFY(inspector->isVisible());
        QQuickItem *editor = nullptr;
        QTRY_VERIFY((editor = find(inspector->rootObject(), QStringLiteral("media-list-editor-images"))));
        QTest::qWait(60);
        const auto zones = findAll(editor, QStringLiteral("media-list-drop-images"));
        QCOMPARE(zones.size(), 1);
        QVERIFY(zones.first()->isVisible());
        QVERIFY(zones.first()->height() >= 80);
        QVERIFY(showsText(zones.first(), QStringLiteral("Click or drop images here")));
        for (const auto &name : {"asset-search-images", "asset-refresh-images", "asset-upload-images", "asset-select-images", "asset-drop-images"}) {
            auto *control = find(editor, QString::fromLatin1(name));
            QVERIFY2(!control || !control->isVisible(), name);
        }
    }

    // W23: PanelBottom.tsx draws the status bar as the bottom panel's tab strip, so an open
    // panel puts the bar above its body.
    void outputPanelUsesTheStatusBarAsItsTabStrip() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        QVERIFY(window.document()->load(fixture()["workflow"].toObject()));
        QTest::qWait(120);
        auto *status = panel(window, QStringLiteral("StatusBar"));
        auto *output = panel(window, QStringLiteral("RunOutput"));
        const auto top = [&window](QWidget *widget) { return widget->mapTo(&window, QPoint()).y(); };
        QCOMPARE(top(status) + status->height(), window.height());
        click(status, find(status->rootObject(), QStringLiteral("status-logs")));
        QTRY_VERIFY(window.outputVisible());
        QTRY_VERIFY(output->isVisible());
        QTRY_COMPARE(top(status) + status->height(), top(output));
        QVERIFY(top(output) + output->height() <= window.height());
        auto *view = window.activeEditor()->findChild<QGraphicsView *>();
        QVERIFY(top(view) + view->height() <= top(status));
        // The open view's tab closes the panel and the bar returns to the window bottom.
        click(status, find(status->rootObject(), QStringLiteral("status-logs")));
        QTRY_VERIFY(!window.outputVisible());
        QTRY_COMPARE(top(status) + status->height(), window.height());
    }

    // W23: the web Logs view always shows the run picker and, without runs, the
    // "No recorded runs" empty state (TracePanel.tsx RunPicker and EmptyState). It has no title row.
    void outputPanelShowsARunPickerAndAnEmptyState() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        window.action(QStringLiteral("Output"));
        auto *output = panel(window, QStringLiteral("RunOutput"));
        QTRY_VERIFY(output->isVisible());
        auto *root = output->rootObject();
        auto *picker = find(root, QStringLiteral("run-history"));
        QVERIFY(picker);
        QTRY_VERIFY(picker->isVisible());
        QVERIFY(!picker->isEnabled());
        QCOMPARE(picker->property("placeholderText").toString(), QStringLiteral("No recent runs"));
        QVERIFY(showsText(root, QStringLiteral("No recorded runs")));
        QVERIFY(!find(root, QStringLiteral("close-output")));
        QVERIFY(!showsText(root, QStringLiteral("Output")));
    }

    // W23: web log rows are CONTROL.height.md, 32 px (TracePanel.tsx SPAN_ROW_HEIGHT).
    void outputRowsAreCompact() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        window.runOutput()->beginRun(QStringLiteral("job-1"));
        for (const auto *node : {"subject", "size", "reference"}) {
            window.runOutput()->ingest(QStringLiteral("job-1"), QJsonObject{{"type", "node_update"}, {"job_id", "job-1"},
                {"node_id", QString::fromLatin1(node)}, {"node_name", QString::fromLatin1(node)}, {"status", "completed"}});
        }
        window.action(QStringLiteral("Output"));
        auto *output = panel(window, QStringLiteral("RunOutput"));
        QTRY_VERIFY(output->isVisible());
        QList<QQuickItem *> rows;
        QTRY_COMPARE((rows = findAll(output->rootObject(), QStringLiteral("run-output-row"))).size(), 3);
        QTest::qWait(60);
        for (auto *row : rows) {
            QVERIFY2(row->height() <= 33, qPrintable(QString::number(row->height())));
        }
    }

    // W24: a status bar tab shows whether its panel is open, and the open view's tab closes it
    // (PanelBottom.tsx handleTabToggle). The bar carries no run message.
    void statusBarTabsShowAndToggleTheirPanels() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        QVERIFY(window.document()->load(fixture()["workflow"].toObject()));
        QTest::qWait(120);
        auto *status = panel(window, QStringLiteral("StatusBar"));
        auto *root = status->rootObject();
        QVERIFY(!find(root, QStringLiteral("status-message")));
        auto *trace = find(root, QStringLiteral("status-trace"));
        auto *versions = find(root, QStringLiteral("status-versions"));
        click(status, trace);
        QTRY_VERIFY(trace->property("active").toBool());
        QTRY_VERIFY(window.findChild<QDockWidget *>(QStringLiteral("run-trace-dock")));
        click(status, trace);
        QTRY_VERIFY(!trace->property("active").toBool());
        QTRY_VERIFY(!window.findChild<QDockWidget *>(QStringLiteral("run-trace-dock")) || !window.findChild<QDockWidget *>(QStringLiteral("run-trace-dock"))->isVisible());
        click(status, versions);
        QTRY_VERIFY(versions->property("active").toBool());
        QVERIFY(!trace->property("active").toBool());
        click(status, versions);
        QTRY_VERIFY(!versions->property("active").toBool());
    }

    // W22: the web inspector opens at 350 px (stores/RightPanelStore.ts sizes.initial).
    void inspectorOpensAtTheWebWidth() {
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        QVERIFY(window.document()->load(fixture()["workflow"].toObject()));
        QTest::qWait(120);
        QVERIFY(window.selectNode(QStringLiteral("agent")));
        auto *inspector = panel(window, QStringLiteral("Inspector"));
        QTRY_VERIFY(inspector->isVisible());
        QTRY_COMPARE(inspector->width(), 350);
    }

    // W28: the web chat window starts open unless the viewport is narrower than 1200 px
    // (stores/CanvasChatDockStore.ts defaultConversationCollapsed), until the user toggles it.
    void chatOpensByDefaultOnAWideWindow() {
        QSettings().remove(QStringLiteral("canvas-chat-dock"));
        {
            EditorWindow window;
            show(window, fixture()["metadata"].toArray());
            QTRY_VERIFY(window.chatVisible());
        }
        {
            EditorWindow window;
            window.resize(1024, 700);
            window.show();
            QVERIFY(QTest::qWaitForWindowExposed(&window));
            QTest::qWait(60);
            QVERIFY(!window.chatVisible());
            window.resize(1440, 900);
            QTRY_VERIFY(window.chatVisible());
            window.toggleChat();
            QVERIFY(!window.chatVisible());
        }
        EditorWindow window;
        show(window, fixture()["metadata"].toArray());
        QTest::qWait(60);
        QVERIFY(!window.chatVisible());
    }
};

QTEST_MAIN(ChromeParityTest)
#include "ChromeParityTest.moc"
