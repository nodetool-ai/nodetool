#pragma once

#include "ui/TimelineFormat.h"

#include <QObject>
#include <QtQmlIntegration/qqmlintegration.h>

// QML access to the formatters, so a binding does not reimplement them.
class TimelineFormat : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

public:
    using QObject::QObject;

    Q_INVOKABLE QString rulerTimecode(double ms, double majorMs, double fps) const {
        return nt::ui::formatRulerTimecode(ms, majorMs, fps);
    }
    Q_INVOKABLE QString playheadTimecode(double ms, double fps) const { return nt::ui::formatPlayheadTimecode(ms, fps); }
    Q_INVOKABLE QString clipDuration(double durationMs) const { return nt::ui::formatClipDuration(durationMs); }
    Q_INVOKABLE double pillShift(double lineLeftPx, double pillWidthPx, double viewportWidthPx) const {
        return nt::ui::pillShiftPx(lineLeftPx, pillWidthPx, viewportWidthPx);
    }
};
