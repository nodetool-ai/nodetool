file(MAKE_DIRECTORY "${OUTPUT_DIR}")
set(screenshot "${OUTPUT_DIR}/editor.png")
file(REMOVE "${screenshot}")
set(ENV{XDG_CONFIG_HOME} "${OUTPUT_DIR}/config")

if(MODE STREQUAL "fallback")
    set(ENV{QSG_RHI_BACKEND} vulkan)
    set(ENV{VK_DRIVER_FILES} "${OUTPUT_DIR}/missing-icd.json")
    set(ENV{VK_ICD_FILENAMES} "$ENV{VK_DRIVER_FILES}")
endif()

execute_process(
    COMMAND "${XVFB_RUN}" -a -s "-screen 0 1920x1200x24" "${EDITOR}" --offline --screenshot "${screenshot}"
    RESULT_VARIABLE status OUTPUT_VARIABLE stdout ERROR_VARIABLE stderr TIMEOUT 30)
if(NOT status STREQUAL "0" OR NOT EXISTS "${screenshot}")
    message(FATAL_ERROR "Editor launch failed (${status})\n${stdout}\n${stderr}")
endif()

if(MODE STREQUAL "fallback")
    string(REGEX MATCHALL "restarting with software rendering" restarts "${stderr}")
    list(LENGTH restarts count)
    if(NOT count EQUAL 1 OR stderr MATCHES "nodetool-node-editor: using [A-Za-z0-9]+ rendering")
        message(FATAL_ERROR "Expected a single retry in software\n${stderr}")
    endif()
elseif(NOT stderr MATCHES "nodetool-node-editor: using [A-Za-z0-9]+ rendering" OR stderr MATCHES "restarting with software rendering")
    message(FATAL_ERROR "Expected the editor to start on the GPU\n${stderr}")
endif()
