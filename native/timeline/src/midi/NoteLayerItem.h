#pragma once

#include "PianoRollController.h"
#include <QColor>
#include <QFont>
#include <QImage>
#include <QHash>
#include <atomic>
#include <QQuickItem>
#include <array>
#include <vector>

// GUI-thread properties and polish snapshots are handed to updatePaintNode only
// during Qt Quick's blocked-GUI sync. Render-thread nodes own geometry/textures.
// Diagnostic counters use relaxed atomics, independent of snapshot publication.
class NoteLayerItem : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(PianoRollController* controller READ controller WRITE setController NOTIFY controllerChanged)
    Q_PROPERTY(QString drawingKind MEMBER m_drawingKind NOTIFY drawingKindChanged)
    Q_PROPERTY(double pxPerTick MEMBER m_pxPerTick NOTIFY pxPerTickChanged)
    Q_PROPERTY(double scrollTick READ scrollTick WRITE setScrollTick NOTIFY scrollTickChanged)
    Q_PROPERTY(double rowHeight MEMBER m_rowHeight NOTIFY rowHeightChanged)
    Q_PROPERTY(int topPitch READ topPitch WRITE setTopPitch NOTIFY topPitchChanged)
    Q_PROPERTY(int collapseTopRow READ collapseTopRow WRITE setCollapseTopRow NOTIFY collapseTopRowChanged)
    Q_PROPERTY(QStringList selectedIds MEMBER m_selectedIds NOTIFY selectedIdsChanged)
    Q_PROPERTY(bool hasPreview MEMBER m_hasPreview NOTIFY hasPreviewChanged)
    Q_PROPERTY(bool clipColors MEMBER m_clipColors NOTIFY clipColorsChanged)
    Q_PROPERTY(bool noteLabels MEMBER m_noteLabels NOTIFY noteLabelsChanged)
    Q_PROPERTY(bool dark MEMBER m_dark NOTIFY darkChanged)
    Q_PROPERTY(double stepTicks MEMBER m_stepTicks NOTIFY stepTicksChanged)
    Q_PROPERTY(double phaseTick MEMBER m_phaseTick NOTIFY phaseTickChanged)
    Q_PROPERTY(double margin MEMBER m_margin NOTIFY marginChanged)
    Q_PROPERTY(double pointSize MEMBER m_pointSize NOTIFY pointSizeChanged)
    Q_PROPERTY(double micro MEMBER m_micro NOTIFY microChanged)
    Q_PROPERTY(bool collapsed MEMBER m_collapsed NOTIFY collapsedChanged)
    Q_PROPERTY(double scaleInset MEMBER m_scaleInset NOTIFY scaleInsetChanged)
    Q_PROPERTY(double labelMinWidth MEMBER m_labelMinWidth NOTIFY labelMinWidthChanged)
    Q_PROPERTY(int hoverPitch MEMBER m_hoverPitch NOTIFY hoverPitchChanged)
    Q_PROPERTY(int pressedPitch MEMBER m_pressedPitch NOTIFY pressedPitchChanged)
    Q_PROPERTY(QFont labelFont MEMBER m_labelFont NOTIFY labelFontChanged)
    Q_PROPERTY(QColor background MEMBER m_background NOTIFY backgroundChanged)
    Q_PROPERTY(QColor panelColor MEMBER m_panelColor NOTIFY panelColorChanged)
    Q_PROPERTY(QColor selectedColor MEMBER m_selectedColor NOTIFY selectedColorChanged)
    Q_PROPERTY(QColor borderSubtle MEMBER m_borderSubtle NOTIFY borderSubtleChanged)
    Q_PROPERTY(QColor borderStrong MEMBER m_borderStrong NOTIFY borderStrongChanged)
    Q_PROPERTY(QColor borderControl MEMBER m_borderControl NOTIFY borderControlChanged)
    Q_PROPERTY(QColor scrim MEMBER m_scrim NOTIFY scrimChanged)
    Q_PROPERTY(QColor textPrimary MEMBER m_textPrimary NOTIFY textPrimaryChanged)
    Q_PROPERTY(QColor textSecondary MEMBER m_textSecondary NOTIFY textSecondaryChanged)
    Q_PROPERTY(QColor textOnAccent MEMBER m_textOnAccent NOTIFY textOnAccentChanged)
    Q_PROPERTY(QColor accent MEMBER m_accent NOTIFY accentChanged)
    Q_PROPERTY(QColor accentSecondary MEMBER m_accentSecondary NOTIFY accentSecondaryChanged)
    Q_PROPERTY(QColor accentOutline MEMBER m_accentOutline NOTIFY accentOutlineChanged)
    Q_PROPERTY(QColor clipAccent MEMBER m_clipAccent NOTIFY clipAccentChanged)
    Q_PROPERTY(QRectF marquee MEMBER m_marquee NOTIFY marqueeChanged)
    Q_PROPERTY(bool marqueeVisible MEMBER m_marqueeVisible NOTIFY marqueeVisibleChanged)
    Q_PROPERTY(QStringList selectedPointIds MEMBER m_selectedPointIds NOTIFY selectedPointIdsChanged)
    Q_PROPERTY(double curveMin MEMBER m_curveMin NOTIFY curveMinChanged)
    Q_PROPERTY(double curveMax MEMBER m_curveMax NOTIFY curveMaxChanged)
    Q_PROPERTY(double curveNeutral MEMBER m_curveNeutral NOTIFY curveNeutralChanged)
    Q_PROPERTY(double curveBaseTick MEMBER m_curveBaseTick NOTIFY curveBaseTickChanged)
    Q_PROPERTY(double curveEndTick MEMBER m_curveEndTick NOTIFY curveEndTickChanged)
    Q_PROPERTY(bool expression MEMBER m_expression NOTIFY expressionChanged)
    Q_PROPERTY(bool curveStep MEMBER m_curveStep NOTIFY curveStepChanged)
public:
    explicit NoteLayerItem(QQuickItem* parent = nullptr);
    double scrollTick() const { return m_scrollTick; }
    void setScrollTick(double value) { if (m_scrollTick == value) { return; } m_scrollTick = value; polish(); update(); emit scrollTickChanged(); }
    int topPitch() const { return m_topPitch; }
    void setTopPitch(int value) { if (m_topPitch == value) { return; } m_topPitch = value; polish(); update(); emit topPitchChanged(); }
    int collapseTopRow() const { return m_collapseTopRow; }
    void setCollapseTopRow(int value) { if (m_collapseTopRow == value) { return; } m_collapseTopRow = value; polish(); update(); emit collapseTopRowChanged(); }
    PianoRollController* controller() const { return m_controller; }
    void setController(PianoRollController* controller);
    // Encodes the source row and its resize grip. Zero means no hit.
    int contentBuildCount() const { return m_contentBuildCount.load(std::memory_order_relaxed); }
    int overlayBuildCount() const { return m_overlayBuildCount.load(std::memory_order_relaxed); }
    Q_INVOKABLE int hitNote(double x, double y);
    Q_INVOKABLE void requestPaint();
    // JSON boundary for the existing pencil/brush and controller-lane tools.
    Q_INVOKABLE void setPreviewNotes(const QVariantList& notes);
    Q_INVOKABLE void setCurvePoints(const QVariantList& points);
    Q_INVOKABLE void setCollapsePitches(const QList<int>& pitches);
    Q_INVOKABLE QStringList notesInRect(double from, double to, int pitchA, int pitchB);

signals:
    void controllerChanged();
    void scrollTickChanged();
    void topPitchChanged();
    void collapseTopRowChanged();
    void drawingKindChanged();
    void pxPerTickChanged();
    void rowHeightChanged();
    void selectedIdsChanged();
    void hasPreviewChanged();
    void clipColorsChanged();
    void noteLabelsChanged();
    void darkChanged();
    void stepTicksChanged();
    void phaseTickChanged();
    void marginChanged();
    void pointSizeChanged();
    void microChanged();
    void collapsedChanged();
    void scaleInsetChanged();
    void labelMinWidthChanged();
    void hoverPitchChanged();
    void pressedPitchChanged();
    void labelFontChanged();
    void backgroundChanged();
    void panelColorChanged();
    void selectedColorChanged();
    void borderSubtleChanged();
    void borderStrongChanged();
    void borderControlChanged();
    void scrimChanged();
    void textPrimaryChanged();
    void textSecondaryChanged();
    void textOnAccentChanged();
    void accentChanged();
    void accentSecondaryChanged();
    void accentOutlineChanged();
    void clipAccentChanged();
    void marqueeChanged();
    void marqueeVisibleChanged();
    void selectedPointIdsChanged();
    void curveMinChanged();
    void curveMaxChanged();
    void curveNeutralChanged();
    void curveBaseTickChanged();
    void curveEndTickChanged();
    void expressionChanged();
    void curveStepChanged();

protected:
    QSGNode* updatePaintNode(QSGNode* old, UpdatePaintNodeData*) override;
    void updatePolish() override;
    void geometryChange(const QRectF& geometry, const QRectF& oldGeometry) override;

private:
    // Immutable values during sync, prepared exclusively on the GUI thread.
    struct TextRaster { QImage image; double advance = 0; double height = 0; };
    QHash<QString, TextRaster> m_text;
    QFont m_rasterFont;
    qreal m_rasterDpr = 0;
    void prepareText(const QString& value);
    void repaintNotes();
    std::vector<nt::MidiNote> m_renderNotes;
    QHash<QString, NoteDragValue> m_dragValues;
    QHash<QString, int> m_dragRows;
    QStringList m_dragIds;
    bool m_valid = false;
    bool m_dragging = false;
    bool m_snapshotNotesDirty = true;
    bool m_collapsed = false;
    QString m_drawingKind = "notes";
    double m_pxPerTick = 0.05;
    double m_scrollTick = 0;
    double m_rowHeight = 12;
    int m_topPitch = 72;
    QList<int> m_collapsePitches = {};
    int m_collapseTopRow = 0;
    QStringList m_selectedIds = {};
    std::vector<nt::MidiNote> m_previewNotes;
    bool m_hasPreview = false;
    bool m_clipColors = false;
    bool m_noteLabels = false;
    bool m_dark = true;
    double m_stepTicks = 960;
    double m_phaseTick = 0;
    double m_margin = 4;
    double m_pointSize = 8;
    double m_micro = 2;
    double m_labelMinWidth = 32;
    double m_scaleInset = 6;
    int m_hoverPitch = -1;
    int m_pressedPitch = -1;
    QFont m_labelFont = {};
    QColor m_background = {};
    QColor m_panelColor = {};
    QColor m_selectedColor = {};
    QColor m_borderSubtle = {};
    QColor m_borderStrong = {};
    QColor m_borderControl = {};
    QColor m_scrim = {};
    QColor m_textPrimary = {};
    QColor m_textSecondary = {};
    QColor m_textOnAccent = {};
    QColor m_accent = {};
    QColor m_accentSecondary = {};
    QColor m_accentOutline = {};
    QColor m_clipAccent = {};
    QRectF m_marquee = {};
    bool m_marqueeVisible = false;
    struct CurvePoint { QString id; double tick; double value; };
    std::vector<CurvePoint> m_curvePoints;
    QStringList m_selectedPointIds = {};
    double m_curveMin = 0;
    double m_curveMax = 127;
    double m_curveNeutral = 0;
    double m_curveBaseTick = 0;
    double m_curveEndTick = 0;
    bool m_expression = false;
    bool m_curveStep = false;
    void rebuildIndex();
    void invalidateNotes();
    void invalidateOverlay();
    void invalidateClip();
    struct ClipViewKey {
        bool valid = false;
        double from = 0;
        double to = 0;
        double beat = 0;
        double bar = 0;
        double zero = 0;
        bool operator==(const ClipViewKey&) const = default;
    };
    ClipViewKey m_clipViewKey;
    QPointer<PianoRollController> m_controller;
    std::atomic<int> m_contentBuildCount = 0;
    std::atomic<int> m_overlayBuildCount = 0;
    bool m_dirty = true;
    bool m_notesDirty = true;
    bool m_overlayDirty = true;
    bool m_indexDirty = true;
    struct Interval { double start; double end; double maxEnd; int row; };
    std::array<std::vector<Interval>, 128> m_index;
};
