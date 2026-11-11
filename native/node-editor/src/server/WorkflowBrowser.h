#pragma once
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QObject>
#include <QSet>
#include <QUrl>
#include <functional>

namespace nodetool::node_editor {
// REST workflow contracts: websocket/src/http-api.ts. Project choices use
// trpc/routers/projects.ts. Credentials never leave this session's memory.
class WorkflowBrowser final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVariantList rows READ rows NOTIFY changed)
  Q_PROPERTY(QVariantList projects READ projects NOTIFY changed)
  Q_PROPERTY(QString projectId READ projectId WRITE setProjectId NOTIFY changed)
  Q_PROPERTY(QString search READ search WRITE setSearch NOTIFY changed)
  Q_PROPERTY(bool loading READ loading NOTIFY changed)
  Q_PROPERTY(bool projectsLoading READ projectsLoading NOTIFY changed)
  Q_PROPERTY(bool busy READ busy NOTIFY changed)
  Q_PROPERTY(bool hasNext READ hasNext NOTIFY changed)
  Q_PROPERTY(QString error READ error NOTIFY changed)
public:
  explicit WorkflowBrowser(QObject *parent = nullptr);
  void configure(const QUrl &origin, const QString &token = {}, const QString &userId = "1");
  QVariantList rows() const;
  QVariantList projects() const { return m_projects.toVariantList(); }
  QString projectId() const { return m_project; }
  QString search() const { return m_search; }
  bool loading() const { return m_loading; }
  bool projectsLoading() const { return m_projectsLoading; }
  bool busy() const { return m_busy; }
  bool hasNext() const { return !m_next.isEmpty(); }
  QString error() const { return m_error; }
  void setProjectId(const QString &id);
  void setSearch(const QString &text);
  Q_INVOKABLE void refresh();
  Q_INVOKABLE void loadNext();
  Q_INVOKABLE void loadProjects();
  Q_INVOKABLE void createWorkflow(const QString &name);
  Q_INVOKABLE void renameWorkflow(const QString &id, const QString &name);
  Q_INVOKABLE void deleteWorkflow(const QString &id);
signals:
  void changed();
  void created(QString id);
  void renamed(QString id);
  void deleted(QString id);
private:
  using Result = std::function<void(QJsonValue)>;
  void cancel();
  void fail(const QString &message);
  void page(bool append);
  void request(const QByteArray &method, const QString &path,
               const QJsonObject &body, Result done);
  bool mutationReady(const QString &name = QStringLiteral("valid"));
  QNetworkAccessManager m_network;
  QUrl m_origin;
  QString m_token, m_user, m_project, m_search, m_next, m_error;
  QJsonArray m_rows, m_projects;
  QSet<QString> m_pageCursors;
  quint64 m_epoch = 0;
  bool m_loading = false, m_busy = false, m_projectsLoading = false;
};
}
