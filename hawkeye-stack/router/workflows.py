"""
Hawkeye Inter-Module Integration Workflows
Implements the 3 core autonomous cross-silo workflows:
  - Workflow A: Experience Capitalization (Task -> Resume -> Memory)
  - Workflow B: Resource Triage & Delegation (Resource -> Router -> Task)
  - Workflow C: Contextual Daily Initialization (Memory -> Task -> Resource)
"""

import asyncio
import datetime
import logging
import uuid
from typing import Dict, Any, List, Optional, Callable, Awaitable
from pydantic import BaseModel, Field

from router.dag_executor import DAGPlan, DAGNode, dag_executor, DAGExecutionResult
from mcp_servers.unified_hub import hawkeye_unified_hub, state_preserver

logger = logging.getLogger(__name__)


# ─── Workflow A: Experience Capitalization ───────────────────────────────────

class ExperienceCapitalizationEngine:
    """
    Workflow A: Task -> Resume -> Memory
    Trigger: Task Tracker registers an overarching epic as 'Resolved'.
    Execution: Emits event payload -> Extracts metrics, tools, deliverables ->
               Resume Architect MCP generates master bullet & appends to resume ->
               Personality/Memory MCP logs mastery milestone & calibrates domain confidence ->
               Qdrant unified memory stores retrospective embedding.
    """
    def __init__(self, executor=dag_executor):
        self.executor = executor

    def build_plan(
        self,
        task_id: str,
        role: str = "Lead Agentic Systems Architect",
        company: str = "Hawkeye Autonomous Systems",
        domain: str = "Autonomous Agent Infrastructure",
        metrics_override: Optional[Dict[str, Any]] = None,
        tools_override: Optional[List[str]] = None,
        deliverables_override: Optional[List[str]] = None
    ) -> DAGPlan:
        plan_id = f"plan-wfA-{uuid.uuid4().hex[:8]}"

        metrics = metrics_override or {"latency_reduction": "85%", "throughput_gain": "2.4x"}
        tools = tools_override or ["FastMCP", "Qdrant", "Ollama", "TaskFlow"]
        deliverables = deliverables_override or [
            "Dynamic MCP Router", "Deterministic DAG Engine", "Unified Memory Layer"
        ]

        metrics_summary = f"{metrics.get('latency_reduction', '85%')} latency reduction and {metrics.get('throughput_gain', '2.4x')} throughput"

        return DAGPlan(
            plan_id=plan_id,
            title="Workflow A: Experience Capitalization (Task -> Resume -> Memory)",
            nodes=[
                DAGNode(
                    id="step_resolve_task",
                    tool_name="taskflow_resolve_task",
                    params={
                        "task_id": task_id,
                        "completion_notes": "Epic successfully executed and verified against end-to-end integration tests.",
                        "metrics": metrics,
                        "tools_used": tools,
                        "deliverables": deliverables
                    },
                    description="Resolve Task in TaskFlow and emit resolution event payload"
                ),
                DAGNode(
                    id="step_generate_bullet",
                    tool_name="resume_generate_bullet",
                    params={
                        "role": role,
                        "action_verb": "Architected",
                        "tools_used": tools,
                        "metrics": metrics_summary,
                        "outcome": f"production-grade autonomous {deliverables[0]} connecting isolated silos"
                    },
                    depends_on=["step_resolve_task"],
                    description="Synthesize executive XYZ impact bullet point via Resume Architect"
                ),
                DAGNode(
                    id="step_append_bullet",
                    tool_name="resume_append_bullet",
                    params={
                        "role": role,
                        "company": company,
                        "bullet_text": "{{step_generate_bullet.bullet_text}}",
                        "skills": tools,
                        "tags": ["agentic", "architecture", "mcp"]
                    },
                    depends_on=["step_generate_bullet"],
                    description="Persist bullet to master resume and update skills matrix"
                ),
                DAGNode(
                    id="step_calibrate_personality",
                    tool_name="personality_log_confidence_milestone",
                    params={
                        "domain": domain,
                        "epic_name": "{{step_resolve_task.title}}",
                        "metrics": metrics,
                        "outcome": f"Resolved epic with deliverables: {', '.join(deliverables)}"
                    },
                    depends_on=["step_resolve_task"],
                    description="Calibrate domain confidence and record mastery milestone"
                )
            ]
        )

    async def execute(
        self,
        task_id: str,
        role: str = "Lead Agentic Systems Architect",
        company: str = "Hawkeye Autonomous Systems",
        domain: str = "Autonomous Agent Infrastructure",
        metrics: Optional[Dict[str, Any]] = None,
        tools: Optional[List[str]] = None,
        deliverables: Optional[List[str]] = None,
        event_callback: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None
    ) -> DAGExecutionResult:
        plan = self.build_plan(
            task_id=task_id,
            role=role,
            company=company,
            domain=domain,
            metrics_override=metrics,
            tools_override=tools,
            deliverables_override=deliverables
        )
        return await self.executor.execute_plan(plan, event_callback=event_callback)


# ─── Workflow B: Resource Triage & Delegation ────────────────────────────────

class ResourceTriageEngine:
    """
    Workflow B: Resource -> Router -> Task
    Trigger: A raw URL, code snippet, or PDF is dumped into Resource Tracker.
    Execution: Ingestion pipeline parses content -> Central Router evaluates data ->
               If Actionable: Calls Task Tracker MCP to generate new prioritized ticket ->
               If Referential: Generates embedding & links to active tasks in vector store.
    """
    def __init__(self, executor=dag_executor):
        self.executor = executor

    async def process_resource(
        self,
        raw_input: str,
        source_url: str = "",
        content_type: str = "auto",
        event_callback: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None
    ) -> Dict[str, Any]:
        session_id = state_preserver.create_session({"workflow": "workflow_b_resource_triage"})

        if event_callback:
            await event_callback("triage_start", {"raw_input": raw_input[:100], "source_url": source_url})

        # Step 1: Triage via Resource Tracker MCP
        triage_res = await hawkeye_unified_hub.call_tool("resource_triage", {
            "raw_input": raw_input,
            "source_url": source_url,
            "content_type": content_type
        })
        triage_data = triage_res.structured_content

        state_preserver.record_step(session_id, "resource_triage", {
            "raw_input": raw_input,
            "source_url": source_url
        }, triage_data)

        output: Dict[str, Any] = {
            "session_id": session_id,
            "triage": triage_data,
            "action_taken": None
        }

        # Step 2: Route based on verdict
        if triage_data.get("is_actionable"):
            suggested = triage_data.get("suggested_task", {})
            ticket_res = await hawkeye_unified_hub.call_tool("taskflow_create_task", {
                "title": suggested.get("title", "Action Required"),
                "description": suggested.get("description", raw_input),
                "priority": suggested.get("priority", "medium"),
                "tags": suggested.get("tags", ["auto-triage"])
            })
            ticket_data = ticket_res.structured_content
            state_preserver.record_step(session_id, "taskflow_create_task", suggested, ticket_data)

            output["action_taken"] = "TASK_CREATED"
            output["created_task"] = ticket_data

            if event_callback:
                await event_callback("action_task_created", ticket_data)
        else:
            output["action_taken"] = "SEMANTIC_INDEXED"
            output["semantic_reference"] = triage_data.get("semantic_link", {})

            if event_callback:
                await event_callback("action_semantic_indexed", triage_data.get("semantic_link", {}))

        return output


# ─── Workflow C: Contextual Daily Initialization ─────────────────────────────

class ContextualDailyEngine:
    """
    Workflow C: Memory -> Task -> Resource
    Trigger: System cron-job at the start of the day.
    Execution: Router queries Personality Module for focus blocks & constraints ->
               Router queries Task Tracker for active backlog ->
               Router queries Resource Tracker for financial runway & resources ->
               Router synthesizes a dynamically prioritized daily queue, attaching
               relevant links from the Resource Tracker to each ticket.
    """
    def __init__(self, executor=dag_executor):
        self.executor = executor

    async def initialize_daily_queue(
        self,
        event_callback: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None
    ) -> Dict[str, Any]:
        session_id = state_preserver.create_session({"workflow": "workflow_c_daily_initialization"})

        if event_callback:
            await event_callback("daily_init_start", {"timestamp": datetime.datetime.now().isoformat()})

        # 1. Personality Constraints
        p_res = await hawkeye_unified_hub.call_tool("personality_get_daily_constraints", {})
        constraints = p_res.structured_content
        state_preserver.record_step(session_id, "personality_constraints", {}, constraints)

        # 2. Task Backlog
        t_res = await hawkeye_unified_hub.call_tool("taskflow_get_backlog", {"limit": 10})
        backlog = t_res.structured_content if isinstance(t_res.structured_content, list) else t_res.structured_content.get("result", [])
        state_preserver.record_step(session_id, "task_backlog", {}, {"count": len(backlog)})

        # 3. Resource Tracker Runway & Active Reference Assets
        r_res = await hawkeye_unified_hub.call_tool("resource_get_runway", {})
        runway = r_res.structured_content

        res_list = await hawkeye_unified_hub.call_tool("resource_list", {})
        resources = res_list.structured_content if isinstance(res_list.structured_content, list) else res_list.structured_content.get("result", [])
        state_preserver.record_step(session_id, "resource_runway", {}, runway)

        # 4. Contextual Daily Synthesis
        # Match resources to tasks based on tags/keywords
        daily_queue = []
        avoidance = [a.lower() for a in constraints.get("avoidance_triggers", [])]
        focus_blocks = constraints.get("focus_blocks_recommended", [])

        for idx, task in enumerate(backlog[:5]):
            # Check if task conflicts with acute avoidance triggers
            title_lower = task.get("title", "").lower()
            conflicts_avoidance = any(av in title_lower for av in avoidance)

            # Match helpful resources
            matched_links = []
            for r in resources:
                r_cat = r.get("category", "").lower()
                r_name = r.get("name", "").lower()
                task_tags = [t.lower() for t in task.get("tags", [])]
                if any(tag in r_cat or tag in r_name for tag in task_tags) or r.get("url"):
                    if r.get("url") and r.get("url") not in [m["url"] for m in matched_links]:
                        matched_links.append({
                            "name": r.get("name"),
                            "url": r.get("url"),
                            "type": r.get("type")
                        })

            daily_queue.append({
                "rank": idx + 1,
                "task_id": task.get("id"),
                "title": task.get("title"),
                "priority": task.get("priority"),
                "tags": task.get("tags"),
                "assigned_focus_block": focus_blocks[idx % len(focus_blocks)]["block"] if focus_blocks else "General Sprint",
                "avoidance_warning": conflicts_avoidance,
                "attached_resource_links": matched_links[:2]
            })

        synthesis = {
            "session_id": session_id,
            "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "north_star": constraints.get("north_star_90_day"),
            "weekly_burn_rate": constraints.get("weekly_burn_rate"),
            "runway_months": runway.get("runway_months"),
            "execution_style": constraints.get("execution_style"),
            "prioritized_daily_queue": daily_queue,
            "total_backlog_items": len(backlog)
        }

        state_preserver.record_step(session_id, "daily_synthesis", {}, synthesis)

        if event_callback:
            await event_callback("daily_init_complete", synthesis)

        return synthesis


experience_capitalization = ExperienceCapitalizationEngine()
resource_triage_engine = ResourceTriageEngine()
contextual_daily_engine = ContextualDailyEngine()
