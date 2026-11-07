#include <vector>

int main(int argc, char**) {
    const std::vector<int> values{42};
    return values[static_cast<std::size_t>(argc)];  // Deliberate unchecked operator[].
}
