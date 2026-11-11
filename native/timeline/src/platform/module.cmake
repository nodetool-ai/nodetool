nt_sources(core
    src/platform/CpuUsage.h
    src/platform/CpuUsage.cpp
)
nt_sources(app ${NT_APP_PLATFORM_SOURCES})

function(nt_platform_tests)
    nt_qt_test(tst_cpuusage LIBS timeline_core timeline_decode Qt6::Test
        DEFINES NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")

endfunction()
nt_tests(nt_platform_tests)
