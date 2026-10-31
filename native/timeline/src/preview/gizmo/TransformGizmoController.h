#pragma once

#include "GizmoMath.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QPointer>
#include <QSet>
#include <QQuickPaintedItem>
#include <QtQmlIntegration/qqmlintegration.h>

class ClipGestureController;
class TransformGizmoController : public QQuickPaintedItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY bindingsChanged)
    Q_PROPERTY(PlaybackClock* clock READ clock WRITE setClock NOTIFY bindingsChanged)
    Q_PROPERTY(QStringList selection READ selection WRITE setSelection NOTIFY bindingsChanged)
    Q_PROPERTY(bool available READ available NOTIFY geometryChanged)
public:
    explicit TransformGizmoController(QQuickItem* parent = nullptr);
    ~TransformGizmoController() override;
    TimelineModel* timeline() const { return m_timeline; }
    PlaybackClock* clock() const { return m_clock; }
    QStringList selection() const { return m_selection; }
    void setTimeline(TimelineModel* value);
    void setClock(PlaybackClock* value);
    void setSelection(const QStringList& value);
    bool available() const { return m_available; }
    nt::gizmo::Geometry box() const { return m_box; }
    Q_INVOKABLE void discover();
    Q_INVOKABLE bool begin(const QString& target, QPointF pointer);
    Q_INVOKABLE void move(QPointF pointer, bool shift = false);
    Q_INVOKABLE void end();
    Q_INVOKABLE void cancel();
    Q_INVOKABLE void action(const QString& name);
    Q_INVOKABLE bool handleKey(int key, int modifiers = 0);
    void paint(QPainter* painter) override;
    bool contains(const QPointF& point) const override;
signals:
    void bindingsChanged();
    void geometryChanged();
    void contextMenuRequested(QPointF point);
protected:
    void mousePressEvent(QMouseEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    void mouseUngrabEvent() override;
    void hoverMoveEvent(QHoverEvent* event) override;
    void hoverLeaveEvent(QHoverEvent* event) override;
    void keyPressEvent(QKeyEvent* event) override;
    void focusInEvent(QFocusEvent* event) override;
private:
    void refresh();
    QString targetAt(QPointF point) const;
    void write(const nt::ClipTransform& next);
    void probe(const QString& path);
    QPointer<TimelineModel> m_timeline;
    QPointer<PlaybackClock> m_clock;
    QPointer<QQuickItem> m_monitor;
    QPointF m_origin;
    QSizeF m_frame;
    QList<QMetaObject::Connection> m_monitorConnections;
    QStringList m_selection;
    bool m_available = false;
    nt::gizmo::Space m_space;
    nt::gizmo::Geometry m_box;
    nt::ClipTransform m_stored;
    nt::ClipTransform m_display;
    QString m_clipId;
    QJsonObject m_startClip;
    QJsonArray m_before;
    QJsonArray m_lastPreview;
    bool m_writing = false;
    std::optional<nt::gizmo::Drag> m_drag;
    quint64 m_generation = 0;
    QString m_hover;
    bool m_focusVisible = false;
    QHash<QString, QSize> m_dimensions;
    QSet<QString> m_probing;
    quint64 m_probeEpoch = 0;
};
