#pragma once
#include "document/WorkflowDocument.h"
#include <QPointer>
#include <QVariantList>

namespace nodetool::node_editor {
class DynamicPortsController final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString selectedNode READ selectedNode WRITE setSelectedNode NOTIFY changed)
    Q_PROPERTY(QVariantList inputs READ inputs NOTIFY changed)
    Q_PROPERTY(QVariantList outputs READ outputs NOTIFY changed)
    Q_PROPERTY(bool supportsInputs READ supportsInputs NOTIFY changed)
    Q_PROPERTY(bool supportsOutputs READ supportsOutputs NOTIFY changed)
    Q_PROPERTY(bool readOnly READ readOnly NOTIFY changed)
    Q_PROPERTY(QVariantList inputTypes READ inputTypes NOTIFY changed)
    Q_PROPERTY(QVariantList outputTypes READ outputTypes NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit DynamicPortsController(WorkflowDocument* document, QObject* parent = nullptr);
    void setNodeMetadata(const QJsonArray& metadata);
    QString selectedNode() const { return selectedNode_; }
    void setSelectedNode(const QString& id);
    QVariantList inputs() const { return rows(false); }
    QVariantList outputs() const { return rows(true); }
    bool supportsInputs() const;
    bool supportsOutputs() const;
    bool readOnly() const;
    QString error() const { return error_; }
    QVariantList inputTypes() const;
    QVariantList outputTypes() const;
    Q_INVOKABLE bool addPort(bool output, const QString& name, const QString& type = {});
    Q_INVOKABLE bool renamePort(bool output, const QString& name, const QString& newName);
    Q_INVOKABLE bool removePort(bool output, const QString& name);
    Q_INVOKABLE bool setPortType(const QString& name, const QString& type);
    Q_INVOKABLE void clearError();
signals:
    void changed();
private:
    QVariantList rows(bool output) const;
    bool apply(QJsonObject command);
    QJsonObject definition() const;
    QPointer<WorkflowDocument> document_;
    QHash<QString, QJsonObject> metadata_;
    QString selectedNode_, error_;
};
}
