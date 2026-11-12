# Copy the configured FFmpeg DLLs and the DLLs they import beside a Windows
# executable. Qt Multimedia ships FFmpeg DLLs with the same names, and Windows
# loads a DLL from the executable's directory before searching PATH, so the
# runner's copies must be the ones staged there.
#
#   GR_MEDIA_RUNTIME_NAMES        pkg-config library names (avcodec, ...)
#   GR_MEDIA_RUNTIME_DIRECTORIES  bin directories of the configured FFmpeg
#   GR_RUNTIME_DIRECTORY          destination directory
#   GR_DUMPBIN                    dumpbin executable
set(media "")
foreach(name IN LISTS GR_MEDIA_RUNTIME_NAMES)
  set(found "")
  foreach(directory IN LISTS GR_MEDIA_RUNTIME_DIRECTORIES)
    file(GLOB candidates "${directory}/${name}-*.dll" "${directory}/${name}.dll")
    if(candidates)
      list(APPEND found ${candidates})
      break()
    endif()
  endforeach()
  if(NOT found)
    message(FATAL_ERROR "No ${name} DLL in ${GR_MEDIA_RUNTIME_DIRECTORIES}")
  endif()
  list(APPEND media ${found})
endforeach()
set(CMAKE_GET_RUNTIME_DEPENDENCIES_PLATFORM windows+pe)
set(CMAKE_GET_RUNTIME_DEPENDENCIES_TOOL dumpbin)
set(CMAKE_GET_RUNTIME_DEPENDENCIES_COMMAND "${GR_DUMPBIN}")
file(GET_RUNTIME_DEPENDENCIES
  LIBRARIES ${media}
  DIRECTORIES ${GR_MEDIA_RUNTIME_DIRECTORIES}
  RESOLVED_DEPENDENCIES_VAR resolved
  PRE_EXCLUDE_REGEXES "api-ms-.*" "ext-ms-.*"
  POST_EXCLUDE_REGEXES "^[A-Za-z]:[/\\\\][Ww][Ii][Nn][Dd][Oo][Ww][Ss][/\\\\]")
foreach(library IN LISTS media resolved)
  get_filename_component(name "${library}" NAME)
  file(COPY_FILE "${library}" "${GR_RUNTIME_DIRECTORY}/${name}" ONLY_IF_DIFFERENT)
endforeach()
