nt_sources(audio src/remix/RemixDsp.h src/remix/RemixDsp.cpp
    src/remix/RemixFile.h src/remix/RemixFile.cpp)

function(nt_remix_tests)
    qt_add_executable(tst_remix src/remix/tst_remix.cpp)
    set_target_properties(tst_remix PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_remix PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_remix PRIVATE timeline_core timeline_audio Qt6::Test)
    add_test(NAME tst_remix COMMAND tst_remix)
endfunction()
nt_tests(nt_remix_tests)
