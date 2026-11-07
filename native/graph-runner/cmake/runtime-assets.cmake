# Stage runtime libraries for executable consumers.
function(nodetool_stage_graph_runner_runtime target)
  if(NOT GR_WASMTIME_RUNTIME_LIBRARY)
    message(FATAL_ERROR "The graph runner Wasmtime runtime has not been configured")
  endif()
  add_custom_command(TARGET "${target}" POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different
      "${GR_WASMTIME_RUNTIME_LIBRARY}" "$<TARGET_FILE_DIR:${target}>"
    VERBATIM)
  if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    get_target_property(media_libraries gr_kernel GR_MEDIA_RUNTIME_LIBRARIES)
    set_property(TARGET "${target}" APPEND PROPERTY LINK_DEPENDS
      "${CMAKE_CURRENT_FUNCTION_LIST_FILE}"
      "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/stage-media-runtime.cmake")
    add_custom_command(TARGET "${target}" POST_BUILD
      COMMAND "${CMAKE_COMMAND}"
        "-DGR_MEDIA_RUNTIME_LIBRARIES=${media_libraries}"
        "-DGR_RUNTIME_DIRECTORY=$<TARGET_FILE_DIR:${target}>"
        "-DGR_READELF=${CMAKE_READELF}"
        -P "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/stage-media-runtime.cmake"
      VERBATIM)
  endif()
  if(APPLE)
    set_property(TARGET "${target}" APPEND PROPERTY BUILD_RPATH "@loader_path")
    set_property(TARGET "${target}" APPEND PROPERTY INSTALL_RPATH "@loader_path")
  elseif(UNIX)
    set_property(TARGET "${target}" APPEND PROPERTY BUILD_RPATH "$ORIGIN")
    set_property(TARGET "${target}" APPEND PROPERTY INSTALL_RPATH "$ORIGIN")
  endif()
endfunction()
