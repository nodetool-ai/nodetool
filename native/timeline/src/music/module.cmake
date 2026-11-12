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
