#pragma once
#include <QObject>
#include <QString>
#include <QVariantList>

namespace nodetool::node_editor {

// What the first-workflow guide (SetupGuide.qml) reads and does: whether it
// shows, whether the user started it, which of its steps are complete, and the
// guide actions ("starter", "choose", "templates", "close-guide").
//
// The owner fills the state with setState and handles actionRequested. A test
// can use a plain instance and a QSignalSpy. QML gets a non-owning pointer
// through a required property.
//
// UI thread only.
class FirstWorkflowGuide : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool visible READ visible NOTIFY stateChanged)
    Q_PROPERTY(bool started READ started NOTIFY stateChanged)
    // One bool per guide step, in order.
    Q_PROPERTY(QVariantList readiness READ readiness NOTIFY stateChanged)
public:
    explicit FirstWorkflowGuide(QObject *parent = nullptr);
    ~FirstWorkflowGuide() override;

    bool visible() const { return visible_; }
    bool started() const { return started_; }
    QVariantList readiness() const { return readiness_; }

    void setState(bool visible, bool started, const QVariantList &readiness);

    Q_INVOKABLE void run(const QString &action) { emit actionRequested(action); }

signals:
    void stateChanged();
    void actionRequested(const QString &action);

private:
    bool visible_ = false;
    bool started_ = false;
    QVariantList readiness_;
};

}  // namespace nodetool::node_editor
