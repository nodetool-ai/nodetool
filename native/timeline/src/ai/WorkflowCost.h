#pragma once
#include <QJsonObject>
#include <QString>

namespace nt::server { class ServerClient; }
namespace nt::ai {
// Preflight prices the saved graph; it does not execute a workflow or provider.
struct WorkflowCost {
    bool available = false;
    bool lowerBound = false;
    QString label;
    QString detail;
    QString error;
};
WorkflowCost workflowCostFromPreflight(const QJsonObject& response, const QString& workflowId);
WorkflowCost estimateWorkflowCost(nt::server::ServerClient& client, const QString& workflowId,
                                  const QJsonObject& inputs = {});
}
