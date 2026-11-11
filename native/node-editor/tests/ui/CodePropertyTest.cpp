#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include "graph/InlinePropertyPresenter.h"
#include <QGraphicsView>
#include <QMouseEvent>
#include <QTemporaryDir>
#include <QFile>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include "properties/CodeInference.h"
#include <QQuickWidget>
#include <QQuickItem>
#include <QQuickWindow>
#include <QQmlEngine>
#include <QDir>
#include <QJsonDocument>
#include <QElapsedTimer>
#include <QtTest>
using namespace nodetool;
using namespace nodetool::node_editor;
static QJsonObject codeNode(QString code) { return {{"id","code"},{"type","nodetool.code.Code"},{"data",QJsonObject{{"code",code}}}}; }
class CodePropertyTest : public QObject {
 Q_OBJECT
 static QQuickItem* find(QQuickItem* root) {
  if(root->objectName()=="code-editor") return root;
  for(auto child:root->childItems()) if(auto found=find(child)) return found;
  return nullptr;
 }
private slots:
 void repeatedInferenceDoesNotReparse() {
  QString code;
  for(int i=0;i<20000;++i) code+=QString("const value%1 = inputs.a;\n").arg(i);
  code+="return {out: 1};";
  QElapsedTimer timer; timer.start();
  const auto first=withInferredCodePorts(codeNode(code));
  const auto parse=std::max<qint64>(timer.elapsed(),1);
  timer.restart();
  for(int i=0;i<100;++i) QCOMPARE(withInferredCodePorts(codeNode(code)),first);
  QVERIFY2(timer.elapsed()<parse*20,qPrintable(QString("parse %1 ms, 100 repeats %2 ms").arg(parse).arg(timer.elapsed())));
 }
 void inference() {
  const auto check=[](QString code, QStringList inputs, QStringList outputs) {
   const auto result=withInferredCodePorts(codeNode(code));
   auto actualInputs=result["dynamic_properties"].toObject().keys();
   auto actualOutputs=result["dynamic_outputs"].toObject().keys();
   inputs.sort(); outputs.sort();
   QCOMPARE(actualInputs,inputs); QCOMPARE(actualOutputs,outputs);
  };
  check("return {foo: inputs.a, bar: inputs['b-c']};",{"a","b-c"},{"foo","bar"});
  check("function f(){return {inner:1}} return {outer:2}",{}, {"outer"});
  check("return {...rest, ['computed']: 1, plain};",{}, {"computed","plain"});
  check("emit('sent',1); output('other',2); return {ignored:1}",{}, {"sent","other"});
  check("const inputs={}; return {out:inputs.fake};",{}, {"out"});
  check("// inputs.fake\n const x='inputs.fake'; return {out:inputs.real};",{"real"},{"out"});
  check("await stream.first('first'); stream.open('next'); stream('last'); inputs.code;",{"first","next","last"},{});
  check("return {broken:",{},{});
  check("return {outer:(()=>{return {inner:1}})()};",{}, {"outer"});
  check("const k='a'; return {out:inputs[k]};",{}, {"out"});
  check("return {out:opts.inputs.fake};",{}, {"out"});
  check("function f({inputs}, stream) { return inputs.fake + stream('fake'); }",{},{});
  check("return {same: inputs.same};",{"same"},{"same"});
  auto node=codeNode("return {newPort:1}");
  node["dynamic_outputs"]=QJsonObject{{"connected",QJsonObject{{"type","int"}}},{"unused",QJsonObject{{"type","str"}}}};
  auto result=withInferredCodePorts(node,QJsonArray{QJsonObject{{"source","code"},{"sourceHandle","connected"}}});
  QVERIFY(result["dynamic_outputs"].toObject().contains("connected"));
  QVERIFY(!result["dynamic_outputs"].toObject().contains("unused"));
  node["data"]=QJsonObject{{"code","return {"}};
  QCOMPARE(withInferredCodePorts(node)["dynamic_outputs"],node["dynamic_outputs"]);
 }
 void host() {
  EditorWindow window;
  QJsonObject field{{"name","code"},{"type",QJsonObject{{"type","str"}}},{"default",""}};
  QJsonArray catalog{QJsonObject{{"node_type","nodetool.code.Code"},{"title","Code"},{"inline_fields",QJsonArray{"code"}},{"properties",QJsonArray{field}},{"supports_dynamic_inputs",true},{"supports_dynamic_outputs",true}},QJsonObject{{"node_type","sink"},{"inline_fields",QJsonArray{"value"}},{"properties",QJsonArray{QJsonObject{{"name","value"},{"type",QJsonObject{{"type","any"}}}}}}}};
  window.setCatalog(catalog);
  QVERIFY(window.document()->load({{"graph",QJsonObject{{"nodes",QJsonArray{codeNode(""),QJsonObject{{"id","sink"},{"type","sink"}}}},{"edges",QJsonArray{}}}}}));
  window.setDarkTheme(true); window.show(); QVERIFY(window.selectNode("code"));
  QQuickWidget* panel=nullptr; QQuickItem* editor=nullptr;
  QTRY_VERIFY(([&]{for(auto widget:window.findChildren<QQuickWidget*>()) if(widget->rootObject()) if(auto found=find(widget->rootObject())) {panel=widget;editor=found;return true;} return false;})());
  const auto type=[&](const char* code) {
   editor=find(panel->rootObject()); QVERIFY(editor);
   panel->setFocus();
   QTest::mouseClick(panel->quickWindow(),Qt::LeftButton,Qt::NoModifier,editor->mapToScene(QPointF(editor->width()/2,editor->height()/2)).toPoint());
   editor->forceActiveFocus();
   QTest::keyClick(panel->quickWindow(),Qt::Key_A,Qt::ControlModifier);
   QTest::keyClicks(panel,code);
  };
  type("return {answer: inputs.text};");
  QCOMPARE(window.document()->undoStack()->count(),0);
  editor->setFocus(false);
  QTRY_VERIFY(window.document()->node("code")["dynamic_outputs"].toObject().contains("answer"));
  QCOMPARE(window.document()->undoStack()->count(),1);
  QVERIFY(window.document()->node("code")["dynamic_properties"].toObject().contains("text"));
  auto view=window.findChild<QGraphicsView*>(); QVERIFY(view);
  auto& model=static_cast<WorkflowGraphModel&>(window.scene()->graphModel());
  QJsonObject positions{{"code",QJsonObject{{"x",0},{"y",0}}},{"sink",QJsonObject{{"x",500},{"y",0}}}};
  QVERIFY(window.document()->applyCommand({{"op","moveNodes"},{"positions",positions}}));
  view->fitInView(window.scene()->itemsBoundingRect().adjusted(-40,-40,40,40),Qt::KeepAspectRatio);
  const auto port=[&](QString resource,QtNodes::PortType side) {
   for(auto id:model.allNodeIds()) if(model.resourceId(id)==resource)
    return view->mapFromScene(window.scene()->nodeGraphicsObject(id)->scenePos()+window.scene()->nodeGeometry().portPosition(id,side,0));
   return QPoint();
  };
  const auto start=port("code",QtNodes::PortType::Out),end=port("sink",QtNodes::PortType::In);
  QTest::mousePress(view->viewport(),Qt::LeftButton,Qt::NoModifier,start);
  QMouseEvent move(QEvent::MouseMove,QPointF(end),QPointF(view->viewport()->mapToGlobal(end)),Qt::NoButton,Qt::LeftButton,Qt::NoModifier);
  QApplication::sendEvent(view->viewport(),&move);
  QTest::mouseRelease(view->viewport(),Qt::LeftButton,Qt::NoModifier,end);
  QTRY_COMPARE(window.document()->edges().size(),1);
  const auto before=window.document()->snapshot();
  type("return {changed:1};"); editor->setFocus(false);
  QTRY_VERIFY(window.document()->node("code")["dynamic_outputs"].toObject().contains("changed"));
  QVERIFY(window.document()->node("code")["dynamic_outputs"].toObject().contains("answer"));
  QCOMPARE(window.document()->edges().size(),1);
  window.document()->undo(); QCOMPARE(window.document()->snapshot(),before);
  type("cancel me"); QTest::keyClick(panel->quickWindow(),Qt::Key_Escape); editor->setFocus(false);
  QCoreApplication::processEvents(); QCOMPARE(window.document()->snapshot(),before);
  type("return {};");
  const auto typed=editor->property("text").toString();
  QTest::keyClick(panel->quickWindow(),Qt::Key_Tab);
  QCOMPARE(editor->property("text").toString(),typed+"  ");
  QTest::keyClick(panel->quickWindow(),Qt::Key_Return,Qt::ControlModifier);
  QCOMPARE(window.document()->snapshot(),before);
  QTest::keyClick(panel->quickWindow(),Qt::Key_Escape); editor->setFocus(false);
  QCoreApplication::processEvents(); QCOMPARE(window.document()->snapshot(),before);
  QTemporaryDir files; QVERIFY(files.isValid()); QFile saved(files.filePath("code.json"));
  QVERIFY(saved.open(QIODevice::WriteOnly)); QVERIFY(saved.write(QJsonDocument(before).toJson())>0); saved.close();
  QVERIFY(saved.open(QIODevice::ReadOnly));
  WorkflowDocument reopened; QVERIFY(reopened.loadJson(saved.readAll())); QCOMPARE(reopened.snapshot(),before);
  QString large; for(int i=0;i<20000;++i) large+="// source line\n";
  type(""); editor->setProperty("text",large);
  QElapsedTimer timer; timer.start(); QTest::keyClicks(panel,"x"); QCoreApplication::processEvents();
  qInfo() << "Large-source key processing milliseconds:" << timer.elapsed();
  QVERIFY2(timer.elapsed()<2000,"Typing into large source exceeded two seconds");
  QTest::keyClick(panel->quickWindow(),Qt::Key_Escape);
  QTRY_COMPARE(editor->property("text").toString(),QString("return {answer: inputs.text};"));
  // The canvas property popover uses the same code editor.
  QtNodes::NodeId codeId=QtNodes::InvalidNodeId;
  for(auto id:model.allNodeIds()) if(model.resourceId(id)=="code") codeId=id;
  QVERIFY(codeId!=QtNodes::InvalidNodeId);
  auto presenter=window.findChild<InlinePropertyPresenter*>(); QVERIFY(presenter);
  const auto codePoint=window.scene()->nodeGraphicsObject(codeId)->scenePos()+model.inlineFieldRect(codeId,"code").center();
  QTest::mouseClick(view->viewport(),Qt::LeftButton,Qt::NoModifier,view->mapFromScene(codePoint));
  QTRY_VERIFY(presenter->active());
  auto popup=presenter->editorWidget(); QVERIFY(popup);
  auto inlineEditor=find(popup->rootObject()); QVERIFY(inlineEditor);
  inlineEditor->forceActiveFocus(); QTest::keyClicks(popup,"cancel popup");
  QTest::keyClick(popup,Qt::Key_Escape); QTRY_VERIFY(!presenter->active());
  QCOMPARE(window.document()->snapshot(),before);
  const auto directory=qEnvironmentVariable("NODETOOL_CODE_CAPTURE_DIR");
  if(!directory.isEmpty()) {
   QVERIFY(QDir().mkpath(directory));
   QTest::qWait(100);
   QVERIFY(window.grab().save(directory+"/code-dark.png"));
   window.setDarkTheme(false); QTest::qWait(80);
   QVERIFY(window.grab().save(directory+"/code-light.png"));
  }
 }
};
QTEST_MAIN(CodePropertyTest)
#include "CodePropertyTest.moc"
