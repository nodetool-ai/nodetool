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
#include <QJsonDocument>
#include <QRegularExpression>
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
// web config/data_types.ts labelForType over NODETOOL_DATA_TYPES.
QString labelForType(const QString &type) {
  static const QHash<QString,QString> labels{
    {"any","Any"},{"notype","No Type"},{"asset","Asset"},{"audio","Audio"},{"video","Video"},{"sketch","Sketch"},
    {"timeline","Timeline"},{"script","Script"},{"storyboard","Storyboard"},{"entity","Entity"},{"keyframe","Keyframe"},
    {"video_element","Video Element"},{"shot","Shot"},{"game_slot","Game Slot"},{"slot_fill","Slot Fill"},{"bool","Boolean"},
    {"chunk","Chunk"},{"cv","CV"},{"dataframe","Dataframe"},{"document","Document"},{"dict","Dictionary"},{"enum","Enumeration"},
    {"file","File"},{"float","Float"},{"folder","Folder"},{"image","Image"},{"int","Integer"},{"list","List"},{"str","String"},
    {"tensor","Tensor"},{"text","Text"},{"union","Union"},{"language_model","Language Model"},{"embedding_model","Embedding Model"},
    {"asr_model","ASR Model"},{"rerank_model","Rerank Model"},{"bytes","Bytes"},{"collection","Collection"},{"font","Font"},
    {"image_size","Image size"},{"llama_cpp_model","Llama.cpp model"},{"llama_model","Llama model (HF)"},{"message","Message"},
    {"mistral_model","Mistral model"},{"model_3d_model","3D pipeline model"},{"none","None"},{"task","Task"},{"thread","Thread"},
    {"model_ref","Model Reference"},{"image_model","Image Model"},{"tjs.cached","Transformers.js model (tjs.*)"},
    {"torch_tensor","Torch tensor"},{"tts_model","TTS model"},{"music_model","Music model"},
    {"audio_to_audio_model","Audio to audio model"},{"video_model","Video model"},{"workflow","Workflow"},{"datetime","DateTime"},
    {"date","Date"},{"object","Object"},{"json","JSON"},{"model_3d","Model 3D"},{"np_array","NumPy Array"}};
  auto name=type; if (name.startsWith("nodetool.")) { name=name.mid(9); }
  if (name=="model3d") { name="model_3d"; }
  if (const auto found=labels.constFind(name);found!=labels.constEnd()) { return found.value(); }
  if (name.startsWith("tjs.")) { return labels.value("tjs.cached"); }
  return {};
}
// web InputContextMenu.tsx NODE_PATHS_BY_TYPE and LIST_CONSTANT_PATHS.
struct NodePaths { QString input, constant, sourceHandle, label; };
const NodePaths *nodePathsFor(const QString &type) {
  static const QHash<QString,NodePaths> paths{
    {"str",{"nodetool.input.StringInput","nodetool.constant.String"}},
    {"int",{"nodetool.input.IntegerInput","nodetool.constant.Integer"}},
    {"float",{"nodetool.input.FloatInput","nodetool.constant.Float"}},
    {"bool",{"nodetool.input.BooleanInput","nodetool.constant.Bool"}},
    {"boolean",{"nodetool.input.BooleanInput","nodetool.constant.Bool"}},
    {"image",{"nodetool.input.ImageInput","nodetool.constant.Image"}},
    {"audio",{"nodetool.input.AudioInput","nodetool.constant.Audio"}},
    {"video",{"nodetool.input.VideoInput","nodetool.constant.Video"}},
    {"document",{"nodetool.input.DocumentInput","nodetool.constant.Document"}},
    {"dataframe",{"nodetool.input.DataframeInput","nodetool.constant.DataFrame"}},
    {"enum",{"nodetool.input.SelectInput","nodetool.constant.Select"}},
    {"language_model",{"nodetool.input.LanguageModelInput","nodetool.constant.LanguageModelConstant"}},
    {"image_model",{"nodetool.input.ImageModelInput","nodetool.constant.ImageModelConstant"}},
    {"video_model",{"nodetool.input.VideoModelInput","nodetool.constant.VideoModelConstant"}},
    {"tts_model",{"nodetool.input.TTSModelInput","nodetool.constant.TTSModelConstant"}},
    {"asr_model",{"nodetool.input.ASRModelInput","nodetool.constant.ASRModelConstant"}},
    {"embedding_model",{"nodetool.input.EmbeddingModelInput","nodetool.constant.EmbeddingModelConstant"}},
    {"image_size",{"nodetool.input.ImageSizeInput","nodetool.constant.ImageSize","image_size"}}};
  const auto found=paths.constFind(type); return found==paths.constEnd() ? nullptr : &found.value();
}
const NodePaths *listPathsFor(const QString &element) {
  static const QHash<QString,NodePaths> paths{
    {"image",{"nodetool.input.ImageListInput","nodetool.constant.ImageList",{},"Image List"}},
    {"video",{"nodetool.input.VideoListInput","nodetool.constant.VideoList",{},"Video List"}},
    {"audio",{"nodetool.input.AudioListInput","nodetool.constant.AudioList",{},"Audio List"}},
    {"text",{"nodetool.input.TextListInput","nodetool.constant.TextList",{},"Text List"}},
    {"str",{"nodetool.input.StringListInput","nodetool.constant.TextList",{},"Text List"}}};
  const auto found=paths.constFind(element); return found==paths.constEnd() ? nullptr : &found.value();
}
// web utils/codeGenEntryPoints.ts: a handle name as a free JavaScript identifier on the Code node.
const QString codeNodeType=QStringLiteral("nodetool.code.Code");
QString codePortName(const QString &handle,const QString &fallback,const QSet<QString> &taken) {
  // @nodetool-ai/protocol api-schemas/code-gen.ts RESERVED_PORT_NAMES.
  static const QSet<QString> reserved{"await","break","case","catch","class","const","continue","debugger","default",
    "delete","do","else","enum","export","extends","false","finally","for","function","if","implements","import","in",
    "instanceof","interface","let","new","null","package","private","protected","public","return","static","super",
    "switch","this","throw","true","try","typeof","var","void","while","with","yield"};
  static const QRegularExpression outside(QStringLiteral("[^A-Za-z0-9_$]")),identifier(QStringLiteral("^[A-Za-z_$][A-Za-z0-9_$]*$"));
  auto base=QString(handle).replace(outside,QStringLiteral("_"));
  if (!base.isEmpty() && base.front().isDigit()) { base.prepend('_'); }
  base=base.left(64);
  if (!identifier.match(base).hasMatch()) { base=fallback; }
  const auto free=[&](const QString &name) { return !taken.contains(name) && !reserved.contains(name); };
  if (free(base)) { return base; }
  const auto stem=base.left(61);
  int suffix=2;
  while (!free(stem+"_"+QString::number(suffix))) { ++suffix; }
  return stem+"_"+QString::number(suffix);
}
// web utils/dynamicSlots.ts defaultValueForType.
QJsonValue defaultValueFor(const QString &type) {
  if (type=="str" || type=="text" || type=="any") { return QString(); }
  if (type=="int" || type=="float" || type=="number") { return 0; }
  if (type=="bool") { return false; }
  if (type=="list") { return QJsonArray{}; }
  if (type=="dict") { return QJsonObject{}; }
  return QJsonValue::Null;
}
// web utils/TypeHandler.ts isCollectType: a list of one concrete element type.
bool isCollect(const QJsonObject &type) {
  const auto args=type["type_args"].toArray();
  if (type["type"].toString()!="list" || args.size()!=1) { return false; }
  const auto element=typeOf(QJsonObject{{"type",args[0]}})["type"].toString();
  return !element.isEmpty() && element!="any";
}
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
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  auto widget=widget_.data(); widget_.clear(); delete widget;
}
QQuickWidget *CompatibleNodePicker::widget() const { return widget_; }
void CompatibleNodePicker::setCatalog(const QJsonArray &catalog) { cancel(); catalog_=catalog; compatibleCache_.clear(); }
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
void CompatibleNodePicker::addCandidate(QVector<Candidate> &into,QVariantMap row) {
  const auto label=row["label"].toString();
  const auto text=(label+" "+row["type"].toString()+" "+row["port"].toString()).toCaseFolded();
  into.append(Candidate{std::move(row),text,label.toCaseFolded()});
}
QVector<CompatibleNodePicker::Candidate> CompatibleNodePicker::catalogCandidates() const {
  QVector<Candidate> result;
  QSet<QString> seen;
  const bool forward=port_==QtNodes::PortType::Out;
  for (const auto &value:catalog_) {
    const auto metadata=value.toObject();
    const auto type=nodeType(metadata);
    if (type.isEmpty() || metadata["hidden"].toBool()) { continue; }
    QVector<QJsonObject> matches;
    for (const auto &value:metadata[forward ? "properties":"outputs"].toArray()) {
      const auto candidate=value.toObject();
      if (candidate["name"].toString().isEmpty()) { continue; }
      const auto other=typeOf(candidate);
      const bool compatible=forward
          ? node_editor::connectionTypesCompatible(type_,other)
          : node_editor::connectionTypesCompatible(other,type_);
      if (compatible) { matches.append(candidate); }
    }
    const bool typed=std::any_of(matches.begin(),matches.end(),[](const auto &p) { return typeOf(p)["type"]!="any"; });
    if (typed) { matches.removeIf([](const auto &p) { return typeOf(p)["type"]=="any"; }); }
    if (forward) {
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
      addCandidate(result,QVariantMap{{"key",key},{"type",type},{"port",name},
        {"label",metadata["title"].toString(type.section('.',-1))},
        {"namespace",metadata["namespace"].toString(type.section('.',0,-2))},
        {"portLabel",match["title"].toString(name)},
        {"typeLabel",typeOf(match)["type"].toString()}});
      result.last().node={type,metadata["title"].toString(),metadata["namespace"].toString(),
        metadata["description"].toString(),metadata["deprecated"].toBool()};
    }
  }
  return result;
}
void CompatibleNodePicker::open(QtNodes::NodeId node,QtNodes::PortType port,
    QtNodes::PortIndex index,const QPointF &position) {
  cancel();
  if (!initialize(node,port,index,position)) { return; }
  // The rows depend only on the catalog, the direction and the port type.
  const auto cacheKey=QString::number(int(port))+QJsonDocument(type_).toJson(QJsonDocument::Compact);
  auto cached=compatibleCache_.find(cacheKey);
  if (cached==compatibleCache_.end()) { cached=compatibleCache_.insert(cacheKey,catalogCandidates()); }
  candidates_=*cached; rowsValid_=false;
  buildFixed();
  showWidget();
}
void CompatibleNodePicker::showWidget() {
  active_=true;
  // One widget for the picker's lifetime, so the QML compiles once.
  if (!widget_) {
    auto widget=new PickerWidget(engine_,&view_); widget_=widget;
    widget->setObjectName("compatible-node-picker");
    widget->setAttribute(Qt::WA_AlwaysStackOnTop);
    widget->setClearColor(Qt::transparent);
    widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
    widget->setInitialProperties({{"picker",QVariant::fromValue(this)}});
    widget->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/CompatibleNodePicker.qml"));
    if (widget->status()==QQuickWidget::Error) { widget_.clear(); widget->deleteLater(); cancel(); return; }
  }
  const auto widget=widget_;
  widget->rootObject()->setProperty("activationToken",generation_);
  widget->setEnabled(true);
  positionWidget(); widget->show(); widget->raise(); widget->setFocus(Qt::MouseFocusReason);
  emit changed();
  QTimer::singleShot(0,this,[this,widget,token=generation_] {
    if (current() && token==generation_ && widget) { QMetaObject::invokeMethod(widget->rootObject(),"activate"); }
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
    addCandidate(candidates_,QVariantMap{{"key",candidate.name},{"port",candidate.name},
      {"type",type},{"label",candidate.name},{"portLabel",candidate.name},{"typeLabel",candidate.type["type"].toString()}});
  }
  rowsValid_=false;
  if (candidates_.size()==1) { applyBody(candidates_.first().row["port"].toString()); return; }
  if (candidates_.size()>1) { showWidget(); return; }
  if (forward && metadata["supports_dynamic_inputs"].toBool() && !schemaOnlyInputs(type)) { dynamic(false); return; }
  cancel();
}
QVariantList CompatibleNodePicker::rows() const {
  if (rowsValid_) { return rowsCache_; }
  rowsCache_.clear();
  if (body_==QtNodes::InvalidNodeId) {
    // ConnectableNodes.tsx: rankSearchNodes over the compatible nodes, with the
    // recent and quick-action boosts. A node keeps its compatible ports together.
    QList<CatalogSearchNode> nodes;
    QVector<QVector<int>> ports;
    QHash<QString,int> at;
    for (int i=0;i<candidates_.size();++i) {
      const auto &node=candidates_[i].node;
      auto found=at.constFind(node.type);
      if (found==at.constEnd()) { found=at.insert(node.type,int(nodes.size())); nodes.append(node); ports.append(QVector<int>{}); }
      ports[found.value()].append(i);
    }
    const auto recent=recentTypes ? recentTypes() : QStringList{};
    for (const int node:ranker_.rank(nodes,query_,recent)) {
      for (const int i:ports[node]) { rowsCache_.append(candidates_[i].row); }
    }
    rowsValid_=true;
    return rowsCache_;
  }
  // A body drop lists one node's ports, which the query matches by name.
  const auto terms=query_.simplified().toCaseFolded().split(' ',Qt::SkipEmptyParts);
  for (const auto &candidate:candidates_) {
    if (std::all_of(terms.begin(),terms.end(),[&](const auto &term) { return candidate.text.contains(term); })) { rowsCache_.append(candidate.row); }
  }
  rowsValid_=true;
  return rowsCache_;
}
QJsonObject CompatibleNodePicker::metadataFor(const QString &type) const {
  for (const auto &value:catalog_) { if (nodeType(value.toObject())==type) { return value.toObject(); } }
  return {};
}
void CompatibleNodePicker::buildFixed() {
  fixed_.clear();
  // A const view, so a lookup never inserts a key into type_, which current() compares.
  const auto &source=std::as_const(type_);
  const auto type=source["type"].toString();
  const auto add=[this](const QString &key,const QString &label,const QString &nodeType,const QString &port,
                        const QString &receivingName={},const QJsonObject &overrides={},bool replace=false) {
    if (metadataFor(nodeType).isEmpty()) { return; }
    fixed_.append(FixedAction{"fixed\n"+key,label,nodeType,port,receivingName,overrides,replace});
  };
  if (port_==QtNodes::PortType::Out) {
    // OutputContextMenu.tsx: Preview, Output, Reroute, Save <Type>, the quick actions, Delete output.
    add("preview",tr("Preview"),"nodetool.workflows.base_node.Preview","value");
    add("output",tr("Output"),"nodetool.output.Output","value");
    add("reroute",tr("Reroute"),"nodetool.control.Reroute","input_value");
    if (!type.isEmpty()) {
      const auto label=labelForType(type).remove(' ');
      const auto save=metadataFor("nodetool."+label.toLower()+".Save"+label);
      if (!save.isEmpty()) {
        QString port="value";
        for (const auto &value:save["properties"].toArray()) {
          const auto property=value.toObject();
          if (node_editor::connectionTypesCompatible(source,typeOf(property))) { port=property["name"].toString(); break; }
        }
        const auto typeName=source["type_name"].toString();
        const auto text=type=="string" ? tr("Save text")
            : !typeName.isEmpty() ? tr("Save %1").arg(typeName.left(1).toUpper()+typeName.mid(1)) : tr("Save");
        add("save",text,nodeType(save),port);
      }
    }
    // OutputContextMenu.tsx: "Transform this output…" seeds a Code node input from the output.
    if (!type.isEmpty() && !handle_.startsWith("__") && !metadataFor(codeNodeType).isEmpty()) {
      FixedAction transform{"fixed\ntransform",tr("Transform this output…"),codeNodeType};
      transform.code=true; fixed_.append(transform);
    }
    // web config/outputQuickActions.ts outputQuickActionsFor.
    if (type=="image") {
      add("upscale",tr("Upscale"),"nodetool.image.Upscale","image");
      add("remove-background",tr("Remove background"),"nodetool.image.RemoveBackground","image");
      add("edit",tr("Edit with prompt"),"nodetool.image.ImageToImage","image");
    }
    if (model_.metadata(node_)["supports_dynamic_outputs"].toBool()
        && model_.nodeSnapshot(node_)["dynamic_outputs"].toObject().contains(handle_)) {
      fixed_.append(FixedAction{"fixed\ndelete-output",tr("Delete output"),{},{},{},{},false,true});
    }
    return;
  }
  // InputContextMenu.tsx: the collect element rows, Constant, Input, Prompt.
  const auto args=source["type_args"].toArray();
  const bool collect=type=="list" && args.size()==1 && typeOf(QJsonObject{{"type",args[0]}})["type"].toString()!="any"
      && !typeOf(QJsonObject{{"type",args[0]}})["type"].toString().isEmpty();
  const auto element=collect ? typeOf(QJsonObject{{"type",args[0]}}) : QJsonObject{};
  const auto elementType=element["type"].toString();
  const auto *special=collect ? listPathsFor(elementType) : nullptr;
  const auto *paths=nodePathsFor(type);
  const auto label=labelForType(type).remove(' ');
  const auto inputPath=special ? special->input : paths ? paths->input : "nodetool.input."+label+"Input";
  const auto constantPath=special ? special->constant : paths ? paths->constant : "nodetool.constant."+label;
  QJsonObject enumPresets;
  if (type=="enum") {
    if (!source["type_name"].toString().isEmpty()) { enumPresets["enum_type_name"]=source["type_name"]; }
    const auto values=source["values"].toArray();
    if (!values.isEmpty()) { enumPresets["options"]=values; enumPresets["value"]=values.first(); }
  }
  if (collect) {
    const auto elementLabel=labelForType(elementType).remove(' ');
    const auto *elementPaths=nodePathsFor(elementType);
    const auto shown=labelForType(elementType);
    if (!elementLabel.isEmpty()) {
      add("collect-constant",tr("Create %1 constant").arg(shown),"nodetool.constant."+elementLabel,"output");
    }
    const auto elementInput=elementPaths ? elementPaths->input : elementLabel.isEmpty() ? QString() : "nodetool.input."+elementLabel+"Input";
    if (!elementInput.isEmpty()) { add("collect-input",tr("Create %1 input").arg(shown),elementInput,"output",handle_); }
  }
  add("constant",special ? tr("Create %1 constant").arg(special->label) : tr("Constant"),constantPath,
      paths && !paths->sourceHandle.isEmpty() ? paths->sourceHandle : QString("output"),{},enumPresets,!collect);
  auto inputPresets=enumPresets;
  if (inputPath=="nodetool.input.IntegerInput" || inputPath=="nodetool.input.FloatInput") {
    // useConnectionHandlers.ts: min, max and default of the target property.
    for (const auto &value:model_.metadata(node_)["properties"].toArray()) {
      const auto property=value.toObject();
      if (property["name"].toString()!=handle_) { continue; }
      if (!property["min"].isNull() && !property["min"].isUndefined()) { inputPresets["min"]=property["min"]; }
      if (!property["max"].isNull() && !property["max"].isUndefined()) { inputPresets["max"]=property["max"]; }
      if (property["default"].isDouble()) { inputPresets["value"]=property["default"]; }
      break;
    }
  }
  add("input",special ? tr("Create %1 input").arg(special->label) : tr("Input"),inputPath,"output",handle_,inputPresets,!collect);
  if (type=="str") { add("prompt",tr("Prompt"),"nodetool.text.Prompt","output",{},{},!collect); }
  // InputContextMenu.tsx: "Create value with AI…" seeds a Code node output from the input.
  if (!type.isEmpty() && !handle_.startsWith("__") && !metadataFor(codeNodeType).isEmpty()) {
    FixedAction value{"fixed\ncreate-value",tr("Create value with AI…"),codeNodeType};
    value.code=true; fixed_.append(value);
  }
}
QVariantList CompatibleNodePicker::fixedRows() const {
  QVariantList result;
  if (body_!=QtNodes::InvalidNodeId || !query_.trimmed().isEmpty()) { return result; }
  for (const auto &action:fixed_) {
    result.append(QVariantMap{{"key",action.key},{"label",action.label},{"destructive",action.destructive}});
  }
  return result;
}
void CompatibleNodePicker::setQuery(const QString &query) { if (query_!=query) { query_=query; rowsValid_=false; emit changed(); } }
void CompatibleNodePicker::choose(const QString &key, int generation) {
  if (generation!=generation_) { return; }
  if (!current()) { cancel(); return; }
  if (key.startsWith("fixed\n")) {
    if (!query_.trimmed().isEmpty()) { return; }
    const auto action=std::find_if(fixed_.cbegin(),fixed_.cend(),[&](const auto &a) { return a.key==key; });
    if (action==fixed_.cend()) { return; }
    if (action->destructive) { deleteOutput(generation); return; }
    if (action->code) { chooseCode(metadataFor(action->type)); return; }
    const auto metadata=metadataFor(action->type);
    QString id;
    const auto command=connectCommand(metadata,port_==QtNodes::PortType::Out,resource_,handle_,action->port,position_,id,
        action->overrides,action->receivingName,action->replaceTarget);
    cancel();
    if (applyCommand && applyCommand(command)) { emit nodeCreated(id); }
    return;
  }
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
    const QString &handle,const QString &port,const QPointF &position,QString &id,
    const QJsonObject &overrides,const QString &receivingName,bool replaceTarget,const QJsonObject &dynamic) const {
  QJsonArray existing;
  for (const auto nodeId:model_.allNodeIds()) { existing.append(model_.nodeSnapshot(nodeId)); }
  NodeCreationOptions options;
  if (forward) { options.receivingName=handle; options.useMetadataStyle=true; }
  else { options.receivingName=receivingName; }
  auto node=createNativeNode(metadata,position,existing,overrides,options);
  for (auto it=dynamic.begin();it!=dynamic.end();++it) { node[it.key()]=it.value(); }
  id=node["id"].toString();
  const QJsonObject edge{{"id",QUuid::createUuid().toString(QUuid::Id128)},
    {"source",forward ? resource:id},{"target",forward ? id:resource},
    {"sourceHandle",forward ? handle:port},
    {"targetHandle",forward ? port:handle}};
  WorkflowGraphModel preview;
  // A snippet entry lays out as the Code node it creates.
  const auto created=metadata.contains("code_snippet") ? metadata["code_snippet"]["code_node"].toObject() : metadata;
  preview.project(QJsonObject{{"nodes",QJsonArray{node}},{"edges",QJsonArray{edge}}},QJsonArray{created});
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
  QJsonArray commands;
  if (replaceTarget && !forward) {
    for (const auto &value:model_.edgeSnapshot()) {
      const auto existing=value.toObject();
      if (existing["target"].toString()==resource && existing["targetHandle"].toString()==handle) {
        commands.append(QJsonObject{{"op","removeEdge"},{"id",existing["id"]}});
      }
    }
  }
  commands.append(QJsonObject{{"op","addNode"},{"node",node}});
  commands.append(QJsonObject{{"op","addEdge"},{"edge",edge}});
  return QJsonObject{{"op","batch"},{"commands",commands}};
}
// web hooks/useCodeGenFromHandle.ts transformOutput and createValue: one Code node whose
// seeded slot carries the handle's type, wired to the handle. An input that takes one
// source drops its current edge in the same step. The web opens the Code assistant
// dialog here. Native opens the chat with a draft that names the node.
bool CompatibleNodePicker::chooseCode(const QJsonObject &metadata) {
  const bool forward=port_==QtNodes::PortType::Out;
  const QJsonObject slotType=type_;
  const auto kind=slotType["type"].toString();
  QSet<QString> taken;
  for (const auto &value:metadata[forward ? QStringLiteral("properties") : QStringLiteral("outputs")].toArray()) { taken.insert(value.toObject()["name"].toString()); }
  const auto name=codePortName(handle_,forward ? QStringLiteral("value"):QStringLiteral("output"),taken);
  const auto dynamic=forward
      ? QJsonObject{{"dynamic_inputs",QJsonObject{{name,QJsonObject{{"type",slotType}}}}},
                    {"dynamic_properties",QJsonObject{{name,defaultValueFor(kind)}}}}
      : QJsonObject{{"dynamic_outputs",QJsonObject{{name,slotType}}}};
  const auto handle=handle_;
  QString id;
  const auto command=connectCommand(metadata,forward,resource_,handle_,name,position_,id,{},{},!forward && !isCollect(slotType),dynamic);
  cancel();
  if (!applyCommand || !applyCommand(command)) { return false; }
  emit nodeCreated(id);
  emit codeRequested(id,forward
      ? tr("Write the code for the Code node (id %1). Its input \"%2\" (%3) receives the \"%4\" output. It should ").arg(id,name,kind,handle)
      : tr("Write the code for the Code node (id %1). Its output \"%2\" (%3) feeds the \"%4\" input. It should ").arg(id,name,kind,handle));
  return true;
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
  active_=false; candidates_.clear(); fixed_.clear(); rowsValid_=false; query_.clear(); body_=QtNodes::InvalidNodeId; bodyResource_.clear();
  if (widget_) { widget_->hide(); widget_->setEnabled(false); }
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
