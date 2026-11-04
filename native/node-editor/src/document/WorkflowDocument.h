#pragma once
#include <QJsonArray>
#include <QHash>
#include <QJsonObject>
#include <QObject>
#include <QUndoStack>
#include <QStringList>

namespace nodetool::node_editor {
struct EditResult {
    bool ok = false;
    QString error;
    QJsonObject idMap;
    explicit operator bool() const { return ok; }
};

// Canonical protocol JSON, never QtNodes scene JSON. Unknown members are retained.
// Commands: batch(commands), addNode(node), addEdge(edge), removeNodes(ids),
// removeEdge(id), moveNodes(positions: {id: {x,y}}), setProperty(id,name,value),
// setDisabled(ids,disabled), setNodeField(id,field,value), paste(fragment,offset).
// addDynamicInput(id,name[,type,value]), addDynamicOutput(id,name,type),
// renameDynamicInput/Output(id,name,newName), removeDynamicInput/Output(id,name).
class WorkflowDocument final : public QObject {
    Q_OBJECT
public:
    explicit WorkflowDocument(QObject* parent = nullptr);
    // Canonical NodeMetadata entries (node_type, properties, outputs). Session state,
    // outside undo. Missing metadata refuses new connections, preserving imports.
    void setNodeMetadata(const QJsonArray& metadata);
    [[nodiscard]] EditResult load(const QJsonObject& workflow);
    void reconcileMetadata(const QJsonObject& workflow);
    [[nodiscard]] EditResult loadJson(const QByteArray& json);
    [[nodiscard]] QJsonObject snapshot() const { return workflow_; }
    [[nodiscard]] QJsonObject graph() const;
    [[nodiscard]] QJsonArray nodes() const;
    [[nodiscard]] QJsonArray edges() const;
    [[nodiscard]] QJsonObject node(const QString& id) const;
    [[nodiscard]] QJsonObject copy(const QStringList& ids) const;
    [[nodiscard]] EditResult applyCommand(const QJsonObject& command, const QString& label = {});
    [[nodiscard]] EditResult duplicate(const QStringList& ids);
    [[nodiscard]] bool isReadOnly() const { return !readOnlyReason_.isEmpty(); }
    [[nodiscard]] QString readOnlyReason() const { return readOnlyReason_; }
    QUndoStack* undoStack() { return &undo_; }
public slots:
    void undo() { undo_.undo(); }
    void redo() { undo_.redo(); }
signals:
    void changed();
private:
    friend class DocumentEdit;
    void restore(const QJsonObject& value);
    QJsonObject workflow_;
    QHash<QString, QJsonObject> metadata_;
    QString readOnlyReason_;
    QUndoStack undo_;
};
}
