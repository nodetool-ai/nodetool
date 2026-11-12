#pragma once
#include <QObject>
#include <QPointer>
#include <QString>
#include <QVariantList>
#include <QVariantMap>

#include "interfaces/GenerationReplay.h"
#include "interfaces/PropertyHost.h"

namespace nodetool::node_editor {

// What the inspector (Inspector.qml) reads and does: the selected node's
// header, fields, ports and help, the run footer, the status line, and the
// close, focus, run and tool tip requests. Its property fields and History tab
// take the two interfaces it holds.
//
// The owner fills the state with the setters and handles the *Requested
// signals. NodeInspector owns `fields` and `history` by value; QML gets
// non-owning pointers to all three through required properties.
//
// UI thread only.
class NodeInspector : public QObject {
    Q_OBJECT
    Q_PROPERTY(nodetool::node_editor::PropertyHost *fields READ fields CONSTANT)
    Q_PROPERTY(nodetool::node_editor::GenerationReplay *history READ history CONSTANT)
    Q_PROPERTY(QString selection READ selection NOTIFY selectionChanged)
    // title, icon, description, inputs and outputs of the selected node.
    Q_PROPERTY(QVariantMap selectionInfo READ selectionInfo NOTIFY selectionInfoChanged)
    // One field descriptor per property (src/properties/PropertyFields.h).
    Q_PROPERTY(QVariantList properties READ properties NOTIFY propertiesChanged)
    // A node_editor::DynamicPortsController for the I/O tab, or null.
    Q_PROPERTY(QObject *dynamicPorts READ dynamicPorts NOTIFY dynamicPortsChanged)
    Q_PROPERTY(bool readOnly READ readOnly NOTIFY readOnlyChanged)
    Q_PROPERTY(QString readOnlyReason READ readOnlyReason NOTIFY readOnlyChanged)
    Q_PROPERTY(QString message READ message NOTIFY messageChanged)
    // Whether the footer offers "Run selected".
    Q_PROPERTY(bool canRun READ canRun NOTIFY canRunChanged)
    // Debounced, so a burst of preview runs does not flicker the run controls.
    Q_PROPERTY(bool running READ running NOTIFY runChanged)
    Q_PROPERTY(QVariantMap runProgress READ runProgress NOTIFY runChanged)
    Q_PROPERTY(QVariantMap costEstimate READ costEstimate NOTIFY runChanged)
public:
    explicit NodeInspector(QObject *parent = nullptr);
    ~NodeInspector() override;

    PropertyHost *fields() { return &fields_; }
    GenerationReplay *history() { return &history_; }
    QString selection() const { return selection_; }
    QVariantMap selectionInfo() const { return selectionInfo_; }
    QVariantList properties() const { return properties_; }
    QObject *dynamicPorts() const { return dynamicPorts_; }
    bool readOnly() const { return !readOnlyReason_.isEmpty(); }
    QString readOnlyReason() const { return readOnlyReason_; }
    QString message() const { return message_; }
    bool canRun() const { return canRun_; }
    bool running() const { return running_; }
    QVariantMap runProgress() const { return runProgress_; }
    QVariantMap costEstimate() const { return costEstimate_; }

    void setSelection(const QString &selection);
    void setSelectionInfo(const QVariantMap &info);
    void setProperties(const QVariantList &properties);
    // Borrowed. The pointer clears itself if the controller dies first.
    void setDynamicPorts(QObject *controller);
    // An empty reason means the document takes edits.
    void setReadOnlyReason(const QString &reason);
    void setMessage(const QString &message);
    void setCanRun(bool canRun);
    void setRunning(bool running);
    void setRunProgress(const QVariantMap &progress);
    void setCostEstimate(const QVariantMap &estimate);

    Q_INVOKABLE void clearSelection() { emit clearSelectionRequested(); }
    Q_INVOKABLE void focusNode() { emit focusNodeRequested(); }
    Q_INVOKABLE void runSelectedNodes(int runs) { emit runSelectedRequested(runs); }
    // Empty text hides the tool tip.
    Q_INVOKABLE void showToolTip(const QString &text) { emit toolTipRequested(text); }

signals:
    void selectionChanged();
    void selectionInfoChanged();
    void propertiesChanged();
    void dynamicPortsChanged();
    void readOnlyChanged();
    void messageChanged();
    void canRunChanged();
    void runChanged();
    void clearSelectionRequested();
    void focusNodeRequested();
    void runSelectedRequested(int runs);
    void toolTipRequested(const QString &text);

private:
    PropertyHost fields_;
    GenerationReplay history_;
    QString selection_;
    QVariantMap selectionInfo_;
    QVariantList properties_;
    QPointer<QObject> dynamicPorts_;
    QString readOnlyReason_;
    QString message_;
    bool canRun_ = true;
    bool running_ = false;
    QVariantMap runProgress_;
    QVariantMap costEstimate_;
};

}  // namespace nodetool::node_editor
