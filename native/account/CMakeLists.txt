cmake_minimum_required(VERSION 3.28)
project(nodetool_account LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# A parent project (the node editor or the timeline) may turn on Qt's moc for
# its targets.
set(CMAKE_AUTOMOC OFF)
if(PROJECT_IS_TOP_LEVEL AND NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
find_package(Threads REQUIRED)

# The JSON library the graph runner uses, at the same version. A parent
# project that already declared it shares its target.
if(NOT TARGET nlohmann_json::nlohmann_json)
  include(FetchContent)
  FetchContent_Declare(nlohmann_json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
    URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d
    EXCLUDE_FROM_ALL)
  FetchContent_MakeAvailable(nlohmann_json)
endif()

option(NODETOOL_ACCOUNT_SANITIZE "Build with AddressSanitizer and UndefinedBehaviorSanitizer" OFF)
option(NODETOOL_ACCOUNT_TSAN "Build with ThreadSanitizer" OFF)
option(NODETOOL_ACCOUNT_QT "Build the Qt transport and AccountController (qt/)" OFF)

# The native account service both apps link (technical design, component
# K4): the session record, the generation file, the lock, the refresh and
# sign-out algorithms, the repair rule and the sign-in flow. It depends on
# the C++ standard library, threads, sockets and nlohmann_json only. The
# platform credential stores and the HTTP transport plug in through
# SecretStore and TokenEndpoint.
add_library(nodetool_account STATIC
  src/account_session.cpp
  src/accounts_index.cpp
  src/cloud_client.cpp
  src/cloud_drafts.cpp
  src/cloud_listing.cpp
  src/cloud_sharing.cpp
  src/cloud_savers.cpp
  src/cloud_transfer.cpp
  src/crypto.cpp
  src/http_token_endpoint.cpp
  src/origin.cpp
  src/policy.cpp
  src/session_record.cpp
  src/sign_in.cpp
  src/storage.cpp)
# The platform credential store, written the way keytar writes it
# (include/nodetool/account/keychain_store.h).
if(APPLE)
  target_sources(nodetool_account PRIVATE src/keychain_mac.cpp)
  target_link_libraries(nodetool_account PRIVATE "-framework Security" "-framework CoreFoundation")
elseif(WIN32)
  target_sources(nodetool_account PRIVATE src/keychain_win.cpp)
  target_link_libraries(nodetool_account PRIVATE advapi32)
else()
  target_sources(nodetool_account PRIVATE src/keychain_linux.cpp)
  # GLib is not built with ThreadSanitizer, and TSan reports races inside
  # GLib's own worker pool that no code here touches. The TSan build leaves
  # libsecret out, so it checks this library's threads only.
  find_package(PkgConfig QUIET)
  set(nodetool_account_libsecret OFF)
  if(PKG_CONFIG_FOUND AND NOT NODETOOL_ACCOUNT_TSAN)
    pkg_check_modules(LIBSECRET IMPORTED_TARGET libsecret-1)
    set(nodetool_account_libsecret ${LIBSECRET_FOUND})
  endif()
  if(nodetool_account_libsecret)
    target_link_libraries(nodetool_account PRIVATE PkgConfig::LIBSECRET)
    target_compile_definitions(nodetool_account PRIVATE NODETOOL_ACCOUNT_HAVE_LIBSECRET)
  else()
    message(STATUS "nodetool_account: building without libsecret (not found, or a ThreadSanitizer build), KeychainStore is unavailable")
  endif()
endif()
target_include_directories(nodetool_account PUBLIC include)
target_link_libraries(nodetool_account
  PUBLIC Threads::Threads
  PRIVATE nlohmann_json::nlohmann_json)
if(WIN32)
  target_link_libraries(nodetool_account PRIVATE ws2_32)
endif()

# The tests build only when this is the top-level project.
if(PROJECT_IS_TOP_LEVEL)
  enable_testing()
  if(NODETOOL_ACCOUNT_SANITIZE)
    add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
    add_link_options(-fsanitize=address,undefined)
  endif()
  if(NODETOOL_ACCOUNT_TSAN)
    add_compile_options(-fsanitize=thread)
    add_link_options(-fsanitize=thread)
  endif()
  # Hashing, the files, the lock, the record and the sign-in pieces.
  add_executable(account_unit_tests tests/unit.cpp)
  target_link_libraries(account_unit_tests PRIVATE nodetool_account)
  target_include_directories(account_unit_tests PRIVATE tests)
  add_test(NAME account_unit_tests COMMAND account_unit_tests)
  # TC1, TC4, TC7 and TC16 to TC18 against a fake token server and an
  # in-memory keychain, with two sessions standing in for the two apps.
  add_executable(account_session_tests tests/session.cpp)
  target_link_libraries(account_session_tests PRIVATE nodetool_account)
  target_include_directories(account_session_tests PRIVATE tests)
  add_test(NAME account_session_tests COMMAND account_session_tests)
  # The request layer, the token endpoint over HTTP, the local store client
  # and the saved-state rule, TC9 among them.
  add_executable(account_cloud_tests tests/cloud.cpp)
  target_link_libraries(account_cloud_tests PRIVATE nodetool_account nlohmann_json::nlohmann_json)
  target_include_directories(account_cloud_tests PRIVATE tests)
  add_test(NAME account_cloud_tests COMMAND account_cloud_tests)
  # The transfer client of Publish and Synchronize and its review sheet
  # (WP2.8), against a fake bundled server.
  add_executable(account_transfer_tests tests/transfer.cpp)
  target_link_libraries(account_transfer_tests PRIVATE nodetool_account nlohmann_json::nlohmann_json)
  target_include_directories(account_transfer_tests PRIVATE tests)
  add_test(NAME account_transfer_tests COMMAND account_transfer_tests)
  # The managed policy file, TC91's policy half.
  add_executable(account_policy_tests tests/policy.cpp)
  target_link_libraries(account_policy_tests PRIVATE nodetool_account)
  target_include_directories(account_policy_tests PRIVATE tests)
  add_test(NAME account_policy_tests COMMAND account_policy_tests)
  # The platform keychain store against the real credential store. It
  # passes without checking anything when no store answers, and says so.
  add_executable(account_keychain_tests tests/keychain.cpp)
  target_link_libraries(account_keychain_tests PRIVATE nodetool_account)
  target_include_directories(account_keychain_tests PRIVATE tests)
  add_test(NAME account_keychain_tests COMMAND account_keychain_tests)
endif()

# After the sanitizer options above, so the Qt tests build with them too.
if(NODETOOL_ACCOUNT_QT)
  add_subdirectory(qt)
endif()
