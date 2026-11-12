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

# ── MM2: music project, range selection, panel (package E) ──────────────────
# The range math and the new project's document are pure functions in core.
# The selection, the panel and sequence state and the dialog rules are QML
# types. The registrations (the role edit, File > New Music Project and
# --music) compile into each executable that takes the app sources.
nt_sources(core src/music/MusicRange.h src/music/MusicRange.cpp
    src/music/MusicProject.h src/music/MusicProject.cpp)
nt_qml_sources(src/music/MusicSelection.h src/music/MusicSelection.cpp
    src/music/MusicSequenceState.h src/music/MusicSequenceState.cpp
    src/music/MusicPanelModel.h src/music/MusicPanelModel.cpp
    src/music/MusicProjectRules.h src/music/MusicProjectRules.cpp
    src/music/MusicKeyActions.cpp)
nt_sources(app src/music/MusicRegistrations.cpp)
if(NOT MSVC)
    set_source_files_properties(src/music/MusicRange.cpp PROPERTIES COMPILE_OPTIONS -ffp-contract=off)
endif()

function(nt_music_ui_tests)
    nt_qt_test(tst_musicrange SOURCES src/music/tst_musicrange.cpp LIBS timeline_core Qt6::Test)

    # New music project through the list controller and a fake server (MM2 exit 1).
    nt_qt_test(tst_musicproject SOURCES src/music/tst_musicproject.cpp
        LIBS timeline_server Qt6::Test
        INCLUDES tests)
    set_tests_properties(tst_musicproject PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")

    # The mounted editor with synthetic pointer events (MM2 exits 1, 2, 3 and 5, and the loop control).
    qt_add_executable(tst_musicui src/music/tst_musicui.cpp ${NT_app})
    set_target_properties(tst_musicui PROPERTIES MACOSX_BUNDLE FALSE)
    target_include_directories(tst_musicui PRIVATE src/wiring qml/dock tests)
    target_link_libraries(tst_musicui PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_musicui OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_musicui_qml/NodeTool/Timeline)
    qt_add_resources(tst_musicui music_sync_banner PREFIX /nodetool/sync BASE src/server/sync
        FILES src/server/sync/ExternalConflictsBanner.qml)
    add_test(NAME tst_musicui COMMAND tst_musicui)
    set_tests_properties(tst_musicui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_music_ui_tests)

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

# ---- Package I1: assistant commands and clean-up (MUSIC-MODE.md GN-8, TK-5,
# MR8, MR10; MM7 scope items 2 and 4). Other packages' lines stay outside
# this block.
# The clean-up selection and the take-removal edit are pure functions in core.
nt_sources(core src/music/MusicCleanupPlan.h src/music/MusicCleanupPlan.cpp)
# The assistant tools and the clean-up controller use MusicJobs, a QML type;
# the registrations compile into each executable.
nt_qml_sources(src/music/MusicAssistant.h src/music/MusicAssistant.cpp
    src/music/MusicCleanup.h src/music/MusicCleanup.cpp
    src/music/MusicCleanupActions.cpp)

function(nt_music_assist_tests)
    # GN-8: the three assistant tools against a scripted server, through MusicJobs::submit.
    qt_add_executable(tst_musicassistant src/music/tst_musicassistant.cpp
        src/music/MusicAssistant.h src/music/MusicAssistant.cpp
        src/music/MusicJobs.h src/music/MusicJobs.cpp
        src/music/MusicEdits.h src/music/MusicEdits.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_musicassistant PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_musicassistant PRIVATE ${NT_WARNINGS})
    target_include_directories(tst_musicassistant PRIVATE tests)
    target_link_libraries(tst_musicassistant PRIVATE timeline_core timeline_decode timeline_server timeline_audio
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::WebSockets Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    add_test(NAME tst_musicassistant COMMAND tst_musicassistant)
    set_tests_properties(tst_musicassistant PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen" TIMEOUT 300)

    # TK-5 and MR10: which takes and bounces the clean-up lists and keeps, the
    # edit, and deletion only after the autosave holds the edit.
    qt_add_executable(tst_musiccleanup src/music/tst_musiccleanup.cpp
        src/music/MusicCleanup.h src/music/MusicCleanup.cpp
        src/music/MusicJobs.h src/music/MusicJobs.cpp
        src/music/MusicEdits.h src/music/MusicEdits.cpp
        src/model/TimelineModel.h src/model/TimelineModel.cpp
        src/model/TrackListModel.h src/model/TrackListModel.cpp)
    set_target_properties(tst_musiccleanup PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_musiccleanup PRIVATE ${NT_WARNINGS})
    target_include_directories(tst_musiccleanup PRIVATE tests)
    target_link_libraries(tst_musiccleanup PRIVATE timeline_core timeline_decode timeline_server timeline_audio
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::WebSockets Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    add_test(NAME tst_musiccleanup COMMAND tst_musiccleanup)
    set_tests_properties(tst_musiccleanup PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen" TIMEOUT 300)
endfunction()
nt_tests(nt_music_assist_tests)
