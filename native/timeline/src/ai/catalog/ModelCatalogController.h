#pragma once
#include "ModelPickerCatalog.h"
#include <QUrl>
#include <QtQmlIntegration/qqmlintegration.h>

class ModelCatalogController : public nt::modelpicker::Catalog {
    Q_OBJECT
    QML_ELEMENT
public:
    explicit ModelCatalogController(QObject* parent = nullptr);
    Q_INVOKABLE void configure(const QUrl& server, const QString& token = {});
    Q_INVOKABLE void reload();
private:
    QUrl m_server;
    QString m_token;
    bool m_explicit = false;
};
