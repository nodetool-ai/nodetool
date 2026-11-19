# TransitionResolver is in native/timeline-player (nodetool_timeline_scene).
# Its test reads the timeline's fixtures and examples, so it stays here.
if(NOT MSVC)
    set_source_files_properties(tests/tst_transitionresolver.cpp PROPERTIES COMPILE_OPTIONS -ffp-contract=off)
endif()

function(nt_transition_resolver_tests)
    nt_qt_test(tst_transitionresolver LIBS timeline_core Qt6::Test
        DEFINES
            NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
            NT_EXAMPLES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../../packages/base-nodes/nodetool/examples/timelines")
    set_tests_properties(tst_transitionresolver PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_transition_resolver_tests)
