from nodetool.api.server import create_app

app = create_app(static_folder="web/dist")
