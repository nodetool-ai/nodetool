#include "Schema.h"
#include "EmbeddedSchemas.h"
#include <unordered_map>
#include <cmath>
#include <fstream>
#include <regex>
namespace nodetool::game {
namespace {
thread_local std::function<void()> cancellationCheck;
thread_local unsigned recoveryDepth = 0;
}
void setCancellationCheck(std::function<void()> check) { cancellationCheck = std::move(check); }
void checkCancellation() { if (recoveryDepth == 0 && cancellationCheck) { cancellationCheck(); } }
CancellationRecoveryScope::CancellationRecoveryScope() noexcept { ++recoveryDepth; }
CancellationRecoveryScope::~CancellationRecoveryScope() { --recoveryDepth; }
namespace {
[[noreturn]] void invalid(const std::string& path, const std::string& message) {
    throw Error("validation_error", message, path);
}
Json normalize(const Json& root, const Json& schema, Json value, const std::string& path, int depth) {
    checkCancellation();
    if (depth > 128) { invalid(path, "JSON nesting exceeds 128 levels"); }
    if (schema.is_boolean()) {
        if (!schema.get<bool>()) { invalid(path, "Value is forbidden"); }
        return value;
    }
    if (schema.contains("$ref")) {
        const auto reference = schema.at("$ref").get<std::string>();
        if (!reference.starts_with("#/")) { invalid(path, "Only local schema references are supported"); }
        return normalize(root, root.at(Json::json_pointer(reference.substr(1))), std::move(value), path, depth + 1);
    }
    for (const auto* key : {"anyOf", "oneOf"}) {
        if (schema.contains(key)) {
            int matches = 0;
            Json result;
            for (const auto& branch : schema.at(key)) {
                try { result = normalize(root, branch, value, path, depth + 1); ++matches; }
                catch (const Error& error) { if (error.code == "cancelled") { throw; } }
            }
            if (matches == 0 || (std::string(key) == "oneOf" && matches != 1)) { invalid(path, "Value does not match schema alternatives"); }
            return result;
        }
    }
    if (schema.contains("const") && value != schema.at("const")) { invalid(path, "Unexpected constant"); }
    if (schema.contains("enum")) {
        bool found = false;
        for (const auto& option : schema.at("enum")) { found = found || value == option; }
        if (!found) { invalid(path, "Unexpected enumeration value"); }
    }
    if (schema.contains("type")) {
        const auto type = schema.at("type").get<std::string>();
        const bool matches = (type == "object" && value.is_object()) || (type == "array" && value.is_array()) ||
            (type == "string" && value.is_string()) || (type == "boolean" && value.is_boolean()) ||
            (type == "null" && value.is_null()) || (type == "number" && value.is_number()) ||
            (type == "integer" && value.is_number() && std::isfinite(value.get<double>()) && std::floor(value.get<double>()) == value.get<double>());
        if (!matches) { invalid(path, "Expected " + type); }
    }
    if (value.is_number()) {
        const double number = value.get<double>();
        if (!std::isfinite(number)) { invalid(path, "Number must be finite"); }
        if (schema.contains("minimum") && number < schema.at("minimum").get<double>()) { invalid(path, "Number below minimum"); }
        if (schema.contains("maximum") && number > schema.at("maximum").get<double>()) { invalid(path, "Number above maximum"); }
        if (schema.contains("exclusiveMinimum") && number <= schema.at("exclusiveMinimum").get<double>()) { invalid(path, "Number must exceed exclusive minimum"); }
        if (schema.contains("exclusiveMaximum") && number >= schema.at("exclusiveMaximum").get<double>()) { invalid(path, "Number must be below exclusive maximum"); }
    }
    if (value.is_string()) {
        const auto text = value.get<std::string>();
        // Match the canonical Zod contract, which counts UTF-16 code units.
        std::size_t length = 0;
        for (const auto c : text) { if ((static_cast<unsigned char>(c) & 0xc0) != 0x80) { length += static_cast<unsigned char>(c) >= 0xf0 ? 2 : 1; } }
        if (schema.contains("minLength") && length < schema.at("minLength").get<std::size_t>()) { invalid(path, "String too short"); }
        if (schema.contains("maxLength") && length > schema.at("maxLength").get<std::size_t>()) { invalid(path, "String too long"); }
        if (schema.contains("pattern")) {
            static thread_local std::unordered_map<std::string, std::regex> patterns;
            const auto pattern = schema.at("pattern").get<std::string>();
            auto [found, inserted] = patterns.try_emplace(pattern, pattern); (void)inserted;
            if (!std::regex_search(text, found->second)) { invalid(path, "String does not match pattern"); }
        }
    }
    if (value.is_array()) {
        if (schema.contains("minItems") && value.size() < schema.at("minItems").get<std::size_t>()) { invalid(path, "Array too short"); }
        if (schema.contains("maxItems") && value.size() > schema.at("maxItems").get<std::size_t>()) { invalid(path, "Array too long"); }
        for (std::size_t i = 0; i < value.size(); ++i) {
            const auto childPath = path + "/" + std::to_string(i);
            if (schema.contains("prefixItems") && i < schema.at("prefixItems").size()) { value[i] = normalize(root, schema.at("prefixItems")[i], value[i], childPath, depth + 1); }
            else if (schema.contains("items")) { value[i] = normalize(root, schema.at("items"), value[i], childPath, depth + 1); }
        }
    }
    if (value.is_object()) {
        const auto properties = schema.value("properties", Json::object());
        for (auto it = properties.begin(); it != properties.end(); ++it) {
            if (!value.contains(it.key()) && it.value().contains("default")) { value[it.key()] = it.value().at("default"); }
        }
        for (const auto& required : schema.value("required", Json::array())) {
            const auto name = required.get<std::string>();
            if (!value.contains(name)) { invalid(path + "/" + name, "Required field missing"); }
        }
        for (auto it = value.begin(); it != value.end(); ++it) {
            const auto childPath = path + "/" + it.key();
            if (schema.contains("propertyNames")) { normalize(root, schema.at("propertyNames"), it.key(), childPath, depth + 1); }
            if (properties.contains(it.key())) { it.value() = normalize(root, properties.at(it.key()), it.value(), childPath, depth + 1); }
            else if (schema.contains("additionalProperties")) { it.value() = normalize(root, schema.at("additionalProperties"), it.value(), childPath, depth + 1); }
        }
    }
    return value;
}

}
Json normalizeSchema(const Json& schema, Json value) { return normalize(schema, schema, std::move(value), "", 0); }
const Json& documentSchema() { static const auto schema = Json::parse(EmbeddedDocumentSchema); return schema; }
const Json& transactionSchema(const std::string& dimension) {
    static const auto schema = Json::parse(EmbeddedTransactionSchema);
    static const auto schema2d = Json::parse(EmbeddedTransaction2DSchema);
    return dimension == "2d" ? schema2d : schema;
}
}
