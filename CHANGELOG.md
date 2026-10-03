# Changelog

All notable changes to Digital Bestie are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.4.0] - 2026-10-03

### Added
- **Dynamic MCP Router & Deterministic DAG Execution Hub (`hawkeye-stack/`)**:
  - Modular FastMCP micro-servers isolating domain capabilities:
    - `task_tracker_mcp.py`: TaskFlow SQLite/REST integration for ticket lifecycle, filtering, and priority tracking.
    - `personality_mcp.py`: Living dossier calibration, behavioral adjustments, sentiment and tone analysis.
    - `resume_architect_mcp.py`: Career tailoring, gap analysis, and ATS-optimized bullet generator.
    - `resource_tracker_mcp.py`: Superbrain resource catalog, bookmarking, and domain tagging.
  - `unified_hub.py`: Centralized FastMCP proxy aggregating all 21 micro-tools into a single SSE server on port 8765 with dynamic routing and prefixing.
  - `central_router.py`: Ollama-powered semantic orchestrator (`qwen2.5:7b`) triaging natural language user prompts into single-silo or multi-step tool execution pipelines.
  - `dag_executor.py`: Deterministic DAG execution engine supporting topological node resolution, dependent variable interpolation (`{{node.field}}`), execution telemetry, and automated fallback paths.
  - Pre-packaged multi-agent workflows (`workflows.py`): Morning Briefing (`workflow_morning_briefing`), Career Opportunity Evaluator (`workflow_career_evaluation`), and Focus Session Orchestrator (`workflow_focus_session`), alongside native n8n JSON workflow templates.
- **Knowledge Retrieval & Local Vector Store (RAG)**:
  - Local Qdrant vector database integration running on `localhost:6333` with 768-dimensional `nomic-embed-text` embeddings (`src/services/rag.js`).
  - Pre-flight retrieval hook in `ollama:chat` IPC intercepting prompts to enrich LLM context with relevant memories, notes, and profile traits from the `hawkeye_memory` collection.
  - Automated indexing for Living Dossier entries and Superbrain resources.
- **Universal Ingestion & Data Capture Engine**:
  - Lightweight HTTP webhook daemon listening on `127.0.0.1:3848` (`src/services/ingestion.js`).
  - Automated classification heuristics routing incoming payloads, raw markdown, and structured tickets directly into TaskFlow, Superbrain, and Qdrant vector collections.
- **Telemetry & Observability Dashboard**:
  - Dedicated multi-agent observability panel in UI (`#view-telemetry`) tracking token consumption, cumulative compute latency, and local vs. GPT-4 cost-avoidance ROI calculations.
  - Real-time hardware telemetry reflecting Apple Silicon / Metal utilization and active LLM footprint.
  - Live activity trace stream capturing multi-agent DAG transitions, MCP queries, and vector retrieval timestamps.
- **Human-in-the-Loop (HITL) Outbound Action Gateway**:
  - Secure Outbound Action Execution Node (`src/services/execution-node.js`) enforcing human confirmation on high-impact external actions (`send_email`, `webhook_dispatch`, `shell_command`, `file_export`).
  - Floating authorization modal (`#hitl-modal`) with payload inspection, rationale display, and one-click approve/reject controls.
  - Interactive approval badge (`#hitl-nav-badge`) in navigation updating in real-time.
  - Tamper-resistant execution audit log recording approvals, rejections, timestamps, and executor results.
- **TaskFlow Kanban & Wear OS Companion Scaffolding**:
  - Seamless local synchronization bridge with TaskFlow project management backend.
  - Google Wear OS companion simulator architecture allowing wearable glanceable task notifications.

### Changed
- Refactored `src/services/memory.js` to dynamically support both Electron ESM runtime (`safeStorage`) and headless Node test runners.
- Updated application versioning to 2.4.0 across `package.json`, `index.html`, `src/renderer.js`, `src/services/execution-node.js`, and system update telemetry.

---

## [2.3.0] - 2026-09-29

### Added
- **Multi-Provider Memory Import Hub**:
  - Direct 1-click memory extraction prompt generator for Claude, ChatGPT, Venice AI, Superbrain, and custom LLM providers.
  - Interactive memory staging area with categorization (Identity, Cognitive, Goals, Sanity Scout, Ventures, Methods).
  - Individual approve/dismiss toggles and batch consolidation into the Living Dossier (`user_profile`).
- **Model Alteration Warning Interceptor**:
  - Modal alert (`#model-warning-modal`) intercepting model alterations in titlebar and settings.
  - Clear alerts on potential performance impact, persona alignment, and moralizing refusal risks.
  - Custom model tag support (`__custom__`) to enter any local Ollama registry tag.
- **Base Model Infusion Engine**:
  - 1-click Modelfile compilation tool in Settings to forge any local base model into the `bestie` architecture.
  - Automatically bakes in 16k context window (`num_ctx 16384`), optimal temperature/repetition parameters, and core anti-moralizing tenets.
- **Curated Uncensored Model Foundation & Version Upgrade Telemetry**:
  - Curated model catalog (`src/services/model-registry.js`) featuring vetted uncensored and high-logic models: Nous Hermes 3 (8B & 70B), Cognitive Computations Dolphin 2.9 (8B), and Qwen 2.5 Coder (32B & 14B).
  - Automated upgrade detection engine that alerts users when running degraded abliterated models and provides a 1-click upgrade and re-infusion path.
  - In-app notification banner (`#model-upgrade-banner`) and visual catalog browser in Settings.

### Changed
- Decoupled Living Dossier memory ingestion from static model weights: runtime prompt injection dynamically wraps any selected or upgraded base model with 100% of user memory and personas with zero data migration.
- Updated self-healing model resolution cascade to prioritize curated uncensored and coder models.
- Updated application versioning to 2.3.0 across package configuration, UI headers, and updater telemetry.

---

## [2.2.0] - 2026-09-24

### Added
- **Memory Calibration Lab A La Carte Answering & Scrolling Overhaul**:
  - Restored full vertical container scrolling in `#calibration-questions-container` allowing users to view and edit all questions across every calibration module.
  - Sticky category headers and responsive "Jump to Question" pill navigation bar for rapid in-module browsing.
  - Inline a la carte response editor allowing users to directly review, edit, and save individual answers without forcing a full multi-question interview.
  - `Cmd+Enter` / `Ctrl+Enter` shortcut for instant saving with sensory feedback toasts.
  - Dynamic status indicators (`✓ Calibrated` in neon green vs. `○ Needs Calibration` in subtle warning gold) tracking calibration coverage per question in real-time.
  - Dedicated "1-on-1 Interview" button per question to launch an isolated conversational drill-down for that specific topic.
- **Ollama Self-Healing Model Fallback**:
  - Resilient automatic fallback engine that dynamically discovers active Ollama models when the user's configured model is missing or deleted.
  - Priority fallback cascade (`bestie` -> `hermes3:70b` -> `bestie-light` -> `qwen2.5:14b` -> any available local text generation model).
  - Prevents total app disconnection, silent hang, or blank conversation streams.
- **System Health Diagnostics Panel in Settings**:
  - Real-time diagnostic monitor for Ollama server reachability and model availability.
  - Model verification grid with status badges for primary (`bestie`) and lightweight (`bestie-light`) models.
  - 1-click model pull actions (`ollama pull hermes3:70b`, `ollama pull qwen2.5:14b`) and automated Modelfile creation directly from the UI.
- **Embedded Canonical Modelfiles**:
  - Bundled `DEFAULT_MODELFILE_HERMES` and `DEFAULT_MODELFILE_LIGHT` within application memory (`src/services/modelfile-templates.js`) enabling 1-click model restoration even if root files are deleted.
- **Hawkeye Intelligence Agentic Stack**:
  - FastMCP headless browser automation service with Playwright.
  - Local SQLite hybrid episodic memory database.
  - Qdrant semantic vector memory store for local RAG retrieval.
  - n8n workflow engine integration for event-driven autonomous tasks.

### Changed
- Refactored `src/services/ollama.js` streaming pipeline to support dynamic model resolution before initiating streaming requests.
- Modernized Settings modal UI with high-contrast glassmorphic diagnostics cards.
- Synchronized application versioning across `package.json`, `index.html`, and `src/renderer.js`.

### Fixed
- Fixed critical CSS overflow and container constraints in `#calibration-questions-container` preventing users from scrolling past the first 1-2 questions.
- Fixed uncaught exception and connection abort when querying an Ollama model that has been pruned from the local system.

---

## [2.1.0] - 2026-09-15

### Added
- **20 Core Personas & Full-Spectrum Coverage**:
  - Expanded from 14 to 20 specialized operational modules covering defense, execution, strategy, growth, and technical troubleshooting.
  - Added *Emotional Anchor & De-escalation*, *Journal Mirror & Shadow Prompt*, *Admin Blitz & Micro-Tasker*, *Body Budget & Somatic Check-in*, *Relationship Radar & Conflict Decoder*, and *The Negotiation Room & Deal Closer*.
- **In-Chat Persona Switcher (`⌘P`)**:
  - Mid-conversation switching modal with zero context loss.
  - In-stream transition banner highlighting changes in operational focus.
- **Curated Starter Prompts**:
  - 60 high-leverage starter prompts (3 per persona) with 1-click execution.
- **Real-Time Persona Search & Filtering**:
  - Multi-category filtering and instant keyword search.
- **Native Electron Auto-Updater**:
  - Automatic GitHub Releases checking, update notification banner, and private repo support.

---

## [2.0.0] - 2026-09-15

### Added
- **Chat Vault & History Sidebar**:
  - Multi-conversation persistence with collapsible sidebar (`⌘B`).
  - Real-time search filtering, instant chat switching, and auto-titling.
- **Category Folders & Organization**:
  - Custom folder categories with emoji badges for chat segregation.
- **Apple Keychain Hardware Encryption (`safeStorage`)**:
  - Hardware-backed data-at-rest encryption for user profile, chat vaults, and superbrain dossier with POSIX `0700`/`0600` permissions.
- **Hardened Electron Security Architecture**:
  - Chromium sandbox enforcement, strict CSP, link protocol sanitization, and safe external navigation.

---

## [1.2.0] - 2026-09-14

### Added
- Direct resource addition and deletion with real-time Living Dossier burn-rate synchronization.
- Superbrain Hub asset tracking for SaaS subscriptions, hardware, and travel credits.

---

## [1.1.0] - 2026-09-13

### Added
- Initial Memory Calibration Lab with module tooltips.
- Support for lightweight 14B model (`bestie-light` / `qwen2.5:14b`).

---

## [1.0.0] - 2026-09-11

### Added
- Initial release of Digital Bestie — The Sovereign Architect & Persistent Second-Brain OS.
- Local Ollama Hermes 3 70B integration.
- Living Dossier memory engine (`user_profile.json`).
- Glassmorphism neon UI and 8 core operational modules.
