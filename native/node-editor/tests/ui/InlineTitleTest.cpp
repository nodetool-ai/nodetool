#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include "graph/InlineTitlePresenter.h"
#include "../graph/BodyConnectionFixture.h"
#include <QContextMenuEvent>
#include <QMenu>
#include <QDir>
#include <QClipboard>
#include <QKeyEvent>
#include <QQuickWindow>
#include <QGraphicsObject>
#include <QGraphicsView>
#include <QQuickItem>
#include <QQuickWidget>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtTest>
#include <cmath>
using namespace nodetool;
class InlineTitleTest final : public QObject {
  Q_OBJECT
  static QJsonArray catalog() { return {QJsonObject{{"node_type", "fixture.Text"}, {"title", "Metadata header"}, {"properties", QJsonArray{}}, {"outputs", QJsonArray{}}}}; }
  static QJsonObject workflow() {
    return {{"id", "titles"}, {"graph", QJsonObject{{"nodes", QJsonArray{
      QJsonObject{{"id", "normal"}, {"type", "fixture.Text"}, {"ui_properties", QJsonObject{{"title", "Original note"}, {"future", 42}, {"position", QJsonObject{{"x", 0}, {"y", 0}}}}}},
      QJsonObject{{"id", "other"}, {"type", "fixture.Text"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 600}, {"y", 0}}}}}},
      QJsonObject{{"id", "group"}, {"type", "nodetool.workflows.base_node.Group"}, {"data", QJsonObject{{"headline", "Group headline"}, {"future", true}}}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 300}}}, {"width", 400}, {"height", 220}}}},
      QJsonObject{{"id", "comment"}, {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", "Comment body"}}}, {"ui_properties", QJsonObject{{"title", "Not a separate note"}, {"position", QJsonObject{{"x", 600}, {"y", 300}}}}}}
    }}, {"edges", QJsonArray{}}}}};
  }
  // The edge context menu is a Quick popup; an entry is found by its id.
  static QQuickItem *menuEntry(QQuickWidget *menu, const QString &id) {
    QVariant result;
    QMetaObject::invokeMethod(menu->rootObject(), "itemFor", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, id));
    return qobject_cast<QQuickItem *>(result.value<QObject *>());
  }
  static QtNodes::NodeId nodeId(EditorWindow &window, const QString &resource) {
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    for (const auto id : model.allNodeIds()) if (model.resourceId(id) == resource) return id;
    return QtNodes::InvalidNodeId;
  }
  static QGraphicsObject *note(EditorWindow &window, const QString &resource) {
    for (auto *entry : window.scene()->items())
      if (auto *object = dynamic_cast<QGraphicsObject *>(entry); object && object->objectName() == "node-note-" + resource) return object;
    return nullptr;
  }
  static QQuickWidget *overlay(EditorWindow &window) {
    for (auto *widget : window.findChildren<QQuickWidget *>()) {
      if (widget->objectName() != "inline-title-overlay" || !widget->isVisible() || !widget->rootObject()) continue;
      const auto *field = widget->rootObject()->findChild<QQuickItem *>("inline-title-text");
      if (field && field->hasActiveFocus()) return widget;
    }
    return nullptr;
  }
  static void setup(EditorWindow &window) {
    window.setCatalog(catalog()); QVERIFY(window.document()->load(workflow()));
    window.resize(1400, 1000); window.show(); window.action("Reset zoom"); QTest::qWait(40);
  }
  static void openNote(EditorWindow &window, const QString &resource = "normal") {
    auto *view = window.findChild<QGraphicsView *>(); QVERIFY(view);
    QPointer<QGraphicsObject> surface = note(window, resource); QVERIFY(surface);
    view->centerOn(surface); QTest::qWait(20);
    surface = note(window, resource); QVERIFY(surface);
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(surface->mapToScene(QPointF(25, 14))));
  }
private slots:
  void rerouteContextInsertionLabelAndStaleMenu() {
    EditorWindow window;
    window.setCatalog(body_fixture::catalog());
    const QJsonObject originalEdge{{"id", "wire"}, {"source", "source"}, {"target", "sink"}, {"sourceHandle", "out"}, {"targetHandle", "message"}, {"future", 42}};
    const QJsonObject initial{{"id", "reroute-host"}, {"graph", QJsonObject{
      {"nodes", QJsonArray{body_fixture::node("source", "Fixed", 100), body_fixture::node("sink", "Sink", 500)}},
      {"edges", QJsonArray{originalEdge}}}}};
    QVERIFY(window.document()->load(initial));
    window.resize(1400, 1000); window.show(); window.action("Reset zoom"); QTest::qWait(60);
    auto *viewport = window.findChild<QGraphicsView *>(); QVERIFY(viewport);
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    viewport->scale(1.5, 1.5); viewport->centerOn(420, 140);
    const auto port = [&](const QString &id, QtNodes::PortType side) {
      const auto node = nodeId(window, id);
      return window.scene()->nodeGraphicsObject(node)->scenePos() + window.scene()->nodeGeometry().portPosition(node, side, 0);
    };
    const auto point = wireCurve(port("source", QtNodes::PortType::Out), port("sink", QtNodes::PortType::In)).pointAtPercent(.5);
    const auto pixel = viewport->mapFromScene(point);
    QVERIFY(viewport->viewport()->rect().contains(pixel));
    QContextMenuEvent context(QContextMenuEvent::Mouse, pixel, viewport->viewport()->mapToGlobal(pixel));
    QApplication::sendEvent(viewport->viewport(), &context);
    QTRY_VERIFY(window.findChild<QQuickWidget *>("context-menu-host"));
    auto *menu = window.findChild<QQuickWidget *>("context-menu-host");
    QTest::qWait(60);
    auto *insert = menuEntry(menu, "insert-reroute"); QVERIFY(insert); QVERIFY(insert->isEnabled());
    const auto target = insert->mapToScene(QPointF(insert->width() / 2, insert->height() / 2)).toPoint();
    QTest::mouseMove(menu, target);
    QTest::qWait(30);
    QTest::mouseClick(menu, Qt::LeftButton, Qt::NoModifier, target);
    QTRY_COMPARE(window.document()->nodes().size(), 3);
    QString reroute;
    for (const auto &value : window.document()->nodes()) {
      const auto node = value.toObject();
      if (node["type"] == "nodetool.control.Reroute") { reroute = node["id"].toString(); }
    }
    QVERIFY(!reroute.isEmpty());
    const auto storedPosition = window.document()->node(reroute)["ui_properties"].toObject()["position"].toObject();
    const auto expectedPosition = viewport->mapToScene(pixel);
    QVERIFY(std::abs(storedPosition["x"].toDouble() - expectedPosition.x()) < .01);
    QVERIFY(std::abs(storedPosition["y"].toDouble() - expectedPosition.y()) < .01);
    QCOMPARE(window.document()->undoStack()->index(), 1);
    QTRY_VERIFY(nodeId(window, reroute) != QtNodes::InvalidNodeId);
    QCOMPARE(model.layout(nodeId(window, reroute)).size, QSize(60, 20));
    QTRY_VERIFY(!QApplication::activePopupWidget());
    window.activateWindow(); QTRY_VERIFY(window.isActiveWindow());
    auto *presenter = window.findChild<InlineTitlePresenter *>(); QVERIFY(presenter);
    const auto pill = window.scene()->nodeGraphicsObject(nodeId(window, reroute)); QVERIFY(pill);
    QSignalSpy titleRequested(window.scene(), &EditorScene::titleEditRequested);
    QTest::mouseDClick(viewport->viewport(), Qt::LeftButton, Qt::NoModifier,
                      viewport->mapFromScene(pill->scenePos() + QPointF(30, 10)));
    QCOMPARE(titleRequested.size(), 1);
    QVERIFY(presenter->active());
    QTRY_VERIFY(overlay(window)); QVERIFY(presenter->reroute()); QVERIFY(presenter->singleLine());
    auto *widget = overlay(window);
    const auto clipboard = QApplication::clipboard()->text();
    QApplication::clipboard()->setText("Route\nlabel");
    QTest::keyClick(widget, Qt::Key_V, Qt::ControlModifier);
    auto *field = widget->rootObject()->findChild<QQuickItem *>("inline-title-text"); QVERIFY(field);
    QTRY_COMPARE(field->property("text").toString(), QString("Routelabel"));
    QApplication::clipboard()->setText(clipboard);
    QVERIFY(field->hasActiveFocus());
    QTest::keyClick(widget, Qt::Key_Return, Qt::ShiftModifier);
    QTRY_VERIFY(!presenter->active());
    QVERIFY2(window.document()->node(reroute)["ui_properties"].toObject()["title"].toString() == "Routelabel", qPrintable(window.message()));
    QVERIFY(!note(window, reroute));
    QCOMPARE(window.document()->undoStack()->index(), 2);
    window.action("Undo"); QCOMPARE(window.document()->undoStack()->index(), 1);
    window.action("Undo"); QCOMPARE(window.document()->snapshot(), initial);
    QTRY_COMPARE(model.allNodeIds().size(), size_t(2));
    QContextMenuEvent stale(QContextMenuEvent::Mouse, pixel, viewport->viewport()->mapToGlobal(pixel));
    QApplication::sendEvent(viewport->viewport(), &stale);
    QTRY_VERIFY(window.findChild<QQuickWidget *>("context-menu-host"));
    QPointer<QQuickWidget> staleMenu = window.findChild<QQuickWidget *>("context-menu-host");
    QVERIFY(staleMenu);
    QVERIFY(window.document()->load(initial));
    QTRY_VERIFY(!staleMenu || !staleMenu->isVisible());
    QCoreApplication::processEvents();
    QCOMPARE(window.document()->snapshot(), initial);
    QCOMPARE(window.document()->undoStack()->index(), 0);
  }
  void noteCommitEscapeBlurAndRemove() {
    EditorWindow window; setup(window); QTRY_VERIFY(note(window, "normal"));
    auto *presenter = window.findChild<InlineTitlePresenter *>(); QVERIFY(presenter);
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QCOMPARE(model.layout(nodeId(window, "normal")).title, QString("Metadata header"));
    const auto baseline = window.document()->snapshot();
    openNote(window); QTRY_VERIFY(presenter->active()); QTRY_VERIFY(overlay(window)); auto *widget = overlay(window);
    auto *field = widget->rootObject()->findChild<QQuickItem *>("inline-title-text"); QVERIFY(field); QTRY_VERIFY(field->hasActiveFocus());
    QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier); QTest::keyClicks(widget, "  First line");
    QTest::keyClick(widget, Qt::Key_Return, Qt::ShiftModifier); QTest::keyClicks(widget, "Second line  ");
    QTest::keyClick(widget, Qt::Key_Return);
    QTRY_COMPARE(window.document()->node("normal")["ui_properties"].toObject()["title"].toString(), QString("  First line\nSecond line  "));
    QCOMPARE(window.document()->undoStack()->index(), 1); QCOMPARE(window.document()->node("normal")["ui_properties"].toObject()["future"].toInt(), 42);
    window.action("Undo"); QCOMPARE(window.document()->snapshot(), baseline); QTRY_VERIFY(note(window, "normal"));
    openNote(window); QTRY_VERIFY(overlay(window)); widget = overlay(window); QTest::keyClick(widget, Qt::Key_Return);
    QTRY_VERIFY(!presenter->active()); QCOMPARE(window.document()->undoStack()->index(), 0);
    openNote(window); QTRY_VERIFY(overlay(window)); widget = overlay(window); QTest::keyClicks(widget, "Discard"); QTest::keyClick(widget, Qt::Key_Escape);
    QTRY_VERIFY(!presenter->active()); QCOMPARE(window.document()->snapshot(), baseline);
    openNote(window); QTRY_VERIFY(overlay(window)); widget = overlay(window); QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier); QTest::keyClicks(widget, "Blurred note");
    auto *view = window.findChild<QGraphicsView *>(); QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(20, 20));
    QTRY_COMPARE(window.document()->node("normal")["ui_properties"].toObject()["title"].toString(), QString("Blurred note"));
    QCOMPARE(window.document()->undoStack()->index(), 1); window.action("Undo"); QTRY_VERIFY(note(window, "normal"));
    auto *surface = note(window, "normal"); const auto clearPoint = surface->mapToScene(QPointF(surface->boundingRect().right() - 17, 14));
    QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(clearPoint));
    QTRY_VERIFY(window.document()->node("normal")["ui_properties"].toObject()["title"].toString().isEmpty());
    QCOMPARE(window.document()->undoStack()->index(), 1); QTRY_VERIFY(!note(window, "normal"));
    window.action("Undo"); QCOMPARE(window.document()->snapshot(), baseline);
  }
  void groupHeadlineAndCommentIsolation() {
    EditorWindow window; setup(window); auto *view = window.findChild<QGraphicsView *>(); QVERIFY(view);
    QTest::qWait(40); const auto id = nodeId(window, "group"); QVERIFY(id != QtNodes::InvalidNodeId);
    const auto label = window.scene()->groupLabelRect(id, 1); view->centerOn(label.center()); QTest::qWait(20);
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(label.center()));
    QTRY_VERIFY(overlay(window)); auto *widget = overlay(window);
    QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier); QTest::keyClicks(widget, "Renamed group"); QTest::keyClick(widget, Qt::Key_Return);
    QTRY_COMPARE(window.document()->node("group")["data"].toObject()["headline"].toString(), QString("Renamed group"));
    QCOMPARE(window.document()->undoStack()->index(), 1); QVERIFY(window.document()->node("group")["data"].toObject()["future"].toBool());
    const auto renamedLabel = window.scene()->groupLabelRect(nodeId(window, "group"), std::abs(view->transform().m11()));
    view->centerOn(renamedLabel.center()); QTest::qWait(20);
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(renamedLabel.center()));
    QTRY_VERIFY(overlay(window)); widget = overlay(window);
    QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier); QTest::keyClick(widget, Qt::Key_Backspace); QTest::keyClick(widget, Qt::Key_Return);
    QTRY_VERIFY(window.document()->node("group")["data"].toObject()["headline"].toString().isEmpty());
    QCOMPARE(static_cast<WorkflowGraphModel &>(window.scene()->graphModel()).layout(nodeId(window, "group")).title, QString("Group"));
    QCOMPARE(window.document()->undoStack()->index(), 2);
    QVERIFY(!note(window, "group")); QVERIFY(!note(window, "comment"));
    const auto comment = window.scene()->nodeGraphicsObject(nodeId(window, "comment")); QVERIFY(comment); view->centerOn(comment);
    // A comment's ui title is not a note, but its text edits in place on the card.
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(comment->scenePos() + QPointF(80, 40)));
    QTRY_VERIFY(overlay(window)); QTest::keyClick(overlay(window), Qt::Key_Escape); QTRY_VERIFY(!overlay(window));
    QCOMPARE(window.document()->node("comment")["data"].toObject()["comment"].toString(), QString("Comment body"));
    QCOMPARE(window.document()->node("comment")["ui_properties"].toObject()["title"].toString(), QString("Not a separate note"));
  }
  static void openComment(EditorWindow &window) {
    auto *view = window.findChild<QGraphicsView *>(); QVERIFY(view);
    const auto *card = window.scene()->nodeGraphicsObject(nodeId(window, "comment")); QVERIFY(card);
    view->centerOn(card); QTest::qWait(20);
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(card->scenePos() + QPointF(80, 40)));
  }
  // CommentNode.tsx: the text edits on the card. Enter adds a line, Ctrl+Enter or a
  // blur stores it, Escape discards, and a changed text refits the card height.
  void commentEditsInPlaceAndRefitsTheCard() {
    EditorWindow window; setup(window); auto *presenter = window.findChild<InlineTitlePresenter *>(); QVERIFY(presenter);
    const auto baseline = window.document()->snapshot();
    const auto height = [&] { return window.document()->node("comment")["ui_properties"].toObject()["height"]; };
    openComment(window); QTRY_VERIFY(overlay(window)); auto *widget = overlay(window);
    QVERIFY(presenter->comment()); QVERIFY(!presenter->singleLine());
    auto *field = widget->rootObject()->findChild<QQuickItem *>("inline-title-text"); QVERIFY(field);
    QCOMPARE(field->property("text").toString(), QString("Comment body"));
    QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier); QTest::keyClicks(widget, "First line");
    QTest::keyClick(widget, Qt::Key_Return); QTest::keyClicks(widget, "Second line");
    // Enter only adds a line. Nothing is stored yet.
    QVERIFY(presenter->active()); QCOMPARE(window.document()->undoStack()->index(), 0);
    QTest::keyClick(widget, Qt::Key_Return, Qt::ControlModifier);
    QTRY_COMPARE(window.document()->node("comment")["data"].toObject()["comment"].toString(), QString("First line\nSecond line"));
    QCOMPARE(window.document()->undoStack()->index(), 1);
    // The card refits to two lines of text, in the same undo step.
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto fitted = std::ceil(window.scene()->commentContentHeight("First line\nSecond line", 300));
    QCOMPARE(height().toDouble(), fitted); QVERIFY(fitted < 160 && fitted >= commentMinimumHeight);
    QCOMPARE(model.layout(nodeId(window, "comment")).size.height(), int(fitted));
    window.action("Undo"); QCOMPARE(window.document()->snapshot(), baseline);
    // Escape discards, and an unchanged text stores nothing.
    openComment(window); QTRY_VERIFY(overlay(window)); widget = overlay(window); QTest::keyClicks(widget, " draft"); QTest::keyClick(widget, Qt::Key_Escape);
    QTRY_VERIFY(!presenter->active()); QCOMPARE(window.document()->snapshot(), baseline);
    openComment(window); QTRY_VERIFY(overlay(window)); widget = overlay(window); QTest::keyClick(widget, Qt::Key_Return, Qt::ControlModifier);
    QTRY_VERIFY(!presenter->active()); QCOMPARE(window.document()->undoStack()->index(), 0);
    // A blur stores the text, as the web editor does.
    openComment(window); QTRY_VERIFY(overlay(window)); widget = overlay(window); QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier); QTest::keyClicks(widget, "Blurred");
    auto *view = window.findChild<QGraphicsView *>(); QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(20, 20));
    QTRY_COMPARE(window.document()->node("comment")["data"].toObject()["comment"].toString(), QString("Blurred"));
    QCOMPARE(window.document()->undoStack()->index(), 1);
  }
  // Rich-text comments keep their Lexical formatting, so the native editor leaves them view-only.
  void richTextCommentStaysViewOnly() {
    EditorWindow window; setup(window);
    const QJsonObject lexical{{"root", QJsonObject{{"type", "root"}, {"children", QJsonArray{QJsonObject{{"type", "paragraph"}, {"children", QJsonArray{QJsonObject{{"type", "text"}, {"text", "Bold"}, {"format", 1}}}}}}}}}};
    QVERIFY(window.document()->applyCommand({{"op", "setComment"}, {"id", "comment"}, {"value", lexical}}));
    QTest::qWait(60);
    const auto snapshot = window.document()->snapshot();
    openComment(window); QTest::qWait(150);
    QVERIFY(!overlay(window)); QCOMPARE(window.document()->snapshot(), snapshot);
    window.selectNode("comment"); window.action("Edit comment"); QTest::qWait(100);
    QVERIFY(!overlay(window)); QCOMPARE(window.document()->snapshot(), snapshot);
  }
  void shortcutAndStaleScopeGuards() {
    EditorWindow window; setup(window); QTRY_VERIFY(note(window, "normal")); auto *presenter = window.findChild<InlineTitlePresenter *>(); QVERIFY(presenter);
    QVERIFY(window.document()->applyCommand({{"op", "renameNode"}, {"id", "other"}, {"title", "Other note"}}));
    QTRY_VERIFY(note(window, "normal"));
    const auto baseline = window.document()->snapshot(); openNote(window); QTRY_VERIFY(overlay(window)); auto *widget = overlay(window);
    {
      QQuickItem overlayItem(widget->quickWindow()->contentItem());
      QKeyEvent shortcut(QEvent::ShortcutOverride, Qt::Key_G, Qt::ControlModifier);
      QApplication::sendEvent(&overlayItem, &shortcut); QVERIFY(shortcut.isAccepted());
    }
    QTest::keyClick(widget->quickWindow(), Qt::Key_Delete);
    QTest::keyClick(window.windowHandle(), Qt::Key_G, Qt::ControlModifier);
    QTest::keyClick(widget, Qt::Key_Z, Qt::ControlModifier);
    QCOMPARE(window.document()->nodes().size(), 4); QCOMPARE(window.document()->undoStack()->index(), 1);
    const auto token = presenter->generation(); window.session()->credentialsChanged(QUrl{}, {}, "another-account");
    QVERIFY(!presenter->active()); presenter->commit("stale credentials", token); QCoreApplication::processEvents(); QCOMPARE(window.document()->snapshot(), baseline);
    openNote(window); QTRY_VERIFY(presenter->active()); const auto documentToken = presenter->generation();
    auto replacement = workflow(); auto graph = replacement["graph"].toObject(); auto nodes = graph["nodes"].toArray(); auto first = nodes[0].toObject();
    auto ui = first["ui_properties"].toObject(); ui["title"] = "New document note"; first["ui_properties"] = ui; nodes[0] = first; graph["nodes"] = nodes; replacement["graph"] = graph;
    QVERIFY(window.document()->load(replacement)); QVERIFY(!presenter->active()); presenter->commit("stale document", documentToken); QCoreApplication::processEvents(); QCOMPARE(window.document()->snapshot(), replacement);
    QTRY_VERIFY(note(window, "normal")); openNote(window); QTRY_VERIFY(presenter->active()); const auto selectionToken = presenter->generation();
    QVERIFY(window.selectNode("other")); QVERIFY(!presenter->active()); presenter->commit("wrong node", selectionToken); QCoreApplication::processEvents(); QCOMPARE(window.document()->snapshot(), replacement);
    openNote(window); QTRY_VERIFY(presenter->active()); const auto removedToken = presenter->generation();
    QVERIFY(window.document()->applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"normal"}}}));
    const auto removed = window.document()->snapshot(); QVERIFY(!presenter->active());
    presenter->commit("removed node", removedToken); QCoreApplication::processEvents(); QCOMPARE(window.document()->snapshot(), removed);

  }
  void firstNoteAndGroupActionEntryPoints() {
    EditorWindow window; setup(window); auto *presenter = window.findChild<InlineTitlePresenter *>(); QVERIFY(presenter);
    QVERIFY(!window.document()->node("other")["ui_properties"].toObject().contains("title"));
    QVERIFY(window.selectNode("other")); window.action("Edit note");
    QVERIFY2(presenter->active(), qPrintable(window.message()));
    QTRY_VERIFY2(overlay(window), qPrintable(QString("Active=%1 generation=%2 selection=%3 message=%4").arg(presenter->active()).arg(presenter->generation()).arg(window.selection(), window.message())));
    auto *widget = overlay(window); QTest::keyClicks(widget, "First note"); QTest::keyClick(widget, Qt::Key_Return);
    QTRY_COMPARE(window.document()->node("other")["ui_properties"].toObject()["title"].toString(), QString("First note"));
    QCOMPARE(window.document()->undoStack()->index(), 1); QTRY_VERIFY(note(window, "other"));
    window.action("Undo"); QTRY_VERIFY(!note(window, "other"));
    QVERIFY(!window.document()->node("other")["ui_properties"].toObject().contains("title"));
    QVERIFY(window.selectNode("group")); const auto before = window.document()->snapshot();
    QSignalSpy projections(static_cast<WorkflowGraphModel *>(&window.scene()->graphModel()), &WorkflowGraphModel::projectionAboutToChange);
    window.action("Rename group");
    QVERIFY2(presenter->active(), qPrintable(window.message()));
    QTRY_VERIFY2(overlay(window), qPrintable(QString("Active=%1 gen=%2 projectionsAfterAction=%3 message=%4").arg(presenter->active()).arg(presenter->generation()).arg(projections.count()).arg(window.message())));
    widget = overlay(window);
    QTest::keyClicks(widget, "Cancelled group draft"); QTest::keyClick(widget, Qt::Key_Escape);
    QTRY_VERIFY(!presenter->active()); QCOMPARE(window.document()->snapshot(), before); QCOMPARE(window.document()->undoStack()->index(), 0);
    QVERIFY(window.selectNode("comment")); window.action("Edit note"); QVERIFY(!presenter->active()); QCOMPARE(window.document()->snapshot(), before);
  }
  void groupFontMatchesPaintedLabelAtEveryZoom() {
    EditorWindow window; setup(window); auto *view = window.findChild<QGraphicsView *>(); QVERIFY(view);
    auto *presenter = window.findChild<InlineTitlePresenter *>(); QVERIFY(presenter);
    const auto captureDir = qEnvironmentVariable("NODETOOL_INLINE_TITLE_CAPTURE_DIR");
    for (const auto zoom : {0.25, 1.0, 2.0}) {
      window.action("Reset zoom"); view->scale(zoom, zoom);
      const auto id = nodeId(window, "group");
      const auto label = window.scene()->groupLabelRect(id, zoom); view->centerOn(label.center()); QTest::qWait(30);
      QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(label.center()));
      QTRY_VERIFY(overlay(window)); auto *widget = overlay(window);
      const auto *field = widget->rootObject()->findChild<QQuickItem *>("inline-title-text"); QVERIFY(field);
      const auto font = field->property("font").value<QFont>();
      QCOMPARE(font.pixelSize(), 15); QCOMPARE(font.weight(), QFont::Medium);
      QCOMPARE(field->property("wrapMode").toInt(), 0);
      const auto effectiveScale = field->mapToScene(QPointF(0, 1)).y() - field->mapToScene(QPointF()).y();
      const auto paintedFontSize = 15 * zoom * groupLabelScale(zoom);
      QVERIFY2(std::abs(font.pixelSize() * effectiveScale - paintedFontSize) < 0.01, qPrintable(QString("Editor %1 vs painter %2 at %3").arg(font.pixelSize() * effectiveScale).arg(paintedFontSize).arg(zoom)));
      if (zoom == 0.25 && !captureDir.isEmpty()) {
        QVERIFY(QDir().mkpath(captureDir)); QTest::qWait(30);
        QVERIFY(window.grab().save(captureDir + "/inline-group-edit-25-percent.png"));
      }
      const auto title = QString("Group at %1 percent").arg(qRound(zoom * 100));
      QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier); QTest::keyClicks(widget, title); QTest::keyClick(widget, Qt::Key_Return);
      QTRY_COMPARE(window.document()->node("group")["data"].toObject()["headline"].toString(), title);
    }
    QCOMPARE(window.document()->undoStack()->index(), 3);
  }
  void longMultilineGrowsScrollsCaretCommitsAndCancels() {
    EditorWindow window; setup(window); QTRY_VERIFY(note(window, "normal"));
    auto *presenter = window.findChild<InlineTitlePresenter *>(); QVERIFY(presenter);
    const auto original = window.document()->snapshot();
    openNote(window); QTRY_VERIFY(overlay(window)); auto *widget = overlay(window);
    auto *field = widget->rootObject()->findChild<QQuickItem *>("inline-title-text"); QVERIFY(field);
    auto *scroll = widget->rootObject()->findChild<QQuickItem *>("inline-title-scroll"); QVERIFY(scroll);
    QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier);
    QString expected;
    for (int line = 0; line < 12; ++line) {
      if (line) { QTest::keyClick(widget, Qt::Key_Return, Qt::ShiftModifier); expected += '\n'; }
      const auto text = QString("Line %1").arg(line + 1); QTest::keyClicks(widget, text); expected += text;
    }
    QTRY_VERIFY(presenter->editorRect().height() > 100);
    const auto caretVisible = [&] {
      const auto caret = field->property("cursorRectangle").toRectF();
      const auto top = field->mapToScene(caret.topLeft()); const auto bottom = field->mapToScene(caret.bottomRight());
      return top.y() >= presenter->editorRect().top() - 1 && bottom.y() <= presenter->editorRect().bottom() + 1;
    };
    QTRY_VERIFY(caretVisible()); QCOMPARE(field->property("text").toString(), expected);
    const auto captureDir = qEnvironmentVariable("NODETOOL_INLINE_TITLE_CAPTURE_DIR");
    if (!captureDir.isEmpty()) QVERIFY(window.grab().save(captureDir + "/inline-note-12-lines.png"));
    for (int line = 12; line < 120; ++line) {
      QTest::keyClick(widget, Qt::Key_Return, Qt::ShiftModifier); expected += '\n';
      const auto text = QString("Line %1").arg(line + 1); QTest::keyClicks(widget, text); expected += text;
    }
    QTRY_VERIFY(scroll->property("contentY").toDouble() > 0);
    QTRY_VERIFY(caretVisible());
    auto *view = window.findChild<QGraphicsView *>(); QVERIFY(view);
    QVERIFY(presenter->editorRect().height() <= view->viewport()->height());
    QVERIFY(window.unobstructedViewport().contains(presenter->editorRect()));
    int checkedChrome = 0;
    for (const auto *chrome : window.findChildren<QQuickWidget *>()) {
      if (!chrome->isVisible() || (chrome->source().fileName() != "Toolbar.qml" && chrome->source().fileName() != "SelectionToolbar.qml")) continue;
      const QRectF bounds(view->viewport()->mapFromGlobal(chrome->mapToGlobal(QPoint{})), chrome->size());
      QVERIFY2(!bounds.intersects(presenter->editorRect()), qPrintable("Note editor overlaps " + chrome->source().fileName()));
      ++checkedChrome;
    }
    QCOMPARE(checkedChrome, 2);

    if (!captureDir.isEmpty()) QVERIFY(window.grab().save(captureDir + "/inline-note-scroll-120-lines.png"));
    QTest::keyClick(widget, Qt::Key_Return);
    QTRY_COMPARE(window.document()->node("normal")["ui_properties"].toObject()["title"].toString(), expected);
    QCOMPARE(window.document()->undoStack()->index(), 1);
    QTRY_VERIFY(note(window, "normal")); openNote(window); QTRY_VERIFY(overlay(window)); widget = overlay(window);
    QTest::keyClicks(widget, "cancelled suffix"); QTest::keyClick(widget, Qt::Key_Escape);
    QTRY_VERIFY(!presenter->active()); QCOMPARE(window.document()->node("normal")["ui_properties"].toObject()["title"].toString(), expected);
    QCOMPARE(window.document()->undoStack()->index(), 1); window.action("Undo"); QCOMPARE(window.document()->snapshot(), original);
  }
  void groupPasteStaysSingleLine() {
    EditorWindow window; setup(window); QTest::qWait(40); QVERIFY(window.selectNode("group")); window.action("Rename group");
    QTRY_VERIFY(overlay(window)); auto *widget = overlay(window);
    const auto oldClipboard = QApplication::clipboard()->text(); QApplication::clipboard()->setText("Group\nmultiple\rline");
    QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier); QTest::keyClick(widget, Qt::Key_V, Qt::ControlModifier);
    auto *field = widget->rootObject()->findChild<QQuickItem *>("inline-title-text"); QVERIFY(field);
    QTRY_COMPARE(field->property("text").toString(), QString("Groupmultipleline")); QApplication::clipboard()->setText(oldClipboard);
    QTest::keyClick(widget, Qt::Key_Return); QTRY_COMPARE(window.document()->node("group")["data"].toObject()["headline"].toString(), QString("Groupmultipleline"));
    QCOMPARE(window.document()->undoStack()->index(), 1);
  }
  void noteFollowsCardGeometryWithoutDocumentWrites() {
    EditorWindow window; setup(window); QTRY_VERIFY(note(window, "normal"));
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto id = nodeId(window, "normal"); auto *surface = note(window, "normal");
    const auto original = window.document()->snapshot();
    const auto initial = surface->pos();
    model.setCanvasMediaNodes({"normal"});
    QTRY_COMPARE(surface->pos().y(), double(model.layout(id).size.height() + 10));
    QVERIFY(surface->pos().y() > initial.y()); QCOMPARE(window.document()->snapshot(), original);
    model.setCanvasMediaNodes({});
    QTRY_COMPARE(surface->pos(), initial);
    const auto size = model.layout(id).size;
    QVERIFY(model.setNodeData(id, QtNodes::NodeRole::Size, QSize(size.width() + 80, size.height() + 120)));
    QTRY_COMPARE(surface->pos().y(), double(model.layout(id).size.height() + 10));
    QVERIFY(surface->pos().y() > initial.y()); QCOMPARE(window.document()->snapshot(), original);
    auto *parent = window.scene()->nodeGraphicsObject(id); QVERIFY(parent);
    parent->setPos(parent->pos() + QPointF(70, 40));
    QCOMPARE(surface->scenePos(), parent->scenePos() + surface->pos());
  }
  void themeCapturesAndZoomPlacement() {
    const auto captureDir = qEnvironmentVariable("NODETOOL_INLINE_TITLE_CAPTURE_DIR");
    if (captureDir.isEmpty()) QSKIP("Set NODETOOL_INLINE_TITLE_CAPTURE_DIR for visual capture");
    EditorWindow window; setup(window); QTRY_VERIFY(note(window, "normal")); auto *view = window.findChild<QGraphicsView *>(); QVERIFY(view);
    auto *presenter = window.findChild<InlineTitlePresenter *>(); QVERIFY(presenter); QVERIFY(QDir().mkpath(captureDir));
    for (const auto &scheme : {QString("dark"), QString("light")}) {
      window.setDarkTheme(scheme == "dark"); window.action("Fit"); QTest::qWait(80);
      QVERIFY(window.grab().save(captureDir + "/inline-notes-" + scheme + ".png"));
      openNote(window); QTRY_VERIFY(presenter->active());
      const auto before = presenter->editorRect(); window.action("Zoom in"); presenter->reposition(); QTest::qWait(60); presenter->reposition(); QVERIFY(presenter->editorRect().width() > before.width());
      QVERIFY(!note(window, "normal")->isVisible());
      QVERIFY(window.grab().save(captureDir + "/inline-note-edit-" + scheme + ".png"));
      presenter->cancel(); window.action("Reset zoom");
    }
  }
};
QTEST_MAIN(InlineTitleTest)
#include "InlineTitleTest.moc"
