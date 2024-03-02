import os
import sys


def add_apache_license_notice(directory: str, project_name: str) -> None:
    apache_license_notice: str = f"""# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Copyright (c) {project_name}"""

    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".py"):
                file_path = os.path.join(root, file)
                with open(file_path, "r+", encoding="utf-8") as f:
                    content = f.read()
                    f.seek(0, 0)
                    f.write(apache_license_notice + "\n\n" + content)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python add_apache_license_notice.py <directory> <project_name>")
        sys.exit(1)

    directory = sys.argv[1]
    project_name = sys.argv[2]
    add_apache_license_notice(directory, project_name)
