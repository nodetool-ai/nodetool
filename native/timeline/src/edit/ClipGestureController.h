#pragma once

// The clip gestures and the editing keys of the tracks region (M4), copied
// from useClipDrag.ts, useClipTrim.ts (trimModeFor), clipSnap.ts and the
// key handler of TracksRegion.tsx:
//
// - A press on a clip body starts a move: the pointer's travel plus the
//   scroll's, snapped (both edges, 8 px) unless Alt is held, onto the lane
//   under the pointer when its type fits. A multi-selection moves together.
//   The release settles the drop with the drop mode (Ctrl forces insert). A
//   press that does not travel 3 px is a click: it selects (Shift adds,
//   Ctrl/Cmd toggles).
// - A press on a trim handle trims that edge: plain, ripple (ripple mode or
//   the Ripple tool) or roll (Ctrl/Cmd or the Roll tool).
// - The tools of the toolbar (ToolToggle.tsx): Cut splits the clip at the
//   pointer; Slip drags the source under the clip (planSlip); Slide moves the
//   clip and trims its neighbours (slideClip); Track select selects every
//   clip after (or before) the pointer, then drags them; Rate stretch turns
//   an edge drag into a speed change (rateStretchClip). Hand and Zoom act on
//   the lanes, in TracksRegion.qml. Under these body tools a press on an
//   edge acts on the body (BODY_TOOLS).
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

#include <functional>

#include <QHash>
#include <QJsonArray>
#include <QPointer>
#include <QSet>
#include <QQuickItem>
#include <QStringList>
#include <QtQmlIntegration/qqmlintegration.h>

class ClipGestureController : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT
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
    // The clip under the gesture, for the lanes' pin (D28); empty when idle.
    Q_PROPERTY(QString activeClipId READ activeClipId NOTIFY gestureChanged)
    Q_PROPERTY(QString gestureKind READ gestureKind NOTIFY gestureChanged)
    // The candidate a moving edge locked onto, or -1.
    Q_PROPERTY(double snapGuideMs READ snapGuideMs NOTIFY snapGuideChanged)
    Q_PROPERTY(int liveUpdates READ liveUpdates NOTIFY gestureChanged)

public:
    explicit ClipGestureController(QQuickItem* parent = nullptr);

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
    QString activeClipId() const { return m_gesture.clipId; }
    QString gestureKind() const { return m_gesture.kind; }
    double snapGuideMs() const { return m_snapGuideMs; }
    int liveUpdates() const { return m_liveUpdates; }

    // trimModeFor(tool, rollModifier, rippleMode)
    static QString trimModeFor(const QString& tool, bool rollModifier, bool rippleMode);

    // The document the actions read: the model's clips and tracks.
    nt::edit::EditDoc editDoc() const;

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
    static const QSet<QString>& availableActions();

signals:
    void changed();
    void selectionChanged();
    void optionsChanged();
    void gestureChanged();
    void snapGuideChanged();
    // The `?` key: open or close the shortcut sheet.
    void shortcutsToggled();

protected:
    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    void mouseUngrabEvent() override;
    void updatePolish() override;

private:
    struct Gesture {
        QString kind;  // "", "move", "trim", "slip", "slide"
        QString clipId;
        QString edge;  // trim: "start" or "end"
        QString mode;  // trim: "trim", "ripple" or "roll"
        double startX = 0;
        double startY = 0;
        double lastX = 0;
        double lastY = 0;
        bool alt = false;
        double scrollLeftAtStart = 0;
        double travelledMs = 0;
        double gestureMsPerPx = 10;
        double dragStartMs = 0;
        double edgeMsAtStart = 0;
        double durationMsAtStart = 0;
        double inAtStart = 0;  // slip: the source in-point at the press
        bool dragging = false;
        std::vector<double> candidates;
        QJsonArray before;
        // The document the gesture edits; a replacement ends it.
        quint64 generation = 0;
    };

    nt::edit::ClipList resolveEdit(const QString& name, QJsonObject payload,
                                   const std::function<nt::edit::ClipList()>& fallback,
                                   std::optional<double> maxSourceDurationMs = std::nullopt) const;
    void setDoc(const nt::edit::ClipList& clips);
    void applyMove();
    void applyTrim();
    void applySlip();
    void applySlide();
    double laneMsAt(double sceneX) const;
    void finishGesture(bool completed, Qt::KeyboardModifiers modifiers);
    void clickSelect(const QString& clipId, Qt::KeyboardModifiers modifiers);
    void setSnapGuide(double ms);
    QString trackUnderPointer(double sceneX, double sceneY) const;
    std::vector<double> collectSnapCandidates(const nt::edit::IdSet& exclude) const;
    double playheadMs() const;
    void nudge(double deltaMs, bool merge);
    void dropGesture();
    std::optional<double> sourceCap(const QJsonObject& clip);
    void probeSources();

    QPointer<TimelineModel> m_timeline;
    QPointer<TimelineViewState> m_view;
    QPointer<TrackWindowModel> m_rows;
    QPointer<PlaybackClock> m_clock;
    QPointer<QQuickItem> m_viewport;
    QStringList m_selection;
    bool m_rippleMode = false;
    bool m_snapEnabled = true;
    bool m_linked = true;
    QString m_dropMode = QStringLiteral("overwrite");
    QString m_tool = QStringLiteral("select");
    QString m_preset = QStringLiteral("nodetool");
    Gesture m_gesture;
    double m_snapGuideMs = -1;
    // Probed source lengths by media file, and the furthest out-point seen
    // per asset (`observedSourceEnds`).
    QHash<QString, double> m_sourceMs;
    QSet<QString> m_probing;
    QHash<QString, double> m_observedEnds;
    // Bumped by a document replacement: older probe results are dropped.
    quint64 m_probeGeneration = 0;
    int m_liveUpdates = 0;
};
