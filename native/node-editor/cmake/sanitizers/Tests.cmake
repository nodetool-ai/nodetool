function(nodetool_node_editor_test_sanitizers)
    if(NOT CMAKE_CXX_FLAGS MATCHES "-fsanitize=[^ ]*address")
        return()
    endif()
    get_property(editor_tests DIRECTORY PROPERTY TESTS)
    set_property(TEST ${editor_tests} APPEND PROPERTY ENVIRONMENT
        "LSAN_OPTIONS=suppressions=${CMAKE_CURRENT_FUNCTION_LIST_DIR}/lsan.supp")
    # The prebuilt Qt libraries omit frame pointers. Collect the pixmap reader
    # startup frame for screenshots and the FFmpeg caller for playback.
    foreach(test IN LISTS editor_tests)
        if(test MATCHES "^node_editor_(canvas_media_host|composition|media_cards|smoke|visual_capture)(_quick|_rhi)?$")
            set_property(TEST ${test} APPEND PROPERTY ENVIRONMENT
                "ASAN_OPTIONS=fast_unwind_on_malloc=0:malloc_context_size=16")
        endif()
    endforeach()
endfunction()
