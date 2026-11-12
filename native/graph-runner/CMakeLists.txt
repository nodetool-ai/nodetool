cmake_minimum_required(VERSION 3.28)
project(nodetool_graph_runner LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# A parent project (the node editor) may turn on Qt's moc for its targets.
set(CMAKE_AUTOMOC OFF)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
find_package(Threads REQUIRED)

# The native job core (native/jobs): jobs, executors, run mailboxes, the
# admission ledger and resource control. A parent project, such as the node
# editor, may have added it already.
if(NOT TARGET nodetool_jobs)
  add_subdirectory(${CMAKE_CURRENT_LIST_DIR}/../jobs ${CMAKE_CURRENT_BINARY_DIR}/jobs)
endif()

include(FetchContent)

# QuickJS-ng v0.18.0, pinned by commit. Always a static library, so a host
# such as the node editor, whose QtNodes dependency turns BUILD_SHARED_LIBS
# on, does not ship a separate libqjs.
set(BUILD_SHARED_LIBS OFF)
set(QJS_ENABLE_INSTALL OFF CACHE BOOL "" FORCE)
set(QJS_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
FetchContent_Declare(quickjs
  GIT_REPOSITORY https://github.com/quickjs-ng/quickjs.git
  GIT_TAG d7215b0ad3fc2c562e8317fd9bca058fd4863804
  EXCLUDE_FROM_ALL)

FetchContent_Declare(nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d
  EXCLUDE_FROM_ALL)

# SQLite 3.53.2, the version better-sqlite3 12.11.1 bundles, and the
# sqlite-vec 0.1.9 extension, the version the sqlite-vec npm package ships.
# Both compile into the runner (src/host/sqlite.cpp), so node code that uses
# better-sqlite3 and sqlite-vec runs on the same engine as on the server.
FetchContent_Declare(sqlite_amalgamation
  URL https://www.sqlite.org/2026/sqlite-amalgamation-3530200.zip
  URL_HASH SHA256=8a310d0a16c7a90cacd4c884e70faa51c902afed2a89f63aaa0126ab83558a32
  EXCLUDE_FROM_ALL)
FetchContent_Declare(sqlite_vec
  URL https://github.com/asg017/sqlite-vec/releases/download/v0.1.9/sqlite-vec-0.1.9-amalgamation.tar.gz
  URL_HASH SHA256=3acd67cb4aff080c7050926fd3cf8227905fe5b7ee3829d8ee5024ab1283cf61
  EXCLUDE_FROM_ALL)

FetchContent_MakeAvailable(quickjs nlohmann_json sqlite_amalgamation sqlite_vec)
# QuickJS-ng casts js_realloc to DynBufReallocFunc*. The cast is safe on every
# supported ABI, but Clang's -fsanitize=function aborts on the call. The check
# stays on for the project's own code.
if(CMAKE_C_COMPILER_ID MATCHES "Clang")
  target_compile_options(qjs PRIVATE -fno-sanitize=function)
endif()

# SQLite with better-sqlite3's compile options (deps/defines.gypi), so
# queries behave as on the server, minus its SQLITE_OMIT_* options, which the
# amalgamation does not support. Extension loading is compiled out: the only
# extension a guest can load is the built-in sqlite-vec.
add_library(gr_sqlite STATIC
  ${sqlite_amalgamation_SOURCE_DIR}/sqlite3.c
  ${sqlite_vec_SOURCE_DIR}/sqlite-vec.c)
target_include_directories(gr_sqlite PUBLIC
  ${sqlite_amalgamation_SOURCE_DIR} ${sqlite_vec_SOURCE_DIR})
target_compile_definitions(gr_sqlite PUBLIC SQLITE_CORE SQLITE_VEC_STATIC)
target_compile_definitions(gr_sqlite PRIVATE
  HAVE_USLEEP=1
  SQLITE_DEFAULT_CACHE_SIZE=-16000
  SQLITE_DEFAULT_FOREIGN_KEYS=1
  SQLITE_DEFAULT_MEMSTATUS=0
  SQLITE_DEFAULT_WAL_SYNCHRONOUS=1
  SQLITE_DQS=0
  SQLITE_ENABLE_COLUMN_METADATA
  SQLITE_ENABLE_DBSTAT_VTAB
  SQLITE_ENABLE_FTS3
  SQLITE_ENABLE_FTS3_PARENTHESIS
  SQLITE_ENABLE_FTS4
  SQLITE_ENABLE_FTS5
  SQLITE_ENABLE_GEOPOLY
  SQLITE_ENABLE_MATH_FUNCTIONS
  SQLITE_ENABLE_PERCENTILE
  SQLITE_ENABLE_RTREE
  SQLITE_ENABLE_STAT4
  SQLITE_ENABLE_UPDATE_DELETE_LIMIT
  SQLITE_LIKE_DOESNT_MATCH_BLOBS
  SQLITE_OMIT_LOAD_EXTENSION
  SQLITE_SOUNDEX
  SQLITE_THREADSAFE=2
  SQLITE_TRACE_SIZE_LIMIT=32
  SQLITE_USE_URI=0)
set_target_properties(gr_sqlite PROPERTIES POSITION_INDEPENDENT_CODE ON)
if(NOT MSVC)
  # Third-party C: keep its warnings out of the runner's build output.
  target_compile_options(gr_sqlite PRIVATE -w)
endif()

# The image and gpu host capabilities: stb, and wgpu-native unless
# NODETOOL_GRAPH_RUNNER_GPU is OFF.
include(cmake/host-image-gpu.cmake)
include(cmake/host-image-vips.cmake)

# Engine-neutral interface plus the QuickJS backend. Only this target sees
# QuickJS headers.
add_library(gr_js STATIC src/js/quickjs_engine.cpp)
target_include_directories(gr_js PUBLIC src)
target_link_libraries(gr_js PRIVATE qjs)

# The kernel: graph, correlation analysis, inboxes, actors, runner, and the
# guest protocol. Depends on src/js/engine.h only.
add_library(gr_kernel STATIC
  src/kernel/execution_state.cpp
  src/kernel/public_supervisor.cpp
  src/kernel/subgraph.cpp
  src/kernel/state_executor.cpp
  src/kernel/durable_delivery.cpp
  src/kernel/task.cpp
  src/kernel/cancel_state.cpp
  src/kernel/async_jobs.cpp
  src/kernel/host_lanes.cpp
  src/kernel/job_inputs.cpp
  src/kernel/destination_queue.cpp
  src/kernel/inbox.cpp
  src/kernel/graph.cpp
  src/kernel/correlation.cpp
  src/kernel/actor.cpp
  src/host/intl.cpp
  src/host/image_jobs.cpp
  src/host/context.cpp
  src/host/context_async.cpp
  src/host/sandbox.cpp
  src/host/sandbox_session.cpp
  src/kernel/quiescence.cpp
  src/kernel/catalog_support.cpp
  src/kernel/actor_control.cpp
  src/kernel/runner.cpp
  src/kernel/guest.cpp
  src/kernel/wire.cpp
  src/kernel/normalize.cpp
  src/kernel/output_node.cpp
  src/host/capabilities.cpp
  src/host/sqlite.cpp
  src/host/paths.cpp
  src/host/files.cpp
  src/host/file_jobs.cpp
  src/host/assets.cpp
  src/host/asset_destinations.cpp
  src/host/secrets.cpp
  src/host/http.cpp
  src/host/process.cpp
  src/host/timers.cpp)
target_include_directories(gr_kernel PUBLIC src include)
if(WIN32)
  target_sources(gr_kernel PRIVATE src/host/platform_fs_windows.cpp)
  target_compile_definitions(gr_kernel PUBLIC NOMINMAX WIN32_LEAN_AND_MEAN)
  target_link_libraries(gr_kernel PRIVATE ntdll bcrypt ws2_32)
  if(BUILD_TESTING)
    add_subdirectory(unittests/windows)
  endif()
endif()
include(cmake/host-media.cmake)
include(cmake/host-code-media.cmake)
target_link_libraries(gr_kernel PUBLIC nodetool_jobs nlohmann_json::nlohmann_json Threads::Threads)
include(src/host/canvas.cmake)
find_package(ICU REQUIRED COMPONENTS i18n uc)
target_link_libraries(gr_kernel PRIVATE ICU::i18n ICU::uc)
target_link_libraries(gr_kernel PRIVATE qjs gr_sqlite ${CMAKE_DL_LIBS})
include(cmake/host-wasm.cmake)
include(cmake/host-ocr.cmake)
include(cmake/webassembly.cmake)
include(cmake/runtime-assets.cmake)

# libcurl backs the http capability (src/host/http.cpp). Without it the
# runner builds, and fetching a URL fails with a message saying so.
find_package(CURL QUIET)
if(CURL_FOUND)
  target_compile_definitions(gr_kernel PRIVATE GR_HAVE_CURL)
  target_link_libraries(gr_kernel PUBLIC CURL::libcurl)
endif()
target_link_libraries(gr_kernel PUBLIC nlohmann_json::nlohmann_json gr_host_gpu)

# The library hosts link: one worker thread with a loaded guest. Its public
# header (include/nodetool/graph_runner.h) exposes no engine or JSON types.
add_library(nodetool_graph_runner STATIC src/graph_runner.cpp src/provider_jobs.cpp)
target_include_directories(nodetool_graph_runner PUBLIC include)
target_link_libraries(nodetool_graph_runner PRIVATE gr_kernel gr_js Threads::Threads)

# The CLI and the tests build only when this is the top-level project.
if(PROJECT_IS_TOP_LEVEL)
  add_executable(nodetool-graph-runner src/main.cpp)
  nodetool_stage_graph_runner_runtime(nodetool-graph-runner)
  target_link_libraries(nodetool-graph-runner PRIVATE nodetool_graph_runner
                        nlohmann_json::nlohmann_json)

  enable_testing()
  add_executable(gr_cancel_listener_tests unittests/cancel-listeners.cpp)
  target_link_libraries(gr_cancel_listener_tests PRIVATE gr_kernel gr_js)
  add_test(NAME gr_cancel_listener_tests COMMAND gr_cancel_listener_tests)
  add_executable(gr_state_tests unittests/execution_state.cpp)
  target_link_libraries(gr_state_tests PRIVATE gr_kernel gr_js)
  add_executable(gr_unittests unittests/main.cpp)
  target_link_libraries(gr_unittests PRIVATE gr_kernel gr_js)
  add_test(NAME gr_unittests COMMAND gr_unittests)
  # The run mailbox, settlers, cancellation snapshot and scheduling modes
  # (docs/plans/graph-runner-async-host.md, rollout step 1).
  add_executable(gr_async_tests unittests/async_host.cpp)
  target_link_libraries(gr_async_tests PRIVATE gr_kernel gr_js Threads::Threads)
  add_test(NAME gr_async_tests COMMAND gr_async_tests)
  # The process lanes, submission snapshots and timed shutdown (rollout
  # step 2).
  add_executable(gr_lanes_tests unittests/host_lanes.cpp)
  target_link_libraries(gr_lanes_tests PRIVATE gr_kernel gr_js Threads::Threads)
  add_test(NAME gr_lanes_tests COMMAND gr_lanes_tests)
  # Resource control blocks, serial queues and session stop bridges
  # (rollout step 5 infrastructure).
  add_executable(gr_resource_tests unittests/resource_control.cpp)
  target_link_libraries(gr_resource_tests PRIVATE gr_kernel gr_js nodetool_jobs_test_support Threads::Threads)
  add_test(NAME gr_resource_tests COMMAND gr_resource_tests)
  # The asset destination queue: ordered commits, cancellation and
  # confinement at commit (rollout step 5 infrastructure).
  add_executable(gr_asset_destination_tests unittests/asset_destinations.cpp)
  target_link_libraries(gr_asset_destination_tests PRIVATE gr_kernel gr_js nodetool_jobs_test_support
                        Threads::Threads)
  add_test(NAME gr_asset_destination_tests COMMAND gr_asset_destination_tests)
  # fs/promises, file handles, asset writes and fetches as native jobs
  # (rollout step 5). Fetches reach only a loopback server of the test.
  add_executable(gr_files_async_tests unittests/files_async.cpp)
  target_link_libraries(gr_files_async_tests PRIVATE gr_kernel gr_js nodetool_jobs_test_support Threads::Threads)
  if(CURL_FOUND)
    target_compile_definitions(gr_files_async_tests PRIVATE GR_HAVE_CURL)
  endif()
  add_test(NAME gr_files_async_tests COMMAND gr_files_async_tests)
  set_tests_properties(gr_files_async_tests PROPERTIES TIMEOUT 300)
  # The asynchronous context transport and shared grant rules (rollout
  # step 3). The runner cases load the guest bundle when it is passed.
  add_executable(gr_async_context_tests unittests/async_context.cpp)
  target_link_libraries(gr_async_context_tests PRIVATE nodetool_graph_runner gr_kernel gr_js
                        nlohmann_json::nlohmann_json Threads::Threads)
  # The admission ledger and the JavaScript external-byte ledger (rollout
  # step 7).
  add_executable(gr_admission_tests unittests/admission.cpp)
  target_link_libraries(gr_admission_tests PRIVATE nodetool_graph_runner gr_kernel gr_js
                        nlohmann_json::nlohmann_json Threads::Threads)
  add_test(NAME gr_admission_tests COMMAND gr_admission_tests)
  set_tests_properties(gr_admission_tests PROPERTIES TIMEOUT 300)
  # Worker thread ownership checks (invariant I5), compiled into this test
  # only, so a release build can exercise them.
  add_executable(gr_thread_check_tests unittests/thread_checks.cpp
    src/kernel/task.cpp src/kernel/async_jobs.cpp src/js/quickjs_engine.cpp)
  target_include_directories(gr_thread_check_tests PRIVATE src include)
  target_compile_definitions(gr_thread_check_tests PRIVATE GR_THREAD_CHECKS=1)
  target_link_libraries(gr_thread_check_tests PRIVATE nodetool_jobs qjs Threads::Threads)
  add_test(NAME gr_thread_check_tests COMMAND gr_thread_check_tests)

  # The host capabilities (src/host/), called from JavaScript.
  add_executable(gr_host_tests unittests/host.cpp)
  target_link_libraries(gr_host_tests PRIVATE gr_kernel gr_js)
  if(CURL_FOUND)
    target_compile_definitions(gr_host_tests PRIVATE GR_HAVE_CURL)
  endif()
  add_test(NAME gr_host_tests COMMAND gr_host_tests)

  # Runs the library against a real guest bundle (node guest/build.mjs).
  set(NODETOOL_GUEST_BUNDLE "${CMAKE_CURRENT_SOURCE_DIR}/build/guest.js"
      CACHE FILEPATH "Guest bundle the library tests load")
  add_test(NAME gr_state_tests COMMAND gr_state_tests "${NODETOOL_GUEST_BUNDLE}" "${CMAKE_CURRENT_BINARY_DIR}")

  add_executable(gr_public_run unittests/public-run.cpp)
  target_link_libraries(gr_public_run PRIVATE nodetool_graph_runner nlohmann_json::nlohmann_json)
  add_executable(gr_public_state_tests unittests/public_state.cpp)
  target_link_libraries(gr_public_state_tests PRIVATE nodetool_graph_runner gr_sqlite nlohmann_json::nlohmann_json)
  add_test(NAME gr_public_state_tests COMMAND gr_public_state_tests "${NODETOOL_GUEST_BUNDLE}" "${CMAKE_CURRENT_BINARY_DIR}")
  add_executable(gr_public_subgraph_durable_tests unittests/public_subgraph_durable.cpp)
  target_link_libraries(gr_public_subgraph_durable_tests PRIVATE nodetool_graph_runner gr_sqlite nlohmann_json::nlohmann_json)
  add_test(NAME gr_public_subgraph_durable_tests
    COMMAND gr_public_subgraph_durable_tests "${NODETOOL_GUEST_BUNDLE}" "${CMAKE_CURRENT_BINARY_DIR}")
  set_tests_properties(gr_public_subgraph_durable_tests PROPERTIES TIMEOUT 300)
  add_executable(gr_public_control_supervisor_tests unittests/public_control_supervisor.cpp)
  target_link_libraries(gr_public_control_supervisor_tests PRIVATE nodetool_graph_runner gr_kernel gr_js)
  add_test(NAME gr_public_control_supervisor_tests
    COMMAND gr_public_control_supervisor_tests "${NODETOOL_GUEST_BUNDLE}")
  set_tests_properties(gr_public_control_supervisor_tests PROPERTIES TIMEOUT 180)
  add_executable(gr_public_invocation_occurrence_tests unittests/public_invocation_occurrence.cpp)
  target_link_libraries(gr_public_invocation_occurrence_tests PRIVATE nodetool_graph_runner nlohmann_json::nlohmann_json)
  add_test(NAME gr_public_invocation_occurrence_tests
    COMMAND gr_public_invocation_occurrence_tests "${NODETOOL_GUEST_BUNDLE}")
  set_tests_properties(gr_public_invocation_occurrence_tests PROPERTIES TIMEOUT 180)
  add_executable(gr_invocation_occurrence_tests unittests/invocation_occurrence.cpp)
  target_link_libraries(gr_invocation_occurrence_tests PRIVATE gr_kernel gr_js)
  add_test(NAME gr_invocation_occurrence_tests COMMAND gr_invocation_occurrence_tests)
  find_program(GR_NODE_EXECUTABLE node REQUIRED)
  add_test(NAME gr_public_runtime_tests
    COMMAND "${GR_NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/check-public-runtime.mjs"
      "$<TARGET_FILE:gr_public_run>" "${NODETOOL_GUEST_BUNDLE}")
  set_tests_properties(gr_public_runtime_tests PROPERTIES TIMEOUT 300)
  add_executable(gr_library_tests unittests/library.cpp)
  target_link_libraries(gr_library_tests PRIVATE nodetool_graph_runner
                        nlohmann_json::nlohmann_json)
  add_test(NAME gr_library_tests COMMAND gr_library_tests "${NODETOOL_GUEST_BUNDLE}")

  # The sqlite capability. When the repository's esbuild is installed, the
  # test also runs the better-sqlite3 wrapper tests, bundled at build time.
  add_executable(gr_sqlite_tests unittests/sqlite.cpp)
  target_link_libraries(gr_sqlite_tests PRIVATE gr_kernel gr_js)
  find_program(GR_ESBUILD esbuild
    HINTS "${CMAKE_CURRENT_SOURCE_DIR}/../../node_modules/.bin" NO_DEFAULT_PATH)
  if(GR_ESBUILD)
    set(GR_SQLITE_WRAPPER_TEST "${CMAKE_CURRENT_BINARY_DIR}/sqlite-wrapper-test.js")
    add_custom_command(OUTPUT "${GR_SQLITE_WRAPPER_TEST}"
      COMMAND "${GR_ESBUILD}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/sqlite-wrapper.test.mjs"
              --bundle --format=iife --platform=neutral --target=es2022 --log-level=warning
              "--outfile=${GR_SQLITE_WRAPPER_TEST}"
      DEPENDS unittests/sqlite-wrapper.test.mjs guest/host/sqlite.mjs guest/host/sqlite-vec.mjs
      VERBATIM)
    add_custom_target(gr_sqlite_wrapper_test ALL DEPENDS "${GR_SQLITE_WRAPPER_TEST}")
    add_test(NAME gr_sqlite_tests COMMAND gr_sqlite_tests "${GR_SQLITE_WRAPPER_TEST}")
  else()
    message(STATUS "esbuild not found: gr_sqlite_tests runs without the wrapper tests")
    add_test(NAME gr_sqlite_tests COMMAND gr_sqlite_tests)
  endif()
  # The guest's JavaScript environment: modules, timers, Intl, structuredClone.
  add_executable(gr_env_tests unittests/env.cpp)
  target_link_libraries(gr_env_tests PRIVATE nodetool_graph_runner gr_kernel gr_js
                        nlohmann_json::nlohmann_json Threads::Threads)
  if(GR_ESBUILD)
    find_program(GR_NODE node REQUIRED)
    add_test(NAME gr_public_trigger_tests
      COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/verify-public-trigger.mjs"
        "$<TARGET_FILE:gr_public_run>" "${NODETOOL_GUEST_BUNDLE}")
    set(GR_PROCESS_TEST "${CMAKE_CURRENT_BINARY_DIR}/process-memfs-test.js")
    add_custom_target(gr_process_test_bundle ALL
      COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-process-memfs.mjs" "${GR_PROCESS_TEST}"
      VERBATIM)
    add_test(NAME gr_env_tests COMMAND gr_env_tests "${NODETOOL_GUEST_BUNDLE}" "${GR_PROCESS_TEST}")
  else()
    add_test(NAME gr_env_tests COMMAND gr_env_tests "${NODETOOL_GUEST_BUNDLE}")
  endif()
  include(cmake/image-codec-tests.cmake)
  include(cmake/url-tests.cmake)
  include(cmake/intl-icu-tests.cmake)
  set(GR_CONTEXT_TEST "${CMAKE_CURRENT_BINARY_DIR}/context-test.mjs")
  add_custom_target(gr_context_test_bundle ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-context.mjs" "${GR_CONTEXT_TEST}"
    VERBATIM)
  add_executable(gr_context_tests unittests/context.cpp)
  target_link_libraries(gr_context_tests PRIVATE nodetool_graph_runner gr_kernel gr_js)
  # The installed tesseract's language data, wherever its prefix is.
  set(GR_TEST_TESSDATA "${GR_TESSERACT_PREFIX}/share/tessdata" CACHE PATH "Tesseract data the context tests grant")
  target_compile_definitions(gr_context_tests PRIVATE GR_TEST_TESSDATA="${GR_TEST_TESSDATA}")
  add_dependencies(gr_context_tests gr_context_test_bundle)
  add_test(NAME gr_context_tests COMMAND gr_context_tests "${GR_CONTEXT_TEST}")
  # A parity bundle of the image module: the default bundle does not admit
  # nodetool.image.TextToImage, whose prediction grant the runner cases use.
  set(GR_ASYNC_CONTEXT_GUEST "${CMAKE_CURRENT_BINARY_DIR}/async-context-guest.js")
  add_custom_target(gr_async_context_guest ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/guest/build.mjs" "${GR_ASYNC_CONTEXT_GUEST}"
            --profile parity --modules @nodetool-ai/image-nodes/nodes/image
    VERBATIM)
  add_dependencies(gr_async_context_tests gr_async_context_guest)
  add_test(NAME gr_async_context_tests COMMAND gr_async_context_tests "${GR_ASYNC_CONTEXT_GUEST}")
  set_tests_properties(gr_async_context_tests PROPERTIES TIMEOUT 300)
  set(GR_PROVIDER_JOBS_TEST "${CMAKE_CURRENT_BINARY_DIR}/provider-jobs-test.mjs")
  add_custom_target(gr_provider_jobs_test_bundle ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-context.mjs" "${GR_PROVIDER_JOBS_TEST}"
            "${CMAKE_CURRENT_SOURCE_DIR}/unittests/provider-jobs.test.mjs"
    VERBATIM)
  add_executable(gr_provider_jobs_tests unittests/provider_jobs.cpp)
  target_link_libraries(gr_provider_jobs_tests PRIVATE nodetool_graph_runner gr_kernel gr_js)
  add_dependencies(gr_provider_jobs_tests gr_provider_jobs_test_bundle)
  add_test(NAME gr_provider_jobs_tests COMMAND gr_provider_jobs_tests "${GR_PROVIDER_JOBS_TEST}")
  # Job states and next() waiters, with workers on the process network lane.
  add_executable(gr_provider_job_state_tests unittests/provider_job_state.cpp)
  target_link_libraries(gr_provider_job_state_tests PRIVATE nodetool_graph_runner gr_kernel gr_js
                        nlohmann_json::nlohmann_json Threads::Threads)
  add_test(NAME gr_provider_job_state_tests COMMAND gr_provider_job_state_tests)
  # Provider next() through the asynchronous context transport, the network
  # lane and the public runner (rollout step 4). The runner cases load a
  # parity bundle of the MiniMax nodes, whose endpoint calls run as jobs, and
  # of the image module, whose TextToImage runs on a fake provider.
  add_executable(gr_provider_next_tests unittests/provider_next.cpp)
  target_link_libraries(gr_provider_next_tests PRIVATE nodetool_graph_runner gr_kernel gr_js
                        nlohmann_json::nlohmann_json Threads::Threads)
  set(GR_PROVIDER_NEXT_GUEST "${CMAKE_CURRENT_BINARY_DIR}/provider-next-guest.js")
  add_custom_target(gr_provider_next_guest ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/guest/build.mjs" "${GR_PROVIDER_NEXT_GUEST}"
            --profile parity --modules @nodetool-ai/minimax-nodes,@nodetool-ai/image-nodes/nodes/image
    VERBATIM)
  add_dependencies(gr_provider_next_tests gr_provider_next_guest)
  add_test(NAME gr_provider_next_tests COMMAND gr_provider_next_tests "${GR_PROVIDER_NEXT_GUEST}")
  set_tests_properties(gr_provider_next_tests PROPERTIES TIMEOUT 300)
  set(GR_FAKE_PROVIDERS_TEST "${CMAKE_CURRENT_BINARY_DIR}/fake-providers-test.mjs")
  add_custom_target(gr_fake_providers_test_bundle ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-context.mjs" "${GR_FAKE_PROVIDERS_TEST}"
            "${CMAKE_CURRENT_SOURCE_DIR}/unittests/fake-providers.test.mjs"
    VERBATIM)
  add_executable(gr_fake_providers_tests unittests/fake_providers.cpp)
  target_link_libraries(gr_fake_providers_tests PRIVATE nodetool_graph_runner gr_kernel gr_js)
  add_dependencies(gr_fake_providers_tests gr_fake_providers_test_bundle)
  add_test(NAME gr_fake_providers_tests COMMAND gr_fake_providers_tests "${GR_FAKE_PROVIDERS_TEST}")
  set(GR_NODE_CONTEXT_TEST "${CMAKE_CURRENT_BINARY_DIR}/node-context-test.mjs")
  add_custom_target(gr_node_context_test_bundle ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-context.mjs" "${GR_NODE_CONTEXT_TEST}"
            "${CMAKE_CURRENT_SOURCE_DIR}/unittests/node-context.test.mjs"
    VERBATIM)
  add_executable(gr_node_context_tests unittests/node_context.cpp)
  target_link_libraries(gr_node_context_tests PRIVATE nodetool_graph_runner gr_kernel gr_js)
  add_dependencies(gr_node_context_tests gr_node_context_test_bundle)
  add_test(NAME gr_node_context_tests COMMAND gr_node_context_tests "${GR_NODE_CONTEXT_TEST}")
  set(GR_CONTEXT_MESSAGE_TEST "${CMAKE_CURRENT_BINARY_DIR}/context-message-test.mjs")
  add_custom_target(gr_context_message_test_bundle ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-context-messages.mjs" "${GR_CONTEXT_MESSAGE_TEST}"
    VERBATIM)
  add_executable(gr_context_message_tests unittests/context_messages.cpp)
  target_link_libraries(gr_context_message_tests PRIVATE nodetool_graph_runner gr_kernel gr_js)
  add_dependencies(gr_context_message_tests gr_context_message_test_bundle)
  add_test(NAME gr_context_message_tests COMMAND gr_context_message_tests "${GR_CONTEXT_MESSAGE_TEST}")
  set(GR_BLOB_VALUE_TEST "${CMAKE_CURRENT_BINARY_DIR}/blob-value-test.mjs")
  add_custom_target(gr_blob_value_test_bundle ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-blob-values.mjs" "${GR_BLOB_VALUE_TEST}"
    VERBATIM)
  add_executable(gr_blob_value_tests unittests/blob_values.cpp)
  target_link_libraries(gr_blob_value_tests PRIVATE nodetool_graph_runner nodetool_jobs nlohmann_json::nlohmann_json)
  add_dependencies(gr_blob_value_tests gr_blob_value_test_bundle)
  add_test(NAME gr_blob_value_tests COMMAND gr_blob_value_tests "${GR_BLOB_VALUE_TEST}")
  include(cmake/context-av-tests.cmake)
  # The asynchronous media and track staging hosts (rollout step 5).
  add_executable(gr_media_async_tests unittests/media_async.cpp)
  target_link_libraries(gr_media_async_tests PRIVATE gr_kernel gr_js nodetool_jobs_test_support PkgConfig::GR_MEDIA
                        Threads::Threads)
  add_test(NAME gr_media_async_tests COMMAND gr_media_async_tests)
  set_tests_properties(gr_media_async_tests PROPERTIES TIMEOUT 600)
  add_executable(gr_media_native_tests unittests/media-native.cpp)
  target_link_libraries(gr_media_native_tests PRIVATE gr_kernel gr_js PkgConfig::GR_MEDIA)
  add_executable(gr_media_native_reference unittests/media-native-reference.cpp)
  target_link_libraries(gr_media_native_reference PRIVATE PkgConfig::GR_MEDIA)
  set(GR_MEDIA_TEST "${CMAKE_CURRENT_BINARY_DIR}/media-native-test.js")
  set(GR_MEDIA_RENDER_TEST "${CMAKE_CURRENT_BINARY_DIR}/media-native-render-test.js")
  set(GR_MEDIA_RENDER_MEDIA_TEST "${CMAKE_CURRENT_BINARY_DIR}/media-native-render-media-test.js")
  add_custom_target(gr_media_native_bundles ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/media-native-build.mjs" "${GR_MEDIA_TEST}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/media-native.test.mjs"
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/media-native-build.mjs" "${GR_MEDIA_RENDER_TEST}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/media-native-render.test.mjs"
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/media-native-build.mjs" "${GR_MEDIA_RENDER_MEDIA_TEST}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/media-native-render-media.test.mjs"
    VERBATIM)
  add_dependencies(gr_media_native_tests gr_media_native_bundles)
  add_test(NAME gr_media_native_tests COMMAND gr_media_native_tests "${GR_MEDIA_TEST}")
  add_test(NAME gr_media_native_render_tests
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/verify-media-render.mjs"
      "$<TARGET_FILE:gr_media_native_tests>" "$<TARGET_FILE:gr_media_native_reference>" "${GR_MEDIA_RENDER_TEST}" still)
  add_test(NAME gr_media_native_render_media_tests
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/verify-media-render.mjs"
      "$<TARGET_FILE:gr_media_native_tests>" "$<TARGET_FILE:gr_media_native_reference>" "${GR_MEDIA_RENDER_MEDIA_TEST}" mixed)
  set(GR_MEDIA_PUBLIC_TEST "${CMAKE_CURRENT_BINARY_DIR}/media-native-public.js")
  add_custom_target(gr_media_native_public_bundle ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/media-native-public-build.mjs" "${GR_MEDIA_PUBLIC_TEST}"
    VERBATIM)
  add_executable(gr_media_native_public_tests unittests/media-native-public.cpp)
  target_link_libraries(gr_media_native_public_tests PRIVATE nodetool_graph_runner nlohmann_json::nlohmann_json)
  add_dependencies(gr_media_native_public_tests gr_media_native_public_bundle)
  add_test(NAME gr_media_native_public_tests
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/media-native-public-verify.mjs"
      "$<TARGET_FILE:gr_media_native_public_tests>" "$<TARGET_FILE:gr_media_native_reference>"
      "${GR_MEDIA_PUBLIC_TEST}" "${CMAKE_CURRENT_BINARY_DIR}/media-native-public-results" image)
  add_executable(gr_timeline_process_tests unittests/timeline-process.cpp)
  target_link_libraries(gr_timeline_process_tests PRIVATE gr_kernel gr_js)
  add_test(NAME gr_timeline_process_tests
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/timeline-process-verify.mjs"
      "$<TARGET_FILE:gr_timeline_process_tests>" "${CMAKE_CURRENT_BINARY_DIR}/timeline-process-parity")
  set(GR_FILE_HANDLE_TEST "${CMAKE_CURRENT_BINARY_DIR}/file-handle-test.js")
  add_custom_target(gr_file_handle_test_bundle ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/file-handle-build.mjs" "${GR_FILE_HANDLE_TEST}"
    VERBATIM)
  add_executable(gr_file_handle_tests unittests/file-handle.cpp)
  target_link_libraries(gr_file_handle_tests PRIVATE gr_kernel gr_js)
  if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    target_compile_definitions(gr_file_handle_tests PRIVATE GR_FILE_HANDLE_WRAP_IO)
    target_link_options(gr_file_handle_tests PRIVATE -Wl,--wrap=read -Wl,--wrap=pread)
  endif()
  add_dependencies(gr_file_handle_tests gr_file_handle_test_bundle)
  add_test(NAME gr_file_handle_tests COMMAND gr_file_handle_tests "${GR_FILE_HANDLE_TEST}")
  add_executable(gr_models_tests unittests/models.cpp)
  target_link_libraries(gr_models_tests PRIVATE gr_kernel gr_js)
  set(GR_MODELS_TEST "${CMAKE_CURRENT_BINARY_DIR}/models-test.js")
  set(GR_MODELS_IMPORT_TEST "${CMAKE_CURRENT_BINARY_DIR}/models-import-test.js")
  add_custom_target(gr_models_test_bundle ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/models-build.mjs" "${GR_MODELS_TEST}"
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/models-build.mjs" "${GR_MODELS_IMPORT_TEST}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/models-import.test.mjs"
    VERBATIM)
  add_dependencies(gr_models_tests gr_models_test_bundle)
  add_test(NAME gr_models_tests COMMAND gr_models_tests "${GR_MODELS_TEST}")
  add_test(NAME gr_models_import_tests COMMAND gr_models_tests "${GR_MODELS_IMPORT_TEST}" --no-sqlite)
  # The image and gpu capabilities against the shader catalog
  # (node guest/host/gpu-catalog.mjs build/gpu-catalog.json). GPU cases use
  # lavapipe when it is installed, so they need no hardware GPU.
  set(NODETOOL_GPU_CATALOG "${CMAKE_CURRENT_SOURCE_DIR}/build/gpu-catalog.json"
      CACHE FILEPATH "Shader catalog the gpu tests load")
  add_custom_target(gr_gpu_catalog ALL
    COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/guest/host/gpu-catalog.mjs" "${NODETOOL_GPU_CATALOG}"
    VERBATIM)
  add_executable(gr_gpu_tests unittests/gpu.cpp)
  target_link_libraries(gr_gpu_tests PRIVATE nodetool_graph_runner gr_kernel gr_js nlohmann_json::nlohmann_json)
  add_dependencies(gr_gpu_tests gr_gpu_catalog)
  if(GR_ESBUILD)
    set(GR_RENDER_TEST "${CMAKE_CURRENT_BINARY_DIR}/render-test.js")
    add_custom_target(gr_render_test_bundle ALL
      COMMAND "${GR_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/unittests/build-render.mjs" "${GR_RENDER_TEST}"
      VERBATIM)
  endif()
  add_test(NAME gr_gpu_tests COMMAND gr_gpu_tests "${NODETOOL_GPU_CATALOG}" "${GR_RENDER_TEST}")
  set(_lavapipe /usr/share/vulkan/icd.d/lvp_icd.json)
  if(EXISTS ${_lavapipe})
    set_tests_properties(gr_gpu_tests PROPERTIES
      ENVIRONMENT "VK_ICD_FILENAMES=${_lavapipe};VK_DRIVER_FILES=${_lavapipe}")
  endif()
  include(unittests/canvas.cmake)
  include(unittests/webassembly.cmake)

  # A TSan build runs the guest about ten times slower (a bundle load takes
  # about 35 s), so each test's TIMEOUT is scaled. ctest's --timeout does not
  # override a test's own TIMEOUT property.
  if(CMAKE_CXX_FLAGS MATCHES "-fsanitize=thread")
    get_property(_gr_tests DIRECTORY PROPERTY TESTS)
    foreach(_gr_test IN LISTS _gr_tests)
      get_test_property(${_gr_test} TIMEOUT _gr_timeout)
      if(_gr_timeout)
        math(EXPR _gr_timeout "${_gr_timeout} * 4")
        set_tests_properties(${_gr_test} PROPERTIES TIMEOUT ${_gr_timeout})
      endif()
    endforeach()
  endif()
endif()
