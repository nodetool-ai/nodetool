#include "aiassist/AgentBridge.h"
#include "aiassist/AssistDocument.h"
#include "app/EditRegistry.h"
#include "edit/ClipOps.h"
#include "edit/EditActions.h"
#include <QCollator>
#include <QJsonDocument>
#include <QLocale>
#include <QRegularExpression>
#include <QSet>
#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>
namespace nt::aiassist {
QJsonArray assistantTools() {
  QJsonArray result;
  for (const auto &name :
       {"ui_timeline_get_state", "ui_timeline_move_clip",
        "ui_timeline_delete_clip", "ui_timeline_split_clip"}) {
    QJsonObject properties{{"timeline_id", QJsonObject{{"type", "string"}}}};
    QJsonArray required{"timeline_id"};
    if (QString(name) != "ui_timeline_get_state") {
      properties.insert(
          "target",
          QJsonObject{{"type", "string"},
                      {"description",
                       "Clip id, unique case-insensitive name, or selected."}});
      required.append("target");
    }
    if (QString(name) == "ui_timeline_move_clip") {
      properties.insert("startMs", QJsonObject{{"type", "number"}});
      properties.insert("trackId", QJsonObject{{"type", "string"}});
    }
    if (QString(name) == "ui_timeline_split_clip") {
      properties.insert("atMs", QJsonObject{{"type", "number"}});
    }
    result.append(QJsonObject{
        {"name", name},
        {"description", QString(name) == "ui_timeline_get_state"
                            ? "Read the live timeline before editing."
                            : "Edit the live timeline with undo, preserving "
                              "locked clips and linked media."},
        {"parameters", QJsonObject{{"type", "object"},
                                   {"properties", properties},
                                   {"required", required},
                                   {"additionalProperties", false}}}});
  }
  auto add = [&result](const QString &name, const QString &description,
                       QJsonObject properties, QJsonArray required) {
    properties.insert("timeline_id", QJsonObject{{"type", "string"}});
    required.prepend("timeline_id");
    result.append(QJsonObject{
        {"name", name},
        {"description", description},
        {"parameters", QJsonObject{{"type", "object"},
                                   {"properties", properties},
                                   {"required", required},
                                   {"additionalProperties", false}}}});
  };
  const QJsonObject string{{"type", "string"}}, number{{"type", "number"}},
      boolean{{"type", "boolean"}};
  add("ui_timeline_generate_clip",
      "Create a generated media draft and optionally start generation. "
      "Provider and model are required for native generation. Read generation "
      "status and review its candidates before applying a take.",
      {{"kind",
        QJsonObject{{"type", "string"},
                    {"enum", QJsonArray{"text-to-video", "text-to-image",
                                        "text-to-audio"}}}},
       {"prompt", string},
       {"trackId", string},
       {"startMs", number},
       {"durationMs", number},
       {"provider", string},
       {"model", string},
       {"voice", string},
       {"width", number},
       {"height", number},
       {"aspectRatio", string},
       {"resolution", string},
       {"autoGenerate", boolean}},
      {"kind", "prompt"});
  add("ui_timeline_generatively_edit_clip",
      "Start a nondestructive edit of one clip. Provide a video-edit provider "
      "and model. Completion returns an inactive candidate take; acceptance is "
      "a separate apply_take call.",
      {{"clip_id", string},
       {"instruction", string},
       {"provider", string},
       {"model", string}},
      {"clip_id", "instruction"});
  add("ui_timeline_apply_take",
      "Explicitly accept one completed take belonging to this clip. Media "
      "resolution is asynchronous; read generation status afterwards.",
      {{"clip_id", string}, {"take_id", string}}, {"clip_id", "take_id"});
  add("ui_timeline_set_clip_binding",
      "Update a generated clip's binding. Set regenerate true to retry its "
      "stored generation recipe. Generation remains inactive until apply_take "
      "accepts its result.",
      {{"target", string},
       {"prompt", string},
       {"negativePrompt", string},
       {"provider", string},
       {"model", string},
       {"voice", string},
       {"width", number},
       {"height", number},
       {"aspectRatio", string},
       {"resolution", string},
       {"strength", number},
       {"numInferenceSteps", number},
       {"regenerate", boolean}},
      {"target"});
  add("ui_timeline_set_setup",
      "Write video setup text only. This starts no paid job.",
      {{"stage", QJsonObject{{"type", "string"},
                             {"enum", QJsonArray{"idea", "format", "review",
                                                 "look", "done"}}}},
       {"brief", string},
       {"format", string},
       {"voiceover", boolean}},
      {});
  const QJsonObject beatProperties{{"prompt", string},
                                   {"durationMs", number},
                                   {"transition", string},
                                   {"voiceover", string},
                                   {"music", boolean}};
  const QJsonObject beatSchema{
      {"type", "object"},
      {"properties", beatProperties},
      {"required", QJsonArray{"prompt", "durationMs"}}};
  const QJsonObject beatsSchema{{"type", "array"}, {"items", beatSchema}};
  add("ui_timeline_plan_beats",
      "Write supplied beats or stage a Director request for explicit approval. "
      "No clip is created by planning.",
      {{"beats", beatsSchema}, {"replan", boolean}}, {});
  add("ui_timeline_update_beat",
      "Edit one plan beat by id or one-based position. Existing generated "
      "clips are unchanged.",
      {{"beat", string},
       {"prompt", string},
       {"durationMs", number},
       {"transition", QJsonObject{{"type", QJsonArray{"string", "null"}}}},
       {"voiceover", string},
       {"music", boolean}},
      {"beat"});
  add("ui_timeline_remove_beat",
      "Remove a plan beat by id or one-based position. Existing generated "
      "clips remain.",
      {{"beat", string}}, {"beat"});
  add("ui_timeline_generate_from_beats",
      "Prepare a reviewed cut and stage its exact model/request count for "
      "explicit approval before any media request. Generated takes remain "
      "candidates until separately accepted.",
      {{"provider", string},
       {"model", string},
       {"voice", string},
       {"music", boolean}},
      {});
  return result;
}

namespace {
struct PlanFormat {
  int count;
  double duration;
  QString aspect;
  bool voiced;
};
std::optional<PlanFormat> planFormat(const QString &id) {
  if (id == "ad-15") {
    return PlanFormat{5, 15000, "16:9", true};
  }
  if (id == "spot-30") {
    return PlanFormat{8, 30000, "16:9", true};
  }
  if (id == "explainer-60") {
    return PlanFormat{12, 60000, "16:9", true};
  }
  if (id == "social-9x16") {
    return PlanFormat{6, 20000, "9:16", true};
  }
  if (id == "trailer") {
    return PlanFormat{10, 45000, "16:9", false};
  }
  if (id == "music-video") {
    return PlanFormat{10, 60000, "16:9", false};
  }
  if (id == "slideshow") {
    return PlanFormat{8, 40000, "16:9", true};
  }
  return std::nullopt;
}
QJsonArray planSources(const QJsonObject &raw) {
  QList<QJsonObject> sources;
  for (const auto &value : raw.value("clips").toArray()) {
    const auto clip = value.toObject();
    const auto type = clip.value("mediaType").toString();
    if (clip.value("sourceType") == "imported" &&
        (type == "video" || type == "image")) {
      sources.append(clip);
    }
  }
  std::stable_sort(
      sources.begin(), sources.end(), [](const auto &a, const auto &b) {
        return a.value("startMs").toDouble() < b.value("startMs").toDouble();
      });
  QJsonArray result;
  for (const auto &clip : sources) {
    result.append(clip);
  }
  return result;
}
QStringList joinedStrings(const QJsonArray &values) {
  QStringList result;
  for (const auto &value : values) {
    result.append(value.toString());
  }
  return result;
}
} // namespace
QJsonObject assistantPlanningEdit(const QString &name, QJsonObject raw,
                                  const QJsonObject &payload) {
  auto setup = raw.value("setup").toObject();
  if (!setup.contains("stage")) {
    setup.insert("stage", "idea");
  }
  if (!setup.contains("brief")) {
    setup.insert("brief", "");
  }
  if (name == "ui_timeline_set_setup") {
    for (const auto *field : {"stage", "brief", "format"}) {
      if (payload.contains(field)) {
        if (!payload.value(field).isString()) {
          return raw;
        }
        setup.insert(field, payload.value(field));
      }
    }
    if (payload.contains("voiceover")) {
      if (!payload.value("voiceover").isBool()) {
        return raw;
      }
      setup.insert("voiceover", payload.value("voiceover"));
    }
    if (!QStringList{"idea", "format", "review", "look", "done"}.contains(
            setup.value("stage").toString())) {
      return raw;
    }
  } else if (name == "ui_timeline_plan_beats") {
    const auto input = payload.value("beats").toArray();
    if (input.isEmpty()) {
      return raw;
    }
    QJsonArray beats;
    for (const auto &value : input) {
      if (!value.isObject()) {
        return raw;
      }
      const auto authored = value.toObject();
      for (const auto *field : {"transition", "voiceover"}) {
        if (authored.contains(field) && !authored.value(field).isString()) {
          return raw;
        }
      }
      if (authored.contains("music") && !authored.value("music").isBool()) {
        return raw;
      }
      const auto duration = authored.value("durationMs");
      if (authored.value("prompt").toString().trimmed().isEmpty() ||
          !duration.isDouble() || !std::isfinite(duration.toDouble()) ||
          duration.toDouble() <= 0) {
        return raw;
      }
      QJsonObject beat{
          {"id", nt::edit::newId()},
          {"prompt", authored.value("prompt").toString().trimmed()},
          {"duration_ms", std::max(1.0, std::round(duration.toDouble()))}};
      if (authored.contains("production")) {
        const auto validated =
            assistantValidateProduction(authored.value("production"));
        if (validated.contains("error")) {
          return raw;
        }
        beat.insert("production", validated.value("value"));
      }
      for (const auto *field :
           {"transition", "voiceover", "music", "source_clip_id"}) {
        if (authored.contains(field)) {
          beat.insert(field, authored.value(field));
        }
      }
      if (beat.contains("source_clip_id")) {
        QStringList ids;
        for (const auto &value : raw.value("clips").toArray()) {
          ids.append(value.toObject().value("id").toString());
        }
        const auto resolved =
            resolveId(beat.value("source_clip_id").toString(), ids);
        if (!resolved) {
          return raw;
        }
        beat.insert("source_clip_id", *resolved);
      }
      beats.append(beat);
    }
    setup.insert("beats", beats);
    setup.insert("stage", "review");
  } else if (name == "ui_timeline_update_beat" ||
             name == "ui_timeline_remove_beat") {
    auto beats = setup.value("beats").toArray();
    const auto target = payload.value("beat").toString();
    int index = -1;
    bool number = false;
    const int position = target.toInt(&number);
    if (number && position > 0 && position <= beats.size()) {
      index = position - 1;
    } else {
      QStringList ids;
      for (const auto &value : beats) {
        ids.append(value.toObject().value("id").toString());
      }
      const auto resolved = resolveId(target, ids);
      if (resolved) {
        for (qsizetype i = 0; i < beats.size(); ++i) {
          if (beats.at(i).toObject().value("id").toString() == *resolved) {
            index = static_cast<int>(i);
            break;
          }
        }
      }
    }
    if (index < 0) {
      return raw;
    }
    if (name == "ui_timeline_remove_beat") {
      beats.removeAt(index);
    } else {
      auto beat = beats.at(index).toObject();
      for (const auto *field : {"prompt", "voiceover", "music"}) {
        if (payload.contains(field)) {
          beat.insert(field, payload.value(field));
        }
      }
      if (payload.contains("durationMs")) {
        const double duration = payload.value("durationMs").toDouble();
        if (!std::isfinite(duration) || duration <= 0) {
          return raw;
        }
        beat.insert("duration_ms", std::max(1.0, std::round(duration)));
      }
      if (payload.contains("transition")) {
        if (payload.value("transition").isNull()) {
          beat.remove("transition");
        } else {
          beat.insert("transition", payload.value("transition"));
        }
      }
      beats[index] = beat;
    }
    setup.insert("beats", beats);
  } else {
    return raw;
  }
  raw.insert("setup", setup);
  return raw;
}
QJsonObject assistantDirectorRequest(const QJsonObject &raw, bool replan,
                                     const QString &provider,
                                     const QString &model) {
  const auto setup = raw.value("setup").toObject();
  const auto format = planFormat(setup.value("format").toString());
  if (!format) {
    return {{"error",
             "Set a known video format before asking the Director to plan."}};
  }
  const auto sources = planSources(raw);
  const int count = std::clamp(
      sources.isEmpty() ? format->count : static_cast<int>(sources.size()), 1,
      20);
  QString brief = setup.value("brief").toString().trimmed();
  if (brief.isEmpty()) {
    return {{"error", "Write a brief before planning the beats."}};
  }
  QStringList context;
  if (!sources.isEmpty()) {
    context.append(
        "The creator has already placed this media on the timeline, in this "
        "order. Write one beat per clip, describing the clip that is there — "
        "do not invent shots to render instead:");
    for (qsizetype i = 0; i < sources.size(); ++i) {
      const auto clip = sources.at(i).toObject();
      context.append(QString::number(i + 1) + ". " +
                     clip.value("name").toString() + " (source clip " +
                     clip.value("id").toString() + ")");
    }
  }
  const auto references = setup.value("references").toArray();
  if (!references.isEmpty()) {
    context.append(
        "Reference images the creator attached — match what they show:");
    for (const auto &value : references) {
      const auto ref = value.toObject();
      context.append("- " +
                     ref.value("name").toString(ref.value("uri").toString()));
    }
  }
  const auto entities = setup.value("entityIds").toArray();
  if (!entities.isEmpty()) {
    context.append("Keep these entities consistent: " +
                   joinedStrings(entities).join(", "));
  }
  const auto creative =
      setup.value("creative_context")
          .toObject(setup.value("creativeContext").toObject());
  if (!creative.isEmpty()) {
    context.append("Creative context — use only the approved product facts:");
    for (const auto &field : {std::pair{"product_name", "Product"},
                              {"product_description", "Description"},
                              {"audience", "Audience"},
                              {"objective", "Objective"},
                              {"tone", "Tone"}}) {
      if (!creative.value(field.first).toString().isEmpty()) {
        context.append(QString(field.second) + ": " +
                       creative.value(field.first).toString());
      }
    }
    for (const auto &field : {std::pair{"approved_claims", "Approved claims"},
                              {"prohibited_claims", "Do not assert"}}) {
      const auto claims = creative.value(field.first).toArray();
      if (!claims.isEmpty()) {
        context.append(QString(field.second) + ": " +
                       joinedStrings(claims).join("; "));
      }
    }
  }
  if (!context.isEmpty()) {
    brief += "\n\n" + context.join("\n");
  }
  const auto previous = setup.value("beats").toArray();
  if (replan && !previous.isEmpty()) {
    brief += "\n\nThe current plan, as the creator has edited it — keep what "
             "works and fix what does not:";
    for (qsizetype i = 0; i < previous.size(); ++i) {
      const auto beat = previous.at(i).toObject();
      brief += "\n" + QString::number(i + 1) + ". (" +
               QString::number(
                   std::round(beat.value("duration_ms").toDouble() / 1000)) +
               "s) " + beat.value("prompt").toString();
      if (!beat.value("voiceover").toString().isEmpty()) {
        brief += " — voiceover: " + beat.value("voiceover").toString();
      }
    }
  }
  auto schema =
      QJsonDocument::fromJson(
          R"nativejson({"type":"object","additionalProperties":false,"required":["title","scenes","shots"],"properties":{"title":{"type":"string"},"logline":{"type":"string"},"style_bible":{"type":"string"},"aspect_ratio":{"type":"string"},"narration":{"type":"string"},"music_prompt":{"type":"string"},"scenes":{"type":"array","minItems":1,"items":{"type":"object","additionalProperties":false,"required":["id","slugline"],"properties":{"id":{"type":"string"},"slugline":{"type":"string"},"lighting":{"type":"string"}}}},"shots":{"type":"array","minItems":1,"maxItems":1,"items":{"type":"object","additionalProperties":false,"required":["scene_id","action"],"properties":{"scene_id":{"type":"string"},"slug":{"type":"string"},"action":{"type":"string"},"motion":{"type":"string"},"dialogue":{"type":"string"},"narration":{"type":"string"},"duration_seconds":{"type":"number"},"camera":{"type":"object","additionalProperties":false,"properties":{"framing":{"type":"string"},"lens":{"type":"string"},"angle":{"type":"string"},"movement":{"type":"string"},"equipment":{"type":"string"}}}}}}}})nativejson")
          .object();
  auto properties = schema.value("properties").toObject();
  auto shots = properties.value("shots").toObject();
  shots.insert("minItems", count);
  shots.insert("maxItems", count);
  properties.insert("shots", shots);
  schema.insert("properties", properties);
  const QString system = QString::fromUtf8(
      R"nativejson(You are a film director. Turn the user's brief into a structured screenplay. Break the piece into scenes. Give each a slugline in screenplay form (INT./EXT. LOCATION — TIME) and a lighting note that holds for every shot in it. Then write the shots, each with a concrete visual action, camera direction, and the scene_id of exactly one scene you returned. Shots of the same scene must be consecutive. Apply one consistent style across every shot. Call the screenplay tool exactly once with the result.)nativejson");
  const auto director = setup.value("directorModel").toObject();
  return {
      {"provider", director.value("provider").toString(provider)},
      {"model", director.value("id").toString(model)},
      {"system", system},
      {"prompt",
       "Brief:\n" + brief + "\n\nProduce exactly " + QString::number(count) +
           " shots for a " + format->aspect +
           " piece.\n\nGroup them into scenes. Give each scene an id, a "
           "slugline and a lighting note, and give every shot the scene_id of "
           "the one scene it belongs to.\n\nGive each shot a concrete visual "
           "action and camera direction, and set a style_bible describing the "
           "palette, light, lens, and texture applied to all shots."},
      {"max_tokens", 8192},
      {"schema", schema},
      {"schema_name", "screenplay"},
      {"schema_description", "Submit the finished screenplay with exactly the "
                             "requested number of shots."}};
}
QJsonArray assistantDirectorBeats(const QJsonObject &raw,
                                  const QJsonObject &result) {
  const auto setup = raw.value("setup").toObject();
  const auto format = planFormat(setup.value("format").toString());
  if (!format) {
    return {};
  }
  QJsonValue data = result.value("data");
  if (data.isString()) {
    QString text = data.toString().trimmed();
    text.remove(QRegularExpression("^```(?:json)?\\s*|\\s*```$"));
    data = QJsonDocument::fromJson(text.toUtf8()).object();
  }
  const auto screenplay = data.toObject();
  auto shots = screenplay.value("shots").toArray();
  const auto sources = planSources(raw);
  const int count = std::clamp(
      sources.isEmpty() ? format->count : static_cast<int>(sources.size()), 1,
      20);
  if (shots.isEmpty()) {
    const QStringList framings{"establishing wide", "medium", "close-up"};
    const auto brief = setup.value("brief").toString().trimmed().isEmpty()
                           ? QStringLiteral("Untitled film")
                           : setup.value("brief").toString().trimmed();
    for (int i = 0; i < count; ++i) {
      shots.append(
          QJsonObject{{"action", brief + " — beat " + QString::number(i + 1) +
                                     " of " + QString::number(count)},
                      {"camera", QJsonObject{{"framing", framings.at(i % 3)}}},
                      {"motion", "slow push in"}});
    }
  }
  QString previousLighting = screenplay.value("scenes").toArray().isEmpty()
                                 ? QString{}
                                 : screenplay.value("scenes")
                                       .toArray()
                                       .first()
                                       .toObject()
                                       .value("lighting")
                                       .toString();
  QJsonArray beats;
  for (qsizetype i = 0; i < std::min<qsizetype>(shots.size(), count); ++i) {
    const auto shot = shots.at(i).toObject();
    const auto camera = shot.value("camera").toObject();
    QString lighting = previousLighting;
    for (const auto &value : screenplay.value("scenes").toArray()) {
      const auto scene = value.toObject();
      if (scene.value("id") == shot.value("scene_id")) {
        lighting = scene.value("lighting").toString();
        previousLighting = lighting;
        break;
      }
    }
    QStringList parts;
    for (const auto &value :
         {shot.value("action").toString(),
          camera.value("framing").toString().trimmed().isEmpty()
              ? QString{}
              : camera.value("framing").toString().trimmed() + " shot",
          camera.value("angle").toString(),
          camera.value("lens").toString().trimmed().isEmpty()
              ? QString{}
              : camera.value("lens").toString().trimmed() + " lens",
          lighting, shot.value("motion").toString(),
          camera.value("movement").toString(),
          camera.value("equipment").toString(),
          screenplay.value("style_bible").toString()}) {
      if (!value.trimmed().isEmpty()) {
        parts.append(value.trimmed());
      }
    }
    const double seconds = shot.value("duration_seconds").toDouble();
    QJsonObject beat{{"prompt", parts.join(", ")},
                     {"durationMs", seconds > 0 ? std::round(seconds * 1000)
                                                : std::round(format->duration /
                                                             format->count)},
                     {"music", true}};
    const auto line = shot.contains("narration")
                          ? shot.value("narration").toString()
                          : shot.value("dialogue").toString();
    if (format->voiced && !line.trimmed().isEmpty()) {
      beat.insert("voiceover", line.trimmed());
    }
    if (i < sources.size()) {
      beat.insert("source_clip_id", sources.at(i).toObject().value("id"));
    }
    beats.append(beat);
  }
  return beats;
}

QString assistantFingerprint(const QJsonObject &value) {
  QCollator collator(QLocale(QStringLiteral("en_US")));
  std::function<QByteArray(const QJsonValue &)> canonical;
  canonical = [&canonical, &collator](const QJsonValue &item) -> QByteArray {
    if (item.isObject()) {
      const auto object = item.toObject();
      auto keys = object.keys();
      std::sort(keys.begin(), keys.end(),
                [&collator](const QString &left, const QString &right) {
                  return collator.compare(left, right) < 0;
                });
      QByteArray output = "{";
      bool first = true;
      for (const auto &key : keys) {
        if (!first) {
          output += ',';
        }
        first = false;
        auto encoded =
            QJsonDocument(QJsonArray{key}).toJson(QJsonDocument::Compact);
        output += encoded.mid(1, encoded.size() - 2);
        output += ':';
        output += canonical(object.value(key));
      }
      output += '}';
      return output;
    }
    if (item.isArray()) {
      QByteArray output = "[";
      bool first = true;
      for (const auto &child : item.toArray()) {
        if (!first) {
          output += ',';
        }
        first = false;
        output += canonical(child);
      }
      output += ']';
      return output;
    }
    const auto encoded =
        QJsonDocument(QJsonArray{item}).toJson(QJsonDocument::Compact);
    return encoded.mid(1, encoded.size() - 2);
  };
  const auto text = QString::fromUtf8(canonical(value));
  quint64 hash = 14695981039346656037ULL;
  for (const auto point : text.toUcs4()) {
    hash ^= point;
    hash *= 1099511628211ULL;
  }
  return "v1:" + QString::number(hash, 16).rightJustified(16, '0');
}

namespace {
struct ProductionValidation {
  QString error;
  bool fail(const QString &path, const QString &detail) {
    if (error.isEmpty()) {
      error = path + ": " + detail;
    }
    return false;
  }
  bool text(QJsonObject &object, const QString &key, const QString &path,
            bool required = false, bool trim = true) {
    if (!object.contains(key)) {
      return required ? fail(path + "." + key, "expected a non-empty string")
                      : true;
    }
    const auto value = object.value(key);
    if (!value.isString() || value.toString().trimmed().isEmpty()) {
      return fail(path + "." + key, "expected a non-empty string");
    }
    if (trim) {
      object.insert(key, value.toString().trimmed());
    }
    return true;
  }
  bool choice(QJsonObject &object, const QString &key,
              const QStringList &allowed, const QString &path,
              const QString &fallback = {}) {
    if (!object.contains(key)) {
      if (!fallback.isEmpty()) {
        object.insert(key, fallback);
      }
      return true;
    }
    return object.value(key).isString() &&
                   allowed.contains(object.value(key).toString())
               ? true
               : fail(path + "." + key, "invalid value");
  }
  bool objectValue(const QJsonValue &input, QJsonObject &output,
                   const QString &path) {
    if (!input.isObject()) {
      return fail(path, "expected an object");
    }
    output = input.toObject();
    return true;
  }
  bool integer(QJsonObject &object, const QString &key, const QString &path,
               double minimum, double maximum, bool defaultOne = false) {
    if (!object.contains(key)) {
      if (defaultOne) {
        object.insert(key, 1);
      }
      return true;
    }
    const auto value = object.value(key);
    const double number = value.toDouble();
    if (!value.isDouble() || !std::isfinite(number) ||
        std::floor(number) != number || number < minimum || number > maximum) {
      return fail(path + "." + key, "expected an integer in range");
    }
    return true;
  }
  bool arrayValue(const QJsonValue &value, QJsonArray &result,
                  const QString &path, qsizetype max) {
    if (!value.isArray() || value.toArray().size() > max) {
      return fail(path, "expected an array within the size limit");
    }
    result = value.toArray();
    return true;
  }
  bool binding(QJsonObject &value, const QString &path) {
    if (!value.contains("kind") ||
        !choice(value, "kind", {"product", "character", "location", "style"},
                path)) {
      return fail(path + ".kind", "invalid reference kind");
    }
    return text(value, "asset_id", path, true) &&
           text(value, "entity_id", path) && text(value, "label", path);
  }
  bool speech(QJsonObject &value, const QString &path) {
    for (const auto *field : {"script_line_id", "speaker_id", "text",
                              "direction", "audio_asset_id", "voice_id"}) {
      if (!text(value, field, path)) {
        return false;
      }
    }
    if (value.contains("voice")) {
      QJsonObject voice;
      if (!objectValue(value.value("voice"), voice, path + ".voice")) {
        return false;
      }
      for (const auto *field : {"provider", "model", "voice"}) {
        if (!text(voice, field, path + ".voice", true)) {
          return false;
        }
      }
      if (voice.contains("settings") && !voice.value("settings").isObject()) {
        return fail(path + ".voice.settings", "expected a record");
      }
      value.insert("voice", voice);
    }
    if (value.contains("script_line_id") && value.contains("text")) {
      return fail(path + ".text",
                  "Linked speech text is owned by the Script line.");
    }
    if (!value.contains("script_line_id") && !value.contains("text") &&
        !value.contains("audio_asset_id")) {
      return fail(
          path,
          "Speech binding needs script_line_id, text, or audio_asset_id.");
    }
    return true;
  }
  bool protectedInput(QJsonObject &value, const QString &path) {
    QJsonObject known;
    for (const auto *field : {"id", "kind", "asset_id", "entity_id", "value",
                              "allowed_transformations"}) {
      if (value.contains(field)) {
        known.insert(field, value.value(field));
      }
    }
    value = known;
    if (!text(value, "id", path, true) || !value.contains("kind") ||
        !choice(
            value, "kind",
            {"product", "logo", "exact_text", "brand_color", "source_asset"},
            path)) {
      return fail(path + ".kind", "invalid protected content kind");
    }
    if (!text(value, "asset_id", path) || !text(value, "entity_id", path) ||
        !text(value, "value", path, false, false)) {
      return false;
    }
    auto transforms = value.value("allowed_transformations");
    if (transforms.isUndefined()) {
      value.insert("allowed_transformations", QJsonArray{});
    } else {
      QJsonArray items;
      if (!arrayValue(transforms, items, path + ".allowed_transformations",
                      7)) {
        return false;
      }
      for (const auto &item : items) {
        if (!item.isString() ||
            !QStringList{"position", "scale", "crop", "rotate", "mask",
                         "opacity", "composite"}
                 .contains(item.toString())) {
          return fail(path + ".allowed_transformations",
                      "invalid transformation");
        }
      }
    }
    const auto kind = value.value("kind").toString();
    const bool assetKind =
        kind == "product" || kind == "logo" || kind == "source_asset";
    if (assetKind && !value.contains("asset_id")) {
      return fail(path + ".asset_id",
                  kind + " protected inputs need asset_id.");
    }
    if (!assetKind && !value.contains("value")) {
      return fail(path + ".value",
                  kind + " protected inputs need an exact value.");
    }
    return true;
  }
  bool requirement(const QJsonValue &input, QJsonObject &value) {
    const QString path = "production";
    if (!objectValue(input, value, path)) {
      return false;
    }
    if (!value.contains("schema_version")) {
      value.insert("schema_version", 1);
    }
    if (!value.value("schema_version").isDouble() ||
        value.value("schema_version").toDouble() != 1) {
      return fail(path + ".schema_version", "expected 1");
    }
    if (!choice(value, "editorial_purpose",
                {"hook", "problem", "demonstration", "proof", "cta", "story"},
                path) ||
        !choice(value, "visual_treatment",
                {"actor_to_camera", "product_close_up", "lifestyle_b_roll",
                 "generated_scene"},
                path) ||
        !choice(value, "speech_mode", {"none", "off_camera", "on_camera"}, path,
                "none") ||
        !choice(value, "media_strategy",
                {"still_motion_graphics", "hybrid", "generated_video"}, path)) {
      return false;
    }
    if (!integer(value, "duration_ms", path, 1, 9007199254740991.0) ||
        !integer(value, "speech_duration_ms", path, 1, 9007199254740991.0) ||
        !text(value, "local_direction", path)) {
      return false;
    }
    if (!integer(value, "requested_take_count", path, 1, 3, true)) {
      error = "Production take count must be between 1 and 3.";
      return false;
    }
    if (value.contains("speech_binding")) {
      QJsonObject child;
      if (!objectValue(value.value("speech_binding"), child,
                       path + ".speech_binding") ||
          !speech(child, path + ".speech_binding")) {
        return false;
      }
      value.insert("speech_binding", child);
    }
    for (const auto *field :
         {"reference_bindings", "references", "protected_inputs"}) {
      if (!value.contains(field)) {
        continue;
      }
      QJsonArray entries;
      if (!arrayValue(value.value(field), entries, path + "." + field,
                      QString(field) == "protected_inputs" ? 64 : 32)) {
        return false;
      }
      QSet<QString> protectedIds;
      for (qsizetype i = 0; i < entries.size(); ++i) {
        const auto childPath =
            path + "." + field + "[" + QString::number(i) + "]";
        QJsonObject child;
        if (!objectValue(entries.at(i), child, childPath)) {
          return false;
        }
        if (QString(field) == "reference_bindings") {
          if (!binding(child, childPath)) {
            return false;
          }
        } else if (QString(field) == "references") {
          if (!text(child, "uri", childPath, true) ||
              !text(child, "name", childPath) ||
              !text(child, "revision", childPath)) {
            return false;
          }
        } else {
          if (!protectedInput(child, childPath)) {
            return false;
          }
          const auto id = child.value("id").toString();
          if (protectedIds.contains(id)) {
            return fail(path + ".protected_inputs",
                        "Protected input ids must be unique.");
          }
          protectedIds.insert(id);
        }
        entries[i] = child;
      }
      value.insert(field, entries);
    }
    if (value.value("speech_mode") == "none" &&
        value.contains("speech_binding")) {
      return fail(path + ".speech_binding",
                  "speech_binding is only valid when speech_mode is enabled.");
    }
    if (value.value("speech_mode") != "none" &&
        !value.contains("speech_binding")) {
      return fail(path + ".speech_binding",
                  "Speech modes other than none need speech_binding.");
    }
    return true;
  }
};
} // namespace
QJsonObject assistantValidateProduction(const QJsonValue &input) {
  ProductionValidation validation;
  QJsonObject value;
  if (!validation.requirement(input, value)) {
    return {{"error", validation.error}};
  }
  return {{"value", value}};
}

QJsonObject assistantCompileProduction(const QJsonObject &input) {
  if (!input.value("prompt").isString()) {
    return {{"error", "prompt must be a string."}};
  }
  if (!input.value("destinationKind").isString() ||
      !QStringList{"timeline_clip", "storyboard_shot", "script_line"}.contains(
          input.value("destinationKind").toString())) {
    return {{"error", "Invalid production destination kind."}};
  }
  if (!input.value("operation").isString() ||
      !QStringList{"initial_generation", "new_take", "change_line_delivery",
                   "edit_video"}
           .contains(input.value("operation").toString())) {
    return {{"error", "Invalid production operation."}};
  }
  for (const auto *field :
       {"provider", "model", "authoringFingerprint", "outputFormat"}) {
    if (input.contains(field) &&
        (!input.value(field).isString() ||
         input.value(field).toString().trimmed().isEmpty())) {
      return {{"error", QString(field) + " must be a non-empty string."}};
    }
  }
  QJsonObject requirement;
  if (input.contains("requirement")) {
    const auto validated =
        assistantValidateProduction(input.value("requirement"));
    if (validated.contains("error")) {
      return validated;
    }
    requirement = validated.value("value").toObject();
  }
  if (input.contains("requestedDurationMs")) {
    const auto duration = input.value("requestedDurationMs");
    if (!duration.isDouble() || !std::isfinite(duration.toDouble()) ||
        std::floor(duration.toDouble()) != duration.toDouble() ||
        duration.toDouble() <= 0 || duration.toDouble() > 9007199254740991.0) {
      return {{"error", "requestedDurationMs must be a positive integer."}};
    }
  }
  if (input.contains("referenceBindings")) {
    const auto validated = assistantValidateProduction(
        QJsonObject{{"reference_bindings", input.value("referenceBindings")}});
    if (validated.contains("error")) {
      return validated;
    }
  }
  const auto fail = [](const QString &message) {
    return QJsonObject{{"error", message}};
  };
  if (requirement.value("media_strategy") == "still_motion_graphics") {
    return fail("still_motion_graphics is not a video-generation route; "
                "materialize supplied stills/assets on the Timeline.");
  }
  QStringList protectedIds;
  for (const auto &value : requirement.value("protected_inputs").toArray()) {
    const auto asset = value.toObject();
    if (!asset.value("asset_id").toString().isEmpty()) {
      protectedIds.append(asset.value("id").toString());
    }
  }
  if (!protectedIds.isEmpty()) {
    return fail(
        "Video generation cannot prove fidelity for protected source assets: " +
        protectedIds.join(", ") + ". Keep them as separate Timeline layers.");
  }
  QStringList promptParts;
  for (const auto &value : {input.value("prompt").toString(),
                            requirement.value("local_direction").toString()}) {
    if (!value.trimmed().isEmpty()) {
      promptParts.append(value);
    }
  }
  const auto prompt = promptParts.join("\n\n");
  if (prompt.trimmed().isEmpty()) {
    return fail("prompt must be a non-empty string.");
  }
  const double countValue =
      requirement.value("requested_take_count").toDouble(1);
  if (!std::isfinite(countValue) || std::floor(countValue) != countValue ||
      countValue < 1 || countValue > 3) {
    return fail("Production take count must be between 1 and 3.");
  }
  const auto requested = requirement.contains("duration_ms") &&
                                 !requirement.value("duration_ms").isNull()
                             ? requirement.value("duration_ms")
                             : input.value("requestedDurationMs");
  const auto speechDuration = requirement.value("speech_duration_ms");
  if (!requested.isUndefined() && !speechDuration.isUndefined() &&
      speechDuration.toDouble() > requested.toDouble()) {
    return fail("Speech duration " +
                QString::number(speechDuration.toDouble(), 'g', 16) +
                "ms exceeds the " +
                QString::number(requested.toDouble(), 'g', 16) +
                "ms production slot.");
  }
  QJsonArray bindings;
  if (input.contains("referenceBindings")) {
    bindings = assistantValidateProduction(
                   QJsonObject{{"reference_bindings",
                                input.value("referenceBindings")}})
                   .value("value")
                   .toObject()
                   .value("reference_bindings")
                   .toArray();
  }
  for (const auto &value : requirement.value("reference_bindings").toArray()) {
    bindings.append(value);
  }
  auto unique = [](const QJsonArray &values) {
    QSet<QString> seen;
    QJsonArray result;
    for (const auto &value : values) {
      if (!value.isString() || value.toString().trimmed().isEmpty() ||
          seen.contains(value.toString())) {
        continue;
      }
      seen.insert(value.toString());
      result.append(value);
    }
    return result;
  };
  auto refs = input.value("referenceAssetIds").toArray();
  for (const auto &value : bindings) {
    refs.append(value.toObject().value("asset_id"));
  }
  refs = unique(refs);
  const auto speechBinding = requirement.value("speech_binding").toObject();
  const auto audio = speechBinding.value("audio_asset_id");
  const auto speechMode = requirement.value("speech_mode").toString("none");
  QString route = refs.isEmpty() ? "text_to_video" : "reference_to_video";
  auto hasBinding = [&bindings](const QString &kind) {
    for (const auto &value : bindings) {
      if (value.toObject().value("kind") == kind) {
        return true;
      }
    }
    return false;
  };
  const auto support = input.value("routeSupport").toObject();
  if (speechMode == "on_camera") {
    if (audio.toString().isEmpty()) {
      return fail("On-camera performance requires recorded speech audio before "
                  "video generation.");
    }
    if (!hasBinding("character")) {
      return fail("On-camera performance requires a resolved character "
                  "reference asset.");
    }
    if (!support.value("audioDrivenPerformance").toBool()) {
      return fail("The selected generation route does not support audio-driven "
                  "on-camera performance.");
    }
    route = "audio_driven_performance";
  } else if (requirement.value("visual_treatment") == "product_close_up" &&
             !hasBinding("product")) {
    return fail("Product close-up generation requires a resolved product "
                "reference asset.");
  }
  if (route == "reference_to_video" &&
      !support.value("referenceToVideo").toBool()) {
    return fail("The selected generation route cannot consume the required "
                "reference assets.");
  }
  const auto batch = input.value("batchId").toString(),
             destination = input.value("destinationId").toString(),
             destinationKind = input.value("destinationKind").toString();
  if (batch.trimmed().isEmpty()) {
    return fail("batchId must be a non-empty string.");
  }
  if (destination.trimmed().isEmpty()) {
    return fail("destinationId must be a non-empty string.");
  }
  QJsonArray candidates;
  for (int variation = 1; variation <= static_cast<int>(countValue);
       ++variation) {
    const auto variationId = "variation:" + batch.trimmed() + ":" +
                             destinationKind + ":" + destination.trimmed() +
                             ":" + QString::number(variation);
    const auto candidateId = "candidate:" + variationId,
               requestId = "request:" + candidateId;
    const QJsonObject identity{{"batchId", batch.trimmed()},
                               {"destinationKind", destinationKind},
                               {"destinationId", destination.trimmed()},
                               {"variationIndex", variation},
                               {"variationId", variationId},
                               {"candidateId", candidateId},
                               {"requestId", requestId}};
    QJsonObject parameters{{"executionRoute", route},
                           {"speechMode", speechMode}};
    if (!requirement.value("visual_treatment").toString().isEmpty()) {
      parameters.insert("visualTreatment",
                        requirement.value("visual_treatment"));
    }
    if (!requirement.value("local_direction").toString().isEmpty()) {
      parameters.insert("localDirection", requirement.value("local_direction"));
    }
    QJsonArray references;
    for (const auto &value : bindings) {
      const auto binding = value.toObject();
      QJsonObject reference{
          {"kind", binding.value("kind")},
          {"assetId", binding.value("asset_id")},
          {"descriptor",
           binding.contains("label")
               ? binding.value("label")
               : QJsonValue(binding.value("kind").toString() + " reference")}};
      if (binding.contains("entity_id")) {
        reference.insert("entityId", binding.value("entity_id"));
      }
      references.append(reference);
    }
    auto snapshot = identity;
    snapshot.insert("schemaVersion", 1);
    snapshot.insert("operation", input.value("operation"));
    snapshot.insert("entityIds", unique(input.value("entityIds").toArray()));
    snapshot.insert("referenceAssetIds", refs);
    snapshot.insert("references", references);
    snapshot.insert("requiredCapabilities", QJsonArray{route});
    snapshot.insert("executionRoute", route);
    snapshot.insert("prompt", prompt);
    snapshot.insert("parameters", parameters);
    for (const auto *field :
         {"authoringFingerprint", "provider", "model", "outputFormat"}) {
      if (input.contains(field)) {
        snapshot.insert(field, input.value(field));
      }
    }
    if (!requested.isUndefined()) {
      snapshot.insert("requestedDurationMs", requested);
    }
    if (requirement.contains("speech_binding")) {
      QJsonObject speech;
      for (const auto &field :
           {std::pair{"text", "text"}, std::pair{"direction", "direction"},
            std::pair{"voice", "voice"},
            std::pair{"audio_asset_id", "audioAssetId"},
            std::pair{"script_line_id", "scriptLineId"},
            std::pair{"speaker_id", "speakerId"}}) {
        if (speechBinding.contains(field.first)) {
          speech.insert(field.second, speechBinding.value(field.first));
        }
      }
      if (!speechDuration.isUndefined()) {
        speech.insert("durationMs", speechDuration);
      }
      snapshot.insert("speech", speech);
    }
    QJsonObject compiled{{"identity", identity},
                         {"snapshot", snapshot},
                         {"executionRoute", route},
                         {"referenceAssetIds", refs}};
    if (!audio.isUndefined()) {
      compiled.insert("audioAssetId", audio);
    }
    candidates.append(compiled);
  }
  return {{"candidates", candidates}};
}

QJsonObject assistantPrepareBeatCut(QJsonObject raw,
                                    const QJsonObject &options) {
  auto setup = raw.value("setup").toObject();
  auto beats = setup.value("beats").toArray();
  if (beats.isEmpty()) {
    return {{"error", "Plan the beats before generating the video."}};
  }
  const auto settings = setup.value("generation_settings").toObject();
  const auto video = settings.value("video").toObject();
  auto voiceSettings = settings.value("voice").toObject();
  if (options.contains("voiceProvider")) {
    voiceSettings.insert("provider", options.value("voiceProvider"));
  }
  if (options.contains("voiceModel")) {
    voiceSettings.insert("model", options.value("voiceModel"));
  }
  const QJsonObject musicSettings{{"provider", options.value("musicProvider")},
                                  {"model", options.value("musicModel")}};
  const auto provider = options.value("provider")
                            .toString(video.value("provider").toString()),
             model = options.value("model").toString(
                 video.value("model").toString());
  const auto voice =
      options.value("voice").toString(voiceSettings.value("voice").toString());
  const bool wantsVoiceover = setup.value("voiceover").toBool(true);
  const bool voiced = wantsVoiceover && !voice.isEmpty();
  bool wantsMusic = options.value("music").toBool();
  if (!options.contains("music")) {
    for (const auto &value : beats) {
      if (value.toObject().value("music").toBool()) {
        wantsMusic = true;
        break;
      }
    }
  }
  const auto batchId = options.value("batchId").toString(nt::edit::newId());
  auto compileBeat = [&setup, &batchId, &provider, &model](
                         const QJsonObject &beat, const QString &destination) {
    const auto bindings = setup.value("creative_context")
                              .toObject()
                              .value("reference_bindings")
                              .toArray();
    QJsonArray assets;
    for (const auto &value : bindings) {
      assets.append(value.toObject().value("asset_id"));
    }
    QJsonObject input{
        {"batchId", batchId},
        {"destinationId", destination},
        {"destinationKind", "timeline_clip"},
        {"operation", "initial_generation"},
        {"prompt", beat.value("prompt")},
        {"requirement", beat.value("production")},
        {"referenceAssetIds", assets},
        {"referenceBindings", bindings},
        {"provider", provider},
        {"model", model},
        {"requestedDurationMs",
         beat.value("duration_ms").toDouble() > 0
             ? std::round(beat.value("duration_ms").toDouble())
             : 4000},
        {"routeSupport", QJsonObject{{"referenceToVideo", true},
                                     {"audioDrivenPerformance", false}}}};
    return assistantCompileProduction(input);
  };
  for (const auto &value : beats) {
    const auto beat = value.toObject();
    if (beat.value("source_clip_id").toString().isEmpty() &&
        (provider.isEmpty() || model.isEmpty())) {
      return {
          {"error",
           "Choose a video provider and model before preparing this batch."}};
    }
    if (beat.value("source_clip_id").toString().isEmpty()) {
      const auto compiled = compileBeat(beat, beat.value("id").toString());
      if (compiled.contains("error")) {
        return compiled;
      }
    }
    if (voiced && !beat.value("voiceover").toString().trimmed().isEmpty() &&
        (voiceSettings.value("provider").toString().isEmpty() ||
         voiceSettings.value("model").toString().isEmpty())) {
      return {{"error",
               "Choose voice provider/model in setup.generation_settings.voice "
               "before preparing narrated beats."}};
    }
  }
  nt::edit::EditDoc locks;
  for (const auto &value : raw.value("clips").toArray()) {
    locks.clips.push_back(value.toObject());
  }
  for (const auto &value : raw.value("tracks").toArray()) {
    const auto track = value.toObject();
    locks.tracks.push_back({track.value("id").toString(),
                            track.value("type").toString(),
                            track.value("locked").toBool()});
  }
  const auto lockedIds = nt::edit::lockedUserTargetIds(locks);
  auto tracks = raw.value("tracks").toArray();
  auto clips = raw.value("clips").toArray();
  QJsonArray queue, requests, videoIds, voiceIds;
  QString musicId;
  auto trackFor = [&tracks](const QString &type, const QString &name,
                            bool byName) {
    for (const auto &value : tracks) {
      const auto track = value.toObject();
      if (track.value("type") == type &&
          (!byName || track.value("name") == name) &&
          !track.value("locked").toBool()) {
        return track.value("id").toString();
      }
    }
    const auto id = nt::edit::newId();
    tracks.append(QJsonObject{{"id", id},
                              {"type", type},
                              {"name", name},
                              {"index", tracks.size()},
                              {"visible", true},
                              {"locked", false}});
    return id;
  };
  const auto videoTrack = trackFor("video", "Video", false);
  QString voiceTrack, musicTrack;
  if (voiced) {
    voiceTrack = trackFor("audio", "Voiceover", true);
  }
  if (wantsMusic) {
    musicTrack = trackFor("audio", "Music", true);
  }
  const int width = raw.value("width").toInt(1920),
            height = raw.value("height").toInt(1080);
  const auto divisor = std::gcd(std::max(1, width), std::max(1, height));
  const auto aspect = QString::number(width / divisor) + ":" +
                      QString::number(height / divisor);
  auto draft = [&clips](const QString &track, const QString &kind,
                        const QString &prompt, const QString &provider,
                        const QString &model, const QString &name, double start,
                        double duration, const QString &beatId) {
    const auto id = nt::edit::newId();
    clips.append(
        QJsonObject{{"id", id},
                    {"trackId", track},
                    {"name", name},
                    {"mediaType", kind == "text-to-video" ? "video" : "audio"},
                    {"sourceType", "generated"},
                    {"bindingKind", kind},
                    {"prompt", prompt},
                    {"provider", provider},
                    {"model", model},
                    {"startMs", start},
                    {"durationMs", duration},
                    {"beatId", beatId},
                    {"status", "draft"},
                    {"locked", false},
                    {"versions", QJsonArray{}}});
    return id;
  };
  auto enqueue = [&queue, &requests](const QString &id, const QString &kind,
                                     const QString &beatId, int variation,
                                     const QString &provider,
                                     const QString &model) {
    const auto request = nt::edit::newId();
    QJsonObject entry{{"clip_id", id},
                      {"request_id", request},
                      {"kind", kind},
                      {"beat_id", beatId},
                      {"variation_index", variation},
                      {"provider", provider},
                      {"model", model}};
    queue.append(entry);
    entry.remove("provider");
    entry.remove("model");
    if (beatId.isEmpty()) {
      entry.remove("beat_id");
    }
    requests.append(entry);
  };
  double start = 0;
  QSet<QString> plannedSources;
  for (qsizetype index = 0; index < beats.size(); ++index) {
    auto beat = beats.at(index).toObject();
    const double duration =
        std::isfinite(beat.value("duration_ms").toDouble()) &&
                beat.value("duration_ms").toDouble() > 0
            ? std::round(beat.value("duration_ms").toDouble())
            : 4000;
    const auto beatId = beat.value("id").toString();
    const auto sourceId = beat.value("source_clip_id").toString();
    QString clipId;
    if (!sourceId.isEmpty()) {
      int sourceIndex = -1;
      for (qsizetype j = 0; j < clips.size(); ++j) {
        if (clips.at(j).toObject().value("id").toString() == sourceId) {
          sourceIndex = static_cast<int>(j);
          break;
        }
      }
      if (sourceIndex < 0) {
        return {{"error",
                 "A beat's imported source is no longer on the timeline."}};
      }
      auto source = clips.at(sourceIndex).toObject();
      if (lockedIds.contains(sourceId)) {
        return {{"error",
                 "Unlock imported beat sources before preparing the cut."}};
      }
      clipId = sourceId;
      plannedSources.insert(sourceId);
      const auto link = source.value("linkId").toString();
      for (qsizetype j = 0; j < clips.size(); ++j) {
        auto partner = clips.at(j).toObject();
        if (partner.value("id").toString() != sourceId &&
            (link.isEmpty() || partner.value("linkId").toString() != link)) {
          continue;
        }
        if (lockedIds.contains(partner.value("id").toString())) {
          return {
              {"error",
               "Unlock every linked clip and track before preparing the cut."}};
        }
        partner.insert("startMs", start);
        partner.insert("durationMs", duration);
        partner.insert("inPointMs", partner.value("inPointMs").toDouble());
        partner.insert("outPointMs",
                       partner.value("inPointMs").toDouble() +
                           duration *
                               partner.value("speedMultiplier").toDouble(1));
        if (partner.value("id").toString() == sourceId) {
          partner.insert("beatId", beatId);
        }
        clips[j] = partner;
      }
    } else {
      clipId =
          draft(videoTrack, "text-to-video", beat.value("prompt").toString(),
                provider, model, "Beat " + QString::number(index + 1), start,
                duration, beatId);
      auto clip = clips.last().toObject();
      clip.insert("aspectRatio", aspect);
      const auto compiled = compileBeat(beat, clipId);
      if (compiled.contains("error")) {
        return compiled;
      }
      const auto productionCandidates = compiled.value("candidates").toArray();
      const auto snapshot =
          productionCandidates.first().toObject().value("snapshot").toObject();
      clip.insert("prompt", snapshot.value("prompt"));
      clip.insert("referenceImageIds", snapshot.value("referenceAssetIds"));
      if (!snapshot.value("entityIds").toArray().isEmpty()) {
        clip.insert("referenceEntityIds", snapshot.value("entityIds"));
      }
      QJsonObject productionParameters{
          {"productionCandidates", productionCandidates}};
      if (beat.contains("production")) {
        productionParameters.insert("productionRequirement",
                                    beat.value("production"));
      }
      clip.insert("paramOverrides", productionParameters);
      const auto transition = beat.value("transition").toString();
      if (!transition.isEmpty()) {
        clip.insert("transitionIn",
                    QJsonObject{{"type", transition}, {"durationMs", 500}});
      }
      clips[clips.size() - 1] = clip;
      for (const auto &value : productionCandidates) {
        const auto candidate = value.toObject();
        const auto identity = candidate.value("identity").toObject();
        QJsonObject entry{{"clip_id", clipId},
                          {"request_id", identity.value("requestId")},
                          {"kind", "video"},
                          {"beat_id", beatId},
                          {"variation_index", identity.value("variationIndex")},
                          {"provider", provider},
                          {"model", model},
                          {"production", candidate}};
        queue.append(entry);
        entry.remove("provider");
        entry.remove("model");
        entry.remove("production");
        requests.append(entry);
      }
    }
    videoIds.append(clipId);
    beat.insert("clip_id", clipId);
    beats[index] = beat;
    const auto line = beat.value("voiceover").toString().trimmed();
    if (voiced && !line.isEmpty()) {
      const auto id = draft(voiceTrack, "text-to-audio", line,
                            voiceSettings.value("provider").toString(),
                            voiceSettings.value("model").toString(),
                            "Beat " + QString::number(index + 1) + " voiceover",
                            start, duration, beatId);
      auto clip = clips.last().toObject();
      clip.insert("voice", voice);
      clips[clips.size() - 1] = clip;
      voiceIds.append(id);
      enqueue(id, "voiceover", beatId, 1,
              voiceSettings.value("provider").toString(),
              voiceSettings.value("model").toString());
    }
    start += duration;
  }
  // Keep unused imported pictures and their audio together after the planned
  // cut.
  double first = std::numeric_limits<double>::infinity();
  QSet<QString> move, links;
  for (const auto &value : clips) {
    const auto clip = value.toObject();
    if (clip.value("sourceType") == "imported" &&
        (clip.value("mediaType") == "image" ||
         clip.value("mediaType") == "video") &&
        !plannedSources.contains(clip.value("id").toString())) {
      move.insert(clip.value("id").toString());
      first = std::min(first, clip.value("startMs").toDouble());
      if (!clip.value("linkId").toString().isEmpty()) {
        links.insert(clip.value("linkId").toString());
      }
    }
  }
  if (std::isfinite(first) && first < start) {
    for (qsizetype i = 0; i < clips.size(); ++i) {
      auto clip = clips.at(i).toObject();
      if (move.contains(clip.value("id").toString()) ||
          links.contains(clip.value("linkId").toString())) {
        if (lockedIds.contains(clip.value("id").toString())) {
          return {{"error", "An unused imported clip or linked track is "
                            "locked. The cut was not prepared."}};
        }
        clip.insert("startMs",
                    clip.value("startMs").toDouble() + start - first);
        clips[i] = clip;
      }
    }
  }
  if (wantsMusic && !musicSettings.value("model").toString().isEmpty()) {
    musicId =
        draft(musicTrack, "text-to-music",
              "Instrumental score under: " +
                  setup.value("brief").toString().trimmed(),
              musicSettings.value("provider").toString(),
              musicSettings.value("model").toString(), "Music", 0, start, {});
    enqueue(musicId, "music", {}, 1, musicSettings.value("provider").toString(),
            musicSettings.value("model").toString());
  }
  QJsonArray fingerprintBeats;
  for (const auto &value : setup.value("beats").toArray()) {
    const auto original = value.toObject();
    QJsonObject authored;
    for (const auto *field :
         {"id", "prompt", "duration_ms", "transition", "voiceover", "music",
          "source_clip_id", "production"}) {
      if (original.contains(field)) {
        authored.insert(field, original.value(field));
      }
    }
    fingerprintBeats.append(authored);
  }
  QJsonObject fingerprintInput{{"kind", "video-generation-preparation"},
                               {"beats", fingerprintBeats},
                               {"width", width},
                               {"height", height},
                               {"provider", provider},
                               {"model", model},
                               {"voiceover", wantsVoiceover},
                               {"music", wantsMusic}};
  if (setup.contains("creative_context")) {
    fingerprintInput.insert("creativeContext", setup.value("creative_context"));
  }
  if (!voice.isEmpty()) {
    fingerprintInput.insert("voice", voice);
    fingerprintInput.insert("voiceProvider", voiceSettings.value("provider"));
    fingerprintInput.insert("voiceModel", voiceSettings.value("model"));
  }
  if (!musicSettings.value("provider").toString().isEmpty()) {
    fingerprintInput.insert("musicProvider", musicSettings.value("provider"));
  }
  if (!musicSettings.value("model").toString().isEmpty()) {
    fingerprintInput.insert("musicModel", musicSettings.value("model"));
  }
  const auto fingerprint = assistantFingerprint(fingerprintInput);
  setup.insert("stage", "done");
  setup.insert("beats", beats);
  setup.insert("prepared_generation", QJsonObject{{"batch_id", batchId},
                                                  {"fingerprint", fingerprint},
                                                  {"status", "unsubmitted"},
                                                  {"requests", requests}});
  raw.insert("setup", setup);
  raw.insert("tracks", tracks);
  raw.insert("clips", clips);
  double end = start;
  for (const auto &value : clips) {
    const auto clip = value.toObject();
    end = std::max(end, clip.value("startMs").toDouble() +
                            clip.value("durationMs").toDouble());
  }
  raw.insert("durationMs", end);
  return {{"document", raw},
          {"requests", queue},
          {"fingerprint", fingerprint},
          {"videoClipIds", videoIds},
          {"voiceoverClipIds", voiceIds},
          {"musicClipId",
           musicId.isEmpty() ? QJsonValue::Null : QJsonValue(musicId)},
          {"costKnown", false},
          {"estimatedCredits", QJsonValue::Null}};
}
QJsonObject assistantDraft(QJsonObject raw, const QJsonObject &payload) {
  const auto kind = payload.value("kind").toString();
  const auto media = kind == "text-to-audio"   ? QStringLiteral("audio")
                     : kind == "text-to-image" ? QStringLiteral("image")
                     : kind == "text-to-video" ? QStringLiteral("video")
                                               : QString{};
  const auto trackType =
      media == "audio" ? QStringLiteral("audio") : QStringLiteral("video");
  if (media.isEmpty() || !payload.value("prompt").isString() ||
      payload.value("id").toString().isEmpty()) {
    return raw;
  }
  for (const auto *field :
       {"provider", "model", "voice", "aspectRatio", "resolution"}) {
    if (payload.contains(field) && !payload.value(field).isString()) {
      return raw;
    }
  }
  for (const auto *field : {"startMs", "durationMs", "width", "height"}) {
    if (payload.contains(field) &&
        (!payload.value(field).isDouble() ||
         !std::isfinite(payload.value(field).toDouble()) ||
         (QString(field) == "startMs"
              ? payload.value(field).toDouble() < 0
              : payload.value(field).toDouble() <= 0))) {
      return raw;
    }
  }
  const double duration =
      payload.value("durationMs").toDouble(media == "audio" ? 3000 : 5000);
  if (!std::isfinite(duration) || duration <= 0) {
    return raw;
  }
  auto tracks = raw.value("tracks").toArray();
  QString trackId = payload.value("trackId").toString();
  bool foundType = false, found = false;
  for (const auto &value : tracks) {
    const auto track = value.toObject();
    if (!trackId.isEmpty() && track.value("id").toString() != trackId) {
      continue;
    }
    if (track.value("type").toString() != trackType &&
        !(media == "image" && track.value("type") == "overlay")) {
      continue;
    }
    foundType = true;
    if (!track.value("locked").toBool()) {
      trackId = track.value("id").toString();
      found = true;
      break;
    }
  }
  if (!found) {
    if (!trackId.isEmpty() || foundType) {
      return raw;
    }
    trackId = nt::edit::newId();
    tracks.append(
        QJsonObject{{"id", trackId},
                    {"type", trackType},
                    {"name", trackType == "audio" ? "Audio" : "Video"},
                    {"index", tracks.size()},
                    {"visible", true},
                    {"locked", false}});
  }
  auto clips = raw.value("clips").toArray();
  double start = 0;
  for (const auto &value : clips) {
    const auto clip = value.toObject();
    if (clip.value("id") == payload.value("id")) {
      return raw;
    }
    if (clip.value("trackId") == trackId) {
      start = std::max(start, clip.value("startMs").toDouble() +
                                  clip.value("durationMs").toDouble());
    }
  }
  start = payload.value("startMs").toDouble(start);
  if (!std::isfinite(start) || start < 0) {
    return raw;
  }
  QJsonObject clip{{"id", payload.value("id")},
                   {"trackId", trackId},
                   {"name", payload.value("prompt").toString().left(40)},
                   {"mediaType", media},
                   {"sourceType", "generated"},
                   {"bindingKind", kind},
                   {"prompt", payload.value("prompt")},
                   {"startMs", start},
                   {"durationMs", duration},
                   {"status", "draft"},
                   {"locked", false},
                   {"versions", QJsonArray{}}};
  for (const auto *field : {"provider", "model", "voice", "width", "height",
                            "aspectRatio", "resolution"}) {
    if (payload.contains(field)) {
      clip.insert(field, payload.value(field));
    }
  }
  clips.append(clip);
  raw.insert("clips", clips);
  raw.insert("tracks", tracks);
  raw.insert("durationMs",
             std::max(raw.value("durationMs").toDouble(), start + duration));
  return raw;
}
QJsonObject assistantEdit(const QString &name, QJsonObject raw,
                          const QJsonObject &payload) {
  nt::edit::EditDoc doc;
  for (const auto &value : raw.value("clips").toArray()) {
    doc.clips.push_back(value.toObject());
  }
  for (const auto &value : raw.value("tracks").toArray()) {
    const auto track = value.toObject();
    doc.tracks.push_back({track.value("id").toString(),
                          track.value("type").toString(),
                          track.value("locked").toBool()});
  }
  for (const auto &value : raw.value("mediaTracks").toArray()) {
    doc.clipsWithMediaTracks.insert(
        value.toObject().value("clipId").toString());
  }
  const auto id = payload.value("clipId").toString();
  const auto source =
      std::find_if(doc.clips.begin(), doc.clips.end(), [&id](const auto &clip) {
        return clip.value("id").toString() == id;
      });
  if (source == doc.clips.end()) {
    return raw;
  }
  auto clips = doc.clips;
  if (name == "ui_timeline_set_clip_binding") {
    if (source->value("sourceType") != "generated" ||
        nt::edit::lockedUserTargetIds(doc).contains(id)) {
      return raw;
    }
    for (const auto *field : {"prompt", "negativePrompt", "provider", "model",
                              "voice", "aspectRatio", "resolution"}) {
      if (payload.contains(field) && !payload.value(field).isString()) {
        return raw;
      }
    }
    for (const auto *field :
         {"width", "height", "strength", "numInferenceSteps"}) {
      if (payload.contains(field) &&
          (!payload.value(field).isDouble() ||
           !std::isfinite(payload.value(field).toDouble()))) {
        return raw;
      }
    }
    auto changed = *source;
    for (const auto *field : {"prompt", "negativePrompt", "provider", "model",
                              "voice", "width", "height", "aspectRatio",
                              "resolution", "strength", "numInferenceSteps"}) {
      if (payload.contains(field)) {
        changed.insert(field, payload.value(field));
      }
    }
    *std::find_if(clips.begin(), clips.end(), [&id](const auto &clip) {
      return clip.value("id").toString() == id;
    }) = changed;
  } else if (name == "ui_timeline_move_clip") {
    const auto start = payload.value("startMs");
    const double target = start.isDouble()
                              ? start.toDouble()
                              : source->value("startMs").toDouble();
    if (!std::isfinite(target)) {
      return raw;
    }
    clips = nt::edit::moveClip(
        doc, id, std::max(0.0, target) - source->value("startMs").toDouble(),
        payload.value("trackId").toString(source->value("trackId").toString()),
        true);
  } else if (name == "ui_timeline_delete_clip") {
    clips = nt::edit::deleteSelected(doc, {id});
  } else if (name == "ui_timeline_split_clip") {
    if (!payload.value("atMs").isDouble() ||
        !std::isfinite(payload.value("atMs").toDouble())) {
      return raw;
    }
    clips =
        nt::edit::splitClipAtTime(doc, id, payload.value("atMs").toDouble());
  }
  QJsonArray array;
  for (const auto &clip : clips) {
    array.append(clip);
  }
  raw.insert("clips", array);
  return raw;
}
namespace {
const bool registered = [] {
  for (const auto &name :
       {"ui_timeline_set_setup", "ui_timeline_plan_beats",
        "ui_timeline_update_beat", "ui_timeline_remove_beat"}) {
    nt::app::registerEdit(QString("assistant.") + name,
                          [name](QJsonObject raw, const QJsonObject &payload) {
                            return assistantPlanningEdit(name, std::move(raw),
                                                         payload);
                          });
  }
  nt::app::registerEdit(
      "assistant.commitBeatGeneration",
      [](QJsonObject raw, const QJsonObject &payload) {
        const auto document = payload.value("document").toObject();
        return document.value("id") == raw.value("id") ? document : raw;
      });
  nt::app::registerEdit("assistant.generateClip", assistantDraft);
  for (const auto &name :
       {"ui_timeline_move_clip", "ui_timeline_delete_clip",
        "ui_timeline_split_clip", "ui_timeline_set_clip_binding"}) {
    nt::app::registerEdit(QString("assistant.") + name,
                          [name](QJsonObject raw, const QJsonObject &payload) {
                            return assistantEdit(name, std::move(raw), payload);
                          });
  }
  return true;
}();
} // namespace
} // namespace nt::aiassist
