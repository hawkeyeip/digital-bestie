"""
Hawkeye Unified MCP Hub & State Preserver
Central MCP protocol gateway combining Task Tracker, Personality Module,
Resume Architect, and Resource Tracker under a single high-performance router.
Provides persistent state preservation across multi-step agentic workflows
and supports Server-Sent Events (SSE) for streaming progress.
"""

import asyncio
import datetime
import json
import logging
import os
import uuid
from typing import List, Dict, Any, Optional
from fastmcp import FastMCP
from pydantic import BaseModel, Field

# Import underlying silo modules
from mcp_servers.task_tracker_mcp import (
    list_tasks as tt_list_tasks,
    create_task as tt_create_task,
    update_task as tt_update_task,
    resolve_task as tt_resolve_task,
    get_task_stats as tt_get_task_stats,
    get_active_backlog as tt_get_active_backlog
)
from mcp_servers.personality_mcp import (
    get_dossier as p_get_dossier,
    calibrate_trait as p_calibrate_trait,
    log_confidence_milestone as p_log_confidence_milestone,
    get_daily_constraints as p_get_daily_constraints
)
from mcp_servers.resume_architect_mcp import (
    generate_master_bullet as ra_generate_master_bullet,
    append_bullet_to_resume as ra_append_bullet_to_resume,
    query_skills_matrix as ra_query_skills_matrix,
    get_master_resume as ra_get_master_resume
)
from mcp_servers.resource_tracker_mcp import (
    add_resource as rt_add_resource,
    list_resources as rt_list_resources,
    triage_incoming_resource as rt_triage_incoming_resource,
    get_financial_runway as rt_get_financial_runway
)
from rag.context_injector import context_injector

logger = logging.getLogger(__name__)

SESSION_STORE_PATH = os.path.expanduser("~/.digital-bestie/mcp_sessions.json")


# ─── Persistent State Preserver ──────────────────────────────────────────────

class StatePreserver:
    """Maintains cross-silo execution state across multi-step agentic sequences."""
    def __init__(self, filepath: str = SESSION_STORE_PATH):
        self.filepath = filepath
        self._sessions: Dict[str, Dict[str, Any]] = self._load()

    def _load(self) -> Dict[str, Dict[str, Any]]:
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading session store: {e}")
        return {}

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
        temp_path = f"{self.filepath}.tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(self._sessions, f, indent=2)
        os.replace(temp_path, self.filepath)

    def create_session(self, initial_context: Optional[Dict[str, Any]] = None) -> str:
        session_id = f"sess-{uuid.uuid4().hex[:10]}"
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self._sessions[session_id] = {
            "session_id": session_id,
            "created_at": now,
            "updated_at": now,
            "step_history": [],
            "context": initial_context or {}
        }
        self._save()
        return session_id

    def get_session(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self._sessions:
            self._sessions[session_id] = {
                "session_id": session_id,
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "step_history": [],
                "context": {}
            }
            self._save()
        return self._sessions[session_id]

    def record_step(self, session_id: str, step_name: str, inputs: Dict[str, Any], outputs: Dict[str, Any]) -> None:
        sess = self.get_session(session_id)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        sess["updated_at"] = now
        sess["step_history"].append({
            "step_name": step_name,
            "timestamp": now,
            "inputs": inputs,
            "outputs": outputs
        })
        # Merge outputs into global context for downstream handoff
        sess["context"][f"{step_name}_output"] = outputs
        self._save()

    def get_context_variable(self, session_id: str, key: str, default: Any = None) -> Any:
        sess = self.get_session(session_id)
        return sess["context"].get(key, default)


state_preserver = StatePreserver()

# Initialize Unified FastMCP Hub
hawkeye_unified_hub = FastMCP("HawkeyeUnifiedHub")


# ─── Task Tracker Silo Tools ─────────────────────────────────────────────────

@hawkeye_unified_hub.tool()
def taskflow_list_tasks(status: Optional[str] = None, priority: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """List tasks from TaskFlow Kanban board."""
    return tt_list_tasks(status=status, priority=priority, limit=limit)

@hawkeye_unified_hub.tool()
def taskflow_create_task(title: str, description: str = "", priority: str = "medium", tags: List[str] = [], due_date: Optional[str] = None) -> Dict[str, Any]:
    """Create a new task in TaskFlow."""
    return tt_create_task(title=title, description=description, priority=priority, tags=tags, due_date=due_date)

@hawkeye_unified_hub.tool()
def taskflow_update_task(task_id: str, title: Optional[str] = None, description: Optional[str] = None, status: Optional[str] = None, priority: Optional[str] = None) -> Dict[str, Any]:
    """Update an existing task in TaskFlow."""
    return tt_update_task(task_id=task_id, title=title, description=description, status=status, priority=priority)

@hawkeye_unified_hub.tool()
def taskflow_resolve_task(task_id: str, completion_notes: str = "", metrics: Dict[str, Any] = {}, tools_used: List[str] = [], deliverables: List[str] = []) -> Dict[str, Any]:
    """Resolve a task epic and ingest retrospective into Qdrant vector memory."""
    return tt_resolve_task(task_id=task_id, completion_notes=completion_notes, metrics=metrics, tools_used=tools_used, deliverables=deliverables)

@hawkeye_unified_hub.tool()
def taskflow_get_stats() -> Dict[str, Any]:
    """Get board analytics from TaskFlow."""
    return tt_get_task_stats()

@hawkeye_unified_hub.tool()
def taskflow_get_backlog(limit: int = 10) -> List[Dict[str, Any]]:
    """Get prioritized backlog tasks."""
    return tt_get_active_backlog(limit=limit)


# ─── Personality Silo Tools ──────────────────────────────────────────────────

@hawkeye_unified_hub.tool()
def personality_get_dossier() -> Dict[str, Any]:
    """Retrieve full behavioral profile and identity baseline."""
    return p_get_dossier()

@hawkeye_unified_hub.tool()
def personality_calibrate_trait(domain: str, confidence_score: float, notes: str = "") -> Dict[str, Any]:
    """Calibrate trait confidence score in a skill domain."""
    return p_calibrate_trait(domain=domain, confidence_score=confidence_score, notes=notes)

@hawkeye_unified_hub.tool()
def personality_log_confidence_milestone(domain: str, epic_name: str, metrics: Dict[str, Any] = {}, outcome: str = "") -> Dict[str, Any]:
    """Log an achieved milestone upon epic completion."""
    return p_log_confidence_milestone(domain=domain, epic_name=epic_name, metrics=metrics, outcome=outcome)

@hawkeye_unified_hub.tool()
def personality_get_daily_constraints() -> Dict[str, Any]:
    """Retrieve avoidance triggers, focus blocks, and energy parameters."""
    return p_get_daily_constraints()


# ─── Resume Architect Silo Tools ─────────────────────────────────────────────

@hawkeye_unified_hub.tool()
def resume_generate_bullet(role: str, action_verb: str, tools_used: List[str], metrics: str, outcome: str) -> Dict[str, Any]:
    """Generate an XYZ-formula master resume bullet."""
    return ra_generate_master_bullet(role=role, action_verb=action_verb, tools_used=tools_used, metrics=metrics, outcome=outcome)

@hawkeye_unified_hub.tool()
def resume_append_bullet(role: str, company: str, bullet_text: str, skills: List[str] = [], tags: List[str] = []) -> Dict[str, Any]:
    """Append a bullet to the master resume store."""
    return ra_append_bullet_to_resume(role=role, company=company, bullet_text=bullet_text, skills=skills, tags=tags)

@hawkeye_unified_hub.tool()
def resume_query_skills() -> Dict[str, Any]:
    """Query skills matrix and bullet distribution."""
    return ra_query_skills_matrix()

@hawkeye_unified_hub.tool()
def resume_get_master() -> Dict[str, Any]:
    """Retrieve full master resume document."""
    return ra_get_master_resume()


# ─── Resource Tracker Silo Tools ─────────────────────────────────────────────

@hawkeye_unified_hub.tool()
def resource_add(name: str, resource_type: str = "document", category: str = "Software/SaaS", cost: float = 0.0, value: float = 0.0, currency: str = "USD", url: str = "", notes: str = "", content: str = "") -> Dict[str, Any]:
    """Add a resource and index into Qdrant memory."""
    return rt_add_resource(name=name, resource_type=resource_type, category=category, cost=cost, value=value, currency=currency, url=url, notes=notes, content=content)

@hawkeye_unified_hub.tool()
def resource_list(category: Optional[str] = None, resource_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """List tracked resources."""
    return rt_list_resources(category=category, resource_type=resource_type)

@hawkeye_unified_hub.tool()
def resource_triage(raw_input: str, source_url: str = "", content_type: str = "auto") -> Dict[str, Any]:
    """Triage raw URL/snippet/PDF into actionable ticket or referential vector."""
    return rt_triage_incoming_resource(raw_input=raw_input, source_url=source_url, content_type=content_type)

@hawkeye_unified_hub.tool()
def resource_get_runway() -> Dict[str, Any]:
    """Calculate financial runway from burn rate and liquidity."""
    return rt_get_financial_runway()


# ─── Session State Tools ─────────────────────────────────────────────────────

@hawkeye_unified_hub.tool()
def session_start(initial_context: Dict[str, Any] = {}) -> str:
    """Start a new persistent multi-step session."""
    return state_preserver.create_session(initial_context)

@hawkeye_unified_hub.tool()
def session_get_state(session_id: str) -> Dict[str, Any]:
    """Get the full persistent state and history of a multi-step session."""
    return state_preserver.get_session(session_id)

@hawkeye_unified_hub.tool()
def memory_preflight_query(query: str, limit: int = 4) -> str:
    """Execute pre-flight vector retrieval against Qdrant memory."""
    return context_injector.inject_context(query, limit=limit)


# ─── Server Runner ───────────────────────────────────────────────────────────

def start_sse_server(port: int = 8765):
    """Run the FastMCP server in Server-Sent Events (SSE) mode."""
    logger.info(f"Starting Hawkeye Unified FastMCP Hub on SSE port {port}...")
    hawkeye_unified_hub.run(transport="sse", port=port)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--sse":
        start_sse_server()
    else:
        hawkeye_unified_hub.run()
