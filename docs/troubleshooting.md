---
layout: page
title: "Troubleshooting Guide"
description: "Systematic approaches to debugging and fixing common NodeTool workflow issues."
---

This guide provides step-by-step troubleshooting for common NodeTool issues. Use the table of contents to jump to your specific problem.

---

## Quick Diagnostic Checklist

When a workflow isn't working as expected, work through this checklist systematically:

- [ ] **Check node connections** – Are all required inputs connected?
- [ ] **Verify data types** – Do output types match input requirements?
- [ ] **Inspect Preview nodes** – What do intermediate results show?
- [ ] **Review error messages** – Click failed nodes to see error details
- [ ] **Check model availability** – Are required models installed/configured?
- [ ] **Verify file paths** – Do referenced files exist and have correct permissions?
- [ ] **Check API keys** – Are cloud provider credentials configured in Settings?
- [ ] **Review logs** – Check console/terminal for detailed error messages

---

## Common Issues & Solutions

### Issue: "My workflow is stuck or very slow"

#### Symptoms
- Progress bar doesn't move
- No output after several minutes
- CPU/GPU usage is low
- Browser/app becomes unresponsive

#### Diagnostic Steps

1. **Check Preview nodes** – Add Preview nodes after each major step to identify where execution stalls
2. **Review node status** – Look at node border colors:
   - **Gray** = Not started
   - **Yellow** = Running
   - **Green** = Completed
   - **Red** = Failed
3. **Inspect system resources** – Open Task Manager (Windows) or Activity Monitor (macOS) to check:
   - CPU usage
   - RAM usage
   - GPU utilization
   - Disk I/O

#### Common Causes & Fixes

**Cause 1: Model not downloaded**
- **Fix:** Open **Models → Model Manager** and install the required model
- **Prevention:** Always install models before running workflows that use them

**Cause 2: Large file processing**
- **Fix:** Use batch processing or chunk data into smaller pieces
- **Example:** Split large PDFs before indexing

**Cause 3: Insufficient memory**
- **Symptoms:** Workflow crashes or hangs at specific nodes
- **Fix:** 
  - Close other applications
  - Reduce batch size
  - Use smaller/quantized models (e.g., Q4 instead of Q8)
  - Increase system swap/page file

**Cause 4: Network timeout (cloud models)**
- **Fix:** Check internet connection, verify API keys, increase timeout settings
- **Alternative:** Switch to local models for offline operation

**Cause 5: Infinite loop in workflow**
- **Symptoms:** Workflow never completes, continuously processes
- **Fix:** Review workflow logic for circular dependencies
- **Note:** NodeTool prevents circular connections but complex conditional logic can create infinite loops

---

### Issue: "Node shows error: Type mismatch"

#### Symptoms
- Red connection lines between nodes
- Error message: "Cannot connect [Type A] to [Type B]"
- Workflow won't run

#### Diagnostic Steps

1. **Hover over connection** – Tooltip shows expected vs actual types
2. **Check node documentation** – Click node and read input/output type requirements
3. **Use Preview nodes** – Verify what data type is actually being produced

#### Common Causes & Fixes

**Cause 1: Wrong data type**
- **Example:** Connecting `List[String]` to a node expecting `String`
- **Fix:** Add conversion node (e.g., `GetElement` to extract single item from list)

**Cause 2: Null/empty output**
- **Example:** Previous node returned null, next node expects data
- **Fix:** Add validation or default value nodes

**Cause 3: Image format mismatch**
- **Example:** Node outputs PIL image, next expects Tensor
- **Fix:** Use appropriate conversion nodes (usually automatic)

#### Type Conversion Quick Reference

| From Type | To Type | Solution Node |
|-----------|---------|---------------|
| `List[T]` | `T` | `GetElement` or `SelectElements` |
| `String` | `List[String]` | `Split` or wrap in `[string]` |
| `Image` | `Tensor` | Automatic in most cases |
| `Audio` | `AudioSegment` | Automatic conversion |
| `Path` | `String` | `PathToString` |
| `Dict` | `String` | `DictToJson` or `FormatText` |

---

### Issue: "LLM generates poor quality results"

#### Symptoms
- Irrelevant responses
- Hallucinations or factually incorrect outputs
- Repetitive text
- Incomplete responses

#### Diagnostic Steps

1. **Check prompt template** – Review prompt in `FormatText` or `Agent` nodes
2. **Verify model selection** – Ensure appropriate model for task
3. **Test with different temperature** – Adjust creativity vs accuracy tradeoff
4. **Add examples** – Provide few-shot examples in prompt
5. **Use Preview nodes** – Inspect intermediate reasoning steps

#### Common Causes & Fixes

**Cause 1: Vague or ambiguous prompt**
- **Fix:** Be specific and explicit in instructions
- **Bad:** "Summarize this"
- **Good:** "Summarize this document in 3 bullet points, focusing on action items"

**Cause 2: Wrong model for task**
- **Fix:** Match model to task:
  - **Creative writing** → Higher parameter models (13B+)
  - **Factual Q&A** → Models fine-tuned for chat/instruct
  - **Code generation** → Code-specialized models
  - **Fast prototyping** → Smaller models (7B) for iteration

**Cause 3: Temperature too high/low**
- **Fix:** Adjust temperature setting:
  - **0.0-0.3** → Deterministic, factual (Q&A, extraction)
  - **0.5-0.7** → Balanced (general chat)
  - **0.8-1.2** → Creative (story writing, brainstorming)

**Cause 4: Context window exceeded**
- **Symptoms:** Truncated responses, "forgot" earlier context
- **Fix:** 
  - Reduce input length
  - Use RAG to retrieve relevant snippets instead of full documents
  - Switch to model with larger context window

**Cause 5: Missing retrieval context (RAG workflows)**
- **Fix:** 
  - Verify vector database is populated
  - Increase number of retrieved documents
  - Check hybrid search parameters
  - Ensure embeddings are generated correctly

---

### Issue: "RAG workflow returns irrelevant documents"

#### Symptoms
- Retrieved documents don't match query
- Low relevance scores
- Answers don't address question

#### Diagnostic Steps

1. **Check collection status** – Verify documents are indexed in ChromaDB/FAISS
2. **Inspect embeddings** – Use Preview nodes to see what's being embedded
3. **Test search directly** – Run search node separately with known queries
4. **Review chunk size** – Check if documents are split appropriately

#### Common Causes & Fixes

**Cause 1: Documents not indexed**
- **Fix:** Run indexing workflow first (see [Index PDFs example](workflows/index-pdfs.md))
- **Verify:** Check collection count, should match number of chunks

**Cause 2: Poor chunking strategy**
- **Symptoms:** Retrieved text is too short/long or cuts off mid-sentence
- **Fix:** 
  - Use `SentenceSplitter` for semantic chunking
  - Adjust chunk size (typical: 500-1000 tokens)
  - Add overlap between chunks (typical: 50-100 tokens)

**Cause 3: Embedding model mismatch**
- **Fix:** Use same embedding model for indexing and retrieval
- **Example:** If you indexed with `text-embedding-ada-002`, query with the same

**Cause 4: Query too vague**
- **Fix:** Reformulate queries to be more specific
- **Technique:** Use LLM to expand/rephrase query before search

**Cause 5: Low top_k value**
- **Fix:** Increase number of retrieved documents (try 5-10 initially)
- **Tradeoff:** More documents = better recall but slower inference

---

### Issue: "Deployment fails or service won't start"

#### Symptoms
- `nodetool deploy apply` fails with errors
- Container exits immediately
- Health check fails
- 503 Service Unavailable

#### Diagnostic Steps

1. **Check deployment logs** – `nodetool deploy logs <name>`
2. **Verify configuration** – Review `deployment.yaml` for typos/errors
3. **Test locally first** – Ensure workflow runs in desktop app
4. **Check resource limits** – Verify target has enough CPU/RAM/GPU
5. **Verify credentials** – Ensure API keys and tokens are set

#### Common Causes & Fixes

**Cause 1: Invalid deployment.yaml**
- **Fix:** Validate configuration with `nodetool deploy plan <name>`
- **Check:** Required fields (type, image, host for self-hosted)

**Cause 2: Missing environment variables**
- **Fix:** Add required vars to `env` section:
  ```yaml
  env:
    PORT: "8000"
    DB_PATH: "/workspace/nodetool.db"
    HF_HOME: "/hf-cache"
  ```

**Cause 3: Volume mount errors (self-hosted)**
- **Symptoms:** Container logs show "Permission denied" or "No such file"
- **Fix:** 
  - Verify host paths exist
  - Check permissions (user running Docker must have access)
  - Use absolute paths

**Cause 4: Docker not running (self-hosted)**
- **Fix:** Start Docker daemon: `sudo systemctl start docker`

**Cause 5: Port conflicts**
- **Symptoms:** "Port already in use" error
- **Fix:** 
  - Change `container.port` in deployment.yaml
  - Stop conflicting service: `docker ps` to find, `docker stop <id>`

**Cause 6: Image not found**
- **Fix:** Build image first: `docker build -t nodetool:latest .`
- **Verify:** `docker images | grep nodetool`

**Cause 7: RunPod/Cloud Run credential issues**
- **Fix:** 
  - **RunPod:** Set `RUNPOD_API_KEY` environment variable
  - **Cloud Run:** Authenticate with `gcloud auth login`

---

### Issue: "Preview node shows empty or null output"

#### Symptoms
- Preview panel is blank
- Shows "null" or "undefined"
- No error message

#### Diagnostic Steps

1. **Check upstream nodes** – Work backwards to find where data is lost
2. **Add intermediate Previews** – Place Preview after each node to narrow down issue
3. **Review node errors** – Even if node appears green, check for warnings
4. **Inspect connections** – Ensure correct output is connected to correct input

#### Common Causes & Fixes

**Cause 1: Node failed silently**
- **Fix:** Check node logs/console for hidden errors
- **Example:** API call returned 404 but node didn't show error

**Cause 2: Conditional logic filtered out data**
- **Fix:** Review filter conditions, adjust criteria
- **Example:** `Filter` node removed all items

**Cause 3: Async timing issue**
- **Fix:** Ensure upstream nodes complete before downstream starts
- **Note:** NodeTool handles this automatically, but custom nodes may have issues

**Cause 4: Path/file doesn't exist**
- **Fix:** Verify file paths, use absolute paths
- **Check:** File permissions, spelling, case-sensitivity (Linux/macOS)

---

## Performance Optimization

### Workflow runs slowly

**Diagnosis:** Profile with Preview nodes to identify bottlenecks

**Optimization strategies:**

1. **Use local models for fast tasks**
   - Example: Local Whisper for transcription instead of API
   - Benefit: No network latency

2. **Batch processing**
   - Process multiple items together
   - Use nodes like `Extend` or `Collect` to batch operations

3. **Parallel execution**
   - Split workflow into independent branches
   - NodeTool automatically parallelizes non-dependent nodes

4. **Cache results**
   - Save intermediate outputs to files
   - Reuse across workflow runs
   - Use `SaveText`, `SaveImage`, etc.

5. **Right-size models**
   - Don't use GPT-4 when GPT-3.5 suffices
   - Use quantized models (Q4) for faster inference
   - Balance quality vs speed

6. **Optimize chunking**
   - Smaller chunks = faster processing but may lose context
   - Larger chunks = slower but better context
   - Typical sweet spot: 500-1000 tokens

### High memory usage

**Diagnosis:** Monitor system resources during workflow execution

**Fixes:**

1. **Use smaller models** – Switch to quantized versions (Q4 instead of FP16)
2. **Process in batches** – Don't load all data into memory at once
3. **Clear caches** – Restart NodeTool periodically to clear accumulated memory
4. **Close Preview panels** – Preview nodes keep data in memory for display
5. **Limit parallel execution** – Reduce concurrent node execution

---

## Debugging Techniques

### Using Preview Nodes Effectively

**Strategy:** Add Preview nodes after every major transformation

**Example workflow:**
```
Input → Preview(1) → Transform → Preview(2) → LLM → Preview(3) → Output
```

**Benefits:**
- See exact data at each step
- Identify where data is corrupted/lost
- Verify transformations are correct
- Understand intermediate results

### Enable Verbose Logging

**Desktop app:**
1. Open **Settings → Advanced**
2. Enable **Debug Logging**
3. Check console/logs for detailed messages

**CLI/Server:**
```bash
nodetool serve --log-level debug
```

### Isolate Problem Nodes

**Strategy:** Test nodes individually

1. Create new workflow with just the problem node
2. Provide known good inputs
3. Verify outputs
4. If works in isolation, issue is with upstream data

### Use Reproducible Inputs

**Strategy:** Save test inputs as files

1. Create `test-inputs/` folder
2. Save sample images, text, audio
3. Use `FileInput` nodes for consistent testing
4. Share test cases with teammates

---

## Getting Help

### Before Asking for Help

1. **Try troubleshooting steps above** – Most issues are common and covered here
2. **Check error messages carefully** – Error text often contains the solution
3. **Search documentation** – Use site search or browse [Glossary](glossary.md)
4. **Review example workflows** – See if similar workflow exists in [Examples](workflows/)

### Where to Get Help

- **Discord Community** – [Join here](https://discord.gg/WmQTWZRcYE) for real-time help
- **GitHub Issues** – [Report bugs](https://github.com/nodetool-ai/nodetool/issues) or request features
- **Documentation** – Browse [all docs](index.md) for comprehensive guides

### How to Ask Effectively

Include these details when asking for help:

1. **NodeTool version** – From **Help → About**
2. **Operating system** – macOS/Windows/Linux + version
3. **Workflow description** – What you're trying to do
4. **Error message** – Full text, not just "it doesn't work"
5. **Steps to reproduce** – Exact sequence that causes the issue
6. **Screenshots** – Especially of error messages or unexpected behavior
7. **Workflow file** – Export workflow JSON if possible

**Good question example:**
> I'm running NodeTool 1.5.0 on macOS 14.1. When I try to run the Chat with Docs workflow (attached JSON), I get error "Collection not found: docs". I've already run the Index PDFs workflow successfully and can see the collection in ChromaDB. Screenshots attached.

**Poor question example:**
> Chat with docs doesn't work, help!

---

## Related Documentation

- [Getting Started](getting-started.md) – Basics of running workflows
- [Workflow Editor](workflow-editor.md) – Using the visual editor
- [Key Concepts](key-concepts.md) – Understanding nodes and connections
- [Deployment Guide](deployment.md) – Production deployment troubleshooting
- [Self-Hosted Deployment](self_hosted.md) – Self-hosted specific issues
