#pragma once

#include <QtGlobal>

#include <optional>
#include <utility>

// Returns the value of a test fixture's optional, or aborts the test binary
// with `what` when it is empty. QVERIFY cannot guard a later dereference in
// clang-tidy's flow analysis, so fixtures read optionals through this.
template <typename T>
T& requireValue(std::optional<T>& value, const char* what = "optional")
{
    if (!value) {
        qFatal("%s is empty", what);
    }
    return *value;
}

template <typename T>
const T& requireValue(const std::optional<T>& value, const char* what = "optional")
{
    if (!value) {
        qFatal("%s is empty", what);
    }
    return *value;
}

template <typename T>
T requireValue(std::optional<T>&& value, const char* what = "optional")
{
    if (!value) {
        qFatal("%s is empty", what);
    }
    return std::move(*value);
}
