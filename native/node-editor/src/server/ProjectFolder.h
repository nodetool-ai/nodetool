#pragma once
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QObject>
#include <QUrl>
#include <functional>

namespace nodetool::node_editor {
// The folder of the project a tab shows, and the file state of the workflow
// open in it. Contracts: projects.list, projects.documents, projects.relocate
// and projects.restoreDocumentFile in
// packages/websocket/src/trpc/routers/projects.ts. ProjectFolderNotice.qml and
// DocumentFileBanner.qml take it as a required property. The editor window
// owns one per tab. Credentials never leave this object's memory.
//
// UI thread only.
class ProjectFolder : public QObject {
  Q_OBJECT
  Q_PROPERTY(QString projectName READ projectName NOTIFY changed)
  // Empty until the project list answers, "none" for a project without a
  // folder, "missing" for a folder the server cannot reach, "ok" otherwise.
  Q_PROPERTY(QString folderState READ folderState NOTIFY changed)
  // The folder's absolute path on the server's disk. Empty for a cloud folder.
  Q_PROPERTY(QString folderPath READ folderPath NOTIFY changed)
  Q_PROPERTY(QString workspaceId READ workspaceId NOTIFY changed)
  // Whether the folder exists on this machine, so a file manager can show it.
  Q_PROPERTY(bool revealable READ revealable NOTIFY changed)
  Q_PROPERTY(QString revealLabel READ revealLabel CONSTANT)
  Q_PROPERTY(QString locateError READ locateError NOTIFY changed)
  // The open workflow's file: empty when there is none or it is unknown, else
  // "ok", "invalid" or "missing".
  Q_PROPERTY(QString fileState READ fileState NOTIFY changed)
  Q_PROPERTY(QString filePath READ filePath NOTIFY changed)
  Q_PROPERTY(QString fileError READ fileError NOTIFY changed)
  Q_PROPERTY(QString restoreError READ restoreError NOTIFY changed)
  Q_PROPERTY(bool busy READ busy NOTIFY changed)
public:
  explicit ProjectFolder(QObject *parent = nullptr);
  void configure(const QUrl &origin, const QString &token, const QString &userId);
  // The tab's project, empty for Personal. A change loads it.
  void setProject(const QString &projectKey);
  // The server workflow open in the tab, or empty. A change loads its file state.
  void setDocument(const QString &workflowId);
  // The project's id from projects.list, empty until it answers.
  QString projectId() const { return m_project.value("id").toString(); }
  QString projectName() const { return m_project.value("name").toString(); }
  QString folderState() const;
  QString folderPath() const { return folder().value("path").toString(); }
  QString workspaceId() const { return folder().value("workspace_id").toString(); }
  bool revealable() const;
  static QString revealLabel();
  QString locateError() const { return m_locateError; }
  QString fileState() const { return m_file.value("state").toString(); }
  QString filePath() const { return m_file.value("path").toString(); }
  QString fileError() const { return m_file.value("error").toString(); }
  QString restoreError() const { return m_restoreError; }
  bool busy() const { return m_busy; }
  // Reads the project list, then the open workflow's file state.
  Q_INVOKABLE void refresh();
  // Opens the folder in the platform's file manager.
  Q_INVOKABLE void reveal();
  // Points the project at its folder's new place. Local servers only: a
  // production server answers an error, which locateError shows.
  Q_INVOKABLE void locate(const QUrl &folder);
  // Writes the missing file of the open workflow again from the document.
  Q_INVOKABLE void restoreFile();
  // A `documentfile` push. Reads the file state again when it names the open
  // workflow.
  void documentFileChanged(const QJsonObject &resource);
signals:
  void changed();
private:
  using Done = std::function<void(QJsonValue, QString)>;
  QJsonObject folder() const { return m_project.value("folder").toObject(); }
  void request(const QByteArray &method, const QString &procedure, const QJsonObject &input, Done done);
  void loadDocuments();
  QNetworkAccessManager m_network;
  QUrl m_origin;
  QString m_token, m_user, m_key, m_document, m_locateError, m_restoreError;
  QJsonObject m_project, m_file;
  quint64 m_epoch = 0;
  bool m_busy = false;
};
}
