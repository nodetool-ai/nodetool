#pragma once
#include <QJsonArray>
#include <QHash>
#include <QJsonObject>
#include <QObject>
#include <QUndoStack>
#include <QStringList>
#include <vector>

namespace nodetool::node_editor {
struct EditResult {
    bool ok = false;
    QString error;
    QJsonObject idMap;
    explicit operator bool() const { return ok; }
};

// Canonical protocol JSON, never QtNodes scene JSON. Unknown members are retained.
// Commands: batch(commands), addNode(node), addEdge(edge), removeNodes(ids),
// addLink(link), linkNodes(ids: exactly two[,id,label,kind]), removeLink(id),
// insertReroute(id,position:{x,y}) returns idMap.reroute/idMap.upstreamEdge,
// reconnectEdge(id,connection: {source,target,sourceHandle,targetHandle}),
// removeEdge(id), moveNodes(positions: {id: {x,y}}), setProperty(id,name,value),
// setDisabled(ids,disabled) expands groups to runnable descendants, setNodeField(id,field,value), paste(fragment,offset).
// groupNodes(ids[,id,title,sizes: {id: {width,height}}]) returns idMap.group, ungroupNodes(ids) removes
// frames and promotes children, detachNodes(ids) keeps frames. Group sizes are
// measured finite positive dimensions used only for bounds. renameNode(id,title)
// writes group data.headline or ordinary ui_properties.title. setComment(id,value)
// accepts markdown or Lexical JSON. moveNodes uses relative coordinates unless
// space:"absolute" is supplied. Imported nested groups remain supported.
// addDynamicInput(id,name[,type,value]), addDynamicOutput(id,name,type),
// renameDynamicInput/Output(id,name,newName), removeDynamicInput/Output(id,name).
class WorkflowDocument final : public QObject {
    Q_OBJECT
public:
    explicit WorkflowDocument(QObject* parent = nullptr);
    // Canonical NodeMetadata entries (node_type, properties, outputs). Session state,
    // outside undo. Missing metadata refuses new connections, preserving imports.
    void setNodeMetadata(const QJsonArray& metadata);
    void applyPropertyDefaults(const QHash<QString, QJsonObject>& defaults);
    [[nodiscard]] EditResult load(const QJsonObject& workflow);
    void reconcileMetadata(const QJsonObject& workflow);
    [[nodiscard]] EditResult loadJson(const QByteArray& json);
    [[nodiscard]] QJsonObject snapshot() const;
    [[nodiscard]] qsizetype nodeCount() const { return static_cast<qsizetype>(nodeValues_.size()); }
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
    const QUndoStack* undoStack() const { return &undo_; }
public slots:
    void undo() { undo_.undo(); }
    void redo() { undo_.redo(); }
signals:
    void replaced();
    void changed();
private:
    friend class DocumentEdit;
    friend class NodeDeltaEdit;
    friend class EdgeDeltaEdit;
    void appendEdge(const QJsonObject& value);
    void popEdge();
    void rebuildGraph();
    void writeNode(const QString& id, const QJsonObject& value);
    void restore(const QJsonObject& value);
    mutable QJsonObject workflow_;
    std::vector<QJsonObject> nodeValues_;
    std::vector<QJsonObject> edgeValues_;
    QHash<QString, qsizetype> edgeIndices_;
    QHash<QString, QStringList> outgoing_;
    QHash<QString, qsizetype> nodeIndices_;
    // JSON is materialized only at a snapshot boundary, never for undo storage.
    mutable bool graphDirty_ = false;
    QHash<QString, QJsonObject> metadata_;
    QString readOnlyReason_;
    QUndoStack undo_;
};
}
