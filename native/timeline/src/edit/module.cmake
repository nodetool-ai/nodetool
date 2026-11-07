nt_sources(core
    src/edit/ClipOps.h
    src/edit/ClipOps.cpp
    src/edit/EditActions.h
    src/edit/EditActions.cpp
    src/edit/Keymap.h
    src/edit/Keymap.cpp
    src/edit/KeymapData.h
)
nt_sources(ops
    src/edit/OpCli.h
    src/edit/OpCli.cpp
)
nt_sources(qml
    src/edit/ClipGestureController.h
    src/edit/ClipGestureController.cpp
)

function(nt_edit_tests)
    nt_qt_test(tst_editactions LIBS timeline_core timeline_decode Qt6::Test
        DEFINES NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")

endfunction()
nt_tests(nt_edit_tests)
