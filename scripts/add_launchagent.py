import os
from pathlib import Path
import subprocess


def setup_launchagent():
    # Define paths
    home_dir = str(Path.home())
    launch_agent_dir = os.path.join(home_dir, "Library", "LaunchAgents")
    plist_file = os.path.join(launch_agent_dir, "com.example.filewatcher.plist")
    watched_folder = os.path.join(home_dir, "papers")
    script_file = os.path.join(home_dir, "file_watcher_script.sh")
    log_file = os.path.join(home_dir, "test.log")

    # Ensure LaunchAgents directory exists
    os.makedirs(launch_agent_dir, exist_ok=True)

    # Create the shell script
    script_content = f"""#!/bin/bash
echo "File added to {watched_folder} at $(date)" >> {log_file}
"""
    with open(script_file, "w") as f:
        f.write(script_content)
    os.chmod(script_file, 0o755)  # Make the script executable

    # Create the .plist file
    plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.example.filewatcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>{script_file}</string>
    </array>
    <key>WatchPaths</key>
    <array>
        <string>{watched_folder}</string>
    </array>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
"""
    with open(plist_file, "w") as f:
        f.write(plist_content)

    # Load the LaunchAgent
    try:
        subprocess.run(["launchctl", "unload", plist_file], check=True)
    except subprocess.CalledProcessError:
        # Ignore if it wasn't loaded before
        pass
    subprocess.run(["launchctl", "load", plist_file], check=True)

    print(
        f"LaunchAgent installed and watching {watched_folder}. Script writes to {log_file}."
    )


if __name__ == "__main__":
    setup_launchagent()
