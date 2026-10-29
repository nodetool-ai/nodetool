#include "ai/WorkflowGeneration.h"
#include "ai/GenerationTransport.h"
#include <QJsonArray>
#include <QSet>

namespace nt::ai {
WorkflowGeneration::WorkflowGeneration(GenerationTransport* transport, QObject* parent)
    : QObject(parent), m_transport(transport) {
    if (transport) connect(transport, &GenerationTransport::message, this, &WorkflowGeneration::acceptMessage);
}

void WorkflowGeneration::reset() {
    m_context = {}; m_runData = {}; m_status.clear(); m_outputAsset.clear();
    m_terminal = false; m_cancelling = false; m_missingOutput = false;
}

bool WorkflowGeneration::prepare(const QString& sequenceId, const QString& jobId, const QJsonObject& workflow,
                                 const QJsonObject& clip, QString* error) {
    if (!m_context.isEmpty() && !m_terminal) {
        if (error) *error = QStringLiteral("A workflow job is already active.");
        return false;
    }
    const auto workflowId = workflow.value("id").toString();
    const auto clipId = clip.value("id").toString();
    const auto outputId = clip.value("selectedOutputNodeId").toString();
    const auto graph = workflow.value("graph").toObject();
    if (sequenceId.isEmpty() || jobId.isEmpty() || workflowId.isEmpty() || clipId.isEmpty() || outputId.isEmpty() ||
        clip.value("workflowId").toString() != workflowId || !graph.value("nodes").isArray() || !graph.value("edges").isArray()) {
        if (error) *error = QStringLiteral("A saved sequence, bound workflow, selected output and graph are required.");
        return false;
    }
    QJsonArray nodes, edges;
    QSet<QString> excluded;
    for (const auto& value : graph.value("nodes").toArray()) {
        const auto node = value.toObject();
        if (node.value("ui_properties").toObject().value("bypassed").toBool()) excluded.insert(node.value("id").toString());
        else nodes.append(node);
    }
    for (const auto& value : graph.value("edges").toArray()) {
        const auto edge = value.toObject();
        if (!excluded.contains(edge.value("source").toString()) && !excluded.contains(edge.value("target").toString())) edges.append(edge);
    }
    if (excluded.contains(outputId)) {
        if (error) *error = QStringLiteral("The selected output is bypassed.");
        return false;
    }
    // The kernel collects terminal outputs by name or id. Preserve the key
    // only when it identifies exactly one terminal node in the submitted graph.
    QSet<QString> outgoing;
    for (const auto& value : edges) {
        const auto edge = value.toObject();
        if (edge.value("edge_type").toString() != u"control" && edge.value("type").toString() != u"control")
            outgoing.insert(edge.value("source").toString());
    }
    QHash<QString, int> keyCounts;
    QString selectedKey;
    for (const auto& value : nodes) {
        const auto node = value.toObject();
        const auto id = node.value("id").toString();
        if (id.isEmpty() || outgoing.contains(id)) continue;
        QString key = node.value("name").toString();
        if (key.trimmed().isEmpty()) {
            const auto properties = node.value("properties").isObject() ? node.value("properties").toObject() : node.value("data").toObject();
            if (node.value("type").toString().startsWith(u"nodetool.output.")) key = properties.value("name").toString().trimmed();
            if (key.isEmpty()) key = id;
        }
        ++keyCounts[key];
        if (id == outputId) selectedKey = key;
    }
    const auto params = clip.value("paramOverrides").toObject();
    m_context = {{"sequenceId", sequenceId}, {"clipId", clipId}, {"jobId", jobId}, {"workflowId", workflowId},
                 {"selectedOutputNodeId", outputId}, {"paramOverrides", params}};
    if (clip.contains("dependencyHash")) m_context.insert("dependencyHash", clip.value("dependencyHash"));
    if (!selectedKey.isEmpty() && keyCounts.value(selectedKey) == 1) m_context.insert("outputKey", selectedKey);
    m_runData = {{"type", "run_job_request"}, {"job_id", jobId}, {"workflow_id", workflowId},
                 {"job_name", workflow.value("name").toString()}, {"job_type", "workflow"},
                 {"execution_strategy", "threaded"}, {"params", params}, {"explicit_types", false},
                 {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}},
                 {"settings", workflow.value("settings").toObject()}, {"concurrent", true}};
    m_outputAsset.clear(); m_terminal = false; m_missingOutput = false; m_status.clear();
    return true;
}

bool WorkflowGeneration::start() {
    if (!m_transport || !m_transport->ready() || m_runData.isEmpty() || m_status == u"queued" || m_status == u"running" || m_terminal) return false;
    if (!m_transport->send(QStringLiteral("run_job"), m_runData, m_context.value("jobId").toString())) return false;
    m_runData = {};
    updateStatus(QStringLiteral("queued"));
    return true;
}

bool WorkflowGeneration::recover(const QJsonObject& context) {
    if (!m_transport || !m_transport->ready() || context.value("jobId").toString().isEmpty() ||
        context.value("sequenceId").toString().isEmpty() || context.value("clipId").toString().isEmpty() ||
        context.value("workflowId").toString().isEmpty() || context.value("selectedOutputNodeId").toString().isEmpty() ||
        (m_terminal && m_context == context && !m_missingOutput) ||
        (!m_context.isEmpty() && !m_terminal && m_context != context)) return false;
    const QJsonObject data{{"job_id", context.value("jobId")}, {"workflow_id", context.value("workflowId")}};
    if (!m_transport->send(QStringLiteral("reconnect_job"), data, context.value("jobId").toString())) return false;
    m_context = context; m_runData = {}; m_outputAsset.clear(); m_terminal = false; m_missingOutput = false;
    updateStatus(QStringLiteral("queued"));
    return true;
}

bool WorkflowGeneration::applyJobSnapshot(const QJsonObject& context, const QJsonObject& job) {
    if (m_cancelling || (m_terminal && m_context == context && !m_missingOutput) || (!m_context.isEmpty() && !m_terminal && m_context != context) ||
        context.value("jobId").toString().isEmpty() || context.value("sequenceId").toString().isEmpty() ||
        context.value("clipId").toString().isEmpty() || context.value("workflowId").toString().isEmpty() ||
        job.value("id") != context.value("jobId") || job.value("workflow_id") != context.value("workflowId")) return false;
    const auto status = job.value("status").toString();
    if (status == u"queued" || status == u"running") {
        m_context = context; m_terminal = false; updateStatus(status); return true;
    }
    if (status == u"cancelled" || status == u"failed" || status == u"timed_out") {
        m_context = context; m_terminal = true;
        updateStatus(status == u"timed_out" ? QStringLiteral("failed") : status, job.value("error").toString());
        return true;
    }
    if (status != u"completed") return false;
    const auto key = context.value("outputKey").toString();
    const auto outputs = job.value("outputs").toObject();
    if (key.isEmpty() || outputs.value("omitted").toBool() || !outputs.value(key).isArray()) return false;
    const auto values = outputs.value(key).toArray();
    if (values.isEmpty()) return false;
    const auto value = values.last();
    QString asset;
    if (value.isString()) asset = value.toString();
    else if (value.isObject()) {
        const auto object = value.toObject();
        asset = object.value("asset_id").toString(object.value("id").toString());
    }
    if (asset.isEmpty()) return false;
    m_context = context; m_runData = {}; m_terminal = true; m_missingOutput = false; m_outputAsset = asset;
    updateStatus(QStringLiteral("completed")); emit candidate(m_context, asset);
    return true;
}

QJsonObject WorkflowGeneration::beginCancel() {
    if (m_context.isEmpty() || m_terminal || m_cancelling) return {};
    m_cancelling = true;
    return {{"id", m_context.value("jobId")}};
}

bool WorkflowGeneration::finishCancel(bool ok, const QJsonObject& result, const QString& error) {
    if (!m_cancelling) return false;
    m_cancelling = false;
    if (!ok || result.value("status").toString() != u"cancelled") {
        updateStatus(m_status, error.isEmpty() ? QStringLiteral("Cancel did not settle the job. Recover its result.") : error);
        return false;
    }
    m_terminal = true; m_outputAsset.clear(); updateStatus(QStringLiteral("cancelled"));
    return true;
}

void WorkflowGeneration::acceptMessage(const QJsonObject& message) {
    if (m_context.isEmpty() || m_terminal || m_cancelling || message.value("job_id") != m_context.value("jobId")) return;
    const auto type = message.value("type").toString();
    if (type == u"output_update" && message.value("node_id") == m_context.value("selectedOutputNodeId")) {
        const auto value = message.value("value");
        const auto outputType = message.value("output_type").toString();
        static const QSet<QString> richTypes{"image", "audio", "video", "html", "document", "model_3d"};
        if (value.isString() && !richTypes.contains(outputType)) m_outputAsset = value.toString();
        else if (value.isObject()) {
            const auto object = value.toObject();
            m_outputAsset = object.value("asset_id").toString(object.value("id").toString());
        } else m_outputAsset.clear();
    } else if (type == u"job_update") {
        const auto status = message.value("status").toString();
        if (status == u"queued" || status == u"running") updateStatus(status);
        else if (status == u"completed") {
            m_terminal = true;
            if (m_outputAsset.isEmpty()) { m_missingOutput = true; updateStatus(QStringLiteral("failed"), QStringLiteral("Workflow finished without producing an output asset.")); }
            else { m_missingOutput = false; updateStatus(status); emit candidate(m_context, m_outputAsset); }
        } else if (status == u"failed" || status == u"timed_out" || status == u"cancelled") {
            m_terminal = true;
            updateStatus(status == u"timed_out" ? QStringLiteral("failed") : status, message.value("error").toString());
        }
    }
}
void WorkflowGeneration::updateStatus(const QString& status, const QString& error) {
    m_status = status; emit statusChanged(status, error);
}
}
