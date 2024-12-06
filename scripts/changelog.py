import subprocess
import os
import requests
from datetime import datetime, timedelta
import anthropic
import dotenv

dotenv.load_dotenv()

# Anthropic API key
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")


# Function to get git log
def get_git_log(since_date):
    cmd = f"git log --since='{since_date}' --pretty=format:'%h - %s (%an, %ad)' --date=short"
    return subprocess.check_output(cmd, shell=True).decode("utf-8")


# Function to read existing CHANGELOG.md
def read_changelog():
    if os.path.exists("CHANGELOG.md"):
        with open("CHANGELOG.md", "r") as f:
            return f.read()
    return ""


# Function to write updated CHANGELOG.md
def write_changelog(content):
    with open("CHANGELOG.md", "w") as f:
        f.write(content)


# Function to get the last date from CHANGELOG.md
def get_last_changelog_date(changelog):
    lines = changelog.split("\n")
    for line in lines:
        if line.startswith("## "):
            try:
                return datetime.strptime(line.split(" ")[1], "%Y-%m-%d")
            except ValueError:
                continue
    return None


# Function to update CHANGELOG using Anthropic API
def update_changelog_with_anthropic(git_log, existing_changelog):
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    system_prompt = f"""
    You are a helpful assistant that creates and updates CHANGELOG.md files.
    """

    prompt = f"""
    Here's the existing CHANGELOG.md content:

    {existing_changelog}

    And here's the new git log entries:

    {git_log}

    Please update the CHANGELOG.md with the following rules:
    1. Add a new section with today's date if it doesn't exist.
    2. Summarize and categorize the new changes under the new section.
    3. Don't duplicate any existing entries.
    4. Keep the existing content intact.
    5. Use Markdown formatting.

    Output the entire updated CHANGELOG.md content.
    """

    message = client.messages.create(
        model="claude-3-5-sonnet-20240620",
        max_tokens=4000,
        temperature=1.0,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": [{"type": "text", "text": prompt}],
            },
        ],
    )

    for m in message.content:
        if isinstance(m, anthropic.types.text_block.TextBlock):
            return m.text


# Main function
def main():
    existing_changelog = read_changelog()
    last_date = get_last_changelog_date(existing_changelog)

    if last_date:
        since_date = last_date.strftime("%Y-%m-%d")
    else:
        since_date = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d")

    git_log = get_git_log(since_date)

    if git_log:
        updated_changelog = update_changelog_with_anthropic(git_log, existing_changelog)
        write_changelog(updated_changelog)
        print("CHANGELOG.md has been updated.")
    else:
        print("No new changes to add to the CHANGELOG.")


if __name__ == "__main__":
    main()
