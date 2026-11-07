#include "MessageModel.h"
#include "PlanDocument.h"
#include <QDateTime>
#include <QJsonDocument>
#include <QRegularExpression>
#include <QSet>
#include <QUrl>
#include <QUuid>
#include <algorithm>
#include <cmath>
namespace nt::chat {
namespace {
QString textOf(const QJsonValue &value) {
  if (value.isString()) {
    return value.toString();
  }
  QString text;
  for (const auto &part : value.toArray()) {
    const auto p = part.toObject();
    if (p["type"] == "text") {
      text += p["text"].toString();
    }
  }
  return text;
}
qsizetype contentLength(const QJsonValue &value) {
  if (value.isString()) { return value.toString().size(); }
  qsizetype length = 0;
  for (const auto &part : value.toArray()) {
    length += part.toObject()["type"] == "text" ? part.toObject()["text"].toString().size() : 1;
  }
  return length;
}
bool openThought(const QString &text) {
  const auto start = text.lastIndexOf("<think>");
  return start >= 0 && text.indexOf("</think>", start) < 0 &&
         text.indexOf("</redacted_thinking>", start) < 0;
}
const QRegularExpression &thoughtPattern() {
  static const QRegularExpression pattern("<think>([\\s\\S]*?)(</think>|</redacted_thinking>|$)");
  return pattern;
}
QString thoughtsOnly(const QString &text) {
  QString result;
  auto matches = thoughtPattern().globalMatch(text);
  while (matches.hasNext()) {
    const auto match = matches.next();
    result += "<think>" + match.captured(1) + "</think>";
  }
  return result;
}
QString displayJson(const QJsonValue &value) {
  if (value.isString()) {
    return value.toString();
  }
  if (value.isUndefined() || value.isNull()) {
    return {};
  }
  if (value.isObject()) {
    return QString::fromUtf8(
        QJsonDocument(value.toObject()).toJson(QJsonDocument::Indented));
  }
  if (value.isArray()) {
    return QString::fromUtf8(
        QJsonDocument(value.toArray()).toJson(QJsonDocument::Indented));
  }
  auto encoded =
      QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact);
  return QString::fromUtf8(encoded.mid(1, encoded.size() - 2));
}
QString formatToolName(QString name) {
  const auto match = QRegularExpression("^mcp__[^_]+(?:_[^_]+)*__(.+)$").match(name);
  if (match.hasMatch()) { name = match.captured(1); }
  name.remove(QRegularExpression("^(ui_|tool_)"));
  auto words = name.split('_');
  for (auto &word : words) {
    if (!word.isEmpty()) { word[0] = word[0].toUpper(); }
  }
  return words.join(' ');
}
QString toolKind(QString name) {
  name.replace(QRegularExpression("([a-z0-9])([A-Z])"), "\\1_\\2");
  const auto segments = name.toLower().split(QRegularExpression("[^a-z0-9]+"), Qt::SkipEmptyParts);
  const QList<QPair<QString, QStringList>> kinds{
    {"plan", {"plan"}}, {"search", {"search", "grep", "glob", "lookup", "query"}},
    {"page", {"browser", "crawl", "scrape", "fetch", "http", "url", "download", "visit"}},
    {"write", {"write", "edit", "save", "update", "create", "delete", "upload"}},
    {"read", {"read", "open", "cat", "list"}},
    {"run", {"run", "exec", "execute", "bash", "shell", "command", "script"}}};
  for (const auto &[kind, words] : kinds) {
    for (const auto &word : words) {
      if (segments.contains(word)) { return kind; }
    }
  }
  return "generic";
}
QString toolDetail(const QJsonObject &args, bool shortUrl = false) {
  for (const auto key : {"url", "uri", "path", "file", "filename", "target", "query", "q", "objective"}) {
    auto value = args[key].toString().trimmed();
    if (value.isEmpty()) { continue; }
    if (QString(key) == "url" || QString(key) == "uri") {
      const QUrl url(value);
      if (url.isValid() && !url.scheme().isEmpty()) {
        auto host = url.host();
        if (host.startsWith("www.")) { host.remove(0, 4); }
        return host + (shortUrl ? QString() :
          (url.path() == "/" ? QString() : url.path()) + (url.hasQuery() ? "?" + url.query() : QString()));
      }
    }
    return value;
  }
  return {};
}
QString countLabel(const QString &name, int count) {
  const auto kind = toolKind(name);
  if (kind == "plan") { return count == 1 ? "Wrote a plan" : QString("Wrote %1 plans").arg(count); }
  if (kind == "search") { return QString("Ran %1 %2").arg(count).arg(count == 1 ? "search" : "searches"); }
  if (kind == "page") { return QString("Opened %1 %2").arg(count).arg(count == 1 ? "page" : "pages"); }
  if (kind == "read") { return QString("Read %1 %2").arg(count).arg(count == 1 ? "item" : "items"); }
  if (kind == "write") { return QString("Made %1 %2").arg(count).arg(count == 1 ? "edit" : "edits"); }
  return (kind == "run" ? "Ran " : "") + formatToolName(name) + (count == 1 ? QString() : QString(" %1 times").arg(count));
}
bool groupable(const QString &name) {
  static const QSet<QString> separate{"execute_code", "run_subtask", "run_search", "ask_user", "request_secret", "create_plan"};
  return !name.isEmpty() && !separate.contains(name);
}
QString mergeableName(const QJsonObject &message) {
  if (message["role"] != "assistant") { return {}; }
  const auto content = message["content"];
  if (content.isString() && !content.toString().trimmed().isEmpty()) { return {}; }
  if (content.isObject() || content.isBool() || content.isDouble()) { return {}; }
  for (const auto &value : content.toArray()) {
    if (!value.isObject()) { continue; }
    const auto block = value.toObject();
    if (block["type"] != "text" || !block["text"].toString().trimmed().isEmpty()) { return {}; }
  }
  if (!message["parts"].toArray().isEmpty()) { return {}; }
  const auto calls = message["tool_calls"].toArray();
  if (calls.isEmpty()) { return {}; }
  const auto name = calls.first().toObject()["name"].toString();
  if (!groupable(name)) { return {}; }
  for (const auto &call : calls) {
    if (call.toObject()["name"] != name) { return {}; }
  }
  return name;
}
QString durationLabel(qint64 ms) {
  if (ms < 0) { return {}; }
  if (ms < 1000) { return QString::number(ms) + "ms"; }
  const auto seconds = std::round(ms / 100.0) / 10.0;
  if (seconds < 60) { return QString::number(seconds, 'f', seconds == std::floor(seconds) ? 0 : 1) + "s"; }
  const auto whole = qRound64(ms / 1000.0);
  return QString("%1m %2s").arg(whole / 60).arg(whole % 60, 2, 10, QLatin1Char('0'));
}
QJsonObject presentPart(QJsonObject part) {
  const auto type = part["type"].toString();
  if (type == "plan_approval_request" || type == "plan" || type == "plan_document" || part["name"] == "create_plan") {
    const QJsonValue input = type == "plan_approval_request" ? part["plan"]
        : part["name"] == "create_plan" ? part["result"] : part.contains("plan") ? part.value("plan") : part.contains("content") ? part.value("content") : QJsonValue(part);
    const auto plan = parsePlanDocument(input);
    if (!plan.isEmpty()) {
      part["planDocument"] = plan;
      part["planText"] = planDocumentText(plan);
      part["label"] = "Plan";
      part["text"] = QString();
      return part;
    }
    if (type == "plan_approval_request") {
      part["label"] = "Run this plan?";
      part["text"] = "Plan preview unavailable. You can reject this request.\n" + displayJson(input);
      return part;
    }
  }
  if (type == "tool_approval_request") {
    const auto category = part["category"].toString();
    part["label"] = category == "execute" ? "Run this action?" : category == "write" ? "Make this change?" : "Allow this action?";
    const auto description = part["description"].toString().trimmed();
    part["text"] = description.isEmpty() ? part["message"].toString() : description;
    auto args = part["args"].toObject();
    part["code"] = args["code"].toString();
    args.remove("code");
    part["argumentsText"] = part["args"].isObject() ? (args.isEmpty() ? QString() : displayJson(args)) : displayJson(part["args"]);
    part["collapsible"] = true;
    return part;
  }
  if (type == "secret_request") {
    const QUrl help(part["help_url"].toString());
    part["helpUrl"] = help.isValid() && help.scheme() == "https" && !help.host().isEmpty() ? help.toString() : QString();
    part["label"] = "Credential requested: " + part["key"].toString();
    part["text"] = part["reason"].toString() + "\n" + part["description"].toString() + "\nManage credentials in settings. Never enter a secret in chat.";
    return part;
  }
  if (type != "tool_call" && type != "tool_call_update" &&
      type != "tool_result_update") {
    if (!part.contains("text") && !part.contains("actionId")) {
      part["text"] = "Content details\n" + displayJson(part);
    }
    return part;
  }
  auto args = part.value("args");
  if (args.isString()) {
    const auto parsed = QJsonDocument::fromJson(args.toString().toUtf8());
    if (parsed.isObject()) {
      args = parsed.object();
    }
  }
  const auto name = part["name"].toString();
  const auto detail = toolDetail(args.toObject());
  const auto kind = toolKind(name);
  auto label = formatToolName(name);
  if (kind == "plan") label = detail.isEmpty() ? "Wrote a plan" : "Planned";
  else if (kind == "search") label = detail.isEmpty() ? "Ran 1 search" : "Searched";
  else if (kind == "page") label = detail.isEmpty() ? "Opened 1 page" : "Opened page";
  else if (kind == "write" && !detail.isEmpty()) label = "Edited";
  else if (kind == "read" && !detail.isEmpty()) label = "Read";
  part["label"] = label + (detail.isEmpty() ? QString() : " " + detail);
  part["tool"] = true;
  const auto result = part.value("result");
  const bool failed = part["is_error"].toBool() ||
                      result.toObject()["error"].isString() ||
                      result.toObject()["is_error"].toBool();
  part["displayStatus"] = failed                    ? "Failed"
                          : part.contains("result") ? "Done"
                                                    : "Running";
  const auto start = QDateTime::fromString(part["started_at"].toString(), Qt::ISODateWithMs);
  const auto end = QDateTime::fromString(part["result_created_at"].toString(), Qt::ISODateWithMs);
  if (part.contains("result") && start.isValid() && end.isValid()) {
    part["durationMs"] = start.msecsTo(end);
    part["duration"] = durationLabel(start.msecsTo(end));
  }
  part["args"] = args;
  part["argumentsText"] = displayJson(args);
  part["resultText"] = displayJson(result);
  if (name == "run_subtask" || name == "run_search") {
    part["subAgent"] = true;
    auto other = args.toObject();
    for (const auto key : {"description", "title", "query"}) {
      const auto title = other[key].toString().trimmed();
      if (!title.isEmpty()) { part["label"] = title; break; }
    }
    part["objective"] = other.value("prompt").toString(other.value("instructions").toString());
    for (const auto key : {"description", "title", "query", "prompt", "instructions"}) { other.remove(key); }
    part["argumentsText"] = other.isEmpty() ? QString() : displayJson(other);
  }
  if (name == "execute_code") {
    part["code"] = args.toObject()["code"];
    part["language"] = "javascript";
    if (!args.toObject()["title"].toString().isEmpty()) {
      part["label"] = args.toObject()["title"];
    }
    auto other = args.toObject();
    other.remove("code");
    other.remove("title");
    part["argumentsText"] = other.isEmpty() ? QString() : displayJson(other);
  }
  return part;
}
bool mediaOnly(const QJsonValue &value) {
  const auto blocks = value.toArray();
  return !blocks.isEmpty() && std::all_of(blocks.begin(), blocks.end(), [](const QJsonValue &block) {
    const auto type = block.toObject()["type"].toString();
    return type == "image_url" || type == "video" || type == "audio";
  });
}
QJsonObject mediaPresentation(QJsonObject part) {
  const auto type = part["type"].toString();
  if (type == "image_url" || type == "image" || type == "video" || type == "audio") {
    const auto kind = type.startsWith("image") ? QString("image") : type;
    const auto ref = part[kind].toObject();
    part["media"] = true;
    part["locator"] = ref;
    part["label"] = ref["name"].toString(kind == "image" ? "Image" : kind == "audio" ? "Audio" : "Video");
    if (ref["duration"].isDouble()) { part["duration"] = QString("%1 s").arg(ref["duration"].toDouble()); }
    part["text"] = part["mediaError"].toString(kind == "image" ? "Loading image preview…" : "Open in your system media viewer.");
  } else if (type == "document") {
    const auto doc = part["document"].toObject();
    part["label"] = doc["name"].toString("Document");
    part["text"] = doc["text"].toString(doc["content"].toString("Document attached"));
  } else if (type == "resource") {
    const QUrl uri(part["uri"].toString());
    const QSet<QString> kinds{"asset", "workflow", "app", "sketch", "timeline", "model3d", "game", "storyboard", "thread", "script", "jsscript", "collection"};
    if (kinds.contains(uri.scheme()) && !uri.host().isEmpty()) {
      part["resourceKind"] = uri.scheme();
      part["label"] = uri.scheme() + " · " + part["label"].toString(uri.host());
      part["text"] = QString();
    }
  } else if (type == "prediction") {
    part["label"] = "Generation · " + part["model"].toString(part["provider"].toString());
    QStringList fields;
    for (const auto key : {"status", "provider_status", "output_status", "attachment_status", "progress", "cost", "error"}) {
      if (!part[key].isNull() && !part[key].isUndefined()) { fields << QString(key) + ": " + displayJson(part[key]); }
    }
    part["text"] = fields.join(" · ");
    part.remove("progress");
    part.remove("status");
  }
  return part;
}
QJsonArray projectedParts(const QJsonObject &m, const QHash<QString, QJsonObject> &results, const QList<qsizetype> &offsets) {
  QJsonArray parts;
  if (m["execution_event_type"] == "compaction") {
    QString summary;
    if (m["content"].isString()) { summary = m["content"].toString(); }
    else {
      for (const auto &value : m["content"].toArray()) {
        const auto block = value.toObject();
        if (block["type"] == "text") { summary += block["text"].toString(); }
      }
    }
    summary = summary.trimmed();
    const QString header = "[Conversation so far]";
    if (summary.startsWith(header)) { summary = summary.mid(header.size()).trimmed(); }
    return {QJsonObject{{"type", "compaction"}, {"label", "Earlier conversation summarized"},
                        {"collapsible", true}, {"text", summary.isEmpty() ? "No summary available." : summary}}};
  }
  const auto contentPlan = parsePlanDocument(m["content"]);
  if (!contentPlan.isEmpty()) {
    return {QJsonObject{{"type", "plan_document"}, {"label", "Plan"},
                        {"planDocument", contentPlan}, {"planText", planDocumentText(contentPlan)}}};
  }
  const auto nativeParts = m["parts"].toArray();
  int thoughtIndex = 0;
  auto appendText = [&](const QString &body) {
    auto thoughts = thoughtPattern().globalMatch(body);
    qsizetype cursor = 0;
    while (thoughts.hasNext()) {
      const auto match = thoughts.next();
      if (match.capturedStart() > cursor) {
        parts.append(QJsonObject{{"type", "prose"}, {"text", body.mid(cursor, match.capturedStart() - cursor)}});
      }
      const bool running = match.captured(2).isEmpty() && m["status"] == "streaming";
      parts.append(QJsonObject{{"type", "thought"}, {"thoughtKey", QString::number(thoughtIndex++)},
                              {"text", match.captured(1)}, {"running", running}});
      cursor = match.capturedEnd();
    }
    if (cursor < body.size()) { parts.append(QJsonObject{{"type", "prose"}, {"text", body.mid(cursor)}}); }
  };
  if (m["content"].isArray()) {
    qsizetype textOffset = 0;
    int nativeIndex = 0;
    const auto totalLength = contentLength(m["content"]);
    auto appendNativeThrough = [&](qsizetype end, const QString &body) {
      qsizetype cursor = 0;
      while (nativeIndex < nativeParts.size()) {
        const auto part = nativeParts[nativeIndex].toObject();
        if (part["type"] == "image" || part["resolvedMedia"].toBool()) { ++nativeIndex; continue; }
        const auto offset = offsets.value(nativeIndex, totalLength);
        if (offset > end) { break; }
        const auto local = std::clamp<qsizetype>(offset - textOffset, cursor, body.size());
        appendText(body.mid(cursor, local - cursor));
        parts.append(part);
        cursor = local;
        ++nativeIndex;
      }
      appendText(body.mid(cursor));
      textOffset = end;
    };
    for (const auto &value : m["content"].toArray()) {
      const auto part = value.toObject();
      if (part["type"] == "text") {
        const auto body = part["text"].toString();
        appendNativeThrough(textOffset + body.size(), body);
      } else {
        auto displayed = value;
        for (const auto &preview : nativeParts) {
          if (preview.toObject()["originalMedia"] == value || (part["type"] == "image_url" && preview.toObject()["type"] == "image" && preview.toObject()["image"] == part["image"])) {
            displayed = preview;
            break;
          }
        }
        parts.append(displayed);
        ++textOffset;
      }
    }
    appendNativeThrough(textOffset, {});
  } else {
    const auto body = textOf(m["content"]);
    qsizetype cursor = 0;
    int nativeIndex = 0;
    for (const auto &value : nativeParts) {
      const auto offset = std::clamp<qsizetype>(offsets.value(nativeIndex++, body.size()), cursor, body.size());
      appendText(body.mid(cursor, offset - cursor));
      parts.append(value);
      cursor = offset;
    }
    if (!nativeParts.isEmpty() || body.contains("<think>")) { appendText(body.mid(cursor)); }
  }
  bool hasToolCalls = false;
  for (const auto &value : m["tool_calls"].toArray()) {
    const auto call = value.toObject();
    const auto function = call["function"].toObject();
    const auto name = function["name"].toString(call["name"].toString());
    if (name.isEmpty()) {
      continue;
    }
    hasToolCalls = true;
    const auto args =
        function.contains("arguments") ? function["arguments"] : call["args"];
    const auto argsText =
        args.isString()
            ? args.toString()
            : QString::fromUtf8(QJsonDocument(QJsonArray{args})
                                    .toJson(QJsonDocument::Compact));
    auto projected = call;
    projected.insert("type", "tool_call");
    projected.insert("args", args);
    projected.insert("name", name);
    projected.insert("tool_call_id",
                     call["id"].toString(call["tool_call_id"].toString()));
    projected.insert("payload", call);
    projected.insert("started_at", m["created_at"]);
    projected.insert("text", name + "\n" + argsText);
    parts.append(projected);
  }
  if (!m["content"].isArray() && !m["content"].isString() &&
             !(hasToolCalls &&
               (m["content"].isNull() || m["content"].isUndefined()))) {
    const auto content = m["content"];
    const auto encoded =
        content.isObject()
            ? QString::fromUtf8(QJsonDocument(content.toObject())
                                    .toJson(QJsonDocument::Compact))
            : QString("null");
    parts.append(
        QJsonObject{{"type", "unsupported"},
                    {"text", "Unsupported message content: " + encoded}});
  }
  QJsonArray displayed;
  for (const auto &value : parts) {
    auto part = value.isObject() ? value.toObject() : QJsonObject{{"type", "unsupported"}, {"text", displayJson(value)}, {"payload", value}};
    const auto id = part.value("tool_call_id").toString(part.value("id").toString());
    if (results.contains(id)) {
      const auto result = results.value(id);
      for (auto it = result.begin(); it != result.end(); ++it) { part[it.key()] = it.value(); }
    }
    if (!part.contains("started_at")) { part["started_at"] = m["created_at"]; }
    displayed.append(mediaPresentation(presentPart(part)));
  }
  QJsonArray grouped;
  const auto generation = m["media_generation"].toObject();
  if (mediaOnly(m["content"]) || !generation.isEmpty()) {
    QStringList metadata;
    const QList<QPair<QString, QString>> labels{{"model", "Model"}, {"resolution", "Resolution"},
      {"aspect_ratio", "Aspect ratio"}, {"variations", "Variations"}, {"duration", "Duration (s)"},
      {"strength", "Strength"}, {"num_inference_steps", "Steps"}, {"voice", "Voice"}, {"speed", "Speed"}};
    for (const auto &[key, label] : labels) {
      if (generation.contains(key) && !generation[key].isNull()) { metadata << label + ": " + displayJson(generation[key]); }
    }
    if (!mediaOnly(m["content"])) { metadata.prepend("Generating media…"); }
    grouped.append(QJsonObject{{"type", "media_group"}, {"label", "Generated media"},
      {"text", metadata.join(" · ")}, {"count", m["content"].toArray().size()}});
  }
  const QSet<QString> separate{"execute_code", "run_subtask",    "run_search",
                               "ask_user",     "request_secret", "create_plan"};
  for (qsizetype first = 0; first < displayed.size();) {
    auto group = displayed[first].toObject();
    const auto name = group.value("name").toString();
    qsizetype end = first + 1;
    if (group.value("tool").toBool() && !name.isEmpty() &&
        !separate.contains(name)) {
      while (end < displayed.size() &&
             displayed[end].toObject()["tool"].toBool() &&
             displayed[end].toObject()["name"] == name) {
        ++end;
      }
    }
    if (end - first > 1) {
      QJsonArray calls;
      QStringList preview;
      QSet<QString> seen;
      QString status = "Done";
      QString shared = group["message"].toString().trimmed();
      bool sameMessage = !shared.isEmpty();
      const auto kind = toolKind(name);
      bool listed = end - first <= 4 && (kind == "page" || kind == "read" || kind == "write");
      int completed = 0;
      qint64 duration = -1;
      for (auto i = first; i < end; ++i) {
        const auto item = displayed[i].toObject();
        calls.append(item);
        sameMessage = sameMessage && item["message"].toString().trimmed() == shared;
        const auto args = item["args"].toObject();
        bool location = false;
        for (const auto key : {"url", "uri", "path", "file", "filename"}) {
          location = location || !args[key].toString().trimmed().isEmpty();
        }
        listed = listed && location;
        const auto value = toolDetail(args, true);
        if (!value.isEmpty() && !seen.contains(value)) { preview.append(value); seen.insert(value); }
        if (item.contains("result")) { ++completed; }
        if (item.contains("durationMs")) { duration = std::max(duration, item["durationMs"].toInteger()); }
        if (item["displayStatus"] == "Failed") { status = "Failed"; }
        else if (status != "Failed" && item["displayStatus"] == "Running") { status = "Running"; }
      }
      if (listed) {
        for (const auto &call : calls) { grouped.append(call); }
        first = end;
        continue;
      }
      const auto headline = sameMessage ? shared : countLabel(name, calls.size());
      if (preview.size() == 1 && headline.contains(preview.first())) { preview.clear(); }
      group["label"] = headline;
      group["preview"] = preview.mid(0, 3).join(" · ") + (preview.size() > 3 ? QString(" +%1").arg(preview.size() - 3) : QString());
      group["count"] = calls.size();
      group["duration"] = completed == calls.size() ? durationLabel(duration) : QString();
      group["progress"] = completed < calls.size() ? QString("%1/%2").arg(completed).arg(calls.size()) : QString();
      group["calls"] = calls;
      group["displayStatus"] = status;
      group["argumentsText"] = QString();
      group["resultText"] = QString();
      group["grouped"] = true;
    }
    grouped.append(group);
    first = end;
  }
  return grouped;
}
} // namespace
int PartModel::rowCount(const QModelIndex &parent) const {
  return parent.isValid() ? 0 : m_parts.size();
}
QVariant PartModel::data(const QModelIndex &index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= m_parts.size() ||
      role != ModelDataRole) {
    return {};
  }
  const auto part = m_parts[index.row()];
  if (part.isObject()) {
    auto data = part.toObject().toVariantMap();
    data["feedback"] = m_feedback.value(data.value("actionId").toString());
    if (data.value("type") == "thought") {
      const auto key = data.value("thoughtKey").toString();
      const bool running = data.value("running").toBool();
      data["expanded"] = m_thoughtExpanded.value(key, running);
      data["label"] = running ? QString("Thinking") : m_thoughtDurations.contains(key)
          ? QString("Thought for %1s").arg(std::max<qint64>(1, qRound64(m_thoughtDurations[key] / 1000.0)))
          : QString("Thought");
    }
    if (data.value("tool").toBool() || data.value("collapsible").toBool()) {
      data["expanded"] = m_expanded.contains(expansionKey(index.row()));
      auto calls = data.value("calls").toList();
      for (auto &value : calls) {
        auto call = value.toMap();
        call["expanded"] = m_expanded.contains("call:" + call["tool_call_id"].toString());
        value = call;
      }
      data["calls"] = calls;
    }
    const auto childKey = data.value("childKey", data.value("tool_call_id")).toString();
    if (m_children.contains(childKey)) {
      data["childModel"] = QVariant::fromValue(m_children.value(childKey));
      data["transcriptCount"] = m_counts.value(childKey);
    }
    if (data.value("tree").toBool()) {
      data["expanded"] = m_treeExpanded.value(childKey, data.value("defaultExpanded").toBool());
    }
    return data;
  }
  return QVariantMap{
      {"type", "unsupported"},
      {"text",
       QString::fromUtf8(
           QJsonDocument(QJsonArray{part}).toJson(QJsonDocument::Compact))}};
}
QHash<int, QByteArray> PartModel::roleNames() const {
  return {{ModelDataRole, "modelData"}};
}
QString PartModel::expansionKey(int row) const {
  const auto part = m_parts[row].toObject();
  const auto call = part["tool_call_id"].toString();
  return (part["grouped"].toBool() ? "group:" : "call:") +
         (call.isEmpty() ? QString::number(row) : call);
}
void PartModel::setFeedback(int row, const QString &text) {
  if (row < 0 || row >= m_parts.size()) { return; }
  const auto id = m_parts[row].toObject()["actionId"].toString();
  if (id.isEmpty() || m_feedback.value(id) == text) { return; }
  m_feedback[id] = text;
  emit dataChanged(index(row), index(row), {ModelDataRole});
}
void PartModel::toggleExpanded(int row) {
  if (row < 0 || row >= m_parts.size()) {
    return;
  }
  if (m_parts[row].toObject()["type"] == "thought") {
    const auto part = m_parts[row].toObject();
    const auto key = part["thoughtKey"].toString();
    m_thoughtExpanded[key] = !m_thoughtExpanded.value(key, part["running"].toBool());
    emit dataChanged(index(row), index(row), {ModelDataRole});
    return;
  }
  const auto part = m_parts[row].toObject();
  if (part["tree"].toBool()) {
    const auto key = part["childKey"].toString();
    m_treeExpanded[key] = !m_treeExpanded.value(key, part["defaultExpanded"].toBool());
    emit dataChanged(index(row), index(row), {ModelDataRole});
    return;
  }
  const auto key = expansionKey(row);
  if (!m_expanded.remove(key)) {
    m_expanded.insert(key);
  }
  emit dataChanged(index(row), index(row), {ModelDataRole});
}
void PartModel::toggleCall(int row, const QString &id) {
  if (row < 0 || row >= m_parts.size()) { return; }
  const auto key = "call:" + id;
  if (!m_expanded.remove(key)) { m_expanded.insert(key); }
  emit dataChanged(index(row), index(row), {ModelDataRole});
}
void PartModel::setChild(const QString &key, QAbstractItemModel *model, int count) {
  const bool changed = m_children.value(key) != model || m_counts.value(key, -1) != count;
  m_children[key] = model;
  m_counts[key] = count;
  if (!changed) { return; }
  for (int row = 0; row < m_parts.size(); ++row) {
    const auto part = m_parts[row].toObject();
    if (part["childKey"].toString(part["tool_call_id"].toString()) == key) {
      emit dataChanged(index(row), index(row), {ModelDataRole});
    }
  }
}
void PartModel::setParts(const QJsonArray &parts) {
  for (const auto &value : parts) {
    const auto part = value.toObject();
    if (part["type"] != "thought") { continue; }
    const auto key = part["thoughtKey"].toString();
    const auto now = QDateTime::currentMSecsSinceEpoch();
    if (part["running"].toBool() && !m_thoughtStarts.contains(key)) {
      m_thoughtStarts[key] = now;
    } else if (!part["running"].toBool() && m_thoughtStarts.contains(key) && !m_thoughtDurations.contains(key)) {
      m_thoughtDurations[key] = now - m_thoughtStarts[key];
    }
  }
  const auto shared = std::min(m_parts.size(), parts.size());
  for (qsizetype i = 0; i < shared; ++i) {
    if (m_parts[i] != parts[i]) {
      m_parts[i] = parts[i];
      emit dataChanged(index(i), index(i), {ModelDataRole});
    }
  }
  if (parts.size() < m_parts.size()) {
    beginRemoveRows({}, parts.size(), m_parts.size() - 1);
    while (m_parts.size() > parts.size()) {
      m_parts.removeLast();
    }
    endRemoveRows();
  } else if (parts.size() > m_parts.size()) {
    const auto first = m_parts.size();
    beginInsertRows({}, first, parts.size() - 1);
    for (auto i = first; i < parts.size(); ++i) {
      m_parts.append(parts[i]);
    }
    endInsertRows();
  }
}
void MessageModel::refreshParts(int row) {
  const auto key = m_projectionKeys[row];
  if (auto *model = m_partModels.value(key, nullptr)) {
    model->setParts(projectedParts(m_rows[row], m_results, m_partOffsets.value(key)));
    attachChildren(model);
  }
}
void MessageModel::releaseParts(const QString &key) {
  m_partOffsets.remove(key);
  if (auto *model = m_partModels.take(key)) {
    model->deleteLater();
  }
}
int MessageModel::rowCount(const QModelIndex &p) const {
  return p.isValid() ? 0 : static_cast<int>(m_rows.size());
}
QHash<int, QByteArray> MessageModel::roleNames() const {
  return {{MessageIdRole, "messageId"}, {RoleRole, "role"},
          {TextRole, "text"},           {TimestampRole, "timestamp"},
          {PartsRole, "parts"},         {StatusRole, "status"}, {DisplayTextRole, "displayText"}};
}
QVariant MessageModel::data(const QModelIndex &i, int role) const {
  if (!i.isValid() || i.row() < 0 || i.row() >= m_rows.size()) {
    return {};
  }
  const auto &m = m_rows[i.row()];
  switch (role) {
  case MessageIdRole:
    return m["id"].toString();
  case RoleRole:
    return m["role"].toString();
  case TextRole:
    return textOf(m["content"]);
  case DisplayTextRole:
    return m["execution_event_type"] == "compaction" || !parsePlanDocument(m["content"]).isEmpty() || m["content"].isArray() || !m["parts"].toArray().isEmpty() || textOf(m["content"]).contains("<think>") ? QString() : textOf(m["content"]);
  case TimestampRole:
    return m["created_at"].toString();
  case PartsRole: {
    const auto key = m_projectionKeys[i.row()];
    auto *parts = m_partModels.value(key, nullptr);
    if (!parts) {
      parts = new PartModel(const_cast<MessageModel *>(this));
      m_partModels[key] = parts;
      parts->setParts(projectedParts(m, m_results, m_partOffsets.value(key)));
      attachChildren(parts);
    }
    return QVariant::fromValue(static_cast<QAbstractItemModel *>(parts));
  }
  case StatusRole:
    return m["status"].toString();
  default:
    return {};
  }
}
void MessageModel::attachChildren(PartModel *parts) const {
  for (auto it = m_children.cbegin(); it != m_children.cend(); ++it) {
    parts->setChild(it.key(), it.value(), m_childCounts.value(it.key()));
  }
}
MessageModel *MessageModel::child(const QString &key) {
  if (!m_children.contains(key)) {
    auto *model = new MessageModel(this);
    m_children[key] = model;
    for (auto *parts : m_partModels) { parts->setChild(key, model, 0); }
  }
  return m_children[key];
}
void MessageModel::treeRow(const QString &id, const QString &label, const QString &status,
                           const QString &body, bool expanded) {
  upsert({{"id", id}, {"role", "execution"}, {"nativeTree", true}, {"content", ""},
    {"parts", QJsonArray{QJsonObject{{"type", "execution"}, {"tree", true}, {"childKey", id},
      {"label", label}, {"displayStatus", status}, {"text", body}, {"defaultExpanded", expanded}}}}});
}
bool MessageModel::reduceNested(const QJsonObject &event) {
  const auto parent = event["parent_tool_call_id"].toString();
  if (!parent.isEmpty()) {
    auto *transcript = child(parent);
    auto message = event;
    message.remove("parent_tool_call_id");
    const auto type = message["type"].toString();
    bool addsMessage = false;
    if (type == "chunk") {
      if (!message["content"].toString().isEmpty()) {
        const bool continues = !transcript->m_rows.isEmpty() &&
          transcript->m_rows.last()["role"] == "assistant" &&
          !transcript->m_rows.last().contains("tool_calls");
        if (continues) { transcript->m_rows.last()["status"] = "streaming"; }
        transcript->appendChunk(message["content"].toString(), false);
        addsMessage = !continues;
      }
    } else if (type == "tool_call_update") {
      // The server emits the transcript card as a separate assistant message.
    } else if (type == "tool_result_update") {
      transcript->addPart(message);
    } else {
      bool finalizes = false;
      if (!transcript->m_rows.isEmpty()) {
        const auto &last = transcript->m_rows.last();
        auto previousText = textOf(last["content"]);
        while (!previousText.isEmpty() && previousText.back().isSpace()) { previousText.chop(1); }
        finalizes = message["role"] == "assistant" && last["role"] == "assistant" &&
          !previousText.isEmpty() && textOf(message["content"]).startsWith(previousText);
        if (finalizes) { message["id"] = last["id"]; }
        // Only prefix-matching final messages replace a streamed child row.
        transcript->m_rows.last().remove("temporary");
      }
      transcript->upsert(message);
      addsMessage = message["role"] != "tool" && !finalizes;
    }
    if (addsMessage) { ++m_childCounts[parent]; }
    m_nestedEvents.append(event);
    for (auto *parts : m_partModels) { parts->setChild(parent, transcript, m_childCounts.value(parent)); }
    return true;
  }
  auto payload = event;
  if (event["role"] == "agent_execution") {
    QJsonValue content = event["content"];
    for (int i = 0; i < 2 && content.isString(); ++i) {
      const auto parsed = QJsonDocument::fromJson(("[" + content.toString() + "]").toUtf8());
      if (!parsed.isArray() || parsed.array().isEmpty()) { break; }
      content = parsed.array().first();
    }
    payload = content.toObject();
    if (event.contains("execution_event_type")) { payload["type"] = event["execution_event_type"]; }
  }
  const auto type = payload["type"].toString();
  if (type != "planning_update" && type != "task_update" && type != "log_update" &&
      !((event["role"] == "agent_execution" || !event["agent_execution_id"].toString().isEmpty()) &&
        (type == "step_result" || type == "tool_call_update" || type == "tool_result_update"))) { return false; }
  const auto eventId = event["id"].toString();
  if (!eventId.isEmpty() && m_eventIds.contains(eventId)) { return true; }
  if (!eventId.isEmpty()) { m_eventIds.insert(eventId); }
  m_nestedEvents.append(event);
  const auto execution = event["agent_execution_id"].toString(payload["agent_execution_id"].toString("execution"));
  const auto key = "execution:" + execution;
  auto *run = child(key);
  if (!m_indices.contains(key)) { treeRow(key, "Agent execution", "", {}, true); }
  if (type == "planning_update") {
    run->treeRow("planning", "Planning · " + payload["phase"].toString(), payload["status"].toString(),
                 payload["content"].toString(), true);
  } else if (type == "log_update") {
    const auto logId = "log:" + QString::number(run->m_nestedEvents.size());
    run->m_nestedEvents.append(payload);
    run->treeRow(logId, payload["severity"].toString("info") + " · " + payload["node_id"].toString(),
                 "", displayJson(payload["content"]));
  } else if (type == "task_update") {
    const auto task = payload["task"].toObject();
    const auto taskId = task["id"].toString();
    const auto action = payload["event"].toString();
    if (action == "task_created") {
      if (run->m_indices.contains(taskId)) { return true; }
      auto *steps = run->child(taskId);
      run->treeRow(taskId, task["title"].toString(taskId), "running", {}, true);
      for (const auto &value : task["steps"].toArray()) {
        const auto step = value.toObject();
        const auto stepId = step["id"].toString();
        steps->treeRow(stepId, step["instructions"].toString(stepId).left(80), "waiting", step["instructions"].toString());
        run->m_stepTasks.insert(stepId, taskId);
      }
    } else if (run->m_indices.contains(taskId)) {
      auto *steps = run->child(taskId);
      const auto step = payload["step"].toObject();
      const auto stepId = step["id"].toString();
      if (action.startsWith("step_") && !stepId.isEmpty()) {
        const auto old = steps->m_indices.value(stepId, -1);
        const auto previous = old >= 0 ? steps->m_rows[old]["parts"].toArray().first().toObject() : QJsonObject{};
        steps->treeRow(stepId, previous["label"].toString(step["instructions"].toString(stepId)).left(80),
          action == "step_started" ? "running" : action == "step_failed" ? "failed" : "completed",
          previous["text"].toString(step["instructions"].toString()));
        run->m_stepTasks.insert(stepId, taskId);
      } else if (action == "task_completed" || action == "task_failed") {
        const auto row = run->m_rows[run->m_indices[taskId]]["parts"].toArray().first().toObject();
        run->treeRow(taskId, row["label"].toString(), action == "task_failed" ? "failed" : "completed");
      }
    }
  } else {
    const auto stepId = type == "step_result" ? payload["step"].toObject()["id"].toString()
      : type == "tool_result_update" ? run->m_callSteps.value(payload["tool_call_id"].toString())
      : payload.value("node_id").toString(payload.value("step_id").toString());
    if (run->m_stepTasks.contains(stepId)) {
      auto *steps = run->child(run->m_stepTasks[stepId]);
      if (type == "tool_call_update" || type == "tool_result_update") {
        run->m_callSteps[payload["tool_call_id"].toString()] = stepId;
        steps->child(stepId)->addPart(payload);
      }
      else {
        const auto previous = steps->m_rows[steps->m_indices[stepId]]["parts"].toArray().first().toObject();
        steps->treeRow(stepId, previous["label"].toString(), payload["error"].isNull() || !payload.contains("error") ? "completed" : "failed",
          previous["text"].toString() + "\n" + displayJson(payload["result"]) + displayJson(payload["error"]));
      }
    }
  }
  return true;
}
int MessageModel::callOwner(const QString &id) const {
  if (id.isEmpty()) { return -1; }
  for (int row = m_rows.size() - 1; row >= 0; --row) {
    for (const auto key : {"tool_calls", "parts", "content"}) {
      for (const auto &value : m_rows[row][key].toArray()) {
        const auto call = value.toObject();
        if (call["tool_call_id"] == id || call["id"] == id) { return row; }
      }
    }
  }
  return -1;
}
QString MessageModel::upsert(const QJsonObject &message) {
  if (reduceNested(message)) { return message["id"].toString(); }
  const auto id = message["id"].toString();
  if (message["role"] == "tool") {
    const auto call = message["tool_call_id"].toString();
    const auto owner = callOwner(call);
    if (!call.isEmpty()) {
      auto result = message["content"];
      if (result.isString()) {
        QJsonParseError error;
        const auto parsed = QJsonDocument::fromJson(result.toString().toUtf8(), &error);
        if (error.error == QJsonParseError::NoError) {
          if (parsed.isObject()) { result = parsed.object(); }
          else if (parsed.isArray()) { result = parsed.array(); }
        }
      }
      m_results[call] = {{"result", result}, {"is_error", message["is_error"]},
                         {"result_created_at", message["created_at"]}};
      m_resultMessages[id.isEmpty() ? call : id] = message;
      if (owner >= 0) {
        refreshParts(owner);
        emit dataChanged(index(owner), index(owner), {PartsRole, DisplayTextRole});
        return m_projectionKeys[owner];
      }
      return id;
    }
  }
  const auto key =
      id.isEmpty() ? "projection:" + QUuid::createUuid().toString(QUuid::Id128)
                   : id;
  const auto mergeName = mergeableName(message);
  if (!m_indices.contains(id) && !mergeName.isEmpty() && !m_rows.isEmpty() &&
      mergeableName(m_rows.last()) == mergeName) {
    const int row = m_rows.size() - 1;
    const auto owner = m_projectionKeys[row];
    if (!m_groupSources.contains(owner)) { m_groupSources[owner] = {m_rows[row]}; }
    m_groupSources[owner].append(message);
    auto calls = m_rows[row]["tool_calls"].toArray();
    for (const auto &call : message["tool_calls"].toArray()) { calls.append(call); }
    m_rows[row]["tool_calls"] = calls;
    m_indices[key] = row;
    refreshParts(row);
    emit dataChanged(index(row), index(row), {PartsRole, DisplayTextRole});
    return owner;
  }
  if (!id.isEmpty() && m_indices.contains(id)) {
    const auto i = m_indices.value(id);
    const auto owner = m_projectionKeys[i];
    if (m_groupSources.contains(owner)) {
      auto &sources = m_groupSources[owner];
      QJsonArray calls;
      for (auto &source : sources) {
        if (source["id"] == id) { source = message; }
        for (const auto &call : source["tool_calls"].toArray()) { calls.append(call); }
      }
      m_rows[i] = sources.first();
      m_rows[i]["tool_calls"] = calls;
    } else {
      m_rows[i] = message;
    }
    refreshParts(i);
    emit dataChanged(index(i), index(i));
    return id;
  }
  if (!message["temporary"].toBool() && message["role"] == "assistant" &&
      !m_rows.isEmpty() && m_rows.last()["temporary"].toBool()) {
    const auto i = rowCount() - 1;
    const auto oldKey = m_projectionKeys.last();
    m_indices.remove(oldKey);
    if (m_partOffsets.contains(oldKey)) { m_partOffsets[key] = m_partOffsets.take(oldKey); }
    auto row = message;
    const auto thoughts = thoughtsOnly(textOf(m_rows.last()["content"]));
    if (!thoughts.isEmpty() && !textOf(row["content"]).contains("<think>")) {
      if (row["content"].isArray()) {
        auto content = row["content"].toArray();
        content.prepend(QJsonObject{{"type", "text"}, {"text", thoughts}});
        row["content"] = content;
      } else if (row["content"].isString()) { row["content"] = thoughts + row["content"].toString(); }
    }
    if (!row.contains("parts")) {
      row["parts"] = m_rows.last()["parts"];
    }
    m_rows[i] = row;
    m_projectionKeys[i] = key;
    if (auto *model = m_partModels.take(oldKey)) {
      m_partModels[key] = model;
    }
    m_indices[key] = i;
    refreshParts(i);
    emit dataChanged(index(i), index(i));
    return key;
  }
  if (m_rows.size() >= 10000) {
    beginRemoveRows({}, 0, 0);
    const auto oldKey = m_projectionKeys.takeFirst();
    m_indices.remove(oldKey);
    releaseParts(oldKey);
    m_rows.removeFirst();
    for (auto it = m_indices.begin(); it != m_indices.end(); ++it) {
      --it.value();
    }
    endRemoveRows();
  }
  beginInsertRows({}, rowCount(), rowCount());
  m_rows.append(message);
  m_projectionKeys.append(key);
  m_indices[key] = rowCount() - 1;
  endInsertRows();
  return key;
}
void MessageModel::appendChunk(const QString &input, bool done, bool thinking) {
  if (m_rows.isEmpty() || m_rows.last()["role"] != "assistant" ||
      m_rows.last()["status"] != "streaming") {
    upsert({{"id", QUuid::createUuid().toString(QUuid::Id128)},
            {"role", "assistant"},
            {"content", ""},
            {"status", "streaming"},
            {"temporary", true},
            {"created_at",
             QDateTime::currentDateTimeUtc().toString(Qt::ISODate)}});
  }
  auto &row = m_rows.last();
  const auto old = textOf(row["content"]);
  auto text = input;
  if (thinking && !input.isEmpty() && !openThought(old)) { text.prepend("<think>"); }
  else if (!thinking && openThought(old) && (!input.isEmpty() || done)) { text.prepend("</think>"); }
  if (old.size() + text.size() <= 4 * 1024 * 1024) {
    if (row["content"].isArray()) {
      auto content = row["content"].toArray();
      if (!text.isEmpty()) {
        if (!content.isEmpty() && content.last().toObject()["type"] == "text") {
          auto tail = content.last().toObject();
          tail["text"] = tail["text"].toString() + text;
          content[content.size() - 1] = tail;
        } else {
          content.append(QJsonObject{{"type", "text"}, {"text", text}});
        }
      }
      row["content"] = content;
    } else {
      row["content"] = old + text;
    }
  }
  row["status"] = done ? "complete" : "streaming";
  if (thinking && !m_partModels.contains(m_projectionKeys.last())) {
    data(index(rowCount() - 1), PartsRole);
  }
  m_dirtyRow = rowCount() - 1;
  if (!m_frameTimer) {
    m_frameTimer = new QTimer(this);
    m_frameTimer->setSingleShot(true);
    m_frameTimer->setInterval(16);
    connect(m_frameTimer, &QTimer::timeout, this, [this] {
      if (m_dirtyRow >= 0 && m_dirtyRow < rowCount()) {
        refreshParts(m_dirtyRow);
        emit dataChanged(index(m_dirtyRow), index(m_dirtyRow),
                         {TextRole, DisplayTextRole, PartsRole, StatusRole});
      }
      m_dirtyRow = -1;
    });
  }
  if (done) {
    m_frameTimer->stop();
    refreshParts(m_dirtyRow);
    emit dataChanged(index(m_dirtyRow), index(m_dirtyRow),
                     {TextRole, DisplayTextRole, PartsRole, StatusRole});
    m_dirtyRow = -1;
  } else if (!m_frameTimer->isActive()) {
    m_frameTimer->start();
  }
}
void MessageModel::finishThinking() {
  if (!m_rows.isEmpty() && m_rows.last()["status"] == "streaming") { appendChunk({}, true); }
}
bool MessageModel::addResolvedPart(const QString &id, const QJsonObject &part) {
  if (!m_indices.contains(id)) {
    return false;
  }
  const auto i = m_indices.value(id);
  auto parts = m_rows[i]["parts"].toArray();
  for (const auto &old : parts) {
    if (old.toObject()["originalMedia"] == part["originalMedia"] && part.contains("originalMedia")) {
      return false;
    }
  }
  parts.append(part);
  m_rows[i]["parts"] = parts;
  refreshParts(i);
  emit dataChanged(index(i), index(i), {PartsRole, DisplayTextRole});
  return true;
}
void MessageModel::addPart(const QJsonObject &part) {
  const auto owner = callOwner(part["tool_call_id"].toString());
  if (part.contains("result") && owner >= 0) {
    auto result = part;
    result["result_created_at"] = QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs);
    if (part.contains("created_at")) { result["result_created_at"] = part["created_at"]; }
    if (part.contains("result_created_at")) { result["result_created_at"] = part["result_created_at"]; }
    m_results[part["tool_call_id"].toString()] = result;
    refreshParts(owner);
    emit dataChanged(index(owner), index(owner), {PartsRole, DisplayTextRole});
    return;
  }
  if (m_rows.isEmpty() || m_rows.last()["role"] != "assistant") {
    upsert({{"id", QUuid::createUuid().toString(QUuid::Id128)},
            {"role", "assistant"},
            {"content", ""},
            {"created_at", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}});
  }
  int targetRow = rowCount() - 1;
  if (part["type"] == "prediction" && !part["id"].toString().isEmpty()) {
    for (int row = rowCount() - 1; row >= 0; --row) {
      auto values = m_rows[row]["parts"].toArray();
      for (int i = 0; i < values.size(); ++i) {
        if (values[i].toObject()["type"] == "prediction" && values[i].toObject()["id"] == part["id"]) {
          auto updated = values[i].toObject();
          for (auto it = part.begin(); it != part.end(); ++it) { updated[it.key()] = it.value(); }
          values[i] = updated;
          m_rows[row]["parts"] = values;
          refreshParts(row);
          emit dataChanged(index(row), index(row), {PartsRole});
          return;
        }
      }
    }
  }
  const auto incomingAction = part["actionId"].toString();
  if (!incomingAction.isEmpty()) {
    for (int candidate = rowCount() - 1; candidate >= 0; --candidate) {
      bool found = false;
      for (const auto &existing : m_rows[candidate]["parts"].toArray()) {
        if (existing.toObject()["actionId"] == incomingAction) { found = true; break; }
      }
      if (found) { targetRow = candidate; break; }
    }
  }
  const auto incomingCall = part["tool_call_id"].toString();
  if (!incomingCall.isEmpty()) {
    for (int candidate = rowCount() - 1; candidate >= 0; --candidate) {
      bool found = false;
      for (const auto &value : m_rows[candidate]["tool_calls"].toArray()) {
        const auto call = value.toObject();
        if (call["id"] == incomingCall || call["tool_call_id"] == incomingCall) { found = true; break; }
      }
      for (const auto &existing : m_rows[candidate]["parts"].toArray()) {
        if (existing.toObject()["tool_call_id"] == incomingCall) {
          found = true;
          break;
        }
      }
      if (found) {
        targetRow = candidate;
        break;
      }
    }
  }
  auto &row = m_rows[targetRow];
  auto calls = row["tool_calls"].toArray();
  for (int i = 0; i < calls.size(); ++i) {
    auto call = calls[i].toObject();
    if (!incomingCall.isEmpty() && (call["id"] == incomingCall || call["tool_call_id"] == incomingCall)) {
      for (auto it = part.begin(); it != part.end(); ++it) { call[it.key()] = it.value(); }
      calls[i] = call;
      row["tool_calls"] = calls;
      refreshParts(targetRow);
      emit dataChanged(index(targetRow), index(targetRow), {PartsRole, DisplayTextRole});
      return;
    }
  }
  auto parts = row["parts"].toArray();
  const auto action = part["actionId"].toString();
  const auto call = part["tool_call_id"].toString();
  bool replaced = false;
  for (int i = 0; i < parts.size(); ++i) {
    auto p = parts[i].toObject();
    if ((!action.isEmpty() && p["actionId"] == action) ||
        (!call.isEmpty() && p["tool_call_id"] == call)) {
      for (auto it = part.begin(); it != part.end(); ++it) {
        p[it.key()] = it.value();
      }
      parts[i] = p;
      replaced = true;
      break;
    }
  }
  if (!replaced && parts.size() < 1000) {
    auto &offsets = m_partOffsets[m_projectionKeys[targetRow]];
    while (offsets.size() < parts.size()) { offsets.append(contentLength(row["content"])); }
    offsets.append(contentLength(row["content"]));
    parts.append(part);
  }
  row["parts"] = parts;
  refreshParts(targetRow);
  emit dataChanged(index(targetRow), index(targetRow), {PartsRole, DisplayTextRole});
}
void MessageModel::importHistory(const QJsonArray &rows, bool prepend) {
  if (prepend) {
    for (const auto &value : rows) {
      if (value.toObject()["role"] == "agent_execution") {
        auto combined = rows;
        for (const auto &existing : snapshot()) { combined.append(existing); }
        importHistory(combined);
        return;
      }
    }
  }
  if (!prepend) {
    clear();
    for (const auto &row : rows) {
      if (row.isObject()) {
        upsert(row.toObject());
      }
    }
    return;
  }
  QList<QJsonObject> fresh;
  QSet<QString> pageIds;
  for (const auto &value : rows) {
    const auto row = value.toObject();
    if (row["role"] == "tool" && !row["tool_call_id"].toString().isEmpty()) {
      upsert(row);
      continue;
    }
    const auto id = row["id"].toString();
    bool exists = m_indices.contains(id) || pageIds.contains(id);
    if (!exists && fresh.size() + m_rows.size() < 10000) {
      fresh.append(row);
      if (!id.isEmpty()) {
        pageIds.insert(id);
      }
    }
  }
  if (fresh.isEmpty()) {
    return;
  }
  beginInsertRows({}, 0, static_cast<int>(fresh.size()) - 1);
  m_rows = fresh + m_rows;
  QList<QString> newKeys;
  for (const auto &row : fresh) {
    const auto id = row["id"].toString();
    newKeys.append(id.isEmpty() ? "projection:" +
                                      QUuid::createUuid().toString(QUuid::Id128)
                                : id);
  }
  m_projectionKeys = newKeys + m_projectionKeys;
  m_indices.clear();
  for (int i = 0; i < m_rows.size(); ++i) {
    m_indices[m_projectionKeys[i]] = i;
    for (const auto &source : m_groupSources.value(m_projectionKeys[i])) {
      m_indices[source["id"].toString()] = i;
    }
  }
  endInsertRows();
}
QJsonArray MessageModel::snapshot() const {
  QJsonArray out = m_nestedEvents;
  for (int i = 0; i < m_rows.size(); ++i) {
    const auto key = m_projectionKeys[i];
    if (m_groupSources.contains(key)) {
      for (const auto &source : m_groupSources.value(key)) { out.append(source); }
    } else if (!m_rows[i]["nativeTree"].toBool()) { out.append(m_rows[i]); }
  }
  for (const auto &message : m_resultMessages) { out.append(message); }
  return out;
}
void MessageModel::clear() {
  for (auto *model : m_children) { model->deleteLater(); }
  m_children.clear();
  m_childCounts.clear();
  m_nestedEvents = {};
  m_eventIds.clear();
  m_stepTasks.clear();
  m_callSteps.clear();
  if (m_frameTimer) {
    m_frameTimer->stop();
  }
  m_dirtyRow = -1;
  if (m_rows.isEmpty() && m_results.isEmpty() && m_resultMessages.isEmpty()) {
    return;
  }
  beginResetModel();
  for (auto *model : m_partModels) {
    model->deleteLater();
  }
  m_partModels.clear();
  m_rows.clear();
  m_projectionKeys.clear();
  m_indices.clear();
  m_groupSources.clear();
  m_results.clear();
  m_partOffsets.clear();
  m_resultMessages.clear();
  endResetModel();
}
} // namespace nt::chat
