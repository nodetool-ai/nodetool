#include "EditorWindow.h"
#include "EditorChatSearch.h"
#include "document/ConnectionTypes.h"
#include "graph/BodyConnectionRules.h"
#include "graph/NodeCreation.h"
#include "properties/CodeInference.h"
#include <QApplication>
#include <QClipboard>
#include <QCryptographicHash>
#include <QFile>
#include <QJSEngine>
#include <QJsonDocument>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QRegularExpression>
#include <QTimer>
#include <QUrlQuery>
#include <QUuid>
#include <algorithm>
#include <cmath>
#include <memory>

namespace nodetool {
namespace {
struct ToolAccount {
    QUrl origin;
    QString token;
    QString user;
    quint64 epoch = 0;
};
bool valueMatches(const QJsonValue &value, const QJsonObject &type, int depth = 0) {
    if (depth > 128) {
        return false;
    }
    const auto kind = type["type"].toString();
    const auto args = type["type_args"].toArray();
    if (kind == "any") {
        return true;
    }
    if (kind == "null") {
        return value.isNull();
    }
    if (kind == "str") {
        return value.isString();
    }
    if (kind == "int" || kind == "float" || kind == "number") {
        return value.isDouble() && std::isfinite(value.toDouble());
    }
    if (kind == "bool" || kind == "boolean") {
        return value.isBool();
    }
    if (kind == "enum") {
        return value.isString() &&
               (type["values"].toArray().isEmpty() || type["values"].toArray().contains(value));
    }
    if (kind == "union") {
        for (const auto &arg : args) {
            if (valueMatches(value, arg.toObject(), depth + 1)) {
                return true;
            }
        }
        return false;
    }
    if (kind == "list" || kind == "tuple") {
        if (!value.isArray()) {
            return false;
        }
        const auto values = value.toArray();
        if (args.isEmpty()) {
            return true;
        }
        if (kind == "tuple" && values.size() != args.size()) {
            return false;
        }
        for (qsizetype i = 0; i < values.size(); ++i) {
            if (!valueMatches(values[i], args[kind == "list" ? 0 : i].toObject(), depth + 1)) {
                return false;
            }
        }
        return true;
    }
    if (kind == "dict" && args.size() >= 2) {
        if (!value.isObject()) {
            return false;
        }
        const auto object = value.toObject();
        for (auto it = object.begin(); it != object.end(); ++it) {
            if (!valueMatches(it.value(), args[1].toObject(), depth + 1)) {
                return false;
            }
        }
    }
    return !kind.isEmpty() && value.isObject();
}
QJsonObject readNode(const QJsonObject &node) {
    const auto ui = node["ui_properties"].toObject();
    auto data = node["chat_data"].toObject();
    for (const auto &key :
         {"color", "collapsed", "bypassed", "model_id", "endpoint_id", "selected_generation",
          "selected_generations", "title", "setup_step_id", "selectable"}) {
        if (ui.contains(key)) {
            data[key] = ui[key];
        }
    }
    data["originalType"] = node["type"];
    data["properties"] = node["data"].toObject();
    for (const auto &key :
         {"dynamic_properties", "dynamic_inputs", "dynamic_outputs", "dynamic_output_correlation"}) {
        data[key] = node[key].toObject();
    }
    data["collapsed"] = data["collapsed"].toBool();
    data["bypassed"] = data["bypassed"].toBool();
    if (data.contains("setup_step_id")) {
        data["setupStepId"] = data.take("setup_step_id");
    }
    return {{"id", node["id"]},
            {"type", node["type"]},
            {"position", node["ui_properties"].toObject()["position"].toObject()},
            {"parentId", node["parent_id"].toString()},
            {"data", data}};
}
constexpr auto RevisionIdentity = "nodetool.chatRevisionIdentity";
constexpr auto RevisionEdit = "nodetool.chatRevisionEdit";
// The web hashes graph content (packages/protocol/src/workflow-document-revision.ts).
// Native names the document instance and its change count instead, so a revision
// costs the same at any graph size. Every graph change emits changed(), which
// advances the count. A change and its undo give a new revision, where the web
// would return the earlier hash. The digest keeps the web's "graph:<64 hex>" form.
QString documentRevision(const node_editor::WorkflowDocument &document) {
    const auto key = document.property(RevisionIdentity).toString() + QChar(0x1f) +
                     QString::number(document.property(RevisionEdit).toULongLong());
    const auto digest = QCryptographicHash::hash(key.toUtf8(), QCryptographicHash::Sha256);
    return "graph:" + QString::fromLatin1(digest.toHex());
}
bool parsesCode(const QString &code) {
    // native-rules #14: thread_local mutable parser and init flag
    thread_local QJSEngine parser;
    thread_local bool initialized = false;
    if (!initialized) {
        QFile file(":/editor/code/acorn.js");
        if (!file.open(QIODevice::ReadOnly)) {
            return true;
        }
        auto source = QString::fromUtf8(file.readAll());
        source.replace("'use strict';", "");
        parser.evaluate(source);
        parser.evaluate("function parsesBody(code) { var opts = "
                        "{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true,"
                        "allowAwaitOutsideFunction:true}; try { acorn.parse(code, opts); return true; } "
                        "catch(e) { try { acorn.parse('(async function(){'+code+'})()',opts); return true; } "
                        "catch(e) { return false; } } }");
        initialized = true;
    }
    return parser.globalObject().property("parsesBody").call({code}).toBool();
}
QJsonObject graphResult(node_editor::WorkflowDocument &document, const QJsonArray &metadata) {
    QJsonArray nodes;
    QJsonArray edges;
    QJsonArray errors;
    QJsonArray suggestions;
    QSet<QString> incoming;
    QSet<QString> outgoing;
    QSet<QString> connected;
    for (const auto &value : document.edges()) {
        const auto stored = value.toObject();
        const QJsonObject edge{{"id", stored["id"]},
                               {"source", stored["source"]},
                               {"target", stored["target"]},
                               {"sourceHandle", stored["sourceHandle"]},
                               {"targetHandle", stored["targetHandle"]},
                               {"edge_type", stored["edge_type"] == "control" ? "control" : "data"}};
        edges.append(edge);
        incoming.insert(edge["target"].toString());
        outgoing.insert(edge["source"].toString());
        connected.insert(edge["target"].toString() + "::" + edge["targetHandle"].toString());
    }
    for (const auto &value : document.nodes()) {
        auto node = readNode(value.toObject());
        auto nodeData = node["data"].toObject();
        nodeData["workflow_id"] = document.snapshot()["id"];
        node["data"] = nodeData;
        nodes.append(node);
        const auto id = node["id"].toString();
        const auto type = node["type"].toString();
        const auto label = type + " (" + id + ")";
        const auto code = node["data"].toObject()["properties"].toObject()["code"].toString();
        if (type == "nodetool.code.Code" && !code.trimmed().isEmpty() && !connected.contains(id + "::code") &&
            !parsesCode(code)) {
            errors.append("Node " + label + ": the code does not parse as JavaScript.");
        }
        for (const auto &entry : metadata) {
            const auto meta = entry.toObject();
            if (meta["node_type"] != type) {
                continue;
            }
            for (const auto &property : meta["properties"].toArray()) {
                const auto prop = property.toObject();
                const auto name = prop["name"].toString();
                const QJsonValue v = node["data"].toObject()[name];
                if (prop["required"].toBool() && !connected.contains(id + "::" + name) &&
                    (v.isUndefined() || v.isNull() || v == "")) {
                    errors.append("Node " + label + ": required property \"" + name +
                                  "\" is not connected and has no value set.");
                }
            }
            if (!incoming.contains(id) && !outgoing.contains(id) && !type.startsWith("nodetool.input.") &&
                !type.startsWith("nodetool.constant.") && !type.startsWith("nodetool.output.") &&
                !type.contains("base_node.Group") && !type.contains("base_node.Comment")) {
                suggestions.append("Node " + label +
                                   " has no connections. Consider connecting it or removing it.");
            }
        }
    }
    const QJsonValue id = document.snapshot()["id"];

    return {{"ok", true},
            {"workflow_id", id},
            {"source", "editor"},
            {"document_revision", documentRevision(document)},
            {"nodes", nodes},
            {"edges", edges},
            {"validation",
             QJsonObject{{"errors", errors}, {"warnings", QJsonArray{}}, {"suggestions", suggestions}}}};
}
QJsonObject handleType(const QJsonObject &node, const QJsonObject &meta, const QString &name, bool output) {
    const auto dynamic = node[output ? "dynamic_outputs" : "dynamic_inputs"].toObject();
    if (dynamic.contains(name)) {
        return node_editor::normalizedDynamicPortType(dynamic[name]);
    }
    if (!output && node["dynamic_properties"].toObject().contains(name)) {
        return {{"type", "any"}};
    }
    for (const auto &entry : meta[output ? "outputs" : "properties"].toArray()) {
        const auto field = entry.toObject();
        if (field["name"] == name) {
            return node_editor::normalizedDynamicPortType(field["type"]);
        }
    }
    return {};
}
} // namespace

void EditorWindow::initializeChatTools() {
    document_.setProperty(RevisionIdentity, QUuid::createUuid().toString(QUuid::Id128));
    connect(&document_, &node_editor::WorkflowDocument::changed, this, [this] {
        const auto edit = document_.property(RevisionEdit).toULongLong();
        document_.setProperty(RevisionEdit, edit + 1);
    });
    const QMap<QString, QStringList> required{
        {"ui_get_graph", {}},
        {"ui_add_node", {"id", "type", "position"}},
        {"ui_connect_nodes", {"source_node_id", "source_handle", "target_node_id", "target_handle"}},
        {"ui_move_node", {"node_id", "position"}},
        {"ui_set_node_title", {"node_id", "title"}},
        {"ui_delete_node", {"node_id"}},
        {"ui_delete_edge", {"edge_id"}},
        {"ui_update_node_data", {"node_id", "data"}},
        {"ui_search_nodes", {"query"}},
        {"ui_search_models", {"kind"}},
        {"ui_switch_tab", {"tab_index"}},
        {"ui_copy", {"text"}},
        {"ui_paste", {}},
        {"ui_open_workflow", {"workflow_id"}},
        {"ui_run_workflow", {"workflow_id"}},
        {"ui_open_document", {"type", "id"}}};
    // The manifest is the web registry's own JSON schema for these tools,
    // written by scripts/generate-chat-web-fixtures.mjs.
    QVariantList tools;
    QFile manifest(":/editor/chat/tool-manifest.json");
    if (manifest.open(QIODevice::ReadOnly)) {
        for (const auto &entry : QJsonDocument::fromJson(manifest.readAll()).array()) {
            if (required.contains(entry.toObject()["name"].toString())) {
                tools.append(entry.toObject().toVariantMap());
            }
        }
    }
    chat_.setHostTools(tools);
    // native-rules #1: shared_ptr<ToolAccount> shared by lambdas, no justification comment
    auto account = std::make_shared<ToolAccount>();
    auto *network = new QNetworkAccessManager(this);
    connect(&session_, &node_editor::WorkflowSession::credentialsChanged, this,
            [account, network](const QUrl &origin, const QString &token, const QString &user) {
                ++account->epoch;
                account->origin = origin;
                account->token = token;
                account->user = user;
                for (auto *reply : network->findChildren<QNetworkReply *>()) {
                    reply->abort();
                }
            });
    connect(
        &chat_, &nt::chat::ChatSession::hostToolRequested, this,
        [this, required, account, network](const QString &call, const QString &name,
                                           const QVariantMap &args) {
            auto input = QJsonObject::fromVariantMap(args);
            const auto fail = [this, &call](const QString &error) {
                chat_.completeHostTool(call, {}, error);
            };
            const auto complete = [this, &call](const QJsonObject &result) {
                chat_.completeHostTool(call, result.toVariantMap());
            };
            if (!required.contains(name)) {
                fail("Unknown tool: " + name);
                return;
            }
            for (const auto &key : {"include_properties", "include_outputs", "strict_match"}) {
                if (!input.contains(key)) {
                    continue;
                }
                if (input[key].isString() && (input[key] == "true" || input[key] == "false")) {
                    input[key] = input[key] == "true";
                }
                if (!input[key].isBool()) {
                    fail("Invalid input: " + QString(key));
                    return;
                }
            }
            for (const auto &key : {"input_type", "output_type", "based_on_revision"}) {
                if (input.contains(key) && !input[key].isString()) {
                    fail("Invalid input: " + QString(key));
                    return;
                }
            }
            if (input.contains("limit") &&
                (!input["limit"].isDouble() || input["limit"].toDouble() < 1 ||
                 input["limit"].toDouble() > (name == "ui_search_models" ? 50 : 100) ||
                 (name == "ui_search_models" &&
                  std::floor(input["limit"].toDouble()) != input["limit"].toDouble()))) {
                fail("Invalid input: limit");
                return;
            }
            for (const auto &key : required[name]) {
                const auto value = input[key];
                const bool valid =
                    key == "position" ? value.isObject() || (name == "ui_add_node" && value.isString())
                    : key == "data"   ? value.isObject()
                    : key == "tab_index"
                        ? value.isDouble()
                        : value.isString() && (!key.endsWith("id") || !value.toString().isEmpty());
                if (!valid) {
                    fail("Invalid input: " + key);
                    return;
                }
            }
            if (input.contains("workflow_id") && !input["workflow_id"].isNull() &&
                !input["workflow_id"].isString()) {
                fail("Invalid input: workflow_id");
                return;
            }
            if (input.contains("workflow_id") && input["workflow_id"].isString() &&
                input["workflow_id"].toString().isEmpty()) {
                fail("No current workflow selected");
                return;
            }
            auto *owner = tabOwner_ ? tabOwner_ : this;
            auto *target = owner->activeEditor();
            const auto workflowId = input["workflow_id"].toString();
            if (!workflowId.isEmpty()) {
                target = nullptr;
                QList<EditorWindow *> matches;
                for (auto *tab : owner->tabs_) {
                    const auto id = tab->document_.snapshot()["id"].toString();
                    if (id == workflowId) {
                        matches.clear();
                        matches.append(tab);
                        break;
                    }
                    if (QRegularExpression("^[0-9a-f]{12}$").match(workflowId).hasMatch() &&
                        QRegularExpression("^[0-9a-f]{32}$").match(id).hasMatch() &&
                        id.startsWith(workflowId)) {
                        matches.append(tab);
                    }
                }
                if (matches.size() == 1) {
                    target = matches.first();
                }
            }
            if (name == "ui_switch_tab") {
                const auto index = input["tab_index"].toDouble();
                if (index < 0 || std::floor(index) != index || index >= owner->tabs_.size()) {
                    fail("Tab index is out of range");
                    return;
                }
                owner->activateTab(static_cast<int>(index));
                complete({{"ok", true},
                          {"tab_index", index},
                          {"workflow_id", owner->activeEditor()->document_.snapshot()["id"]}});
                return;
            }
            if (name == "ui_copy") {
                QApplication::clipboard()->setText(input["text"].toString());
                complete({{"ok", true}, {"text_length", input["text"].toString().size()}});
                return;
            }
            if (name == "ui_paste") {
                complete({{"ok", true}, {"text", QApplication::clipboard()->text()}});
                return;
            }
            if (name == "ui_open_document") {
                if (input["type"] != "workflow") {
                    fail("This host opens workflow documents only");
                    return;
                }
                target = nullptr;
                for (auto *tab : owner->tabs_) {
                    if (tab->document_.snapshot()["id"] == input["id"]) {
                        target = tab;
                    }
                }
            }
            if ((name == "ui_open_workflow" || name == "ui_open_document") && !target) {
                const auto id = name == "ui_open_document" ? input["id"].toString() : workflowId;
                const auto epoch = account->epoch;
                auto *timer = new QTimer(this);
                timer->setInterval(20);
                // native-rules #1: shared_ptr<int> counter shared by lambda copies, no justification comment
                auto elapsed = std::make_shared<int>(0);
                connect(timer, &QTimer::timeout, this,
                        [this, owner, timer, elapsed, id, call, name, account, epoch] {
                            *elapsed += timer->interval();
                            if (account->epoch != epoch) {
                                timer->deleteLater();
                                return;
                            }
                            for (auto *tab : owner->tabs_) {
                                if (tab->document_.snapshot()["id"].toString() != id) {
                                    continue;
                                }
                                QJsonObject result{{"ok", true}, {"workflow_id", id}};
                                if (name == "ui_open_document") {
                                    result = {{"ok", true},
                                              {"type", "workflow"},
                                              {"id", id},
                                              {"already_open", false},
                                              {"url", "workflow://" + id}};
                                }
                                chat_.completeHostTool(call, result.toVariantMap());
                                timer->deleteLater();
                                return;
                            }
                            if (*elapsed >= 15000) {
                                chat_.completeHostTool(call, {}, "Workflow editor did not load");
                                timer->deleteLater();
                            }
                        });
                owner->openWorkflow(id);
                timer->start();
                return;
            }
            if (!target) {
                fail("Workflow is not open in this chat host.");
                return;
            }
            auto &document = target->document_;
            for (const auto &key : {"node_id", "source_node_id", "target_node_id", "edge_id"}) {
                const auto id = input[key].toString();
                if (!QRegularExpression("^[0-9a-f]{12}$").match(id).hasMatch()) {
                    continue;
                }
                const auto resources = QString(key) == "edge_id" ? document.edges() : document.nodes();
                QStringList matches;
                bool exact = false;
                for (const auto &entry : resources) {
                    const auto full = entry.toObject()["id"].toString();
                    exact = exact || full == id;
                    if (QRegularExpression("^[0-9a-f]{32}$").match(full).hasMatch() && full.startsWith(id)) {
                        matches.append(full);
                    }
                }
                if (exact) {
                    continue;
                }
                if (matches.size() > 1) {
                    fail("Resource prefix is ambiguous: " + id);
                    return;
                }
                if (matches.size() == 1) {
                    input[key] = matches.first();
                }
            }

            const auto metadata = target->metadata_;
            const auto metaFor = [&metadata](const QString &type) {
                for (const auto &entry : metadata) {
                    if (entry.toObject()["node_type"] == type) {
                        return entry.toObject();
                    }
                }
                return QJsonObject{};
            };
            if (name == "ui_open_workflow" || name == "ui_open_document") {
                owner->activateSurface(owner->tabs_.indexOf(target));
                if (name == "ui_open_document") {
                    complete({{"ok", true},
                              {"type", "workflow"},
                              {"id", document.snapshot()["id"]},
                              {"already_open", true},
                              {"url", "workflow://" + document.snapshot()["id"].toString()}});
                } else {
                    complete({{"ok", true}, {"workflow_id", document.snapshot()["id"]}});
                }
                return;
            }
            if (name == "ui_get_graph") {
                complete(graphResult(document, metadata));
                return;
            }
            if (name == "ui_search_nodes") {
                // web/src/lib/tools/builtin/searchNodes.ts execute.
                const auto query = input["query"].toString().trimmed();
                const auto sorted = computeNodeSearchResults(metadata, query, input["input_type"].toString(),
                                                             input["output_type"].toString(),
                                                             input["strict_match"].toBool());
                const auto namespaceRank = [](const QString &type) {
                    if (type.startsWith("nodetool.")) {
                        return 0;
                    }
                    return type.startsWith("huggingface.") ? 2 : 1;
                };
                QList<QJsonObject> preferred;
                for (const auto &entry : sorted) {
                    preferred.append(entry.toObject());
                }
                std::stable_sort(preferred.begin(), preferred.end(),
                                 [&namespaceRank](const QJsonObject &a, const QJsonObject &b) {
                                     return namespaceRank(a["node_type"].toString()) <
                                            namespaceRank(b["node_type"].toString());
                                 });
                const auto limit = static_cast<int>(std::floor(std::clamp(input["limit"].toDouble(25), 1.0, 100.0)));
                QJsonArray results;
                for (const auto &meta : preferred.mid(0, limit)) {
                    QJsonObject result{{"node_type", meta["node_type"]},
                                       {"title", meta["title"]},
                                       {"namespace", meta["namespace"]}};
                    for (const auto &direction : {"properties", "outputs"}) {
                        if (!input[QString("include_") + direction].toBool()) {
                            continue;
                        }
                        QJsonArray fields;
                        QJsonArray handles;
                        for (const auto &value : meta[direction].toArray()) {
                            const auto field = value.toObject();
                            QJsonObject handle{{"name", field["name"]}, {"type", field["type"]}};
                            handles.append(handle);
                            const auto extra = QString(direction) == "properties" ? "required" : "stream";
                            if (field.contains(extra)) {
                                handle[extra] = field[extra];
                            }
                            fields.append(handle);
                        }
                        result[direction] = fields;
                        result[QString(direction) == "properties" ? "input_handles" : "output_handles"] =
                            handles;
                    }
                    results.append(result);
                }
                complete({{"ok", true},
                          {"query", query},
                          {"count", results.size()},
                          {"total_matches", sorted.size()},
                          {"results", results}});
                return;
            }
            if (name == "ui_search_models") {
                const QStringList kinds{"text_to_image",  "image_to_image",  "text_to_video",
                                        "image_to_video", "video_to_video",  "reference_to_video",
                                        "text_to_speech", "text_to_music",   "audio_to_audio",
                                        "speech_to_text", "text_generation", "embedding"};
                const auto kind = input["kind"].toString();
                if (!kinds.contains(kind)) {
                    fail("Invalid model kind");
                    return;
                }
                if (account->origin.isEmpty()) {
                    fail("Connect to a server to search models");
                    return;
                }
                auto url = account->origin.resolved(QUrl("/trpc/models.availableForKind"));
                QUrlQuery query;
                query.addQueryItem(
                    "input", QString::fromUtf8(
                                 QJsonDocument(QJsonObject{{"kind", kind}}).toJson(QJsonDocument::Compact)));
                url.setQuery(query);
                QNetworkRequest request(url);
                request.setTransferTimeout(30000);
                request.setAttribute(QNetworkRequest::RedirectPolicyAttribute,
                                     QNetworkRequest::ManualRedirectPolicy);
                if (!account->token.isEmpty()) {
                    request.setRawHeader("Authorization", "Bearer " + account->token.toUtf8());
                }
                request.setRawHeader("x-user-id", account->user.toUtf8());
                auto *reply = network->get(request);
                const auto epoch = account->epoch;
                const auto limit = std::clamp(input["limit"].toInt(20), 1, 50);
                connect(
                    reply, &QNetworkReply::finished, this, [this, reply, account, epoch, call, kind, limit] {
                        reply->deleteLater();
                        if (account->epoch != epoch) {
                            return;
                        }
                        const QJsonValue response =
                            QJsonDocument::fromJson(reply->readAll()).object()["result"].toObject()["data"];
                        if (reply->error() != QNetworkReply::NoError || !response.isArray()) {
                            chat_.completeHostTool(call, {}, "Could not enumerate models");
                            return;
                        }
                        QJsonArray models;
                        for (const auto &entry : response.toArray()) {
                            const auto raw = entry.toObject();
                            QJsonObject model;
                            for (const auto &key :
                                 {"type", "provider", "repo_id", "path", "downloaded", "description"}) {
                                model[key] = raw.contains(key) ? raw[key] : QJsonValue(QJsonValue::Null);
                            }
                            model["id"] = raw["id"].toString(raw["repo_id"].toString(raw["name"].toString()));
                            model["name"] =
                                raw["name"].toString(raw["id"].toString(raw["repo_id"].toString()));
                            models.append(model);
                            if (models.size() >= limit) {
                                break;
                            }
                        }
                        chat_.completeHostTool(
                            call, QJsonObject{{"ok", true},
                                              {"kind", kind},
                                              {"count", models.size()},
                                              {"models", models},
                                              {"usage", "Pass the chosen entry directly as the node's "
                                                        "`model` property: ui_update_node_data({ node_id, "
                                                        "data: { properties: { model: <entry> } } })"}}
                                      .toVariantMap());
                    });
                return;
            }
            if (target->readOnly()) {
                fail(target->readOnlyReason());
                return;
            }
            if (input.contains("based_on_revision") &&
                input["based_on_revision"] != documentRevision(document)) {
                fail("document_revision_conflict: The editor graph changed since your read. Read "
                     "ui_get_graph again and retry.");
                return;
            }
            if (name == "ui_run_workflow") {
                if (input.contains("params") && !input["params"].isObject()) {
                    fail("Invalid input: params");
                    return;
                }
                const auto job = target->session_.run(document.snapshot(), input["params"].toObject());
                if (job.isEmpty()) {
                    fail("Workflow run was not submitted. Connect and reconcile pending runs before "
                         "retrying.");
                    return;
                }
                complete({{"ok", true}, {"workflow_id", document.snapshot()["id"]}, {"job_id", job}});
                return;
            }
            QJsonObject command;
            QJsonObject result{{"ok", true}};
            const auto id = input["node_id"].toString();
            if (name == "ui_add_node") {
                const auto meta = metaFor(input["type"].toString());
                if (meta.isEmpty()) {
                    fail("Node type not found: " + input["type"].toString() +
                         ". Use ui_search_nodes to find the correct type.");
                    return;
                }
                if (input.contains("properties") && !input["properties"].isObject()) {
                    fail("Invalid input: properties");
                    return;
                }
                auto position = input["position"].toObject();
                if (input["position"].isObject() &&
                    (!position["x"].isDouble() || !position["y"].isDouble() ||
                     !std::isfinite(position["x"].toDouble()) || !std::isfinite(position["y"].toDouble()))) {
                    fail("Invalid input: position");
                    return;
                }
                if (input["position"].isString()) {
                    const auto text = input["position"].toString();
                    position = QJsonDocument::fromJson(text.toUtf8()).object();
                    if (position.isEmpty()) {
                        auto match = QRegularExpression("(-?\\d+(?:\\.\\d+)?)[^\\d-]+(-?\\d+(?:\\.\\d+)?)")
                                         .match(text);
                        if (match.hasMatch()) {
                            position = {{"x", match.captured(1).toDouble()},
                                        {"y", match.captured(2).toDouble()}};
                        }
                    }
                }
                if (!position["x"].isDouble() || !position["y"].isDouble()) {
                    const auto count = document.nodeCount();
                    position = {{"x", 120 + (count % 6) * 240}, {"y", 120 + (count / 6) * 160}};
                }
                QJsonArray warnings;
                const auto provided = input["properties"].toObject();
                for (const auto &entry : meta["properties"].toArray()) {
                    const auto property = entry.toObject();
                    const auto key = property["name"].toString();
                    if (provided.contains(key) && !valueMatches(provided[key], property["type"].toObject())) {
                        fail("Value for property " + key + " does not match type " +
                             property["type"].toObject()["type"].toString());
                        return;
                    }
                    const auto value = property["default"];
                    if (property["required"].toBool() && !provided.contains(key) &&
                        (value.isNull() || value.isUndefined() || value == "" ||
                         (value.isObject() && value.toObject().isEmpty()))) {
                        warnings.append("Required property '" + key +
                                        "' is not set. Use ui_update_node_data to set it.");
                    }
                }
                if (!warnings.isEmpty()) {
                    result["warnings"] = warnings;
                }
                NodeCreationOptions options;
                options.id = input["id"].toString();
                auto node = createNativeNode(meta, {position["x"].toDouble(), position["y"].toDouble()}, {},
                                             input["properties"].toObject(), options);
                node = node_editor::withInferredCodePorts(node);
                command = {{"op", "addNode"}, {"node", node}};
            } else if (name == "ui_connect_nodes") {
                const auto source = document.node(input["source_node_id"].toString());
                const auto targetNode = document.node(input["target_node_id"].toString());
                if (source.isEmpty() || targetNode.isEmpty()) {
                    fail("Connection endpoint not found");
                    return;
                }
                const auto sourceHandle = input["source_handle"].toString();
                const auto targetHandle = input["target_handle"].toString();
                const auto sourceType =
                    handleType(source, metaFor(source["type"].toString()), sourceHandle, true);
                const auto targetMeta = metaFor(targetNode["type"].toString());
                const auto targetType = handleType(targetNode, targetMeta, targetHandle, false);
                if (sourceType.isEmpty()) {
                    fail("Source handle '" + sourceHandle + "' not found");
                    return;
                }
                QJsonArray commands;
                if (targetType.isEmpty()) {
                    const auto type = targetNode["type"].toString();
                    if (!targetMeta["supports_dynamic_inputs"].toBool() || targetHandle.trimmed().isEmpty() ||
                        type == "nodetool.code.Code" || schemaOnlyInputs(type) ||
                        targetNode["dynamic_outputs"].toObject().contains(targetHandle)) {
                        fail("Target handle '" + targetHandle + "' not found");
                        return;
                    }
                    commands.append(QJsonObject{{"op", "addDynamicInput"},
                                                {"id", targetNode["id"]},
                                                {"name", targetHandle},
                                                {"type", sourceType}});
                    result["declared_input"] = targetHandle;
                }
                for (const auto &value : document.edges()) {
                    const auto edge = value.toObject();
                    if (edge["source"] == source["id"] && edge["target"] == targetNode["id"] &&
                        edge["sourceHandle"] == sourceHandle && edge["targetHandle"] == targetHandle) {
                        complete({{"ok", true}, {"edge_id", edge["id"]}, {"note", "edge already exists"}});
                        return;
                    }
                }
                const auto edgeId = QUuid::createUuid().toString(QUuid::Id128);
                commands.append(QJsonObject{{"op", "addEdge"},
                                            {"edge", QJsonObject{{"id", edgeId},
                                                                 {"source", source["id"]},
                                                                 {"target", targetNode["id"]},
                                                                 {"sourceHandle", sourceHandle},
                                                                 {"targetHandle", targetHandle}}}});
                command = {{"op", "batch"}, {"commands", commands}};
                result["edge_id"] = edgeId;
            } else if (name == "ui_move_node") {
                const auto position = input["position"].toObject();
                if (!position["x"].isDouble() || !position["y"].isDouble()) {
                    fail("Invalid input: position");
                    return;
                }
                command = {
                    {"op", "moveNodes"}, {"space", "absolute"}, {"positions", QJsonObject{{id, position}}}};
                result["position"] = position;
            } else if (name == "ui_set_node_title") {
                command = {
                    {"op", "patchChatData"}, {"id", id}, {"data", QJsonObject{{"title", input["title"]}}}};
                result["title"] = input["title"];
            } else if (name == "ui_delete_node") {
                command = {{"op", "removeNodes"}, {"ids", QJsonArray{id}}};
            } else if (name == "ui_delete_edge") {
                command = {{"op", "removeEdge"}, {"id", input["edge_id"]}};
                result["edge_id"] = input["edge_id"];
            } else if (name == "ui_update_node_data") {
                const auto properties = input["data"].toObject()["properties"].toObject();
                const auto meta = metaFor(document.node(id)["type"].toString());
                const QSet<QString> models{"language_model", "image_model",     "tts_model",
                                           "asr_model",      "embedding_model", "video_model"};
                for (const auto &entry : meta["properties"].toArray()) {
                    const auto property = entry.toObject();
                    const auto field = property["name"].toString();
                    const auto type = property["type"].toObject()["type"].toString();
                    if (models.contains(type) && properties[field].isString()) {
                        fail("Property '" + field + "' is a " + type +
                             " object, not a string. Pass the full object from ui_search_models.");
                        return;
                    }
                }
                command = {{"op", "patchChatData"}, {"id", id}, {"data", input["data"]}};
            }
            if (!id.isEmpty()) {
                result["node_id"] = id;
            }
            const auto edited = document.applyCommand(command, name);
            if (!edited) {
                fail(edited.error);
                return;
            }
            result["source"] = "editor";
            result["document_revision"] = documentRevision(document);
            complete(result);
        });
}
} // namespace nodetool
