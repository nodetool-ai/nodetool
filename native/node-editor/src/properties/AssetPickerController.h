#pragma once
#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QPointer>
#include <QVariantList>
namespace nodetool::node_editor {
class AssetPickerController final : public QObject {
 Q_OBJECT
public:
 explicit AssetPickerController(QObject* parent = nullptr);
 Q_INVOKABLE void configure(const QUrl& origin, const QString& token, const QString& userId);
 Q_INVOKABLE void search(const QString& key, const QString& kind, const QString& text, const QString& cursor = {});
 Q_INVOKABLE void upload(const QString& key, const QString& kind, const QUrl& file, const QString& workflowId = {});
 Q_INVOKABLE void cancel(const QString& key);
    Q_INVOKABLE void describe(const QString& key, const QString& id);
signals:
    void described(QString key, QVariantMap asset);
 void cleared();
 void listed(QString key, QVariantList assets, QString nextCursor);
 void uploaded(QString key, QVariantMap reference);
 void progress(QString key, qint64 sent, qint64 total);
 void failed(QString key, QString message);
private:
 QNetworkRequest request(const QUrl& url) const;
 bool ready(const QString& key, const QString& kind);
 quint64 begin(const QString& key);
 bool current(const QString& key, quint64 serial) const;
 QNetworkAccessManager m_network;
 QUrl m_origin;
 QString m_token, m_user;
 QHash<QString, QPointer<QNetworkReply>> m_replies;
 QHash<QString, quint64> m_serials;
 quint64 m_next = 0;
};
}
