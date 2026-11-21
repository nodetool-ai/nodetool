cmake_minimum_required(VERSION 3.28)
project(nodetool_account_helper LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

option(NODETOOL_ACCOUNT_HELPER_TESTS "Build the test helper and the in-process tests" OFF)
option(NODETOOL_ACCOUNT_HELPER_SANITIZE "Build with AddressSanitizer and UndefinedBehaviorSanitizer" OFF)
option(NODETOOL_ACCOUNT_HELPER_TSAN "Build with ThreadSanitizer" OFF)
if(NODETOOL_ACCOUNT_HELPER_SANITIZE)
  add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
  add_link_options(-fsanitize=address,undefined)
endif()
if(NODETOOL_ACCOUNT_HELPER_TSAN)
  add_compile_options(-fsanitize=thread)
  add_link_options(-fsanitize=thread)
  # The account library leaves libsecret out of a ThreadSanitizer build,
  # because GLib is not instrumented.
  set(NODETOOL_ACCOUNT_TSAN ON CACHE BOOL "" FORCE)
endif()

# The account library the Qt apps link, unchanged. Its own tests build only
# when it is the top-level project.
add_subdirectory(../account account EXCLUDE_FROM_ALL)

add_library(nodetool_account_helper_core STATIC
  src/account_helper.cpp
  src/data_dir.cpp
  src/pipe_transport.cpp)
target_include_directories(nodetool_account_helper_core PUBLIC src)
target_link_libraries(nodetool_account_helper_core PUBLIC nodetool_account nlohmann_json::nlohmann_json)
if(WIN32)
  target_link_libraries(nodetool_account_helper_core PUBLIC shell32 ole32 ws2_32)
endif()

# The shipped helper: the platform keychain, or memory when there is none.
add_executable(nodetool-account-helper src/main.cpp)
target_link_libraries(nodetool-account-helper PRIVATE nodetool_account_helper_core)

if(NODETOOL_ACCOUNT_HELPER_TESTS)
  enable_testing()
  # The same program with a credential store in a folder and a fault hook,
  # for the process tests. Never shipped.
  add_executable(nodetool-account-helper-test src/main.cpp src/file_secret_store.cpp)
  target_compile_definitions(nodetool-account-helper-test PRIVATE NODETOOL_ACCOUNT_HELPER_TESTING)
  target_link_libraries(nodetool-account-helper-test PRIVATE nodetool_account_helper_core)

  add_executable(account_helper_tests tests/helper.cpp)
  target_link_libraries(account_helper_tests PRIVATE nodetool_account_helper_core)
  target_include_directories(account_helper_tests PRIVATE ../account/tests)
  add_test(NAME account_helper_tests COMMAND account_helper_tests)

  # The account library's own tests, so this workflow also builds the
  # keychain store of each platform.
  foreach(name unit session cloud policy keychain project_lock)
    add_executable(account_${name}_tests ../account/tests/${name}.cpp)
    target_link_libraries(account_${name}_tests PRIVATE nodetool_account nlohmann_json::nlohmann_json)
    target_include_directories(account_${name}_tests PRIVATE ../account/tests)
    add_test(NAME account_${name}_tests COMMAND account_${name}_tests)
  endforeach()
endif()
