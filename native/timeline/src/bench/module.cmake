nt_sources(core
    src/bench/BenchReport.h
    src/bench/BenchReport.cpp
)
nt_sources(app
    src/bench/ScrubRun.h
    src/bench/ScrubRun.cpp
)
nt_sources(bench_scene tests/bench_scene.cpp)

function(nt_bench_tests)
    nt_qt_test(tst_benchreport LIBS timeline_core timeline_decode Qt6::Test
        DEFINES NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")

endfunction()
nt_tests(nt_bench_tests)
