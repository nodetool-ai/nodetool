file(MAKE_DIRECTORY "${OUTPUT_DIR}")
set(screenshot "${OUTPUT_DIR}/editor.png")
file(REMOVE "${screenshot}")
set(ENV{XDG_CONFIG_HOME} "${OUTPUT_DIR}/config")

if(MODE STREQUAL "fallback")
    set(ENV{QSG_RHI_BACKEND} vulkan)
    set(ENV{VK_DRIVER_FILES} "${OUTPUT_DIR}/missing-icd.json")
    set(ENV{VK_ICD_FILENAMES} "$ENV{VK_DRIVER_FILES}")
endif()

# Some xvfb-run versions redirect the editor's stderr to stdout.
execute_process(
    COMMAND "${XVFB_RUN}" -a -s "-screen 0 1920x1200x24" "${EDITOR}" --offline --screenshot "${screenshot}"
    RESULT_VARIABLE status OUTPUT_VARIABLE output ERROR_VARIABLE output TIMEOUT 30)
if(NOT status STREQUAL "0" OR NOT EXISTS "${screenshot}")
    message(FATAL_ERROR "Editor launch failed (${status})\n${output}")
endif()

if(MODE STREQUAL "fallback")
    string(REGEX MATCHALL "restarting with software rendering" restarts "${output}")
    list(LENGTH restarts count)
    if(NOT count EQUAL 1 OR output MATCHES "nodetool-node-editor: using [A-Za-z0-9]+ rendering")
        message(FATAL_ERROR "Expected a single retry in software\n${output}")
    endif()
elseif(NOT output MATCHES "nodetool-node-editor: using [A-Za-z0-9]+ rendering" OR output MATCHES "restarting with software rendering")
    message(FATAL_ERROR "Expected the editor to start on the GPU\n${output}")
endif()
