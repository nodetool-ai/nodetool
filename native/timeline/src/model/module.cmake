nt_sources(core
    src/model/TimelineTypes.h
    src/model/TimelineJson.h
    src/model/TimelineJson.cpp
)
nt_sources(qml
    src/model/TimelineModel.h
    src/model/TimelineModel.cpp
    src/model/TrackListModel.h
    src/model/TrackListModel.cpp
    src/model/TrackWindowModel.h
    src/model/TrackWindowModel.cpp
    src/model/LaneClipModel.h
    src/model/LaneClipModel.cpp
)

function(nt_model_tests)
    nt_qt_test(tst_timelinejson LIBS timeline_core timeline_decode Qt6::Test
        DEFINES NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")

    # The flex layout port's pure parts against the TypeScript values (scene/FlexLayout.h).
    # It links TimelineModel to check that every edit makes a new revision.
    qt_add_executable(tst_flexlayout tests/tst_flexlayout.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_flexlayout PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_flexlayout PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_flexlayout PRIVATE timeline_core Qt6::Gui Qt6::Qml Qt6::Test)
    add_test(NAME tst_flexlayout COMMAND tst_flexlayout)
endfunction()
nt_tests(nt_model_tests)
