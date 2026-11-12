#pragma once
#include "AssetListModel.h"
#include <QNetworkAccessManager>
#include <QObject>
#include <QPointer>
#include <QUrl>
#include <QVariantList>
class QNetworkReply;
namespace nodetool::node_editor {
// The account's asset library for the Library side panel: the rows of one
// folder, in the shape that NodeTool.Media's AssetGrid and AssetItem read as
// their `browser`. The editor window owns one per tab, and LibraryPanel.qml
// gets a non-owning pointer through its required `library` property.
// Thread affinity: UI thread only.
class LibraryBrowser : public QObject {
  Q_OBJECT
  Q_PROPERTY(AssetListModel *assetModel READ assetModel CONSTANT)
  Q_PROPERTY(bool configured READ configured NOTIFY changed)
  Q_PROPERTY(bool busy READ busy NOTIFY changed)
  Q_PROPERTY(QString error READ error NOTIFY changed)
  Q_PROPERTY(QString folderId READ folderId NOTIFY changed)
  Q_PROPERTY(QVariantList breadcrumbs READ breadcrumbs NOTIFY changed)
  // An active filter searches every folder, as in the timeline Library.
  Q_PROPERTY(QString searchText READ searchText WRITE setSearchText NOTIFY changed)
  Q_PROPERTY(QString typeFilter READ typeFilter WRITE setTypeFilter NOTIFY changed)
  Q_PROPERTY(QString tagFilter READ tagFilter WRITE setTagFilter NOTIFY changed)
  Q_PROPERTY(bool favoritesOnly READ favoritesOnly WRITE setFavoritesOnly NOTIFY changed)
public:
  explicit LibraryBrowser(QObject *parent = nullptr);
  void configure(const QUrl &origin, const QString &token, const QString &userId);
  AssetListModel *assetModel() { return &model_; }
  bool configured() const { return !origin_.isEmpty(); }
  bool busy() const { return !list_.isNull(); }
  QString error() const { return error_; }
  QString folderId() const { return folder_; }
  QVariantList breadcrumbs() const { return crumbs_; }
  QString searchText() const { return search_; }
  QString typeFilter() const { return type_; }
  QString tagFilter() const { return tag_; }
  bool favoritesOnly() const { return favorites_; }
  void setSearchText(const QString &);
  void setTypeFilter(const QString &);
  void setTagFilter(const QString &);
  void setFavoritesOnly(bool);
  Q_INVOKABLE void createFolder(const QString &name);
  // Lists the current folder again. The first call opens the home folder.
  Q_INVOKABLE void refresh();
  Q_INVOKABLE void openFolder(const QString &id);
  Q_INVOKABLE void goUp();
  Q_INVOKABLE void moveAsset(const QString &id, const QString &parentId);
  Q_INVOKABLE QString mediaType(const QVariantMap &asset) const;
  Q_INVOKABLE QUrl mediaUrl(const QString &path) const;
  // Starts a platform drag with the web asset payload, so the canvas adds the
  // matching constant node.
  Q_INVOKABLE void dragAsset(const QVariantMap &asset);
signals:
  void changed();
  void dragStarted(QString assetId);
private:
  QNetworkRequest request(const QUrl &url) const;
  void list();
  bool filtered() const { return !search_.trimmed().isEmpty() || !type_.isEmpty() || !tag_.trimmed().isEmpty() || favorites_; }
  void filterChanged();
  AssetListModel model_;
  QNetworkAccessManager network_;
  QUrl origin_;
  QString token_, user_, folder_, error_;
  QString search_, type_, tag_;
  bool favorites_ = false;
  bool dragging_ = false;
  // The opened folders from the home folder down: {id, name} rows.
  QVariantList crumbs_;
  // The reply owns itself through deleteLater. A newer list replaces it.
  QPointer<QNetworkReply> list_;
  quint64 epoch_ = 0;
};
}
