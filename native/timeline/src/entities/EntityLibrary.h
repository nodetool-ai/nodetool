#pragma once
#include <QJsonObject>
#include <QHash>
#include <QObject>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>
#include <QSet>
#include <QtQmlIntegration/qqmlintegration.h>

class EntityLibrary : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QString projectId READ projectId WRITE setProjectId NOTIFY changed)
    Q_PROPERTY(bool configured READ configured NOTIFY changed)
    Q_PROPERTY(QVariantList entities READ entities NOTIFY entitiesChanged)
    Q_PROPERTY(QVariantMap imageUrls READ imageUrls NOTIFY imageUrlsChanged)
    Q_PROPERTY(QVariantList images READ images NOTIFY imagesChanged)
    Q_PROPERTY(bool loading READ loading NOTIFY changed)
    Q_PROPERTY(bool imagesLoading READ imagesLoading NOTIFY changed)
    Q_PROPERTY(bool uploading READ uploading NOTIFY changed)
    Q_PROPERTY(QString uploadError READ uploadError NOTIFY changed)
    Q_PROPERTY(bool saving READ saving NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString imagesError READ imagesError NOTIFY changed)
    Q_PROPERTY(QString saveError READ saveError NOTIFY changed)
    Q_PROPERTY(QString actionError READ actionError NOTIFY changed)
    Q_PROPERTY(bool canUndo READ canUndo NOTIFY changed)
    Q_PROPERTY(QString removedName READ removedName NOTIFY changed)
public:
    explicit EntityLibrary(QObject* parent = nullptr);
    QString projectId() const { return m_projectId; }
    void setProjectId(const QString& id);
    bool configured() const;
    QVariantList entities() const { return m_entities; }
    QVariantMap imageUrls() const { return m_imageUrls; }
    QVariantList images() const { return m_images; }
    bool loading() const { return m_loading; }
    bool imagesLoading() const { return m_imagesLoading; }
    bool uploading() const { return m_uploading; }
    QString uploadError() const { return m_uploadError; }
    Q_INVOKABLE void uploadImages(const QList<QUrl>& files);
    // Fetches the thumbnails of images outside the listed scope, such as new pictures, into imageUrls.
    Q_INVOKABLE void resolveImages(const QStringList& ids);
    bool saving() const { return m_saving; }
    QString error() const { return m_error; }
    QString imagesError() const { return m_imagesError; }
    QString saveError() const { return m_saveError; }
    QString actionError() const { return m_actionError; }
    bool canUndo() const { return !m_removed.isEmpty(); }
    QString removedName() const;
    Q_INVOKABLE void clearActionError();
    Q_INVOKABLE void ensureLoaded();
    Q_INVOKABLE void configure(const QUrl& server, const QString& token = {});
    Q_INVOKABLE void reload();
    Q_INVOKABLE void loadImages();
    Q_INVOKABLE void save(const QVariantMap& draft);
    Q_INVOKABLE void remove(const QString& id);
    Q_INVOKABLE void undoRemove();
    Q_INVOKABLE void dismissRemoved();
signals:
    void changed();
    void entitiesChanged();
    void imagesChanged();
    void imageUrlsChanged();
    void imagesUploaded(const QStringList& ids);
    void saved(const QVariantMap& entity);
    void removed(const QString& id);
private:
    void reset();
    void load(bool images);
    void finishUpload();
    enum class Write { Save, Remove, Restore };
    void write(const QVariantMap& draft, Write mode);
    QString m_projectId, m_token, m_error, m_imagesError, m_saveError, m_actionError;
    QString m_uploadError;
    bool m_uploading = false, m_uploadRefreshPending = false;
    QStringList m_uploadedIds;
    QUrl m_server;
    QVariantList m_entities, m_images;
    QVariantMap m_imageUrls;
    struct Removed { QString id; QJsonObject marker; };
    QList<Removed> m_removed;
    QHash<QString, QJsonObject> m_listedMarkers;
    QSet<QString> m_removing;
    bool m_loading = false, m_imagesLoading = false, m_saving = false, m_loaded = false;
    quint64 m_revision = 0, m_imagesRevision = 0, m_scopeEpoch = 0;
};
