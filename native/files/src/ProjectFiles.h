#pragma once
#include <QAbstractListModel>
#include <QFileSystemWatcher>
#include <QHash>
#include <QNetworkAccessManager>
#include <QSet>
#include <QTimer>
#include <QUrl>
#include <QVector>
#include <QtQml/qqmlregistration.h>

class QJsonArray;

namespace nodetool::files {
// The tree of a project's folder as the flat list of its visible rows, for
// FilesPanel.qml. Ports the web WorkspaceTree.tsx.
// Contract: the server tRPC procedure workspace.listFiles,
// one directory level per call. Folders load when they first expand. Expand
// and collapse insert or remove only the child rows. A refresh resets.
//
// The host owns one per editor tab, configures it with the server's origin
// and credentials, and passes a non-owning pointer to FilesPanel.qml.
// Credentials never leave this object's memory.
//
// UI thread only.
class ProjectFiles : public QAbstractListModel {
  Q_OBJECT
  QML_ELEMENT
  QML_UNCREATABLE("ProjectFiles comes from its owner.")
  Q_PROPERTY(QString workspaceId READ workspaceId NOTIFY folderChanged)
  Q_PROPERTY(QString projectName READ projectName NOTIFY folderChanged)
  Q_PROPERTY(bool hasFolder READ hasFolder NOTIFY folderChanged)
  Q_PROPERTY(bool localOnly READ isLocalOnly NOTIFY folderChanged)
  // Whether the folder is on this machine, so a file manager can show it.
  Q_PROPERTY(bool revealable READ revealable NOTIFY folderChanged)
  Q_PROPERTY(QString revealLabel READ revealLabel CONSTANT)
  // The host is still resolving which project folder the document belongs to.
  Q_PROPERTY(bool folderResolving READ folderResolving NOTIFY stateChanged)
  // The project has a folder, but the server cannot reach it on disk.
  Q_PROPERTY(bool folderUnavailable READ folderUnavailable NOTIFY stateChanged)
  // The root listing (or project folder resolution) is in flight and nothing is shown yet.
  Q_PROPERTY(bool loading READ loading NOTIFY stateChanged)
  // A root listing or refresh is in flight.
  Q_PROPERTY(bool busy READ busy NOTIFY stateChanged)
  // Why the root listing failed, or empty.
  Q_PROPERTY(QString error READ error NOTIFY stateChanged)
  // The root listed no entry.
  Q_PROPERTY(bool empty READ empty NOTIFY stateChanged)
  Q_PROPERTY(int count READ rowCount NOTIFY countChanged)
  Q_PROPERTY(int selectedRow READ selectedRow NOTIFY selectionChanged)
  Q_PROPERTY(QString selectedPath READ selectedPath NOTIFY selectionChanged)
  // The preview of the selected file (the web WorkspaceFilePreview.tsx).
  // Kind: image, video, audio, model3d, timeline, workflow, or empty when
  // the selection has nothing to preview.
  Q_PROPERTY(QString previewKind READ previewKind NOTIFY previewChanged)
  Q_PROPERTY(QString previewName READ previewName NOTIFY previewChanged)
  Q_PROPERTY(QString previewIcon READ previewIcon NOTIFY previewChanged)
  // "1.2 KB · image/png", or "1.2 KB · Timeline" for a document.
  Q_PROPERTY(QString previewDetails READ previewDetails NOTIFY previewChanged)
  // A timeline's "1:04 · 2 tracks · 5 clips" once its file is read, else empty.
  Q_PROPERTY(QString previewSummary READ previewSummary NOTIFY previewChanged)
  // The picture of an image file, else empty.
  Q_PROPERTY(QUrl previewImageUrl READ previewImageUrl NOTIFY previewChanged)
  // The file of a video, audio or 3D model selection, for a host's player:
  // a file:// URL when the folder is on this machine, else the download URL,
  // which needs the server's credentials. Empty for any other selection.
  Q_PROPERTY(QUrl previewMediaUrl READ previewMediaUrl NOTIFY previewChanged)
public:
  enum Role {
    PathRole = Qt::UserRole + 1,
    NameRole,
    DepthRole,
    IsDirRole,
    ExpandedRole,
    PlaceholderRole,
    KindRole,
    IconRole,
    ThumbnailUrlRole,
    SelectedRole,
  };
  Q_ENUM(Role)

  explicit ProjectFiles(QObject *parent = nullptr);
  ~ProjectFiles() override;

  // The in-app drag of a row, as the web WorkspaceTree.tsx sets it: the row's
  // path under EntryMime, and for a media file a "project-file" drag under
  // DragMime that a host's canvas turns into a constant node.
  static constexpr auto EntryMime = "application/x-nodetool-project-entry";
  static constexpr auto DragMime = "application/x-nodetool-drag";

  // Drops every listing and request. An empty origin stops listing.
  void configure(const QUrl &origin, const QString &token, const QString &userId);
  // The folder of the shown project: its workspace id, empty when it has no
  // folder, and its absolute path when it is on this machine. A new id lists
  // its root.
  void setFolder(const QString &workspaceId, const QString &localPath = {});
  // Browses a local project folder directly from disk without a server,
  // constrained strictly to `localPath` and skipping `.nodetool` and nested
  // project folders.
  void setLocalFolder(const QString &localPath);
  void setProjectName(const QString &projectName);
  void setFolderResolving(bool resolving);
  void setFolderUnavailable(bool unavailable);
  void setFolderError(const QString &error);

  // The project that owns the folder. Moves, uploads and canvas drags name
  // its files through the project's asset API, so they need it.
  void setProject(const QString &projectId) { m_project = projectId; }
  QString projectId() const { return m_project; }

  QString workspaceId() const { return m_workspace; }
  QString projectName() const { return m_projectName; }
  bool hasFolder() const { return !m_workspace.isEmpty() || (m_localOnly && !m_localRootCanonical.isEmpty()); }
  bool isLocalOnly() const { return m_localOnly; }
  bool folderResolving() const { return m_folderResolving; }
  bool folderUnavailable() const { return m_folderUnavailable; }
  bool revealable() const;
  static QString revealLabel();
  bool loading() const;
  bool busy() const { return m_rootTicket != 0 || !m_refreshTickets.isEmpty(); }
  QString error() const;
  bool empty() const;
  int selectedRow() const { return indexOfPath(m_selected); }
  QString selectedPath() const { return m_selected; }
  QString previewKind() const { return m_preview.kind; }
  QString previewName() const { return m_preview.name; }
  QString previewIcon() const { return m_preview.icon; }
  QString previewDetails() const { return m_preview.details; }
  QString previewSummary() const { return m_preview.summary; }
  QUrl previewImageUrl() const;
  QUrl previewMediaUrl() const;

  int rowCount(const QModelIndex &parent = {}) const override;
  QVariant data(const QModelIndex &index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;

  // Lists the root and every expanded folder again, and keeps the expansion.
  Q_INVOKABLE void refresh();
  // Expands or collapses the folder at a row.
  Q_INVOKABLE void toggle(int row);
  Q_INVOKABLE void setExpanded(int row, bool expanded);
  Q_INVOKABLE void select(int row);
  // A click: selects the row and toggles a folder.
  Q_INVOKABLE void click(int row);
  // A double click or Enter: opens a file. A folder only loads, as on the web.
  Q_INVOKABLE void activate(int row);
  // Up and Down.
  Q_INVOKABLE void moveSelection(int delta);
  // Right: expands a closed folder, else moves into an open one.
  Q_INVOKABLE void expandSelected();
  // Left: collapses an open folder, else moves to the parent folder.
  Q_INVOKABLE void collapseSelected();
  // Opens the file manager at the entry: the folder itself, or the folder
  // that holds a file. Only when revealable.
  Q_INVOKABLE void reveal(const QString &path);
  // Resolves a relative file path inside a local-only project folder to its
  // canonical absolute path, or empty when invalid or outside the project.
  QString resolveLocalFile(const QString &relativePath) const { return resolveLocalEntry(relativePath, false); }

  // Drag and drop (the web WorkspaceTree.tsx).
  // The mime data of a row's drag: { mime: text }. Empty for a placeholder.
  Q_INVOKABLE QVariantMap dragData(int row) const;
  // The directory a drop on a row lands in: a folder row is that folder, a
  // file row is the folder it is in, and no row (-1) is the root ".".
  Q_INVOKABLE QString dropDirectory(int row) const;
  // Whether the entry at `source` may move into `directory`: not into the
  // folder it is already in, and a folder not into itself or below it.
  Q_INVOKABLE bool canMoveInto(const QString &source, const QString &directory) const;
  // Moves a file or folder into `directory`. False when refused.
  Q_INVOKABLE bool moveEntry(const QString &source, const QString &directory);
  // Copies local files into `directory` of the project as assets. Returns how
  // many uploads started. Folders and remote URLs are skipped.
  Q_INVOKABLE int copyIn(const QList<QUrl> &urls, const QString &directory);
  // dir:<project>:<path>, the asset id of a project directory
  // (projectDirectoryId in @nodetool-ai/protocol). The root is "".
  static QString projectDirectoryId(const QString &projectId, const QString &path);

  // A `workspacefile` push: files in that workspace changed. Refreshes when
  // it is this folder or the id is unknown.
  void workspaceFilesChanged(const QString &workspaceId);

  // Natural, case-insensitive order: "2" before "10", "a" next to "A".
  static int naturalCompare(QStringView a, QStringView b);
  // Kind of a file by its name, as workspaceFileKind.ts.
  static QString kindOf(const QString &name);
  // The preview kind of a file by its name, or empty: the media kinds that
  // have a picture or a player, and the timeline and workflow documents.
  Q_INVOKABLE static QString previewKindOf(const QString &name);
  // "0 B", "512 B", "1.2 KB", "3.4 MB": the web formatFileSize.
  static QString formatSize(qint64 bytes);
  // "m:ss": the web projectStatus formatDuration.
  static QString formatDuration(qint64 ms);
  // "1:04 · 2 tracks · 5 clips" from a .timeline.json document.
  static QString timelineSummary(const QJsonObject &timeline);
  // /api/workspaces/<id>/download/<path>, each segment encoded, on the origin.
  static QUrl downloadUrl(const QUrl &origin, const QString &workspaceId, const QString &path);

  // A listing for a request this object made through requestListing().
  // Unknown or stale tickets are ignored. Public so a test can answer.
  void receiveListing(quint64 ticket, const QJsonArray &entries, const QString &error);
  // The content of a timeline file this object asked for through
  // requestTimeline(). A stale ticket or an error leaves the summary empty.
  void receiveTimeline(quint64 ticket, const QJsonObject &timeline, const QString &error);

signals:
  void folderChanged();
  void stateChanged();
  void countChanged();
  void selectionChanged();
  void previewChanged();
  // A file to open. The host decides how.
  void openFileRequested(const QString &path);
  // A move or an upload failed. The host shows the message.
  void changeFailed(const QString &message);

protected:
  // Starts workspace.listFiles for a path ("." is the root). The answer must
  // arrive through receiveListing with the same ticket. A test overrides it.
  virtual void requestListing(quint64 ticket, const QString &path);
  // Downloads a timeline file for its summary. The answer must arrive
  // through receiveTimeline with the same ticket. A test overrides it.
  virtual void requestTimeline(quint64 ticket, const QString &path);
  // Sends a checked move to the server: assets.update with the new parent.
  // A test overrides it.
  virtual void requestMove(const QString &source, bool isDirectory, const QString &directory);
  // Uploads one local file into a directory of the project. A test overrides it.
  virtual void requestUpload(const QString &localFile, const QString &directory);
  // A move or an upload finished. Refreshes, or reports the failure.
  void changeFinished(const QString &workspaceId, const QString &error);

private:
  struct Entry {
    QString name, path, kind, icon;
    bool isDir = false;
    qint64 size = 0;
  };
  struct Listing {
    enum State { Loading, Loaded, Failed };
    State state = Loading;
    QVector<Entry> entries;
  };
  struct Row {
    QString path, name, kind, icon;
    int depth = 0;
    bool isDir = false, placeholder = false;
    qint64 size = 0;
  };
  struct Preview {
    QString path, kind, name, icon, details, summary;
    qint64 size = -1;
    bool operator==(const Preview &) const = default;
  };

  QVector<Entry> entriesOf(const QJsonArray &entries, bool root) const;
  void appendChildren(QVector<Row> &rows, const QString &dir, int depth) const;
  QVector<Row> buildRows() const;
  void resetRows();
  int childEnd(int row) const;
  int indexOfPath(const QString &path) const;
  void replaceChildren(int row);
  quint64 list(const QString &path);
  void clearRequests();
  void emitRowChanged(int row, const QList<int> &roles);
  void setSelected(const QString &path);
  void updatePreview();
  QString resolveLocalEntry(const QString &relativePath, bool requireDir) const;
  QUrl localFileUrl(const QString &relativePath) const;
  QJsonArray listLocalDirectory(const QString &relativePath, QString &error) const;
  void stopLocalWatch();
  void syncLocalWatch();

  QNetworkAccessManager m_network;
  QUrl m_origin;
  QString m_project, m_projectName;
  QString m_token, m_user, m_workspace, m_localPath, m_localRootCanonical, m_selected, m_rootError, m_folderError;
  bool m_localOnly = false;
  bool m_folderResolving = false;
  bool m_folderUnavailable = false;
  QFileSystemWatcher m_watcher;
  QTimer m_watchDebounce;
  QHash<QString, Listing> m_listings;
  QSet<QString> m_expanded;
  QVector<Row> m_rows;
  // Requests in flight: ticket to the listed path.
  QHash<quint64, QString> m_pending;
  quint64 m_nextTicket = 0;
  quint64 m_rootTicket = 0;
  // A refresh answers into m_staged and applies once every ticket is back.
  QSet<quint64> m_refreshTickets;
  QHash<QString, Listing> m_staged;
  bool m_refreshAgain = false;
  Preview m_preview;
  // The timeline read in flight for the preview, or 0.
  quint64 m_timelineTicket = 0;
};
}
