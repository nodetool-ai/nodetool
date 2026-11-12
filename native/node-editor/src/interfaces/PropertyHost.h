#pragma once
#include <QObject>
#include <QString>
#include <QVariant>

namespace nodetool::node_editor {

// What a property field (PropertyField.qml) reads and does: the selected node,
// whether the document takes edits, the epochs that drop a draft edit, and the
// commit, remove and tool tip requests.
//
// The owner fills the state with the setters and handles the *Requested
// signals. A test can use a plain instance and a QSignalSpy. QML gets a
// non-owning pointer through a required property.
//
// UI thread only.
class PropertyHost : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString selection READ selection NOTIFY selectionChanged)
    Q_PROPERTY(bool readOnly READ readOnly NOTIFY readOnlyChanged)
    // A new document or new credentials drop a field's draft edit.
    Q_PROPERTY(quint64 documentEpoch READ documentEpoch NOTIFY documentEpochChanged)
    Q_PROPERTY(quint64 credentialsEpoch READ credentialsEpoch NOTIFY credentialsEpochChanged)
public:
    explicit PropertyHost(QObject *parent = nullptr);
    ~PropertyHost() override;

    QString selection() const { return selection_; }
    bool readOnly() const { return readOnly_; }
    quint64 documentEpoch() const { return documentEpoch_; }
    quint64 credentialsEpoch() const { return credentialsEpoch_; }

    void setSelection(const QString &selection);
    void setReadOnly(bool readOnly);
    void setDocumentEpoch(quint64 epoch);
    void setCredentialsEpoch(quint64 epoch);

    Q_INVOKABLE void commitProperty(const QString &nodeId, const QString &name, const QVariant &value) {
        emit commitRequested(nodeId, name, value);
    }
    Q_INVOKABLE void removeProperty(const QString &nodeId, const QString &name) { emit removeRequested(nodeId, name); }
    // Empty text hides the tool tip.
    Q_INVOKABLE void showToolTip(const QString &text) { emit toolTipRequested(text); }

signals:
    void selectionChanged();
    void readOnlyChanged();
    void documentEpochChanged();
    void credentialsEpochChanged();
    void commitRequested(const QString &nodeId, const QString &name, const QVariant &value);
    void removeRequested(const QString &nodeId, const QString &name);
    void toolTipRequested(const QString &text);

private:
    QString selection_;
    bool readOnly_ = false;
    quint64 documentEpoch_ = 0;
    quint64 credentialsEpoch_ = 0;
};

}  // namespace nodetool::node_editor
