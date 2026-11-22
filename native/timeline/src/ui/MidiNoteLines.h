#pragma once

// The note lines of a midi clip: every note as a short horizontal line, drawn
// in the clip body (Logic Pro's overview of a midi region).
//
// `computeNoteLines` is the geometry, a pure function of the clip's notes and
// the view. `MidiNoteLinesItem` is the one drawing item of a clip: it reads
// the notes from the model, builds one coloured-triangle geometry, and
// rebuilds it only when the notes, the tempo, the zoom, the visible window,
// the colours or the size change.
//
// Thread affinity: the item is UI thread only. updatePaintNode runs on the
// render thread while the GUI thread is blocked, as Qt requires, and touches
// only the node it returns. The scene graph owns that node and its geometry
// and material (QSGNode::OwnsGeometry, OwnsMaterial).

#include "model/TimelineModel.h"

#include <QColor>
#include <QJsonArray>
#include <QPointer>
#include <QQuickItem>
#include <QPointF>
#include <QRectF>
#include <QString>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

#include <vector>

namespace nt::ui {

struct NoteLineView {
    double bpm = 120;
    // The clip's content offset: the content time at the clip's left edge.
    double inPointMs = 0;
    double msPerPx = 10;
    double widthPx = 0;
    double heightPx = 0;
    // The part of the clip to draw, in item pixels.
    double fromPx = 0;
    double toPx = 0;
    double marginPx = 3;
    double minLengthPx = 2;
};

struct NoteLine {
    QRectF rect;
    bool muted = false;
};

// A body shorter than this draws 1 px lines, else 2 px.
inline constexpr double kShortBodyPx = 24;

[[nodiscard]] double noteLineThickness(double heightPx);

// The lines for the notes whose start lies in the clip window, clipped to the
// view. A note that starts before the in-point does not sound, so it is not
// drawn. A line is at least `minLengthPx` long.
[[nodiscard]] std::vector<NoteLine> computeNoteLines(const QJsonArray& notes, const NoteLineView& view);

struct CurveSegment {
    QPointF from;
    QPointF to;
};

// The controller curve of a clip: the first lane in `controllers` with a
// point. Segments are in item pixels. Like controllerValueAt, nothing is drawn
// before the first point and the last value holds after it. A step lane draws
// a horizontal then a vertical segment at each point, a linear lane draws
// straight segments. Pitch bend maps -8192..8191, other kinds 0..127.
[[nodiscard]] std::vector<CurveSegment> computeControllerCurve(const QJsonArray& lanes, const NoteLineView& view);

class MidiNoteLinesItem : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(QString clipId READ clipId WRITE setClipId NOTIFY clipIdChanged)
    Q_PROPERTY(double msPerPx READ msPerPx WRITE setMsPerPx NOTIFY viewChanged)
    Q_PROPERTY(double visibleFromPx READ visibleFromPx WRITE setVisibleFromPx NOTIFY viewChanged)
    Q_PROPERTY(double visibleToPx READ visibleToPx WRITE setVisibleToPx NOTIFY viewChanged)
    Q_PROPERTY(QColor color READ color WRITE setColor NOTIFY colorChanged)
    Q_PROPERTY(QColor mutedColor READ mutedColor WRITE setMutedColor NOTIFY colorChanged)
    // How many times the geometry was built (tests).
    Q_PROPERTY(int paintCount READ paintCount NOTIFY painted)

  public:
    explicit MidiNoteLinesItem(QQuickItem* parent = nullptr);
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QString clipId() const { return m_clipId; }
    void setClipId(const QString& id);
    double msPerPx() const { return m_msPerPx; }
    void setMsPerPx(double v);
    double visibleFromPx() const { return m_from; }
    void setVisibleFromPx(double v);
    double visibleToPx() const { return m_to; }
    void setVisibleToPx(double v);
    QColor color() const { return m_color; }
    void setColor(const QColor& c);
    QColor mutedColor() const { return m_mutedColor; }
    void setMutedColor(const QColor& c);
    int paintCount() const { return m_paintCount; }

    // The lines for the current inputs, as {x, y, width, height, muted} maps.
    Q_INVOKABLE QVariantList lines() const;
    // The controller curve segments, as {x0, y0, x1, y1} maps.
    Q_INVOKABLE QVariantList curve() const;

  signals:
    void timelineChanged();
    void clipIdChanged();
    void viewChanged();
    void colorChanged();
    void painted();

  protected:
    QSGNode* updatePaintNode(QSGNode* old, UpdatePaintNodeData* data) override;
    void geometryChange(const QRectF& newGeometry, const QRectF& oldGeometry) override;

  private:
    std::vector<NoteLine> build() const;
    std::vector<CurveSegment> buildCurve() const;
    NoteLineView currentView(const nt::Clip& clip) const;
    void markDirty();

    QPointer<TimelineModel> m_timeline;
    QString m_clipId;
    double m_msPerPx = 10;
    double m_from = 0;
    double m_to = 0;
    QColor m_color;
    QColor m_mutedColor;
    bool m_dirty = true;
    int m_paintCount = 0;
    QMetaObject::Connection m_clipsConnection;
};

}  // namespace nt::ui
