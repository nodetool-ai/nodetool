import re
import subprocess
from pathlib import Path


def update_version_in_file(
    file_path: Path, regex: str, new_version: str, count: int = 1
):
    content = file_path.read_text()
    updated_content = re.sub(regex, new_version, content, count=count)
    file_path.write_text(updated_content)


def update_version_in_pyproject(new_version: str):
    pyproject_file = Path("pyproject.toml")
    version_regex = r'version = ".*?"'
    new_version_line = f'version = "{new_version}"'
    update_version_in_file(pyproject_file, version_regex, new_version_line)


def update_version_in_package_json(new_version: str):
    package_json_file = Path("web/package.json")
    version_regex = r'"version": ".*?"'
    new_version_line = f'"version": "{new_version}"'
    update_version_in_file(package_json_file, version_regex, new_version_line)


def update_version_in_constants_ts(new_version: str):
    constants_file = Path("web/src/config/constants.ts")
    version_regex = r'export const VERSION = ".*?"'
    new_version_line = f'export const VERSION = "{new_version}"'
    update_version_in_file(constants_file, version_regex, new_version_line)


def update_version_in_electron_index(new_version: str):
    index_js_file = Path("electron/index.js")
    version_regex = r'VERSION = ".*?"'
    new_version_line = f'VERSION = "{new_version}"'
    update_version_in_file(index_js_file, version_regex, new_version_line)


def update_version_in_electron_package_json(new_version: str):
    package_json_file = Path("electron/package.json")
    version_regex = r'"version": ".*?"'
    new_version_line = f'"version": "{new_version}"'
    update_version_in_file(package_json_file, version_regex, new_version_line)


def git_commit_and_tag(new_version: str):
    print(
        subprocess.run(
            [
                "git",
                "add",
                "pyproject.toml",
                "poetry.lock",
                "web/package.json",
                "web/src/config/constants.ts",
                "electron/index.js",
                "electron/package.json",
            ],
            check=True,
            capture_output=True,
        ).stdout.decode()
    )
    commands = [
        ["git", "commit", "-m", f"Release version {new_version}"],
        ["git", "tag", "-f", f"v{new_version}"],
        ["git", "push"],
        ["git", "push", "origin", "-f", f"v{new_version}"],
    ]
    for command in commands:
        print(subprocess.run(command, check=True, capture_output=True).stderr.decode())


def run_poetry_lock():
    subprocess.run(
        [
            "poetry",
            "lock",
        ],
        check=True,
    )


def main():
    new_version = input("Enter the new version: ").strip()

    update_version_in_pyproject(new_version)
    update_version_in_package_json(new_version)
    update_version_in_constants_ts(new_version)
    update_version_in_electron_index(new_version)
    update_version_in_electron_package_json(new_version)
    # run_poetry_lock()
    git_commit_and_tag(new_version)
    print(f"Version {new_version} released successfully.")


if __name__ == "__main__":
    main()
