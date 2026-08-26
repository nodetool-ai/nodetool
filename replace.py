import re

with open('docs/tutorials.md', 'r') as f:
    content = f.read()

# Replace the intro
content = re.sub(
    r'description: "Short video walkthroughs.*?"\n---',
    'description: "Short video guides for NodeTool. Learn how to edit sketches, create scripts, make storyboards, build mini apps, and use nodes."\n---',
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'Short walkthroughs for people.*?New here\? \[Quick Start\]\(getting-started\.md\) explains the words used below, and\nthe \[Glossary\]\(glossary\.md\) defines them one by one\.',
    '''These short guides are for beginners. Each video shows a real example,
so you can see what to ask for and what the AI creates.

The first group shows you the quickest way to create things: just ask the AI, and it does the work.
The second group shows you how to fix mistakes, answer the AI's questions, and test your work.
The last group covers the basics of using nodes to build workflows.

New here? Read our [Quick Start](getting-started.md) to learn the basics, or check out our [Glossary](glossary.md) for definitions.''',
    content,
    flags=re.DOTALL
)

# Edit a sketch by asking
content = re.sub(
    r'Say what you want changed and the Sketch Assistant works the real layer tools:\nit adds the layer, sets how it blends with the art underneath, and dials in how\nstrong it is, while the layers panel updates beside it\.',
    'Tell the Sketch Assistant what to change, and it works like a real editor.\nIt adds layers and changes settings automatically.',
    content
)
content = re.sub(
    r"You'll see how the assistant reads the layer stack you already have, how each\nnew layer appears selected and ready, and that everything it makes stays yours\nto change by hand\.",
    'You will see how the AI reads your layers and makes new ones. You can still change everything yourself later.',
    content
)

# Write and voice a script
content = re.sub(
    r'From a blank page to voiced audio in one ask\. The Script Assistant casts the\nspeakers first, writes their lines, then records a take for each one\.',
    'Turn a blank page into spoken audio easily. The Script Assistant chooses voices,\nwrites the text, and records the lines.',
    content
)
content = re.sub(
    r"You'll see how to describe a script by length, voices, and tone, why the\nspeakers are cast before any line is written, and how every take is kept so you\ncan pick a different one\.",
    'You will learn how to describe what you want, see why voices are chosen first,\nand learn how to pick different recordings.',
    content
)

# Board a shot list
content = re.sub(
    r'## Board a shot list',
    '## Make a storyboard',
    content
)
content = re.sub(
    r'Describe the piece and the Storyboard Assistant writes the shots — framing,\ncamera move, and length — before spending anything on pictures\. Approve the\nboard and the stills render one shot at a time\.',
    'Describe your video, and the Storyboard Assistant plans the shots.\nYou can review the plan before it creates any images.',
    content
)
content = re.sub(
    r"You'll see how to get a shot list before any image exists, how to revise a shot\nwhile it is still free to change, and how the cards flip to ready as the\npictures land\.",
    'You will learn how to plan shots first, change your mind early, and watch the images load.',
    content
)

# Build a mini app
content = re.sub(
    r'Describe an app in a sentence — a box to type in, a button, an answer — and the\nApp Assistant binds a workflow behind it and places each control\.',
    'Describe a simple app in one sentence.\nThe App Assistant sets up the logic and buttons for you.',
    content
)
content = re.sub(
    r"You'll see how a workflow becomes something anyone can run without opening the\ncanvas, how a value can be saved as a setting that survives between sessions,\nand how every control is tied to something the app declares\.",
    'You will see how an app is made without writing code, how to save settings,\nand how buttons connect to logic.',
    content
)

# Write a JS script
content = re.sub(
    r'## Write a JS script',
    '## Write JavaScript code',
    content
)
content = re.sub(
    r"Say what goes in and what should come out\. The assistant declares those first —\nthey are the script's contract — then writes the body and saves a test that\ngrades it\.",
    'Tell the AI what you need the code to do.\nThe assistant sets up the rules, writes the code, and creates a test to check it.',
    content
)
content = re.sub(
    r"You'll see why the inputs and outputs come first, that the code runs sandboxed\nwith no access to your files, and how a saved case catches the next edit that\nbreaks it\.",
    'You will see why rules are made first, that the code is safe,\nand how tests prevent future errors.',
    content
)

# Correct it without starting over
content = re.sub(
    r'## Correct it without starting over',
    '## Fix mistakes easily',
    content
)
content = re.sub(
    r"The wash comes back too strong\. Saying so in the next message edits the layer\nthat is already there — you don't repeat the original request, and nothing is\ngenerated a second time\.",
    'If the result is not right, just say so in the next message.\nThe AI will fix the current layer instead of starting over.',
    content
)
content = re.sub(
    r"You'll see how a correction lands on the same layer, that the layer count never\ngrows, and where to take over and finish the adjustment yourself\.",
    "You will see how fixes apply to the same layer, so you don't get too many layers,\nand learn how to finish editing it yourself.",
    content
)

# It asks before it spends
content = re.sub(
    r'## It asks before it spends',
    '## The AI asks before doing',
    content
)
content = re.sub(
    r'The brief was vague, and the two readings of it cost different money\. So the\nassistant asks instead of guessing, and the board stays empty while you decide\.',
    'If your request is not clear, the AI will ask questions instead of guessing.\nThis saves you time and resources.',
    content
)
content = re.sub(
    r"You'll see what happens while it waits on you — nothing renders — how your\nanswer picks the shape and the count, and that the shots still arrive as plans\nyou approve before any picture is made\.",
    'You will see what happens while it waits for your answer,\nhow your answer shapes the plan, and how you approve it before images are made.',
    content
)

# A test catches it
content = re.sub(
    r'## A test catches it',
    '## Catch errors with tests',
    content
)
content = re.sub(
    r"Name the edge case you don't trust\. The assistant saves it as a test, runs it,\nand it fails in the open with the reason\. One fix later, the same tests pass\.",
    'Tell the AI what errors you are worried about.\nIt saves this as a test, runs it, and shows any failures clearly.',
    content
)
content = re.sub(
    r"You'll see why asking for the check before the fix is worth it, what a failing\nrun tells you that a summary doesn't, and how the saved case guards the script\nfrom here on\.",
    'You will see why testing first is good, learn what failing tests tell you,\nand see how tests protect your code.',
    content
)

# Ask the chat agent
content = re.sub(
    r'## Ask the chat agent',
    '## Chat with the agent',
    content
)
content = re.sub(
    r'A different part of the app: Chat\. A question goes straight to the agent, which\nsearches the web where you can watch it happen, then writes its answer back a\nfew words at a time\.',
    'You can ask the Chat agent questions. It searches the web,\nshows you its search process, and writes answers word by word.',
    content
)
content = re.sub(
    r"You'll see how to send a message from Chat, watch the agent use a tool in the\nopen rather than behind a spinner, and read the answer as it arrives\.",
    'You will learn how to use Chat, watch the agent work in real-time,\nand read answers as they arrive.',
    content
)

# Build your first workflow
content = re.sub(
    r'A complete example from start to finish: you type a short description, an AI\nrewrites it into something more detailed, and a Text To Image node turns that\ninto a picture\. No code, just connected boxes\.',
    'Learn the whole process: type a short idea, watch the AI expand it,\nand see it turn into a picture. No coding needed, just linking boxes.',
    content
)
content = re.sub(
    r"You'll see how a result passes from one box to the next, how to tell what is\nrunning \(the spinning ring, text appearing as it's written, the progress bar\),\nand where the finished picture shows up\.",
    'You will see how data moves between boxes, how to track progress,\nand where your final picture appears.',
    content
)

# Connect and run
content = re.sub(
    r'## Connect and run',
    '## Connect boxes and run',
    content
)
content = re.sub(
    r'The basic loop, one step at a time\. Add a box, draw a line from its output into\nthe next box\'s input, press Run, read the result\.',
    'Learn the basics. Add a box, connect it to another,\npress Run, and see what happens.',
    content
)
content = re.sub(
    r"You'll see what inputs and outputs are, what the small dots on the sides of a\nbox are for, how to run everything and watch each box finish, and how to display\na result in a Preview box\.",
    'You will learn about inputs and outputs, what the connection dots do,\nhow to start the process, and how to view results.',
    content
)

# Generate a list
content = re.sub(
    r'## Generate a list',
    '## Generate a list of items',
    content
)
content = re.sub(
    r'One instruction, many answers\. A single AI box turns a topic into a numbered\nlist, showing each item the moment it arrives\. This is the pattern behind\nanything that repeats a step over many items\.',
    'Give one instruction and get many results.\nAn AI box can turn a topic into a numbered list, showing items as they appear.',
    content
)
content = re.sub(
    r"You'll see how to drive an AI box from something you typed, watch a multi-item\nanswer arrive piece by piece, and pass the finished list on to the rest of the\nworkflow\.",
    'You will see how to start an AI box, watch answers arrive in parts,\nand use the list later in the process.',
    content
)

# Ask the AI
content = re.sub(
    r'## Ask the AI',
    '## Ask the AI a question',
    content
)
content = re.sub(
    r'The simplest example there is\. Type a question, send it to an AI box, and watch\nthe answer appear phrase by phrase before it lands in a Preview\.',
    'This is very simple. Type a question, send it to the AI box,\nand watch the answer write out before it finishes.',
    content
)
content = re.sub(
    r"You'll see how to feed a question into an AI box, watch the answer being\nwritten, and reuse it further along\.",
    'You will see how to send a question, watch the answer,\nand use the answer somewhere else.',
    content
)

# Combine two inputs
content = re.sub(
    r'## Combine two inputs',
    '## Combine multiple inputs',
    content
)
content = re.sub(
    r'The first example where two lines meet\. Two text boxes feed into one Format Text\nbox that drops both into a sentence template, building one result from reusable\nparts\.',
    'Learn how to connect multiple lines. You can link two text boxes into one Format Text box\nto create a combined sentence from different parts.',
    content
)
content = re.sub(
    r"You'll see how to wire several inputs into one box, how to write a template with\n`\{\{ placeholders \}\}` in it, and how to assemble instructions from parts you can\nchange independently\.",
    'You will learn how to connect several inputs, how to use `{{ placeholders }}`,\nand how to build changing instructions.',
    content
)

# Summarize a document
content = re.sub(
    r"Long text in, the key points out\. A single Summarizer box condenses an article,\na transcript, or any block of text into a short summary, writing it out as it\ngoes\. It's the same pattern the Meeting Transcript Summarizer example uses\.",
    'Turn long text into short points.\nA Summarizer box can shorten articles or transcripts, writing as it goes.',
    content
)
content = re.sub(
    r"You'll see how to feed a long passage into a Summarizer, watch the summary being\nwritten, and pass the result on\.",
    'You will see how to input long text, watch the summary write,\nand pass the final result forward.',
    content
)

# Describe an image
content = re.sub(
    r'The first example that mixes pictures and words\. Drop a photo into an Image\nInput box, wire it into an Agent, and watch the AI look at the picture and\ndescribe it\. This is how captions and alt text get generated\.',
    'Mix pictures and words together. Put a photo into an Image Input box,\nconnect it to an Agent, and watch the AI describe the photo.',
    content
)
content = re.sub(
    r"You'll see how to bring a picture into a workflow, send it to an AI that can\nsee, and reuse the description in any box that takes text\.",
    'You will see how to add pictures, let the AI see them,\nand use the description text later.',
    content
)

# Cut a scene together
content = re.sub(
    r'## Cut a scene together',
    '## Edit a video scene',
    content
)
content = re.sub(
    r'The video editor: trim a clip, drag in a second shot, add a caption that lights\nup word by word in time with the audio, then play the finished cut\.',
    'Learn the video editor: cut clips, arrange shots,\nadd captions that match the sound, and watch your video.',
    content
)
content = re.sub(
    r"You'll see how to trim and arrange clips on tracks, add a caption synced to the\naudio, and play back a cut without leaving the browser\.",
    'You will see how to cut clips, add synced captions,\nand watch the result in your browser.',
    content
)

# Final block
content = re.sub(
    r'Ready to build your own\? Start with \[Quick Start\]\(getting-started\.md\), then\nbrowse the \[Examples\]\(\{\{ \'/workflows/\' \| relative_url \}\}\)\.',
    "Ready to start? Read the [Quick Start](getting-started.md), then\nlook at the [Examples]({{ '/workflows/' | relative_url }}).",
    content
)


with open('docs/tutorials.md', 'w') as f:
    f.write(content)
