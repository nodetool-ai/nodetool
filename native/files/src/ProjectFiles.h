#pragma once
#include <QAbstractListModel>
#include <QHash>
#include <QNetworkAccessManager>
#include <QSet>
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
  Q_PROPERTY(bool hasFolder READ hasFolder NOTIFY folderChanged)
  // Whether the folder is on this machine, so a file manager can show it.
  Q_PROPERTY(bool revealable READ revealable NOTIFY folderChanged)
  Q_PROPERTY(QString revealLabel READ revealLabel CONSTANT)
  // The root listing is in flight and nothing is shown yet.
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

  // Drops every listing and request. An empty origin stops listing.
  void configure(const QUrl &origin, const QString &token, const QString &userId);
  // The folder of the shown project: its workspace id, empty when it has no
  // folder, and its absolute path when it is on this machine. A new id lists
  // its root.
  void setFolder(const QString &workspaceId, const QString &localPath = {});

  QString workspaceId() const { return m_workspace; }
  bool hasFolder() const { return !m_workspace.isEmpty(); }
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

  // A `workspacefile` push: files in that workspace changed. Refreshes when
  // it is this folder or the id is unknown.
  void workspaceFilesChanged(const QString &workspaceId);

  // Natural, case-insensitive order: "2" before "10", "a" next to "A".
  static int naturalCompare(QStringView a, QStringView b);
  // Kind of a file by its name, as workspaceFileKind.ts.
  static QString kindOf(const QString &name);
  // The preview kind of a file by its name, or empty: the media kinds that
  // have a picture or a player, and the timeline and workflow documents.
  static QString previewKindOf(const QString &name);
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

protected:
  // Starts workspace.listFiles for a path ("." is the root). The answer must
  // arrive through receiveListing with the same ticket. A test overrides it.
  virtual void requestListing(quint64 ticket, const QString &path);
  // Downloads a timeline file for its summary. The answer must arrive
  // through receiveTimeline with the same ticket. A test overrides it.
  virtual void requestTimeline(quint64 ticket, const QString &path);

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

  QNetworkAccessManager m_network;
  QUrl m_origin;
  QString m_token, m_user, m_workspace, m_localPath, m_selected, m_rootError;
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
