#pragma once
#include "assets/AssetMedia.h"
#include "model/TimelineModel.h"
#include "server/ServerClient.h"
#include <QPointer>
#include <QThread>
#include <functional>
#include <QtQmlIntegration/qqmlintegration.h>
class ProductionReview : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(QVariantMap summary READ summary NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(bool approved READ approved NOTIFY changed)
public:
    using ReadCall = std::function<nt::server::QueryResult(const QString&, const QJsonObject&)>;
    using MediaResolver = std::function<nt::Clip(nt::server::ServerClient&, const QString&, const QJsonObject&, const QJsonObject&, nt::assets::MediaProtection&, quint64)>;
    explicit ProductionReview(QObject* parent = nullptr);
    ~ProductionReview() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* model);
    QVariantMap summary() const { return m_summary.toVariantMap(); }
    QString error() const { return m_error; }
    bool busy() const { return m_worker != nullptr; }
    bool approved() const { return !m_approvedToken.isEmpty() && m_approvedToken == m_token; }
    void setReadCall(ReadCall call) { m_call = std::move(call); }
    void setMediaResolver(MediaResolver resolver) { m_resolver = std::move(resolver); }
    Q_INVOKABLE bool reviewShot(const QJsonObject& board, const QString& shotId, const QString& kind, const QJsonObject& model,
                               const QJsonArray& entityLibrary = {}, const QJsonObject& script = {});
    Q_INVOKABLE bool approve();
    Q_INVOKABLE bool consume(const QJsonObject& board, const QString& shotId, const QString& kind, const QJsonObject& model,
                            const QJsonArray& entityLibrary = {}, const QJsonObject& script = {});
    Q_INVOKABLE bool placeShot(const QJsonObject& board, const QString& shotId, double startMs, const QString& trackId = {}, const QString& dropMode = "overlap");
signals:
    void changed();
    void placed(QString clipId);
private:
    friend class ProductionReviewTest;
    static QJsonObject shotSummary(const QJsonObject& board, const QString& shotId, const QString& kind,
                                   const QJsonObject& model, const QJsonArray& entityLibrary, const QJsonObject& script, QString& error);
    void resetProtection();
    static QString fingerprint(const QJsonObject& summary);
    QPointer<TimelineModel> m_timeline;
    QJsonObject m_summary;
    QString m_token;
    QString m_inputToken;
    quint64 m_generation = 0;
    QString m_approvedToken;
    QString m_error;
    ReadCall m_call;
    MediaResolver m_resolver;
    std::shared_ptr<nt::assets::MediaProtection> m_protection;
    QThread* m_worker = nullptr;
    quint64 m_serial = 0;
};
