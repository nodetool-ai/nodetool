# Music mode (docs/MUSIC-MODE.md): frame math, the planner, the tempo rules
# and typed reads of the music document fields. Pure functions in core.
nt_sources(core src/music/MusicTime.h src/music/MusicTime.cpp
    src/music/MusicPlan.h src/music/MusicPlan.cpp
    src/music/MusicDocument.h src/music/MusicDocument.cpp)

function(nt_music_tests)
    get_filename_component(NT_MUSIC_REPO "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
    qt_add_executable(nt_music_oracle src/music/MusicOracle.cpp)
    set_target_properties(nt_music_oracle PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(nt_music_oracle PRIVATE ${NT_WARNINGS})
    target_link_libraries(nt_music_oracle PRIVATE timeline_core)
    # The C++ port against packages/timeline/src/music (MM1 exits 2 and 3).
    add_test(NAME music_oracle COMMAND node "${NT_MUSIC_REPO}/node_modules/vitest/vitest.mjs" run
        --config "${CMAKE_CURRENT_SOURCE_DIR}/scripts/conformance/vitest.config.mts")
    set_tests_properties(music_oracle PROPERTIES ENVIRONMENT
        "NT_CONFORMANCE_TESTS=${CMAKE_CURRENT_SOURCE_DIR}/src/music/music-oracle.test.ts;NT_MUSIC_ORACLE=$<TARGET_FILE:nt_music_oracle>"
        TIMEOUT 180)

    nt_qt_test(tst_musicplan SOURCES src/music/tst_musicplan.cpp LIBS timeline_core Qt6::Test)

    # The music fixture through the native load, an edit and the autosave request (MM1 exit 1).
    nt_qt_test(tst_musicdocument SOURCES src/music/tst_musicdocument.cpp
        LIBS timeline_server Qt6::Test
        INCLUDES tests
        DEFINES NT_MUSIC_FIXTURE="${NT_MUSIC_REPO}/packages/timeline/tests/fixtures/music-document.json")
    set_tests_properties(tst_musicdocument PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_music_tests)

# The frame math and the planner compute what the TypeScript computes, one
# rounding per operation: no fused multiply-add (Clang contracts by default).
if(NOT MSVC)
    set_source_files_properties(src/music/MusicTime.cpp src/music/MusicPlan.cpp
        PROPERTIES COMPILE_OPTIONS -ffp-contract=off)
endif()

# ---- Package F: jobs, edits and context bounce (MUSIC-MODE.md MD13 to MD18,
# sections 9, 13 and 14.3). Package E's selection, project and panel lines
# stay outside this block.
# The bounce renders with timeline_audio and uploads with timeline_server.
nt_sources(server src/music/MusicBounce.h src/music/MusicBounce.cpp)
# Registrars compile into the executables (src/app/README.md).
nt_sources(app src/music/MusicBounceCli.cpp)
nt_qml_sources(src/music/MusicEdits.h src/music/MusicEdits.cpp
    src/music/MusicJobs.h src/music/MusicJobs.cpp)

function(nt_music_jobs_tests)
    # MM3 exits 5 to 7, MM6 durability: a scripted server over a real socket.
    qt_add_executable(tst_musicjobs src/music/tst_musicjobs.cpp
        src/music/MusicJobs.h src/music/MusicJobs.cpp
        src/music/MusicEdits.h src/music/MusicEdits.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_musicjobs PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_musicjobs PRIVATE ${NT_WARNINGS})
    target_include_directories(tst_musicjobs PRIVATE tests)
    target_link_libraries(tst_musicjobs PRIVATE timeline_core timeline_decode timeline_server timeline_audio
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::WebSockets Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    add_test(NAME tst_musicjobs COMMAND tst_musicjobs)
    set_tests_properties(tst_musicjobs PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen" TIMEOUT 300)

    # MM5 exits 3 and 4: the dry and mix bounces, directly and through --music-bounce.
    qt_add_executable(tst_musicbounce src/music/tst_musicbounce.cpp)
    set_target_properties(tst_musicbounce PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_musicbounce PRIVATE ${NT_WARNINGS})
    target_include_directories(tst_musicbounce PRIVATE tests)
    target_compile_definitions(tst_musicbounce PRIVATE NT_TIMELINE_BINARY="$<TARGET_FILE:nodetool-timeline>")
    target_link_libraries(tst_musicbounce PRIVATE timeline_core timeline_server timeline_audio Qt6::Test)
    add_dependencies(tst_musicbounce nodetool-timeline)
    add_test(NAME tst_musicbounce COMMAND tst_musicbounce)
    set_tests_properties(tst_musicbounce PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen" TIMEOUT 300)
endfunction()
nt_tests(nt_music_jobs_tests)
