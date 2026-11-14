#pragma once
#include <QDateTime>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QObject>
#include <QSet>
#include <QUrl>
#include <functional>

namespace nodetool::node_editor {
// REST workflow contracts: websocket/src/http-api.ts. Project choices use
// trpc/routers/projects.ts. Credentials never leave this session's memory.
// WorkflowBrowser.qml takes it as a required property, named
// WorkflowBrowserModel in QML.
//
// The list view follows web/src/components/workflows/WorkflowList.tsx: a name
// search, favourites, tag filters, date or name order with day groups, a graph
// preview, a selection mode with bulk delete, duplicate and edit. The view
// choices and the favourites persist in QSettings once the owner calls
// restoreViewSettings(), as the web keeps them in local storage.
//
// UI thread only.
class WorkflowBrowser : public QObject {
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
  // Rows loaded before any filter, for the empty state's wording.
  Q_PROPERTY(int loadedCount READ loadedCount NOTIFY changed)
  // "date" (newest first, grouped by day) or "name".
  Q_PROPERTY(QString sortBy READ sortBy WRITE setSortBy NOTIFY changed)
  Q_PROPERTY(bool favoritesOnly READ favoritesOnly WRITE setFavoritesOnly NOTIFY changed)
  Q_PROPERTY(bool showGraphPreview READ showGraphPreview WRITE setShowGraphPreview NOTIFY changed)
  Q_PROPERTY(bool selectionMode READ selectionMode WRITE setSelectionMode NOTIFY changed)
  Q_PROPERTY(QStringList selectedIds READ selectedIds NOTIFY changed)
  Q_PROPERTY(QStringList selectedTags READ selectedTags NOTIFY changed)
  Q_PROPERTY(QStringList availableTags READ availableTags NOTIFY changed)
  // The workflow open in this window's tab, which its row highlights.
  Q_PROPERTY(QString currentId READ currentId WRITE setCurrentId NOTIFY changed)
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
  int loadedCount() const { return m_rows.size(); }
  QString sortBy() const { return m_sortBy; }
  bool favoritesOnly() const { return m_favoritesOnly; }
  bool showGraphPreview() const { return m_showGraphPreview; }
  bool selectionMode() const { return m_selectionMode; }
  QStringList selectedIds() const { return m_selected; }
  QStringList selectedTags() const { return m_selectedTags; }
  QStringList availableTags() const;
  QString currentId() const { return m_current; }
  void setProjectId(const QString &id);
  void setSearch(const QString &text);
  void setSortBy(const QString &sortBy);
  void setFavoritesOnly(bool only);
  void setShowGraphPreview(bool show);
  void setSelectionMode(bool on);
  void setCurrentId(const QString &id);
  // Reads the view choices and favourites from QSettings and keeps writing
  // them there. Without this call they live only as long as the browser.
  void restoreViewSettings();
  // The clock the day groups and relative dates read. Tests pin it.
  void setNow(const QDateTime &now) { m_now = now; emit changed(); }
  // web/src/utils/groupByDate.ts and the row date of WorkflowListItem.tsx.
  static QString dayGroup(const QDateTime &updated, const QDateTime &now);
  static QString relativeDate(const QDateTime &updated, const QDateTime &now);
  // web/src/utils/nextCopyName.ts.
  static QString nextCopyName(const QString &name, const QStringList &existing);
  Q_INVOKABLE void toggleFavorite(const QString &id);
  Q_INVOKABLE bool isFavorite(const QString &id) const { return m_favorites.contains(id); }
  Q_INVOKABLE void toggleSelected(const QString &id);
  Q_INVOKABLE void toggleTag(const QString &tag);
  Q_INVOKABLE void clearTags();
  Q_INVOKABLE void duplicateWorkflow(const QString &id);
  // Merges `patch` (name, description, tags, run_mode, tool_name,
  // workspace_id) into the stored workflow, as WorkflowForm.tsx saves it.
  Q_INVOKABLE void updateWorkflow(const QString &id, const QVariantMap &patch);
  Q_INVOKABLE void deleteWorkflows(const QStringList &ids);
  Q_INVOKABLE void loadTriggers();
  Q_INVOKABLE void refresh();
  Q_INVOKABLE void loadNext();
  Q_INVOKABLE void loadProjects();
  Q_INVOKABLE void createWorkflow(const QString &name);
  Q_INVOKABLE void renameWorkflow(const QString &id, const QString &name);
  Q_INVOKABLE void deleteWorkflow(const QString &id);
  // The panel's requests that need the editor window: open a workflow in a
  // tab, ask before deleting one, and reload the list and its projects.
  Q_INVOKABLE void open(const QString &id) { emit openRequested(id); }
  Q_INVOKABLE void confirmDelete(const QString &id, const QString &name) { emit deleteRequested(id, name); }
  Q_INVOKABLE void confirmDeleteSelected() { if (!m_selected.isEmpty()) { emit deleteSelectedRequested(m_selected); } }
  Q_INVOKABLE void reload() { emit reloadRequested(); }
signals:
  void changed();
  void created(QString id);
  void renamed(QString id);
  void deleted(QString id);
  void openRequested(const QString &id);
  void deleteRequested(const QString &id, const QString &name);
  void deleteSelectedRequested(const QStringList &ids);
  void reloadRequested();
private:
  using Result = std::function<void(QJsonValue)>;
  void cancel();
  void fail(const QString &message);
  void page(bool append);
  // A quiet request leaves the error alone when it fails.
  void request(const QByteArray &method, const QString &path,
               const QJsonObject &body, Result done, bool quiet = false);
  bool mutationReady(const QString &name = QStringLiteral("valid"));
  void deleteNext(QStringList ids, int failures);
  void saveViewSettings() const;
  QNetworkAccessManager m_network;
  QUrl m_origin;
  QString m_token, m_user, m_project, m_search, m_next, m_error;
  QString m_sortBy = QStringLiteral("date"), m_current;
  QStringList m_favorites, m_selected, m_selectedTags;
  QDateTime m_now;
  QJsonArray m_rows, m_projects;
  // workflow id -> {label, failing} from jobs.triggersRunning.
  QVariantMap m_triggers;
  QSet<QString> m_pageCursors;
  quint64 m_epoch = 0;
  bool m_loading = false, m_busy = false, m_projectsLoading = false;
  bool m_favoritesOnly = false, m_showGraphPreview = false, m_selectionMode = false;
  bool m_persist = false;
};
}
