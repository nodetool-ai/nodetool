#pragma once
#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>

namespace nodetool::parity {

// The session ChatComposer.qml reads, without a server: the mode, reasoning
// and permission tables come from the chat module's ComposerRules, as
// ChatSession serves them. send() and stop() report what the composer asked
// for as *Requested signals, which form the harness's intent log, and move
// the turn as the web mount does: a send starts a reply, a stop ends it.
//
// UI thread only.
class ComposerSession : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString draft READ draft WRITE setDraft NOTIFY stateChanged)
    Q_PROPERTY(QString turnStatus READ turnStatus NOTIFY stateChanged)
    Q_PROPERTY(QString selectedThreadId READ selectedThreadId CONSTANT)
    Q_PROPERTY(QString connectionStatus READ connectionStatus CONSTANT)
    Q_PROPERTY(QString error READ error CONSTANT)
    Q_PROPERTY(QString model READ model CONSTANT)
    Q_PROPERTY(QVariantList attachments READ attachments CONSTANT)
    Q_PROPERTY(QString mediaMode READ mediaMode WRITE setMediaMode NOTIFY stateChanged)
    Q_PROPERTY(QVariantList mediaModes READ mediaModes CONSTANT)
    Q_PROPERTY(QVariantList mediaChips READ mediaChips CONSTANT)
    Q_PROPERTY(QString reasoningEffort READ reasoningEffort CONSTANT)
    Q_PROPERTY(bool reasoningSupported READ reasoningSupported CONSTANT)
    Q_PROPERTY(QVariantList reasoningLevels READ reasoningLevels CONSTANT)
    Q_PROPERTY(QString permissionMode READ permissionMode WRITE setPermissionMode NOTIFY stateChanged)
    Q_PROPERTY(QVariantList permissionModes READ permissionModes CONSTANT)
    Q_PROPERTY(QVariantList recentAssets READ recentAssets CONSTANT)
    Q_PROPERTY(QVariantList assetResults READ assetResults CONSTANT)

public:
    explicit ComposerSession(QObject *parent = nullptr) : QObject(parent) {}
    QString draft() const { return draft_; }
    void setDraft(const QString &draft);
    QString turnStatus() const { return turnStatus_; }
    QString selectedThreadId() const { return QStringLiteral("parity-thread"); }
    QString connectionStatus() const { return QStringLiteral("connected"); }
    QString error() const { return {}; }
    QString model() const { return {}; }
    QVariantList attachments() const { return {}; }
    QString mediaMode() const { return mediaMode_; }
    void setMediaMode(const QString &mode);
    QVariantList mediaModes() const;
    QVariantList mediaChips() const { return {}; }
    QString reasoningEffort() const { return {}; }
    bool reasoningSupported() const { return false; }
    QVariantList reasoningLevels() const;
    QString permissionMode() const { return permissionMode_; }
    void setPermissionMode(const QString &mode);
    QVariantList permissionModes() const;
    QVariantList recentAssets() const { return {}; }
    QVariantList assetResults() const { return {}; }

    Q_INVOKABLE void send();
    Q_INVOKABLE void stop();
    Q_INVOKABLE QVariantMap mentionTrigger(const QString &text, int caret) const;
    Q_INVOKABLE QVariantMap removeMention(const QString &text, int start, int end) const;
    Q_INVOKABLE void searchAssets(const QString &query) { (void)query; }
    Q_INVOKABLE void closeAssetSearch() {}

signals:
    void stateChanged();
    void sendRequested(const QString &prompt);
    void stopRequested();

private:
    QString draft_;
    QString turnStatus_ = QStringLiteral("idle");
    QString mediaMode_ = QStringLiteral("chat");
    QString permissionMode_ = QStringLiteral("default");
};

}  // namespace nodetool::parity
