#pragma once
#include "edit/ClipGestureController.h"
#include "assets/AssetBrowser.h"
#include "SourceMonitor.h"
#include "SourceRange.h"
#include <QObject>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class SourceViewerState : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(SourceMonitor* monitor READ monitor CONSTANT)
    Q_PROPERTY(QString patchedVideoTrackId READ patchedVideoTrackId NOTIFY patchChanged)
    Q_PROPERTY(QString patchedAudioTrackId READ patchedAudioTrackId NOTIFY patchChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY errorChanged)
    Q_PROPERTY(bool rangeDragging READ rangeDragging NOTIFY changed)
    Q_PROPERTY(bool hasMarks READ hasMarks NOTIFY changed)
    Q_PROPERTY(QVariantMap asset READ asset WRITE setAsset NOTIFY changed)
    Q_PROPERTY(AssetBrowser* mediaBrowser READ mediaBrowser WRITE setMediaBrowser NOTIFY changed)
    Q_PROPERTY(QVariantMap sourceRange READ sourceRange NOTIFY changed)
    Q_PROPERTY(QString mediaType READ mediaType NOTIFY changed)
    Q_PROPERTY(double inMs READ inMs NOTIFY changed)
    Q_PROPERTY(double outMs READ outMs NOTIFY changed)
    Q_PROPERTY(double durationMs READ durationMs NOTIFY changed)
    // Where Match Frame parked the asset, or 0.
    Q_PROPERTY(double cueMs READ cueMs NOTIFY cued)
public:
    explicit SourceViewerState(QObject* parent = nullptr);
    SourceMonitor* monitor() const { return m_monitor; }
    QString patchedVideoTrackId() const { return m_videoPatch; }
    QString patchedAudioTrackId() const { return m_audioPatch; }
    QString lastError() const { return m_error; }
    bool rangeDragging() const { return m_drag.has_value(); }
    bool hasMarks() const { return m_marks.contains("inMs") || m_marks.contains("outMs"); }
    Q_INVOKABLE void togglePatch(const QString& kind, const QString& trackId);
    Q_INVOKABLE void clearError();
    Q_INVOKABLE void clearMarks();
    Q_INVOKABLE void beginRangeDrag(const QString& edge);
    Q_INVOKABLE void updateRangeDrag(double deltaMs);
    Q_INVOKABLE void commitRangeDrag();
    Q_INVOKABLE void cancelRangeDrag();
    Q_INVOKABLE bool place(const QString& mode, const QString& trackId, double startMs, double snapMs,
                          bool video, bool audio, const QVariantMap& capturedRange, ClipGestureController* gestures);
    Q_INVOKABLE QVariantMap captureRange() const;
    Q_INVOKABLE bool canPlace(const QString& trackId, bool video, bool audio, ClipGestureController* gestures) const;
    Q_INVOKABLE bool runAction(const QString& action, bool autoRepeat);
    void reloadMarksForTest();
    QVariantMap asset() const { return m_asset; }
    AssetBrowser* mediaBrowser() const { return m_mediaBrowser.data(); }
    void setMediaBrowser(AssetBrowser* browser);
    void setAsset(const QVariantMap& asset);
    QVariantMap sourceRange() const { return m_marks; }
    QString mediaType() const;
    double inMs() const;
    double outMs() const;
    double durationMs() const;
    double cueMs() const { return m_cueMs; }
    // Shows `asset` parked on the source time `timeMs`.
    void cue(const QVariantMap& asset, double timeMs);
    Q_INVOKABLE void markIn(double timeMs);
    Q_INVOKABLE void markOut(double timeMs);
    // Marks `edge` ("in" or "out") of any video asset at `timeMs`, without opening it in Source.
    Q_INVOKABLE bool markAsset(const QVariantMap& asset, const QString& edge, double timeMs);
    // The saved marks of an asset (tests and the Library).
    QJsonObject savedMarks(const QString& assetId);
    Q_INVOKABLE void setIn(const QString& seconds);
    Q_INVOKABLE void setOut(const QString& seconds);
    Q_INVOKABLE bool perform(const QString& kind, ClipGestureController* gestures);
    Q_INVOKABLE QString shortcut(const QString& kind, const QString& preset) const;
signals:
    void changed();
    void cued();
    void patchChanged();
    void errorChanged();
private:
    void writeMarks(const QVariantMap& marks);
    void persistMarks(const QString& id, const QJsonObject& stored);
    void loadMarks();
    void setError(const QString& error);
    bool applyPlacement(nt::sourceedit::Placement placement, ClipGestureController* gestures);
    SourceMonitor* m_monitor;
    QString m_videoPatch;
    QString m_audioPatch;
    QString m_error;
    bool m_marksLoaded = false;
    QJsonObject m_savedMarks;
    QStringList m_markOrder;
    struct Drag {
        nt::sourceedit::Range original;
        nt::sourceedit::Range preview;
        nt::sourceedit::RangeEdge edge;
    };
    std::optional<Drag> m_drag;
    QPointer<AssetBrowser> m_mediaBrowser;
    QVariantMap m_asset;
    QVariantMap m_marks;
    QString m_cueAssetId;
    double m_cueMs = 0;
};
