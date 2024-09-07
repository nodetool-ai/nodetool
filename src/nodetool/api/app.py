import threading
from nodetool.api.server import create_app
from nodetool.chat.help import index_documentation, index_examples

app = create_app(static_folder="web/dist")
