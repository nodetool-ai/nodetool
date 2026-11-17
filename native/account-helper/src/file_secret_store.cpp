#include "file_secret_store.h"

#include "nodetool/account/crypto.h"

namespace nodetool::account_helper {

std::filesystem::path FileSecretStore::itemPath(std::string_view service, std::string_view account) const {
  std::string key(service);
  key.push_back('/');
  key.append(account);
  const account::Sha256Digest digest = account::sha256(key);
  return dir_ / (account::hexEncode(digest.data(), digest.size()) + ".item");
}

std::optional<std::string> FileSecretStore::read(std::string_view service, std::string_view account) {
  return account::readWholeFile(itemPath(service, account));
}

bool FileSecretStore::write(std::string_view service, std::string_view account, std::string_view value) {
  std::error_code ec;
  std::filesystem::create_directories(dir_, ec);
  return account::writeFileAtomically(itemPath(service, account), value);
}

void FileSecretStore::remove(std::string_view service, std::string_view account) {
  std::error_code ec;
  std::filesystem::remove(itemPath(service, account), ec);
}

} // namespace nodetool::account_helper
