#include "ui/EditorWindow.h"
#include "PropertyFixture.h"
#include <QQuickItem>
#include <QQuickWindow>
#include <QElapsedTimer>
#include <QDir>
#include <QTcpServer>
#include <QTcpSocket>
#include <QWebSocketServer>
#include "server/MsgPack.h"
#include <QGraphicsView>
#include <QMessageBox>
#include <QInputDialog>
#include <QLineEdit>
#include <QQuickWidget>
#include <QTemporaryDir>
#include <QTimer>
#include <QtNodes/BasicGraphicsScene>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
#include "run/GenerationHistory.h"
#include "run/RunOutputModel.h"
#include <functional>
#include <memory>
#include <vector>
#include "graph/EditorScene.h"
using namespace nodetool;
class EditorTest final : public QObject {
  Q_OBJECT
private:
  static QQuickItem *findControl(QQuickItem *root, const QString &name) {
    if (root->property("accessibleName").toString() == name) { return root; }
    for (auto child : root->childItems()) {
      if (auto result = findControl(child, name)) { return result; }
    }
    return nullptr;
  }
  static bool containsText(QQuickItem *root, const QString &text) {
    if (root->isVisible() && root->property("text").toString().contains(text)) { return true; }
    for (auto child : root->childItems()) {
      if (containsText(child, text)) { return true; }
    }
    return false;
  }
  static QQuickItem *findAction(QQuickItem *root, const QString &text) {
    if (root->property("text").toString() == text &&
        root->metaObject()->indexOfSignal("clicked()") >= 0) { return root; }
    for (auto child : root->childItems()) {
      if (auto found = findAction(child, text)) { return found; }
    }
    return nullptr;
  }
  static QQuickItem *propertyAction(EditorWindow &w, const QString &name,
                                     const QString &text) {
    auto field = control(w, name);
    for (auto item = field; item; item = item->parentItem()) {
      if (item->property("descriptor").toMap().value("name").toString() == name) {
        return findAction(item, text);
      }
    }
    return nullptr;
  }
  static void click(EditorWindow &w, QQuickItem *item) {
    for (auto ancestor = item->parentItem(); ancestor; ancestor = ancestor->parentItem()) {
      if (ancestor->metaObject()->indexOfProperty("contentY") >= 0) {
        const auto relative = item->mapToItem(ancestor, QPointF(0, 0));
        ancestor->setProperty("contentY", ancestor->property("contentY").toDouble() + relative.y() - 20);
        break;
      }
    }
    QCoreApplication::processEvents();
    const auto position = item->mapToScene(QPointF(item->width() / 2, item->height() / 2));
    QTest::mouseClick(inspector(w)->quickWindow(), Qt::LeftButton, Qt::NoModifier, position.toPoint());
    QCoreApplication::processEvents();
  }
  static QQuickWidget *inspector(EditorWindow &w) {
    for (auto panel : w.findChildren<QQuickWidget *>()) {
      if (panel->source().toString().contains("Inspector")) { return panel; }
    }
    return nullptr;
  }
  static QQuickItem *control(EditorWindow &w, const QString &name) {
    auto panel = inspector(w);
    return panel && panel->rootObject() ? findControl(panel->rootObject(), name) : nullptr;
  }
  static void select(EditorWindow &w, const QString &resourceId) {
    auto model = w.findChild<WorkflowGraphModel *>();
    auto view = w.findChild<QGraphicsView *>();
    auto scene = static_cast<QtNodes::BasicGraphicsScene *>(view->scene());
    for (auto id : model->allNodeIds()) {
      if (model->resourceId(id) == resourceId) {
        scene->nodeClicked(id);
        // Panels follow in the next pass, and their layout in the pass after.
        QCoreApplication::processEvents();
        QCoreApplication::processEvents();
        return;
      }
    }
  }
  static void prepare(EditorWindow &w) {
    w.setCatalog(property_fixture::catalog());
    const auto loaded = w.document()->load(property_fixture::workflow());
    Q_ASSERT(loaded.ok);
    w.show();
    QCoreApplication::processEvents();
    select(w, "a");
  }
  static void type(EditorWindow &w, QQuickItem *item, const QString &text,
                   int finish = Qt::Key_Return) {
    inspector(w)->setFocus();
    item->forceActiveFocus();
    QTest::keyClick(inspector(w)->quickWindow(), Qt::Key_A, Qt::ControlModifier);
    QTest::keyClicks(inspector(w), text);
    if (finish == Qt::Key_Return && item->metaObject()->indexOfProperty("wrapMode") >= 0) {
      if (auto next = control(w, "Enabled")) { next->forceActiveFocus(); }
    } else if (finish) {
      QTest::keyClick(inspector(w)->quickWindow(), Qt::Key(finish));
    }
    QCoreApplication::processEvents();
  }
private slots:
  void conditionalFieldsFollowPointerToggleAndUndo() {
    EditorWindow w;
    auto enabled = property_fixture::property("Enabled", "bool", true);
    auto detail = property_fixture::property("Detail", "str", "preserved draft");
    detail["json_schema_extra"] = QJsonObject{{"multiline", false}, {"visible_when", QJsonObject{{"property", "Enabled"}, {"equals", true}}}};
    const QJsonArray catalog{QJsonObject{{"node_type", "Conditional"}, {"title", "Conditional settings"}, {"properties", QJsonArray{enabled, detail}}, {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", "str"}}}}}};
    const QJsonObject node{{"id", "n"}, {"type", "Conditional"}, {"data", QJsonObject{{"Enabled", true}, {"Detail", "preserved draft"}}}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 100}, {"y", 100}}}}}};
    w.setCatalog(catalog);
    QVERIFY(w.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{node}}, {"edges", QJsonArray{}}}}}));
    w.show(); QVERIFY(w.selectNode("n")); w.action("Fit");
    QTRY_VERIFY(control(w, "Enabled")); QTRY_VERIFY(control(w, "Detail"));
    click(w, control(w, "Enabled"));
    QTRY_COMPARE(w.document()->node("n")["data"].toObject()["Enabled"].toBool(), false);
    QTRY_VERIFY(!control(w, "Detail"));
    QCOMPARE(w.document()->node("n")["data"].toObject()["Detail"].toString(), QString("preserved draft"));
    QCOMPARE(w.document()->undoStack()->count(), 1);
    w.document()->undo();
    QTRY_VERIFY(control(w, "Detail"));
    auto connected = w.document()->snapshot(); auto graph = connected["graph"].toObject();
    auto hidden = node; hidden["data"] = QJsonObject{{"Enabled", false}, {"Detail", "preserved draft"}};
    auto source = node; source["id"] = "source";
    source["ui_properties"] = QJsonObject{{"position", QJsonObject{{"x", -280}, {"y", 100}}}};
    graph["nodes"] = QJsonArray{source, hidden};
    graph["edges"] = QJsonArray{QJsonObject{{"id", "edge"}, {"source", "source"}, {"sourceHandle", "out"}, {"target", "n"}, {"targetHandle", "Detail"}}};
    connected["graph"] = graph;
    QVERIFY(w.document()->load(connected)); QVERIFY(w.selectNode("n"));
    QTRY_VERIFY(containsText(inspector(w)->rootObject(), "Unavailable for the selected settings"));
    const auto snapshot = w.document()->snapshot();
    const auto capture = qEnvironmentVariable("NODETOOL_VISIBILITY_CAPTURE");
    for (bool dark : {true, false}) {
      w.setDarkTheme(dark); w.resize(1440, 900); w.action("Fit"); QTest::qWait(60);
      if (!capture.isEmpty()) {
        QVERIFY(QDir().mkpath(capture));
        QVERIFY(w.grab().save(capture + (dark ? "/conditional-dark.png" : "/conditional-light.png")));
      }
    }
    QCOMPARE(w.document()->snapshot(), snapshot); QCOMPARE(w.document()->undoStack()->count(), 0);
  }
  void connectActionPreservesDocument() {
    EditorWindow w;
    prepare(w);
    const auto before = w.document()->snapshot();
    int prompts = 0;
    QTimer answer;
    connect(&answer, &QTimer::timeout, &w, [&] {
      auto dialog = qobject_cast<QInputDialog *>(QApplication::activeModalWidget());
      if (!dialog) { return; }
      if (prompts++ == 0) {
        QCOMPARE(dialog->textValue(), QString("http://localhost:7777"));
        dialog->setTextValue("file:///invalid");
      } else {
        QCOMPARE(dialog->textEchoMode(), QLineEdit::Password);
        dialog->setTextValue({});
      }
      dialog->accept();
    });
    answer.start(10);
    w.action("Connect");
    answer.stop();
    QCOMPARE(prompts, 2);
    QCOMPARE(w.document()->snapshot(), before);
    QVERIFY(w.message().contains("HTTP or HTTPS"));
    QVERIFY(w.session()->serverUrl().isEmpty());
  }
  void propertyBooleanStoresBool() {
    EditorWindow w;
    prepare(w);
    auto field = control(w, "Enabled");
    QVERIFY2(field, "Boolean property must expose an accessible real control");
    QVERIFY(field->metaObject()->indexOfProperty("checked") >= 0);
    // The description is the label tooltip, as in the web inspector.
    QVERIFY(!containsText(inspector(w)->rootObject(), "Enabled help"));
    std::function<bool(QQuickItem *)> hasHelp = [&hasHelp](QQuickItem *item) {
        if (item->property("helpText").toString() == "Enabled help") {
            return true;
        }
        const auto children = item->childItems();
        return std::any_of(children.cbegin(), children.cend(), hasHelp);
    };
    QVERIFY(hasHelp(inspector(w)->rootObject()));
    auto count = w.document()->undoStack()->count();
    inspector(w)->setFocus();
    field->forceActiveFocus();
    QTest::keyClick(inspector(w)->quickWindow(), Qt::Key_Space);
    QTRY_COMPARE(w.document()->node("a")["data"].toObject()["Enabled"], QJsonValue(true));
    QCOMPARE(w.document()->undoStack()->count(), count + 1);
  }
  void propertyIntegerRejectsInvalidUiAndApi() {
    EditorWindow w;
    prepare(w);
    auto field = control(w, "Iterations");
    QVERIFY(field);
    const auto baseline = w.document()->snapshot();
    const auto count = w.document()->undoStack()->count();
    for (const auto &text : {QString("2.5"), QString("0"), QString("5")}) {
      type(w, field, text);
      QCOMPARE(w.document()->snapshot(), baseline);
      QCOMPARE(w.document()->undoStack()->count(), count);
    }
    for (double value : {2.5, 0., 5.}) {
      w.setProperty("Count", value);
      QCOMPARE(w.document()->snapshot(), baseline);
      QCOMPARE(w.document()->undoStack()->count(), count);
    }
  }
  void propertyNumberAllowsFractionWithinLimits() {
    EditorWindow w;
    prepare(w);
    auto field = control(w, "Ratio");
    QVERIFY(field);
    type(w, field, "0.75");
    QTRY_COMPARE(w.document()->node("a")["data"].toObject()["Ratio"], QJsonValue(0.75));
    QCOMPARE(w.document()->undoStack()->count(), 1);
    const auto baseline = w.document()->snapshot();
    field = control(w, "Ratio");
    QVERIFY(field);
    type(w, field, "1.5");
    QCOMPARE(w.document()->snapshot(), baseline);
    w.setProperty("Ratio", -0.5);
    QCOMPARE(w.document()->snapshot(), baseline);
    QCOMPARE(w.document()->undoStack()->count(), 1);
  }
  void propertyEnumKeepsTypes() {
    EditorWindow w;
    prepare(w);
    auto field = control(w, "Choice");
    QVERIFY(field);
    QVERIFY(field->metaObject()->indexOfProperty("currentIndex") >= 0);
    inspector(w)->setFocus();
    field->forceActiveFocus();
    QTest::keyClick(inspector(w)->quickWindow(), Qt::Key_Down);
    QTRY_COMPARE(w.document()->node("a")["data"].toObject()["Choice"], QJsonValue(2));
    field = control(w, "Choice");
    QVERIFY(field);
    field->forceActiveFocus();
    QTest::keyClick(inspector(w)->quickWindow(), Qt::Key_End);
    QTRY_COMPARE(w.document()->node("a")["data"].toObject()["Choice"], QJsonValue("two"));
  }
  void propertyDefaultAndNullPreserved() {
    EditorWindow w;
    prepare(w);
    auto baseline = w.document()->snapshot();
    auto field = control(w, "Default");
    QVERIFY2(field, "Declared omitted defaults must be displayed");
    QCOMPARE(field->property("text").toString(), QString("fallback"));
    QVERIFY(w.document()->node("a")["data"].toObject()["Nullable"].isNull());
    QVERIFY(!w.document()->node("a")["data"].toObject().contains("Default"));
    field->forceActiveFocus();
    QTest::keyClick(inspector(w)->quickWindow(), Qt::Key_Tab);
    QCOMPARE(w.document()->snapshot(), baseline);
    QCOMPARE(w.document()->undoStack()->count(), 0);
    QVERIFY(w.commitProperty("a", "Nullable", "set"));
    QCOMPARE(w.document()->node("a")["data"].toObject()["Nullable"], QJsonValue("set"));
    w.document()->undo();
    QCOMPARE(w.document()->snapshot(), baseline);
    QVERIFY(w.removeProperty("a", "Nullable"));
    QVERIFY(!w.document()->node("a")["data"].toObject().contains("Nullable"));
    w.document()->undo();
    QCOMPARE(w.document()->snapshot(), baseline);
  }
  void propertyOmittedNullAndDraftReset() {
    EditorWindow w;
    prepare(w);
    QVERIFY(!w.document()->node("a")["data"].toObject().contains("NullableMissing"));
    auto button = propertyAction(w, "NullableMissing", "Set null");
    QVERIFY(button);
    QVERIFY(button->isEnabled());
    click(w, button);
    QTRY_VERIFY(w.document()->node("a")["data"].toObject()["NullableMissing"].isNull());
    QVERIFY(w.document()->node("a")["data"].toObject().contains("NullableMissing"));
    button = propertyAction(w, "NullableMissing", "Clear value");
    QVERIFY(button);
    QVERIFY(button->isEnabled());
    click(w, button);
    QTRY_VERIFY(!w.document()->node("a")["data"].toObject().contains("NullableMissing"));
    auto field = control(w, "Nullable");
    QVERIFY(field);
    type(w, field, "pending null draft", 0);
    button = propertyAction(w, "Nullable", "Set null");
    QVERIFY(button);
    // Explicit null baseline is already null, so first store a non-null value.
    QTest::keyClick(inspector(w)->quickWindow(), Qt::Key_Escape);
    QVERIFY(w.commitProperty("a", "Nullable", "stored"));
    QCoreApplication::processEvents();
    field = control(w, "Nullable");
    QVERIFY(field);
    type(w, field, "pending null draft", 0);
    button = propertyAction(w, "Nullable", "Set null");
    QVERIFY(button);
    const auto nullCount = w.document()->undoStack()->count();
    click(w, button);
    QTRY_VERIFY(w.document()->node("a")["data"].toObject()["Nullable"].isNull());
    QCOMPARE(w.document()->undoStack()->count(), nullCount + 1);
    QCoreApplication::processEvents();
    QVERIFY(w.document()->node("a")["data"].toObject()["Nullable"].isNull());
    QVERIFY(w.commitProperty("a", "Default", "stored"));
    QCoreApplication::processEvents();
    field = control(w, "Default");
    QVERIFY(field);
    type(w, field, "pending default draft", 0);
    button = propertyAction(w, "Default", "Reset to default");
    QVERIFY(button);
    const auto defaultCount = w.document()->undoStack()->count();
    click(w, button);
    QTRY_VERIFY(!w.document()->node("a")["data"].toObject().contains("Default"));
    QCOMPARE(w.document()->undoStack()->count(), defaultCount + 1);
    QCoreApplication::processEvents();
    QVERIFY(!w.document()->node("a")["data"].toObject().contains("Default"));
  }
  void propertyTextCancelCommitUndoRedo() {
    EditorWindow w;
    prepare(w);
    auto field = control(w, "Text");
    QVERIFY(field);
    const auto baseline = w.document()->snapshot();
    type(w, field, "discard", Qt::Key_Escape);
    QCOMPARE(field->property("text").toString(), QString("baseline"));
    QCOMPARE(w.document()->snapshot(), baseline);
    QCOMPARE(w.document()->undoStack()->count(), 0);
    type(w, field, "committed");
    QTRY_COMPARE(w.document()->node("a")["data"].toObject()["Text"], QJsonValue("committed"));
    QCOMPARE(w.document()->undoStack()->count(), 1);
    auto committed = w.document()->snapshot();
    w.document()->undo();
    QCOMPARE(w.document()->snapshot(), baseline);
    w.document()->redo();
    QCOMPARE(w.document()->snapshot(), committed);
  }
  void propertySelectionCancelsDraft() {
    EditorWindow w;
    prepare(w);
    auto field = control(w, "Text");
    QVERIFY(field);
    type(w, field, "uncommitted", 0);
    select(w, "b");
    QTest::keyClick(inspector(w)->quickWindow(), Qt::Key_Tab);
    QCOMPARE(w.document()->node("a")["data"].toObject()["Text"], QJsonValue("baseline"));
    QCOMPARE(w.document()->node("b")["data"].toObject()["Text"], QJsonValue("baseline"));
    QCOMPARE(w.document()->undoStack()->count(), 0);
    QVERIFY(!w.commitProperty("a", "Text", "stale API draft"));
    QCOMPARE(w.document()->node("a")["data"].toObject()["Text"], QJsonValue("baseline"));
    QCOMPARE(w.document()->node("b")["data"].toObject()["Text"], QJsonValue("baseline"));
    QCOMPARE(w.document()->undoStack()->count(), 0);
  }
  void propertyDynamicUsesSeparateMap() {
    EditorWindow w;
    prepare(w);
    auto field = control(w, "Dynamic");
    QVERIFY2(field, "Declared dynamic inputs must expose controls");
    type(w, field, "dynamic edit");
    QCOMPARE(w.document()->node("a")["dynamic_properties"].toObject()["Dynamic"],
             QJsonValue("dynamic edit"));
    QVERIFY(!w.document()->node("a")["data"].toObject().contains("Dynamic"));
    QCOMPARE(w.document()->undoStack()->count(), 1);
  }
  void propertyMultilineCancelAndCommit() {
    EditorWindow w;
    prepare(w);
    auto field = control(w, "Multiline");
    QVERIFY(field);
    const auto baseline = w.document()->snapshot();
    type(w, field, "discard", Qt::Key_Escape);
    QCOMPARE(w.document()->snapshot(), baseline);
    type(w, field, "changed", 0);
    QTest::keyClick(inspector(w)->quickWindow(), Qt::Key_Return);
    QTest::keyClicks(inspector(w), "second");
    QCOMPARE(w.document()->snapshot(), baseline);
    auto next = control(w, "Enabled");
    QVERIFY(next);
    next->forceActiveFocus();
    QTRY_COMPARE(w.document()->node("a")["data"].toObject()["Multiline"],
                 QJsonValue("changed\nsecond"));
    QCOMPARE(w.document()->undoStack()->count(), 1);
    w.document()->undo();
    QCOMPARE(w.document()->snapshot(), baseline);
    w.document()->redo();
    QCOMPARE(w.document()->node("a")["data"].toObject()["Multiline"],
             QJsonValue("changed\nsecond"));
  }
  void propertyLongInspectorScrolls() {
    EditorWindow w;
    auto catalog = property_fixture::catalog();
    auto metadata = catalog[0].toObject();
    auto properties = metadata["properties"].toArray();
    for (int index = 0; index < 40; ++index) {
      properties.append(property_fixture::property(
          QString("Extra %1").arg(index), "str", "default"));
    }
    metadata["properties"] = properties;
    catalog[0] = metadata;
    w.setCatalog(catalog);
    QVERIFY(w.document()->load(property_fixture::workflow()));
    w.resize(1000, 600);
    w.show();
    QCoreApplication::processEvents();
    select(w, "a");
    auto field = control(w, "Extra 39");
    QVERIFY(field);
    QQuickItem *scroll = field->parentItem();
    while (scroll && scroll->metaObject()->indexOfProperty("contentY") < 0) {
      scroll = scroll->parentItem();
    }
    QVERIFY2(scroll, "Long inspector must have a real scrollable viewport");
    QVERIFY(scroll->property("contentHeight").toDouble() > scroll->height());
    const auto baseline = w.document()->snapshot();
    scroll->forceActiveFocus();
    QTest::keyClick(inspector(w)->quickWindow(), Qt::Key_End, Qt::ControlModifier);
    // A wheel gesture drives the real viewport even when its fields hold focus.
    auto position = scroll->mapToScene(QPointF(scroll->width() / 2, scroll->height() / 2));
    QWheelEvent wheel(position,
                      QPointF(0, 0), QPoint(0, -1000), QPoint(0, -1200),
                      Qt::NoButton, Qt::NoModifier, Qt::ScrollUpdate, false);
    QApplication::sendEvent(inspector(w)->quickWindow(), &wheel);
    QTRY_VERIFY(scroll->property("contentY").toDouble() > 0);
    QCOMPARE(w.document()->snapshot(), baseline);
    QCOMPARE(w.document()->undoStack()->count(), 0);
  }
  void propertyConnectedAndStructuredAreInert() {
    EditorWindow w;
    prepare(w);
    QVERIFY(w.document()->applyCommand({{"op", "addEdge"}, {"edge", QJsonObject{
      {"id", "edge"}, {"source", "b"}, {"sourceHandle", "out"},
      {"target", "a"}, {"targetHandle", "Text"}}}}));
    QCoreApplication::processEvents();
    const auto baseline = w.document()->snapshot();
    const auto count = w.document()->undoStack()->count();
    auto field = control(w, "Text");
    QVERIFY(field);
    QVERIFY(!field->isEnabled() || field->property("readOnly").toBool());
    QVERIFY(containsText(inspector(w)->rootObject(), "Connected"));
    type(w, field, "blocked");
    w.setProperty("Text", "blocked via API");
    QVERIFY(!w.commitProperty("a", "Text", "blocked identity API"));
    QVERIFY(!w.document()->applyCommand({{"op", "setProperty"}, {"id", "a"},
                                        {"name", "Text"}, {"value", "blocked document API"}}));
    w.setProperty("Model", "external/model");
    w.setProperty("Image", "asset://fixture-image");
    QCOMPARE(w.document()->snapshot(), baseline);
    QCOMPARE(w.document()->undoStack()->count(), count);
  }

  void outputDockKeepsDocumentHistory() {
    EditorWindow w;
    w.show();
    QCoreApplication::processEvents();
    QVERIFY(!w.outputVisible());
    w.action("Output");
    QVERIFY(w.outputVisible());
    w.action("Output");
    QVERIFY(!w.outputVisible());
    const auto baseline = w.document()->snapshot();
    const auto count = w.document()->undoStack()->count();
    emit w.session()->runSubmitted("first");
    // A run does not open the output panel. Logs opens it.
    QVERIFY(!w.outputVisible());
    w.action("Output");
    QVERIFY(w.outputVisible());
    emit w.session()->runEvent("first", {{"type", "output_update"}, {"job_id", "first"}, {"node_id", "n"},
        {"output_name", "value"}, {"value", "asset://preserved"}});
    emit w.session()->runEvent("first", {{"type", "output_update"}, {"job_id", "first"},
        {"node_id", "n"}, {"output_name", "structured"}, {"value", QJsonObject{{"answer", 42}}}});
    emit w.session()->runEvent("first", {{"type", "node_update"}, {"job_id", "first"},
        {"node_id", "n"}, {"status", "completed"}});
    emit w.session()->runEvent("first", {{"type", "log_update"}, {"job_id", "first"},
        {"node_id", "n"}, {"content", "Fixture log"}, {"severity", "info"}});
    emit w.session()->runSubmitted("second");
    w.runOutput()->selectRun("first");
    QCOMPARE(w.runOutput()->selectedRunId(), QString("first"));
    QQuickWidget *output = nullptr;
    for (auto panel : w.findChildren<QQuickWidget *>()) {
      if (panel->source().fileName() == "RunOutput.qml") { output = panel; }
    }
    QVERIFY(output);
    QCoreApplication::processEvents();
    QVERIFY(containsText(output->rootObject(), "asset://preserved"));
    // A single-key object renders its value directly, as ObjectRenderer.tsx does.
    QTRY_VERIFY(containsText(output->rootObject(), "42"));
    QVERIFY(containsText(output->rootObject(), "completed"));
    QVERIFY(containsText(output->rootObject(), "Fixture log"));
    const auto capture = qEnvironmentVariable("NODETOOL_RUN_OUTPUT_CAPTURE");
    if (!capture.isEmpty()) { QVERIFY(w.grab().save(capture)); }
    auto clear = findAction(output->rootObject(), "Clear history");
    QVERIFY(clear);
    emit w.session()->runEvent("first", {{"type", "job_update"}, {"job_id", "first"},
        {"status", "completed"}});
    QTest::mouseClick(output->quickWindow(), Qt::LeftButton, Qt::NoModifier,
        clear->mapToScene(QPointF(clear->width() / 2, clear->height() / 2)).toPoint());
    QTRY_COMPARE(w.runOutput()->runs().size(), 1);
    QCOMPARE(w.runOutput()->selectedRunId(), QString("second"));
    QVERIFY(w.runOutput()->entries().isEmpty());
    emit w.session()->runEvent("second", {{"type", "output_update"}, {"job_id", "second"},
        {"node_id", "n"}, {"output_name", "value"}, {"value", "Output after clearing"}});
    QCoreApplication::processEvents();
    QVERIFY(containsText(output->rootObject(), "Output after clearing"));
    emit w.session()->runEvent("second", {{"type", "job_update"}, {"job_id", "second"},
        {"status", "completed"}});
    QTest::mouseClick(output->quickWindow(), Qt::LeftButton, Qt::NoModifier,
        clear->mapToScene(QPointF(clear->width() / 2, clear->height() / 2)).toPoint());
    QTRY_VERIFY(w.runOutput()->runs().isEmpty());
    // The web Logs view names its empty state "No recorded runs" (components/panels/TracePanel.tsx).
    QVERIFY(containsText(output->rootObject(), "No recorded runs"));
    w.action("Output");
    QVERIFY(!w.outputVisible());
    emit w.session()->errorOccurred("Fixture connection failure");
    QVERIFY(w.outputVisible());
    QCoreApplication::processEvents();
    QVERIFY(containsText(output->rootObject(), "Fixture connection failure"));
    QCOMPARE(w.document()->snapshot(), baseline);
    QCOMPARE(w.document()->undoStack()->count(), count);
  }

  // A running job sends many messages. They must not rebuild the node catalog,
  // and panels follow them at a bounded rate rather than once per message.
  void jobMessagesThrottlePanels() {
    nodetool::EditorWindow window;
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    QSignalSpy catalog(&window, &nodetool::EditorWindow::catalogChanged);
    std::vector<std::unique_ptr<QSignalSpy>> panels;
    panels.push_back(std::make_unique<QSignalSpy>(&window, &nodetool::EditorWindow::panelChanged));
    for (auto *editor : window.findChildren<nodetool::EditorWindow *>()) { panels.push_back(std::make_unique<QSignalSpy>(editor, &nodetool::EditorWindow::panelChanged)); }
    const auto refreshes = [&] { qsizetype total = 0; for (const auto &spy : panels) { total += spy->count(); } return total; };
    auto *output = window.runOutput();
    output->beginRun("job");
    QCoreApplication::processEvents();
    QTest::qWait(150);
    for (const auto &spy : panels) { spy->clear(); }
    QSignalSpy outputs(output, &nodetool::node_editor::RunOutputModel::changed);
    for (int i = 0; i < 200; ++i) {
      output->ingest("job", {{"type", "output_update"}, {"job_id", "job"}, {"node_id", "n"}, {"output_name", "text"}, {"value", QString("chunk %1").arg(i)}});
    }
    QVERIFY(outputs.count() >= 100);
    QCOMPARE(catalog.count(), 0);
    QCOMPARE(refreshes(), 0);
    QTRY_VERIFY(refreshes() > 0);
    QVERIFY2(refreshes() <= 4, qPrintable(QString::number(refreshes())));
  }
  // Two fixture nodes side by side, so that a click hits exactly one node.
  static void loadPanelFixture(EditorWindow &window) {
    window.setCatalog(property_fixture::catalog());
    auto workflow = property_fixture::workflow();
    auto graph = workflow["graph"].toObject();
    QJsonArray nodes;
    for (const auto &[id, x] : {std::pair{QString("a"), 0}, std::pair{QString("b"), 600}}) {
      auto node = property_fixture::node(id);
      node["ui_properties"] = QJsonObject{{"position", QJsonObject{{"x", x}, {"y", 0}}}};
      nodes.append(node);
    }
    graph["nodes"] = nodes;
    workflow["graph"] = graph;
    QVERIFY(window.document()->load(workflow));
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    window.fit();
    QTest::qWait(200);
  }
  // Panels evaluate their bindings once for all changes in one event-loop pass.
  void panelChangesCoalesceInOnePass() {
    EditorWindow window;
    loadPanelFixture(window);
    auto *tab = window.activeEditor();
    QSignalSpy owner(&window, &EditorWindow::panelChanged), panels(tab, &EditorWindow::panelChanged);
    QVERIFY(window.selectNode("a"));
    QVERIFY(window.commitProperty("a", "Text", "changed"));
    window.action("Toggle inspector");
    QCOMPARE(panels.count(), 0);
    QTest::qWait(150);
    QCOMPARE(window.document()->node("a")["data"].toObject()["Text"].toString(), QString("changed"));
    QCOMPARE(panels.count(), 1);
    QCOMPARE(owner.count(), 1);
  }
  // Window edits project once in the next pass and keep the scene items. A replaced document resets them.
  void windowEditsProjectIncrementally() {
    EditorWindow window;
    loadPanelFixture(window);
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QSignalSpy reset(&model, &WorkflowGraphModel::modelReset), projected(&model, &WorkflowGraphModel::projectionChanged);
    QVERIFY(window.document()->applyCommand({{"op", "moveNodes"}, {"positions", QJsonObject{{"a", QJsonObject{{"x", 40}, {"y", 20}}}}}}));
    QVERIFY(window.document()->applyCommand({{"op", "moveNodes"}, {"positions", QJsonObject{{"b", QJsonObject{{"x", 640}, {"y", 20}}}}}}));
    QCOMPARE(projected.count(), 0);
    QTRY_COMPARE(projected.count(), 1);
    QTest::qWait(50);
    QCOMPARE(projected.count(), 1);
    QCOMPARE(reset.count(), 0);
    QVERIFY(window.document()->load(window.document()->snapshot()));
    QCOMPARE(reset.count(), 1);
    QTest::qWait(50);
    QCOMPARE(reset.count(), 1);
  }
  // A click selection syncs the inspector once, although the press selects and the release clicks.
  void clickSelectionSyncsInspectorOnce() {
    EditorWindow window;
    loadPanelFixture(window);
    auto *tab = window.activeEditor();
    auto *view = tab->findChild<QGraphicsView *>();
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QtNodes::NodeId target = QtNodes::InvalidNodeId;
    for (const auto id : model.allNodeIds()) { if (model.resourceId(id) == "b") { target = id; } }
    auto *item = window.scene()->nodeGraphicsObject(target);
    QVERIFY(item);
    const auto point = view->mapFromScene(item->sceneBoundingRect().center());
    QVERIFY(view->viewport()->rect().contains(point));
    QSignalSpy synced(tab, &EditorWindow::inspectorSynced);
    QSignalSpy owner(&window, &EditorWindow::panelChanged), panels(tab, &EditorWindow::panelChanged);
    QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, point);
    QTest::qWait(150);
    QCOMPARE(window.selection(), QString("b"));
    QCOMPARE(synced.count(), 1);
    QCOMPARE(panels.count(), 1);
    QCOMPARE(owner.count(), 1);
    synced.clear();
    QVERIFY(window.selectNode("a"));
    QTest::qWait(150);
    QCOMPARE(window.selection(), QString("a"));
    QCOMPARE(synced.count(), 1);
  }
  // The field loses focus before the canvas press selects the other card, so
  // the typed value still lands on the card it was typed for.
  void inspectorEditSurvivesCanvasClick() {
    EditorWindow window;
    loadPanelFixture(window);
    QVERIFY(window.selectNode("a"));
    QTest::qWait(150);
    QQuickItem *field = nullptr;
    QTRY_VERIFY((field = control(window, "Text")));
    type(window, field, "typed before the click", 0);
    auto *view = window.activeEditor()->findChild<QGraphicsView *>();
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QtNodes::NodeId target = QtNodes::InvalidNodeId;
    for (const auto id : model.allNodeIds()) { if (model.resourceId(id) == "b") { target = id; } }
    auto *item = window.scene()->nodeGraphicsObject(target);
    QVERIFY(item);
    const auto header = item->sceneBoundingRect().topLeft() + QPointF(item->sceneBoundingRect().width() / 2, 12);
    QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(header));
    QTRY_COMPARE(window.selection(), QString("b"));
    QTRY_COMPARE(window.document()->node("a")["data"].toObject()["Text"], QJsonValue("typed before the click"));
    QCOMPARE(window.document()->node("b")["data"].toObject()["Text"], QJsonValue("baseline"));
    QCOMPARE(window.document()->undoStack()->count(), 1);
  }
  // GenerationHistory copies the full document. A selection change reuses the copy.
  void selectionKeepsHistoryWorkflow() {
    EditorWindow window;
    loadPanelFixture(window);
    QVERIFY(window.selectNode("a"));
    QTest::qWait(150);
    QSignalSpy history(window.generationHistory(), &node_editor::GenerationHistory::changed);
    QVERIFY(window.selectNode("b"));
    QTest::qWait(150);
    // GenerationHistory::selectNode emits once. A setWorkflow call would emit again.
    QCOMPARE(history.count(), 1);
    history.clear();
    QVERIFY(window.commitProperty("b", "Text", "changed"));
    QTRY_VERIFY(history.count() > 0);
  }
  void panelsLoad() {
    EditorWindow w;
    w.show();
    QTest::qWait(50);
    auto panels = w.findChildren<QQuickWidget *>();
    // Rail, tabs, document header, status, catalog, node menu, browser, inspector, output, both toolbars,
    // viewport readout, mini-map controls, first-workflow guide, queue overlay, subgraph canvas strip, chat overlay, library,
    // node info overlay.
    QCOMPARE(panels.size(), 19);
    for (auto p : panels) {
      QCOMPARE(p->status(), QQuickWidget::Ready);
    }
  }
  void nodeCardUsesWebGeometry() {
    WorkflowGraphModel model;
    QJsonObject input{{"name", "text"}, {"type", QJsonObject{{"type", "str"}}}};
    QJsonObject inline_{{"name", "note"}, {"type", QJsonObject{{"type", "str"}}}};
    const QJsonArray catalog{QJsonObject{{"node_type", "t.A"}, {"title", "Alpha"}, {"input_fields", QJsonArray{"text"}},
        {"properties", QJsonArray{input}}, {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", QJsonObject{{"type", "str"}}}}}}},
        QJsonObject{{"node_type", "t.B"}, {"title", "Beta"}, {"inline_fields", QJsonArray{"note"}}, {"properties", QJsonArray{inline_}}, {"outputs", QJsonArray{}}}};
    model.project({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "a"}, {"type", "t.A"}},
        QJsonObject{{"id", "b"}, {"type", "t.B"}, {"data", QJsonObject{{"note", "hello"}}}, {"ui_properties", QJsonObject{{"width", 320}}}}}},
        {"edges", QJsonArray{}}}}}, catalog);
    QtNodes::NodeId a = 0, b = 0;
    for (auto id : model.allNodeIds()) { (model.resourceId(id) == "a" ? a : b) = id; }
    // BaseNode measurements captured in the web comparison fixture.
    QCOMPARE(model.layout(a).size, QSize(280, 72));
    QCOMPARE(model.layout(a).inputY.first(), 46.0);
    QCOMPARE(model.layout(a).outputY.first(), 46.0);
    QCOMPARE(model.layout(a).accent, QColor("#ffa808"));
    QCOMPARE(model.layout(a).title, QString("Alpha"));
    QCOMPARE(model.layout(b).size.width(), 320);
    QCOMPARE(model.layout(b).rows.first().kind, NodeRowKind::Multiline);
    QCOMPARE(model.layout(b).rows.first().value, QString("hello"));
    QCOMPARE(model.nodeData(a, QtNodes::NodeRole::Size).toSize(), QSize(280, 72));
  }
  void wiresAndGridPaint() {
    EditorWindow w;
    const auto str = QJsonObject{{"type", "str"}};
    w.setCatalog({QJsonObject{{"node_type", "t"}, {"title", "T"}, {"input_fields", QJsonArray{"in"}},
        {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", str}}}},
        {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", str}}}}}});
    QVERIFY(w.document()->load(QJsonObject{{"graph", QJsonObject{
        {"nodes", QJsonArray{QJsonObject{{"id", "a"}, {"type", "t"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}},
                             QJsonObject{{"id", "b"}, {"type", "t"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 400}, {"y", 0}}}}}}}},
        {"edges", QJsonArray{QJsonObject{{"id", "e"}, {"source", "a"}, {"target", "b"}, {"sourceHandle", "out"}, {"targetHandle", "in"}}}}}}}).ok);
    w.show();
    QTest::qWait(50);
    w.fit();
    QTest::qWait(50);
    auto view = w.findChild<QGraphicsView *>();
    const auto image = view->grab().toImage();
    const auto canvas = w.scene()->theme().canvas;
    const auto mid = view->mapFromScene(QPointF(340, 46));
    int warm = 0;
    for (int y = mid.y() - 4; y <= mid.y() + 4; ++y) {
      // The amber wire is painted at half opacity over the canvas.
      warm += image.pixelColor(mid.x(), y).red() > canvas.red() + 40;
    }
    QVERIFY2(warm > 0, "typed wire did not paint");
    bool gridVisible = false;
    for (int y = 0; y < image.height() && !gridVisible; ++y) {
      for (int x = 0; x < image.width() && !gridVisible; ++x) {
        gridVisible = image.pixelColor(x, y) == w.scene()->theme().grid;
      }
    }
    QVERIFY2(gridVisible, "canvas grid did not paint");
  }
  void shellPanelsFollowSelectionAndTheme() {
    EditorWindow w;
    prepare(w);
    const auto panelNamed = [&](const QString &name) -> QQuickItem * {
      for (auto panel : w.findChildren<QQuickWidget *>()) {
        if (panel->source().fileName() == name) { return panel->rootObject(); }
      }
      return nullptr;
    };
    QVERIFY(w.inspectorVisible());
    QVERIFY(containsText(panelNamed("Inspector.qml"), "Params"));
    w.action("Clear selection");
    QTRY_VERIFY(!w.inspectorVisible());
    QVERIFY(w.selection().isEmpty());
    select(w, "a");
    QTRY_VERIFY(w.inspectorVisible());
    // The web opens with its side panels closed.
    QVERIFY(!w.catalogVisible());
    w.action("Toggle nodes");
    QVERIFY(w.catalogVisible());
    w.action("Toggle nodes");
    QVERIFY(!w.catalogVisible());
    w.action("Toggle nodes");
    QVERIFY(w.catalogVisible());
    // The narrow layout keeps one side panel and restores the catalog when it widens.
    w.resize(900, 700);
    QTRY_VERIFY(!w.catalogVisible());
    w.resize(1440, 900);
    QTRY_VERIFY(w.catalogVisible());
    QVERIFY(w.scene()->nodeGraphicsObject(*w.findChild<WorkflowGraphModel *>()->allNodeIds().begin())->graphicsEffect() == nullptr);
    // All panels share one engine, so one theme change reaches the canvas and every panel.
    const auto before = w.scene()->theme().node;
    w.setDarkTheme(before.lightness() > 128);
    QTRY_VERIFY(w.scene()->theme().node != before);
    w.setDarkTheme(before.lightness() <= 128);
    QTRY_COMPARE(w.scene()->theme().node, before);
    const auto zoom = w.zoomPercent();
    w.action("Zoom in");
    QVERIFY(w.zoomPercent() > zoom);
    w.action("Reset zoom");
    QCOMPARE(w.zoomPercent(), 100);
    auto *status = panelNamed("StatusBar.qml");
    QCOMPARE(status->findChild<QQuickItem *>("status-nodes-value")->property("text").toString(), QString("2"));
    QCOMPARE(status->findChild<QQuickItem *>("status-nodes-key")->property("text").toString(), QString("nodes"));
  }
  void largeGraphRepaintCost() {
    EditorWindow w;
    QJsonArray nodes, edges;
    for (int i = 0; i < 1000; ++i) { nodes.append(placedNode(QString::number(i), (i % 40) * 340, (i / 40) * 110)); }
    for (int i = 0; i < 2000; ++i) {
      const auto from = i % 999;
      edges.append(QJsonObject{{"id", QString("e%1").arg(i)}, {"source", QString::number(from)}, {"target", QString::number(from + 1)}, {"sourceHandle", "out"}, {"targetHandle", "in"}});
    }
    loadPlaced(w, nodes, edges);
    w.fit();
    auto view = w.findChild<QGraphicsView *>();
    QElapsedTimer timer;
    timer.start();
    for (int i = 0; i < 5; ++i) { view->viewport()->grab(); }
    qInfo() << "1000 nodes, one full-viewport repaint, ms:" << timer.elapsed() / 5.0;
    QVERIFY(!view->viewport()->grab().isNull());
  }
  void floatingOverlayReceivesPointerInput() {
    EditorWindow w;
    w.show();
    QTest::qWait(50);
    QQuickWidget *overlay = nullptr;
    for (auto panel : w.findChildren<QQuickWidget *>()) {
      if (panel->source().fileName() == "ViewportIndicator.qml") { overlay = panel; }
    }
    QVERIFY(overlay);
    QVERIFY(overlay->isVisible());
    auto zoomIn = overlay->rootObject()->findChild<QQuickItem *>("zoom-in");
    QVERIFY(zoomIn);
    const auto before = w.zoomPercent();
    const auto center = zoomIn->mapToItem(overlay->rootObject(), QPointF(zoomIn->width() / 2, zoomIn->height() / 2)).toPoint();
    QTest::mouseClick(overlay, Qt::LeftButton, {}, center);
    QTRY_VERIFY(w.zoomPercent() > before);
  }
  static QJsonObject placedNode(const QString &id, double x, double y) {
    return {{"id", id}, {"type", "t"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", y}}}}}};
  }
  static void loadPlaced(EditorWindow &w, const QJsonArray &nodes, const QJsonArray &edges) {
    const auto str = QJsonObject{{"type", "str"}};
    w.setCatalog({QJsonObject{{"node_type", "t"}, {"title", "T"}, {"input_fields", QJsonArray{"in"}},
        {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", str}}}},
        {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", str}}}}}});
    QVERIFY(w.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}).ok);
    w.show();
    QTest::qWait(50);
  }
  static QtNodes::ConnectionGraphicsObject *wireInto(EditorWindow &w, const QString &target) {
    for (auto item : w.scene()->items()) {
      if (auto wire = qgraphicsitem_cast<QtNodes::ConnectionGraphicsObject *>(item)) {
        auto model = w.findChild<WorkflowGraphModel *>();
        if (model->resourceId(wire->connectionId().inNodeId) == target) { return wire; }
      }
    }
    return nullptr;
  }
  void wirePaintHitAndBoundsShareOneCurve() {
    EditorWindow w;
    const auto edge = [](const QString &from, const QString &to) {
      return QJsonObject{{"id", from + to}, {"source", from}, {"target", to}, {"sourceHandle", "out"}, {"targetHandle", "in"}};
    };
    // Long forward with a vertical drop, straight, short reverse, and long reverse.
    loadPlaced(w, {placedNode("a", 0, 0), placedNode("b", 1000, 400), placedNode("c", 1000, 0),
                   placedNode("d", 270, 500), placedNode("e", -1600, 900)},
               {edge("a", "b"), edge("a", "c"), edge("a", "d"), edge("a", "e")});
    w.fit();
    QCoreApplication::processEvents();
    auto view = w.findChild<QGraphicsView *>();
    view->resetTransform();
    for (const auto &target : {QStringLiteral("b"), QStringLiteral("c"), QStringLiteral("d"), QStringLiteral("e")}) {
      auto wire = wireInto(w, target);
      QVERIFY2(wire, qPrintable(target));
      const auto curve = wireCurve(wire->endPoint(QtNodes::PortType::Out), wire->endPoint(QtNodes::PortType::In));
      const auto hit = wire->shape();
      QVERIFY2(wire->boundingRect().contains(hit.boundingRect()), qPrintable(target));
      for (int step = 0; step <= 20; ++step) {
        const auto point = curve.pointAtPercent(step / 20.0);
        QVERIFY2(hit.contains(point), qPrintable(QString("%1 at %2").arg(target).arg(step)));
      }
      // The hit stroke follows the curve instead of covering its surroundings.
      const auto mid = curve.pointAtPercent(0.5);
      const auto angle = qDegreesToRadians(curve.angleAtPercent(0.5) + 90);
      QVERIFY(!hit.contains(mid + 15 * QPointF(std::cos(angle), -std::sin(angle))));
    }
    // A real click at a quarter of the wide wire selects it where it is drawn.
    auto wide = wireInto(w, "c");
    const auto curve = wireCurve(wide->endPoint(QtNodes::PortType::Out), wide->endPoint(QtNodes::PortType::In));
    const auto scenePoint = wide->mapToScene(curve.pointAtPercent(0.25));
    view->centerOn(scenePoint);
    QCoreApplication::processEvents();
    const auto canvas = w.scene()->theme().canvas;
    const auto viewPoint = view->mapFromScene(scenePoint);
    const auto frame = view->viewport()->grab().toImage();
    bool painted = false;
    for (int y = viewPoint.y() - 2; y <= viewPoint.y() + 2; ++y) {
      painted |= frame.pixelColor(viewPoint.x(), y).red() > canvas.red() + 40;
    }
    QVERIFY2(painted, "wire is not painted at its hit position");
    QTest::mouseClick(view->viewport(), Qt::LeftButton, {}, viewPoint);
    QTRY_VERIFY(wide->isSelected());
  }
  void fitKeepsEveryNodeVisibleAcrossPanels() {
    EditorWindow w;
    QJsonArray nodes;
    for (int i = 0; i < 12; ++i) {
      nodes.append(placedNode(QString::number(i), (i % 4) * 400, (i / 4) * 300));
    }
    loadPlaced(w, nodes, {});
    auto view = w.findChild<QGraphicsView *>();
    auto model = w.findChild<WorkflowGraphModel *>();
    const auto allVisible = [&] {
      const auto area = w.unobstructedViewport();
      for (auto id : model->allNodeIds()) {
        const auto rect = view->mapFromScene(w.scene()->nodeGraphicsObject(id)->mapRectToScene(QRectF(QPointF(0, 0), QSizeF(model->layout(id).size)))).boundingRect();
        if (!area.contains(QRectF(rect))) { return false; }
      }
      return true;
    };
    w.fit();
    QVERIFY(allVisible());
    const auto wideZoom = w.zoomPercent();
    QVERIFY(wideZoom <= 100);
    QVERIFY(w.unobstructedViewport().height() < view->viewport()->height());
    // The web keeps the zoom on select and pans only to clear the inspector
    // (useClearInspectorOverlap.ts), so fit mode no longer refits to the narrower
    // canvas (W9). Every node stays visible only after an explicit fit.
    QVERIFY(w.selectNode("5"));
    QTRY_VERIFY(w.inspectorVisible());
    QTest::qWait(400);
    QCOMPARE(w.zoomPercent(), wideZoom);
    for (auto id : model->allNodeIds()) {
      if (model->resourceId(id) != "5") { continue; }
      const auto rect = view->mapFromScene(w.scene()->nodeGraphicsObject(id)->mapRectToScene(QRectF(QPointF(0, 0), QSizeF(model->layout(id).size)))).boundingRect();
      QVERIFY(view->viewport()->rect().contains(rect));
    }
    w.action("Clear selection");
    QTest::qWait(50);
    QCOMPARE(w.zoomPercent(), wideZoom);
    w.fit();
    QVERIFY(allVisible());
    QCOMPARE(w.zoomPercent(), wideZoom);
    // Once the user sets the zoom, selection keeps the zoom and uncovers the node.
    w.action("Reset zoom");
    view->centerOn(0, 0);
    QVERIFY(w.selectNode("11"));
    QTest::qWait(50);
    QCOMPARE(w.zoomPercent(), 100);
    for (auto id : model->allNodeIds()) {
      if (model->resourceId(id) != "11") { continue; }
      const auto rect = view->mapFromScene(w.scene()->nodeGraphicsObject(id)->mapRectToScene(QRectF(QPointF(0, 0), QSizeF(model->layout(id).size)))).boundingRect();
      QTRY_VERIFY(w.unobstructedViewport().contains(QRectF(rect)));
    }
  }
  void catalogFiltersByCategoryAndText() {
    EditorWindow w;
    w.setCatalog({QJsonObject{{"node_type", "nodetool.input.First"}, {"title", "First"}, {"namespace", "nodetool.input"}},
                  QJsonObject{{"node_type", "a.two.Second"}, {"title", "Second"}, {"namespace", "a.two"}}});
    w.show();
    w.action("Toggle nodes");
    QTest::qWait(30);
    QQuickItem *root = nullptr;
    for (auto panel : w.findChildren<QQuickWidget *>()) {
      if (panel->source().fileName() == "Catalog.qml") { root = panel->rootObject(); }
    }
    QVERIFY(root);
    auto rows = root->findChild<QQuickItem *>("catalog-rows");
    QTRY_COMPARE(rows->property("count").toInt(), 2);
    // The node rows take the width the category column leaves.
    auto categories = root->findChild<QQuickItem *>("catalog-categories");
    QVERIFY(categories);
    QTRY_VERIFY2(rows->width() >= root->width() - categories->width() - 1,
                 qPrintable(QString("rows %1, categories %2, panel %3").arg(rows->width()).arg(categories->width()).arg(root->width())));
    QVERIFY(categories->width() <= 156);
    root->setProperty("query", "sec");
    QTRY_COMPARE(rows->property("count").toInt(), 1);
    root->setProperty("query", "");
    root->setProperty("category", "io");
    QTRY_COMPARE(rows->property("count").toInt(), 1);
    QVERIFY(containsText(root, "First"));
  }
  void graphEditHistory() {
    EditorWindow w;
    auto d = w.document();
    WorkflowGraphModel m;
    QJsonArray catalog{
        QJsonObject{
            {"node_type", "source"},
            {"outputs",
             QJsonArray{QJsonObject{{"name", "out"},
                                    {"type", QJsonObject{{"type", "str"}}}}}},
            {"properties",
             QJsonArray{QJsonObject{{"name", "text"}, {"default", "hello"}}}}},
        QJsonObject{
            {"node_type", "sink"},
            {"input_fields", QJsonArray{"in"}},
            {"properties",
             QJsonArray{QJsonObject{{"name", "in"},
                                    {"type", QJsonObject{{"type", "str"}}}}}}}};
    d->setNodeMetadata(catalog);
    m.project(d->snapshot(), catalog);
    m.commit = [d](const auto &c) { return d->applyCommand(c).ok; };
    m.addNode("source");
    m.project(d->snapshot(), catalog);
    m.addNode("sink");
    m.project(d->snapshot(), catalog);
    QCOMPARE(d->nodes().size(), 2);
    QCOMPARE(d->nodes()[0].toObject()["data"].toObject()["text"].toString(),
             QString("hello"));
    QtNodes::NodeId a = QtNodes::InvalidNodeId, b = a;
    for (auto id : m.allNodeIds()) {
      if (m.nodeData(id, QtNodes::NodeRole::Type) == "source") {
        a = id;
      } else {
        b = id;
      }
    }
    auto style =
        QJsonDocument::fromVariant(m.nodeData(a, QtNodes::NodeRole::Style))
            .object()["NodeStyle"]
            .toObject();
    QVERIFY(!style["FontColor"].toString().isEmpty());
    QVERIFY(style["Opacity"].toDouble() > 0);
    QtNodes::ConnectionId c{a, 0, b, 0};
    QVERIFY(m.connectionPossible(c));
    m.addConnection(c);
    QCOMPARE(d->edges().size(), 1);
    d->undo();
    QCOMPARE(d->edges().size(), 0);
    d->redo();
    QCOMPARE(d->edges().size(), 1);
    auto before = d->snapshot();
    w.setProperty("nothing", 1);
    QCOMPARE(d->snapshot(), before);
  }
  void fileRoundTrip() {
    QTemporaryDir dir;
    EditorWindow w;
    w.addNode("unknown.Node");
    QCoreApplication::processEvents();
    QCOMPARE(w.document()->nodes().size(), 1);
    auto snapshot = w.document()->snapshot();
    QVERIFY(w.saveFile(dir.filePath("workflow.json")));
    QVERIFY(w.openFile(dir.filePath("workflow.json")));
    QCOMPARE(w.document()->snapshot(), snapshot);
    w.document()->undo();
    QCOMPARE(w.document()->snapshot(), snapshot);
  }
  void largeProjection() {
    QJsonArray nodes, edges;
    for (int i = 0; i < 1000; ++i) {
      nodes.append(QJsonObject{
          {"id", QString::number(i)},
          {"type", "unknown"},
          {"ui_properties",
           QJsonObject{{"position", QJsonObject{{"x", i * 200}, {"y", 0}}}}}});
      for (int offset : {1, 2}) {
        edges.append(
            QJsonObject{{"id", QString::number(i * 2 + offset)},
                        {"source", QString::number(i)},
                        {"target", QString::number((i + offset) % 1000)},
                        {"sourceHandle", "out"},
                        {"targetHandle", "in"}});
      }
    }
    WorkflowGraphModel model;
    QElapsedTimer timer;
    timer.start();
    model.project(QJsonObject{
        {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}});
    QCOMPARE(model.allNodeIds().size(), size_t(1000));
    size_t total = 0;
    for (auto id : model.allNodeIds()) {
      total += model.allConnectionIds(id).size();
    }
    QCOMPARE(total, size_t(4000));
    qInfo() << "1000 nodes / 2000 edges projection and adjacency traversal ms:"
            << timer.elapsed();
  }
  void sessionProjectionKeepsHistory() {
    EditorWindow w;
    w.addNode("N");
    auto count = w.document()->undoStack()->count();
    auto response = w.document()->snapshot();
    response["updated_at"] = "server-revision";
    response["id"] = "server-id";
    response["name"] = "Server name";
    w.session()->setSnapshot(response);
    QCOMPARE(w.document()->undoStack()->count(), count);
    QCOMPARE(w.document()->snapshot(), response);
    w.document()->undo();
    QVERIFY(w.document()->nodes().isEmpty());
    QCOMPARE(w.document()->snapshot()["id"], response["id"]);
    QCOMPARE(w.document()->snapshot()["updated_at"], response["updated_at"]);
    w.document()->redo();
    QCOMPARE(w.document()->snapshot(), response);
  }
  void serverIdentityAndLocalPath() {
    QTcpServer server;
    QVERIFY(server.listen(QHostAddress::LocalHost));
    QList<QByteArray> requests;
    QJsonObject stored;
    int revision = 0;
    connect(&server, &QTcpServer::newConnection, this, [&] {
      auto socket = server.nextPendingConnection();
      socket->setParent(&server);
      connect(socket, &QTcpSocket::readyRead, this, [&, socket] {
        auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
        socket->setProperty("bytes", bytes);
        auto end = bytes.indexOf("\r\n\r\n");
        if (end < 0 || socket->property("handled").toBool()) { return; }
        int length = 0;
        for (auto line : bytes.left(end).split('\n')) {
          if (line.toLower().startsWith("content-length:")) {
            length = line.mid(15).trimmed().toInt();
          }
        }
        if (bytes.size() < end + 4 + length) { return; }
        socket->setProperty("handled", true);
        if (bytes.startsWith("GET /ws")) { socket->disconnectFromHost(); return; }
        QJsonObject response;
        const auto target = bytes.left(bytes.indexOf('\r')).split(' ').value(1);
        if (target == "/api/workflows" || target.startsWith("/api/workflows/")) {
          requests.append(bytes);
          if (bytes.startsWith("GET ")) {
            response = {{"id", "other"}, {"name", "Other"}, {"updated_at", "r9"},
                        {"graph", stored["graph"]}};
          } else {
            stored = QJsonDocument::fromJson(bytes.mid(end + 4, length)).object();
            stored.remove("expected_updated_at");
            stored["id"] = "created";
            stored["updated_at"] = QString("r%1").arg(++revision);
            response = stored;
          }
        }
        auto body = QJsonDocument(response).toJson(QJsonDocument::Compact);
        socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " +
                      QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
      });
    });
    EditorWindow w;
    w.session()->connectToServer(
        QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
    w.addNode("N");
    QTemporaryDir dir;
    auto path = dir.filePath("A.json");
    QVERIFY(w.saveFile(path));
    w.action("Server Save");
    QTRY_COMPARE(w.document()->snapshot()["id"].toString(), QString("created"));
    QCOMPARE(w.localFilePath(), path);
    w.document()->undo();
    QVERIFY(w.document()->nodes().isEmpty());
    QCOMPARE(w.document()->snapshot()["id"].toString(), QString("created"));
    w.document()->redo();
    w.addNode("N");
    w.action("Server Save");
    QTRY_COMPARE(revision, 2);
    QTRY_VERIFY(!w.session()->saving());
    QCOMPARE(requests.size(), 2);
    QVERIFY(requests[0].startsWith("POST /api/workflows "));
    QVERIFY(requests[1].startsWith("PUT /api/workflows/created "));
    QCOMPARE(w.document()->snapshot()["updated_at"].toString(), QString("r2"));
    w.document()->undo();
    QCOMPARE(w.document()->snapshot()["updated_at"].toString(), QString("r2"));
    w.document()->redo();
    w.session()->openWorkflow("other");
    QTRY_COMPARE(w.document()->snapshot()["id"].toString(), QString("other"));
    QCOMPARE(w.document()->snapshot()["name"].toString(), QString("Other"));
    QVERIFY(w.localFilePath().isEmpty());
    QCOMPARE(w.document()->undoStack()->count(), 0);
    stored["graph"] = QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}};
    QVERIFY(w.document()->load(QJsonObject{{"graph", stored["graph"]}}));
    w.session()->openWorkflow("other");
    QTRY_COMPARE(w.document()->snapshot()["id"].toString(), QString("other"));
    QCOMPARE(w.document()->snapshot()["name"].toString(), QString("Other"));
    QVERIFY(w.document()->nodes().isEmpty());
    QFile local(path);
    QVERIFY(local.open(QIODevice::ReadOnly));
    QVERIFY(!QJsonDocument::fromJson(local.readAll()).object().contains("id"));
  }
  void reconnectActionRetainsRun() {
    QWebSocketServer server("test", QWebSocketServer::NonSecureMode);
    QVERIFY(server.listen(QHostAddress::LocalHost));
    QPointer<QWebSocket> peer;
    QList<QJsonObject> commands;
    connect(&server, &QWebSocketServer::newConnection, this, [&] {
      peer = server.nextPendingConnection();
      peer->setParent(&server);
      connect(peer, &QWebSocket::binaryMessageReceived, this, [&](QByteArray bytes) {
        commands.append(node_editor::decodeMsgPack(bytes)->toObject());
      });
    });
    EditorWindow w;
    w.session()->connectToServer(
        QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
    QTRY_COMPARE(w.connectionState(), QString("Connected"));
    auto id = w.session()->run(w.document()->snapshot());
    QVERIFY(!id.isEmpty());
    QTRY_COMPARE(commands.size(), 1);
    peer->close();
    QTRY_COMPARE(w.connectionState(), QString("Disconnected"));
    w.action("Reconnect");
    w.action("Reconnect");
    QTRY_COMPARE(w.connectionState(), QString("Connected"));
    QTRY_COMPARE(commands.size(), 2);
    QCOMPARE(commands[1]["command"].toString(), QString("reconnect_job"));
    QCOMPARE(commands[1]["data"].toObject()["job_id"].toString(), id);
    QCOMPARE(commands[0]["command"].toString(), QString("run_job"));
    w.runOutput()->beginRun("historical-display-only");
    w.runOutput()->selectRun("historical-display-only");
    w.runOutput()->clear();
    w.action("Stop");
    QTRY_COMPARE(commands.size(), 3);
    QCOMPARE(commands[2]["command"].toString(), QString("cancel_job"));
    QCOMPARE(commands[2]["data"].toObject()["job_id"].toString(), id);
  }
  void dirtyOpenCanceled() {
    QTemporaryDir dir;
    EditorWindow w;
    QVERIFY(w.saveFile(dir.filePath("clean.json")));
    w.addNode("unknown.Node");
    auto before = w.document()->snapshot();
    QTimer::singleShot(0, &w, [] {
      auto box = qobject_cast<QMessageBox *>(QApplication::activeModalWidget());
      QVERIFY(box);
      box->done(QMessageBox::Cancel);
    });
    QVERIFY(!w.openFile(dir.filePath("clean.json")));
    QCOMPARE(w.document()->snapshot(), before);
  }
  void connectAndDeleteGesture() {
    EditorWindow w;
    w.setCatalog(QJsonArray{QJsonObject{
        {"node_type", "N"},
        {"properties",
         QJsonArray{QJsonObject{{"name", "in"},
                                {"type", QJsonObject{{"type", "str"}}}}}},
        {"outputs",
         QJsonArray{QJsonObject{{"name", "out"},
                                {"type", QJsonObject{{"type", "str"}}}}}}}});
    w.addNode("N");
    w.addNode("N");
    QCoreApplication::processEvents();
    auto d = w.document();
    auto nodes = d->nodes();
    auto a = nodes[0].toObject()["id"].toString();
    auto b = nodes[1].toObject()["id"].toString();
    QVERIFY(d->applyCommand(
        {{"op", "moveNodes"},
         {"positions", QJsonObject{{a, QJsonObject{{"x", 0}, {"y", 0}}},
                                   {b, QJsonObject{{"x", 400}, {"y", 0}}}}}}));
    QCoreApplication::processEvents();
    w.show();
    QTest::qWait(30);
    w.fit();
    auto view = w.findChild<QGraphicsView *>();
    auto scene = static_cast<QtNodes::BasicGraphicsScene *>(view->scene());
    auto model = w.findChild<WorkflowGraphModel *>();
    QVERIFY(model);
    QtNodes::NodeId source = 0, target = 0;
    for (auto id : model->allNodeIds()) {
      if (model->resourceId(id) == a) {
        source = id;
      } else {
        target = id;
      }
    }
    auto out = view->mapFromScene(scene->nodeGeometry().portScenePosition(
        source, QtNodes::PortType::Out, 0,
        scene->nodeGraphicsObject(source)->sceneTransform()));
    auto in = view->mapFromScene(scene->nodeGeometry().portScenePosition(
        target, QtNodes::PortType::In, 0,
        scene->nodeGraphicsObject(target)->sceneTransform()));
    auto count = d->undoStack()->count();
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, out);
    QMouseEvent move(QEvent::MouseMove, in, view->viewport()->mapToGlobal(in),
                     Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
    QApplication::sendEvent(view->viewport(), &move);
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, in);
    QCoreApplication::processEvents();
    QCOMPARE(d->edges().size(), 1);
    QCOMPARE(d->undoStack()->count(), count + 1);
    QTRY_VERIFY(scene->connectionGraphicsObject({source, 0, target, 0}));
    auto connection = scene->connectionGraphicsObject({source, 0, target, 0});
    connection->setSelected(true);
    w.action("Delete");
    QCOMPARE(d->edges().size(), 0);
    d->undo();
    QCOMPARE(d->edges().size(), 1);
  }
  void dragOneTransaction() {
    EditorWindow w;
    w.addNode("unknown.Node");
    QCoreApplication::processEvents();
    w.show();
    QTest::qWait(50);
    w.fit();
    QCoreApplication::processEvents();
    auto view = w.findChild<QGraphicsView *>();
    auto scene = static_cast<QtNodes::BasicGraphicsScene *>(view->scene());
    auto node = scene->nodeGraphicsObject(0);
    QVERIFY(node);
    auto start = view->mapFromScene(node->sceneBoundingRect().center());
    auto old = w.document()->snapshot();
    auto count = w.document()->undoStack()->count();
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    QMouseEvent move(QEvent::MouseMove, start + QPoint(40, 30),
                     view->viewport()->mapToGlobal(start + QPoint(40, 30)),
                     Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
    QApplication::sendEvent(view->viewport(), &move);
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier,
                        start + QPoint(80, 50));
    QCoreApplication::processEvents();
    QCOMPARE(w.document()->undoStack()->count(), count + 1);
    w.document()->undo();
    QCOMPARE(w.document()->snapshot(), old);
  }
};
QTEST_MAIN(EditorTest)
#include "EditorTest.moc"
