#pragma once
#include <QHash>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QObject>
#include <QUrl>
#include "ModelPickerCatalog.h"
namespace nodetool::node_editor {
// Owns the authenticated transport and one shared catalog per model field shape.
class ModelPickerController final : public QObject {
 Q_OBJECT
 Q_PROPERTY(bool loading READ loading NOTIFY changed)
 Q_PROPERTY(QString error READ error NOTIFY changed)
public:
 explicit ModelPickerController(QObject* parent = nullptr);
 bool loading() const { return m_pending > 0; }
 QString error() const { return m_error; }
 Q_INVOKABLE void configure(const QUrl& origin, const QString& token, const QString& userId);
 Q_INVOKABLE QObject* catalogFor(const QString& modelType, const QStringList& allowedProviders, const QStringList& tasks);
signals:
 void changed();
private:
 void cancel();
 void query(const QString& procedure, const QJsonObject& input, nt::modelpicker::Catalog::Completion done);
 QString identity() const;
 QNetworkAccessManager m_network;
 QHash<QString, nt::modelpicker::Catalog*> m_catalogs;
 QUrl m_origin;
 QString m_token, m_user, m_error;
 quint64 m_epoch = 0;
 int m_pending = 0;
};
}
