nt_sources(core src/app/Preferences/PreferencesSettings.h src/app/Preferences/PreferencesSettings.cpp)
nt_qml_sources(src/app/Preferences/Preferences.h src/app/Preferences/Preferences.cpp)
nt_sources(app src/app/Preferences/AppShellRegistration.cpp)
# Every QML executable receives the preferences types. Device enumeration is
# supplied by timeline_audio and opens no playback device.
function(nt_preferences_link_audio)
    get_property(targets DIRECTORY PROPERTY BUILDSYSTEM_TARGETS)
    foreach(target IN LISTS targets)
        get_target_property(uri ${target} QT_QML_MODULE_URI)
        if(uri STREQUAL "NodeTool.Timeline")
            target_link_libraries(${target} PRIVATE timeline_audio)
        endif()
    endforeach()
endfunction()
cmake_language(DEFER CALL nt_preferences_link_audio)
function(nt_preferences_tests)
    qt_add_executable(tst_appshell_startup src/app/Preferences/tst_appshell_startup.cpp
        src/app/Preferences/AppShellRegistration.cpp src/app/Preferences/PreferencesSettings.cpp
        src/app/PanelRegistry.cpp)
    set_target_properties(tst_appshell_startup PROPERTIES MACOSX_BUNDLE FALSE)
    target_include_directories(tst_appshell_startup PRIVATE src)
    target_link_libraries(tst_appshell_startup PRIVATE Qt6::Core Qt6::Qml)
    set(startup_ini "${CMAKE_CURRENT_BINARY_DIR}/appshell-cache-startup.ini")
    set(startup_cache "${CMAKE_CURRENT_BINARY_DIR}/appshell-cache")
    file(WRITE "${startup_ini}" "[General]\ncacheFolder=${startup_cache}\ncacheBudgetMb=321\n")
    add_test(NAME tst_appshell_startup COMMAND ${CMAKE_COMMAND} -E env
        --unset=NODETOOL_TIMELINE_CACHE_DIR --unset=NODETOOL_TIMELINE_CACHE_BUDGET_MB
        $<TARGET_FILE:tst_appshell_startup> "${startup_cache}" 321)
    add_test(NAME tst_appshell_startup_environment COMMAND ${CMAKE_COMMAND} -E env
        "NODETOOL_TIMELINE_CACHE_DIR=${CMAKE_CURRENT_BINARY_DIR}/explicit-cache"
        NODETOOL_TIMELINE_CACHE_BUDGET_MB=654
        $<TARGET_FILE:tst_appshell_startup> "${CMAKE_CURRENT_BINARY_DIR}/explicit-cache" 654)
    set_tests_properties(tst_appshell_startup tst_appshell_startup_environment PROPERTIES
        ENVIRONMENT "NODETOOL_TIMELINE_PREFERENCES=${startup_ini}")
    add_test(NAME tst_appshell_preferences COMMAND tst_appshell preferencesStore cacheEnvironment keyboardSync preferencesDialog decoderLabels)
    add_test(NAME tst_appshell_recents COMMAND tst_appshell recentOrdering recentMenu recentBatchSafety)
    set_tests_properties(tst_appshell_recents tst_appshell_preferences PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software;NODETOOL_TIMELINE_PREFERENCES=${CMAKE_CURRENT_BINARY_DIR}/shell-test-startup.ini")
endfunction()
nt_tests(nt_preferences_tests)
