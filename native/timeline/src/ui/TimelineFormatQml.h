#pragma once

#include "ui/TimelineFormat.h"
#include "ui/Timecode.h"
#include <limits>

#include <QObject>
#include <QtQmlIntegration/qqmlintegration.h>

// QML access to the formatters, so a binding does not reimplement them.
class TimelineFormat : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON

public:
    using QObject::QObject;
    Q_INVOKABLE QString timecode(double ms, double fps, bool dropFrame) const {
        return nt::ui::formatTimecodeMs(ms, fps, dropFrame);
    }
    // Milliseconds at the start of the parsed frame, or NaN when the text is invalid.
    Q_INVOKABLE double parseTimecode(const QString& text, double fps, bool dropFrame, double currentMs) const {
        const auto frame = nt::ui::parseTimecode(text, fps, dropFrame, nt::ui::frameAtMs(currentMs, fps));
        return frame ? nt::ui::msAtFrame(*frame, fps) : std::numeric_limits<double>::quiet_NaN();
    }
    Q_INVOKABLE double frameAt(double ms, double fps) const { return nt::ui::frameAtMs(ms, fps); }
    Q_INVOKABLE double msAt(double frame, double fps) const { return frame * nt::ui::msAtFrame(1, fps); }

    Q_INVOKABLE QString rulerTimecode(double ms, double majorMs, double fps) const {
        return nt::ui::formatRulerTimecode(ms, majorMs, fps);
    }
    Q_INVOKABLE QString playheadTimecode(double ms, double fps) const { return nt::ui::formatPlayheadTimecode(ms, fps); }
    Q_INVOKABLE QString clipDuration(double durationMs) const { return nt::ui::formatClipDuration(durationMs); }
    Q_INVOKABLE double pillShift(double lineLeftPx, double pillWidthPx, double viewportWidthPx) const {
        return nt::ui::pillShiftPx(lineLeftPx, pillWidthPx, viewportWidthPx);
    }
};
