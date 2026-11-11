#pragma once
#include <QObject>
#include <QNetworkAccessManager>
#include <QPointer>
#include <QTemporaryDir>
#include <QVariant>
#include <QUrl>
#include <functional>
#include <memory>
#include <QSet>
#include <QQueue>
class QNetworkReply;
class QHttpMultiPart;
class QIODevice;
namespace nodetool::node_editor {
class MediaResolver final : public QObject {
  Q_OBJECT
public:
  explicit MediaResolver(QObject *parent = nullptr);
  void configure(const QUrl &server, const QString &token);
  Q_INVOKABLE void resolve(const QString &key, const QVariant &source);
  Q_INVOKABLE QString resolvedText(const QString &key) const;
  Q_INVOKABLE void cancel(const QString &key);
  // Stop and clear every consumer for this key before releasing its URLs.
  Q_INVOKABLE void release(const QString &key);
  Q_INVOKABLE void clear();
  Q_INVOKABLE QString suggestedFilename(const QString &key, const QString &requested, const QString &kind) const;
  Q_INVOKABLE bool saveResolved(const QString &key, const QUrl &destination);
  // Web "Save to assets": uploads the leased bytes through POST /api/assets as the account.
  Q_INVOKABLE bool saveToAssets(const QString &key, const QString &requested, const QString &kind);
  // Web Preview Download and Add to assets for a value without media: the value as a text file.
  Q_INVOKABLE bool saveText(const QString &key, const QString &text, const QUrl &destination);
  Q_INVOKABLE bool saveTextToAssets(const QString &key, const QString &text, const QString &name, const QString &contentType);
  // The leased bytes, for clipboard copy. Empty once the key is released or unresolved.
  Q_INVOKABLE QByteArray resolvedBytes(const QString &key) const;
signals:
  void resolved(QString key, QUrl localUrl);
  void failed(QString key, QString message);
  void cleared();
  void saved(QString key, QUrl destination);
  void saveFailed(QString key, QString message);
  void assetSaved(QString key, QString assetId);
  void assetSaveFailed(QString key, QString message);
private:
  void fetch(const QString &key, quint64 serial, const QUrl &url, bool lookup, int redirects = 0);
  void store(const QString &key, quint64 serial, const QByteArray &bytes, const QString &suffix, const QString &contentType = {});
  bool current(const QString &key, quint64 serial) const;
  void drainFetches();
  struct PendingFetch { QString key; quint64 serial; QUrl url; bool lookup; int redirects; };
  QQueue<PendingFetch> pending_;
  bool useCached(const QString &key, quint64 serial, const QString &identity);
  // A compressed PNG of a local-media image, for saving. Its display cache is
  // written for speed instead. Empty for any other identity.
  QByteArray savedLocalImage(const QString &identity) const;
  bool makeRoom(qint64 bytes);
  // Posts one file to /api/assets. The reply owns the multipart, which owns the file device.
  // live() is checked when the reply finishes, so a released key emits nothing.
  bool postAsset(const QString &key, std::unique_ptr<QHttpMultiPart> multipart, QIODevice *file, const QString &name,
    const QString &mime, std::function<bool()> live);
  struct CacheEntry { QUrl url; qint64 bytes; quint64 used; QString contentType; };
  QHash<QString, CacheEntry> entries_;
  QHash<QString, QString> identities_;
  QHash<QString, QSet<QString>> leases_;
  QNetworkAccessManager network_;
  QUrl server_;
  QString token_;
  QTemporaryDir cache_;
  QHash<QString, quint64> serials_;
  QHash<QString, QPointer<QNetworkReply>> replies_;
  QHash<QString, QPointer<QNetworkReply>> uploads_;
  quint64 next_ = 0;
  qint64 diskBytes_ = 0;

};
}
