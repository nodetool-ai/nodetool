#pragma once
#include "model/TimelineModel.h"
#include "server/AutosaveController.h"
#include <QPointer>
#include <QThread>
#include <QTimer>
#include <QtQmlIntegration/qqmlintegration.h>
#include <functional>

class ActivityController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(QVariantList rows READ rows NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(bool connected READ connected NOTIFY changed)
    Q_PROPERTY(bool hasMore READ hasMore NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString scopeLabel READ scopeLabel NOTIFY changed)
    Q_PROPERTY(QString lastUpdated READ lastUpdated NOTIFY changed)
public:
    using Call = std::function<nt::server::QueryResult(bool, const QString&, const QJsonObject&)>;
    explicit ActivityController(QObject* parent = nullptr);
    ~ActivityController() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* value);
    void setTarget(std::optional<nt::server::SaveTarget> target);
    void setCall(Call call) { m_call = std::move(call); }
    QVariantList rows() const;
    bool busy() const { return m_worker; }
    bool connected() const { return m_target.has_value(); }
    bool hasMore() const { return !m_jobCursor.isEmpty() || !m_generationCursor.isEmpty(); }
    QString error() const { return m_error; }
    QString scopeLabel() const;
    QString lastUpdated() const { return m_lastUpdated; }
    Q_INVOKABLE void refresh();
    Q_INVOKABLE void loadMore();
    Q_INVOKABLE void cancel(const QString& id, const QString& source = {});
    static QVariantMap jobRow(const QJsonObject& value);
    static QVariantMap generationRow(const QJsonObject& value);
signals:
    void changed();
private:
    void request(bool more, const QString& cancelId = {}, const QString& cancelSource = {});
    void reset();
    QString projectId() const;
    QPointer<TimelineModel> m_timeline;
    std::optional<nt::server::SaveTarget> m_target;
    bool m_explicitTarget = false;
    Call m_call;
    QPointer<QThread> m_worker;
    QTimer m_poll;
    quint64 m_epoch = 0;
    QVariantList m_rows;
    QString m_jobCursor, m_generationCursor, m_error, m_lastUpdated;
    bool m_stale = true;
    bool m_jobLoaded = false, m_generationLoaded = false;
};
