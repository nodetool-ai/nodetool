#pragma once
#include <utility>

namespace nodetool::node_editor {

// Stores `value` in `field` and reports whether it changed, so a setter emits
// its NOTIFY signal only on a change.
template <typename T, typename U>
bool assign(T &field, U &&value) {
    if (field == value) {
        return false;
    }
    field = std::forward<U>(value);
    return true;
}

}  // namespace nodetool::node_editor
