#pragma once
#include "Mounts.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QQmlEngine>
#include <QQuickView>
#include <QSignalSpy>
#include <QString>
#include <memory>
#include <vector>

namespace nodetool::parity {

// Runs parity harness commands against one editor QML component at a time.
// Each command is one JSON object and gets one JSON object back (see
// native/parity/README.md for the protocol).
//
// The host owns the view, the current mount and the intent spies. A mount is
// replaced only after the QML root that borrows its interfaces is gone.
//
// UI thread only.
class ParityHost : public QObject {
    Q_OBJECT
public:
    explicit ParityHost(QObject *parent = nullptr);
    ~ParityHost() override;

    QJsonObject handle(const QJsonObject &command);

private:
    QJsonObject mount(const QJsonObject &command);
    QJsonObject act(const QJsonObject &command);
    QJsonObject observe(const QJsonObject &command);
    void unmount();
    void settle();
    QJsonArray drainIntents();
    QQuickItem *findTarget(const QString &name) const;

    // A *Requested signal and how many of its emissions the log already holds.
    struct IntentSpy {
        QString name;
        std::unique_ptr<QSignalSpy> spy;
        qsizetype taken = 0;
    };

    QString theme_ = "dark";
    // One engine for every mount keeps compiled QML types between scenarios.
    // Declared first so it outlives the view and the mount.
    std::unique_ptr<QQmlEngine> engine_;
    std::unique_ptr<Mount> mount_;
    std::unique_ptr<QQuickView> view_;
    std::vector<IntentSpy> spies_;
    QJsonArray pendingIntents_;
};

}  // namespace nodetool::parity
