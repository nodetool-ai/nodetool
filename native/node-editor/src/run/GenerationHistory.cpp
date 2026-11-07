#include "GenerationHistory.h"
#include <QDateTime>
#include <QJsonDocument>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QUrlQuery>
#include <algorithm>
namespace nodetool::node_editor {
namespace {
constexpr qsizetype ItemLimit = 8 * 1024 * 1024;
constexpr qsizetype HistoryLimit = 64 * 1024 * 1024;
bool sameOrigin(const QUrl &a,const QUrl &b) { return a.scheme()==b.scheme() && a.host()==b.host() && a.port(a.scheme()=="https"?443:80)==b.port(b.scheme()=="https"?443:80); }
void collectMedia(const QJsonValue &value, QVariantList &media, int &visited, int depth=0) {
  if (++visited>1024 || depth>16) { return; }
  if (value.isArray()) { for (const auto &item:value.toArray()) { collectMedia(item,media,visited,depth+1); } return; }
  if (!value.isObject()) { return; }
  const auto object=value.toObject(); const auto type=object["type"].toString();
  if (type=="image" || type=="video" || type=="audio") { media.append(QVariantMap{{"kind",type},{"locator",object.toVariantMap()}}); return; }
  for (auto item=object.begin();item!=object.end();++item) { collectMedia(item.value(),media,visited,depth+1); }
}
QJsonObject data(const QByteArray &bytes) {
  auto value=QJsonDocument::fromJson(bytes).object()["result"].toObject()["data"].toObject();
  return value.contains("json")?value["json"].toObject():value;
}
}
GenerationHistory::GenerationHistory(ExecutionGenerationStore *store,QObject *parent):QObject(parent),store_(store),network_(this){}
GenerationHistory::~GenerationHistory(){cancel();for(auto reply:network_.findChildren<QNetworkReply *>()){reply->disconnect(this);}}
void GenerationHistory::cancel(){++epoch_;for(auto reply:network_.findChildren<QNetworkReply *>()){reply->abort();}loading_=false;pending_={};hydrated_.clear();bytes_=0;}
void GenerationHistory::configure(const QUrl &origin,const QString &token,const QString &userId){
  if (!origin_.isEmpty() && (origin_!=origin || token_!=token || user_!=userId)) { store_->clear(); }
  cancel(); if(!workflow_.isEmpty()){store_->replacePersisted(workflow_,{});} workflow_.clear();selectedNode_.clear();nodeIds_.clear();origin_=QUrl{};token_.clear();user_.clear();error_.clear();
  network_.clearAccessCache();network_.setCookieJar(new QNetworkCookieJar(&network_));
  if(!origin.isEmpty() && (origin.scheme()=="http" || origin.scheme()=="https") && origin.userInfo().isEmpty() && !origin.hasQuery() && !origin.hasFragment() && (origin.path().isEmpty() || origin.path()=="/") && (token.isEmpty() || origin.scheme()=="https" || origin.host()=="127.0.0.1" || origin.host()=="localhost" || origin.host()=="::1")){origin_=origin;token_=token;user_=userId;}
  emit changed();
}
void GenerationHistory::setWorkflow(const QJsonObject &snapshot){
  const auto id=snapshot["id"].toString();
  if(id!=workflow_){cancel();store_->replacePersisted(workflow_,{});workflow_=id;selectedNode_.clear();error_.clear();}
  nodeIds_.clear();for(const auto &value:snapshot["graph"].toObject()["nodes"].toArray()){nodeIds_.insert(value.toObject()["id"].toString());}
  emit changed();
}
void GenerationHistory::selectNode(const QString &id){if(selectedNode_==id){return;}selectedNode_=id;emit changed();}
void GenerationHistory::liveChanged(){emit changed();}
void GenerationHistory::fail(const QString &message){loading_=false;error_=message;pending_={};hydrated_.clear();emit changed();}
void GenerationHistory::fetch(const QUrl &url,quint64 epoch,std::function<void(QByteArray)> done){
  if(!url.isValid() || (url.scheme()!="http" && url.scheme()!="https") || !url.userInfo().isEmpty() || (origin_.scheme()=="https" && url.scheme()!="https")){fail(tr("Generation asset has no supported download URL"));return;}
  QNetworkRequest request(url);request.setTransferTimeout(30000);request.setAttribute(QNetworkRequest::RedirectPolicyAttribute,QNetworkRequest::ManualRedirectPolicy);
  if(sameOrigin(url,origin_)){request.setRawHeader("Authorization","Bearer "+token_.toUtf8());request.setRawHeader("x-user-id",user_.toUtf8());}
  auto reply=network_.get(request);
  connect(reply,&QNetworkReply::readyRead,this,[reply]{if(reply->bytesAvailable()>ItemLimit){reply->setProperty("generationTooLarge",true);reply->abort();}});
  connect(reply,&QNetworkReply::finished,this,[this,reply,epoch,done=std::move(done)]{
    if(epoch!=epoch_){reply->deleteLater();return;}
    const auto status=reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();const auto bytes=reply->readAll();const auto networkError=reply->error();const auto oversized=reply->property("generationTooLarge").toBool();reply->deleteLater();
    if(oversized){fail(tr("Generation response exceeds the lossless execution value limit"));return;}
    if(networkError!=QNetworkReply::NoError || status!=200){fail(tr("Generation request failed (HTTP %1). Refresh history to retry.").arg(status));return;}
    if(bytes.size()>ItemLimit){fail(tr("Generation exceeds the lossless execution value limit"));return;}
    done(bytes);
  });
}
void GenerationHistory::refresh(){
  cancel();error_.clear();store_->replacePersisted(workflow_,{});
  if(origin_.isEmpty() || workflow_.isEmpty()){error_=tr("Connect and open a saved workflow to load generations.");emit changed();return;}
  loading_=true;emit changed();const auto epoch=epoch_;
  auto url=origin_.resolved(QUrl("/trpc/assets.list"));QUrlQuery query;query.addQueryItem("input",QString::fromUtf8(QJsonDocument(QJsonObject{{"workflow_id",workflow_},{"page_size",10000}}).toJson(QJsonDocument::Compact)));url.setQuery(query);
  fetch(url,epoch,[this,epoch](const QByteArray &bytes){
    const auto result=data(bytes);
    if(!result["assets"].isArray()){fail(tr("Invalid generation history response"));return;}
    if(!result["next"].isNull() && !result["next"].isUndefined() && !result["next"].toString().isEmpty()){fail(tr("Generation history exceeds the server listing limit"));return;}
    QSet<QString> ids;
    for(const auto &value:result["assets"].toArray()){
      const auto asset=value.toObject();const auto id=asset["id"].toString();
      if(asset["workflow_id"]!=workflow_ || asset["user_id"]!=user_ || id.isEmpty() || ids.contains(id)){fail(tr("Generation asset scope does not match this workflow and account"));return;}
      ids.insert(id);if(nodeIds_.contains(asset["node_id"].toString()) && asset["content_type"]!="folder"){pending_.append(asset);}
    }
    hydrateNext(epoch);
  });
}
void GenerationHistory::hydrateNext(quint64 epoch){
  if(epoch!=epoch_){return;}
  if(pending_.isEmpty()){
    for(auto &history:hydrated_){std::sort(history.begin(),history.end(),[](const auto &a,const auto &b){return a.createdAt==b.createdAt?a.id<b.id:a.createdAt<b.createdAt;});}
    store_->replacePersisted(workflow_,hydrated_);loading_=false;hydrated_.clear();emit changed();return;
  }
  const auto asset=pending_.first().toObject();pending_.removeFirst();const auto content=asset["content_type"].toString();
  if(asset["offline"].toBool()){fail(tr("A generation asset is offline. Relink it or choose another generation."));return;}
  if(content.startsWith("text/") || (content.contains("json") && asset["metadata"].toObject()["json"].isObject())){
    auto url=QUrl(asset["get_url"].toString());if(url.isRelative() && url.path().startsWith("/api/") && !url.toString().startsWith("//")){url=origin_.resolved(url);}
    fetch(url,epoch,[this,asset,content,epoch](const QByteArray &bytes){
      if (asset["size"].isDouble() && asset["size"].toDouble() >= 0 && asset["size"].toDouble() != bytes.size()) { fail(tr("Generation content changed or is incomplete. Refresh history to retry.")); return; }
      QJsonObject outputs;
      if(content.startsWith("text/")){
        const auto text=QString::fromUtf8(bytes);if(text.toUtf8()!=bytes){fail(tr("Generation text is not valid UTF-8"));return;}outputs={{"output",text}};
      }else{
        QJsonParseError parse;const auto document=QJsonDocument::fromJson(bytes,&parse);
        if(parse.error!=QJsonParseError::NoError || !document.isObject()){fail(tr("Generation JSON must contain its complete output object"));return;}outputs=document.object();
      }
      finishAsset(asset,outputs,epoch);
    });return;
  }
  QString type;
  if(content.contains("json")){type="json";}else if(content.startsWith("image/")){type="image";}else if(content.startsWith("video/")){type="video";}else if(content.startsWith("audio/")){type="audio";}else if(content.startsWith("model/") || asset["name"].toString().endsWith(".glb",Qt::CaseInsensitive) || asset["name"].toString().endsWith(".gltf",Qt::CaseInsensitive)){type="model_3d";}else{type="asset";}
  finishAsset(asset,{{"output",QJsonObject{{"type",type},{"asset_id",asset["id"]},{"uri",QStringLiteral("asset://")+asset["id"].toString()}}}},epoch);
}
void GenerationHistory::finishAsset(const QJsonObject &asset,const QJsonObject &outputs,quint64 epoch){
  if(epoch!=epoch_){return;}bytes_+=QJsonDocument(outputs).toJson(QJsonDocument::Compact).size();
  if(bytes_>HistoryLimit){fail(tr("Generation history exceeds the lossless execution cache limit"));return;}
  const auto created=QDateTime::fromString(asset["created_at"].toString(),Qt::ISODateWithMs);if(!created.isValid()){fail(tr("Generation has an invalid creation time"));return;}
  hydrated_[asset["node_id"].toString()].append({asset["id"].toString(),asset["job_id"].toString(),created.toMSecsSinceEpoch(),outputs,{}});
  QMetaObject::invokeMethod(this,[this,epoch]{hydrateNext(epoch);},Qt::QueuedConnection);
}
bool GenerationHistory::contains(const QString &nodeId,const QString &id)const{
  const auto history=store_->generations(workflow_).value(nodeId);return std::any_of(history.cbegin(),history.cend(),[&](const auto &entry){return entry.id==id;});
}
QJsonObject GenerationHistory::outputs(const QString &nodeId,const QString &id)const{
  for(const auto &entry:store_->generations(workflow_).value(nodeId)){if(entry.id==id){return entry.outputs;}}return {};
}
QVariantList GenerationHistory::rows()const{
  QVariantList rows;
  for(const auto &entry:store_->generations(workflow_).value(selectedNode_)){
    QVariantList media; int visited=0; collectMedia(entry.outputs,media,visited);
    QString text;
    if (media.isEmpty()) {
      if (entry.outputs.size()==1 && entry.outputs.begin().value().isString()) { text=entry.outputs.begin().value().toString(); }
      else { text=QString::fromUtf8(QJsonDocument(entry.outputs).toJson(QJsonDocument::Indented)); }
    }
    rows.append(QVariantMap{{"id",entry.id},{"jobId",entry.jobId},{"created",QDateTime::fromMSecsSinceEpoch(entry.createdAt).toString(Qt::ISODate)},{"text",text.left(8192)},{"truncated",text.size()>8192},{"media",media}});
  }
  return rows;
}
}
