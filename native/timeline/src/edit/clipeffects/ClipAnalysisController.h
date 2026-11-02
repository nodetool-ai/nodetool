#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>
#include <thread>

class ClipAnalysisController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* model READ model WRITE setModel NOTIFY contextChanged)
    Q_PROPERTY(QString clipId READ clipId WRITE setClipId NOTIFY contextChanged)
    Q_PROPERTY(QString effectId READ effectId WRITE setEffectId NOTIFY contextChanged)
    Q_PROPERTY(bool locked READ locked WRITE setLocked NOTIFY contextChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(int progress READ progress NOTIFY changed)
    Q_PROPERTY(QString status READ status NOTIFY changed)
public:
    explicit ClipAnalysisController(QObject* parent=nullptr) : QObject(parent) {}
    ~ClipAnalysisController() override;
    TimelineModel* model() const { return m_model; }
    void setModel(TimelineModel* model);
    QString clipId() const { return m_clipId; }
    void setClipId(const QString& id);
    QString effectId() const { return m_effectId; }
    void setEffectId(const QString& id);
    bool locked() const { return m_locked; }
    void setLocked(bool locked);
    bool busy() const { return m_busy; }
    int progress() const { return m_progress; }
    QString status() const;
    Q_INVOKABLE void analyze();
    Q_INVOKABLE void cancel();
signals:
    void contextChanged();
    void changed();
private:
    QJsonObject effect() const;
    bool clipLocked() const;
    void refresh();
    QPointer<TimelineModel> m_model;
    QString m_clipId,m_effectId,m_error;
    bool m_locked=false,m_busy=false;
    int m_progress=0;
    quint64 m_request=0,m_generation=0;
    QJsonObject m_key;
    std::jthread m_worker;
};
