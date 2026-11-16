// The managed policy (WP1.9): reading the JSON policy, the origin rule, and
// TC91's policy half, where a policy that allows one server refuses another.
#include "nodetool/account/policy.h"
#include "test_support.h"

#include <fstream>

namespace {

using namespace nodetool::account;
using account_test::TempDir;
using account_test::TestContext;

void normalizesOrigins(TestContext& t) {
  CHECK(normalizeOrigin("https://NodeTool.Example.com/") == "https://nodetool.example.com");
  CHECK(normalizeOrigin("https://nodetool.example.com:443") == "https://nodetool.example.com");
  CHECK(normalizeOrigin("http://localhost:80") == "http://localhost");
  CHECK(normalizeOrigin("http://127.0.0.1:7777") == "http://127.0.0.1:7777");
  CHECK(normalizeOrigin("https://host.example:8443") == "https://host.example:8443");
  CHECK(normalizeOrigin("ftp://host.example").empty());
  CHECK(normalizeOrigin("host.example").empty());
  CHECK(normalizeOrigin("https://host.example/path").empty());
  CHECK(normalizeOrigin("https://user@host.example").empty());
  CHECK(normalizeOrigin("https://").empty());
  CHECK(normalizeOrigin("https://:443").empty());
}

void noPolicyAllowsEverything(TestContext& t) {
  TempDir dir;
  const ManagedPolicy policy = readPolicyFile(dir.path() / "policy.json");
  CHECK(!policy.present);
  CHECK(checkServer(policy, "https://any.example").decision == PolicyDecision::Allowed);
}

void readsBothKeys(TestContext& t) {
  const ManagedPolicy policy =
      parsePolicyJson(R"({"CloudEnabled": true, "AllowedServers": ["https://NT.example.com/"], "Other": 1})");
  CHECK(policy.present);
  CHECK(policy.cloudEnabled);
  CHECK(policy.error.empty());
  CHECK(policy.allowedServers == std::vector<std::string>{"https://nt.example.com"});
}

// TC91, the policy half: one server is allowed, and another is refused with
// the reason.
void tc91AllowsOneServer(TestContext& t) {
  TempDir dir;
  const auto path = dir.path() / "policy.json";
  std::ofstream(path) << R"({"AllowedServers": ["https://nt.example.com"]})";
  const ManagedPolicy policy = readPolicyFile(path);
  CHECK(checkServer(policy, "https://nt.example.com").decision == PolicyDecision::Allowed);
  CHECK(checkServer(policy, "https://NT.example.com:443/").decision == PolicyDecision::Allowed);
  const PolicyCheck other = checkServer(policy, "https://api.nodetool.ai");
  CHECK(other.decision == PolicyDecision::ServerNotAllowed);
  CHECK(other.reason.find("https://nt.example.com") != std::string::npos);
  CHECK(checkServer(policy, "not an origin").decision == PolicyDecision::ServerNotAllowed);
}

void cloudOffRefusesEveryServer(TestContext& t) {
  const ManagedPolicy policy = parsePolicyJson(R"({"CloudEnabled": false, "AllowedServers": ["https://nt.example.com"]})");
  const PolicyCheck check = checkServer(policy, "https://nt.example.com");
  CHECK(check.decision == PolicyDecision::CloudOff);
  CHECK(!check.reason.empty());
}

// A policy that exists and cannot be read closes the cloud features.
void unreadablePolicyTurnsCloudOff(TestContext& t) {
  for (const char* text : {"", "not json", "[]", R"({"CloudEnabled": "yes"})", R"({"AllowedServers": "https://a.example"})",
                           R"({"AllowedServers": [1]})", R"({"AllowedServers": ["a.example"]})"}) {
    const ManagedPolicy policy = parsePolicyJson(text);
    CHECK(policy.present);
    CHECK(!policy.cloudEnabled);
    CHECK(!policy.error.empty());
    const PolicyCheck check = checkServer(policy, "https://a.example");
    CHECK(check.decision == PolicyDecision::CloudOff);
    CHECK(check.reason.find(policy.error) != std::string::npos);
  }
}

} // namespace

int main() {
  return account_test::runTests({
      {"normalizesOrigins", normalizesOrigins},
      {"noPolicyAllowsEverything", noPolicyAllowsEverything},
      {"readsBothKeys", readsBothKeys},
      {"tc91AllowsOneServer", tc91AllowsOneServer},
      {"cloudOffRefusesEveryServer", cloudOffRefusesEveryServer},
      {"unreadablePolicyTurnsCloudOff", unreadablePolicyTurnsCloudOff},
  });
}
