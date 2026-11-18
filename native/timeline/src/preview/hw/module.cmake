# The hardware interop is in native/timeline-player (nodetool_timeline_decode).
# HwWindow, which prepares a QQuickWindow, stays here.
nt_sources(app
    src/preview/hw/HwWindow.h
    src/preview/hw/HwWindow.cpp
)
nt_sources(tst_editpreview src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
if(UNIX AND NOT APPLE)
    nt_sources(tst_tracksui src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
endif()
