#include "NodeCreation.h"
#include <QHash>
#include <QRegularExpression>
#include <QSet>
#include <QUuid>
namespace nodetool {
namespace {
bool truthy(const QJsonValue &v) {
  return !v.isNull() && !v.isUndefined() && !(v.isBool() && !v.toBool())
    && !(v.isString() && v.toString().isEmpty()) && !(v.isDouble() && v.toDouble()==0);
}
QString uniqueInputName(const QString &type,const QJsonArray &nodes) {
  const auto match=QRegularExpression("nodetool\\.input\\.(\\w+)Input$").match(type);
  const auto fallback=QRegularExpression("nodetool\\.input\\.(\\w+)$").match(type);
  const auto base=match.hasMatch() ? match.captured(1).toLower()+"_input"
    : fallback.hasMatch() ? fallback.captured(1).toLower() : QStringLiteral("input");
  QSet<QString> used;
  for (const auto &value:nodes) {
    const QJsonValue name=value.toObject().value("data").toObject().value("name");
    if (name.isString()) { used.insert(name.toString()); }
  }
  int suffix=1;
  while (used.contains(base+"_"+QString::number(suffix))) { ++suffix; }
  return base+"_"+QString::number(suffix);
}
QJsonObject primaryType(const QJsonObject &metadata) {
  const auto outputs=metadata["outputs"].toArray();
  auto selected=outputs.isEmpty() ? QJsonObject{} : outputs.first().toObject();
  for (const auto &value:outputs) {
    if (value.toObject()["name"]==metadata["primary_output"] && metadata.contains("primary_output")) { selected=value.toObject(); break; }
  }
  return selected["type"].toObject();
}
int bespokeHeight(const QString &type) {
  // Creation sizes from web bespokeNodeSizes; ExtractFrame's loading width override
  // is intentionally absent because NodeStore.createNode uses the standard width.
  static const QHash<QString,int> heights{
    {"nodetool.control.Collection",320},{"nodetool.constant.Sketch",300},
    {"nodetool.constant.Timeline",300},{"lib.image.color_grading.Curves",520},
    {"nodetool.video.ExtractFrame",380},{"nodetool.generators.ListGenerator",340},
    {"lib.image.draw.LinearGradient",460},{"lib.image.draw.RadialGradient",460},
    {"lib.image.draw.AngularGradient",460},{"lib.image.draw.DiamondGradient",460},
    {"lib.image.draw.Checkerboard",460},{"lib.image.draw.GaussianNoise",460},
    {"lib.image.color_grading.LiftGammaGain",580},{"lib.image.color_grading.SplitToning",380},
    {"nodetool.audio.realtime.AudioOutput",220},
    {"nodetool.audio.synth.Oscillator",290},{"nodetool.audio.synth.LFO",206},
    {"nodetool.audio.synth.ADSR",306},{"nodetool.audio.synth.Gate",180},
    {"nodetool.audio.synth.VCA",180},{"nodetool.audio.synth.VCF",208},
    {"nodetool.audio.synth.Attenuverter",180},{"nodetool.audio.synth.SampleHold",96},
    {"nodetool.audio.synth.Mixer",264},{"nodetool.audio.realtime.StreamingGain",180},
    {"nodetool.audio.realtime.StreamingLowShelf",220},{"nodetool.audio.realtime.StreamingHighShelf",220},{"nodetool.audio.realtime.StreamingPeak",220},{"nodetool.audio.realtime.StreamingBitcrush",240},{"nodetool.audio.realtime.StreamingCompress",240},{"nodetool.audio.realtime.StreamingDistortion",180},{"nodetool.audio.realtime.StreamingLimiter",220},{"nodetool.audio.realtime.StreamingNoiseGate",220},{"nodetool.audio.realtime.StreamingReverb",240},{"nodetool.audio.realtime.StreamingPhaser",264},{"nodetool.audio.realtime.StreamingDelay",220},
    {"nodetool.audio.realtime.StreamingLowPass",180},{"nodetool.audio.realtime.StreamingHighPass",180},
    {"lib.audio.Gain",180},{"lib.audio.Delay",180},{"lib.audio.HighPassFilter",180},
    {"lib.audio.LowPassFilter",180},{"lib.audio.HighShelfFilter",180},{"lib.audio.LowShelfFilter",180},
    {"lib.audio.PeakFilter",180},{"lib.audio.Bitcrush",180},{"lib.audio.Compress",292},
    {"lib.audio.Distortion",180},{"lib.audio.Limiter",208},{"lib.audio.Reverb",264},
    {"lib.audio.PitchShift",180},{"lib.audio.TimeStretch",180},{"lib.audio.NoiseGate",180},
    {"lib.audio.Phaser",264}};
  return heights.value(type);
}
void applyModels(QJsonObject &data,const QJsonArray &properties,const QString &nodeType,const QJsonObject &defaults) {
  static const QSet<QString> modelTypes{"language_model","image_model","embedding_model","tts_model","asr_model","video_model"};
  static const QHash<QString,QStringList> tasks{
    {"nodetool.image.TextToImage",{"text_to_image"}},{"nodetool.image.ImageToImage",{"image_to_image"}},
    {"nodetool.image.Upscale",{"upscale"}},{"nodetool.image.RemoveBackground",{"remove_background"}},
    {"nodetool.image.EstimateDepth",{"estimate_depth"}},{"nodetool.image.Segment",{"segment"}},
    {"nodetool.image.Relight",{"image_to_image","relight"}},{"nodetool.image.Vectorize",{"vectorize"}},
    {"nodetool.video.TextToVideo",{"text_to_video"}},{"nodetool.video.ImageToVideo",{"image_to_video"}},
    {"nodetool.video.ReferenceToVideo",{"reference_to_video"}},{"nodetool.video.VideoToVideo",{"video_to_video"}},
    {"nodetool.video.LipSync",{"lip_sync"}}};
  static const QSet<QString> basicTasks{"text_to_image","image_to_image","text_to_video","image_to_video"};
  for (const auto &value:properties) {
    const auto prop=value.toObject(); const auto raw=prop["type"];
    const auto type=raw.isString() ? raw.toString() : raw.toObject()["type"].toString();
    if (!modelTypes.contains(type)) { continue; }
    const auto name=prop["name"].toString(); const auto current=data[name]; const auto object=current.toObject();
    if (truthy(current) && object["provider"]!="empty" && object["provider"]!="" && object["id"]!="") { continue; }
    auto key=type;
    if (type=="image_model" && nodeType=="nodetool.image.Upscale") { key+=":upscale"; }
    if (type=="image_model" && nodeType=="nodetool.image.RemoveBackground") { key+=":remove_background"; }
    const auto pinned=defaults.value(key);
    const auto candidate=pinned.isUndefined() || pinned.isNull() ? defaults.value(type) : pinned;
    if (!truthy(candidate)) { continue; }
    const auto model=candidate.toObject();
    const auto required=(type=="image_model" && nodeType.startsWith("nodetool.image."))
      || (type=="video_model" && nodeType.startsWith("nodetool.video.")) ? tasks.value(nodeType) : QStringList{};
    bool supported=required.isEmpty() || !model.contains("supported_tasks");
    const auto declared=model["supported_tasks"].toArray();
    for (const auto &task:required) { supported|=declared.isEmpty() ? basicTasks.contains(task) : declared.contains(task); }
    if (!supported) { continue; }
    QJsonObject selected{{"type",type}};
    for (const auto &field:{"provider","id","name"}) { if (model.contains(field)) { selected[field]=model[field]; } }
    data[name]=selected;
  }
}
}
QJsonObject createNativeNode(const QJsonObject &metadata,QPointF position,const QJsonArray &existingNodes,
                            const QJsonObject &overrides,const NodeCreationOptions &options) {
  // A code snippet is a virtual menu type. It creates a Code node with the
  // snippet's code, title and dynamic IO (instantiatePaletteNode.ts).
  if (const auto snippet=metadata["code_snippet"].toObject();!snippet.isEmpty()) {
    auto node=createNativeNode(snippet["code_node"].toObject(),position,existingNodes,{},options);
    auto data=node["data"].toObject(); data["code"]=snippet["code"]; node["data"]=data;
    auto ui=node["ui_properties"].toObject(); ui["title"]=snippet["title"]; node["ui_properties"]=ui;
    const auto io=snippet["data"].toObject();
    for (const auto *key:{"dynamic_properties","dynamic_inputs","dynamic_outputs"}) {
      if (io.contains(QLatin1String(key))) { node[QLatin1String(key)]=io[QLatin1String(key)]; }
    }
    return node;
  }
  const auto type=metadata["node_type"].toString(metadata["type"].toString());
  QJsonObject data;
  bool declaresName=false;
  for (const auto &value:metadata["properties"].toArray()) {
    const auto property=value.toObject(); const auto name=property["name"].toString();
    declaresName|=name=="name";
    if (!name.isEmpty() && property.contains("default")) { data[name]=property["default"]; }
  }
  for (auto it=overrides.begin();it!=overrides.end();++it) { data[it.key()]=it.value(); }
  applyModels(data,metadata["properties"].toArray(),type,options.defaultModels);
  if (type.startsWith("nodetool.input.") && (declaresName || data.contains("name")) && !truthy(data["name"])) { data["name"]=uniqueInputName(type,existingNodes); }
  if (!options.receivingName.isEmpty() && data.contains("name")) { data["name"]=options.receivingName; }
  QJsonObject ui{{"position",QJsonObject{{"x",position.x()},{"y",position.y()}}},{"width",280},{"selectable",true},{"bypassed",false},{"zIndex",0}};
  if (type=="nodetool.workflows.base_node.Preview") { ui["width"]=400;ui["height"]=300; }
  else if (type=="nodetool.compare.CompareImages") { ui["width"]=450;ui["height"]=350; }
  else if (type=="nodetool.constant.Model3D") { ui["width"]=320;ui["height"]=320; }
  else if (type!="nodetool.agents.Agent" && type!="openai.agents.RealtimeAgent" && type!="openai.agents.LiveAgent") {
    if (const auto height=bespokeHeight(type);height>0) { ui["height"]=height; }
    else {
      const auto output=primaryType(metadata);auto kind=output["type"].toString();
      const auto args=output["type_args"].toArray();
      if (kind=="list" && !args.isEmpty() && args.first().toObject()["type"]=="image") { kind="image"; }
      const QSet<QString> media{"image","image_mask","mask","video","audio","model_3d","asset_3d"};
      if (metadata["body"]=="content_card" || (!type.startsWith("nodetool.constant.") && !type.startsWith("nodetool.input.") && media.contains(kind))) {
        const bool wide=kind=="video" || kind=="audio" || kind=="str" || kind=="text";
        ui["width"]=wide ? 320 : 280;ui["height"]=kind=="audio" ? 160 : wide ? 220 : 280;
      }
    }
  }
  if (options.useMetadataStyle && metadata["style"].isObject()) {
    const auto style=metadata["style"].toObject();
    ui["width"]=style["width"].isDouble() ? style["width"] : QJsonValue(280);
    ui.remove("height");
    if (style["height"].isDouble()) { ui["height"]=style["height"]; }
  }
  if (type=="nodetool.group.Loop") { ui["selectable"]=false; }
  if (type=="nodetool.workflows.base_node.Group") { ui["title"]=metadata["title"].toString().isEmpty() ? "Group" : metadata["title"]; }
  QJsonObject dynamic;
  if (options.paletteStarters && type=="nodetool.text.Concat") { dynamic={{"input_1",""},{"input_2",""}}; }
  return {{"id",options.id.isEmpty() ? QUuid::createUuid().toString(QUuid::Id128) : options.id},
    {"type",type},{"data",data},{"ui_properties",ui},{"dynamic_properties",dynamic},{"dynamic_outputs",QJsonObject{}}};
}
}
