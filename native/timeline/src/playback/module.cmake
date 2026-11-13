nt_sources(core
    src/playback/AudioClockFeed.h
    src/playback/AudioClockFeed.cpp
)
nt_sources(qml
    src/playback/PlaybackClock.h
    src/playback/PlaybackClock.cpp
)

function(nt_playback_tests)
    qt_add_executable(tst_transport src/playback/tst_transport.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp)
    set_target_properties(tst_transport PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_transport PRIVATE timeline_core Qt6::Qml Qt6::Test)
    add_test(NAME tst_transport COMMAND tst_transport)
    qt_add_executable(tst_liveaudioedit src/playback/tst_liveaudioedit.cpp)
    set_target_properties(tst_liveaudioedit PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_liveaudioedit PRIVATE timeline_core timeline_audio Qt6::Test)
    target_compile_definitions(tst_liveaudioedit PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_test(NAME tst_liveaudioedit COMMAND tst_liveaudioedit)
    # The gapless loop of MUSIC-MODE.md MD19 (MM4 exit 1 to 6).
    qt_add_executable(tst_looptransport src/playback/tst_looptransport.cpp
        src/playback/PlaybackClock.h src/playback/PlaybackClock.cpp)
    set_target_properties(tst_looptransport PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_looptransport PRIVATE timeline_core timeline_audio Qt6::Qml Qt6::Test)
    target_compile_definitions(tst_looptransport PRIVATE NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
    add_test(NAME tst_looptransport COMMAND tst_looptransport)
    set_tests_properties(tst_transport tst_liveaudioedit tst_looptransport PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    set_tests_properties(tst_liveaudioedit tst_looptransport PROPERTIES FIXTURES_REQUIRED media)
endfunction()
nt_tests(nt_playback_tests)
