#pragma once

// The wheel and pinch input of the tracks region (TracksRegion.tsx's native
// wheel listeners and its WebKit gesture handler). It sits over the ruler and
// the rows, takes no mouse buttons, and turns each Qt event into the DOM
// deltas the web routing reads:
//
// - a trackpad's pixel delta, negated (Qt's sign is the content motion, the
//   DOM's is the scroll direction);
// - a mouse notch (angle delta 120) as Chromium's 100 px;
// - a `ZoomNativeGesture` as the ctrlKey wheel Chromium sends for a pinch.
//
// It also owns the frame step of the view state: a request to flush polishes
// this item, and the polish applies the frame's zoom once (D29).

#include "ui/TimelineViewState.h"

#include <QPointer>
#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>

class TimelineGestureArea : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineViewState* viewState READ viewState WRITE setViewState NOTIFY viewStateChanged)
    // In this item's coordinates: the ruler's top, the rows' top, the lanes' left.
    Q_PROPERTY(double rulerTop READ rulerTop WRITE setRulerTop NOTIFY geometryChanged)
    Q_PROPERTY(double rowsTop READ rowsTop WRITE setRowsTop NOTIFY geometryChanged)
    Q_PROPERTY(double lanesLeft READ lanesLeft WRITE setLanesLeft NOTIFY geometryChanged)
    Q_PROPERTY(int wheelEvents READ wheelEvents NOTIFY inputCounted)
    Q_PROPERTY(int gestureEvents READ gestureEvents NOTIFY inputCounted)

public:
    explicit TimelineGestureArea(QQuickItem* parent = nullptr);

    TimelineViewState* viewState() const { return m_view; }
    void setViewState(TimelineViewState* view);
    double rulerTop() const { return m_rulerTop; }
    void setRulerTop(double y);
    double rowsTop() const { return m_rowsTop; }
    void setRowsTop(double y);
    double lanesLeft() const { return m_lanesLeft; }
    void setLanesLeft(double x);
    int wheelEvents() const { return m_wheelEvents; }
    int gestureEvents() const { return m_gestureEvents; }

    bool event(QEvent* event) override;

signals:
    void viewStateChanged();
    void geometryChanged();
    void inputCounted();

protected:
    void wheelEvent(QWheelEvent* event) override;
    void updatePolish() override;

private:
    int targetAt(QPointF pos) const;

    QPointer<TimelineViewState> m_view;
    double m_rulerTop = 0.0;
    double m_rowsTop = 0.0;
    double m_lanesLeft = 0.0;
    int m_wheelEvents = 0;
    int m_gestureEvents = 0;
};
