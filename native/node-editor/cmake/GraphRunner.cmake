# The in-process graph runner that WorkflowSession links (native/graph-runner).
if(NOT TARGET nodetool_graph_runner)
    add_subdirectory(${CMAKE_CURRENT_LIST_DIR}/../../graph-runner ${CMAKE_BINARY_DIR}/graph-runner EXCLUDE_FROM_ALL)
endif()
# The guest bundle the local-run tests load. Build it with
# `node native/graph-runner/guest/build.mjs`.
set(NODETOOL_GUEST_BUNDLE "${CMAKE_CURRENT_LIST_DIR}/../../graph-runner/build/guest.js"
    CACHE FILEPATH "Guest bundle for the local-run tests")
# Executables in the calling directory that link node_editor_core get the graph
# runner statically through it, so they need its runtime libraries staged next
# to them. Otherwise Qt's bundled FFmpeg can load ahead of the system FFmpeg
# the runner links. Call it at the end of each directory that adds them.
function(nodetool_stage_editor_executables)
    get_property(targets DIRECTORY PROPERTY BUILDSYSTEM_TARGETS)
    foreach(target IN LISTS targets)
        get_target_property(type "${target}" TYPE)
        get_target_property(libraries "${target}" LINK_LIBRARIES)
        if(type STREQUAL "EXECUTABLE" AND NOT target STREQUAL "nodetool-node-editor"
           AND "node_editor_core" IN_LIST libraries)
            nodetool_stage_graph_runner_runtime("${target}")
        endif()
    endforeach()
endfunction()
