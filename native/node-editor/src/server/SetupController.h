#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QUrl>
#include <functional>
namespace nodetool::node_editor {
class SetupController final : public QObject {
    Q_OBJECT
    Q_PROPERTY(
        bool firstWorkflowEligible READ firstWorkflowEligible NOTIFY changed)
    Q_PROPERTY(QVariantList templates READ templates NOTIFY changed)
    Q_PROPERTY(QVariantList packs READ packs NOTIFY changed)
    Q_PROPERTY(QString state READ state NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit SetupController(QObject *parent = nullptr) : QObject(parent) {
    }
    bool firstWorkflowEligible() const {
        return firstWorkflowEligible_;
    }
    QVariantList templates() const {
        return templates_.toVariantList();
    }
    Q_INVOKABLE void browseTemplates();
    Q_INVOKABLE void chooseTemplate(int index);
    QVariantList packs() const {
        return packs_.toVariantList();
    }
    QString state() const {
        return state_;
    }
    QString error() const {
        return error_;
    }
    QJsonObject statuses() const {
        return statuses_;
    }
    void configure(const QUrl &origin, const QString &token,
                   const QString &user);
    Q_INVOKABLE void refresh();
    Q_INVOKABLE void enable(const QString &id);
    Q_INVOKABLE void retry() {
        if (!last_.isEmpty()) {
            enable(last_);
        } else {
            refresh();
        }
    }
    Q_INVOKABLE void cancel();
signals:
    void changed();
    void templateChosen(QJsonObject workflow);
    void registryRefreshRequested();

private:
    void request(const QString &route, const QJsonObject &body, bool mutation,
                 std::function<void(QJsonObject)> done,
                 bool identityOnly = false);
    QNetworkAccessManager network_;
    QUrl origin_;
    QString token_, user_, state_, error_, last_;
    QJsonArray packs_, templates_;
    QJsonObject statuses_;
    quint64 epoch_ = 0, identityEpoch_ = 0;
    bool firstWorkflowEligible_ = false;
};
} // namespace nodetool::node_editor
