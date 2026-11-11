#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QObject>
#include <QTimer>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>
#include <functional>

namespace nodetool::node_editor {
// Stored run inspection over the server's runs.* tRPC queries: packages/websocket/src/trpc/routers/runs.ts.
// Response shapes follow packages/protocol/src/run-readers.ts and run-trace.ts.
// The web counterpart is web/src/components/panels/TracePanel.tsx. Credentials stay in this object's memory.
class RunTraceController final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVariantList runs READ runs NOTIFY changed)
  Q_PROPERTY(bool hasMoreRuns READ hasMoreRuns NOTIFY changed)
  Q_PROPERTY(QString selectedRunId READ selectedRunId NOTIFY changed)
  Q_PROPERTY(QVariantMap summary READ summary NOTIFY changed)
  Q_PROPERTY(QString view READ view WRITE setView NOTIFY changed)
  Q_PROPERTY(QVariantList browserSpans READ browserSpans NOTIFY changed)
  Q_PROPERTY(QVariantList serverSpans READ serverSpans NOTIFY changed)
  Q_PROPERTY(QVariantList spanChoices READ spanChoices NOTIFY changed)
  Q_PROPERTY(QStringList notices READ notices NOTIFY changed)
  Q_PROPERTY(bool filtered READ filtered NOTIFY changed)
  Q_PROPERTY(bool errorsOnly READ errorsOnly WRITE setErrorsOnly NOTIFY changed)
  Q_PROPERTY(QString nameFilter READ nameFilter WRITE setNameFilter NOTIFY changed)
  Q_PROPERTY(int depth READ depth WRITE setDepth NOTIFY changed)
  Q_PROPERTY(QString focusedSpanId READ focusedSpanId NOTIFY changed)
  Q_PROPERTY(QVariantMap focus READ focus NOTIFY changed)
  Q_PROPERTY(QStringList focusNotices READ focusNotices NOTIFY changed)
  Q_PROPERTY(QVariantList logs READ logs NOTIFY changed)
  Q_PROPERTY(QStringList logNotices READ logNotices NOTIFY changed)
  Q_PROPERTY(QString logLevel READ logLevel WRITE setLogLevel NOTIFY changed)
  Q_PROPERTY(QString logSource READ logSource WRITE setLogSource NOTIFY changed)
  Q_PROPERTY(QStringList logSources READ logSources NOTIFY changed)
  Q_PROPERTY(bool hasMoreLogs READ hasMoreLogs NOTIFY changed)
  Q_PROPERTY(QString selectedLogId READ selectedLogId NOTIFY changed)
  Q_PROPERTY(QVariantMap selectedLog READ selectedLog NOTIFY changed)
  Q_PROPERTY(bool runsLoading READ runsLoading NOTIFY changed)
  Q_PROPERTY(bool traceLoading READ traceLoading NOTIFY changed)
  Q_PROPERTY(bool focusLoading READ focusLoading NOTIFY changed)
  Q_PROPERTY(bool logsLoading READ logsLoading NOTIFY changed)
  Q_PROPERTY(bool moreLogsLoading READ moreLogsLoading NOTIFY changed)
  Q_PROPERTY(QString error READ error NOTIFY changed)
  Q_PROPERTY(QString focusError READ focusError NOTIFY changed)
  Q_PROPERTY(bool configured READ configured NOTIFY changed)
  Q_PROPERTY(QString copied READ copied NOTIFY changed)
public:
  explicit RunTraceController(QObject *parent = nullptr);
  void configure(const QUrl &origin, const QString &token = {}, const QString &userId = "1");
  // The workflow whose runs the panel lists. An empty ID lists every run.
  void setWorkflow(const QString &id, const QString &name);
  // Polls a running run while the panel is shown.
  void setActive(bool active);
  QVariantList runs() const;
  bool hasMoreRuns() const { return !m_nextRuns.isEmpty(); }
  QString selectedRunId() const;
  QVariantMap summary() const { return m_summary; }
  QString view() const { return m_view; }
  void setView(const QString &view);
  QVariantList browserSpans() const { return m_browserSpans; }
  QVariantList serverSpans() const { return m_serverSpans; }
  QVariantList spanChoices() const { return m_choices; }
  QStringList notices() const { return m_traceNotices; }
  bool filtered() const { return m_errorsOnly || !m_name.isEmpty() || m_depth != 64; }
  bool errorsOnly() const { return m_errorsOnly; }
  void setErrorsOnly(bool value);
  QString nameFilter() const { return m_name; }
  void setNameFilter(const QString &value);
  int depth() const { return m_depth; }
  void setDepth(int value);
  QString focusedSpanId() const { return m_focusedSpan; }
  QVariantMap focus() const { return m_focus; }
  QStringList focusNotices() const { return m_focusNotices; }
  QVariantList logs() const { return m_logRows; }
  QStringList logNotices() const { return m_logNotices; }
  QString logLevel() const { return m_logLevel; }
  void setLogLevel(const QString &value);
  QString logSource() const { return m_logSource; }
  void setLogSource(const QString &value);
  QStringList logSources() const { return m_logSources; }
  bool hasMoreLogs() const { return !m_nextLogs.isEmpty(); }
  QString selectedLogId() const { return m_selectedLog; }
  QVariantMap selectedLog() const;
  bool runsLoading() const { return m_loading[ListKind] || m_loading[SummaryKind]; }
  bool traceLoading() const { return m_loading[TraceKind]; }
  bool focusLoading() const { return m_loading[FocusKind]; }
  bool logsLoading() const { return m_loading[LogsKind]; }
  bool moreLogsLoading() const { return m_moreLogs; }
  QString error() const;
  QString focusError() const { return m_errors[FocusKind]; }
  bool configured() const { return !m_origin.isEmpty(); }
  QString copied() const { return m_copied; }
  Q_INVOKABLE void refresh();
  Q_INVOKABLE void loadMoreRuns();
  Q_INVOKABLE void selectRun(const QString &id);
  Q_INVOKABLE void focusSpan(const QString &spanId);
  Q_INVOKABLE void clearFocus();
  Q_INVOKABLE void showFailingSpan();
  // Focuses the span of one node, as the web's "View logs" does. The span is chosen once the trace has it.
  Q_INVOKABLE void focusNode(const QString &nodeId);
  Q_INVOKABLE void clearFilters();
  Q_INVOKABLE void loadMoreLogs();
  Q_INVOKABLE void selectLog(const QString &id);
  Q_INVOKABLE void closeLog();
  Q_INVOKABLE void copyText(const QString &text);
  Q_INVOKABLE void copyFocusedSpan();
signals:
  void changed();
private:
  enum Kind { ListKind, SummaryKind, TraceKind, FocusKind, LogsKind, KindCount };
  using Result = std::function<void(QJsonObject)>;
  void cancel();
  void request(Kind kind, const QString &procedure, const QJsonObject &input, Result done);
  void fail(Kind kind, const QString &message);
  void loadRuns(bool append);
  void loadSummary();
  void loadTrace();
  void loadFocus();
  void loadLogs(bool append);
  void loadRunData();
  void applyTrace(const QJsonObject &result);
  void applyFocus(const QJsonObject &result);
  void applyLogs(const QJsonObject &result, bool append);
  void rebuildLogs();
  void resolvePendingNode();
  void tick();
  QNetworkAccessManager m_network;
  QUrl m_origin;
  QString m_token, m_user, m_workflowId, m_workflowName;
  QString m_selectedRun, m_view = QStringLiteral("trace");
  QString m_nextRuns, m_nextLogs, m_name, m_focusedSpan, m_logLevel, m_logSource, m_selectedLog, m_pendingNode;
  QString m_copied;
  QString m_focusJson;
  QJsonArray m_runs;
  QJsonObject m_run;
  QVariantMap m_summary, m_focus;
  QVariantList m_browserSpans, m_serverSpans, m_choices, m_logRows;
  QStringList m_traceNotices, m_focusNotices, m_logNotices, m_logSources;
  QJsonArray m_traceNodes, m_focusNodes;
  QList<QJsonObject> m_logEntries;
  QString m_errors[KindCount];
  bool m_loading[KindCount] = {};
  bool m_moreLogs = false;
  bool m_errorsOnly = false;
  bool m_active = false;
  bool m_keepContext = false;
  bool m_logsExpired = false;
  int m_depth = 64;
  quint64 m_scope = 0;
  quint64 m_sequence[KindCount] = {};
  double m_runStart = 0;
  QTimer m_poll;
  QTimer m_copyTimer;
};
}
