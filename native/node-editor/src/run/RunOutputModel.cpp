#include "RunOutputModel.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QCryptographicHash>
#include <QDateTime>
#include <QBuffer>
#include <QImage>
#include <QPainter>
#include <QRegularExpression>
#include <QSet>
#include <QSvgRenderer>
#include <QTextDocument>
#include <algorithm>
#include <cmath>
#include <optional>

namespace nodetool::node_editor {
namespace {
constexpr qsizetype MaxRuns = 20;
constexpr qsizetype MaxEntries = 500;
constexpr qsizetype MaxPcmStreams = 64;
static_assert(MaxEntries > MaxPcmStreams + 1);
constexpr qsizetype MaxText = 65536;
constexpr qsizetype MaxRunText = 4 * 1024 * 1024;
QString display(const QJsonValue &value) {
  if (value.isString()) {
    return value.toString();
  }
  const auto object = value.toObject();
  if (object["type"] == "chunk" && object["content_type"] == "audio") { return "Streaming PCM audio"; }
  const auto wrapped = QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact);
  return QString::fromUtf8(wrapped.mid(1, wrapped.size() - 2));
}
// TaskView.tsx: the title, its description, then each step as a checklist line.
QString taskMarkdown(const QJsonObject &task, const QString &heading) {
  QStringList lines{heading + ' ' + task["title"].toString()};
  if (!task["description"].toString().isEmpty()) { lines << QString{} << task["description"].toString(); }
  const auto steps = task["steps"].toArray();
  if (!steps.isEmpty()) {
    lines << QString{};
    for (const auto &value : steps) {
      const auto step = value.toObject();
      lines << QStringLiteral("- [%1] %2").arg(step["completed"].toBool() ? 'x' : ' ').arg(step["instructions"].toString());
    }
  }
  return lines.join('\n');
}
QString datetimeText(const QJsonValue &value) {
  const auto object = value.toObject();
  const QDateTime when(QDate(object["year"].toInt(), object["month"].toInt(), object["day"].toInt()),
                       QTime(object["hour"].toInt(), object["minute"].toInt(), object["second"].toInt()));
  return when.isValid() ? when.toString("yyyy-MM-dd HH:mm") : value.toString();
}
// ThreadMessageList.tsx: the role, then the message's text parts.
QString messageMarkdown(const QJsonObject &message) {
  QStringList parts;
  const auto content = message["content"];
  if (content.isString()) { parts << content.toString(); }
  for (const auto &value : content.toArray()) {
    const auto part = value.toObject();
    if (part["type"] == "text") { parts << part["text"].toString(); }
    else if (!part["type"].toString().isEmpty()) { parts << '[' + part["type"].toString() + ']'; }
  }
  for (const auto &value : message["tool_calls"].toArray()) {
    parts << QStringLiteral("Tool call: `%1`").arg(value.toObject()["name"].toString());
  }
  return QStringLiteral("**%1**\n\n%2").arg(message["role"].toString("message"), parts.join("\n\n"));
}
QVariantMap renderTree(const QJsonValue &value, int &budget, int depth = 0) {
  if (--budget < 0 || depth >= 8) { return {{"renderer", "text"}, {"text", "[Preview truncated]"}}; }
  const auto object = value.toObject();
  if (object["type"] == "chunk" && object["content_type"] == "audio") {
    return {{"renderer", "pcm"}, {"text", "Streaming PCM audio"}};
  }
  if (value.isArray() || (value.isObject() && object["type"].toString().isEmpty())) {
    QVariantList fields, children;
    if (value.isArray()) {
      for (const auto &child : value.toArray()) {
        if (budget <= 0) { break; }
        children.append(renderTree(child, budget, depth + 1));
      }
      return {{"renderer", "sequence"}, {"children", children}};
    }
    for (auto it = object.begin(); it != object.end() && budget > 0; ++it) {
      fields.append(QVariantMap{{"name", it.key().left(1024)}, {"output", renderTree(it.value(), budget, depth + 1)}});
    }
    return {{"renderer", "object"}, {"fields", fields}, {"text", budget <= 0 ? "[Preview truncated]" : ""}};
  }
  RunOutputModel model;
  model.beginRun("preview");
  model.ingest("preview", {{"type", "output_update"}, {"job_id", "preview"}, {"node_id", "preview"}, {"value", value}});
  return model.entries().last().toMap();
}
// svg.tsx builds only drawing elements and drops attributes that can carry
// script or a navigation. The rendered PNG carries no live content at all.
const QSet<QString> &svgElements() {
  static const QSet<QString> names{
      "svg", "g", "defs", "symbol", "use", "title", "desc", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
      "text", "tspan", "textPath", "linearGradient", "radialGradient", "stop", "pattern", "clipPath", "mask", "marker", "image",
      "filter", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting",
      "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR",
      "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight",
      "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence"};
  return names;
}
bool safeSvgAttribute(const QString &name, const QString &value) {
  const auto key = name.toLower();
  if (key.startsWith("on") || key == "srcdoc") { return false; }
  if (key == "href" || key == "xlink:href" || key == "src") {
    // Only fragment references and inline images: never a file or the network.
    return value.startsWith('#') || value.startsWith("data:image/");
  }
  return true;
}
QString svgMarkup(const QJsonObject &element, int depth) {
  if (depth > 32) { return {}; }
  const auto name = element["name"].toString(QStringLiteral("svg"));
  if (!svgElements().contains(name)) { return QStringLiteral("<g/>"); }
  QString markup = '<' + name;
  if (depth == 0 && name == "svg") { markup += QStringLiteral(" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\""); }
  const auto attributes = element["attributes"].toObject();
  for (auto it = attributes.begin(); it != attributes.end(); ++it) {
    const auto value = it.value().isString() ? it.value().toString() : it.value().toVariant().toString();
    if (it.key() == "xmlns" || it.key().startsWith("xmlns:") || !safeSvgAttribute(it.key(), value)) { continue; }
    markup += ' ' + it.key().toHtmlEscaped() + "=\"" + value.toHtmlEscaped() + '"';
  }
  markup += '>';
  const auto content = element["content"].toString();
  if (!content.trimmed().startsWith('<')) { markup += content.toHtmlEscaped(); }
  for (const auto &child : element["children"].toArray()) { markup += svgMarkup(child.toObject(), depth + 1); }
  return markup + "</" + name + '>';
}
// The PNG of an svg_element output (one element or a list), or null when the
// value is not one or does not parse.
QJsonValue svgPreview(const QJsonValue &value) {
  QJsonArray elements = value.isArray() ? value.toArray() : QJsonArray{value};
  if (elements.isEmpty()) { return {}; }
  for (const auto &element : elements) {
    if (element.toObject()["type"] != "svg_element") { return {}; }
  }
  QString markup;
  const auto first = elements.first().toObject();
  if (elements.size() == 1 && first["name"].toString(QStringLiteral("svg")) == "svg") {
    markup = svgMarkup(first, 0);
  } else {
    markup = QStringLiteral("<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"512\" height=\"512\">");
    for (const auto &element : elements) { markup += svgMarkup(element.toObject(), 1); }
    markup += QStringLiteral("</svg>");
  }
  QSvgRenderer renderer(markup.toUtf8());
  if (!renderer.isValid()) { return {}; }
  QSizeF size = renderer.defaultSize();
  if (size.isEmpty()) { size = renderer.viewBoxF().size(); }
  if (size.isEmpty()) { size = QSizeF(512, 512); }
  size.scale(std::min(size.width(), 1024.0), std::min(size.height(), 1024.0), Qt::KeepAspectRatio);
  QImage image(size.toSize().expandedTo(QSize(1, 1)), QImage::Format_ARGB32_Premultiplied);
  image.fill(Qt::transparent);
  QPainter painter(&image);
  renderer.render(&painter);
  painter.end();
  QByteArray png;
  QBuffer buffer(&png);
  buffer.open(QIODevice::WriteOnly);
  image.save(&buffer, "PNG");
  return QJsonObject{{"type", "image"}, {"content_type", "image/png"}, {"data", QString::fromLatin1(png.toBase64())}};
}
// The html output as Markdown. QTextDocument runs no script and loads nothing,
// and images are reduced to their alt text so the Markdown view loads nothing either.
QString htmlMarkdown(const QString &html) {
  QTextDocument document;
  document.setHtml(html);
  static const QRegularExpression image(QStringLiteral(R"(!\[([^\]]*)\]\([^)]*\))"));
  return document.toMarkdown().replace(image, QStringLiteral("\\1")).trimmed();
}
QString mediaKind(const QJsonObject &object) {
  auto kind = object["type"].toString();
  if (kind != "image" && kind != "video" && kind != "audio") { kind = object["mime_type"].toString(object["content_type"].toString()).section('/', 0, 0); }
  return kind == "image" || kind == "video" || kind == "audio" ? kind : QString{};
}
QString childPath(const QString &path, QString key) { return path + '/' + key.replace('~', "~0").replace('/', "~1"); }
void collectMedia(const QJsonValue &value, QVariantList &media, int &visited,
                  qsizetype &mediaBytes, bool &truncated, int depth = 0, const QString &path = "$") {
  if (depth > 8 || visited >= 4096 || media.size() >= 256) { truncated = true; return; }
  ++visited;
  if (value.isArray()) {
    const auto values = value.toArray();
    for (qsizetype i = 0; i < values.size(); ++i) { if (visited >= 4096 || media.size() >= 256) { truncated = true; break; } collectMedia(values[i], media, visited, mediaBytes, truncated, depth + 1, childPath(path, QString::number(i))); }
  } else if (value.isObject()) {
    const auto object = value.toObject();
    const auto kind = mediaKind(object);
    if (!kind.isEmpty()) {
      QJsonObject locator;
      for (const auto &key : {"type", "mime_type", "content_type", "uri", "asset_id", "data"}) { if (object.contains(key)) { locator[key] = object[key]; } }
      const bool validUri = locator.value("uri").isString() && !locator.value("uri").toString().isEmpty();
      const bool validId = locator.value("asset_id").isString() && !locator.value("asset_id").toString().isEmpty();
      bool validData = locator.value("data").isString() && !locator.value("data").toString().isEmpty();
      if (locator.value("data").isArray() && !locator.value("data").toArray().isEmpty()) {
        validData = true;
        for (const auto &byte : locator.value("data").toArray()) {
          if (!byte.isDouble() || byte.toDouble() < 0 || byte.toDouble() > 255 || std::floor(byte.toDouble()) != byte.toDouble()) { validData = false; break; }
        }
      }
      const auto encoded = QJsonDocument(locator).toJson(QJsonDocument::Compact);
      if (validUri || validId || validData) {
        if (mediaBytes + encoded.size() > 2 * 1024 * 1024) { truncated = true; return; }
        mediaBytes += encoded.size();
        media.append(QVariantMap{{"kind", kind}, {"locator", locator.toVariantMap()}, {"path", path},
          {"filename", object["filename"].toString(object["name"].toString())}});
        return;
      }
    }
    for (auto child = object.begin(); child != object.end(); ++child) {
      if (visited >= 4096 || media.size() >= 256) { truncated = true; break; }
      if (child.key() != "data") { collectMedia(child.value(), media, visited, mediaBytes, truncated, depth + 1, childPath(path, child.key())); }
    }
  }
}
void collectionParts(const QJsonValue &value, const QString &path,
    const QHash<QString, QVariantMap> &media, const QSet<QString> &parents,
    QVariantList &items, bool &truncated, int depth = 0) {
  if (depth > 8 || items.size() >= 256) { truncated = true; return; }
  if (media.contains(path)) { items.append(media.value(path)); return; }
  if (value.isArray()) {
    const auto array = value.toArray();
    for (qsizetype i = 0; i < array.size(); ++i) { if (items.size() >= 256) { truncated = true; break; } collectionParts(array[i], childPath(path, QString::number(i)), media, parents, items, truncated, depth + 1); }
    return;
  }
  if (value.isObject() && parents.contains(path)) {
    const auto object = value.toObject();
    for (auto child = object.begin(); child != object.end(); ++child) {
      if (items.size() >= 256) { truncated = true; break; }
      const auto next = childPath(path, child.key());
      if (parents.contains(next) || media.contains(next)) { collectionParts(child.value(), next, media, parents, items, truncated, depth + 1); }
      else {
        auto text = child.key() + ": " + display(child.value());
        if (text.size() > 4096) { text = text.left(4096) + " [Preview truncated]"; truncated = true; }
        items.append(QVariantMap{{"kind", "text"}, {"text", text}, {"itemKey", next}});
      }
    }
    return;
  }
  auto text = value.isObject() && !mediaKind(value.toObject()).isEmpty() ? QString("[Media preview omitted]") : display(value);
  if (text.size() > 4096) { text = text.left(4096) + " [Preview truncated]"; truncated = true; }
  items.append(QVariantMap{{"kind", "text"}, {"text", text}, {"itemKey", path}});
}
QVariantList collectionItems(const QJsonValue &value, QVariantList &media, bool &truncated) {
  QHash<QString, QVariantMap> paths;
  QHash<QByteArray, int> occurrences;
  QSet<QString> parents;
  for (auto &entry : media) {
    auto item = entry.toMap();
    const auto hash = QCryptographicHash::hash(QJsonDocument::fromVariant(item["locator"]).toJson(QJsonDocument::Compact), QCryptographicHash::Sha256).toHex();
    item["itemKey"] = "media:" + QString::fromLatin1(hash) + ':' + QString::number(occurrences[hash]++);
    entry = item;
    auto path = item["path"].toString();
    paths.insert(path, item);
    while (path.contains('/')) { path = path.left(path.lastIndexOf('/')); parents.insert(path); }
  }
  QVariantList items;
  collectionParts(value, "$", paths, parents, items, truncated);
  return items;
}
QString collectionCaption(const QVariantList &items) {
  QStringList captions;
  for (const auto &part : items) { const auto item = part.toMap(); captions.append(item["kind"] == "text" ? item["text"].toString() : '[' + item["kind"].toString() + ']'); }
  return captions.join('\n');
}
void appendCollection(QVariantMap &entry, const QVariantMap &existing) {
  const auto incoming = entry.value("items").toList();
  auto items = existing.value("items").toList();
  items.append(incoming);
  QVariantList retained, media;
  QHash<QByteArray, int> occurrences;
  qsizetype mediaBytes = 0;
  for (const auto &value : items) {
    auto item = value.toMap();
    if (retained.size() >= 256) { entry["truncated"] = true; break; }
    const bool isMedia = item.value("kind") != "text";
    const auto encoded = isMedia ? QJsonDocument::fromVariant(item["locator"]).toJson(QJsonDocument::Compact) : item["text"].toString().toUtf8();
    if (isMedia && mediaBytes + encoded.size() > 2 * 1024 * 1024) { entry["truncated"] = true; break; }
    const auto hash = QCryptographicHash::hash(encoded, QCryptographicHash::Sha256).toHex();
    item["itemKey"] = (isMedia ? "media:" : "text:") + QString::fromLatin1(hash) + ':' + QString::number(occurrences[hash]++);
    retained.append(item);
    if (isMedia) { mediaBytes += encoded.size(); media.append(item); }
  }
  entry["items"] = retained; entry["media"] = media;
  entry["text"] = collectionCaption(retained);
  if (entry["truncated"].toBool() || existing.value("truncated").toBool()) {
    entry["truncated"] = true;
    entry["previewNotice"] = "Additional output is omitted from this bounded display preview";
  }
}
qsizetype entrySize(const QVariant &value) {
  const auto entry = value.toMap();
  return entry["text"].toString().size() + QJsonDocument::fromVariant(entry["media"]).toJson(QJsonDocument::Compact).size();
}
bool terminal(const QString &status) {
  return status == "completed" || status == "finished" || status == "failed" || status == "cancelled";
}
}
RunOutputModel::RunOutputModel(QObject *parent, PcmQueue *queue)
  : QObject(parent), m_audioQueue(queue ? queue : PcmQueue::applicationQueue()), m_pcm(this, m_audioQueue), m_collections(this), m_richEntries(this) {}
RunOutputModel::~RunOutputModel() { resetAudio(); }
void RunOutputModel::setPcmSinkFactory(PcmStream::SinkFactory factory) {
  m_sinkFactory = std::move(factory);
  for (const auto &stream : m_streams) { if (stream) { stream->setSinkFactory(m_sinkFactory); } }
}
namespace {
QString streamKey(const QString &nodeId, const QString &outputName) {
  return QString::fromUtf8(QJsonDocument(QJsonArray{nodeId, outputName}).toJson(QJsonDocument::Compact));
}
}
QObject *RunOutputModel::pcmFor(QString nodeId, QString outputName) const {
  return m_streams.value(streamKey(nodeId, outputName));
}
PcmStream *RunOutputModel::streamFor(const QString &nodeId, const QString &outputName) {
  const auto key = streamKey(nodeId, outputName);
  if (const auto existing = m_streams.value(key)) { return existing; }
  if (m_streams.size() >= MaxPcmStreams) { return nullptr; }
  auto *stream = m_streams.isEmpty() ? &m_pcm : new PcmStream(this, m_audioQueue);
  stream->reset(QString::number(m_audioGeneration) + ':' + m_selected + ':' + key, m_liveNodes.contains(nodeId));
  if (m_sinkFactory) { stream->setSinkFactory(m_sinkFactory); }
  m_streams.insert(key, stream);
  return stream;
}
void RunOutputModel::resetAudio() {
  QList<PcmStream *> streams{&m_pcm};
  for (const auto &stream : m_streams) { if (stream && stream != &m_pcm) { streams.append(stream); } }
  if (m_audioQueue) { m_audioQueue->stopStreams(streams); }
  m_richEntries.setGroups(m_selected, {});
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  for (auto *stream : streams) { if (stream != &m_pcm) { delete stream; } }
  m_streams.clear(); ++m_audioGeneration; m_pcm.reset();
  for (auto &run : m_runs) {
    for (auto &value : run.entries) {
      auto entry = value.toMap(); entry.remove("pcmController");
      auto children = entry["children"].toList();
      for (auto &child : children) { auto output = child.toMap(); output.remove("pcmController"); child = output; }
      if (entry.contains("children")) { entry["children"] = children; }
      if (entry["renderer"] == "pcm") { entry["text"] = "Streaming audio is no longer retained"; }
      value = entry;
    }
  }
}
void RunOutputModel::publish() {
  QVariantList groups, richGroups;
  for (const auto &value : entries()) {
    const auto entry = value.toMap();
    const auto richKey = QJsonDocument::fromVariant(QVariantList{entry["kind"], entry["nodeId"], entry["outputName"], entry["rowKey"]}).toJson(QJsonDocument::Compact);
    richGroups.append(QVariantMap{{"key", QString::fromUtf8(richKey)}, {"entry", entry}});
    if (entry.value("items").toList().isEmpty()) { continue; }
    const auto key = QJsonDocument::fromVariant(QVariantList{entry["kind"], entry["nodeId"], entry["outputName"]}).toJson(QJsonDocument::Compact);
    groups.append(QVariantMap{{"key", m_selected + ':' + QString::fromUtf8(key)}, {"items", entry["items"]},
      {"title", (entry["nodeName"].toString().isEmpty() ? entry["nodeId"].toString() : entry["nodeName"].toString()) + " · " + entry["outputName"].toString()}, {"notice", entry["previewNotice"].toString()}});
  }
  m_collections.setGroups(m_selected, groups);
  m_richEntries.setGroups(m_selected, richGroups);
  emit changed();
}
QVariantList RunOutputModel::runs() const {
  QVariantList result;
  for (const auto &run : m_runs) {
    result.append(QVariantMap{{"jobId", run.id}, {"status", run.status},
                             {"terminal", run.terminal}, {"truncated", run.truncated}});
  }
  return result;
}
QString RunOutputModel::selectedRunId() const { return m_selected; }
QVariantList RunOutputModel::entries() const {
  for (const auto &run : m_runs) {
    if (run.id == m_selected) {
      return run.entries;
    }
  }
  return {};
}
void RunOutputModel::beginRun(QString jobId) {
  if (jobId.isEmpty() || jobId.size() > 1024) {
    return;
  }
  for (const auto &run : m_runs) {
    if (run.id == jobId) {
      selectRun(jobId);
      return;
    }
  }
  if (m_runs.size() == MaxRuns) {
    m_runs.removeFirst();
  }
  Run run;
  run.id = jobId;
  m_runs.append(run);
  m_selected = jobId;
  resetAudio();
  publish();
}
void RunOutputModel::selectRun(QString jobId) {
  if (m_selected == jobId) {
    return;
  }
  for (const auto &run : m_runs) {
    if (run.id == jobId) {
      m_selected = jobId;
      resetAudio();
      publish();
      return;
    }
  }
}
void RunOutputModel::reset() {
  resetAudio();
  m_runs.clear();
  m_selected.clear();
  publish();
}
void RunOutputModel::clear() {
  resetAudio();
  m_runs.removeIf([](const Run &run) { return run.terminal; });
  bool selectedRemains = false;
  for (auto &run : m_runs) {
    run.entries.clear();
    run.truncated = false;
    selectedRemains = selectedRemains || run.id == m_selected;
  }
  if (!selectedRemains) {
    m_selected = m_runs.isEmpty() ? QString() : m_runs.last().id;
  }
  publish();
}
void RunOutputModel::ingest(QString jobId, QJsonObject event) {
  auto found = std::find_if(m_runs.begin(), m_runs.end(), [&jobId](const Run &run) { return run.id == jobId; });
  if (found == m_runs.end() || event["job_id"].toString() != jobId) {
    return;
  }
  auto &run = *found;
  for (const auto &key : {"node_id", "node_name", "output_name", "status", "severity"}) {
    if (event[key].toString().size() > 1024) {
      return;
    }
  }
  const auto seq = event["job_seq"].toDouble();
  if (std::isfinite(seq) && seq > 0) {
    if (seq <= run.sequence) {
      return;
    }
    run.sequence = seq;
  }
  const auto type = event["type"].toString();
  const auto nodeId = event["node_id"].toString();
  QVariantMap entry{{"nodeId", nodeId}, {"nodeName", event["node_name"].toString()},
                    {"status", event["status"].toString()}, {"outputName", QString()},
                    {"text", QString()}, {"severity", QString()}, {"done", false}, {"truncated", false}};
  bool replace = false;
  if (type == "job_update" || type == "job_resumed") {
    const auto status = event["status"].toString();
    if (status.isEmpty() || (run.terminal && !terminal(status))) {
      return;
    }
    if (!run.terminal) {
      run.status = status;
      run.terminal = terminal(status);
    }
    if (jobId == m_selected) {
      QList<PcmStream *> streams;
      for (const auto &stream : m_streams) { if (stream) { streams.append(stream); } }
      if (status == "failed" || status == "cancelled") { resetAudio(); }
      else if (run.terminal) { for (auto *stream : streams) { stream->finish(); } }
    }
    entry["kind"] = "job";
    entry["status"] = run.status;
    entry["text"] = event["error"].toString(event["message"].toString());
    if (event["result"].isObject()) {
      entry["text"] = entry["text"].toString() + display(event["result"]);
    }
    replace = true;
  } else if (type == "node_update" && !nodeId.isEmpty()) {
    entry["kind"] = "status";
    entry["text"] = event["error"].toString();
    if (event["result"].isObject()) {
      entry["text"] = entry["text"].toString() + display(event["result"]);
    }
    replace = true;
  } else if (type == "output_update" && !nodeId.isEmpty() && event.contains("value")) {
    entry["kind"] = "output";
    entry["outputName"] = event["output_name"].toString();
    if (jobId == m_selected && event["disposition"] == "replace") {
      const auto key = streamKey(nodeId, entry["outputName"].toString());
      if (const auto stream = m_streams.value(key)) {
        stream->replace(QString::number(m_audioGeneration) + ':' + m_selected + ':' + key, m_liveNodes.contains(nodeId));
      }
    }
    const auto outputValue = event["value"];
    const auto outputObject = outputValue.toObject();
    bool audioValue = outputObject["type"] == "chunk" && outputObject["content_type"] == "audio";
    if (outputValue.isArray()) {
      for (const auto &part : outputValue.toArray()) {
        const auto chunk = part.toObject();
        if (chunk["type"] == "chunk" && chunk["content_type"] == "audio") { audioValue = true; break; }
      }
    }
    entry["text"] = audioValue ? QString("Streaming PCM audio") : display(outputValue);
    entry["done"] = event["done"].toBool();
    replace = true;
  } else if (type == "log_update" && event["content"].isString()) {
    entry["kind"] = "log";
    entry["text"] = event["content"].toString();
    entry["severity"] = event["severity"].toString();
  } else {
    return;
  }
  QVariantList media;
  int visited = 0;
  qsizetype mediaBytes = 0;
  bool previewTruncated = false;
  QJsonValue preview = type == "output_update" ? event["value"] : event["result"];
  const auto svg = type == "output_update" ? svgPreview(preview) : QJsonValue{};
  if (!svg.isUndefined() && !svg.isNull()) { preview = svg; }
  if (type == "output_update" || type == "node_update" || type == "job_update") { collectMedia(preview, media, visited, mediaBytes, previewTruncated); }
  if (!media.isEmpty()) {
    entry["items"] = collectionItems(preview, media, previewTruncated);
    entry["text"] = collectionCaption(entry["items"].toList());
  }
  if (previewTruncated) {
    entry["previewNotice"] = "Additional output is omitted from this bounded display preview";
    entry["truncated"] = true;
    run.truncated = true;
  }
  if (type == "output_update") {
    const auto value = event["value"];
    const auto object = value.toObject();
    const auto tag = object["type"].toString();
    QString renderer = "generic";
    if (value.isString() || tag == "text") { renderer = "text"; }
    else if (tag == "chunk" && object["content_type"] == "tool_call") {
      renderer = "tool_call";
      const auto meta = object["content_metadata"].toObject();
      entry["toolName"] = meta["tool_name"].toString(object["content"].toString().section('(', 0, 0));
      entry["toolId"] = meta["tool_call_id"].toString();
      entry["toolArgs"] = display(meta.contains("args") ? meta["args"] : QJsonValue(QJsonObject{})).left(MaxText);
      const auto args = meta["args"];
      QStringList keys;
      if (args.isObject()) { keys = args.toObject().keys(); }
      else if (args.isArray()) {
        for (qsizetype i = 0; i < args.toArray().size(); ++i) { keys.append(QString::number(i)); }
      }
      entry["toolSummary"] = args.isObject() || args.isArray()
        ? "(" + keys.mid(0, 3).join(", ") + (keys.size() > 3 ? ", +" + QString::number(keys.size() - 3) : QString{}) + ")" : QString{};
      if (args.isObject() || args.isArray()) {
        entry["toolArgs"] = QString::fromUtf8(args.isObject() ? QJsonDocument(args.toObject()).toJson(QJsonDocument::Indented) : QJsonDocument(args.toArray()).toJson(QJsonDocument::Indented)).left(MaxText);
      }
    }
    else if (tag == "dataframe") { renderer = "dataframe"; }
    else if (tag == "image_comparison") { renderer = "image_comparison"; entry["comparison"] = object.toVariantMap(); }
    else if (tag == "plotly_config") { renderer = "plotly"; }
    else if (value.isObject() && tag.isEmpty()) { renderer = "object"; }
    if (value.isBool() || (tag == "boolean" && object["value"].isBool())) {
      renderer = "text";
      entry["text"] = (value.isBool() ? value : object["value"]).toBool() ? QString("TRUE") : QString("FALSE");
    }
    else if (tag == "datetime") {
      renderer = "text";
      const QDateTime when(QDate(object["year"].toInt(), object["month"].toInt(), object["day"].toInt()),
        QTime(object["hour"].toInt(), object["minute"].toInt(), object["second"].toInt()));
      entry["text"] = when.isValid() ? when.toString("yyyy-MM-dd HH:mm:ss") : display(value);
    }
    else if (tag == "json") {
      renderer = "json";
      const auto data = object["data"];
      const auto parsed = data.isString() ? QJsonDocument::fromJson(data.toString().toUtf8()) : QJsonDocument{};
      const auto body = data.isObject() ? QJsonDocument(data.toObject()) : data.isArray() ? QJsonDocument(data.toArray()) : parsed;
      entry["text"] = body.isNull() ? (data.isString() ? data.toString() : display(data))
                                    : QString::fromUtf8(body.toJson(QJsonDocument::Indented)).left(MaxText);
    }
    else if (tag == "task") {
      renderer = "text";
      entry["text"] = taskMarkdown(object, QStringLiteral("###")).left(MaxText);
    }
    else if (tag == "task_plan") {
      // TaskPlanView.tsx: the plan title over each task.
      renderer = "text";
      QStringList tasks{"## " + object["title"].toString()};
      for (const auto &task : object["tasks"].toArray()) { tasks << taskMarkdown(task.toObject(), QStringLiteral("###")); }
      entry["text"] = tasks.join("\n\n").left(MaxText);
    }
    else if (tag == "calendar_event") {
      // CalendarEventView.tsx: title, time span, location, calendar and notes.
      renderer = "text";
      QStringList lines{"**" + object["title"].toString() + "**", datetimeText(object["start_date"]) + " - " + datetimeText(object["end_date"])};
      for (const auto key : {"location", "calendar"}) {
        if (!object[key].toString().isEmpty()) { lines << object[key].toString(); }
      }
      if (!object["notes"].toString().isEmpty()) { lines << object["notes"].toString(); }
      entry["text"] = lines.join("\n\n").left(MaxText);
    }
    else if (tag == "thread_message" || tag == "message") {
      renderer = "text";
      entry["text"] = messageMarkdown(object).left(MaxText);
    }
    else if (tag == "np_array") {
      // ArrayView.tsx: dtype, shape, then the values, cut after 100 entries.
      renderer = "json";
      const auto values = object["value"].toArray();
      QStringList shape;
      for (const auto &dimension : object["shape"].toArray()) { shape << QString::number(dimension.toInteger()); }
      const auto shown = values.size() > 100 ? QJsonArray::fromVariantList(values.toVariantList().mid(0, 100)) : values;
      const auto body = object["value"].isArray() ? QString::fromUtf8(QJsonDocument(shown).toJson(values.size() > 100 ? QJsonDocument::Compact : QJsonDocument::Indented)) + (values.size() > 100 ? QStringLiteral("...") : QString{})
                                                  : QStringLiteral("No data");
      entry["text"] = (QStringLiteral("Array (%1)\nShape: %2\n\n").arg(object["dtype"].toString(), shape.join(", ")) + body).left(MaxText);
    }
    else if (tag == "html") {
      // OutputRenderer's sandboxed iframe: the page as formatted text, or a link when only stored.
      renderer = "text";
      const auto data = object["data"].toString();
      const auto uri = object["uri"].toString();
      entry["text"] = !data.isEmpty() ? htmlMarkdown(data).left(MaxText)
                    : QRegularExpression(QStringLiteral("^https?://")).match(uri).hasMatch() ? QStringLiteral("[Open HTML output](%1)").arg(uri)
                    : QStringLiteral("HTML output");
    }
    else if (tag == "document" && QRegularExpression(QStringLiteral("^https?://")).match(object["uri"].toString()).hasMatch()) {
      // OutputRenderer: a stored document is a link to open it.
      renderer = "text";
      entry["text"] = QStringLiteral("[Open document](%1)").arg(object["uri"].toString());
    }
    else if (tag == "email") {
      renderer = "text";
      QStringList header{"From: " + object["sender"].toString(), "To: " + object["to"].toString()};
      if (!object["cc"].toString().isEmpty()) { header.append("Cc: " + object["cc"].toString()); }
      header.append("Subject: " + object["subject"].toString());
      entry["text"] = (header.join('\n') + "\n\n" + object["body"].toString()).left(MaxText);
    }
    if (value.isArray() && !value.toArray().isEmpty()) {
      const auto chunks = value.toArray();
      const bool textChunks = std::all_of(chunks.begin(), chunks.end(), [](const QJsonValue &part) {
        const auto chunk = part.toObject();
        const auto contentType = chunk["content_type"];
        return chunk["type"] == "chunk" && chunk["content"].isString()
          && (contentType.isUndefined() || contentType.isNull() || contentType == "" || contentType == "text");
      });
      if (textChunks) {
        renderer = "text";
        QString text;
        for (const auto &part : chunks) {
          const auto content = part.toObject()["content"].toString();
          text += content.left(std::max<qsizetype>(0, MaxText + 1 - text.size()));
          if (text.size() > MaxText) { break; }
        }
        entry["text"] = text;
      }
    }
    if (tag == "chunk" && object["content_type"] != "tool_call" && object["content_type"] != "audio") {
      renderer = "text"; entry["text"] = object["content"].toString().left(MaxText);
    }
    if (tag == "chunk" && object["content_type"] == "agent_status") {
      // AgentStatusRenderer.tsx: kind, severity and a label from the chunk metadata.
      renderer = "agent_status";
      const auto meta = object["content_metadata"].toObject();
      const auto kind = meta["kind"].toString(QStringLiteral("log"));
      entry["statusKind"] = QStringList{"planning", "task", "tool_call"}.contains(kind) ? kind : QStringLiteral("log");
      entry["statusSeverity"] = meta["severity"].toString(QStringLiteral("info"));
      const auto field = kind == "planning" ? "phase" : kind == "task" ? "event" : kind == "tool_call" ? "name" : "";
      const auto fallback = kind == "planning" ? QStringLiteral("planning") : kind == "task" ? QStringLiteral("task") : kind == "tool_call" ? QStringLiteral("tool") : QStringLiteral("log");
      entry["statusLabel"] = *field ? meta[field].toVariant().toString() : fallback;
      if (entry["statusLabel"].toString().isEmpty()) { entry["statusLabel"] = fallback; }
    }
    if (!svg.isUndefined() && !svg.isNull()) { renderer = "generic"; }
    else if (value.isArray() && renderer != "text") {
      int budget = 256;
      entry["children"] = renderTree(value, budget)["children"];
      renderer = "sequence";
    }
    QJsonArray audioChunks;
    if (tag == "chunk" && object["content_type"] == "audio") { audioChunks.append(object); }
    if (value.isArray()) {
      for (const auto &part : value.toArray()) {
        if (part.toObject()["type"] == "chunk" && part.toObject()["content_type"] == "audio") { audioChunks.append(part); }
      }
    }
    if (!audioChunks.isEmpty()) {
      if (!value.isArray() || audioChunks.size() == value.toArray().size()) { renderer = "pcm"; }
      if (jobId == m_selected && !run.terminal) {
        if (auto *stream = streamFor(nodeId, entry["outputName"].toString())) {
          const auto key = streamKey(nodeId, entry["outputName"].toString());
          const auto scope = QString::number(m_audioGeneration) + ':' + m_selected + ':' + key;
          for (const auto &part : audioChunks) { stream->append(scope, part.toObject()); }
          if (event["done"].toBool()) { stream->finish(); }
          stream->autoplay();
          entry["pcmController"] = QVariant::fromValue(static_cast<QObject *>(stream));
          auto children = entry["children"].toList();
          for (auto &child : children) {
            auto output = child.toMap();
            if (output["renderer"] == "pcm") { output["pcmController"] = entry["pcmController"]; child = output; }
          }
          entry["children"] = children;
        }
      }
      entry["text"] = "Streaming PCM audio";
    }
    entry["renderer"] = renderer;
    if (renderer == "text" && tag == "text") {
      if (!object.contains("text") && !object.contains("data") && !object.contains("value")) {
        entry["textUri"] = object["uri"].toString(); entry["text"] = "";
      }
      for (const auto key : {"text", "data", "value"}) {
        if (object[key].isString()) { entry["text"] = object[key].toString(); break; }
      }
    }
    if (renderer == "dataframe") {
      QVariantList columns, rows;
      for (const auto &column : object["columns"].toArray()) {
        columns.append(column.toObject()["name"].toString());
        if (columns.size() == 64) { break; }
      }
      const auto records = object["rows"].toArray();
      if (columns.isEmpty()) {
        for (const auto &record : records) {
          const auto fields = record.toObject();
          for (auto field = fields.begin(); field != fields.end(); ++field) {
            if (!columns.contains(field.key()) && columns.size() < 64) { columns.append(field.key()); }
          }
        }
      }
      const auto matrix = object["data"].toArray();
      const auto count = matrix.isEmpty() ? records.size() : matrix.size();
      for (qsizetype row = 0; row < std::min<qsizetype>(count, 1000); ++row) {
        QVariantList cells;
        const auto matrixRow = matrix.isEmpty() ? QJsonArray{} : matrix[row].toArray();
        const auto record = matrix.isEmpty() ? records[row].toObject() : QJsonObject{};
        for (qsizetype col = 0; col < columns.size(); ++col) {
          const auto cell = matrix.isEmpty() ? record[columns[col].toString()] : (col < matrixRow.size() ? matrixRow.at(col) : QJsonValue(QJsonValue::Null));
          cells.append(display(cell).left(4096));
        }
        rows.append(QVariantMap{{"cells", cells}});
      }
      entry["tableColumns"] = columns;
      entry["tableRows"] = rows;
      entry["tableNotice"] = QString("Read-only preview: %1 of %2 rows, up to 64 columns and 4096 characters per cell").arg(rows.size()).arg(count);
    }
    if (renderer == "object") {
      int budget = 256;
      const auto tree = renderTree(value, budget);
      entry["fields"] = tree["fields"];
      entry["objectNotice"] = tree["text"];

    }
  }
  entry["media"] = media;
  qsizetype index = -1;
  if (replace) {
    for (qsizetype i = 0; i < run.entries.size(); ++i) {
      const auto existing = run.entries[i].toMap();
      if (existing["kind"] == entry["kind"] && existing["nodeId"] == entry["nodeId"] && existing["outputName"] == entry["outputName"]) {
        index = i;
        if (type == "output_update" && event["disposition"] != "replace" && !existing.value("items").toList().isEmpty() && entry.value("items").toList().isEmpty()) {
          QVariantList parts;
          bool limited = false;
          collectionParts(preview, "$", {}, {}, parts, limited);
          entry["items"] = parts;
          if (limited) { entry["truncated"] = true; }
        }
        if (type == "output_update" && event["disposition"] != "replace" && !existing.value("items").toList().isEmpty() && !entry.value("items").toList().isEmpty()) {
          appendCollection(entry, existing);
          if (entry.value("truncated").toBool()) { run.truncated = true; }
        }
        if (type == "output_update" && event["disposition"] != "replace" && event["value"].isString() && existing.value("items").toList().isEmpty()) {
          entry["text"] = existing["text"].toString() + entry["text"].toString();
          entry["truncated"] = existing["truncated"];
          if (media.isEmpty()) { entry["media"] = existing["media"]; }
        }
        break;
      }
    }
  }
  auto text = entry["text"].toString();
  if (text.size() > MaxText) {
    entry["text"] = text.left(MaxText) + "\n[Output truncated]";
    entry["truncated"] = true;
    run.truncated = true;
  }
  auto pinned = [this, &run](const QVariant &value) {
    const auto candidate = value.toMap();
    if (run.id != m_selected || !candidate.contains("pcmController")) { return false; }
    const auto stream = m_streams.value(streamKey(candidate["nodeId"].toString(), candidate["outputName"].toString()));
    return stream && stream->playing();
  };
  auto removeHistory = [&run, &pinned]() -> std::optional<qsizetype> {
    // Prefer diagnostics over output previews, and retain the truncation notice.
    for (const bool diagnosticsOnly : {true, false}) {
      for (qsizetype i = 0; i < run.entries.size(); ++i) {
        const auto candidate = run.entries[i].toMap();
        if (candidate["kind"] == "notice" || pinned(run.entries[i])) { continue; }
        if (diagnosticsOnly && candidate["kind"] == "output") { continue; }
        const auto bytes = entrySize(run.entries[i]);
        run.entries.removeAt(i); return bytes;
      }
    }
    return std::nullopt;
  };
  if (index >= 0) {
    entry["rowKey"] = run.entries[index].toMap().value("rowKey");
    run.entries[index] = entry;
  } else {
    entry["rowKey"] = QString::number(++run.nextEntry);
    if (run.entries.size() >= MaxEntries) {
      removeHistory();
      run.truncated = true;
    }
    run.entries.append(entry);
  }
  qsizetype textSize = 0;
  for (const auto &value : run.entries) {
    textSize += entrySize(value);
  }
  const auto noticeText = QStringLiteral("Run output truncated to display limits");
  if (textSize > MaxRunText) { run.truncated = true; }
  const auto byteLimit = MaxRunText - (run.truncated && run.entries.first().toMap()["kind"] != "notice" ? noticeText.size() : 0);
  while (textSize > byteLimit && run.entries.size() > 1) {
    const auto removed = removeHistory();
    if (removed) { textSize -= *removed; }
    else {
      // A mixed media/PCM output can exceed preview bytes on its own. Keep
      // its controls while omitting the media preview at the existing bound.
      bool compacted = false;
      for (qsizetype i = 0; i < run.entries.size(); ++i) {
        const auto candidate = run.entries[i].toMap();
        if (!pinned(run.entries[i]) || candidate["media"].toList().isEmpty()) { continue; }
        QVariantMap compact;
        for (const auto key : {"kind", "nodeId", "nodeName", "outputName", "status", "severity", "done", "rowKey", "pcmController"}) {
          compact[key] = candidate.value(key);
        }
        compact["renderer"] = "pcm"; compact["text"] = "Streaming PCM audio"; compact["truncated"] = true;
        compact["media"] = QVariantList{};
        textSize -= entrySize(run.entries[i]) - entrySize(compact);
        run.entries[i] = compact; compacted = true; break;
      }
      if (!compacted) { break; }
    }
    run.truncated = true;
  }
  if (run.truncated) {
    if (run.entries.first().toMap()["kind"] != "notice") {
      if (run.entries.size() >= MaxEntries) { removeHistory(); }
      run.entries.prepend(QVariantMap{{"kind", "notice"}, {"text", noticeText}, {"truncated", true}});
    }
  }
  publish();
}
}
