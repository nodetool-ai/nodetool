---
layout: page
title: "Deployment Journeys"
---



## Self-hosted with Proxy

1. **Clone and install**

   ```bash
   git clone https://github.com/nodetool-ai/nodetool-core.git
   cd nodetool-core
   pip install -e .
   pip install -r requirements-dev.txt
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.development.local
   echo \"AUTH_PROVIDER=static\" >> .env.development.local
   echo \"WORKER_AUTH_TOKEN=$(openssl rand -base64 32)\" >> .env.development.local
   ```

3. **Start services**

   ```bash
   nodetool serve --reload
   ```

4. **Add proxy (TLS + auth)**
   - Terminate TLS at your proxy (nginx/traefik); forward to `127.0.0.1:8000`.
   - Expose `/health` and `/ping` without auth; require Bearer tokens elsewhere.
5. **Verify health**

   ```bash
   curl https://your-domain/health
   curl -H \"Authorization: Bearer $WORKER_AUTH_TOKEN\" https://your-domain/v1/models
   ```

6. **Run a workflow remotely**

   ```bash
   curl -H \"Authorization: Bearer $WORKER_AUTH_TOKEN\" \\
     -X POST https://your-domain/api/workflows/<workflow_id>/run?stream=true \\
     -d '{\"params\":{}}'
   ```

## RunPod Serverless

1. **Package and upload** — create an image or use the provided RunPod template (see `docker/`).
2. **Set secrets** — in RunPod console set `WORKER_AUTH_TOKEN`, provider keys, and `AUTH_PROVIDER=static`.
3. **Deploy endpoint** — note the endpoint ID and base URL.
4. **Verify health**

   ```bash
   curl https://api.runpod.ai/v2/<endpoint>/health
   ```

5. **List models and chat**

   ```bash
   curl -H \"Authorization: Bearer $RUNPOD_API_KEY\" https://api.runpod.ai/v2/<endpoint>/v1/models
   curl -H \"Authorization: Bearer $RUNPOD_API_KEY\" \\
     -H \"Content-Type: application/json\" \\
     -X POST https://api.runpod.ai/v2/<endpoint>/v1/chat/completions \\
     -d '{\"model\":\"gpt-oss:20b\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":true}'
   ```

6. **Run workflow**

   ```bash
   curl -H \"Authorization: Bearer $RUNPOD_API_KEY\" \\
     -X POST \"https://api.runpod.ai/v2/<endpoint>/api/workflows/<workflow_id>/run?stream=true\" \\
     -d '{\"params\":{}}'
   ```

## Cloud Run

1. **Build image**

   ```bash
   gcloud builds submit --tag gcr.io/<project>/nodetool:latest .
   ```

2. **Deploy**

   ```bash
   gcloud run deploy nodetool \\
     --image gcr.io/<project>/nodetool:latest \\
     --allow-unauthenticated=false \\
     --port 8000 \\
     --set-env-vars AUTH_PROVIDER=static,WORKER_AUTH_TOKEN=$(openssl rand -base64 32)
   ```

3. **Set secrets**
   - Store provider keys in Secret Manager and mount as env vars.
   - Disable terminal WebSocket via `NODETOOL_ENABLE_TERMINAL_WS=` (empty).
4. **Verify**

   ```bash
   curl https://<service-url>/health
   curl -H \"Authorization: Bearer $WORKER_AUTH_TOKEN\" https://<service-url>/v1/models
   ```

5. **Run workflow**

   ```bash
   curl -H \"Authorization: Bearer $WORKER_AUTH_TOKEN\" \\
     -X POST \"https://<service-url>/api/workflows/<workflow_id>/run?stream=true\" \\
     -d '{\"params\":{}}'
   ```

## Related Guides

- [Security Hardening](security-hardening.md)
- [Proxy Reference](proxy.md)
- [RunPod Testing Guide](runpod_testing_guide.md)
- [CLI Reference](cli.md)
