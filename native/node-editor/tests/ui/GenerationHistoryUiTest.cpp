#include "interfaces/GenerationReplay.h"
#include "ui/EditorWindow.h"
#include <QBuffer>
#include <QDir>
#include <QImage>
#include <QJsonDocument>
#include <QQmlContext>
#include "media/MediaResolver.h"
#include "media/VideoFrameView.h"
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QtTest>
using namespace nodetool;
namespace {
const QString WorkflowId="1234567890abcdef1234567890abcdef",NodeId="11111111111111111111111111111111",First="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",Second="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",Image="cccccccccccccccccccccccccccccccc",OtherImage="dddddddddddddddddddddddddddddddd";
QJsonObject workflow(){return {{"id",WorkflowId},{"name","Durable generation history"},{"updated_at","2026-11-05T00:00:00Z"},{"graph",QJsonObject{{"nodes",QJsonArray{QJsonObject{{"id",NodeId},{"type","fixture.Generator"},{"data",QJsonObject{{"prompt","Generation history fixture"}}},{"ui_properties",QJsonObject{{"future",42}}},{"futureNode",true}}}},{"edges",QJsonArray{}}}}};}
QJsonArray metadata(){
 const QJsonObject property{{"name","prompt"},{"type",QJsonObject{{"type","str"}}},{"default",""}};
 const QJsonObject output{{"name","output"},{"type",QJsonObject{{"type","any"}}}};
 return {QJsonObject{{"node_type","fixture.Generator"},{"title","Generation fixture"},{"auto_save_asset",true},{"properties",QJsonArray{property}},{"outputs",QJsonArray{output}}}};
}
QJsonObject asset(const QString &id){return {{"id",id},{"name",(id==Image || id==OtherImage)?"Fixture.png":"Generation.txt"},{"user_id","1"},{"workflow_id",WorkflowId},{"node_id",NodeId},{"job_id","saved-run-"+id.left(1)},{"created_at","2026-11-05T00:00:00.000Z"},{"content_type",(id==Image || id==OtherImage)?"image/png":"text/plain"},{"get_url","/api/content/"+id},{"metadata",QJsonObject{{"text","Capped preview must not be executed"}}}};}
QByteArray trpc(const QJsonObject &object){return QJsonDocument(QJsonObject{{"result",QJsonObject{{"data",object}}}}).toJson(QJsonDocument::Compact);}
class Server final:public QTcpServer{
public:
 QJsonObject saved=workflow();bool deleted=false;QByteArray png,red;
 Server(){QImage image(8,8,QImage::Format_RGB32);image.fill(Qt::blue);QBuffer buffer(&png);buffer.open(QIODevice::WriteOnly);image.save(&buffer,"PNG");image.fill(Qt::red);QBuffer redBuffer(&red);redBuffer.open(QIODevice::WriteOnly);image.save(&redBuffer,"PNG");listen(QHostAddress::LocalHost);connect(this,&QTcpServer::newConnection,this,[this]{auto socket=nextPendingConnection();socket->setParent(this);connect(socket,&QTcpSocket::readyRead,this,[this,socket]{const auto request=socket->readAll();if(request.startsWith("GET /ws")){socket->disconnectFromHost();return;}QByteArray body;
 if(request.startsWith("GET /api/nodes/")){body=QJsonDocument(metadata()).toJson(QJsonDocument::Compact);}
 else if(request.startsWith("GET /api/workflows/")){body=QJsonDocument(saved).toJson(QJsonDocument::Compact);}
 else if(request.startsWith("GET /trpc/assets.list")){body=trpc({{"assets",deleted?QJsonArray{}:QJsonArray{asset(First),asset(Second),asset(Image)}},{"next",QJsonValue::Null}});}
 else if(request.startsWith("GET /trpc/assets.get")){body=trpc(asset(request.contains(OtherImage.toUtf8())?OtherImage:Image));}
 else if(request.startsWith(("GET /api/content/"+OtherImage).toUtf8())){body=red;}
 else if(request.startsWith(("GET /api/content/"+Image).toUtf8())){body=png;}
 else if(request.startsWith(("GET /api/content/"+First).toUtf8())){body="First full durable result";}
 else if(request.startsWith(("GET /api/content/"+Second).toUtf8())){body="Second full durable result";}
 else{body="{}";}
 socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "+QByteArray::number(body.size())+"\r\nConnection: close\r\n\r\n"+body);socket->disconnectFromHost();});});}
 QUrl url()const{return QUrl(QString("http://127.0.0.1:%1").arg(serverPort()));}
};
QQuickItem *find(QQuickItem *root,const QString &name){if(root->objectName()==name){return root;}for(auto child:root->childItems()){if(auto found=find(child,name)){return found;}}return nullptr;}
QQuickWidget *inspector(EditorWindow &window){for(auto panel:window.findChildren<QQuickWidget *>()){if(panel->source().fileName()=="Inspector.qml"){return panel;}}return nullptr;}
void click(QQuickWidget *panel,QQuickItem *item){QVERIFY(item);for(auto parent=item->parentItem();parent;parent=parent->parentItem()){if(parent->metaObject()->indexOfProperty("contentY")>=0){const auto y=item->mapToItem(parent,QPointF()).y();parent->setProperty("contentY",parent->property("contentY").toDouble()+y-30);break;}}QCoreApplication::processEvents();for(auto parent=item->parentItem();parent;parent=parent->parentItem()){parent->ensurePolished();}item->ensurePolished();QTest::mouseClick(panel->quickWindow(),Qt::LeftButton,Qt::NoModifier,item->mapToScene(QPointF(item->width()/2,item->height()/2)).toPoint());QCoreApplication::processEvents();}
}
class GenerationHistoryUiTest final:public QObject{
 Q_OBJECT
private slots:
 void distinctMediaPreviewsHaveIndependentRequests(){
  node_editor::registerMediaTypes();
  Server server;node_editor::ExecutionGenerationStore store;store.submitted("multi",workflow(),metadata(),{NodeId});
  const auto media=[](const QString &id){return QJsonObject{{"type","image"},{"asset_id",id},{"uri","asset://"+id}};};
  store.ingest("multi",{{"type","generation_complete"},{"node_id",NodeId},{"outputs",QJsonObject{{"first",media(Image)},{"second",media(OtherImage)}}}},1000);
  node_editor::GenerationHistory history(&store);history.configure(server.url(),{},"1");history.setWorkflow(workflow());history.selectNode(NodeId);node_editor::GenerationReplay replay;replay.setGenerationHistory(&history);replay.setSelection(NodeId);node_editor::MediaResolver resolver;resolver.configure(server.url(),{});
  QQuickWidget widget;widget.setResizeMode(QQuickWidget::SizeRootObjectToView);widget.rootContext()->setContextProperty("mediaResolver",&resolver);widget.setInitialProperties({{"generations",QVariant::fromValue(&replay)}});widget.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/GenerationHistory.qml"));widget.resize(350,700);widget.show();QVERIFY(widget.status()==QQuickWidget::Ready);
  QList<QQuickItem*> images;const auto collect=[&](auto &&self,QQuickItem *item)->void{if(item->objectName()=="preview-image"){images.append(item);}for(auto child:item->childItems()){self(self,child);}};
  QTRY_VERIFY([&]{images.clear();collect(collect,widget.rootObject());return images.size()==2;}());
  QTRY_COMPARE(images[0]->property("status").toInt(),1);QTRY_COMPARE(images[1]->property("status").toInt(),1);
  const QImage first(images[0]->property("source").toUrl().toLocalFile()),second(images[1]->property("source").toUrl().toLocalFile());QVERIFY(!first.isNull());QVERIFY(!second.isNull());QCOMPARE(first.pixelColor(0,0),QColor(Qt::blue));QCOMPARE(second.pixelColor(0,0),QColor(Qt::red));
 }
 void pinReplayPreviewUndoAndReopen(){
  Server server;EditorWindow window;window.show();window.session()->connectToServer(server.url(),{});window.openWorkflow(WorkflowId);QTRY_COMPARE(window.document()->snapshot()["id"].toString(),WorkflowId);QTRY_VERIFY(!window.generationHistory()->loading());QTRY_COMPARE(window.generationHistory()->outputs(NodeId,First)["output"].toString(),QString("First full durable result"));QVERIFY(window.selectNode(NodeId));QTest::qWait(80);
  const auto original=window.document()->snapshot();QVERIFY(window.document()->undoStack()->isClean());auto panel=inspector(window);QVERIFY(panel);click(panel,find(panel->rootObject(),"tab-history"));QTest::qWait(80);
  auto first=find(panel->rootObject(),"history-view-"+First);QVERIFY(first);click(panel,first);QVERIFY(window.document()->undoStack()->isClean());QCOMPARE(window.document()->snapshot(),original);
  click(panel,find(panel->rootObject(),"history-pin-"+First));QTRY_COMPARE(window.pinnedGeneration(),First);QCOMPARE(window.document()->undoStack()->count(),1);QVERIFY(!window.document()->undoStack()->isClean());QCOMPARE(window.document()->node(NodeId)["ui_properties"].toObject()["future"].toInt(),42);
  click(panel,find(panel->rootObject(),"history-replay-"+Second));click(panel,find(panel->rootObject(),"history-replay-"+First));QCOMPARE(window.replayGenerations(),(QStringList{Second,First}));
  const auto pinned=window.document()->snapshot();QTemporaryDir directory;QVERIFY(directory.isValid());const auto path=directory.filePath("pinned.json");QVERIFY(window.saveFile(path));
  click(panel,find(panel->rootObject(),"history-clear-replay"));QVERIFY(window.replayGenerations().isEmpty());window.action("Undo");QCOMPARE(window.replayGenerations(),(QStringList{Second,First}));
  click(panel,find(panel->rootObject(),"history-latest"));QVERIFY(window.pinnedGeneration().isEmpty());window.action("Undo");QCOMPARE(window.pinnedGeneration(),First);
  EditorWindow reopened;QVERIFY(reopened.openFile(path));QVERIFY(reopened.selectNode(NodeId));QCOMPARE(reopened.pinnedGeneration(),First);QCOMPARE(reopened.replayGenerations(),(QStringList{Second,First}));QCOMPARE(reopened.document()->snapshot(),pinned);
  if(window.outputVisible()){window.action("Output");}window.fit();
  click(panel,find(panel->rootObject(),"history-view-"+Image));QTest::qWait(80);auto preview=find(panel->rootObject(),"preview-image");QVERIFY(preview);QTRY_COMPARE(preview->property("status").toInt(),1);
  for(const bool dark:{true,false}){window.setDarkTheme(dark);QTest::qWait(100);const auto out=qEnvironmentVariable("NODETOOL_HISTORY_CAPTURE_DIR");if(!out.isEmpty()){QDir().mkpath(out);QVERIFY(window.grab().save(out+(dark?"/history-dark.png":"/history-light.png")));}}
  server.deleted=true;click(panel,find(panel->rootObject(),"history-refresh"));QTRY_VERIFY(!window.generationHistory()->loading());QTRY_VERIFY(window.generationHistory()->rows().isEmpty());QCOMPARE(window.pinnedGeneration(),First);QCOMPARE(window.replayGenerations(),(QStringList{Second,First}));QVERIFY(!window.pinGeneration(Second));QCOMPARE(window.document()->snapshot(),pinned);
 }
};
QTEST_MAIN(GenerationHistoryUiTest)
#include "GenerationHistoryUiTest.moc"
