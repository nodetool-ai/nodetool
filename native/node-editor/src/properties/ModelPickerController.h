#pragma once
#include <QObject>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QVariantList>
#include <functional>
namespace nodetool::node_editor {
class ModelPickerController final : public QObject {
 Q_OBJECT
 Q_PROPERTY(QVariantList models READ models NOTIFY changed)
 Q_PROPERTY(bool loading READ loading NOTIFY changed)
 Q_PROPERTY(QString error READ error NOTIFY changed)
public:
 explicit ModelPickerController(QObject* parent = nullptr);
 QVariantList models() const;
 bool loading() const { return m_pending > 0; }
 QString error() const { return m_error; }
 Q_INVOKABLE void configure(const QUrl& origin, const QString& token, const QString& userId);
 Q_INVOKABLE void refresh();
 Q_INVOKABLE void cancel();
signals:
 void changed();
private:
 void query(const QString& procedure, const QJsonObject& input, std::function<void(QJsonArray)> done);
 QNetworkAccessManager m_network;
 QUrl m_origin;
 QString m_token, m_user, m_error;
 QJsonArray m_models;
 quint64 m_epoch = 0;
 int m_pending = 0;
};
}
