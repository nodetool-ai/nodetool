#pragma once
#include <QObject>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class ModelCatalogController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QString mode READ mode WRITE setMode NOTIFY changed)
    Q_PROPERTY(QString modelScope READ modelScope WRITE setModelScope NOTIFY changed)
    Q_PROPERTY(QVariantList models READ models NOTIFY changed)
    Q_PROPERTY(bool loading READ loading NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString selectedModelId READ selectedModelId NOTIFY changed)
    Q_PROPERTY(QString selectedProvider READ selectedProvider NOTIFY changed)
    Q_PROPERTY(QString selectedModelType READ selectedModelType NOTIFY changed)
    Q_PROPERTY(QVariantMap constraints READ constraints NOTIFY changed)
public:
    explicit ModelCatalogController(QObject* parent = nullptr);
    QString mode() const { return m_mode; }
    void setMode(const QString& mode);
    QString modelScope() const { return m_modelScope; }
    void setModelScope(const QString& scope);
    QVariantList models() const { return m_models; }
    bool loading() const { return m_loading; }
    QString error() const { return m_error; }
    QString selectedModelId() const { return m_selected.value("id").toString(); }
    QString selectedProvider() const { return m_selected.value("provider").toString(); }
    QString selectedModelType() const { return m_selected.value("modelType").toString(); }
    QVariantMap constraints() const;
    Q_INVOKABLE void configure(const QUrl& server, const QString& token = {});
    Q_INVOKABLE void reload();
    Q_INVOKABLE void selectModel(const QString& id, const QString& provider);
signals:
    void changed();
private:
    void restoreSelection();
    QString m_mode = QStringLiteral("video");
    QString m_modelScope = QStringLiteral("local");
    QUrl m_server;
    QString m_token;
    QVariantList m_models;
    QVariantMap m_selected;
    QString m_error;
    bool m_loading = false;
    quint64 m_revision = 0;
};
