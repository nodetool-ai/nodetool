# MuAPI nodes for NodeTool

This package adds opt-in NodeTool nodes for MuAPI's asynchronous image and
video generation endpoints.

## Nodes

- **MuAPI Text to Image** — generate an image with the FLUX 3 image routes.
- **MuAPI Text to Video** — generate a video with the FLUX 3 text-to-video route.
- **MuAPI Image to Video** — animate an input image with the FLUX 3 image-to-video route.

The pack uses the `MUAPI_API_KEY` secret. Create a key at
<https://muapi.ai/access-keys> and add it in NodeTool's provider settings.

Requests are submitted to MuAPI, polled until completion, and downloaded with
the runtime's retry and public-HTTPS URL checks. Generation POST requests are
never retried, and no credential is included in a generated media URL.

API reference: <https://muapi.ai/docs/api-reference>
