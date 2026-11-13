#pragma once
#include <QObject>
#include <QPointF>
#include <QVariantMap>

namespace nodetool::node_editor {

// What the selection toolbar (SelectionToolbar.qml) reads and does about the
// canvas selection: how many items are selected, what the single selected
// item is, whether the selection is disabled, and the node menu request.
//
// The owner fills the state with setSelection and handles the *Requested
// signals. A test can use a plain instance and a QSignalSpy. QML gets a
// non-owning pointer through a required property.
//
// UI thread only.
class Selection : public QObject {
    Q_OBJECT
    Q_PROPERTY(int count READ count NOTIFY selectionChanged)
    // kind, title and childGraph of a single selected item, or empty.
    Q_PROPERTY(QVariantMap info READ info NOTIFY selectionChanged)
    // Every selected node is disabled.
    Q_PROPERTY(bool disabled READ disabled NOTIFY selectionChanged)
    // Most selected nodes are disabled, so the toggle offers Enable.
    Q_PROPERTY(bool mostlyDisabled READ mostlyDisabled NOTIFY selectionChanged)
public:
    explicit Selection(QObject *parent = nullptr);
    ~Selection() override;

    int count() const { return count_; }
    QVariantMap info() const { return info_; }
    bool disabled() const { return disabled_; }
    bool mostlyDisabled() const { return mostlyDisabled_; }

    void setSelection(int count, const QVariantMap &info, bool disabled, bool mostlyDisabled);

    // The node's More menu, at a global position.
    Q_INVOKABLE void showNodeMenu(const QPointF &global) { emit nodeMenuRequested(global); }

signals:
    void selectionChanged();
    void nodeMenuRequested(const QPointF &global);

private:
    int count_ = 0;
    QVariantMap info_;
    bool disabled_ = false;
    bool mostlyDisabled_ = false;
};

}  // namespace nodetool::node_editor
