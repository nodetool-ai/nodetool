#pragma once

// The clip gestures and the editing keys of the tracks region (M4), copied
// from useClipDrag.ts, useClipTrim.ts (trimModeFor), clipSnap.ts and the
// key handler of TracksRegion.tsx:
//
// - A press on a clip body starts a move: the pointer's travel plus the
//   scroll's, snapped (both edges, 8 px), onto the lane under the pointer
//   when its type fits. With F registered, Alt at the press copies in place
//   and moves the originals, retaining snapping. A multi-selection moves together.
//   The release settles the drop with the drop mode (Ctrl forces insert). A
//   press that does not travel 3 px is a click: it selects (Shift adds,
//   Ctrl/Cmd toggles).
// - A press on a trim handle trims that edge: plain, ripple (ripple mode or
//   the Ripple tool) or roll (Ctrl/Cmd or the Roll tool). Alt bypasses snapping.
// - The tools of the toolbar (ToolToggle.tsx): Cut splits the clip at the
//   pointer; Slip drags the source under the clip (planSlip); Slide moves the
//   clip and trims its neighbours (slideClip); Track select selects every
//   clip after (or before) the pointer, then drags them; Rate stretch turns
//   an edge drag into a speed change (rateStretchClip). Hand and Zoom act on
//   the lanes, in TracksRegion.qml. Under these body tools a press on an
//   edge acts on the body (BODY_TOOLS).
// - The Range tool (docs/MUSIC-MODE.md MD11): a drag on an audio lane, over
//   clips or empty space, selects a range on that track in `musicSelection`.
//   Edges snap to the ruler's grid division (bar, or beat when finer) on
//   barStartFrame frames; Alt places an edge freely. A double-click on a clip
//   selects its span. A click clears the range, and on empty space it parks
//   the playhead.
// - Keys resolve through the web keymap (Keymap.h): delete, ripple delete,
//   split at the playhead, select all/none, nudge, undo/redo, the tools,
//   snap and zoom.
//
// While a gesture runs, every pointer move applies the edit to the model
// with no undo entry, so the lanes and the preview show it at once; the
// release pushes one command from the state at the press (one gesture, one
// undo entry, D5). The controller grabs the mouse at the press, so the
// gesture survives its clip's delegate moving to another lane.

#include "edit/EditActions.h"
#include "model/TimelineModel.h"
#include "model/TrackWindowModel.h"
#include "playback/PlaybackClock.h"
#include "ui/TimelineViewState.h"
#include "edit/clipboard/ClipboardOps.h"

#include <functional>

#include <QElapsedTimer>
#include <QHash>
#include <QJsonArray>
#include <QPointer>
#include <QSet>
#include <QQuickItem>
#include <QStringList>
#include <QTimer>
#include <QtQmlIntegration/qqmlintegration.h>

class TrimMode;
class MusicSelection;

class ClipGestureController : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT
    Q_MOC_INCLUDE("edit/trim/TrimMode.h")
    Q_MOC_INCLUDE("music/MusicSelection.h")
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(TimelineViewState* viewState READ viewState WRITE setViewState NOTIFY changed)
    Q_PROPERTY(TrackWindowModel* rows READ rows WRITE setRows NOTIFY changed)
    Q_PROPERTY(PlaybackClock* clock READ clock WRITE setClock NOTIFY changed)
    // The lanes viewport: the pointer's lane and the edge auto-scroll.
    Q_PROPERTY(QQuickItem* lanesViewport READ lanesViewport WRITE setLanesViewport NOTIFY changed)
    Q_PROPERTY(QStringList selection READ selection WRITE setSelection NOTIFY selectionChanged)
    Q_PROPERTY(bool rippleMode READ rippleMode WRITE setRippleMode NOTIFY optionsChanged)
    Q_PROPERTY(bool snapEnabled READ snapEnabled WRITE setSnapEnabled NOTIFY optionsChanged)
    Q_PROPERTY(bool linkedSelection READ linkedSelection WRITE setLinkedSelection NOTIFY optionsChanged)
    Q_PROPERTY(QString dropMode READ dropMode WRITE setDropMode NOTIFY optionsChanged)
    Q_PROPERTY(QString activeTool READ activeTool WRITE setActiveTool NOTIFY optionsChanged)
    Q_PROPERTY(QString keyboardPreset READ keyboardPreset WRITE setKeyboardPreset NOTIFY optionsChanged)
    // The editor context whose keys apply over the preset ("music" in the Music
    // layout, KeymapOverlay.h), or empty. Keys, shortcutFor and the sheet read
    // the keymap nt::edit::keymapName(keyboardPreset, keymapContext).
    Q_PROPERTY(QString keymapContext READ keymapContext WRITE setKeymapContext NOTIFY optionsChanged)
    // The clip under the gesture, for the lanes' pin (D28); empty when idle.
    Q_PROPERTY(QString activeClipId READ activeClipId NOTIFY gestureChanged)
    Q_PROPERTY(QString gestureKind READ gestureKind NOTIFY gestureChanged)
    // The candidate a moving edge locked onto, or -1.
    Q_PROPERTY(double snapGuideMs READ snapGuideMs NOTIFY snapGuideChanged)
    Q_PROPERTY(QString snapGuideLabel READ snapGuideLabel NOTIFY snapGuideChanged)
    Q_PROPERTY(int liveUpdates READ liveUpdates NOTIFY gestureChanged)
    // Goes up when the live list of a move changes (liveStartMs).
    Q_PROPERTY(int liveRevision READ liveRevision NOTIFY liveChanged)
    Q_PROPERTY(double trackDropY READ trackDropY NOTIFY gestureChanged)
    Q_PROPERTY(QVariantMap rubberBand READ rubberBand NOTIFY gestureChanged)
    Q_PROPERTY(QVariantMap selectedGap READ selectedGap NOTIFY selectionChanged)
    Q_PROPERTY(QVariantMap trimSourceRange READ trimSourceRange NOTIFY gestureChanged)
    Q_PROPERTY(QVariantMap toolPreview READ toolPreview NOTIFY toolPreviewChanged)
    // The edge E and the keyboard trims act on: {clipId, edge}, or empty.
    Q_PROPERTY(QVariantMap selectedEdit READ selectedEdit NOTIFY selectionChanged)
    // The inspector row Add Keyframe keys: the one last changed there.
    Q_PROPERTY(QString keyframeRow READ keyframeRow WRITE setKeyframeRow NOTIFY optionsChanged)
    // While set, as the open Effect Controls panel sets it, the keyframe navigation keys step
    // through keyframeRow alone instead of every keyframe of the clip.
    Q_PROPERTY(bool keyframeRowOnly READ keyframeRowOnly WRITE setKeyframeRowOnly NOTIFY optionsChanged)
    // Selected edit points, keyboard and dynamic trimming, and the Trim Monitor's state.
    Q_PROPERTY(TrimMode* trimMode READ trimMode CONSTANT)
    // The music generation target the Range tool selects (MD10): view state, never saved or undone.
    Q_PROPERTY(MusicSelection* musicSelection READ musicSelection CONSTANT)

public:
    explicit ClipGestureController(QQuickItem* parent = nullptr);
    ~ClipGestureController() override;

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* m);
    TimelineViewState* viewState() const { return m_view; }
    void setViewState(TimelineViewState* v);
    TrackWindowModel* rows() const { return m_rows; }
    void setRows(TrackWindowModel* r);
    PlaybackClock* clock() const { return m_clock; }
    void setClock(PlaybackClock* c);
    QQuickItem* lanesViewport() const { return m_viewport; }
    void setLanesViewport(QQuickItem* v);
    QStringList selection() const { return m_selection; }
    void setSelection(const QStringList& ids);
    bool rippleMode() const { return m_rippleMode; }
    void setRippleMode(bool on);
    bool snapEnabled() const { return m_snapEnabled; }
    void setSnapEnabled(bool on);
    bool linkedSelection() const { return m_linked; }
    void setLinkedSelection(bool on);
    QString dropMode() const { return m_dropMode; }
    void setDropMode(const QString& mode);
    QString activeTool() const { return m_tool; }
    void setActiveTool(const QString& tool);
    QString keyboardPreset() const { return m_preset; }
    void setKeyboardPreset(const QString& preset);
    QString keymapContext() const { return m_keymapContext; }
    void setKeymapContext(const QString& context);
    QString activeClipId() const { return m_gesture.clipId; }
    QString gestureKind() const { return m_gesture.kind; }
    double snapGuideMs() const { return m_snapGuideMs; }
    QString snapGuideLabel() const;
    int liveUpdates() const { return m_liveUpdates; }
    int liveRevision() const { return m_liveUpdates; }
    // The place of a clip a move shows before the document has it. -1: the
    // clip is not in the live list, so the document has its place.
    Q_INVOKABLE QString resolveKeyAction(int key, const QString& text, int modifiers) const;
    Q_INVOKABLE double liveStartMs(const QString& clipId) const;
    Q_INVOKABLE double liveDurationMs(const QString& clipId) const;
    double trackDropY() const { return m_trackDropY; }
    QVariantMap rubberBand() const { return m_rubberBand; }
    QVariantMap selectedGap() const { return m_selectedGap; }
    QVariantMap trimSourceRange() const { return m_trimSourceRange; }
    QVariantMap toolPreview() const { return m_toolPreview; }
    Q_INVOKABLE void updateToolHover(const QString& clipId, const QString& part, double sceneX, double sceneY, int modifiers = 0);
    Q_INVOKABLE void clearToolHover(const QString& clipId = {});
    Q_INVOKABLE bool previewsCut(const QString& clipId) const { return m_razorTargets.contains(clipId); }
    QVariantMap selectedEdit() const { return m_selectedEdit; }
    // Selects the gap at this time on the track, as a click on it does. False: there is none.
    Q_INVOKABLE bool selectGapAt(const QString& trackId, double timeMs);
    // Selects an edge of a clip as the edit point.
    Q_INVOKABLE void selectEdit(const QString& clipId, const QString& edge);
    // The cut at an edge of a clip: {leftId, rightId}, either empty at the end of a gap.
    Q_INVOKABLE QVariantMap editPointAt(const QString& clipId, const QString& edge) const;
    QString keyframeRow() const { return m_keyframeRow; }
    bool keyframeRowOnly() const { return m_keyframeRowOnly; }
    void setKeyframeRowOnly(bool only);
    void setKeyframeRow(const QString& row);
    TrimMode* trimMode() const { return m_trimMode; }
    MusicSelection* musicSelection() const { return m_musicSelection; }
    // Makes the music range the sequence In and Out range and turns the loop on, so
    // playback loops on it (MUSIC-MODE.md section 7). False when there is no range.
    Q_INVOKABLE bool loopMusicSelection();
    Q_INVOKABLE bool pressTrack(const QString& trackId, const QString& kind, double sceneX, double sceneY);
    Q_INVOKABLE void pressEmptyLane(const QString& trackId, double sceneX, double sceneY, int modifiers);
    Q_INVOKABLE QVariantMap groupSpan(const QString& clipId) const;
    Q_INVOKABLE void pasteAttributes(const QVariantMap& source, const QStringList& ids, const QStringList& groups);

    // trimModeFor(tool, rollModifier, rippleMode)
    static QString trimModeFor(const QString& tool, bool rollModifier, bool rippleMode);

    // The document the actions read: the model's clips and tracks.
    nt::edit::EditDoc editDoc() const;

    Q_INVOKABLE bool runAction(const QString& action, const QVariantMap& context = {});
    // Moves the selected edit point to `edgeTargetMs` as one undo entry. Ripple
    // mode decides whether later clips follow. A `merge` folds into the previous
    // keyboard trim, for a held key. False when no edit point is selected.
    bool trimEditPoint(double edgeTargetMs, bool merge);
    Q_INVOKABLE QVariantMap clipData(const QString& clipId) const;
    // True when the last clips change touched the clip (TimelineModel::clipTouched).
    Q_INVOKABLE bool clipTouched(const QString& clipId) const { return !m_timeline || m_timeline->clipTouched(clipId); }

public slots:
    // A press on a clip: `part` is "body", "start" or "end". Grabs the mouse.
    bool pressClip(const QString& clipId, const QString& part, double sceneX, double sceneY, int modifiers);
    // A key on the tracks region. Returns whether it was an editing key.
    bool handleKey(int key, const QString& text, int modifiers, bool autoRepeat);
    // A press on an empty lane at `atMs` (TrackLane.tsx): under a track
    // select tool it selects the block (Shift: that track only) and returns
    // true; otherwise false, and the lane clears and seeks.
    bool pressLane(const QString& trackId, double atMs, int modifiers);
    void undo();
    void redo();
    bool isSelected(const QString& clipId) const { return m_selection.contains(clipId); }
    // Ends the active gesture and puts the document back to the press state,
    // with no undo entry (Escape, or a key command during a gesture).
    void cancelGesture();
    // The length of a clip's source in source ms (useClipSourceDuration): the
    // probed length of its media file, or until that is known the furthest
    // out-point seen on its asset; -1 for a clip with no finite source.
    double sourceCapMs(const QString& clipId);
    // The first key of `action` under the keyboard preset ("Alt+←"), for a
    // tooltip; empty when unbound.
    QString shortcutFor(const QString& action) const;
    // The shortcut sheet under the keyboard preset (Keymap.h shortcutSheet),
    // each row with `available`: whether the native editor runs it.
    QVariantMap shortcutSheet() const;
    // The keymap actions handleKey runs, and the pointer gestures of the
    // sheet's key-only rows that work here.
    static QSet<QString> availableActions();
    // Whether the preset uses this key for an action, so a default key gives way to it.
    static bool presetUsesKey(const QString& preset, const QKeySequence& sequence);

signals:
    void changed();
    void selectionChanged();
    void optionsChanged();
    void gestureChanged();
    void liveChanged();
    void snapGuideChanged();
    void toolPreviewChanged();
    // The `?` key: open or close the shortcut sheet.
    void shortcutsToggled();
    void pasteAttributesRequested(QVariantMap source, QVariantList targets);

protected:
    bool eventFilter(QObject* watched, QEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    // The second press of a double-click during a Range tool drag belongs to that drag.
    void mouseDoubleClickEvent(QMouseEvent* event) override;
    void mouseUngrabEvent() override;
    void updatePolish() override;

private:
    void watchWindow(QQuickWindow* window);
    friend class TrimMode;
    bool runBuiltinAction(const QString& action, bool autoRepeat, const QVariantMap& context);

    struct SnapCandidates {
        std::vector<double> points;
        QHash<double, QString> labels;
    };
    struct Gesture {
        QString kind;  // clip move/trim/slip/slide, track resize/reorder, or marquee
        QString clipId;
        QString edge;  // trim: "start" or "end"
        QString mode;  // trim: "trim", "ripple" or "roll"
        double startX = 0;
        double startY = 0;
        double lastX = 0;
        double lastY = 0;
        bool alt = false;
        bool copyOnDrag = false;
        bool copiesCreated = false;
        bool additiveSelection = false;
        bool shiftAtPress = false;
        QPointF laneStart;
        double trackHeightAtStart = 64;
        QString trackType;
        QStringList selectionAtStart;
        std::vector<nt::edit::clipboard::TrackBounds> bandRows;
        double scrollLeftAtStart = 0;
        double travelledMs = 0;
        double gestureMsPerPx = 10;
        double dragStartMs = 0;
        double edgeMsAtStart = 0;
        double durationMsAtStart = 0;
        double inAtStart = 0;  // slip: the source in-point at the press
        bool dragging = false;
        SnapCandidates candidates;
        QJsonArray before;
        // The document the gesture edits; a replacement ends it.
        quint64 generation = 0;
        // range: the edge at the press (48 kHz frames), the clip pressed, and the selection before.
        std::int64_t rangeAnchor = 0;
        QString rangeClipId;
        QString rangeTrackAtStart;
        std::int64_t rangeStartAtStart = 0;
        std::int64_t rangeEndAtStart = 0;
        // The rest of a double-click that selected a clip's span: the release keeps the range.
        bool rangeHeld = false;
    };

    nt::edit::ClipList resolveEdit(const QString& name, QJsonObject payload,
                                   const std::function<nt::edit::ClipList()>& fallback,
                                   std::optional<double> maxSourceDurationMs = std::nullopt) const;
    void setDoc(const nt::edit::ClipList& clips);
    void setLiveDoc(const nt::edit::ClipList& clips);
    void flushLive();
    void clearLive();
    void applyMove();
    void applyTrim();
    void updateTrimFeedback(const nt::edit::EditDoc& doc, const QJsonObject& clip, double requestedMs, bool landed);
    void applySlip();
    void applySlide();
    void updateTrackDrag();
    void updateMarquee();
    bool beginRange(const QString& trackId, const QString& clipId, double sceneX, double sceneY, int modifiers);
    void updateRange();
    bool selectClipRange(const QString& clipId);
    QJsonObject targetingPayload() const;
    double laneMsAt(double sceneX) const;
    void finishGesture(bool completed, Qt::KeyboardModifiers modifiers);
    void selectEditPoint(const Gesture& g);
    void clickSelect(const QString& clipId, Qt::KeyboardModifiers modifiers);
    void setSnapGuide(double ms);
    QString trackUnderPointer(double sceneX, double sceneY) const;
    SnapCandidates collectSnapCandidates(const nt::edit::IdSet& exclude) const;
    double playheadMs() const;
    void nudge(double deltaMs, bool merge);
    void dropGesture();
    std::optional<double> sourceCap(const QJsonObject& clip);
    void probeSources(bool all = true);
    void syncPlaybackRange();
    // Ends a selection of clips, an edge and a gap, leaving trim mode's edit points.
    void clearClipSelection();

    TrimMode* m_trimMode = nullptr;
    // Qt child of this controller, which deletes it.
    MusicSelection* m_musicSelection = nullptr;
    // The last Range tool click on a clip, for its double-click.
    QString m_rangeClickClip;
    QElapsedTimer m_rangeClick;
    QPointer<TimelineModel> m_timeline;
    QPointer<TimelineViewState> m_view;
    QPointer<TrackWindowModel> m_rows;
    QPointer<PlaybackClock> m_clock;
    QPointer<QQuickItem> m_viewport;
    QPointer<QQuickWindow> m_eventWindow;
    QStringList m_selection;
    bool m_rippleMode = false;
    bool m_snapEnabled = true;
    bool m_linked = true;
    QString m_dropMode = QStringLiteral("overwrite");
    QString m_tool = QStringLiteral("select");
    QString m_preset = QStringLiteral("premiere");
    QString m_keymapContext;
    // The keymap keys resolve in: the preset under the editor context.
    QString keymap() const;
    Gesture m_gesture;
    QTimer m_autoScrollTimer;
    double m_snapGuideMs = -1;
    // Probed source lengths by media file, and the furthest out-point seen
    // per asset (`observedSourceEnds`).
    QHash<QString, double> m_sourceMs;
    QSet<QString> m_probing;
    QHash<QString, double> m_observedEnds;
    // Bumped by a document replacement: older probe results are dropped.
    quint64 m_probeGeneration = 0;
    int m_liveUpdates = 0;
    // native-rules #1: shared_ptr without a comment on why unique ownership is impossible
    mutable std::shared_ptr<const QHash<QString, int>> m_editIndex;
    // native-rules #1: shared_ptr without a comment on why unique ownership is impossible
    mutable std::shared_ptr<const std::unordered_map<std::string, std::size_t>> m_editIndexSource;
    // A move's changed clips (start, duration) and its whole result, while
    // the document does not have them.
    QHash<QString, QPair<double, double>> m_live;
    nt::edit::ClipList m_liveClips;
    // The snapshot the lanes last heard of while a move shows its steps live.
    // native-rules #1: shared_ptr without a comment on why unique ownership is impossible
    std::shared_ptr<const nt::Timeline> m_liveBase;
    double m_trackDropY = -1;
    QStringList m_trackOrder;
    QVariantMap m_rubberBand;
    QVariantMap m_selectedGap;
    QVariantMap m_trimSourceRange;
    QVariantMap m_toolPreview;
    QString m_hoverPlanId;
    nt::edit::ClipList m_hoverClips;
    QJsonObject m_hoverClip;
    QHash<QString, bool> m_hoverRollAvailable;
    nt::edit::IdSet m_hoverMediaOwners;
    bool m_hoverAvailable = false;
    QString m_hoverReason;
    QSet<QString> m_razorTargets;
    QString m_hoverPart;
    QPointF m_hoverScene;
    QVariantMap m_selectedEdit;
    QString m_keyframeRow = QStringLiteral("opacity");
    bool m_keyframeRowOnly = false;
};
