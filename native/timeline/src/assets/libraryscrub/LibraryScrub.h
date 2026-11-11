#pragma once

// Hover scrub in the Library (issue #7092). Moving the pointer across a video tile shows the frame at
// that position of the clip, the way Premiere's Icon view does.
//
// - The pictures are the thumbnail atlas of MediaPreviewCache: 24 frames spread over the clip, decoded
//   off the GUI thread, two files at once, the cache's memory budget. Nothing decodes on a pointer move.
// - The Library lists remote assets. After a short dwell on a tile, one worker thread fetches the asset's
//   proxy (else its original) into the asset cache, once. A tile the pointer has left before the dwell
//   ends costs nothing.
// - The tile under the pointer is the hovered asset. `I` and `O` mark it in Source at the hovered time
//   without opening it, and a press on it opens it in Source at that time. Shift+H turns the scrub off,
//   as does the "Scrub clips in the Library" preference.
// - Hover is view state. It touches no document model.

#include "SourceViewerState.h"
#include "ui/MediaPreviews.h"
#include "server/AssetCache.h"
#include <QHash>
#include <QObject>
#include <QPointer>
#include <QQuickItem>
#include <QQuickPaintedItem>
#include <QThread>
#include <QTimer>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

#include <functional>
#include <memory>
#include <optional>

class LibraryScrub : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(bool enabled READ enabled WRITE setEnabled NOTIFY enabledChanged)
    // The video tile under the pointer, or empty.
    Q_PROPERTY(QString hoveredId READ hoveredId NOTIFY hoveredChanged)
    // Where across the tile the pointer is, 0 to 1.
    Q_PROPERTY(double fraction READ fraction NOTIFY positionChanged)
    // The hovered position in the clip. Valid when hasTime.
    Q_PROPERTY(double timeMs READ timeMs NOTIFY positionChanged)
    Q_PROPERTY(bool hasTime READ hasTime NOTIFY positionChanged)
    // The frames of the hovered clip are decoded and frameIndex names the one to show.
    Q_PROPERTY(bool frameReady READ frameReady NOTIFY readyChanged)
    Q_PROPERTY(int frameIndex READ frameIndex NOTIFY positionChanged)
public:
    explicit LibraryScrub(QObject* parent = nullptr);
    ~LibraryScrub() override;
    bool enabled() const { return m_enabled; }
    void setEnabled(bool value);
    QString hoveredId() const { return m_asset.value("id").toString(); }
    double fraction() const { return m_fraction; }
    bool hasTime() const;
    double timeMs() const;
    bool frameReady() const { return m_set != nullptr; }
    int frameIndex() const;
    // native-rules #1: returns std::shared_ptr with no comment on why unique ownership is impossible
    std::shared_ptr<const nt::ui::ThumbnailSet> frames() const { return m_set; }

    // The pointer is at `fraction` across the tile of `asset`.
    Q_INVOKABLE void hover(const QVariantMap& asset, double fraction);
    // The pointer left the tile of `assetId`.
    Q_INVOKABLE void leave(const QString& assetId);
    Q_INVOKABLE void clear();
    Q_INVOKABLE bool toggle();
    // Marks the hovered clip in Source ("in" or "out") at the hovered time.
    Q_INVOKABLE bool mark(const QString& edge);
    // Opens `asset` in Source at the hovered time, when it is the hovered clip.
    Q_INVOKABLE bool cue(const QVariantMap& asset);

    // Tests: how the local file of an asset is found, how long the pointer rests before work starts,
    // and the Source state to mark in.
    using Resolver = std::function<QString(const QVariantMap& asset)>;
    void setResolverForTesting(Resolver resolver) { m_resolver = std::move(resolver); }
    void setDwellMsForTesting(int ms) { m_dwell.setInterval(ms); }
    void setSourceForTesting(SourceViewerState* state) { m_source = state; }
    // Shows these frames for any hovered clip, in place of the decoded ones.
    void setFramesForTesting(std::shared_ptr<const nt::ui::ThumbnailSet> set) { m_testSet = std::move(set); }
    int fetchCount() const { return m_fetches; }

signals:
    void enabledChanged();
    // The tile under the pointer changed. Tiles bind to this one only, so a move does not wake them all.
    void hoveredChanged();
    // The pointer moved within the tile.
    void positionChanged();
    void readyChanged();

protected:
    bool eventFilter(QObject* watched, QEvent* event) override;

private:
    SourceViewerState* source();
    void settle();
    void release();
    void acquire();
    void startFetch();
    void received(const QString& id, const QString& path, nt::server::AssetCache::Lease lease);
    bool pointerKey(QKeyEvent* event);
    static bool scrubbable(const QVariantMap& asset);

    bool m_enabled = true;
    QVariantMap m_asset;
    double m_fraction = 0;
    // native-rules #1: std::shared_ptr ThumbnailSet, no comment on why unique ownership is impossible
    std::shared_ptr<const nt::ui::ThumbnailSet> m_set;
    std::shared_ptr<const nt::ui::ThumbnailSet> m_testSet;
    QString m_path;
    QTimer m_dwell;
    bool m_settled = false;
    Resolver m_resolver;
    QPointer<SourceViewerState> m_source;
    QPointer<QThread> m_worker;
    QVariantMap m_wanted;
    QHash<QString, QString> m_paths;
    QHash<QString, nt::server::AssetCache::Lease> m_leases;
    QList<QString> m_pathOrder;
    QList<QString> m_leaseOrder;
    QHash<QString, qint64> m_failedAtMs;
    int m_fetches = 0;
};

// One frame of the hovered clip, drawn into a tile.
class LibraryScrubFrame : public QQuickPaintedItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(LibraryScrub* scrub READ scrub WRITE setScrub NOTIFY scrubChanged)
public:
    explicit LibraryScrubFrame(QQuickItem* parent = nullptr);
    LibraryScrub* scrub() const { return m_scrub; }
    void setScrub(LibraryScrub* scrub);
    void paint(QPainter* painter) override;
signals:
    void scrubChanged();
private:
    QPointer<LibraryScrub> m_scrub;
};
