import json
import yaml
import subprocess
from platform import system, machine

"""Resolve conda environment.yaml and create platform/arch specific environment file."""
platform = system().lower()
arch = machine().lower()

# Normalize architecture
if arch == "amd64":
    arch = "x64"
if arch == "x86_64":
    arch = "x64"
if arch == "aarch64":
    arch = "arm64"

# Read the base environment.yaml
env_file = "environment.yaml"
resolved_env_file = f"environment-{platform}-{arch}.yaml"

original_env_data = yaml.safe_load(open(env_file))

# Run conda env create with --dry-run and --json
process = subprocess.run(
    ["conda", "env", "create", "-f", str(env_file), "--dry-run", "--json"],
    capture_output=True,
    text=True,
)

if process.returncode != 0:
    print(process.stdout)
    print(process.stderr)
    raise Exception(f"Failed to resolve environment: {process.stderr}")

# Parse the JSON output
try:
    env_data = json.loads(process.stdout)
    print(env_data)

    yaml_data = {
        "name": "nodetool",
        "channels": env_data["channels"],
        "dependencies": env_data["dependencies"],
    }
    # find pip dependencies
    for dep in original_env_data["dependencies"]:
        if isinstance(dep, dict):
            if "pip" in dep:
                yaml_data["dependencies"].append(dep)

except json.JSONDecodeError as e:
    raise Exception(f"Failed to parse conda JSON output: {e}")

# Write the resolved environment file
with open(resolved_env_file, "w") as f:
    yaml.dump(yaml_data, f)

print(f"Created resolved environment file: {resolved_env_file}")
