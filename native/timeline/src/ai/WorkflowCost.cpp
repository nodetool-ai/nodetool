#include "ai/WorkflowCost.h"
#include "server/ServerClient.h"
#include <QJsonArray>
#include <algorithm>
#include <cmath>

namespace nt::ai {
namespace {
QString formatUsd(double amount) {
    if (amount <= 0) return QStringLiteral("$0");
    const int places = amount >= 0.01 ? 3 : std::min(12, static_cast<int>(std::ceil(-std::log10(amount))) + 2);
    auto text = QString::number(amount, 'f', places);
    while (text.contains('.') && text.endsWith('0')) text.chop(1);
    if (text.endsWith('.')) text.chop(1);
    return QLatin1Char('$') + text;
}
}
WorkflowCost workflowCostFromPreflight(const QJsonObject& response, const QString& workflowId) {
    WorkflowCost result;
    if (response.value("version").toInt() != 1 || response.value("level").toString() != u"static" ||
        response.value("workflow_id").toString() != workflowId || !response.value("cost").isObject()) {
        result.error = QStringLiteral("Workflow cost estimate is unavailable.");
        return result;
    }
    const auto cost = response.value("cost").toObject();
    const auto confidence = cost.value("confidence").toString();
    const auto amount = cost.value("amount");
    const auto unknown = cost.value("unknown_cost_nodes");
    if ((confidence != u"exact" && confidence != u"estimate" && confidence != u"partial" && confidence != u"unknown") ||
        !unknown.isArray()) {
        result.error = QStringLiteral("Workflow cost estimate is unavailable.");
        return result;
    }
    if (confidence == u"unknown" || amount.isNull()) {
        result.detail = QStringLiteral("Price unavailable.");
        return result;
    }
    if (!amount.isDouble() || !std::isfinite(amount.toDouble()) || amount.toDouble() < 0 ||
        cost.value("currency").toString() != u"USD") {
        result.error = QStringLiteral("Workflow cost estimate is unavailable.");
        return result;
    }
    result.available = true;
    result.label = formatUsd(amount.toDouble());
    const int count = unknown.toArray().size();
    result.lowerBound = confidence == u"partial" || count > 0;
    if (count) {
        result.detail = count == 1 ? QStringLiteral("1 node without a known price is excluded.")
                                   : QStringLiteral("%1 nodes without a known price are excluded.").arg(count);
    }
    return result;
}
WorkflowCost estimateWorkflowCost(nt::server::ServerClient& client, const QString& workflowId,
                                  const QJsonObject& inputs) {
    const auto response = client.preflightWorkflow(workflowId, inputs);
    if (!response.ok()) {
        WorkflowCost result;
        result.error = response.describe();
        return result;
    }
    return workflowCostFromPreflight(response.data.toObject(), workflowId);
}
}
