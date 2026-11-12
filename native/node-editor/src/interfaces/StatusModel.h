#pragma once
#include <QObject>
#include <QString>
#include <QVariantMap>

namespace nodetool::node_editor {

// What the status bar (StatusBar.qml) reads and does about the server and the
// graph: the connection, the node and edge counts, the queue count, the system
// readout, and the connect, reconnect, queue and tool tip requests. The bar's
// panel tabs come from PanelLayout. The workflow browser and the asset library
// read the connection and send the connect request too, and the run output
// shows the message.
//
// The owner fills the state with setStatus and handles the *Requested
// signals. A test can use a plain instance and a QSignalSpy. QML gets a
// non-owning pointer through a required property.
//
// UI thread only.
class StatusModel : public QObject {
    Q_OBJECT
    // idle, connecting, connected, offline and the other WorkflowSession states.
    Q_PROPERTY(QString connectionStatus READ connectionStatus NOTIFY statusChanged)
    Q_PROPERTY(QString connectionDetail READ connectionDetail NOTIFY statusChanged)
    // The session holds a live server connection.
    Q_PROPERTY(bool connected READ connected NOTIFY statusChanged)
    // The editor's last status or error message, which the run output shows.
    Q_PROPERTY(QString message READ message NOTIFY statusChanged)
    Q_PROPERTY(int nodeCount READ nodeCount NOTIFY statusChanged)
    Q_PROPERTY(int edgeCount READ edgeCount NOTIFY statusChanged)
    Q_PROPERTY(int queuedCount READ queuedCount NOTIFY statusChanged)
    // Whether the queue view can open: jobs are queued or running.
    Q_PROPERTY(bool queueAvailable READ queueAvailable NOTIFY statusChanged)
    // The server's system stats: cpu_percent, memory_used_gb or memory_percent, and the GPU fields.
    Q_PROPERTY(QVariantMap systemStats READ systemStats NOTIFY statusChanged)
public:
    // One field per readout, so the owner sets them in one call.
    struct Status {
        QString connectionStatus = QStringLiteral("idle");
        QString connectionDetail;
        bool connected = false;
        QString message;
        int nodeCount = 0;
        int edgeCount = 0;
        int queuedCount = 0;
        bool queueAvailable = false;
        QVariantMap systemStats;
        bool operator==(const Status &) const = default;
    };

    explicit StatusModel(QObject *parent = nullptr);
    ~StatusModel() override;

    QString connectionStatus() const { return status_.connectionStatus; }
    QString connectionDetail() const { return status_.connectionDetail; }
    bool connected() const { return status_.connected; }
    QString message() const { return status_.message; }
    int nodeCount() const { return status_.nodeCount; }
    int edgeCount() const { return status_.edgeCount; }
    int queuedCount() const { return status_.queuedCount; }
    bool queueAvailable() const { return status_.queueAvailable; }
    QVariantMap systemStats() const { return status_.systemStats; }

    void setStatus(const Status &status);

    // Connects to the chosen server, or retries now after it went offline.
    Q_INVOKABLE void connectServer() { emit connectRequested(); }
    Q_INVOKABLE void reconnect() { emit reconnectRequested(); }
    Q_INVOKABLE void openQueue() { emit queueRequested(); }
    // Empty text hides the tool tip.
    Q_INVOKABLE void showToolTip(const QString &text) { emit toolTipRequested(text); }

signals:
    void statusChanged();
    void connectRequested();
    void reconnectRequested();
    void queueRequested();
    void toolTipRequested(const QString &text);

private:
    Status status_;
};

}  // namespace nodetool::node_editor
