#include "ui/EditorWindow.h"
#include "graph/CatalogSearch.h"
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

// A node with typed properties and outputs, for the node menu's type filters.
QJsonObject typedEntry(const QString &type, const QString &title, const QStringList &inputs, const QStringList &outputs) {
    auto node = entry(type, title, QString());
    QJsonArray properties;
    for (int i = 0; i < inputs.size(); ++i) {
        properties.append(QJsonObject{{"name", QString("in%1").arg(i)}, {"type", QJsonObject{{"type", inputs[i]}}}});
    }
    QJsonArray results;
    for (int i = 0; i < outputs.size(); ++i) {
        results.append(QJsonObject{{"name", QString("out%1").arg(i)}, {"type", QJsonObject{{"type", outputs[i]}}}});
    }
    node["properties"] = properties;
    node["outputs"] = results;
    return node;
}

QJsonArray typedFixture() {
    return QJsonArray{
        typedEntry("nodetool.image.Resize", "Resize", {"image", "int"}, {"image"}),
        typedEntry("nodetool.text.Summarize", "Summarize", {"text"}, {"text"}),
        typedEntry("fal.image.FluxPro", "Flux Pro", {"str"}, {"image"}),
        typedEntry("nodetool.audio.Mix", "Mix", {"audio"}, {"audio"}),
        typedEntry("nodetool.math.Add", "Add", {"float"}, {"float"}),
        typedEntry("nodetool.control.Sink", "Sink", {"any"}, {}),
    };
}

// The node menu opens where the pane is double-clicked. Its type chips and home tiles appear then.
QQuickWidget *openNodeMenu(EditorWindow &window, const QPoint &offset = QPoint(37, -41)) {
    window.show();
    QTest::qWait(100);
    auto view = window.findChild<QGraphicsView *>();
    if (!view) {
        return nullptr;
    }
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(view->viewport()->width() / 2, view->viewport()->height() / 2) + offset);
    return window.catalogAtPointer() ? catalogPanel(window) : nullptr;
}

QStringList toStrings(const QVariant &list) {
    QStringList out;
    for (const auto &value : list.toList()) {
        out.append(value.toString());
    }
    return out;
}

void click(QQuickWidget *panel, QQuickItem *item) {
    // The layout settles after a list or tile change, so the point is read after it.
    QTest::qWait(50);
    const auto point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
    QTest::mouseClick(panel->quickWindow(), Qt::LeftButton, Qt::NoModifier, point);
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

    // The node menu has type chips: Local and API providers, five output types
    // and input and output type menus. They filter by the types a node declares
    // (components/node_menu/TypeFilterChips.tsx, typeFilterUtils.ts filterDataByExactType).
    // The docked library has none, so its list ignores them.
    void typeChipsFilterByDeclaredTypes() {
        EditorWindow window;
        window.setCatalog(typedFixture());
        window.show();
        window.action("Add node");
        QTest::qWait(100);
        auto docked = catalogPanel(window);
        QVERIFY(docked);
        QVERIFY(!find(docked->rootObject(), "catalog-type-chips")->isVisible());
        auto panel = openNodeMenu(window);
        QVERIFY(panel);
        auto root = panel->rootObject();
        auto chips = find(root, "catalog-type-chips");
        QVERIFY(chips);
        QTRY_VERIFY(chips->isVisible());
        QCOMPARE(find(root, "catalog-type-count")->property("text").toString(), QString("6 nodes"));
        QCOMPARE(visibleTypes(panel).size(), 6);

        auto chip = [&](const QString &name) {
            auto item = find(root, "catalog-chip-" + name);
            return item;
        };
        for (const auto &name : QStringList{"local", "api", "image", "text", "audio", "video", "number"}) {
            QVERIFY2(chip(name), qPrintable(name));
        }
        click(panel, chip("image"));
        QTRY_COMPARE(visibleTypes(panel), QStringList({"fal.image.FluxPro", "nodetool.image.Resize"}));
        QVERIFY(chip("image")->property("active").toBool());
        QCOMPARE(find(root, "catalog-type-count")->property("text").toString(), QString("6 nodes"));
        click(panel, chip("local"));
        QTRY_COMPARE(visibleTypes(panel), QStringList({"nodetool.image.Resize"}));
        click(panel, chip("local"));
        click(panel, chip("api"));
        QTRY_COMPARE(visibleTypes(panel), QStringList({"fal.image.FluxPro"}));
        click(panel, chip("api"));
        click(panel, chip("image"));
        QTRY_COMPARE(visibleTypes(panel).size(), 6);
        click(panel, chip("number"));
        QTRY_COMPARE(visibleTypes(panel), QStringList({"nodetool.math.Add"}));
        click(panel, chip("number"));
        QTRY_COMPARE(visibleTypes(panel).size(), 6);

        // The input type menu lists the declared types and filters on properties.
        QCOMPARE(toStrings(root->property("typeOptions")), QStringList({"any", "audio", "float", "image", "int", "str", "text"}));
        root->setProperty("inputType", "text");
        QTRY_COMPARE(visibleTypes(panel), QStringList({"nodetool.text.Summarize"}));
        root->setProperty("inputType", "any");
        QTRY_COMPARE(visibleTypes(panel), QStringList({"nodetool.control.Sink"}));
        root->setProperty("outputType", "image");
        QTRY_VERIFY(visibleTypes(panel).isEmpty());
        root->setProperty("inputType", "");
        root->setProperty("outputType", "");
        // A filter applies to a search too.
        root->setProperty("outputType", "audio");
        root->setProperty("query", "mix");
        QTRY_COMPARE(visibleTypes(panel), QStringList({"nodetool.audio.Mix"}));
        root->setProperty("query", "resize");
        QTRY_VERIFY(visibleTypes(panel).isEmpty());
        root->setProperty("query", "");
        // The docked library ignores a filter left behind.
        window.cancelCatalogPlacement();
        QTRY_COMPARE(visibleTypes(panel).size(), 6);
        QTRY_VERIFY(!chips->isVisible());
    }

    // With nothing typed and no filter, the node menu shows Favorites, Recent
    // nodes and quick-action tiles instead of the list (NamespaceList.tsx home
    // layout, FavoritesTiles.tsx, RecentNodesTiles.tsx, QuickActionTiles.tsx).
    void homeShowsFavoriteRecentAndQuickActionTiles() {
        QSettings().remove("catalog/favoriteNodes");
        auto catalog = catalogFixture();
        catalog.append(entry("nodetool.constant.String", "String", "A text value."));
        catalog.append(entry("nodetool.image.TextToImage", "Text To Image", "Draw."));
        EditorWindow window;
        window.setCatalog(catalog);
        auto panel = openNodeMenu(window);
        QVERIFY(panel);
        auto root = panel->rootObject();
        auto home = find(root, "catalog-home");
        QVERIFY(home);
        QTRY_VERIFY(home->isVisible());
        QVERIFY(!find(root, "catalog-rows")->isVisible());
        capture(window, "catalog-menu");
        QStringList titles;
        for (const auto &section : root->property("quickActions").toList()) {
            titles.append(section.toMap().value("title").toString());
        }
        QCOMPARE(titles, QStringList({"AI nodes", "Provider models", "Constants"}));
        // The tiles and the ranking boost name the same quick-action nodes.
        auto tileTypes = toStrings(root->property("quickActionTypeList"));
        auto boosted = catalogQuickActionTypes();
        tileTypes.sort();
        boosted.sort();
        QCOMPARE(tileTypes, boosted);
        // Neither favorites nor recent nodes exist yet, so only the quick actions show.
        QVERIFY(!find(root, "catalog-favorites")->isVisible());
        QVERIFY(!find(root, "catalog-recent")->isVisible());
        auto tile = find(root, "catalog-tile-nodetool.image.TextToImage");
        QVERIFY(tile);
        QVERIFY(tile->isEnabled());
        // A node that the catalog lacks keeps its tile but cannot add.
        auto missing = find(root, "catalog-tile-nodetool.video.LipSync");
        QVERIFY(missing);
        QVERIFY(!missing->isEnabled());

        // A tile adds its node at the pointer and the menu closes.
        click(panel, tile);
        QTRY_COMPARE(window.document()->nodes().size(), 1);
        QCOMPARE(window.document()->nodes().first().toObject()["type"].toString(), QString("nodetool.image.TextToImage"));
        QVERIFY(!window.catalogAtPointer());

        // Typing leaves the home layout for the ranked list.
        window.cancelCatalogPlacement();
        panel = openNodeMenu(window, QPoint(-300, 150));
        QVERIFY(panel);
        find(root, "nodeSearch")->forceActiveFocus();
        QTest::keyClicks(panel, "sharp");
        QTRY_VERIFY(!find(root, "catalog-home")->isVisible());
        QTRY_VERIFY(find(root, "catalog-rows")->isVisible());
        // A recent node outside the quick actions gets a Recent tile. A quick action does not.
        QQuickItem *sharpen = nullptr;
        QTRY_VERIFY((sharpen = find(root, "catalog-node-nodetool.tools.Sharpen")) && sharpen->isVisible());
        click(panel, sharpen);
        QTRY_COMPARE(window.document()->nodes().size(), 2);
        QCOMPARE(window.catalogRecent(), QStringList({"nodetool.tools.Sharpen", "nodetool.image.TextToImage"}));
        panel = openNodeMenu(window, QPoint(-300, -150));
        QTRY_VERIFY(find(root, "nodeSearch"));
        find(root, "nodeSearch")->forceActiveFocus();
        QTest::keyClick(panel, Qt::Key_Backspace, Qt::ControlModifier);
        QVERIFY(panel);
        auto recent = find(root, "catalog-recent");
        QTRY_VERIFY(recent->isVisible());
        QVERIFY(find(root, "catalog-recent-tile-nodetool.tools.Sharpen"));
        QVERIFY(!find(root, "catalog-recent-tile-nodetool.image.TextToImage"));

        // A star on a row adds a favorite. Twelve is the limit and the newest comes first.
        QTest::keyClicks(panel, "concat");
        QTRY_VERIFY(find(root, "catalog-node-nodetool.text.Concat"));
        auto star = find(root, "catalog-favorite-nodetool.text.Concat");
        QVERIFY(star);
        QVERIFY(!star->property("active").toBool());
        // The star shows on hover.
        QVERIFY(!star->isVisible());
        auto concatRow = find(root, "catalog-node-nodetool.text.Concat");
        QTest::mouseMove(panel->quickWindow(), concatRow->mapToScene(QPointF(concatRow->width() / 3, concatRow->height() / 2)).toPoint());
        QTRY_VERIFY(star->isVisible());
        click(panel, star);
        QCOMPARE(window.catalogFavorites(), QStringList({"nodetool.text.Concat"}));
        QCOMPARE(QSettings().value("catalog/favoriteNodes").toStringList(), QStringList({"nodetool.text.Concat"}));
        QTRY_VERIFY(star->property("active").toBool());
        find(root, "nodeSearch")->forceActiveFocus();
        QTest::keyClick(panel, Qt::Key_Backspace, Qt::ControlModifier);
        QTRY_VERIFY(find(root, "catalog-favorites")->isVisible());
        auto favorite = find(root, "catalog-favorite-tile-nodetool.text.Concat");
        QVERIFY(favorite);
        // The remove button on a tile and Clear leave the list empty.
        click(panel, find(root, "catalog-favorite-remove-nodetool.text.Concat"));
        QTRY_VERIFY(window.catalogFavorites().isEmpty());
        QTRY_VERIFY(!find(root, "catalog-favorites")->isVisible());
        window.toggleCatalogFavorite("nodetool.text.Concat");
        window.toggleCatalogFavorite("nodetool.tools.Blur");
        QCOMPARE(window.catalogFavorites(), QStringList({"nodetool.tools.Blur", "nodetool.text.Concat"}));
        QTRY_VERIFY(find(root, "catalog-favorites")->isVisible());
        click(panel, find(root, "catalog-favorites-clear"));
        QTRY_VERIFY(window.catalogFavorites().isEmpty());
        click(panel, find(root, "catalog-recent-clear"));
        QTRY_VERIFY(window.catalogRecent().isEmpty());
        for (int i = 0; i < 14; ++i) {
            window.toggleCatalogFavorite(QString("nodetool.fake.Node%1").arg(i));
        }
        QCOMPARE(window.catalogFavorites().size(), 12);
        QCOMPARE(window.catalogFavorites().first(), QString("nodetool.fake.Node13"));
        QSettings().remove("catalog/favoriteNodes");
    }

    // CatalogSearchFixture.json holds what web utils/nodeSearch.ts rankSearchNodes
    // returns for real node metadata (scripts/generate-catalog-search-fixture.mjs).
    // The native catalog lists the same top nodes in the same order, and counts the same results.
    void rankingMatchesTheWebAlgorithmOnRealMetadata() {
        QFile file(QFINDTESTDATA("CatalogSearchFixture.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        QJsonArray catalog;
        for (const auto &item : fixture["nodes"].toArray()) {
            const auto value = item.toObject();
            auto node = entry(value["node_type"].toString(), value["title"].toString(), value["description"].toString());
            node["namespace"] = value["namespace"].toString();
            node["deprecated"] = value["deprecated"].toBool();
            catalog.append(node);
        }
        QVERIFY(catalog.size() > 500);
        const auto cases = fixture["cases"].toArray();
        QSet<QString> recentLists;
        for (const auto &value : cases) {
            recentLists.insert(value.toObject()["recent"].toVariant().toStringList().join(','));
        }
        int compared = 0;
        // Recent nodes come from settings, so each distinct list starts its own window.
        for (const auto &recentKey : recentLists) {
            QSettings().setValue("catalog/recentNodes", recentKey.isEmpty() ? QStringList{} : recentKey.split(','));
            EditorWindow window;
            // The web lists every pack's nodes, so the optional packs of this editor are on.
            window.packSetup()->setAllCategories(true);
            window.setCatalog(catalog);
            window.show();
            window.action("Add node");
            QTest::qWait(100);
            auto panel = catalogPanel(window);
            QVERIFY(panel);
            auto root = panel->rootObject();
            for (const auto &value : cases) {
                if (value.toObject()["recent"].toVariant().toStringList().join(',') != recentKey) {
                    continue;
                }
                const auto spec = value.toObject();
                root->setProperty("query", spec["query"].toString());
                const auto expected = spec["top"].toVariant().toStringList();
                const auto actual = visibleTypes(panel);
                const auto label = QStringLiteral("%1 (%2)").arg(spec["name"].toString(), spec["query"].toString());
                QVERIFY2(actual.size() == spec["total"].toInt(), qPrintable(label + QStringLiteral(": %1 results, web %2").arg(actual.size()).arg(spec["total"].toInt())));
                QVERIFY2(actual.mid(0, expected.size()) == expected,
                         qPrintable(label + QStringLiteral(": native %1, web %2").arg(actual.mid(0, 6).join(' '), expected.mid(0, 6).join(' '))));
                ++compared;
            }
        }
        QCOMPARE(compared, cases.size());
    }

    // A query that is no substring still finds a node through the fuzzy pass
    // (utils/fuzzyMatch.ts). A scattered subsequence below its 0.3 cutoff finds
    // nothing, and so does a query under three characters.
    void fuzzySearchFindsSubsequencesAboveTheCutoff() {
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
        QTRY_VERIFY(visibleTypes(catalog).isEmpty());
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
        // The node menu opens on its home tiles, so the node is searched first.
        find(catalog->rootObject(), "nodeSearch")->forceActiveFocus();
        QTest::keyClicks(catalog, "sharp");
        QQuickItem *row = nullptr;
        QTRY_VERIFY((row = find(catalog->rootObject(), "catalog-node-nodetool.tools.Sharpen")) && row->isVisible());
        click(catalog, row);
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
