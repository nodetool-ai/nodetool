import os
import sys


def add_gplv3_notice(
    directory: str, collective_name: str, github_repo_url: str
) -> None:
    gplv3_notice: str = f"""# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
# Copyright (c) {collective_name}
# Project Repository: {github_repo_url}
"""

    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".py"):
                file_path = os.path.join(root, file)
                with open(file_path, "r+", encoding="utf-8") as f:
                    content = f.read()
                    f.seek(0, 0)
                    f.write(gplv3_notice + "\n" + content)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(
            "Usage: python add_gplv3_notice.py <directory> <collective_name> <github_repo_url>"
        )
        sys.exit(1)

    directory = sys.argv[1]
    collective_name = sys.argv[2]
    github_repo_url = sys.argv[3]
    add_gplv3_notice(directory, collective_name, github_repo_url)
