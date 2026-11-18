// Registers TimelineSource with NodeTool.TimelinePlayer, so that QML can
// assign any TimelineSource, such as a host's document model, to a property
// of that type, such as PreviewCompositor.timeline. A host QML module whose
// types derive from TimelineSource lists NodeTool.TimelinePlayer in its
// DEPENDENCIES and does not register the type again. The same holds for
// TimelineDocumentLoader, the type of TimelinePlayerController.loader.
#pragma once

#include "model/TimelineDocumentLoader.h"
#include "model/TimelineSource.h"

#include <QtQml/qqmlregistration.h>

struct TimelineSourceForeign {
    Q_GADGET
    QML_FOREIGN(TimelineSource)
    QML_ANONYMOUS
};

struct TimelineDocumentLoaderForeign {
    Q_GADGET
    QML_FOREIGN(nt::TimelineDocumentLoader)
    QML_ANONYMOUS
};
