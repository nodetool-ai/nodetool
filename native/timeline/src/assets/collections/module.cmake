nt_qml_sources(src/assets/collections/LibraryCollections.h src/assets/collections/LibraryCollections.cpp)

function(nt_library_collections_tests)
    qt_add_executable(tst_librarycollections
        src/assets/collections/tst_librarycollections.cpp
        src/assets/collections/LibraryCollections.h
        src/assets/collections/LibraryCollections.cpp)
    set_target_properties(tst_librarycollections PROPERTIES MACOSX_BUNDLE FALSE)
    target_link_libraries(tst_librarycollections PRIVATE timeline_core Qt6::Core Qt6::Qml Qt6::Test)
    add_test(NAME tst_librarycollections COMMAND tst_librarycollections)
endfunction()
nt_tests(nt_library_collections_tests)
