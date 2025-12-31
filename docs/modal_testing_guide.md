---
layout: page
title: "Modal Workflow Testing Guide"
---



This guide explains how to test your deployed NodeTool workflows on Modal serverless infrastructure using the
integrated CLI commands. See [`nodetool test-modal`](cli.md#nodetool-test-modal) for the full command reference.

## Prerequisites

1. **Deployed Workflow**: You must have already deployed a workflow using `nodetool deploy` (see the [Deployment Guide](deployment.md#modal-deployments)).
1. **Modal CLI**: Install and authenticate with `pip install modal && modal token new`
1. **App URL**: This is returned when you deploy your workflow with `nodetool deploy apply`

## Quick Start

### 1. Basic Test with No Parameters

Test a workflow that doesn't require specific input parameters:

```bash
nodetool test-modal --app-url https://your-app.modal.run
```

### 2. Test with Inline Parameters

Pass parameters directly via command line:

```bash
nodetool test-modal \
  --app-url https://your-app.modal.run \
  --params-json '{"text": "Hello World", "count": 3}'
```

### 3. Test with Parameter File

Create a JSON file with your parameters and reference it:

```bash
nodetool test-modal \
  --app-url https://your-app.modal.run \
  --params examples/test_params_basic.json
```

### 4. Test with Custom Timeout and Output

```bash
nodetool test-modal \
  --app-url https://your-app.modal.run \
  --timeout 120 \
  --output my_results.json
```

## Environment Setup

Set your authentication token as an environment variable:

```bash
export WORKER_AUTH_TOKEN="your-token-here"
```

Or pass it directly:

```bash
nodetool test-modal \
  --app-url https://your-app.modal.run \
  --auth-token YOUR_TOKEN
```

## Parameter Examples

### Basic Workflow Parameters

For simple workflows (see `examples/test_params_basic.json`):

```json
{
  "text": "Hello, NodeTool workflow!",
  "count": 5,
  "enabled": true
}
```

### Image Generation Parameters

For image generation workflows (see `examples/test_params_image.json`):

```json
{
  "prompt": "A beautiful sunset over a mountain landscape, digital art",
  "width": 512,
  "height": 512,
  "num_inference_steps": 20,
  "guidance_scale": 7.5,
  "seed": 42
}
```

### Complex Workflow Parameters

For workflows with multiple inputs:

```json
{
  "image_url": "https://example.com/image.jpg",
  "text_input": "Analyze this image",
  "options": {
    "temperature": 0.7,
    "max_tokens": 150
  },
  "output_format": "json"
}
```

## Command Line Options

| Option          | Description                   | Example                            |
| --------------- | ----------------------------- | ---------------------------------- |
| `--app-url`     | Modal app URL (required)      | `--app-url https://app.modal.run`  |
| `--auth-token`  | Authentication token          | `--auth-token your-token-here`     |
| `--params`      | JSON file with parameters     | `--params test_params.json`        |
| `--params-json` | Inline JSON parameters        | `--params-json '{"key": "value"}'` |
| `--output`      | Output file for results       | `--output results.json`            |
| `--timeout`     | Timeout in seconds            | `--timeout 120`                    |
| `--workflow-id` | Specific workflow to test     | `--workflow-id abc123`             |

## Understanding Results

### Successful Execution

```
🧪 Testing Modal workflow...
App URL: https://your-app.modal.run
Parameters: {
  "text": "Hello World"
}
Timeout: 60 seconds
🚀 Starting workflow execution...
Job status: PENDING
Job status: RUNNING (elapsed: 1s)
Job status: RUNNING (elapsed: 2s)
Job status: COMPLETED (elapsed: 3s)
✅ Job completed successfully!
Execution completed in 3 seconds

📊 Job Results:
{
  "id": "12345-67890-abcdef",
  "status": "COMPLETED",
  "output": {
    "result": "Hello World processed successfully",
    "output_url": "https://storage.modal.com/result.jpg"
  }
}

💾 Results saved to: modal_result_20241220_143022.json
✅ Test completed successfully!
```

### Error Handling

The script handles various error scenarios:

- **Authentication failures**: Invalid or missing auth token
- **Network issues**: Connection timeouts
- **Cold start delays**: First request may take longer
- **Workflow errors**: Runtime failures in your workflow
- **Timeouts**: Jobs that take too long to complete

## Modal-Specific Features

### Cold Start Behavior

Modal containers may experience cold starts when:
- No warm containers are available (`min_containers: 0`)
- Scaling up to handle increased load
- After container idle timeout

**Tips for faster cold starts:**
- Set `min_containers: 1` for always-warm containers
- Use smaller container images
- Pre-load models in container startup

### GPU Selection

Test with different GPU types to optimize cost/performance:

```bash
# A10G - Good balance of cost and performance
nodetool deploy apply my-modal --gpu a10g

# T4 - Most cost-effective for inference
nodetool deploy apply my-modal --gpu t4

# A100 - Maximum performance for large models
nodetool deploy apply my-modal --gpu a100-40gb
```

### Streaming Responses

Modal supports streaming for real-time output:

```bash
curl -N -H "Authorization: Bearer $WORKER_AUTH_TOKEN" \
  -X POST "https://your-app.modal.run/api/workflows/<workflow_id>/run?stream=true" \
  -d '{"params":{}}'
```

### Viewing Logs

Use Modal's dashboard or CLI for detailed logs:

```bash
# Via nodetool
nodetool deploy logs my-modal --follow

# Via Modal CLI directly
modal app logs your-app-name
```

## Troubleshooting

### Common Issues

1. **401 Unauthorized**

   - Check your `WORKER_AUTH_TOKEN`
   - Verify the token matches what's configured in Modal secrets

1. **404 Not Found**

   - Verify the app URL is correct
   - Check that the app is deployed: `modal app list`

1. **Timeout / Cold Start**

   - Increase timeout with `--timeout 300`
   - Check Modal dashboard for container status
   - Consider setting `min_containers: 1` for warm containers

1. **GPU Memory Errors**

   - Reduce batch sizes in your workflow
   - Use a GPU with more VRAM
   - Check for memory leaks in long-running workflows

1. **Workflow Errors**

   - Review the error details in the output
   - Check Modal logs: `modal app logs your-app-name`
   - Verify workflow parameters match expected inputs

### Debugging Tips

1. **Check container status**:

   ```bash
   modal app list
   nodetool deploy status my-modal
   ```

1. **View detailed logs**:

   ```bash
   nodetool deploy logs my-modal --follow
   ```

1. **Test health endpoint**:

   ```bash
   curl https://your-app.modal.run/health
   ```

1. **Save results for analysis**:

   ```bash
   nodetool test-modal --app-url https://your-app.modal.run --output debug_results.json
   ```

1. **Test with minimal parameters**:

   ```bash
   nodetool test-modal --app-url https://your-app.modal.run --params-json '{}'
   ```

## Cost Optimization

### Scale-to-Zero

Configure `min_containers: 0` for development to avoid idle costs:

```yaml
my-modal-dev:
  type: modal
  min_containers: 0
  container_idle_timeout: 60
```

### Right-Size GPUs

| Use Case | Recommended GPU | Cost Tier |
|----------|-----------------|-----------|
| Development/Testing | T4 | $ |
| Production Inference | A10G or L4 | $$ |
| Large Models | A100-40GB | $$$ |
| Maximum Performance | H100 | $$$$ |

### Batch Processing

For multiple workflow runs, batch requests to maximize container utilization:

```bash
#!/bin/bash
APP_URL="https://your-app.modal.run"

for params_file in inputs/*.json; do
  nodetool test-modal --app-url $APP_URL --params $params_file &
done
wait
```

## Advanced Usage

### Automated Testing

Create a test script that runs multiple test cases:

```bash
#!/bin/bash
APP_URL="https://your-app.modal.run"

echo "Testing basic parameters..."
nodetool test-modal --app-url $APP_URL --params examples/test_params_basic.json

echo "Testing image generation..."
nodetool test-modal --app-url $APP_URL --params examples/test_params_image.json

echo "Testing with custom output..."
nodetool test-modal --app-url $APP_URL --params custom_params.json --output custom_results.json
```

### CI/CD Integration

Add Modal testing to your CI pipeline:

```yaml
# .github/workflows/test-modal.yml
name: Test Modal Deployment
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install modal nodetool
          modal token set --token-id ${{ secrets.MODAL_TOKEN_ID }} --token-secret ${{ secrets.MODAL_TOKEN_SECRET }}
      
      - name: Test workflow
        env:
          WORKER_AUTH_TOKEN: ${{ secrets.WORKER_AUTH_TOKEN }}
        run: |
          nodetool test-modal \
            --app-url ${{ vars.MODAL_APP_URL }} \
            --params tests/test_params.json \
            --timeout 300
```

### Load Testing

Test your deployment under load:

```bash
#!/bin/bash
APP_URL="https://your-app.modal.run"
CONCURRENT=10
REQUESTS=100

for i in $(seq 1 $REQUESTS); do
  if [ $((i % CONCURRENT)) -eq 0 ]; then
    wait
  fi
  nodetool test-modal --app-url $APP_URL --params test.json &
done
wait
```

For more information, see:

- [Modal Documentation](https://modal.com/docs)
- [Modal GPU Reference](https://modal.com/docs/guide/gpu)
- [Modal Secrets Management](https://modal.com/docs/guide/secrets)
- [NodeTool Documentation](https://docs.nodetool.ai/)
- [Deployment Guide](deployment.md#modal-deployments)
