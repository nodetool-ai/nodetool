#include "graph/LineageLayer.h"
#include "document/WorkflowDocument.h"
#include <QApplication>
#include <QContextMenuEvent>
#include <QGraphicsObject>
#include <QGraphicsScene>
#include <QGraphicsView>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPainter>
#include <QSignalSpy>
#include <QtTest>
#include <memory>
using namespace nodetool::node_editor;
namespace {
QJsonObject graph() {
  return {{"nodes", QJsonArray{QJsonObject{{"id", "a"}, {"type", "Node"}},
                               QJsonObject{{"id", "b"}, {"type", "Node"}}}},
          {"edges", QJsonArray{}},
          {"links", QJsonArray{QJsonObject{{"id", "lineage"},
                                           {"source", "a"},
                                           {"target", "b"},
                                           {"label", "reference"},
                                           {"kind", "source"},
                                           {"future", 42}}}}};
}
QHash<QString, QRectF> geometry() {
  return {{"a", {0, 0, 100, 50}}, {"b", {400, 0, 100, 50}}};
}
} // namespace
class LineageLayerTest final : public QObject {
  Q_OBJECT
private slots:
  void facingAnchorsAndBezier() {
    const auto forward = lineageAnchors({0, 0, 100, 50}, {400, 0, 100, 50});
    QCOMPARE(forward.source, QPointF(100, 25));
    QCOMPARE(forward.target, QPointF(400, 25));
    QCOMPARE(forward.sourceSide, LineageSide::Right);
    QCOMPARE(forward.targetSide, LineageSide::Left);
    const auto reverse = lineageAnchors({400, 0, 100, 50}, {0, 0, 100, 50});
    QCOMPARE(reverse.source, QPointF(400, 25));
    QCOMPARE(reverse.target, QPointF(100, 25));
    QCOMPARE(reverse.sourceSide, LineageSide::Left);
    const auto down = lineageAnchors({0, 0, 100, 50}, {0, 400, 100, 50});
    QCOMPARE(down.source, QPointF(50, 50));
    QCOMPARE(down.target, QPointF(50, 400));
    QCOMPARE(down.sourceSide, LineageSide::Bottom);
    const auto up = lineageAnchors({0, 400, 100, 50}, {0, 0, 100, 50});
    QCOMPARE(up.source, QPointF(50, 400));
    QCOMPARE(up.target, QPointF(50, 50));
    QCOMPARE(up.sourceSide, LineageSide::Top);
    const auto path = lineageCurve({0, 0, 100, 50}, {400, 0, 100, 50});
    QCOMPARE(path.elementCount(), 4);
    QCOMPARE(path.pointAtPercent(0), forward.source);
    QCOMPARE(path.pointAtPercent(1), forward.target);
    QCOMPARE(QPointF(path.elementAt(1).x, path.elementAt(1).y),
             QPointF(250, 25));
    QCOMPARE(path.pointAtPercent(.5), QPointF(250, 25));
    // Overlapping boxes use XYFlow's negative-distance curvature formula.
    const auto overlap = lineageCurve({0, 0, 100, 50}, {50, 0, 100, 50});
    QVERIFY(overlap.elementAt(1).x > 100);
    QVERIFY(overlap.elementAt(2).x < 50);
  }
  void renderingSelectionMovementAndZoom() {
    QGraphicsScene scene;
    LineageLayer layer(scene);
    QVERIFY(layer.update(graph(), geometry()).isEmpty());
    QVERIFY(layer.linkItem("lineage"));
    QCOMPARE(layer.linkItem("lineage")->zValue(), -100000.0);
    QVERIFY(layer.linkItem("lineage")->shape().contains(QPointF(250, 31)));
    QVERIFY(!layer.linkItem("lineage")->shape().contains(QPointF(250, 40)));
    QGraphicsView view(&scene);
    view.setSceneRect(-20, -50, 560, 170);
    view.resize(700, 300);
    view.show();
    QApplication::processEvents();
    QSignalSpy selected(&layer, &LineageLayer::selectionRequested),
        deleted(&layer, &LineageLayer::deleteRequested),
        menus(&layer, &LineageLayer::contextMenuRequested);
    const auto click = [&](Qt::MouseButton button,
                           Qt::KeyboardModifiers modifiers = Qt::NoModifier) {
      QTest::mouseClick(
          view.viewport(), button, modifiers,
          view.mapFromScene(layer.linkPath("lineage").pointAtPercent(.5)));
    };
    click(Qt::LeftButton);
    QCOMPARE(selected.size(), 1);
    QCOMPARE(selected.last()[0].toString(), "lineage");
    QVERIFY(!selected.last()[1].toBool());
    click(Qt::LeftButton, Qt::ShiftModifier);
    QVERIFY(selected.last()[1].toBool());
    layer.setSelectedLinkIds({"lineage", "missing"});
    QCOMPARE(layer.selectedLinkIds(), QStringList{"lineage"});
    QTest::keyClick(&view, Qt::Key_Delete);
    QCOMPARE(deleted.size(), 1);
    QTest::keyClick(&view, Qt::Key_Backspace);
    QCOMPARE(deleted.size(), 2);
    QTest::keyClick(&view, Qt::Key_Space);
    QVERIFY(!selected.last()[1].toBool());
    click(Qt::MiddleButton);
    QCOMPARE(deleted.size(), 3);
    const auto point = view.mapFromScene(QPointF(250, 25));
    QContextMenuEvent context(QContextMenuEvent::Mouse, point,
                              view.viewport()->mapToGlobal(point));
    QApplication::sendEvent(view.viewport(), &context);
    QCOMPARE(menus.size(), 1);
    const auto before = layer.linkPath("lineage");
    view.scale(.5, .5);
    click(Qt::LeftButton);
    QCOMPARE(selected.size(), 4);
    QCOMPARE(layer.linkPath("lineage"), before);
    auto moved = geometry();
    moved["a"].translate(50, 80);
    moved["b"].translate(50, 80);
    QVERIFY(layer.update(graph(), moved).isEmpty());
    QCOMPARE(layer.linkPath("lineage").pointAtPercent(.5), QPointF(300, 105));
    const auto selectedCount = selected.size();
    // Ordinary node/wire input wins above the lineage layer.
    auto *above = scene.addRect(QRectF(290, 95, 20, 20));
    above->setFlag(QGraphicsItem::ItemIsSelectable);
    above->setZValue(0);
    click(Qt::LeftButton);
    QCOMPARE(selected.size(), selectedCount);
    QVERIFY(above->isSelected());
    QImage image(700, 300, QImage::Format_ARGB32_Premultiplied);
    image.fill(Qt::white);
    QPainter painter(&image);
    scene.render(&painter);
    painter.end();
    qsizetype colored = 0;
    for (int y = 0; y < image.height(); ++y) {
      for (int x = 0; x < image.width(); ++x) {
        if (image.pixelColor(x, y) != QColor(Qt::white)) {
          ++colored;
        }
      }
    }
    QVERIFY(colored > 100);
  }
  void atomicValidationAndSceneResetOwnership() {
    QGraphicsScene scene;
    LineageLayer layer(scene);
    const auto original = graph();
    QVERIFY(layer.update(original, geometry()).isEmpty());
    const auto path = layer.linkPath("lineage");
    auto malformed = original;
    auto links = original["links"].toArray();
    links.append(links.first());
    malformed["links"] = links;
    QVERIFY(!layer.update(malformed, geometry()).isEmpty());
    QCOMPARE(layer.linkPath("lineage"), path);
    layer.setSelectedLinkIds({"lineage"});
    QPointer<QGraphicsObject> former = layer.linkItem("lineage");
    scene.clear();
    QVERIFY(former.isNull());
    QVERIFY(layer.update(original, geometry()).isEmpty());
    QVERIFY(layer.linkItem("lineage"));
    QCOMPARE(layer.selectedLinkIds(), QStringList{"lineage"});
    LineageTheme theme;
    theme.labelFont.setPointSize(15);
    theme.stroke = Qt::red;
    layer.setTheme(theme);
    QVERIFY(layer.update(original, {{"a", QRectF(0, 0, 100, 50)}}).isEmpty());
    QVERIFY(!layer.linkItem("lineage"));
    QVERIFY(layer.update(original, geometry()).isEmpty());
    QVERIFY(layer.linkItem("lineage"));
    auto empty = original;
    empty["links"] = QJsonArray{};
    QVERIFY(layer.update(empty, geometry()).isEmpty());
    QVERIFY(layer.selectedLinkIds().isEmpty());
    QVERIFY(!layer.linkItem("lineage"));
    QObject owner;
    auto disposable = std::make_unique<QGraphicsScene>();
    // native-rules #3: object has both a QObject parent (&owner) and a std::unique_ptr
    auto surviving = std::make_unique<LineageLayer>(*disposable, &owner);
    QVERIFY(surviving->update(original, geometry()).isEmpty());
    disposable.reset();
    QVERIFY(!surviving->update(original, geometry()).isEmpty());
    surviving.reset();
  }
  void synchronousHostDeletionDuringEvent() {
    WorkflowDocument document;
    QVERIFY(document.load({{"graph", graph()}}));
    QGraphicsScene scene;
    LineageLayer layer(scene);
    QVERIFY(layer.update(document.graph(), geometry()).isEmpty());
    connect(
        &layer, &LineageLayer::deleteRequested, &layer, [&](const QString &id) {
          QVERIFY(document.applyCommand({{"op", "removeLink"}, {"id", id}}));
          QVERIFY(layer.update(document.graph(), geometry()).isEmpty());
        });
    // These observers run after the first slot has deleted the emitting item.
    bool observedAfterDeletion = false;
    connect(&layer, &LineageLayer::deleteRequested, &layer,
            [&](const QString &id) {
              QCOMPARE(id.size(), qsizetype(7));
              QCOMPARE(id, QString("lineage"));
              observedAfterDeletion = true;
            });
    QSignalSpy observer(&layer, &LineageLayer::deleteRequested);
    QGraphicsView view(&scene);
    view.setSceneRect(-20, -50, 560, 170);
    view.resize(700, 300);
    view.show();
    QApplication::processEvents();
    QTest::mouseClick(view.viewport(), Qt::MiddleButton, Qt::NoModifier,
                      view.mapFromScene(QPointF(250, 25)));
    QVERIFY(document.graph()["links"].toArray().isEmpty());
    QVERIFY(!layer.linkItem("lineage"));
    QVERIFY(observedAfterDeletion);
    QCOMPARE(observer.size(), 1);
    QCOMPARE(observer.first()[0].toString(), QString("lineage"));
    document.undo();
    QVERIFY(layer.update(document.graph(), geometry()).isEmpty());
    QVERIFY(layer.linkItem("lineage"));
  }
  void largeLayerUpdatesAndClear() {
    auto many = graph();
    QJsonArray links;
    constexpr int count = 4000;
    for (int i = 0; i < count; ++i) {
      links.append(QJsonObject{{"id", QString::number(i)},
                               {"source", "a"},
                               {"target", "b"},
                               {"label", "reference"}});
    }
    many["links"] = links;
    QGraphicsScene scene;
    LineageLayer layer(scene);
    QVERIFY(layer.update(many, geometry()).isEmpty());
    QCOMPARE(scene.items().size(), count);
    LineageTheme theme;
    theme.stroke = Qt::blue;
    layer.setTheme(theme);
    QCOMPARE(layer.linkPath(QString::number(count - 1)).pointAtPercent(.5),
             QPointF(250, 25));
    scene.clear();
    QVERIFY(layer.update(many, geometry()).isEmpty());
    QCOMPARE(scene.items().size(), count);
  }
  void documentCommandsPersistenceAndUndo() {
    WorkflowDocument document;
    auto stored = graph();
    stored["links"] = QJsonArray{};
    QVERIFY(document.load({{"graph", stored}}));
    const auto original = document.snapshot();
    const auto created =
        document.applyCommand({{"op", "addLink"},
                               {"link", QJsonObject{{"source", "a"},
                                                    {"target", "b"},
                                                    {"future", 42},
                                                    {"label", "reference"}}}});
    QVERIFY(created);
    const auto id = created.idMap["link"].toString();
    QCOMPARE(id.size(), 32);
    QCOMPARE(document.undoStack()->count(), 1);
    QVERIFY(document.edges().isEmpty());
    const auto after = document.snapshot();
    const auto duplicate =
        document.applyCommand({{"op", "addLink"},
                               {"link", QJsonObject{{"source", "a"},
                                                    {"target", "b"},
                                                    {"kind", QJsonValue::Null},
                                                    {"label", "ignored"}}}});
    QVERIFY(duplicate);
    QCOMPARE(duplicate.idMap["link"].toString(), id);
    QCOMPARE(document.snapshot(), after);
    QCOMPARE(document.undoStack()->count(), 1);
    document.undo();
    QCOMPARE(document.snapshot(), original);
    document.redo();
    QCOMPARE(document.snapshot(), after);
    const auto copied = document.copy({"a", "b"});
    QCOMPARE(copied["links"].toArray().size(), 1);
    const auto pasted =
        document.applyCommand({{"op", "paste"}, {"fragment", copied}});
    QVERIFY(pasted);
    QCOMPARE(document.graph()["links"].toArray().size(), 2);
    const auto pastedLink =
        document.graph()["links"].toArray().last().toObject();
    QCOMPARE(pastedLink["source"], pasted.idMap["a"]);
    QCOMPARE(pastedLink["target"], pasted.idMap["b"]);
    QCOMPARE(pastedLink["future"].toInt(), 42);
    document.undo();
    QCOMPARE(document.snapshot(), after);
    QVERIFY(document.applyCommand({{"op", "removeLink"}, {"id", id.left(12)}}));
    QVERIFY(document.graph()["links"].toArray().isEmpty());
    document.undo();
    QCOMPARE(document.snapshot(), after);
    QVERIFY(document.applyCommand(
        {{"op", "removeNodes"}, {"ids", QJsonArray{"a"}}}));
    QVERIFY(document.graph()["links"].toArray().isEmpty());
    document.undo();
    QCOMPARE(document.snapshot(), after);
    WorkflowDocument restored;
    QVERIFY(restored.loadJson(QJsonDocument(after).toJson()));
    QCOMPARE(restored.snapshot(), after);
    QVERIFY(!document.applyCommand(
        {{"op", "addLink"},
         {"link", QJsonObject{{"source", "a"}, {"target", "a"}}}}));
    QVERIFY(!document.applyCommand(
        {{"op", "addLink"},
         {"link", QJsonObject{{"source", "a"}, {"target", "missing"}}}}));
    QVERIFY(!document.applyCommand({{"op", "removeLink"}, {"id", "missing"}}));
    QCOMPARE(document.snapshot(), after);
  }
  void importedLinksValidateShapeWithoutDroppingFields() {
    const auto original = graph();
    const auto validLink = original["links"].toArray().first().toObject();
    for (const auto &change : QJsonArray{
             QJsonObject{{"id", ""}}, QJsonObject{{"id", QJsonValue::Null}},
             QJsonObject{{"id", 42}}, QJsonObject{{"label", 42}},
             QJsonObject{{"kind", QJsonArray{}}}}) {
      auto link = validLink;
      const auto fields = change.toObject();
      for (auto it = fields.cbegin(); it != fields.cend(); ++it) {
        link[it.key()] = it.value();
      }
      auto invalid = original;
      invalid["links"] = QJsonArray{link};
      WorkflowDocument document;
      const QJsonObject snapshot{{"graph", invalid}};
      QVERIFY(document.load(snapshot));
      QVERIFY(document.isReadOnly());
      QCOMPARE(document.snapshot(), snapshot);
      QVERIFY(
          !document.applyCommand({{"op", "removeLink"}, {"id", "lineage"}}));
      QCOMPARE(document.snapshot(), snapshot);
    }
    // GraphLink's stored schema and web pruneGraphLinks preserve self-links;
    // only creation through addGraphLink rejects a new self-link.
    auto legacySelf = validLink;
    legacySelf["target"] = "a";
    legacySelf["label"] = QJsonValue::Null;
    legacySelf.remove("kind");
    auto saved = original;
    saved["links"] = QJsonArray{legacySelf};
    WorkflowDocument document;
    QVERIFY(document.load({{"graph", saved}}));
    QVERIFY(!document.isReadOnly());
    QCOMPARE(document.graph()["links"]
                 .toArray()
                 .first()
                 .toObject()["future"]
                 .toInt(),
             42);
    QGraphicsScene scene;
    LineageLayer layer(scene);
    QVERIFY(layer.update(document.graph(), geometry()).isEmpty());
    QVERIFY(layer.linkItem("lineage"));
  }
  void selectedOrderingKindsAndAmbiguity() {
    WorkflowDocument document;
    QVERIFY(document.loadJson(
        R"({"graph":{"nodes":[{"id":"a","type":"Node","ui_properties":{"position":{"x":100,"y":20}}},{"id":"b","type":"Node","ui_properties":{"position":{"x":10,"y":200}}}],"edges":[],"links":[]}})"));
    auto result =
        document.applyCommand({{"op", "linkNodes"},
                               {"ids", QJsonArray{"a", "b"}},
                               {"id", "0123456789ab00000000000000000000"}});
    QVERIFY(result);
    const auto link = document.graph()["links"].toArray()[0].toObject();
    QCOMPARE(link["source"].toString(), "b");
    QCOMPARE(link["target"].toString(), "a");
    QVERIFY(document.applyCommand(
        {{"op", "addLink"},
         {"link", QJsonObject{{"id", "0123456789ab11111111111111111111"},
                              {"source", "b"},
                              {"target", "a"},
                              {"kind", "alternate"}}}}));
    const auto before = document.snapshot();
    QVERIFY(
        !document.applyCommand({{"op", "removeLink"}, {"id", "0123456789ab"}}));
    QCOMPARE(document.snapshot(), before);
    QVERIFY(!document.applyCommand(
        {{"op", "linkNodes"}, {"ids", QJsonArray{"a"}}}));
    QVERIFY(!document.applyCommand(
        {{"op", "linkNodes"}, {"ids", QJsonArray{"a", "a"}}}));
    QVERIFY(!document.applyCommand(
        {{"op", "batch"},
         {"commands",
          QJsonArray{QJsonObject{{"op", "removeLink"}, {"id", link["id"]}},
                     QJsonObject{{"op", "removeLink"}, {"id", "missing"}}}}}));
    QCOMPARE(document.snapshot(), before);
  }
};
QTEST_MAIN(LineageLayerTest)
#include "LineageLayerTest.moc"
