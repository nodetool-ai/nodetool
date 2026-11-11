#pragma once
#include "model/TimelineModel.h"
#include "server/ServerClient.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QPointer>
#include <QSet>
#include <QTimer>
#include <QWebSocket>
#include <QtQmlIntegration/qqmlintegration.h>
#include <functional>
class AssistantSession : public QObject {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(
      TimelineModel *timeline READ timeline WRITE setTimeline NOTIFY changed)
  Q_PROPERTY(QObject *generationController READ generationController WRITE
                 setGenerationController NOTIFY changed)
  Q_PROPERTY(QString provider MEMBER m_provider NOTIFY changed)
  Q_PROPERTY(QString model MEMBER m_model NOTIFY changed)
  Q_PROPERTY(QStringList selectedClipIds MEMBER m_selected NOTIFY changed)
  Q_PROPERTY(QString answer READ answer NOTIFY changed)
  Q_PROPERTY(QString error READ error NOTIFY changed)
  Q_PROPERTY(bool ready READ ready NOTIFY changed)
  Q_PROPERTY(bool busy READ busy NOTIFY changed)
  Q_PROPERTY(QString approval READ approval NOTIFY changed)
  Q_PROPERTY(double playheadMs MEMBER m_playheadMs NOTIFY changed)
  Q_PROPERTY(QVariantList threads READ threads NOTIFY changed)
  Q_PROPERTY(QString history READ history NOTIFY changed)
  Q_PROPERTY(bool loadingHistory READ loadingHistory NOTIFY changed)
  Q_PROPERTY(bool hasOlderMessages READ hasOlderMessages NOTIFY changed)
  Q_PROPERTY(bool hasMoreThreads READ hasMoreThreads NOTIFY changed)
  Q_PROPERTY(QVariantMap planningReview READ planningReview NOTIFY changed)
public:
  explicit AssistantSession(QObject *parent = nullptr);
  ~AssistantSession() override;
  TimelineModel *timeline() const { return m_timeline; }
  void setTimeline(TimelineModel *value);
  QObject *generationController() const { return m_generator; }
  void setGenerationController(QObject *value);
  Q_INVOKABLE void bindGenerationController(QObject *editor);
  QString answer() const { return m_answer; }
  QString error() const { return m_error; }
  bool ready() const { return m_ready; }
  bool busy() const { return m_busy; }
  QString approval() const { return m_approvalText; }
  using PlanningSend = std::function<bool(const QString &, const QJsonObject &,
                                          const QString &)>;
  void setPlanningSend(PlanningSend call) { m_planningSend = std::move(call); }
  using PlanningPersist = std::function<bool(const QJsonObject &)>;
  void setPlanningPersist(PlanningPersist call) {
    m_planningPersist = std::move(call);
  }
  QVariantMap planningReview() const { return m_planningReview.toVariantMap(); }
  Q_INVOKABLE bool approvePlanning(bool approve);
  Q_INVOKABLE bool recoverPlanning();
  using HistoryCall = std::function<nt::server::QueryResult(
      const QString &, const QJsonObject &)>;
  void setHistoryCall(HistoryCall call) { m_historyCall = std::move(call); }
  QVariantList threads() const { return m_threads.toVariantList(); }
  QString history() const { return m_history; }
  bool loadingHistory() const { return m_loadingHistory; }
  bool hasOlderMessages() const { return !m_messageCursor.isEmpty(); }
  bool hasMoreThreads() const { return !m_threadCursor.isEmpty(); }
  Q_INVOKABLE bool listThreads(bool more = false);
  Q_INVOKABLE void newConversation();
  Q_INVOKABLE bool loadThread(const QString &id);
  Q_INVOKABLE bool loadOlderMessages();
  static QJsonObject threadListInput(const QString &timelineId,
                                     const QString &cursor = {});
  static QJsonObject messageListInput(const QString &threadId,
                                      const QString &cursor = {});
  static QString historyText(const QJsonArray &newestFirst);
  Q_INVOKABLE bool connectServer();
  Q_INVOKABLE bool send(const QString &text);
  Q_INVOKABLE void stop();
  Q_INVOKABLE void approve(bool allow);
  static QJsonObject message(const QString &text, const QString &threadId,
                             const QString &timelineId,
                             const QStringList &selected,
                             const QString &provider, const QString &model);
  void receive(const QJsonObject &frame);
  QJsonObject executeTool(const QString &name, const QJsonObject &args);
  QJsonObject executeHostTool(const QString &name, const QJsonObject &args,
                              const QString &callId);
signals:
  void changed();
  void hostToolCompleted(QString callId, QJsonObject result);
private slots:
  void advanceBeatGeneration();

private:
  friend class AssistantSessionTest;
  bool restorePlanningCheckpoint(const QJsonObject &checkpoint);
  QJsonObject executeToolScoped(const QString &name, const QJsonObject &args,
                                const QString &toolCallId);
  QJsonObject normalizePlanningReferences(const QString &operation,
                                          const QJsonObject &original,
                                          const QJsonObject &canonical,
                                          const QString &toolCallId);
  bool savePlanning();
  bool queryHistory(const QString &procedure, const QJsonObject &input,
                    bool append);
  void resetHistory();
  void sendFrame(const QJsonObject &frame);
  QPointer<TimelineModel> m_timeline;
  QPointer<QObject> m_generator;
  QPointer<QObject> m_generationHost;
  QMetaObject::Connection m_generationConnection;
  PlanningPersist m_planningPersist;
  PlanningSend m_planningSend;
  QTimer m_planningTimeout;
  QJsonObject m_planningReview;
  QJsonObject m_planningObserved;
  QJsonObject m_preparedDocument;
  QJsonArray m_generationRequests;
  QJsonObject m_activeGenerationRequest;
  quint64 m_planningGeneration = 0;
  QString m_planRequestId;
  bool m_generationQueueActive = false;
  bool m_generationDispatching = false;
  QWebSocket m_socket;
  QTimer m_modeTimeout;
  QString m_provider;
  QString m_model;
  QStringList m_selected;
  QString m_threadId;
  QSet<QString> m_externalHostCalls;
  HistoryCall m_historyCall;
  QJsonArray m_threads;
  QSet<QString> m_historyMessageIds;
  QString m_history;
  QString m_threadCursor;
  QString m_messageCursor;
  quint64 m_historyEpoch = 0;
  bool m_loadingHistory = false;
  QString m_answer;
  QString m_approvalId;
  bool m_planApproval = false;
  QString m_approvalText;
  QString m_error;
  quint64 m_generation = 0;
  double m_playheadMs = 0;
  bool m_ready = false;
  bool m_busy = false;
};
