# Hawkeye Intelligence — Agentic Stack

Local autonomous agent infrastructure for Apple Silicon M4 Max. Provides headless browser automation via FastMCP, SQLite episodic memory, Qdrant vector store, and n8n workflow orchestration.

## Quick Start

```bash
# Install dependencies
uv sync

# Install Playwright browser
uv run playwright install chromium

# Launch the full stack
./launch_hawkeye_stack.sh
```

## Architecture

| Component | Port | Purpose |
|---|---|---|
| Ollama | 11434 | Local LLM inference (Qwen 2.5 + nomic-embed-text) |
| FastMCP | 8080 | Headless browser agent server (14 tools) |
| Qdrant | 6333 | Vector database for workspace file RAG |
| n8n | 5678 | Workflow orchestration and file ingestion |

## Files

- `mcp_server.py` — Core FastMCP server (perception, execution, memory, ingestion)
- `prune_memory.py` — Weekly SQLite memory summarization via Ollama
- `docker-compose.yml` — n8n + Qdrant container orchestration
- `launch_hawkeye_stack.sh` — Unified stack bootstrapper
- `com.hawkeye.fastmcp.plist` — macOS launchd daemon for auto-start
- `n8n_workflows/` — Importable n8n workflow JSON configs
