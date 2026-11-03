nt_sources(audio src/remix/RemixDsp.h src/remix/RemixDsp.cpp
    src/remix/RemixFile.h src/remix/RemixFile.cpp)

function(nt_remix_tests)
    qt_add_executable(tst_remix src/remix/tst_remix.cpp)
    set_target_properties(tst_remix PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_remix PRIVATE ${NT_WARNINGS})
    # The test recomputes the features to 2e-6 beside RemixDsp.cpp: no fused multiply-add on either side.
    if(NOT MSVC)
        target_compile_options(tst_remix PRIVATE -ffp-contract=off)
    endif()
    target_link_libraries(tst_remix PRIVATE timeline_core timeline_audio Qt6::Test)
    add_test(NAME tst_remix COMMAND tst_remix)
endfunction()
nt_tests(nt_remix_tests)
