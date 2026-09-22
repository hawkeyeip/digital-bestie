#!/bin/zsh
# ═══════════════════════════════════════════════════════════
# Hawkeye Intelligence — Unified Stack Launcher
# ═══════════════════════════════════════════════════════════
#
# Boots the complete agentic infrastructure:
#   1. Ollama local inference backend
#   2. nomic-embed-text embedding model warmup
#   3. Docker containers (Qdrant vector DB + n8n orchestration)
#   4. FastMCP headless browser server (SSE on port 8080)
#
# Usage: ./launch_hawkeye_stack.sh
# ═══════════════════════════════════════════════════════════

set -euo pipefail

# Resolve the directory this script lives in (handles symlinks)
SCRIPT_DIR="${0:A:h}"
WORKSPACE_DIR="$HOME/Downloads/Hawkeye_Agent_Workspace"

# ANSI color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo "${CYAN}  Hawkeye Intelligence — Agentic Stack Initializer${NC}"
echo "${CYAN}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

# ─────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────

echo "${YELLOW}[*] Running pre-flight checks...${NC}"

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "${RED}[!] Docker is not installed or not in PATH.${NC}"
    echo "    Install Docker Desktop for Mac: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check Docker daemon is running
if ! docker info &> /dev/null 2>&1; then
    echo "${RED}[!] Docker daemon is not running. Start Docker Desktop first.${NC}"
    exit 1
fi

# Check for Ollama
if ! command -v ollama &> /dev/null; then
    echo "${RED}[!] Ollama is not installed or not in PATH.${NC}"
    echo "    Install from: https://ollama.com/download"
    exit 1
fi

# Check for uv
if ! command -v uv &> /dev/null; then
    echo "${RED}[!] uv is not installed or not in PATH.${NC}"
    echo "    Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Ensure workspace directory exists
mkdir -p "$WORKSPACE_DIR"
mkdir -p "$WORKSPACE_DIR/telemetry"

echo "${GREEN}[+] All pre-flight checks passed.${NC}"
echo ""

# ─────────────────────────────────────────────
# 1. Start Ollama backend
# ─────────────────────────────────────────────

echo "${YELLOW}[1/4] Starting Ollama inference backend...${NC}"

# Check if Ollama is already serving
if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "${GREEN}  -> Ollama is already running.${NC}"
else
    OLLAMA_HOST=127.0.0.1:11434 ollama serve > /tmp/ollama.log 2>&1 &
    OLLAMA_PID=$!
    echo "  -> Ollama started (PID: $OLLAMA_PID). Waiting for readiness..."

    # Wait for Ollama to be ready (up to 15 seconds)
    for i in {1..15}; do
        if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "${GREEN}  -> Ollama is ready.${NC}"
            break
        fi
        sleep 1
        if [ "$i" -eq 15 ]; then
            echo "${RED}  [!] Ollama failed to start within 15 seconds. Check /tmp/ollama.log${NC}"
            exit 1
        fi
    done
fi

# ─────────────────────────────────────────────
# 2. Warm up the embedding model
# ─────────────────────────────────────────────

echo ""
echo "${YELLOW}[2/4] Ensuring nomic-embed-text embedding model is loaded...${NC}"

# Check if model is available, pull if not
if ! ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
    echo "  -> Model not found locally. Pulling nomic-embed-text..."
    ollama pull nomic-embed-text
fi

# Warm up: send a trivial request to load the model into memory
curl -sf http://localhost:11434/api/generate \
    -d '{"model": "nomic-embed-text", "prompt": "init", "keep_alive": "5m"}' \
    > /dev/null 2>&1

echo "${GREEN}  -> nomic-embed-text is loaded and cached in memory.${NC}"

# ─────────────────────────────────────────────
# 3. Boot Docker containers (Qdrant + n8n)
# ─────────────────────────────────────────────

echo ""
echo "${YELLOW}[3/4] Starting Docker containers (Qdrant + n8n)...${NC}"

docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

# Wait for Qdrant to be healthy
echo "  -> Waiting for Qdrant readiness..."
for i in {1..20}; do
    if curl -sf http://localhost:6333/healthz > /dev/null 2>&1; then
        echo "${GREEN}  -> Qdrant is ready (port 6333).${NC}"
        break
    fi
    sleep 1
    if [ "$i" -eq 20 ]; then
        echo "${YELLOW}  [!] Qdrant may still be starting. Check: docker logs qdrant_local${NC}"
    fi
done

# Wait for n8n to be healthy
echo "  -> Waiting for n8n readiness..."
for i in {1..20}; do
    if curl -sf http://localhost:5678/healthz > /dev/null 2>&1; then
        echo "${GREEN}  -> n8n is ready (port 5678).${NC}"
        break
    fi
    sleep 1
    if [ "$i" -eq 20 ]; then
        echo "${YELLOW}  [!] n8n may still be starting. Check: docker logs n8n_local${NC}"
    fi
done

# ─────────────────────────────────────────────
# 4. Start FastMCP Headless Execution Node
# ─────────────────────────────────────────────

echo ""
echo "${YELLOW}[4/4] Starting FastMCP Headless Browser Server (SSE on port 8080)...${NC}"

# Kill any existing FastMCP process on port 8080
if lsof -ti:8080 > /dev/null 2>&1; then
    echo "  -> Killing existing process on port 8080..."
    kill $(lsof -ti:8080) 2>/dev/null || true
    sleep 1
fi

cd "$SCRIPT_DIR"
uv run mcp_server.py --transport sse --port 8080 > /tmp/fastmcp.log 2>&1 &
FASTMCP_PID=$!

# Verify FastMCP started
sleep 3
if kill -0 $FASTMCP_PID 2>/dev/null; then
    echo "${GREEN}  -> FastMCP server started (PID: $FASTMCP_PID).${NC}"
else
    echo "${RED}  [!] FastMCP server failed to start. Check /tmp/fastmcp.log${NC}"
    exit 1
fi

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────

echo ""
echo "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo "${GREEN}  All systems nominal.${NC}"
echo ""
echo "  ${CYAN}Ollama API:${NC}     http://localhost:11434"
echo "  ${CYAN}Qdrant REST:${NC}    http://localhost:6333"
echo "  ${CYAN}Qdrant gRPC:${NC}    http://localhost:6334"
echo "  ${CYAN}n8n Dashboard:${NC}  http://localhost:5678"
echo "  ${CYAN}FastMCP SSE:${NC}    http://localhost:8080"
echo ""
echo "  ${CYAN}Workspace:${NC}      $WORKSPACE_DIR"
echo "  ${CYAN}Telemetry:${NC}      $WORKSPACE_DIR/telemetry"
echo "  ${CYAN}Memory DB:${NC}      $WORKSPACE_DIR/episodic_memory.db"
echo ""
echo "  ${CYAN}Logs:${NC}"
echo "    Ollama:   /tmp/ollama.log"
echo "    FastMCP:  /tmp/fastmcp.log"
echo "${CYAN}═══════════════════════════════════════════════════════${NC}"
