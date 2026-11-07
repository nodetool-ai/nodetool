#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include <QCursor>
#include <QDir>
#include <QGraphicsView>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSettings>
#include <QtTest>

// F01: catalog search, keyboard paths and pointer placement against the web
// node menu (components/node_menu, stores/NodeMenuStore.ts, utils/ranking.ts).
using namespace nodetool;

namespace {

QJsonObject entry(const QString &type, const QString &title, const QString &description) {
    return QJsonObject{
        {"node_type", type},
        {"title", title},
        {"namespace", type.section('.', 0, -2)},
        {"description", description},
        {"properties", QJsonArray{}},
        {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", QJsonObject{{"type", "str"}}}}}},
    };
}

// Blur precedes Resize so ranking, not catalog order, decides the result order.
QJsonArray catalogFixture() {
    return QJsonArray{
        entry("nodetool.tools.Blur", "Blur", "Resize the radius, then blur."),
        entry("nodetool.image.Resize", "Resize", "Scale an image."),
        entry("nodetool.tools.Sharpen", "Sharpen", "Edge enhance."),
        entry("nodetool.text.Concat", "Concat", "Join text."),
    };
}

QQuickItem *find(QQuickItem *root, const QString &name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto child : root->childItems()) {
        if (auto found = find(child, name)) {
            return found;
        }
    }
    return nullptr;
}

QQuickWidget *catalogPanel(EditorWindow &window) {
    for (auto panel : window.findChildren<QQuickWidget *>()) {
        if (panel->source().fileName() == "Catalog.qml") {
            return panel;
        }
    }
    return nullptr;
}

QStringList visibleTypes(QQuickWidget *catalog) {
    QStringList types;
    for (const auto &value : catalog->rootObject()->property("visibleNodes").toList()) {
        types.append(value.toMap().value("type").toString());
    }
    return types;
}

QPointF position(const QJsonObject &node) {
    const auto p = node["ui_properties"].toObject()["position"].toObject();
    return {p["x"].toDouble(), p["y"].toDouble()};
}

void capture(EditorWindow &window, const QString &name) {
    const auto directory = qEnvironmentVariable("NODETOOL_CATALOG_CAPTURE_DIR");
    if (directory.isEmpty()) {
        return;
    }
    QDir().mkpath(directory);
    window.setDarkTheme(true);
    QTest::qWait(60);
    QVERIFY(window.grab().save(QDir(directory).filePath(name + "-dark.png")));
    window.setDarkTheme(false);
    QTest::qWait(60);
    QVERIFY(window.grab().save(QDir(directory).filePath(name + "-light.png")));
    window.setDarkTheme(true);
}

} // namespace

class CatalogTest final : public QObject {
    Q_OBJECT

private slots:
    // Recent nodes persist in settings. Each test starts without any.
    void init() {
        QSettings().remove("catalog/recentNodes");
    }

    // With no query the web library still ranks: recent nodes, then the quick
    // action types, then node type order (utils/ranking.ts rankPass, NodeLibrary.tsx:432-438).
    void browseOrderRanksRecentAndQuickActionNodes() {
        auto catalog = catalogFixture();
        catalog.append(entry("nodetool.constant.String", "String", "A text value."));
        EditorWindow window;
        window.setCatalog(catalog);
        window.show();
        window.action("Add node");
        QTest::qWait(100);
        auto catalogWidget = catalogPanel(window);
        QVERIFY(catalogWidget);
        QTRY_COMPARE(visibleTypes(catalogWidget), QStringList({"nodetool.constant.String", "nodetool.image.Resize", "nodetool.text.Concat", "nodetool.tools.Blur", "nodetool.tools.Sharpen"}));
        auto row = find(catalogWidget->rootObject(), "catalog-node-nodetool.tools.Sharpen");
        QVERIFY(row);
        QTest::mouseClick(catalogWidget->quickWindow(), Qt::LeftButton, Qt::NoModifier, row->mapToScene(QPointF(row->width() / 2, row->height() / 2)).toPoint());
        QTRY_COMPARE(window.document()->nodes().size(), 1);
        QCOMPARE(window.catalogRecent(), QStringList({"nodetool.tools.Sharpen"}));
        QTRY_COMPARE(visibleTypes(catalogWidget).first(), QString("nodetool.tools.Sharpen"));
        QCOMPARE(visibleTypes(catalogWidget).at(1), QString("nodetool.constant.String"));
    }

    // When nothing matches literally, separator-free matches and subsequences
    // of four or more characters still find a node (utils/ranking.ts looseFieldScore).
    void looseSearchFindsSquashedAndSubsequenceMatches() {
        EditorWindow window;
        window.setCatalog(catalogFixture());
        window.show();
        window.action("Add node");
        QTest::qWait(100);
        auto catalog = catalogPanel(window);
        QVERIFY(catalog);
        QTRY_VERIFY(find(catalog->rootObject(), "nodeSearch")->hasActiveFocus());
        QTest::keyClicks(catalog, "edgeenhance");
        QTRY_COMPARE(visibleTypes(catalog), QStringList({"nodetool.tools.Sharpen"}));
        QTest::keyClick(catalog, Qt::Key_Backspace, Qt::ControlModifier);
        QTest::keyClicks(catalog, "shrpn");
        QTRY_COMPARE(visibleTypes(catalog), QStringList({"nodetool.tools.Sharpen"}));
        QTest::keyClick(catalog, Qt::Key_Backspace, Qt::ControlModifier);
        QTest::keyClicks(catalog, "shp");
        QTRY_VERIFY(visibleTypes(catalog).isEmpty());
    }

    // The provider chip lists Local first, then API providers, and narrows the
    // list and the category counts (NodeLibrary.tsx:363-430, NodeProviderFilter.tsx).
    void providerFilterNarrowsListAndCounts() {
        auto catalog = catalogFixture();
        catalog.append(entry("fal.image.FluxPro", "Flux Pro", "Generate an image."));
        catalog.append(entry("openai.text.Chat", "Chat", "Answer a prompt."));
        EditorWindow window;
        window.setCatalog(catalog);
        window.show();
        window.action("Add node");
        QTest::qWait(100);
        auto panel = catalogPanel(window);
        QVERIFY(panel);
        auto root = panel->rootObject();
        auto chip = find(root, "catalog-provider-filter");
        QVERIFY(chip);
        QTRY_VERIFY(chip->isVisible());
        QCOMPARE(chip->property("text").toString(), QString("All providers"));
        QStringList labels;
        for (const auto &option : root->property("providerOptions").toList()) {
            labels.append(option.toMap().value("label").toString());
        }
        QCOMPARE(labels, QStringList({"All providers", "Local", "FAL", "OpenAI"}));
        QTest::mouseClick(panel->quickWindow(), Qt::LeftButton, Qt::NoModifier, chip->mapToScene(QPointF(chip->width() / 2, chip->height() / 2)).toPoint());
        auto popup = chip->property("popup").value<QObject *>();
        QVERIFY(popup);
        QTRY_VERIFY(popup->property("opened").toBool());
        QQuickItem *fal = nullptr;
        QTRY_VERIFY((fal = find(panel->quickWindow()->contentItem(), "chip-option-2")) && fal->isVisible());
        // The menu settles its geometry after it opens.
        QTest::qWait(80);
        QCOMPARE(fal->property("shortcutText").toString(), QString("1"));
        capture(window, "catalog-providers");
        QTest::mouseClick(panel->quickWindow(), Qt::LeftButton, Qt::NoModifier, fal->mapToScene(QPointF(fal->width() / 2, fal->height() / 2)).toPoint());
        QTRY_COMPARE(visibleTypes(panel), QStringList({"fal.image.FluxPro"}));
        QCOMPARE(chip->property("text").toString(), QString("FAL"));
        QCOMPARE(root->property("categories").toList().first().toMap().value("count").toInt(), 1);
        // A search stays inside the provider.
        find(root, "nodeSearch")->forceActiveFocus();
        QTest::keyClicks(panel, "chat");
        QTRY_VERIFY(visibleTypes(panel).isEmpty());
    }

    // Title, node type, namespace and description all match, and the web
    // weights order the result (utils/ranking.ts fieldScore, nodeRanking.ts).
    void searchRanksEveryFieldByWebWeights() {
        EditorWindow window;
        window.setCatalog(catalogFixture());
        window.show();
        window.action("Add node");
        QTest::qWait(100);
        auto catalog = catalogPanel(window);
        QVERIFY(catalog);
        auto search = find(catalog->rootObject(), "nodeSearch");
        QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        QTest::keyClicks(catalog, "resize");
        QTRY_COMPARE(visibleTypes(catalog), QStringList({"nodetool.image.Resize", "nodetool.tools.Blur"}));
        QCOMPARE(find(catalog->rootObject(), "catalog-count")->property("text").toString(), QString("2"));
        // A comma splits pieces, which match independently.
        QTest::keyClick(catalog, Qt::Key_Backspace, Qt::ControlModifier);
        QTRY_VERIFY(catalog->rootObject()->property("query").toString().isEmpty());
        QTest::keyClicks(catalog, "concat, sharpen");
        QTRY_COMPARE(visibleTypes(catalog).size(), 2);
        QVERIFY(visibleTypes(catalog).contains("nodetool.text.Concat"));
        QVERIFY(visibleTypes(catalog).contains("nodetool.tools.Sharpen"));
        QTest::keyClick(catalog, Qt::Key_Backspace, Qt::ControlModifier);
        QTest::keyClicks(catalog, "zzzz");
        QTRY_VERIFY(visibleTypes(catalog).isEmpty());
        auto empty = find(catalog->rootObject(), "catalog-empty-state");
        QVERIFY(empty);
        QTRY_VERIFY(empty->isVisible());
        QCOMPARE(empty->property("title").toString(), QString("No matching nodes"));
    }

    // Enter adds nothing until an arrow picks a row. Arrows wrap. Enter adds
    // the picked row once, with one undo entry (stores/NodeMenuStore.ts:614-633).
    void arrowsPickAndEnterAddsOnce() {
        EditorWindow window;
        window.setCatalog(catalogFixture());
        window.show();
        window.action("Add node");
        QTest::qWait(100);
        auto catalog = catalogPanel(window);
        QVERIFY(catalog);
        auto root = catalog->rootObject();
        QTRY_VERIFY(find(root, "nodeSearch")->hasActiveFocus());
        QTest::keyClicks(catalog, "resize");
        QTRY_COMPARE(visibleTypes(catalog).size(), 2);
        QTest::keyClick(catalog, Qt::Key_Return);
        QTest::qWait(30);
        QVERIFY(window.document()->nodes().isEmpty());
        QTest::keyClick(catalog, Qt::Key_Up);
        QCOMPARE(root->property("highlighted").toInt(), 1);
        QTest::keyClick(catalog, Qt::Key_Down);
        QCOMPARE(root->property("highlighted").toInt(), 0);
        QTest::keyClick(catalog, Qt::Key_Down);
        QCOMPARE(root->property("highlighted").toInt(), 1);
        QTest::keyClick(catalog, Qt::Key_Down);
        QCOMPARE(root->property("highlighted").toInt(), 0);
        auto row = find(root, "catalog-node-nodetool.image.Resize");
        QVERIFY(row);
        QVERIFY(row->property("active").toBool());
        capture(window, "catalog-search");
        QTest::keyClick(catalog, Qt::Key_Return);
        QTRY_COMPARE(window.document()->nodes().size(), 1);
        QCOMPARE(window.document()->nodes().first().toObject()["type"].toString(), QString("nodetool.image.Resize"));
        QCOMPARE(window.document()->undoStack()->count(), 1);
        // A new search clears the pick, so Enter again adds nothing.
        QTest::keyClicks(catalog, "x");
        QCOMPARE(root->property("highlighted").toInt(), -1);
        QTest::keyClick(catalog, Qt::Key_Return);
        QTest::qWait(30);
        QCOMPARE(window.document()->nodes().size(), 1);
        window.action("Undo");
        QVERIFY(window.document()->nodes().isEmpty());
    }

    // Space over the canvas opens the catalog for the pointer. The next add
    // lands there, then the keyboard returns to the canvas (useNodeEditorShortcuts.ts:160-178).
    void spaceAddsAtThePointer() {
        EditorWindow window;
        window.setCatalog(catalogFixture());
        window.show();
        QTest::qWait(100);
        auto view = window.findChild<QGraphicsView *>();
        QVERIFY(view);
        view->scale(0.8, 0.8);
        const QPoint pointer(view->viewport()->width() / 3, view->viewport()->height() / 3);
        const auto expected = view->mapToScene(pointer);
        QCursor::setPos(view->viewport()->mapToGlobal(pointer));
        QCOMPARE(view->viewport()->mapFromGlobal(QCursor::pos()), pointer);
        view->setFocus();
        QTest::keyClick(view->viewport(), Qt::Key_Space);
        QVERIFY(window.catalogAtPointer());
        auto catalog = catalogPanel(window);
        QVERIFY(catalog);
        auto root = catalog->rootObject();
        QTRY_VERIFY(find(root, "nodeSearch")->hasActiveFocus());
        QTRY_COMPARE(find(root, "catalog-footer-hint")->property("text").toString(), QString("adds at the pointer"));
        capture(window, "catalog-pointer");
        QTest::keyClicks(catalog, "concat");
        QTest::keyClick(catalog, Qt::Key_Down);
        QTest::keyClick(catalog, Qt::Key_Return);
        QTRY_COMPARE(window.document()->nodes().size(), 1);
        QCOMPARE(position(window.document()->nodes().first().toObject()), expected);
        QVERIFY(!window.catalogAtPointer());
        QTRY_VERIFY(view->hasFocus());
        QCOMPARE(window.document()->undoStack()->count(), 1);
        // Escape in the search closes the pointer menu without adding.
        QTest::keyClick(view->viewport(), Qt::Key_Space);
        QVERIFY(window.catalogAtPointer());
        QTRY_VERIFY(find(root, "nodeSearch")->hasActiveFocus());
        QTest::keyClicks(catalog, "blur");
        QTest::keyClick(catalog, Qt::Key_Escape);
        QVERIFY(!window.catalogAtPointer());
        QTRY_VERIFY(root->property("query").toString().isEmpty());
        QTRY_VERIFY(view->hasFocus());
        QCOMPARE(window.document()->nodes().size(), 1);
        // Space in an empty search closes it too.
        QTest::keyClick(view->viewport(), Qt::Key_Space);
        QVERIFY(window.catalogAtPointer());
        QTRY_VERIFY(find(root, "nodeSearch")->hasActiveFocus());
        QTest::keyClick(catalog, Qt::Key_Space);
        QVERIFY(!window.catalogAtPointer());
        QTRY_VERIFY(view->hasFocus());
        QVERIFY(root->property("query").toString().isEmpty());
    }

    // Repeated adds from the catalog without moving the pointer would stack on
    // one spot. The new card moves to the nearest free vertical slot
    // (hooks/useCreateNode.ts:64-75, utils/nodePlacement.ts).
    void repeatedAddsClearEarlierCards() {
        EditorWindow window;
        window.setCatalog(catalogFixture());
        window.show();
        window.action("Add node");
        QTest::qWait(100);
        auto catalog = catalogPanel(window);
        QVERIFY(catalog);
        for (int count = 1; count <= 3; ++count) {
            // A recent node moves to the top, so the row is found again each time.
            QTest::qWait(30);
            auto row = find(catalog->rootObject(), "catalog-node-nodetool.text.Concat");
            QVERIFY(row);
            QTest::mouseClick(catalog->quickWindow(), Qt::LeftButton, Qt::NoModifier, row->mapToScene(QPointF(row->width() / 2, row->height() / 2)).toPoint());
            QTRY_COMPARE(window.document()->nodes().size(), count);
        }
        for (const auto &value : window.document()->nodes()) {
            QCOMPARE(value.toObject()["type"].toString(), QString("nodetool.text.Concat"));
        }
        auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
        QVector<QRectF> cards;
        for (const auto id : model.allNodeIds()) {
            cards.append(QRectF(model.nodeData(id, QtNodes::NodeRole::Position).toPointF(), QSizeF(model.layout(id).size)));
        }
        QCOMPARE(cards.size(), 3);
        for (int a = 0; a < cards.size(); ++a) {
            for (int b = a + 1; b < cards.size(); ++b) {
                QVERIFY2(!cards[a].intersects(cards[b]), "catalog adds overlap");
                QCOMPARE(cards[a].x(), cards[b].x());
            }
        }
        QCOMPARE(window.document()->undoStack()->count(), 3);
    }

    // A double-click on the empty pane arms the pointer point. A pane press
    // closes it, and a later catalog click adds in the visible center
    // (usePaneEvents.ts:47-64, :95-98, NodeCreateBridge.tsx:23-28).
    void paneDoubleClickAddsAtThePointer() {
        EditorWindow window;
        window.setCatalog(catalogFixture());
        window.show();
        QTest::qWait(100);
        auto view = window.findChild<QGraphicsView *>();
        QVERIFY(view);
        const QPoint pointer(view->viewport()->width() / 2 + 37, view->viewport()->height() / 2 - 41);
        const auto expected = view->mapToScene(pointer);
        QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, pointer);
        QVERIFY(window.catalogAtPointer());
        auto catalog = catalogPanel(window);
        QVERIFY(catalog);
        auto row = find(catalog->rootObject(), "catalog-node-nodetool.tools.Sharpen");
        QVERIFY(row);
        QTest::mouseClick(catalog->quickWindow(), Qt::LeftButton, Qt::NoModifier, row->mapToScene(QPointF(row->width() / 2, row->height() / 2)).toPoint());
        QTRY_COMPARE(window.document()->nodes().size(), 1);
        const auto added = window.document()->nodes().first().toObject();
        QCOMPARE(position(added), expected);
        QVERIFY(!window.catalogAtPointer());
        // A double-click on a card does not arm the menu.
        const auto card = view->mapFromScene(expected + QPointF(20, 20));
        QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, card);
        QVERIFY(!window.catalogAtPointer());
        // A header double-click may collapse the card, which is its own edit.
        const auto edits = window.document()->undoStack()->count();
        const QPoint other(40, view->viewport()->height() - 60);
        QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, other);
        QVERIFY(window.catalogAtPointer());
        QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, other);
        QVERIFY(!window.catalogAtPointer());
        QTest::qWait(30);
        row = find(catalog->rootObject(), "catalog-node-nodetool.tools.Sharpen");
        QVERIFY(row);
        QTest::mouseClick(catalog->quickWindow(), Qt::LeftButton, Qt::NoModifier, row->mapToScene(QPointF(row->width() / 2, row->height() / 2)).toPoint());
        QTRY_COMPARE(window.document()->nodes().size(), 2);
        QVERIFY(position(window.document()->nodes().last().toObject()) != view->mapToScene(other));
        QCOMPARE(window.document()->undoStack()->count(), edits + 1);
    }

    // Read-only documents and replaced workflows never keep a pointer point.
    void readOnlyAndReplacedDocumentsDropThePoint() {
        EditorWindow window;
        window.setCatalog(catalogFixture());
        window.show();
        QTest::qWait(100);
        auto view = window.findChild<QGraphicsView *>();
        QVERIFY(view);
        const QPoint pointer(80, 90);
        QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, pointer);
        QVERIFY(window.catalogAtPointer());
        QJsonObject replacement{{"name", "Replacement"}, {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
        QVERIFY(window.document()->load(replacement));
        QTRY_VERIFY(!window.catalogAtPointer());
        auto locked = replacement;
        auto graph = locked["graph"].toObject();
        graph["links"] = QJsonArray{QJsonObject{{"future", true}}};
        locked["graph"] = graph;
        QVERIFY(window.document()->load(locked));
        QVERIFY(window.readOnly());
        QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, pointer);
        QVERIFY(!window.catalogAtPointer());
        QCursor::setPos(view->viewport()->mapToGlobal(pointer));
        QTest::keyClick(view->viewport(), Qt::Key_Space);
        QVERIFY(!window.catalogAtPointer());
        window.addNode("nodetool.text.Concat");
        QCOMPARE(window.document()->snapshot(), locked);
    }
};

QTEST_MAIN(CatalogTest)
#include "CatalogTest.moc"
