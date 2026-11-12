#pragma once

// First-use setup of the music backend (docs/MUSIC-MODE.md section 12.4,
// section 15, BE-5): whether the NodeTool server has ace-server installed and
// the ACE-Step models downloaded, and the commands that install and download
// them. The music panel shows this in place of the Generate button until the
// backend can run the chosen operation.
//
// It speaks the server's setup RPCs over its own WebSocket session
// (GenerationTransport, the socket MusicJobs uses): `acestep_setup_status`,
// `acestep_install`, `acestep_download_models {set}` and
// `acestep_setup_cancel`, each answered by an `rpc_response` whose `result`
// is `{accepted, reason, status}` (packages/websocket/src/session/commands.ts,
// aceStepSetupResultSchema in packages/protocol/src/ws-commands.ts). While an
// operation this session started runs, the server pushes
// `acestep_setup_progress` frames to this socket. A status poll every 2
// seconds covers an operation another session started. A server with a
// remote ace-server (`status.remote`) needs no setup.
//
// Thread affinity: GUI thread only. TimelineEditor.qml creates one per editor
// window as `musicSetup`, and its QML parent owns it. The transport, the poll
// timer and the socket are members, destroyed with it, which also closes the
// socket and drops every pending reply. A failed or lost connection drops
// the commands queued for it, so a later request opens a new connection.

#include "ai/GenerationTransport.h"
#include "server/AutosaveController.h"

#include <QJsonObject>
#include <QObject>
#include <QSet>
#include <QTimer>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

#include <optional>
#include <utility>
#include <vector>

class TestMusicWire;

class MusicSetupModel : public QObject {
    Q_OBJECT
    QML_ELEMENT
    // "offline": no server timeline is open. "checking": the first status is
    // on its way. "ready": the binary and the first-run models are on disk.
    // "remote": a remote ace-server serves requests. "setup": something is
    // missing. "error": the server could not be asked.
    Q_PROPERTY(QString state READ state NOTIFY changed)
    // Generate and Regenerate can run.
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    // Add instrument can run: ready, and the base DiT is on disk (or remote).
    Q_PROPERTY(bool addInstrumentReady READ addInstrumentReady NOTIFY changed)
    Q_PROPERTY(bool remote READ remote NOTIFY changed)
    Q_PROPERTY(bool binaryInstalled READ binaryInstalled NOTIFY changed)
    // Why the binary cannot be installed here, in plain words; empty when it can.
    Q_PROPERTY(QString blockedReason READ blockedReason NOTIFY changed)
    Q_PROPERTY(bool modelsAvailable READ modelsAvailable NOTIFY changed)
    Q_PROPERTY(bool firstRunModelsPresent READ firstRunModelsPresent NOTIFY changed)
    Q_PROPERTY(double firstRunBytes READ firstRunBytes NOTIFY changed)
    Q_PROPERTY(double firstRunMissingBytes READ firstRunMissingBytes NOTIFY changed)
    Q_PROPERTY(double addInstrumentMissingBytes READ addInstrumentMissingBytes NOTIFY changed)
    // The running or last setup operation: {kind, set, state, stage, percent
    // (-1 when unknown), downloadedBytes, totalBytes, error}; empty when none.
    Q_PROPERTY(QVariantMap operation READ operation NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    // The last refusal or error, in plain words.
    Q_PROPERTY(QString message READ message NOTIFY changed)

public:
    static constexpr int kPollIntervalMs = 2000;

    explicit MusicSetupModel(QObject* parent = nullptr);
    ~MusicSetupModel() override;
    MusicSetupModel(const MusicSetupModel&) = delete;
    MusicSetupModel& operator=(const MusicSetupModel&) = delete;

    QString state() const { return m_state; }
    bool ready() const { return m_state == u"ready" || m_state == u"remote"; }
    bool addInstrumentReady() const;
    bool remote() const { return m_state == u"remote"; }
    bool binaryInstalled() const;
    QString blockedReason() const;
    bool modelsAvailable() const;
    bool firstRunModelsPresent() const;
    double firstRunBytes() const;
    double firstRunMissingBytes() const;
    double addInstrumentMissingBytes() const;
    QVariantMap operation() const;
    bool busy() const;
    QString message() const { return m_message; }

    // Asks for the status. Opens the socket when needed.
    Q_INVOKABLE void refresh();
    Q_INVOKABLE void install();
    // `set` is "first_run" or "add_instrument".
    Q_INVOKABLE void downloadModels(const QString& set);
    Q_INVOKABLE void cancel();
    // "7.7 GB", "640 MB".
    Q_INVOKABLE static QString formatBytes(double bytes);

signals:
    void changed();

private:
    friend class ::TestMusicWire;
    void send(const QString& command, const QJsonObject& data = {});
    void sendPending();
    void receive(const QJsonObject& message);
    void applyStatus(const QJsonObject& status);
    void applyOperation(const QJsonObject& operation);
    void setMessage(const QString& message);
    void setState(const QString& state);
    void updatePolling();

    std::optional<nt::server::SaveTarget> m_target;
    nt::ai::GenerationTransport m_transport;
    QTimer m_poll;
    // A connection attempt is on its way; another would abort it.
    bool m_opening = false;
    QString m_state = QStringLiteral("offline");
    QJsonObject m_status;
    QJsonObject m_operation;
    QString m_message;
    QSet<QString> m_requests;
    std::vector<std::pair<QString, QJsonObject>> m_pending;
};
