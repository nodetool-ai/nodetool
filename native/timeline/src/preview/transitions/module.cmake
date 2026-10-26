nt_sources(core
    src/preview/transitions/TransitionResolver.h
    src/preview/transitions/TransitionResolver.cpp
)

if(NOT MSVC)
    set_source_files_properties(
        src/preview/transitions/TransitionResolver.cpp tests/tst_transitionresolver.cpp
        PROPERTIES COMPILE_OPTIONS -ffp-contract=off)
endif()

function(nt_transition_resolver_tests)
    nt_qt_test(tst_transitionresolver LIBS timeline_core Qt6::Test
        DEFINES
            NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
            NT_EXAMPLES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../../packages/base-nodes/nodetool/examples/timelines")
    set_tests_properties(tst_transitionresolver PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_transition_resolver_tests)
