---
layout: page
title: "RunPod Workflow Testing Guide"
---



This guide explains how to test your deployed NodeTool workflows on RunPod serverless infrastructure using the
integrated CLI commands. See [`nodetool test-runpod`](cli.md#nodetool-test-runpod) for the full command reference.

## Prerequisites

1. **Deployed Workflow**: You must have already deployed a workflow using `nodetool deploy` (see the [Deployment Guide](deployment.md)).
1. **RunPod API Key**: Get this from your [RunPod account settings](https://www.runpod.io/console/user/settings)
1. **Endpoint ID**: This is returned when you deploy your workflow with `nodetool deploy`

**Note**: When deploying workflows, Docker images are built with `--platform linux/amd64` to ensure compatibility with
RunPod's Linux servers. This may take longer on ARM-based systems (Apple Silicon) due to cross-platform emulation.

**Template Management**: The deployment script automatically deletes existing RunPod templates with the same name before
creating new ones.

## Quick Start

### 1. Basic Test with No Parameters

Test a workflow that doesn't require specific input parameters:

```bash
nodetool test-runpod --endpoint-id YOUR_ENDPOINT_ID
```

### 2. Test with Inline Parameters

Pass parameters directly via command line:

```bash
nodetool test-runpod \
  --endpoint-id YOUR_ENDPOINT_ID \
  --params-json '{"text": "Hello World", "count": 3}'
```

### 3. Test with Parameter File

Create a JSON file with your parameters and reference it:

```bash
nodetool test-runpod \
  --endpoint-id YOUR_ENDPOINT_ID \
  --params examples/test_params_basic.json
```

### 4. Test with Custom Timeout and Output

```bash
nodetool test-runpod \
  --endpoint-id YOUR_ENDPOINT_ID \
  --timeout 120 \
  --output my_results.json
```

## Environment Setup

Set your RunPod API key as an environment variable:

```bash
export RUNPOD_API_KEY="your-api-key-here"
```

Or pass it directly:

```bash
nodetool test-runpod \
  --endpoint-id YOUR_ENDPOINT_ID \
  --api-key YOUR_API_KEY
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
| `--endpoint-id` | RunPod endpoint ID (required) | `--endpoint-id abc123def456`       |
| `--api-key`     | RunPod API key                | `--api-key your-key-here`          |
| `--params`      | JSON file with parameters     | `--params test_params.json`        |
| `--params-json` | Inline JSON parameters        | `--params-json '{"key": "value"}'` |
| `--output`      | Output file for results       | `--output results.json`            |
| `--timeout`     | Timeout in seconds            | `--timeout 120`                    |

## Understanding Results

### Successful Execution

```
🧪 Testing RunPod workflow...
Endpoint ID: abc123def456
Parameters: {
  "text": "Hello World"
}
Timeout: 60 seconds
🚀 Starting workflow execution...
Job status: IN_QUEUE
Job status: IN_PROGRESS (elapsed: 1s)
Job status: IN_PROGRESS (elapsed: 2s)
Job status: COMPLETED (elapsed: 3s)
✅ Job completed successfully!
Execution completed in 3 seconds

📊 Job Results:
{
  "id": "12345-67890-abcdef",
  "status": "COMPLETED",
  "output": {
    "result": "Hello World processed successfully",
    "output_url": "https://temp-bucket.s3.amazonaws.com/result.jpg"
  }
}

💾 Results saved to: runpod_result_20241220_143022.json
✅ Test completed successfully!
```

### Error Handling

The script handles various error scenarios:

- **Authentication failures**: Invalid API key
- **Network issues**: Connection timeouts
- **Workflow errors**: Runtime failures in your workflow
- **Timeouts**: Jobs that take too long to complete

## Troubleshooting

### Common Issues

1. **401 Unauthorized**

   - Check your RunPod API key
   - Verify the key has access to the endpoint

1. **404 Not Found**

   - Verify the endpoint ID is correct
   - Check that the endpoint is still active

1. **Timeout**

   - Increase timeout with `--timeout 120`
   - Check RunPod console for endpoint status

1. **Workflow Errors**

   - Review the error details in the output
   - Check that your workflow parameters match what the workflow expects

1. **Platform/Architecture Issues**

   - On Apple Silicon Macs: Docker build may be slower due to `--platform linux/amd64` emulation
   - If build fails with platform errors, ensure Docker Desktop has cross-platform builds enabled
     - For faster builds on ARM systems, consider using a cloud build service or Linux AMD64 machine
   - Advanced users can override platform with `--platform` flag, but `linux/amd64` is required for RunPod

### Debugging Tips

1. **Use shorter timeouts for debugging**:

   ```bash
   nodetool test-runpod --endpoint-id YOUR_ID --timeout 30
   ```

1. **Save results for analysis**:

   ```bash
   nodetool test-runpod --endpoint-id YOUR_ID --output debug_results.json
   ```

1. **Check the RunPod console**:

   - Visit [RunPod Serverless Console](https://www.runpod.io/console/serverless)
   - Monitor your endpoint logs and metrics

## Advanced Usage

### Automated Testing

Create a test script that runs multiple test cases:

```bash
#!/bin/bash
ENDPOINT_ID="your-endpoint-id"

echo "Testing basic parameters..."
nodetool test-runpod --endpoint-id $ENDPOINT_ID --params examples/test_params_basic.json

echo "Testing image generation..."
nodetool test-runpod --endpoint-id $ENDPOINT_ID --params examples/test_params_image.json

echo "Testing with custom output..."
nodetool test-runpod --endpoint-id $ENDPOINT_ID --params custom_params.json --output custom_results.json
```

For more information, see:

- [RunPod Serverless Documentation](https://docs.runpod.io/serverless/overview)
- [NodeTool Documentation](https://docs.nodetool.ai/)
