#pragma once
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <functional>
#include <string>
namespace nodetool::game {
using Json = nlohmann::json;
struct Error : std::runtime_error {
    std::string code;
    std::string path;
    Json details=Json::object();
    Error(std::string code, std::string message, std::string path = "")
        : std::runtime_error(std::move(message)), code(std::move(code)), path(std::move(path)) {}
};
void setCancellationCheck(std::function<void()> check);
void checkCancellation();
class CancellationRecoveryScope {
public:
    CancellationRecoveryScope() noexcept;
    ~CancellationRecoveryScope();
    CancellationRecoveryScope(const CancellationRecoveryScope&) = delete;
    CancellationRecoveryScope& operator=(const CancellationRecoveryScope&) = delete;
};
Json normalizeSchema(const Json& schema, Json value);
const Json& documentSchema();
const Json& transactionSchema(const std::string& dimension = "3d");
}
