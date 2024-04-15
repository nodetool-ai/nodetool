import sys
import anthropic
import os
import dotenv

dotenv.load_dotenv()


def get_files(folder):
    files = []
    for file in os.listdir(folder):
        if file.endswith(".py"):
            files.append(os.path.join(folder, file))
    return files


def get_content(*folders):
    content = ""
    for folder in folders:
        for file in get_files(folder):
            content += "\n\n"
            content += f"## {file}\n\n"
            with open(file, "r", encoding="utf-8") as f:
                content += f.read()
    return content


folder = sys.argv[1]
system_prompt = sys.argv[2]
combined = get_content(folder)

print(system_prompt)

print("Number of characters in the combined content:", len(combined))

client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-3-haiku-20240307",
    max_tokens=4000,
    temperature=0.7,
    system=system_prompt,
    messages=[
        {
            "role": "user",
            "content": [{"type": "text", "text": combined}],
        },
    ],
)

for m in message.content:
    print(m.text)
