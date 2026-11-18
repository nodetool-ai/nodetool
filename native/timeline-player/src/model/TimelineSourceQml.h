// Registers TimelineSource with NodeTool.TimelinePlayer, so that QML can
// assign any TimelineSource, such as a host's document model, to a property
// of that type, such as PreviewCompositor.timeline. A host QML module whose
// types derive from TimelineSource lists NodeTool.TimelinePlayer in its
// DEPENDENCIES and does not register the type again.
#pragma once

#include "model/TimelineSource.h"

#include <QtQml/qqmlregistration.h>

struct TimelineSourceForeign {
    Q_GADGET
    QML_FOREIGN(TimelineSource)
    QML_ANONYMOUS
};
