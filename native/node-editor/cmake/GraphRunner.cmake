# The in-process graph runner that WorkflowSession links (native/graph-runner).
if(NOT TARGET nodetool_graph_runner)
    add_subdirectory(${CMAKE_CURRENT_LIST_DIR}/../../graph-runner ${CMAKE_BINARY_DIR}/graph-runner EXCLUDE_FROM_ALL)
endif()
# The guest bundle the local-run tests load. Build it with
# `node native/graph-runner/guest/build.mjs`.
set(NODETOOL_GUEST_BUNDLE "${CMAKE_CURRENT_LIST_DIR}/../../graph-runner/build/guest.js"
    CACHE FILEPATH "Guest bundle for the local-run tests")
