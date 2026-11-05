#pragma once
#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QPointer>
#include <QVariantList>

namespace nodetool::node_editor {
class DocumentPickerController final : public QObject {
    Q_OBJECT
public:
    explicit DocumentPickerController(QObject* parent = nullptr);
    Q_INVOKABLE void configure(const QUrl& origin, const QString& token, const QString& user);
    Q_INVOKABLE void cancel(const QString& key);
    Q_INVOKABLE void load(const QString& key, const QString& kind);
    Q_INVOKABLE QUrl targetUrl(const QString& kind, const QString& id) const;
    Q_INVOKABLE bool open(const QString& kind, const QString& id);
signals:
    void cleared();
    void listed(QString key, QVariantList rows);
    void failed(QString key, QString message);
private:
    void request(const QString& key, const QString& kind);
    QNetworkAccessManager network_;
    QUrl origin_;
    QString token_;
    QString user_;
    QHash<QString, QPointer<QNetworkReply>> replies_;
    QHash<QString, quint64> epochs_;
    quint64 nextEpoch_ = 0;
};
}
