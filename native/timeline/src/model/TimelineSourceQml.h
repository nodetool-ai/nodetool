// Registers TimelineSource with NodeTool.Timeline, so that QML can assign a
// TimelineModel to a property of that type, such as PreviewCompositor.timeline.
#pragma once

#include "model/TimelineSource.h"

#include <QtQml/qqmlregistration.h>

struct TimelineSourceForeign {
    Q_GADGET
    QML_FOREIGN(TimelineSource)
    QML_ANONYMOUS
};
