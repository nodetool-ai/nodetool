nt_sources(app src/app/CliModes.h src/app/CliModes.cpp src/app/UploadAssetCli.cpp)
nt_qml_sources(src/app/PanelRegistry.h src/app/PanelRegistry.cpp
    src/app/MenuRegistry.h src/app/MenuRegistry.cpp src/app/BuiltinEdits.cpp)
nt_qml_files(qml/TimelineEditor.qml)
nt_sources(qml_resources
    fonts/inter-latin-400-normal.woff2 fonts/inter-latin-500-normal.woff2 fonts/inter-latin-600-normal.woff2 fonts/jetbrains-mono-latin-400-normal.woff2 fonts/jetbrains-mono-latin-500-normal.woff2 fonts/jetbrains-mono-latin-600-normal.woff2)

function(nt_app_tests)
    # The comparison helpers of scripts/plan-conformance.mjs (node:test).
    add_test(NAME plan_compare COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/scripts/plan-compare.test.mjs)
    # The scratch-server safety rules of scripts/server-check.mjs (node:test).
    add_test(NAME scratch_safety COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/scripts/scratch-safety.test.mjs)
    # The verdicts of scripts/web-baseline.mjs and scripts/peaks-check.mjs on
    # mocked inputs (node:test; no server, no browser).
    add_test(NAME web_baseline_checks COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/scripts/conformance/web-baseline.test.mjs)
    add_test(NAME peaks_check_plan COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/scripts/conformance/peaks-check.test.mjs)
    # The bundle dependency audit of scripts/macho-deps.py (review F5): builds
    # tiny Mach-O files with clang.
    find_program(NT_PYTHON3 NAMES python3 NO_CACHE REQUIRED)
    add_test(NAME macho_notices COMMAND ${NT_PYTHON3} ${CMAKE_CURRENT_SOURCE_DIR}/scripts/macho-notices.test.py)
    if(APPLE)
        add_test(NAME macho_deps COMMAND ${NT_PYTHON3} ${CMAKE_CURRENT_SOURCE_DIR}/scripts/macho-deps.test.py)
    endif()
endfunction()
nt_tests(nt_app_tests)
nt_qml_files(src/app/PanelSlot.qml)
function(nt_inspector_tests)
    qt_add_executable(tst_inspectorprimitives src/app/tst_inspectorprimitives.cpp)
    set_target_properties(tst_inspectorprimitives PROPERTIES MACOSX_BUNDLE FALSE)
    target_compile_options(tst_inspectorprimitives PRIVATE ${NT_WARNINGS})
    target_link_libraries(tst_inspectorprimitives PRIVATE timeline_core timeline_decode timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_inspectorprimitives OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_inspectorprimitives_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_inspectorprimitives PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    add_test(NAME tst_inspectorprimitives COMMAND tst_inspectorprimitives)
    set_tests_properties(tst_inspectorprimitives PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    add_test(NAME s1_contracts COMMAND node --test ${CMAKE_CURRENT_SOURCE_DIR}/src/app/contracts.test.mjs)
endfunction()
nt_tests(nt_inspector_tests)

set_source_files_properties(qml/Inspector/primitives/InspectorTokens.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
nt_qml_files(
    qml/Inspector/primitives/ClipIdentityCard.qml
    qml/Inspector/primitives/InspectorCard.qml
    qml/Inspector/primitives/InspectorColour.qml
    qml/Inspector/primitives/InspectorDivider.qml
    qml/Inspector/primitives/InspectorHeader.qml
    qml/Inspector/primitives/InspectorPillInput.qml
    qml/Inspector/primitives/InspectorRow.qml
    qml/Inspector/primitives/InspectorSection.qml
    qml/Inspector/primitives/InspectorSectionTitle.qml
    qml/Inspector/primitives/InspectorSelect.qml
    qml/Inspector/primitives/InspectorSliderRow.qml
    qml/Inspector/primitives/InspectorStaticValue.qml
    qml/Inspector/primitives/InspectorToggleRow.qml
    qml/Inspector/primitives/InspectorTokens.qml
    qml/Inspector/primitives/InspectorPrimitivesHelpers.js)
