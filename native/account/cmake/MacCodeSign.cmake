# Local macOS development signing for native binaries that read the macOS
# Keychain (`ai.nodetool.native`). Linker ad-hoc signatures pin the login
# keychain ACL to the binary's CDHash, so every rebuild invalidates "Always
# Allow". Signing bare local binaries with a stable certificate (such as an
# installed Apple Development identity) gives a certificate-based designated
# requirement that persists across rebuilds.
#
# Skipped for packaged `.app` bundles (`NT_MACOS_BUNDLE=ON`, signed by the
# packaging and release scripts) and on CI (`ENV{CI}`). Set
# `-DNODETOOL_MACOS_DEV_SIGN_IDENTITY=OFF` to disable, or pass a specific
# certificate name or SHA-1 hash.
if(APPLE)
  if(DEFINED ENV{CI})
    set(_nt_default_dev_sign "OFF")
  else()
    set(_nt_default_dev_sign "AUTO")
  endif()
  set(NODETOOL_MACOS_DEV_SIGN_IDENTITY "${_nt_default_dev_sign}" CACHE STRING
      "macOS code-signing identity for local dev builds (AUTO, OFF, or identity name/hash)")
endif()

function(nodetool_macos_dev_sign target identifier)
  if(NOT APPLE)
    return()
  endif()
  if(NT_MACOS_BUNDLE)
    return()
  endif()
  set(_identity "${NODETOOL_MACOS_DEV_SIGN_IDENTITY}")
  string(TOUPPER "${_identity}" _identity_upper)
  if(NOT _identity OR _identity_upper STREQUAL "OFF" OR _identity_upper STREQUAL "FALSE" OR _identity_upper STREQUAL "NONE")
    return()
  endif()
  if(_identity_upper STREQUAL "AUTO")
    execute_process(
      COMMAND security find-identity -v -p codesigning
      OUTPUT_VARIABLE _identities
      ERROR_QUIET
      RESULT_VARIABLE _rc)
    set(_identity "")
    if(_rc EQUAL 0)
      string(REGEX MATCH "([0-9A-Fa-f]+) \"Apple Development:[^\"]+\"" _match "${_identities}")
      if(CMAKE_MATCH_1)
        string(LENGTH "${CMAKE_MATCH_1}" _hash_len)
        if(_hash_len EQUAL 40)
          set(_identity "${CMAKE_MATCH_1}")
        endif()
      endif()
    endif()
    if(NOT _identity)
      message(STATUS "nodetool_macos_dev_sign(${target}): no Apple Development identity found; keeping ad-hoc signature")
      return()
    endif()
  endif()
  message(STATUS "nodetool_macos_dev_sign(${target}): signing with ${_identity} (${identifier})")
  add_custom_command(TARGET ${target} POST_BUILD
    COMMAND codesign --force --sign "${_identity}" --identifier "${identifier}" "$<TARGET_FILE:${target}>"
    COMMENT "Signing ${target} (${identifier})"
    VERBATIM)
endfunction()
