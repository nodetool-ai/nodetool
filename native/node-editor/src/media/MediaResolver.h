#pragma once
#include <QObject>
#include <QNetworkAccessManager>
#include <QPointer>
#include <QTemporaryDir>
#include <QVariant>
#include <QUrl>
#include <functional>
#include <QSet>
class QNetworkReply;
namespace nodetool::node_editor {
class MediaResolver final : public QObject {
  Q_OBJECT
public:
  explicit MediaResolver(QObject *parent = nullptr);
  void configure(const QUrl &server, const QString &token);
  Q_INVOKABLE void resolve(const QString &key, const QVariant &source);
  Q_INVOKABLE void cancel(const QString &key);
  // Stop and clear every consumer for this key before releasing its URLs.
  Q_INVOKABLE void release(const QString &key);
  Q_INVOKABLE void clear();
signals:
  void resolved(QString key, QUrl localUrl);
  void failed(QString key, QString message);
  void cleared();
private:
  void fetch(const QString &key, quint64 serial, const QUrl &url, bool lookup, int redirects = 0);
  void store(const QString &key, quint64 serial, const QByteArray &bytes, const QString &suffix);
  bool current(const QString &key, quint64 serial) const;
  bool useCached(const QString &key, quint64 serial, const QString &identity);
  bool makeRoom(qint64 bytes);
  struct CacheEntry { QUrl url; qint64 bytes; quint64 used; };
  QHash<QString, CacheEntry> entries_;
  QHash<QString, QString> identities_;
  QHash<QString, QSet<QString>> leases_;
  QNetworkAccessManager network_;
  QUrl server_;
  QString token_;
  QTemporaryDir cache_;
  QHash<QString, quint64> serials_;
  QHash<QString, QPointer<QNetworkReply>> replies_;
  quint64 next_ = 0;
  qint64 diskBytes_ = 0;

};
}
