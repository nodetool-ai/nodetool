cask "nodetool" do
  arch arm: "arm64", intel: "x64"

  version "@VERSION@"
  sha256 arm:   "@SHA256_ARM64@",
         intel: "@SHA256_X64@"

  url "https://github.com/nodetool-ai/nodetool/releases/download/v#{version}/Nodetool-#{version}-#{arch}.dmg"
  name "NodeTool"
  desc "Visual builder for AI workflows and agents"
  homepage "https://nodetool.ai/"

  # Release candidates are published as GitHub's latest release, so match
  # plain X.Y.Z tags instead of using the latest release.
  livecheck do
    url :url
    regex(/^v?(\d+(?:\.\d+)+)$/i)
    strategy :github_releases
  end

  auto_updates true
  depends_on macos: :monterey

  app "Nodetool.app"

  zap trash: [
    "~/.cache/nodetool",
    "~/.config/nodetool",
    "~/.local/share/nodetool",
    "~/Library/Application Support/nodetool-electron",
    "~/Library/Caches/ai.nodetool.NodeTool",
    "~/Library/Caches/ai.nodetool.NodeTool.ShipIt",
    "~/Library/Caches/nodetool-updater",
    "~/Library/HTTPStorages/ai.nodetool.NodeTool",
    "~/Library/Preferences/ai.nodetool.NodeTool.plist",
    "~/Library/Saved Application State/ai.nodetool.NodeTool.savedState",
  ]
end
