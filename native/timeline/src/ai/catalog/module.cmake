nt_sources(core src/ai/catalog/ModelCatalog.h src/ai/catalog/ModelCatalog.cpp)
nt_qml_sources(src/ai/catalog/ModelCatalogController.h src/ai/catalog/ModelCatalogController.cpp)

function(nt_ai_catalog_tests)
    qt_add_executable(tst_ai_catalog src/ai/catalog/tst_catalog.cpp)
    target_link_libraries(tst_ai_catalog PRIVATE timeline_core Qt6::Test)
    add_test(NAME tst_ai_catalog COMMAND tst_ai_catalog)
    qt_add_executable(tst_ai_catalogserver src/ai/catalog/tst_catalogserver.cpp
        src/ai/catalog/ModelCatalogController.h src/ai/catalog/ModelCatalogController.cpp
        src/ai/catalog/EntityReferenceController.h src/ai/catalog/EntityReferenceController.cpp)
    target_include_directories(tst_ai_catalogserver PRIVATE tests)
    target_link_libraries(tst_ai_catalogserver PRIVATE timeline_server nodetool_model_picker Qt6::Qml Qt6::Test)
    add_test(NAME tst_ai_catalogserver COMMAND tst_ai_catalogserver)
endfunction()
nt_tests(nt_ai_catalog_tests)
nt_qml_sources(src/ai/catalog/EntityReferenceController.h src/ai/catalog/EntityReferenceController.cpp)
