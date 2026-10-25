#pragma once

// The clip pictures of the tracks (M2b): audio waveforms and video
// filmstrips, as the web draws them (ClipBody.tsx WaveformCanvas and the
// filmstrip cells).
//
// - Peaks: the server's `/api/assets/:id/peaks` (audio-peaks.ts), computed
//   here from the clip's local file: the first channel of the first audio
//   stream, the absolute maximum per block of samples, reduced to 2000 peaks
//   rounded to 1/10000, and the decoded length.
// - Thumbnails: clipThumbnails.ts, 24 frames spread evenly over the video
//   (i / 23 of its length), 160 px wide, laid side by side in one atlas
//   image on the worker. An image clip has one picture.
//
// The cache (review F1, F4, F5):
// - Work runs off the GUI thread, at most two files at once (the web's
//   MAX_CONCURRENT).
// - A result belongs to one version of a file (path, size, modification
//   time, MediaVersion.h). A completion for a version that is no longer the
//   file's is dropped, and a replaced file decodes again.
// - Each request names its subscriber. When the last subscriber of a job
//   goes (its clip left the view, its document closed), a queued job is
//   dropped and a running one is interrupted.
// - Peaks are kept without a limit (as the web), thumbnails for the 32 most
//   recently used files. A failed file is tried again after 30 s.
//
// The items draw with scene-graph nodes, only over the part of the clip that
// crosses the lanes viewport plus one viewport on each side (review F2), and
// repaint only when an input changes or the view leaves that span, never on
// a playhead move (D30). Filmstrip textures are shared per atlas and window,
// counted by their users, and an unused one is freed once the unused ones
// pass the window's byte budget.

#include <QColor>
#include <QHash>
#include <QImage>
#include <QObject>
#include <QPointer>
#include <QQuickItem>
#include <QSet>
#include <QString>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

#include <atomic>
#include <functional>
#include <list>
#include <memory>
#include <vector>

#include "ui/TimelineViewState.h"

class QQuickWindow;

namespace nt::ui {

#ifdef Q_OS_UNIX
using LocalIoHook = std::function<void(const char* operation, const QString& path)>;
void setLocalIoStallForTesting(LocalIoHook hook);
int outstandingLocalIoForTesting();
#endif

inline constexpr int FULL_ASSET_PEAK_COUNT = 2000;
inline constexpr int THUMBNAIL_COUNT = 24;     // SOURCE_COUNT
inline constexpr int THUMBNAIL_WIDTH_PX = 160;  // THUMB_WIDTH_PX
inline constexpr int FILMSTRIP_CELL_PX = 60;
// How long a file's open and stream probe may take: a stalled read (a slow
// disk, a pipe) gives up after it. 0: no limit.
inline constexpr int OPEN_TIMEOUT_MS = 20000;

struct AudioPeaks {
    std::vector<float> peaks;
    double durationMs = 0;
};

struct Thumbnail {
    double timeSec = 0;
    QImage image;
};

// The thumbnails of one file version, and the atlas the items texture from:
// thumbnail i is the rect at x = i * thumbSize.width().
struct ThumbnailSet {
    std::vector<Thumbnail> thumbs;
    QImage atlas;
    QSize thumbSize;
};

// Decoding, on the calling thread. Empty or null on failure, when `cancel`
// turns true (checked at every read, the open and probe included), or when
// the open and probe take longer than `openTimeoutMs`.
std::shared_ptr<const AudioPeaks> computeAudioPeaks(const QString& path, int count = FULL_ASSET_PEAK_COUNT,
                                                    const std::atomic<bool>* cancel = nullptr,
                                                    int openTimeoutMs = OPEN_TIMEOUT_MS);
std::vector<Thumbnail> extractThumbnails(const QString& path, int count = THUMBNAIL_COUNT,
                                         int width = THUMBNAIL_WIDTH_PX, const std::atomic<bool>* cancel = nullptr,
                                         int openTimeoutMs = OPEN_TIMEOUT_MS);
// On Unix the image reader uses interruptible local I/O with the same deadline.
// Other platforms check cancellation before and after the image read.
std::vector<Thumbnail> loadImageThumbnail(const QString& path, int width = 2 * THUMBNAIL_WIDTH_PX,
                                          const std::atomic<bool>* cancel = nullptr, int openTimeoutMs = OPEN_TIMEOUT_MS);
// The thumbnails with their atlas.
std::shared_ptr<const ThumbnailSet> makeThumbnailSet(std::vector<Thumbnail> thumbs);

// audioPeaks.ts samplePeaksWindow: the maximum of the full peaks over each
// of `peakCount` slices of [inPointMs, outPointMs].
std::vector<float> samplePeaksWindow(const std::vector<float>& fullPeaks, double sourceDurationMs, double inPointMs,
                                     double outPointMs, int peakCount);
// Slice i of the same window alone.
float samplePeakAt(const std::vector<float>& fullPeaks, double sourceDurationMs, double inPointMs, double outPointMs,
                   int peakCount, int i);

// filmstripCells.ts selectFilmstripCells: for each cell, the index of the
// thumbnail nearest its source time.
std::vector<int> selectFilmstripCells(const std::vector<Thumbnail>& thumbnails, int cellCount, double inPointMs,
                                      double outPointMs);
// Cell i alone.
int filmstripCellAt(const std::vector<Thumbnail>& thumbnails, int cellCount, double inPointMs, double outPointMs,
                    int i);
// beyondSourceFraction: the share of the window past the last sampled frame.
double beyondSourceFraction(const std::vector<Thumbnail>& thumbnails, double inPointMs, double outPointMs);

class MediaPreviewCache : public QObject {
    Q_OBJECT
public:
    static MediaPreviewCache& instance();

    // The result for the file's current version, or null while it decodes
    // (the first call starts it). `subscriber` keeps the job alive; a job
    // whose subscribers are all gone is dropped or interrupted.
    std::shared_ptr<const AudioPeaks> peaks(const QString& path, const QObject* subscriber);
    // kind: "video" or "image".
    std::shared_ptr<const ThumbnailSet> thumbnails(const QString& path, const QString& kind,
                                                   const QObject* subscriber);
    // `subscriber` no longer waits for anything (it also stops when destroyed).
    void unsubscribe(const QObject* subscriber);

    // Tests: drop every result and wait for running work.
    void clear();
    void waitForIdle();
    int decodeCount() const { return m_decodes; }
    // Jobs started and not yet finished or dropped.
    int pendingCount() const { return static_cast<int>(m_jobs.size()); }
    // Jobs dropped or interrupted because nobody waited for them.
    int cancelledCount() const { return m_cancelled.load(); }
    int cachedThumbnailSets() const { return static_cast<int>(m_thumbs.size()); }
    // Decodes that ran on the GUI thread (tests: none should).
    int guiThreadDecodes() const { return m_guiThreadDecodes.load(); }
    // How long a file's open and probe may take before the job gives up
    // (tests; a negative value restores the default).
    void setOpenTimeoutMs(int ms);

signals:
    void peaksReady(const QString& path);
    void thumbnailsReady(const QString& path);

private:
    MediaPreviewCache();

    struct Job {
        QString key;
        QString path;
        QString kind;  // "peaks", "video" or "image"
        QString version;
        int openTimeoutMs = OPEN_TIMEOUT_MS;
        std::atomic<bool> cancel{false};
        QSet<const QObject*> subscribers;
    };
    void start(const QString& key, const QString& path, const QString& kind, const QString& version,
               const QObject* subscriber);
    void subscribe(const std::shared_ptr<Job>& job, const QObject* subscriber);
    void finish(const std::shared_ptr<Job>& job, std::shared_ptr<const AudioPeaks> peaks,
                std::shared_ptr<const ThumbnailSet> thumbs);
    bool failedRecently(const QString& key) const;

    QHash<QString, std::shared_ptr<const AudioPeaks>> m_peaks;  // by version key
    QHash<QString, std::shared_ptr<const ThumbnailSet>> m_thumbs;
    std::list<QString> m_thumbLru;  // front: most recent
    QHash<QString, qint64> m_failedAtMs;
    QHash<QString, std::shared_ptr<Job>> m_jobs;
    QHash<const QObject*, QMetaObject::Connection> m_watched;
    int m_decodes = 0;
    std::atomic<int> m_cancelled{0};
    std::atomic<int> m_guiThreadDecodes{0};
    int m_openTimeoutMs = OPEN_TIMEOUT_MS;
};

struct FilmstripTextureStats {
    int textures = 0;
    int unused = 0;
    qint64 bytes = 0;
};
// The filmstrip textures of a window (tests), and the byte budget of its
// unused ones (default 64 MiB).
FilmstripTextureStats filmstripTextureStats(QQuickWindow* window);
void setFilmstripTextureBudget(QQuickWindow* window, qint64 bytes);

}  // namespace nt::ui

// The common part of the two picture items: the source and its window, the
// item's x in the lanes content and the view state, for the drawn span.
class ClipPictureItem : public QQuickItem {
    Q_OBJECT
    QML_ANONYMOUS
    Q_PROPERTY(QString source READ source WRITE setSource NOTIFY changed)
    Q_PROPERTY(double inPointMs READ inPointMs WRITE setInPointMs NOTIFY changed)
    Q_PROPERTY(double outPointMs READ outPointMs WRITE setOutPointMs NOTIFY changed)
    // Where the item starts in the lanes content, in px, and the view whose
    // viewport limits the drawn span. Without a view the whole item draws.
    Q_PROPERTY(double contentX READ contentX WRITE setContentX NOTIFY changed)
    Q_PROPERTY(TimelineViewState* viewState READ viewState WRITE setViewState NOTIFY changed)
    Q_PROPERTY(bool loaded READ loaded NOTIFY loadedChanged)
    Q_PROPERTY(int paintCount READ paintCount NOTIFY painted)

public:
    explicit ClipPictureItem(QQuickItem* parent = nullptr);
    ~ClipPictureItem() override;
    QString source() const { return m_source; }
    void setSource(const QString& s);
    double inPointMs() const { return m_in; }
    void setInPointMs(double v);
    double outPointMs() const { return m_out; }
    void setOutPointMs(double v);
    double contentX() const { return m_contentX; }
    void setContentX(double v);
    TimelineViewState* viewState() const { return m_view; }
    void setViewState(TimelineViewState* v);
    virtual bool loaded() const = 0;
    int paintCount() const { return m_paintCount; }

signals:
    void changed();
    void loadedChanged();
    void painted();

protected:
    // A span of the item in its own px.
    struct Span {
        double from = 0;
        double to = 0;
    };
    Span visibleSpan() const;
    Span drawSpan() const;  // the visible span plus one viewport each side
    void invalidate();
    virtual void fetch() = 0;
    void onViewMoved();

    QString m_source;
    double m_in = 0;
    double m_out = 0;
    double m_contentX = 0;
    QPointer<TimelineViewState> m_view;
    bool m_dirty = true;
    Span m_drawn{0, -1};  // what the last paint covered
    int m_paintCount = 0;
};

// The waveform of an audio clip (WaveformCanvas): success-coloured bars, one
// per 2 px, centred, over the part of the clip its source covers. One
// geometry node, two triangles per bar.
class WaveformItem : public ClipPictureItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QColor color READ color WRITE setColor NOTIFY changed)
    Q_PROPERTY(int barCount READ barCount NOTIFY painted)
    Q_PROPERTY(double sourceDurationMs READ sourceDurationMs NOTIFY loadedChanged)

public:
    explicit WaveformItem(QQuickItem* parent = nullptr);
    QColor color() const { return m_color; }
    void setColor(const QColor& c);
    bool loaded() const override { return m_peaks != nullptr; }
    int barCount() const { return m_barCount; }
    double sourceDurationMs() const { return m_peaks ? m_peaks->durationMs : 0; }
    // The bars drawn by the last paint, in item coordinates (tests).
    Q_INVOKABLE QVariantList barRects() const;

protected:
    QSGNode* updatePaintNode(QSGNode* old, UpdatePaintNodeData* data) override;
    void fetch() override;

private:
    std::vector<QRectF> computeBars(Span span) const;
    QColor m_color;
    std::shared_ptr<const nt::ui::AudioPeaks> m_peaks;
    int m_lastWidth = -1;
    int m_barCount = 0;
    std::vector<QRectF> m_bars;
};

// The filmstrip of a video clip (one cell per 60 px, each the thumbnail
// nearest its source time, covering the cell, at 78 % opacity, 2 px apart),
// with the part past the source end striped; or the one picture of an image
// clip, covering the strip.
class FilmstripItem : public ClipPictureItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QString kind READ kind WRITE setKind NOTIFY changed)
    // The clip's width: the cell count comes from it, not from the strip's.
    Q_PROPERTY(double clipWidthPx READ clipWidthPx WRITE setClipWidthPx NOTIFY changed)
    Q_PROPERTY(QColor stripeColor READ stripeColor WRITE setStripeColor NOTIFY changed)
    Q_PROPERTY(int cellCount READ cellCount NOTIFY painted)
    // The cells the last paint drew (those in the drawn span).
    Q_PROPERTY(int drawnCells READ drawnCells NOTIFY painted)
    // The striped tail as a share of the strip (0: none drawn).
    Q_PROPERTY(double stripedFraction READ stripedFraction NOTIFY painted)

public:
    explicit FilmstripItem(QQuickItem* parent = nullptr);
    ~FilmstripItem() override;
    QString kind() const { return m_kind; }
    void setKind(const QString& k);
    double clipWidthPx() const { return m_clipWidth; }
    void setClipWidthPx(double v);
    QColor stripeColor() const { return m_stripe; }
    void setStripeColor(const QColor& c);
    bool loaded() const override { return m_thumbs != nullptr; }
    int cellCount() const { return m_cellCount; }
    int drawnCells() const { return m_drawnCells; }
    double stripedFraction() const { return m_stripedFraction; }
    // The thumbnail index of each cell (tests).
    Q_INVOKABLE QVariantList cellThumbnails() const;
    // The cells the last paint drew, in item coordinates (tests).
    Q_INVOKABLE QVariantList cellRects() const;

protected:
    QSGNode* updatePaintNode(QSGNode* old, UpdatePaintNodeData* data) override;
    void releaseResources() override;
    void fetch() override;

private:
    void releaseTextures();
    QString m_kind = QStringLiteral("video");
    double m_clipWidth = 0;
    QColor m_stripe;
    std::shared_ptr<const nt::ui::ThumbnailSet> m_thumbs;
    // The textures the current node uses, by image key, in the window's cache.
    QPointer<QQuickWindow> m_textureWindow;
    QList<qint64> m_textureKeys;
    // The cache generation the keys are counted in.
    quint64 m_textureGeneration = 0;
    int m_cellCount = 0;
    int m_drawnCells = 0;
    std::vector<QRectF> m_cellRects;
    double m_stripedFraction = 0;
};
