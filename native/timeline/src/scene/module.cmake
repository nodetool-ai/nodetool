# The scene sources are in native/timeline-player (nodetool_timeline_scene).
# This test reads the timeline's fixtures, so it stays here.
function(nt_scene_tests)
    # Native easing against the web's values (scene/Animation.h).
    nt_qt_test(tst_easing LIBS timeline_core Qt6::Test
        DEFINES NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
endfunction()
nt_tests(nt_scene_tests)
