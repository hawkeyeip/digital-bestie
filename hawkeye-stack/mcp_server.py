#!/usr/bin/env python3
"""
Hawkeye Intelligence — FastMCP Headless Browser Agent Server

Consolidated MCP server exposing 14 tools for autonomous headless browser
automation, file ingestion, and episodic SQLite memory. Designed for native
execution on Apple Silicon M4 Max with Metal GPU acceleration.

Modules consolidated into single file:
  - PerceptionTreeExtractor: CDP + JS accessibility tree extraction
  - ExtendedAgentExecutionLoop: All browser action handlers with resilient click
  - ExecutionTimeoutGuard: Async timeout wrapper for Playwright actions
  - ActionHistoryTracker: Anti-looping heuristic
  - WorkspaceFileIngestor: Sandboxed PDF/CSV/TXT reader
  - AutonomousAgentOrchestrator: Perception→Reasoning→Action loop with truncation
  - SQLite episodic memory: Log and query timestamped memory entries

Transport: stdio (default) or SSE (--transport sse --port 8080)
"""

import asyncio
import json
import os
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import pymupdf  # PyMuPDF (v2 API, replaces 'fitz')
import pandas as pd
import tiktoken
from mcp.server.mcpserver import MCPServer  # MCP SDK v2 (replaces FastMCP)
from openai import AsyncOpenAI
from playwright.async_api import (
    CDPSession,
    Error as PlaywrightError,
    Page,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)


# ═════════════════════════════════════════════════════════════
# Constants & Path Configuration
# ═════════════════════════════════════════════════════════════

HOST_DOWNLOAD_DIR = Path.home() / "Downloads" / "Hawkeye_Agent_Workspace"
HOST_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

LOG_DIR = HOST_DOWNLOAD_DIR / "telemetry"
LOG_DIR.mkdir(parents=True, exist_ok=True)

MEMORY_DB_PATH = HOST_DOWNLOAD_DIR / "episodic_memory.db"

# Tokenizer for context window budget enforcement (cl100k_base approximation)
tokenizer = tiktoken.get_encoding("cl100k_base")


# ═════════════════════════════════════════════════════════════
# SQLite Episodic Memory Initialization
# ═════════════════════════════════════════════════════════════

def init_memory_db():
    """Creates the episodic memory table if it does not already exist."""
    conn = sqlite3.connect(MEMORY_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS agent_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            topic TEXT NOT NULL,
            content TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT ''
        )
    """)
    conn.commit()
    conn.close()


init_memory_db()


# ═════════════════════════════════════════════════════════════
# Perception Layer: Accessibility Tree Extraction
# ═════════════════════════════════════════════════════════════

class PerceptionTreeExtractor:
    """
    Extracts the browser's accessibility tree and interactive DOM elements,
    resolves bounding boxes, and serializes them into a token-efficient
    tabular format for LLM consumption.
    """

    def __init__(self, page: Page):
        self.page = page
        self.client: Optional[CDPSession] = None

    async def init_session(self):
        """Initializes the Chrome DevTools Protocol session for AX tree access."""
        self.client = await self.page.context.new_cdp_session(self.page)
        await self.client.send("Accessibility.enable")
        await self.client.send("DOM.enable")

    async def get_raw_ax_tree(self) -> List[Dict[str, Any]]:
        """Returns the raw, unprocessed accessibility tree from CDP."""
        if not self.client:
            await self.init_session()
        result = await self.client.send("Accessibility.getFullAXTree")
        return result.get("nodes", [])

    async def extract_interactive_elements(self) -> List[Dict[str, Any]]:
        """
        Parses DOM elements with interactive roles, resolves bounding boxes,
        and correlates them with the AX tree. Filters out hidden, off-viewport,
        and zero-dimension nodes.
        """
        js_extractor = """
        () => {
            const interactiveRoles = new Set([
                'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
                'menuitem', 'tab', 'switch', 'searchbox', 'slider'
            ]);

            const elements = Array.from(document.querySelectorAll('*'));
            const results = [];
            let indexCounter = 0;

            for (const el of elements) {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);

                if (
                    style.display === 'none' ||
                    style.visibility === 'hidden' ||
                    style.opacity === '0' ||
                    rect.width <= 0 ||
                    rect.height <= 0
                ) {
                    continue;
                }

                const inViewport = (
                    rect.bottom >= 0 &&
                    rect.right >= 0 &&
                    rect.top <= window.innerHeight &&
                    rect.left <= window.innerWidth
                );

                if (!inViewport) continue;

                const role = el.getAttribute('role') || el.tagName.toLowerCase();
                const isFormElement = ['input', 'button', 'select', 'textarea', 'a'].includes(el.tagName.toLowerCase());
                const isClickable = el.onclick !== null || el.getAttribute('cursor') === 'pointer' || isFormElement;

                if (interactiveRoles.has(role) || isClickable) {
                    const text = el.innerText?.trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
                    results.push({
                        id: indexCounter++,
                        tag: el.tagName.toLowerCase(),
                        role: role,
                        name: text.slice(0, 80),
                        bbox: [
                            Math.round(rect.left),
                            Math.round(rect.top),
                            Math.round(rect.width),
                            Math.round(rect.height)
                        ],
                        center: [
                            Math.round(rect.left + rect.width / 2),
                            Math.round(rect.top + rect.height / 2)
                        ],
                        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
                    });
                }
            }
            return results;
        }
        """
        return await self.page.evaluate(js_extractor)

    def serialize_for_model(self, elements: List[Dict[str, Any]]) -> str:
        """
        Formats interactive elements into a dense, token-efficient tabular string.
        Format: [ID] <ROLE> "LABEL" | center=(x, y) | bbox=[x, y, w, h]
        """
        lines = []
        for el in elements:
            label = el["name"].replace("\n", " ").strip()
            state = " [DISABLED]" if el["disabled"] else ""
            line = (
                f"[{el['id']}] <{el['role']}> \"{label}\"{state} "
                f"| center={el['center']} | bbox={el['bbox']}"
            )
            lines.append(line)
        return "\n".join(lines)


# ═════════════════════════════════════════════════════════════
# Execution Timeout Guard
# ═════════════════════════════════════════════════════════════

class ExecutionTimeoutGuard:
    """
    Wraps Playwright actions in bounded timeouts and captures all
    Playwright-specific exceptions to prevent runaway executions.
    """

    def __init__(self, page: Page, default_timeout_ms: int = 15000):
        self.page = page
        self.default_timeout_ms = default_timeout_ms

    async def safe_execute(self, action_func: Callable, *args, **kwargs) -> Any:
        """Executes an action with a bounded timeout and structured error capture."""
        try:
            return await asyncio.wait_for(
                action_func(*args, **kwargs),
                timeout=self.default_timeout_ms / 1000.0
            )
        except asyncio.TimeoutError:
            return "Error: Action execution timed out. The page may be hanging."
        except PlaywrightTimeoutError:
            return "Error: Playwright selector or navigation timeout. The target may not be actionable."
        except PlaywrightError as e:
            return f"Error: Browser state anomaly. Details: {str(e)}"
        except Exception as e:
            return f"Error: Unexpected failure. Details: {str(e)}"


# ═════════════════════════════════════════════════════════════
# Execution Layer: Browser Action Handler
# ═════════════════════════════════════════════════════════════

class ExtendedAgentExecutionLoop:
    """
    Maps the model's textual action payloads to Playwright's low-level
    input APIs. Supports CLICK, TYPE, PRESS, SCROLL, NAVIGATE, and DOWNLOAD
    actions with a three-stage resilient click fallback protocol.
    """

    def __init__(self, page: Page):
        self.page = page
        self.timeout_guard = ExecutionTimeoutGuard(page)

    async def execute_action(self, action_payload: str) -> str:
        """
        Parses and executes the agent's action payload.
        Expected JSON format:
        {
          "action": "CLICK|TYPE|PRESS|SCROLL|NAVIGATE|DOWNLOAD|COMPLETE",
          "coords": [x, y],
          "value": "text input, key combination, or URL",
          "direction": "up|down"
        }
        """
        try:
            command = json.loads(action_payload)
            action_type = command.get("action", "").upper()
            coords = command.get("coords")
            value = command.get("value")

            if action_type == "CLICK":
                if not coords or len(coords) != 2:
                    return "Error: Coordinates required for CLICK [x, y]"
                return await self._resilient_click(coords[0], coords[1])

            elif action_type == "TYPE":
                return await self._handle_type(coords, value)

            elif action_type == "PRESS":
                return await self._handle_press(value)

            elif action_type == "SCROLL":
                return await self._handle_scroll(command.get("direction", "down"))

            elif action_type == "NAVIGATE":
                return await self._handle_navigation(value)

            elif action_type == "DOWNLOAD":
                return await self._handle_download(coords, value)

            elif action_type == "COMPLETE":
                return "COMPLETE"

            else:
                return f"Error: Unknown action '{action_type}'"

        except json.JSONDecodeError:
            return "Error: Invalid JSON payload."
        except Exception as e:
            return f"Execution Error: {str(e)}"

    async def _resilient_click(self, x: int, y: int) -> str:
        """
        Three-stage fallback protocol for robust click execution.
        Stage 1: Native Playwright coordinate click
        Stage 2: Forced JavaScript coordinate dispatch (bypasses overlays)
        Stage 3: Error reporting with full diagnostic context
        """
        try:
            # Stage 1: Native Playwright coordinate click (respects actionability)
            await self.page.mouse.click(x, y)

            # Post-click verification: wait for network settle
            try:
                await self.page.wait_for_load_state("networkidle", timeout=5000)
            except PlaywrightTimeoutError:
                pass  # Network might not be idle, but click succeeded

            return f"Success: Click executed at ({x}, {y})."

        except Exception as primary_err:
            try:
                # Stage 2: Forced JavaScript coordinate dispatch (bypasses overlays)
                js_dispatch = f"""
                () => {{
                    const el = document.elementFromPoint({x}, {y});
                    if(el) {{
                        el.dispatchEvent(new MouseEvent('click', {{
                            bubbles: true, cancelable: true, view: window
                        }}));
                        return true;
                    }}
                    return false;
                }}
                """
                success = await self.page.evaluate(js_dispatch)
                if success:
                    return f"Success: Forced JS click executed at ({x}, {y}) [Overlay Bypassed]."
                else:
                    return f"Error: Coordinates ({x}, {y}) are off-screen or out of bounds."
            except Exception as secondary_err:
                return (
                    f"Error: Total click failure. "
                    f"Primary: {str(primary_err)}. "
                    f"Secondary: {str(secondary_err)}"
                )

    async def _handle_type(self, coords: list, text: str) -> str:
        """Clicks the target coordinate to focus, then emits keydown/keyup events."""
        if not text:
            return "Error: Text value required for TYPE"

        if coords and len(coords) == 2:
            x, y = coords
            await self.page.mouse.click(x, y)

        await self.page.keyboard.type(text, delay=20)
        return f"Success: Typed '{text}'"

    async def _handle_press(self, key_combination: str) -> str:
        """Dispatches a keyboard combination (e.g., 'Enter', 'Control+A', 'Escape')."""
        if not key_combination:
            return "Error: Key combination required for PRESS"

        await self.page.keyboard.press(key_combination)
        return f"Success: Pressed '{key_combination}'"

    async def _handle_scroll(self, direction: str) -> str:
        """Scrolls the viewport up or down by 600 pixels."""
        scroll_amount = 600 if direction == "down" else -600
        await self.page.mouse.wheel(0, scroll_amount)
        await self.page.wait_for_timeout(500)
        return f"Success: Scrolled {direction}"

    async def _handle_navigation(self, url: str) -> str:
        """Navigates the browser to a specified URL."""
        if not url:
            return "Error: URL required for NAVIGATE"

        if not url.startswith("http"):
            url = "https://" + url

        await self.page.goto(url, wait_until="domcontentloaded")
        return f"Success: Navigated to {url}"

    async def _handle_download(self, coords: list, custom_name: str = None) -> str:
        """
        Intercepts the browser download stream and routes it to the local
        macOS workspace directory. Enforces path sanitization to prevent
        directory traversal attacks.
        """
        if not coords or len(coords) != 2:
            return "Error: Coordinates required for DOWNLOAD [x, y]"

        x, y = coords

        try:
            # Fork control flow: wait for download event while executing click
            async with self.page.expect_download(timeout=45000) as download_info:
                await self.page.mouse.click(x, y)

            download = await download_info.value

            # Resolve filename with path sanitization
            filename = custom_name if custom_name else download.suggested_filename
            safe_filename = os.path.basename(filename)
            save_path = HOST_DOWNLOAD_DIR / safe_filename

            # Commit the file from Chromium's temp-space to Apple Silicon disk
            await download.save_as(str(save_path))

            return (
                f"Success: File downloaded securely to {save_path}. "
                f"Size: {save_path.stat().st_size} bytes."
            )

        except TimeoutError:
            return "Error: Click executed, but no download event was triggered within 45 seconds."
        except Exception as e:
            return f"Error: Download failed. Details: {str(e)}"


# ═════════════════════════════════════════════════════════════
# Anti-Loop Heuristic
# ═════════════════════════════════════════════════════════════

class ActionHistoryTracker:
    """
    Detects infinite loops by tracking consecutive identical action payloads.
    Returns False when the same payload has been attempted max_duplicates
    times consecutively, signaling the orchestrator to halt.
    """

    def __init__(self, max_duplicates: int = 3):
        self.history: List[str] = []
        self.max_duplicates = max_duplicates

    def record_and_verify(self, action_payload: str) -> bool:
        """Returns False if an infinite loop is detected."""
        self.history.append(action_payload)

        # Keep history bounded to prevent memory creep
        if len(self.history) > 10:
            self.history.pop(0)

        if len(self.history) >= self.max_duplicates:
            recent_actions = self.history[-self.max_duplicates:]
            if all(action == recent_actions[0] for action in recent_actions):
                return False

        return True


# ═════════════════════════════════════════════════════════════
# File Ingestion Layer
# ═════════════════════════════════════════════════════════════

class WorkspaceFileIngestor:
    """
    Sandboxed file reader for PDF, CSV, and text files within the agent's
    workspace directory. Enforces strict path boundary checks to prevent
    traversal attacks.
    """

    def __init__(self, workspace_dir: Path = HOST_DOWNLOAD_DIR):
        self.workspace_dir = workspace_dir

    def _resolve_and_validate(self, filename: str) -> Path:
        """Enforces strict boundary checks to prevent path traversal."""
        target_path = (self.workspace_dir / filename).resolve()
        if not str(target_path).startswith(str(self.workspace_dir.resolve())):
            raise PermissionError("Access denied: Path traversal outside workspace detected.")
        if not target_path.exists():
            raise FileNotFoundError(f"File '{filename}' does not exist in workspace.")
        return target_path

    def inspect_file(self, filename: str) -> Dict[str, Any]:
        """Metadata inspection for pre-read planning and chunking decisions."""
        path = self._resolve_and_validate(filename)
        size_bytes = path.stat().st_size
        suffix = path.suffix.lower()

        info: Dict[str, Any] = {
            "filename": path.name,
            "extension": suffix,
            "size_kb": round(size_bytes / 1024, 2),
            "line_count": None,
            "page_count": None,
            "columns": None,
        }

        if suffix in [".txt", ".md", ".json", ".log"]:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                info["line_count"] = sum(1 for _ in f)

        elif suffix == ".csv":
            try:
                df = pd.read_csv(path, nrows=1)
                info["columns"] = list(df.columns)
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    info["line_count"] = sum(1 for _ in f)
            except Exception as e:
                info["error"] = f"CSV read error: {str(e)}"

        elif suffix == ".pdf":
            try:
                doc = pymupdf.open(str(path))
                info["page_count"] = len(doc)
                doc.close()
            except Exception as e:
                info["error"] = f"PDF read error: {str(e)}"

        return info

    def read_text_bounded(self, filename: str, offset: int = 0, limit: int = 200) -> str:
        """Reads line-delimited files within a fixed line window."""
        path = self._resolve_and_validate(filename)
        lines = []
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for current_idx, line in enumerate(f):
                if current_idx < offset:
                    continue
                if current_idx >= offset + limit:
                    break
                lines.append(f"[{current_idx}] {line.rstrip()}")

        if not lines:
            return f"EOF: No lines found in range [{offset} : {offset + limit}]."

        header = f"--- FILE: {path.name} | LINES {offset} TO {offset + len(lines) - 1} ---\n"
        return header + "\n".join(lines)

    def read_csv_projected(
        self, filename: str, rows: int = 50, columns: Optional[List[str]] = None
    ) -> str:
        """Reads tabular data with optional column projection to avoid context bloat."""
        path = self._resolve_and_validate(filename)
        try:
            df = pd.read_csv(
                path,
                usecols=columns if columns else None,
                nrows=rows,
            )
            markdown_table = df.to_markdown(index=False)
            return (
                f"--- CSV: {path.name} | First {len(df)} rows | "
                f"Columns: {list(df.columns)} ---\n{markdown_table}"
            )
        except Exception as e:
            return f"Error parsing CSV '{path.name}': {str(e)}"

    def read_pdf_pages(self, filename: str, start_page: int = 1, end_page: int = 3) -> str:
        """Extracts bounded text from PDF files (1-indexed page numbering)."""
        path = self._resolve_and_validate(filename)
        try:
            doc = pymupdf.open(str(path))
            total_pages = len(doc)

            if start_page < 1 or start_page > total_pages:
                doc.close()
                return f"Error: start_page {start_page} out of bounds (total pages: {total_pages})."

            end_page = min(end_page, total_pages)
            extracted_sections = []

            for page_num in range(start_page - 1, end_page):
                page = doc.load_page(page_num)
                text = page.get_text("text").strip()
                extracted_sections.append(
                    f"--- PAGE {page_num + 1} OF {total_pages} ---\n{text}"
                )

            doc.close()
            return "\n\n".join(extracted_sections)

        except Exception as e:
            return f"Error parsing PDF '{path.name}': {str(e)}"


# ═════════════════════════════════════════════════════════════
# Autonomous Agent Orchestrator
# ═════════════════════════════════════════════════════════════

class AutonomousAgentOrchestrator:
    """
    Binds the perception and execution modules into a continuous autonomic
    loop: Perception (state extraction) → Reasoning (model inference) →
    Action (browser dispatch).

    Enforces strict token budgets via tiktoken truncation to prevent OOM
    on Apple Silicon unified memory.
    """

    def __init__(
        self,
        page: Page,
        local_llm_client: AsyncOpenAI,
        model_name: str = "local-model",
    ):
        self.page = page
        self.extractor = PerceptionTreeExtractor(page)
        self.executor = ExtendedAgentExecutionLoop(page)
        self.client = local_llm_client
        self.model_name = model_name
        self.max_iterations = 25

        # Hard limits tailored for Qwen 32B on 32GB Unified Memory
        self.max_context_window = 16384
        self.system_prompt_reserve = 500
        self.response_reserve = 1000
        self.dynamic_payload_budget = (
            self.max_context_window - self.system_prompt_reserve - self.response_reserve
        )

        self.system_prompt = (
            "You are an autonomous web agent operating inside an isolated headless browser VM.\n"
            "At each step, you will receive the current URL, page title, and the Accessibility Tree.\n"
            "Evaluate the state and emit exactly ONE JSON action block to progress the objective.\n"
            "Format:\n"
            "{\n"
            '  "action": "CLICK|TYPE|PRESS|SCROLL|NAVIGATE|COMPLETE",\n'
            '  "coords": [x, y], \n'
            '  "value": "text input, key combination, or URL" \n'
            "}\n"
            "If the objective is met, emit action 'COMPLETE'."
        )
        self.memory: List[Dict[str, str]] = [
            {"role": "system", "content": self.system_prompt}
        ]

    def _truncate_to_budget(self, text_payload: str) -> str:
        """
        Enforces a hard token limit on dynamic text payloads to prevent OOM errors.
        Uses cl100k_base tokenizer for approximation.
        """
        tokens = tokenizer.encode(text_payload)

        if len(tokens) <= self.dynamic_payload_budget:
            return text_payload

        print(
            f"[!] Warning: Payload exceeded budget "
            f"({len(tokens)} > {self.dynamic_payload_budget}). Truncating."
        )

        truncated_tokens = tokens[: self.dynamic_payload_budget]
        truncated_text = tokenizer.decode(truncated_tokens)

        return (
            truncated_text
            + "\n\n[SYSTEM WARNING: Payload truncated due to context window limits.]"
        )

    async def step(self) -> tuple[bool, str]:
        """Executes a single Perception → Reasoning → Action cycle."""
        # 1. Perception Phase: Extract environment state
        interactive_nodes = await self.extractor.extract_interactive_elements()
        env_state = self.extractor.serialize_for_model(interactive_nodes)

        page_url = self.page.url
        page_title = await self.page.title()

        observation = (
            f"--- PERCEPTION PAYLOAD ---\n"
            f"URL: {page_url}\n"
            f"Title: {page_title}\n\n"
            f"Interactive Elements:\n{env_state}\n"
        )

        # Enforce token budget before injection
        safe_observation = self._truncate_to_budget(observation)
        self.memory.append({"role": "user", "content": safe_observation})

        # 2. Reasoning Phase: Query local model backend
        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=self.memory,
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        action_payload = response.choices[0].message.content
        self.memory.append({"role": "assistant", "content": action_payload})

        # Prune the verbose perception payload from history to prevent context explosion
        self.memory[-2]["content"] = f"[Perception frame parsed at {page_url}]"

        # Check for task completion
        try:
            command = json.loads(action_payload)
            if command.get("action", "").upper() == "COMPLETE":
                return True, "Task marked as COMPLETE by agent."
        except json.JSONDecodeError:
            pass

        # 3. Action Phase: Execute the model's command
        execution_result = await self.executor.execute_action(action_payload)
        self.memory.append(
            {"role": "system", "content": f"Action Result: {execution_result}"}
        )

        # Yield to allow network/DOM events to resolve before next perception frame
        await self.page.wait_for_timeout(1500)
        return False, execution_result

    async def execute_objective(self, objective: str) -> str:
        """
        Runs the autonomous loop until the objective is complete or
        max_iterations is reached.
        """
        print(f"[*] Objective: {objective}")
        self.memory.append({"role": "user", "content": f"OBJECTIVE: {objective}"})

        final_result = "Max iterations reached. Loop aborted to prevent token exhaustion."

        for turn in range(self.max_iterations):
            print(f"\n--- Turn {turn + 1} ---")
            is_complete, result = await self.step()
            print(f"Outcome: {result}")

            if is_complete:
                print("\n[*] Objective Achieved.")
                final_result = result
                break
        else:
            print(
                "\n[!] Max iterations reached. Loop aborted to prevent token exhaustion."
            )

        return final_result


# ═════════════════════════════════════════════════════════════
# FastMCP Server Initialization
# ═════════════════════════════════════════════════════════════

mcp = MCPServer("Hawkeye-Headless-Browser-Agent")

# Global state to maintain the browser session across tool calls
browser_state: Dict[str, Any] = {
    "playwright": None,
    "browser": None,
    "context": None,
    "page": None,
    "extractor": None,
    "executor": None,
}

# Singleton instances
action_tracker = ActionHistoryTracker()
ingestor = WorkspaceFileIngestor(HOST_DOWNLOAD_DIR)


async def ensure_browser_running():
    """
    Initializes the Playwright environment with Apple Silicon Metal GPU
    acceleration if it is not already running. Enables download interception
    and Playwright tracing for observability.
    """
    if browser_state["page"] is None:
        browser_state["playwright"] = await async_playwright().start()
        browser_state["browser"] = await browser_state["playwright"].chromium.launch(
            channel="chromium",  # Full browser binary instead of headless-shell
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                # Core Hardware Acceleration
                "--enable-gpu",
                "--ignore-gpu-blocklist",
                # Apple Silicon Metal Integration
                "--use-gl=angle",
                "--use-angle=metal",
                # Rendering & Memory Optimizations
                "--enable-gpu-rasterization",
                "--enable-zero-copy",
                # Next-gen 3D graphics support
                "--enable-unsafe-webgpu",
            ],
        )

        browser_state["context"] = await browser_state["browser"].new_context(
            viewport={"width": 1280, "height": 800},
            accept_downloads=True,  # Required for download stream interception
        )

        # Start tracing for observability and debugging
        await browser_state["context"].tracing.start(
            screenshots=True,
            snapshots=True,
            sources=True,
        )

        page = await browser_state["context"].new_page()
        browser_state["page"] = page
        browser_state["extractor"] = PerceptionTreeExtractor(page)
        browser_state["executor"] = ExtendedAgentExecutionLoop(page)


# ═════════════════════════════════════════════════════════════
# FastMCP Tools: Browser Navigation & Perception
# ═════════════════════════════════════════════════════════════


@mcp.tool()
async def navigate_to_url(url: str) -> str:
    """Navigates the headless browser to a specified URL."""
    await ensure_browser_running()

    if not url.startswith("http"):
        url = "https://" + url

    await browser_state["page"].goto(url, wait_until="domcontentloaded")
    title = await browser_state["page"].title()
    return f"Successfully navigated to {url}. Page title: {title}"


@mcp.tool()
async def get_accessibility_tree() -> str:
    """
    Returns the current visual and interactive state of the webpage as a flattened,
    token-efficient accessibility tree with element IDs and coordinates.
    """
    await ensure_browser_running()
    interactive_nodes = await browser_state["extractor"].extract_interactive_elements()
    env_state = browser_state["extractor"].serialize_for_model(interactive_nodes)

    page_url = browser_state["page"].url
    return (
        f"--- CURRENT BROWSER STATE ---\n"
        f"URL: {page_url}\n\n"
        f"Interactive Elements:\n{env_state}"
    )


# ═════════════════════════════════════════════════════════════
# FastMCP Tools: Browser Action Execution
# ═════════════════════════════════════════════════════════════


@mcp.tool()
async def execute_browser_action(action_payload_json: str) -> str:
    """
    Executes a specific action in the browser based on a JSON payload.
    Expected JSON format:
    {"action": "CLICK|TYPE|PRESS|SCROLL|NAVIGATE|DOWNLOAD", "coords": [x,y], "value": "text/key"}
    """
    await ensure_browser_running()

    # Anti-loop check: halt if the same action has been repeated consecutively
    if not action_tracker.record_and_verify(action_payload_json):
        return (
            "FATAL ERROR: Infinite loop detected. You are repeating the exact same "
            "invalid action. Re-evaluate the accessibility tree and try a DIFFERENT "
            "approach or coordinate."
        )

    result = await browser_state["executor"].execute_action(action_payload_json)
    await browser_state["page"].wait_for_timeout(1000)
    return result


@mcp.tool()
async def shutdown_browser() -> str:
    """Closes the active browser session and frees resources."""
    if browser_state["browser"]:
        # Stop tracing before closing
        try:
            trace_path = LOG_DIR / f"shutdown_trace_{int(time.time())}.zip"
            await browser_state["context"].tracing.stop(path=str(trace_path))
        except Exception:
            pass  # Tracing may already be stopped

        await browser_state["browser"].close()
        await browser_state["playwright"].stop()

        # Reset all state
        for key in browser_state:
            browser_state[key] = None

        return "Browser session terminated successfully."
    return "No active browser session to terminate."


# ═════════════════════════════════════════════════════════════
# FastMCP Tools: Workspace File Management
# ═════════════════════════════════════════════════════════════


@mcp.tool()
async def list_workspace_files() -> str:
    """
    Returns a list of all files currently stored in the agent's local download
    workspace, including file sizes.
    """
    if not HOST_DOWNLOAD_DIR.exists():
        return "Workspace directory does not exist yet."

    files = []
    for filepath in sorted(HOST_DOWNLOAD_DIR.iterdir()):
        if filepath.is_file():
            size_kb = filepath.stat().st_size / 1024
            files.append(f"- {filepath.name} ({size_kb:.1f} KB)")

    if not files:
        return "Workspace is currently empty."

    return "Files in Agent Workspace:\n" + "\n".join(files)


@mcp.tool()
async def get_workspace_file_metadata(filename: str) -> str:
    """
    Inspects a file in the workspace to retrieve its size, line count,
    page count, or table columns before reading it.
    """
    try:
        metadata = ingestor.inspect_file(filename)
        return json.dumps(metadata, indent=2)
    except Exception as e:
        return f"Inspection Error: {str(e)}"


@mcp.tool()
async def read_workspace_text_file(
    filename: str, offset_line: int = 0, line_limit: int = 150
) -> str:
    """
    Reads a line-bounded chunk of a text, markdown, or JSON file from the workspace.
    Useful for reading logs, source code, or text files sequentially.
    """
    try:
        return ingestor.read_text_bounded(filename, offset=offset_line, limit=line_limit)
    except Exception as e:
        return f"Read Error: {str(e)}"


@mcp.tool()
async def read_workspace_csv(
    filename: str, max_rows: int = 30, selected_columns_json: Optional[str] = None
) -> str:
    """
    Reads tabular data from a CSV file in markdown table format.
    Pass selected_columns_json as a JSON array of column name strings to filter columns.
    """
    try:
        cols = json.loads(selected_columns_json) if selected_columns_json else None
        return ingestor.read_csv_projected(filename, rows=max_rows, columns=cols)
    except Exception as e:
        return f"CSV Read Error: {str(e)}"


@mcp.tool()
async def read_workspace_pdf(
    filename: str, start_page: int = 1, end_page: int = 3
) -> str:
    """
    Extracts text from a bounded page range of a PDF document in the workspace (1-indexed).
    """
    try:
        return ingestor.read_pdf_pages(
            filename, start_page=start_page, end_page=end_page
        )
    except Exception as e:
        return f"PDF Read Error: {str(e)}"


# ═════════════════════════════════════════════════════════════
# FastMCP Tools: Observability & Debug Telemetry
# ═════════════════════════════════════════════════════════════


@mcp.tool()
async def capture_debug_state(error_context: str = "") -> str:
    """
    Called by the agent automatically when it is stuck. Dumps a screenshot
    and a trace file to the Apple Silicon local workspace for debugging.
    """
    await ensure_browser_running()
    timestamp = int(time.time())
    screenshot_path = LOG_DIR / f"error_state_{timestamp}.png"
    trace_path = LOG_DIR / f"trace_{timestamp}.zip"

    await browser_state["page"].screenshot(path=str(screenshot_path))

    # Export current trace and immediately restart tracing
    await browser_state["context"].tracing.stop(path=str(trace_path))
    await browser_state["context"].tracing.start(
        screenshots=True, snapshots=True, sources=True
    )

    return (
        f"Telemetry captured. Screenshot at {screenshot_path}. "
        f"Trace at {trace_path}. Reason: {error_context}"
    )


@mcp.tool()
async def verify_hardware_acceleration() -> str:
    """
    Navigates to the Chromium GPU diagnostics page to verify that the
    M4 Max Metal GPU integration is active.
    """
    await ensure_browser_running()
    await browser_state["page"].goto("chrome://gpu")

    gpu_status = await browser_state["page"].evaluate(
        """
        () => Array.from(document.querySelectorAll('.feature-status-list li'))
                   .map(li => li.innerText).join('\\n')
    """
    )
    return f"GPU Acceleration Status:\n{gpu_status}"


# ═════════════════════════════════════════════════════════════
# FastMCP Tools: SQLite Episodic Memory
# ═════════════════════════════════════════════════════════════


@mcp.tool()
async def log_episodic_memory(topic: str, content: str, tags: list[str]) -> str:
    """
    Writes a timestamped entry into the local SQLite memory database.
    Use this after completing a complex task or significant conversation.
    """
    timestamp = datetime.now().isoformat()
    tag_string = ",".join(tags)

    conn = sqlite3.connect(MEMORY_DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO agent_memory (timestamp, topic, content, tags) VALUES (?, ?, ?, ?)",
        (timestamp, topic, content, tag_string),
    )
    conn.commit()
    conn.close()

    return f"Memory successfully committed to SQLite database: {topic}"


@mcp.tool()
async def query_episodic_memory(tag: str) -> str:
    """
    Scans the local SQLite database for all memories containing a specific tag
    and returns a summarized list of historical events.
    """
    conn = sqlite3.connect(MEMORY_DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        "SELECT timestamp, topic, content FROM agent_memory "
        "WHERE tags LIKE ? ORDER BY timestamp DESC LIMIT 10",
        (f"%{tag}%",),
    )
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return f"No memories found containing tag: {tag}"

    results = []
    for row in rows:
        snippet = "\n".join(row[2].split("\n")[:5])
        results.append(f"[{row[0]}] Topic: {row[1]}\nContext:\n{snippet}\n---")

    return "\n".join(results)


# ═════════════════════════════════════════════════════════════
# Entry Point
# ═════════════════════════════════════════════════════════════

if __name__ == "__main__":
    mcp.run()
