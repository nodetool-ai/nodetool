nt_sources(decode ${NT_DECODE_PLATFORM_SOURCES})
nt_sources(app
    src/preview/hw/HwWindow.h
    src/preview/hw/HwWindow.cpp
)
nt_sources(tst_editpreview src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
if(UNIX AND NOT APPLE)
    nt_sources(tst_tracksui src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
endif()
