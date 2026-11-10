cmake_minimum_required(VERSION 3.28)
project(nodetool_jobs LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# A parent project (the node editor) may turn on Qt's moc for its targets.
set(CMAKE_AUTOMOC OFF)
if(PROJECT_IS_TOP_LEVEL AND NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
find_package(Threads REQUIRED)

# The native job core: jobs, executors, run mailboxes, the admission ledger,
# resource control blocks and session stop bridges. It depends on the C++
# standard library only.
add_library(nodetool_jobs STATIC
  src/admission.cpp
  src/job_core.cpp
  src/resource_control.cpp
  src/session_stop.cpp)
target_include_directories(nodetool_jobs PUBLIC include)
target_link_libraries(nodetool_jobs PUBLIC Threads::Threads)

# The test helpers the graph runner's resource, file and media job tests
# share with this package's tests, and the test executor
# (tests/test_executor.h) that runs jobs off the calling thread.
add_library(nodetool_jobs_test_support INTERFACE)
target_include_directories(nodetool_jobs_test_support INTERFACE tests)
target_link_libraries(nodetool_jobs_test_support INTERFACE nodetool_jobs)

# The tests build only when this is the top-level project.
if(PROJECT_IS_TOP_LEVEL)
  enable_testing()
  # The runner tracker and the run mailbox.
  add_executable(jobs_core_tests tests/job_core.cpp)
  target_link_libraries(jobs_core_tests PRIVATE nodetool_jobs_test_support)
  add_test(NAME jobs_core_tests COMMAND jobs_core_tests)
  # The admission ledger.
  add_executable(jobs_admission_tests tests/admission.cpp)
  target_link_libraries(jobs_admission_tests PRIVATE nodetool_jobs_test_support)
  add_test(NAME jobs_admission_tests COMMAND jobs_admission_tests)
  # Session stop bridges.
  add_executable(jobs_session_stop_tests tests/session_stop.cpp)
  target_link_libraries(jobs_session_stop_tests PRIVATE nodetool_jobs_test_support)
  add_test(NAME jobs_session_stop_tests COMMAND jobs_session_stop_tests)
  # Resource control on an inline executor and on the test executor.
  add_executable(jobs_resource_tests tests/resource_control.cpp)
  target_link_libraries(jobs_resource_tests PRIVATE nodetool_jobs_test_support)
  add_test(NAME jobs_resource_tests COMMAND jobs_resource_tests)
  # Concurrent retirement and stops of resource control on the test
  # executor, moved from the graph runner.
  add_executable(jobs_resource_lane_tests tests/resource_lanes.cpp)
  target_link_libraries(jobs_resource_lane_tests PRIVATE nodetool_jobs_test_support)
  add_test(NAME jobs_resource_lane_tests COMMAND jobs_resource_lane_tests)
  set_tests_properties(jobs_resource_lane_tests PROPERTIES TIMEOUT 600)
endif()
