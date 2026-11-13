#pragma once
#include <QObject>
#include <QString>
#include <QStringList>

namespace nodetool::node_editor {

// What the node info panel (NodeInfoPanel.qml, web NodeInfoPanel.tsx) reads
// and does: one node's title, namespace, description, tags, use cases and run
// error, and the close, focus, namespace and tag requests.
//
// The owner fills the state with setNode and handles the *Requested signals.
// An empty nodeId means no node is shown. QML gets a non-owning pointer
// through a required property.
//
// UI thread only.
class NodeInfo : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString nodeId READ nodeId NOTIFY changed)
    Q_PROPERTY(QString title READ title NOTIFY changed)
    Q_PROPERTY(QString nodeNamespace READ nodeNamespace NOTIFY changed)
    Q_PROPERTY(QString description READ description NOTIFY changed)
    Q_PROPERTY(QStringList tags READ tags NOTIFY changed)
    Q_PROPERTY(QStringList useCases READ useCases NOTIFY changed)
    Q_PROPERTY(QString errorMessage READ errorMessage NOTIFY changed)
    // The tallest the panel may grow, in pixels. The owner sets it from the room
    // below the panel's top edge.
    Q_PROPERTY(qreal maximumHeight READ maximumHeight NOTIFY maximumHeightChanged)
public:
    explicit NodeInfo(QObject *parent = nullptr);
    ~NodeInfo() override;

    QString nodeId() const { return nodeId_; }
    QString title() const { return title_; }
    QString nodeNamespace() const { return namespace_; }
    QString description() const { return description_; }
    QStringList tags() const { return tags_; }
    QStringList useCases() const { return useCases_; }
    QString errorMessage() const { return errorMessage_; }
    qreal maximumHeight() const { return maximumHeight_; }

    // documentation is the node type's full description, split as the web
    // splits it (graph/NodeDocumentation.h).
    void setNode(const QString &nodeId, const QString &title, const QString &nodeNamespace,
                 const QString &documentation, const QString &errorMessage);
    void clear();
    void setMaximumHeight(qreal height);

    Q_INVOKABLE void close() { emit closeRequested(); }
    Q_INVOKABLE void focusNode() { emit focusRequested(); }
    Q_INVOKABLE void showNamespace() { emit namespaceRequested(namespace_); }
    Q_INVOKABLE void searchTag(const QString &tag) { emit tagSearchRequested(tag.trimmed()); }

signals:
    void changed();
    void maximumHeightChanged();
    void closeRequested();
    void focusRequested();
    void namespaceRequested(const QString &nodeNamespace);
    void tagSearchRequested(const QString &tag);

private:
    QString nodeId_;
    QString title_;
    QString namespace_;
    QString description_;
    QStringList tags_;
    QStringList useCases_;
    QString errorMessage_;
    qreal maximumHeight_ = 0;
};

}  // namespace nodetool::node_editor
