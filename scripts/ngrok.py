from pyngrok import ngrok
import dotenv
import os

dotenv.load_dotenv()

token = os.getenv("NGROK_TOKEN")

if not token:
    print("no token")
    exit(0)

# run ngrok to expose http port 8000 and return the public url
# Optionally set your ngrok token if you haven't done so globally
ngrok.set_auth_token(token)

# Establish a tunnel to port 8000 (HTTP by default)
tunnel = ngrok.connect("localhost:8000")

# Retrieve the public URL where the tunnel is accessible
assert tunnel.public_url, "No public url found"

api_url = tunnel.public_url + "/api"
print(f'ngrok tunnel from "{api_url}" to "localhost:8000"')
