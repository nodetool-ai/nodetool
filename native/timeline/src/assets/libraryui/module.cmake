function(nt_library_ui_tests)
    add_test(NAME library_ui COMMAND $<TARGET_FILE:tst_followpathui>
        -input ${CMAKE_CURRENT_SOURCE_DIR}/src/assets/libraryui/qmltests)
    set_tests_properties(library_ui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_library_ui_tests)
