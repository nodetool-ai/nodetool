#include "CompatibleNodePicker.h"
#include "EditorScene.h"
#include "WorkflowGraphModel.h"
#include "CompatibleNodePlacement.h"
#include "BodyConnectionRules.h"
#include "NodeCreation.h"
#include "document/ConnectionTypes.h"
#include <QApplication>
#include <QGraphicsView>
#include <QKeyEvent>
#include <QMouseEvent>
#include <QWheelEvent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSet>
#include <QTimer>
#include <QUuid>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <algorithm>
namespace nodetool {
namespace {
QJsonObject typeOf(const QJsonObject &port) {
  const auto value = port["type"];
  return value.isObject() ? value.toObject() : value.isString() ? QJsonObject{{"type",value}} : QJsonObject{};
}
QString nodeType(const QJsonObject &metadata) { return metadata["node_type"].toString(metadata["type"].toString()); }
class PickerWidget final : public QQuickWidget {
public:
  PickerWidget(QQmlEngine *engine,QWidget *parent) : QQuickWidget(engine,parent) {}
protected:
  void mousePressEvent(QMouseEvent *event) override { QQuickWidget::mousePressEvent(event); event->accept(); }
  void mouseMoveEvent(QMouseEvent *event) override { QQuickWidget::mouseMoveEvent(event); event->accept(); }
  void mouseReleaseEvent(QMouseEvent *event) override { QQuickWidget::mouseReleaseEvent(event); event->accept(); }
  void mouseDoubleClickEvent(QMouseEvent *event) override { QQuickWidget::mouseDoubleClickEvent(event); event->accept(); }
  void wheelEvent(QWheelEvent *event) override { QQuickWidget::wheelEvent(event); event->accept(); }
  void keyPressEvent(QKeyEvent *event) override { QQuickWidget::keyPressEvent(event); event->accept(); }
  void keyReleaseEvent(QKeyEvent *event) override { QQuickWidget::keyReleaseEvent(event); event->accept(); }
};
}
CompatibleNodePicker::CompatibleNodePicker(WorkflowGraphModel &model,
    EditorScene &scene,QGraphicsView &view,QQmlEngine *engine,QObject *parent)
    : QObject(parent),model_(model),scene_(scene),view_(view),engine_(engine) {
  connect(&scene_,&EditorScene::looseWireDropped,this,&CompatibleNodePicker::open);
  connect(&scene_,&EditorScene::wireBodyDropped,this,&CompatibleNodePicker::openBody);
  connect(&scene_,&EditorScene::handleContextMenuRequested,this,&CompatibleNodePicker::open);
  connect(&model_,&WorkflowGraphModel::projectionAboutToChange,this,&CompatibleNodePicker::cancel);
  qApp->installEventFilter(this);
}
CompatibleNodePicker::~CompatibleNodePicker() {
  qApp->removeEventFilter(this);
  active_=false; ++generation_;
  auto widget=widget_.data(); widget_.clear(); delete widget;
  for (const auto &retired:retired_) { delete retired.data(); }
}
QQuickWidget *CompatibleNodePicker::widget() const { return widget_; }
void CompatibleNodePicker::setCatalog(const QJsonArray &catalog) { cancel(); catalog_=catalog; }
QString CompatibleNodePicker::title() const {
  if (body_!=QtNodes::InvalidNodeId) { return port_==QtNodes::PortType::Out ? tr("Choose an input port"):tr("Choose an output port"); }
  return port_==QtNodes::PortType::Out ? tr("Connect to a new node") : tr("Connect from a new node");
}
bool CompatibleNodePicker::current() const {
  if (!active_ || model_.readOnly() || model_.resourceId(node_)!=resource_
      || (body_!=QtNodes::InvalidNodeId && model_.resourceId(body_)!=bodyResource_)) { return false; }
  const auto ports=model_.ports(node_,port_);
  if (index_>=unsigned(ports.size())) { return false; }
  const auto port=ports[int(index_)].toObject();
  return port["name"].toString()==handle_ && typeOf(port)==type_;
}
bool CompatibleNodePicker::initialize(QtNodes::NodeId node,QtNodes::PortType port,
    QtNodes::PortIndex index,const QPointF &position) {
  if (model_.readOnly() || !model_.nodeExists(node) || model_.metadata(node).isEmpty() || !engine_ ||
      (port!=QtNodes::PortType::In && port!=QtNodes::PortType::Out)) { return false; }
  const auto ports=model_.ports(node,port);
  if (index>=unsigned(ports.size())) { return false; }
  const auto fixed=ports[int(index)].toObject();
  type_=typeOf(fixed);
  if (type_["type"].toString().isEmpty()) { return false; }
  node_=node; port_=port; index_=index; position_=position;
  resource_=model_.resourceId(node); handle_=fixed["name"].toString();
  if (handle_.isEmpty()) { return false; }
  return true;
}
void CompatibleNodePicker::open(QtNodes::NodeId node,QtNodes::PortType port,
    QtNodes::PortIndex index,const QPointF &position) {
  cancel();
  if (!initialize(node,port,index,position)) { return; }
  QSet<QString> seen;
  for (const auto &value:catalog_) {
    const auto metadata=value.toObject();
    const auto type=nodeType(metadata);
    if (type.isEmpty() || metadata["hidden"].toBool()) { continue; }
    QVector<QJsonObject> matches;
    for (const auto &value:metadata[port==QtNodes::PortType::Out ? "properties":"outputs"].toArray()) {
      const auto candidate=value.toObject();
      if (candidate["name"].toString().isEmpty()) { continue; }
      const auto other=typeOf(candidate);
      const bool compatible=port==QtNodes::PortType::Out
          ? node_editor::connectionTypesCompatible(type_,other)
          : node_editor::connectionTypesCompatible(other,type_);
      if (compatible) { matches.append(candidate); }
    }
    const bool typed=std::any_of(matches.begin(),matches.end(),[](const auto &p) { return typeOf(p)["type"]!="any"; });
    if (typed) { matches.removeIf([](const auto &p) { return typeOf(p)["type"]=="any"; }); }
    if (port==QtNodes::PortType::Out) {
      const auto declared=metadata["input_fields"].toArray();
      const bool hasDeclared=std::any_of(matches.begin(),matches.end(),[&](const auto &p) { return declared.contains(p["name"]); });
      if (hasDeclared) { matches.removeIf([&](const auto &p) { return !declared.contains(p["name"]); }); }
    } else {
      const auto primary=metadata["primary_output"].toString();
      const auto found=std::find_if(matches.begin(),matches.end(),[&](const auto &p) { return p["name"].toString()==primary; });
      if (found!=matches.end()) { const auto selected=*found; matches={selected}; }
    }
    for (const auto &match:matches) {
      const auto name=match["name"].toString();
      const auto key=type+"\n"+name;
      if (seen.contains(key)) { continue; }
      seen.insert(key);
      candidates_.append(QVariantMap{{"key",key},{"type",type},{"port",name},
        {"label",metadata["title"].toString(type.section('.',-1))},
        {"namespace",metadata["namespace"].toString(type.section('.',0,-2))},
        {"portLabel",match["title"].toString(name)},
        {"typeLabel",typeOf(match)["type"].toString()}});
    }
  }
  showWidget();
}
void CompatibleNodePicker::showWidget() {
  active_=true;
  auto widget=new PickerWidget(engine_,&view_); widget_=widget;
  widget->setObjectName("compatible-node-picker");
  widget->setAttribute(Qt::WA_AlwaysStackOnTop);
  widget->setClearColor(Qt::transparent);
  widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
  widget->setInitialProperties({{"picker",QVariant::fromValue(this)},{"activationToken",generation_}});
  widget->setSource(QUrl("qrc:/editor/CompatibleNodePicker.qml"));
  if (widget->status()==QQuickWidget::Error) { cancel(); return; }
  positionWidget(); widget->show(); widget->raise(); widget->setFocus(Qt::MouseFocusReason);
  emit changed();
  QTimer::singleShot(0,this,[this,widget=QPointer<QQuickWidget>(widget)] {
    if (current() && widget_==widget && widget) { QMetaObject::invokeMethod(widget->rootObject(),"activate"); }
  });
}
void CompatibleNodePicker::applyBody(const QString &port,const QJsonArray &prefix,
    const QJsonObject &sourceTypeOverride,bool newDynamicInput) {
  if (!current()) { cancel(); return; }
  const bool forward=port_==QtNodes::PortType::Out;
  const auto command=bodyConnectionCommand(model_,forward ? node_:body_,forward ? handle_:port,
      forward ? body_:node_,forward ? port:handle_,prefix,sourceTypeOverride,newDynamicInput);
  cancel();
  if (applyCommand) { applyCommand(command); }
}
void CompatibleNodePicker::openBody(QtNodes::NodeId node,QtNodes::PortType port,
    QtNodes::PortIndex index,QtNodes::NodeId target,const QPointF &position) {
  cancel();
  if (!initialize(node,port,index,position) || !model_.nodeExists(target) || model_.metadata(target).isEmpty()) { return; }
  body_=target; bodyResource_=model_.resourceId(target); active_=true;
  const auto snapshot=model_.nodeSnapshot(target),metadata=model_.metadata(target),origin=model_.nodeSnapshot(node);
  const bool forward=port==QtNodes::PortType::Out;
  const auto dynamic=[&](bool output) {
    const auto name=dynamicBodyPortName(origin,snapshot,metadata,output);
    QJsonObject command{{"op",output ? "addDynamicOutput":"addDynamicInput"},{"id",bodyResource_},{"name",name}};
    QJsonObject declared=type_;
    if (output) { declared=QJsonObject{{"type",type_["type"]},{"optional",false},{"type_args",QJsonArray{}},{"type_name",""}}; }
    if (output || type_["type"]!="any") { command["type"]=declared; }
    applyBody(name,QJsonArray{command},output ? declared:QJsonObject{},!output);
  };
  if (!forward && metadata["supports_dynamic_outputs"].toBool()) { dynamic(true); return; }
  const auto type=snapshot["type"].toString();
  if (type=="nodetool.control.Reroute") { applyBody(forward ? "input_value":"output"); return; }
  if (forward && type=="nodetool.workflows.base_node.Preview") { applyBody("value"); return; }
  if (forward && handle_=="__control__") { applyBody("__control__"); return; }
  if (forward && metadata["supports_dynamic_inputs"].toBool() && !schemaOnlyInputs(type)) {
    const auto *item = scene_.nodeGraphicsObject(target);
    const auto local = item ? item->mapFromScene(position) : QPointF{};
    for (const auto &row : model_.layout(target).rows) {
      if ((row.action == "addInput" || row.action == "addContentInput") && row.rect.contains(local)) {
        dynamic(false); return;
      }
    }
  }
  for (const auto &candidate:bodyPorts(snapshot,metadata,!forward)) {
    const bool compatible=forward ? node_editor::connectionTypesCompatible(type_,candidate.type)
        : node_editor::connectionTypesCompatible(candidate.type,type_);
    if (!compatible) { continue; }
    candidates_.append(QVariantMap{{"key",candidate.name},{"port",candidate.name},
      {"type",type},{"label",candidate.name},{"portLabel",candidate.name},{"typeLabel",candidate.type["type"].toString()}});
  }
  if (candidates_.size()==1) { applyBody(candidates_.first().toMap()["port"].toString()); return; }
  if (candidates_.size()>1) { showWidget(); return; }
  if (forward && metadata["supports_dynamic_inputs"].toBool() && !schemaOnlyInputs(type)) { dynamic(false); return; }
  cancel();
}
QVariantList CompatibleNodePicker::rows() const {
  QVariantList result;
  const auto terms=query_.simplified().toCaseFolded().split(' ',Qt::SkipEmptyParts);
  for (const auto &value:candidates_) {
    const auto row=value.toMap();
    const auto text=(row["label"].toString()+" "+row["type"].toString()+" "+row["port"].toString()).toCaseFolded();
    if (std::all_of(terms.begin(),terms.end(),[&](const auto &term) { return text.contains(term); })) { result.append(row); }
  }
  const auto prefix=query_.trimmed().toCaseFolded();
  std::stable_sort(result.begin(),result.end(),[&](const auto &a,const auto &b) {
    const auto aa=a.toMap()["label"].toString(),bb=b.toMap()["label"].toString();
    const bool ap=aa.toCaseFolded().startsWith(prefix),bp=bb.toCaseFolded().startsWith(prefix);
    if (ap!=bp) { return ap; }
    return QString::compare(aa,bb,Qt::CaseInsensitive)<0;
  });
  return result;
}
void CompatibleNodePicker::setQuery(const QString &query) { if (query_!=query) { query_=query; emit changed(); } }
void CompatibleNodePicker::choose(const QString &key, int generation) {
  if (generation!=generation_) { return; }
  if (!current()) { cancel(); return; }
  QVariantMap row;
  for (const auto &value:rows()) { if (value.toMap()["key"].toString()==key) { row=value.toMap(); break; } }
  if (row.isEmpty()) { return; }
  if (body_!=QtNodes::InvalidNodeId) { applyBody(row["port"].toString()); return; }
  QJsonObject metadata;
  for (const auto &value:catalog_) { if (nodeType(value.toObject())==row["type"].toString()) { metadata=value.toObject(); break; } }
  if (metadata.isEmpty()) { cancel(); return; }
  QString id;
  const auto command=connectCommand(metadata,port_==QtNodes::PortType::Out,resource_,handle_,row["port"].toString(),position_,id);
  // Close before document projection destroys any scene items or Quick objects.
  cancel();
  if (applyCommand && applyCommand(command)) { emit nodeCreated(id); }
}
// One canonical add-node/add-edge batch. `forward` wires `resource`'s output `handle` into the new
// node's `port`; otherwise the new node's output `port` feeds `resource`'s input `handle`.
QJsonObject CompatibleNodePicker::connectCommand(const QJsonObject &metadata,bool forward,const QString &resource,
    const QString &handle,const QString &port,const QPointF &position,QString &id) const {
  QJsonArray existing;
  for (const auto nodeId:model_.allNodeIds()) { existing.append(model_.nodeSnapshot(nodeId)); }
  NodeCreationOptions options;
  if (forward) { options.receivingName=handle; options.useMetadataStyle=true; }
  auto node=createNativeNode(metadata,position,existing,{},options);
  id=node["id"].toString();
  const QJsonObject edge{{"id",QUuid::createUuid().toString(QUuid::Id128)},
    {"source",forward ? resource:id},{"target",forward ? id:resource},
    {"sourceHandle",forward ? handle:port},
    {"targetHandle",forward ? port:handle}};
  WorkflowGraphModel preview;
  preview.project(QJsonObject{{"nodes",QJsonArray{node}},{"edges",QJsonArray{edge}}},QJsonArray{metadata});
  const auto previewId=*preview.allNodeIds().begin();
  const auto &layout=preview.layout(previewId);
  auto placed=position;
  if (forward) {
    const auto inputs=preview.ports(previewId,QtNodes::PortType::In);
    double offset=node_metrics::contentTop+node_metrics::rowHeight/2.0;
    for (qsizetype i=0;i<inputs.size();++i) {
      if (inputs[i].toObject()["name"].toString()==port) { offset=layout.inputY[i]; break; }
    }
    placed+=QPointF(60,-offset);
  } else {
    placed-=QPointF(40+layout.size.width(),layout.size.height()/2.0);
  }
  QVector<QRectF> obstacles;
  for (const auto existing:model_.allNodeIds()) {
    obstacles.append(QRectF(model_.nodeData(existing,QtNodes::NodeRole::Position).toPointF(),model_.layout(existing).size));
  }
  placed.setY(compatibleNodeY(QRectF(placed,layout.size),obstacles));
  auto ui=node["ui_properties"].toObject();
  ui["position"]=QJsonObject{{"x",placed.x()},{"y",placed.y()}};
  node["ui_properties"]=ui;
  return QJsonObject{{"op","batch"},{"commands",QJsonArray{
    QJsonObject{{"op","addNode"},{"node",node}},QJsonObject{{"op","addEdge"},{"edge",edge}}}}};
}
// Web useAddConnectedNode: a node of `type` beside an output, wired to `targetPort`, in one step.
// The output handle's scene position is the anchor the loose-wire picker would have used.
bool CompatibleNodePicker::addConnected(QtNodes::NodeId source,const QString &outputName,const QString &type,const QString &targetPort) {
  if (model_.readOnly() || !model_.nodeExists(source) || model_.metadata(source).isEmpty()) { return false; }
  const auto outputs=model_.ports(source,QtNodes::PortType::Out);
  const auto &layout=model_.layout(source);
  QJsonObject metadata;
  for (const auto &value:catalog_) { if (nodeType(value.toObject())==type) { metadata=value.toObject(); break; } }
  if (metadata.isEmpty()) { return false; }
  for (qsizetype i=0;i<outputs.size();++i) {
    if (outputs[i].toObject()["name"].toString()!=outputName) { continue; }
    const auto anchor=model_.nodeData(source,QtNodes::NodeRole::Position).toPointF()
        +QPointF(layout.size.width(),i<layout.outputY.size() ? layout.outputY[i]:node_metrics::contentTop+node_metrics::rowHeight/2.0);
    QString id;
    const auto command=connectCommand(metadata,true,model_.resourceId(source),outputName,targetPort,anchor,id);
    if (applyCommand && applyCommand(command)) { emit nodeCreated(id); return true; }
    return false;
  }
  return false;
}
void CompatibleNodePicker::search(const QString &query,int generation) { if (generation==generation_ && current()) { setQuery(query); } }
void CompatibleNodePicker::dismiss(int generation) { if (generation==generation_) { cancel(); } }
bool CompatibleNodePicker::canDeleteOutput() const {
    if (!active_ || body_!=QtNodes::InvalidNodeId || port_!=QtNodes::PortType::Out || model_.readOnly()) { return false; }
    if (!model_.metadata(node_)["supports_dynamic_outputs"].toBool()) { return false; }
    return model_.nodeSnapshot(node_)["dynamic_outputs"].toObject().contains(handle_);
}
void CompatibleNodePicker::deleteOutput(int generation) {
    if (generation!=generation_ || !current() || !canDeleteOutput()) { return; }
    const QJsonObject command{{"op","removeDynamicOutput"},{"id",resource_},{"name",handle_}};
    // Close before document projection destroys any scene items or Quick objects.
    cancel();
    if (applyCommand) { applyCommand(command); }
}
void CompatibleNodePicker::cancel() {
  scene_.resetDraftConnection();
  ++generation_;
  active_=false; candidates_.clear(); query_.clear(); body_=QtNodes::InvalidNodeId; bodyResource_.clear();
  if (widget_) {
    auto old=widget_; widget_.clear(); old->hide(); old->setEnabled(false);
    retired_.removeIf([](const auto &p) { return p.isNull(); }); retired_.append(old); old->deleteLater();
  }
  emit changed();
}
bool CompatibleNodePicker::owns(QObject *object) const {
  if (!widget_) { return false; }
  const auto item=qobject_cast<QQuickItem *>(object);
  if (object==widget_ || object==widget_->quickWindow() || (item && item->window()==widget_->quickWindow())) { return true; }
  for (auto p=object;p;p=p->parent()) { if (p==widget_ || p==widget_->rootObject()) { return true; } }
  return false;
}
void CompatibleNodePicker::positionWidget() {
  if (!widget_) { return; }
  const auto size=QSize(std::min(340,view_.viewport()->width()),std::min(380,view_.viewport()->height()));
  auto point=view_.mapFromScene(position_);
  point.setX(std::clamp(point.x(),0,std::max(0,view_.viewport()->width()-size.width())));
  point.setY(std::clamp(point.y(),0,std::max(0,view_.viewport()->height()-size.height())));
  widget_->setGeometry(QRect(view_.viewport()->mapTo(&view_,point),size));
}
bool CompatibleNodePicker::eventFilter(QObject *object,QEvent *event) {
  if (!active_) { return QObject::eventFilter(object,event); }
  if (event->type()==QEvent::ShortcutOverride && owns(object)) { event->accept(); return true; }
  if ((event->type()==QEvent::MouseButtonPress || event->type()==QEvent::Wheel) && !owns(object)) {
    const auto target=qobject_cast<QWidget *>(object);
    const bool sameWindow=object==view_.window()->windowHandle() || (target && target->window()==view_.window());
    const auto global=event->type()==QEvent::MouseButtonPress
        ? static_cast<QMouseEvent *>(event)->globalPosition() : static_cast<QWheelEvent *>(event)->globalPosition();
    const bool inside=widget_ && sameWindow && widget_->rect().contains(widget_->mapFromGlobal(global.toPoint()));
    // Window-system delivery visits the top-level window before routing to the
    // child Quick widget. Preserve that delivery when its point is in the menu.
    if (!inside) { cancel(); }
  }
  if (event->type()==QEvent::Resize && object==view_.viewport()) { positionWidget(); }
  return QObject::eventFilter(object,event);
}
}
