#pragma once
#include <QObject>
#include <QString>
#include <QVariant>

namespace nodetool::node_editor {

// What a property field (PropertyField.qml) reads and does: the selected node,
// whether the document takes edits, the epochs that drop a draft edit, and the
// commit, remove and tool tip requests, and the media resolver and pickers
// the property editors use.
//
// The owner fills the state with the setters and handles the *Requested
// signals. A test can use a plain instance and a QSignalSpy. QML gets a
// non-owning pointer through a required property.
//
// The services are borrowed: their owner keeps them alive while this host
// lives, and a test leaves out the ones it does not use. They are QObject
// pointers because their classes live in node_editor_core, outside this
// library.
//
// UI thread only.
class PropertyHost : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString selection READ selection NOTIFY selectionChanged)
    Q_PROPERTY(bool readOnly READ readOnly NOTIFY readOnlyChanged)
    // A new document or new credentials drop a field's draft edit.
    Q_PROPERTY(quint64 documentEpoch READ documentEpoch NOTIFY documentEpochChanged)
    Q_PROPERTY(quint64 credentialsEpoch READ credentialsEpoch NOTIFY credentialsEpochChanged)
    // MediaResolver: previews of media values.
    Q_PROPERTY(QObject *media READ media NOTIFY servicesChanged)
    // ModelPickerController, AssetPickerController, ResourcePickerController
    // and DocumentPickerController.
    Q_PROPERTY(QObject *modelPicker READ modelPicker NOTIFY servicesChanged)
    Q_PROPERTY(QObject *assetPicker READ assetPicker NOTIFY servicesChanged)
    Q_PROPERTY(QObject *resourcePicker READ resourcePicker NOTIFY servicesChanged)
    Q_PROPERTY(QObject *documentPicker READ documentPicker NOTIFY servicesChanged)
public:
    struct Services {
        QObject *media = nullptr;
        QObject *modelPicker = nullptr;
        QObject *assetPicker = nullptr;
        QObject *resourcePicker = nullptr;
        QObject *documentPicker = nullptr;
        bool operator==(const Services &) const = default;
    };

    explicit PropertyHost(QObject *parent = nullptr);
    ~PropertyHost() override;

    QString selection() const { return selection_; }
    bool readOnly() const { return readOnly_; }
    quint64 documentEpoch() const { return documentEpoch_; }
    quint64 credentialsEpoch() const { return credentialsEpoch_; }
    QObject *media() const { return services_.media; }
    QObject *modelPicker() const { return services_.modelPicker; }
    QObject *assetPicker() const { return services_.assetPicker; }
    QObject *resourcePicker() const { return services_.resourcePicker; }
    QObject *documentPicker() const { return services_.documentPicker; }

    void setSelection(const QString &selection);
    void setReadOnly(bool readOnly);
    void setDocumentEpoch(quint64 epoch);
    void setCredentialsEpoch(quint64 epoch);
    void setServices(const Services &services);

    Q_INVOKABLE void commitProperty(const QString &nodeId, const QString &name, const QVariant &value) {
        emit commitRequested(nodeId, name, value);
    }
    // A field edit that ended when the field lost focus. It lands on the node the
    // field was editing, although the press that took the focus has meanwhile
    // selected another node.
    Q_INVOKABLE void commitFinishedEdit(const QString &nodeId, const QString &name, const QVariant &value) {
        emit finishedEditRequested(nodeId, name, value);
    }
    Q_INVOKABLE void removeProperty(const QString &nodeId, const QString &name) { emit removeRequested(nodeId, name); }
    // Empty text hides the tool tip.
    Q_INVOKABLE void showToolTip(const QString &text) { emit toolTipRequested(text); }

signals:
    void selectionChanged();
    void readOnlyChanged();
    void documentEpochChanged();
    void credentialsEpochChanged();
    void servicesChanged();
    void commitRequested(const QString &nodeId, const QString &name, const QVariant &value);
    void finishedEditRequested(const QString &nodeId, const QString &name, const QVariant &value);
    void removeRequested(const QString &nodeId, const QString &name);
    void toolTipRequested(const QString &text);

private:
    QString selection_;
    bool readOnly_ = false;
    quint64 documentEpoch_ = 0;
    quint64 credentialsEpoch_ = 0;
    Services services_;
};

}  // namespace nodetool::node_editor
