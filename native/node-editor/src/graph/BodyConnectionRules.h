#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QVector>
#include <QtNodes/Definitions>
namespace nodetool {
class WorkflowGraphModel;
struct BodyPort { QString name; QJsonObject type; };
QVector<BodyPort> bodyPorts(const QJsonObject &node,const QJsonObject &metadata,bool output);
bool schemaOnlyInputs(const QString &type);
QString dynamicBodyPortName(const QJsonObject &origin,const QJsonObject &body,
                            const QJsonObject &metadata,bool output);
QJsonObject bodyConnectionCommand(const WorkflowGraphModel &model,
    QtNodes::NodeId source,const QString &sourceHandle,
    QtNodes::NodeId target,const QString &targetHandle,
    QJsonArray prefix={},const QJsonObject &sourceTypeOverride={},
    bool newDynamicInput=false);
}
