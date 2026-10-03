"""
Deterministic DAG Executor & Orchestrator
Executes multi-step directed acyclic graphs of MCP tool calls.
Supports dependency resolution, parallel tiers, variable interpolation,
persistent state preservation, and event streaming.
"""

import asyncio
import copy
import logging
import re
from typing import List, Dict, Any, Optional, Callable, Awaitable
from pydantic import BaseModel, Field

from mcp_servers.unified_hub import hawkeye_unified_hub, state_preserver

logger = logging.getLogger(__name__)


class DAGNode(BaseModel):
    id: str
    tool_name: str
    params: Dict[str, Any] = Field(default_factory=dict)
    depends_on: List[str] = Field(default_factory=list)
    description: str = ""
    is_critical: bool = True
    retries: int = 1


class DAGPlan(BaseModel):
    plan_id: str
    title: str
    nodes: List[DAGNode]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DAGExecutionResult(BaseModel):
    plan_id: str
    session_id: str
    status: str  # "SUCCESS", "PARTIAL_SUCCESS", "FAILED"
    node_results: Dict[str, Any] = Field(default_factory=dict)
    execution_order: List[str] = Field(default_factory=list)
    errors: Dict[str, str] = Field(default_factory=dict)


class DAGExecutor:
    def __init__(self, mcp_hub=hawkeye_unified_hub, preserver=state_preserver):
        self.hub = mcp_hub
        self.preserver = preserver

    def _resolve_template_string(self, text: str, context: Dict[str, Any]) -> Any:
        """
        Resolve {{step_id.field}} references from session context.
        If the entire string is '{{step_id.field}}', return the raw typed object.
        """
        full_match = re.fullmatch(r"\{\{([a-zA-Z0-9_\-\.]+)\}\}", text.strip())
        if full_match:
            path = full_match.group(1).split(".")
            val = context
            for p in path:
                if isinstance(val, dict) and p in val:
                    val = val[p]
                else:
                    return text
            return val

        # Substring replacement for multiple placeholders
        def repl(match):
            path = match.group(1).split(".")
            val = context
            for p in path:
                if isinstance(val, dict) and p in val:
                    val = val[p]
                else:
                    return match.group(0)
            return str(val)

        return re.sub(r"\{\{([a-zA-Z0-9_\-\.]+)\}\}", repl, text)

    def _resolve_params(self, params: Any, context: Dict[str, Any]) -> Any:
        """Recursively resolve template variables in parameters."""
        if isinstance(params, str):
            return self._resolve_template_string(params, context)
        elif isinstance(params, dict):
            return {k: self._resolve_params(v, context) for k, v in params.items()}
        elif isinstance(params, list):
            return [self._resolve_params(i, context) for i in params]
        return params

    def get_topological_order(self, nodes: List[DAGNode]) -> List[List[DAGNode]]:
        """
        Organize nodes into parallel execution tiers using topological sort.
        Detects cycles and raises ValueError if cyclic dependency found.
        """
        node_map = {n.id: n for n in nodes}
        in_degree = {n.id: len(n.depends_on) for n in nodes}
        dependents = {n.id: [] for n in nodes}

        for n in nodes:
            for dep in n.depends_on:
                if dep not in node_map:
                    raise ValueError(f"Node '{n.id}' depends on non-existent node '{dep}'")
                dependents[dep].append(n.id)

        tiers: List[List[DAGNode]] = []
        current_tier = [node_map[nid] for nid, deg in in_degree.items() if deg == 0]

        visited_count = 0
        while current_tier:
            tiers.append(current_tier)
            visited_count += len(current_tier)
            next_tier = []
            for n in current_tier:
                for dep_id in dependents[n.id]:
                    in_degree[dep_id] -= 1
                    if in_degree[dep_id] == 0:
                        next_tier.append(node_map[dep_id])
            current_tier = next_tier

        if visited_count != len(nodes):
            raise ValueError("Cycle detected in DAG execution plan!")

        return tiers

    async def execute_plan(
        self,
        plan: DAGPlan,
        session_id: Optional[str] = None,
        event_callback: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None
    ) -> DAGExecutionResult:
        """
        Execute the DAG plan deterministically.
        Streams events via event_callback (SSE compatible).
        """
        sess_id = session_id or self.preserver.create_session({"plan_id": plan.plan_id, "title": plan.title})
        session = self.preserver.get_session(sess_id)
        context = session["context"]

        tiers = self.get_topological_order(plan.nodes)
        node_results: Dict[str, Any] = {}
        execution_order: List[str] = []
        errors: Dict[str, str] = {}

        if event_callback:
            await event_callback("plan_start", {
                "plan_id": plan.plan_id,
                "title": plan.title,
                "session_id": sess_id,
                "tiers_count": len(tiers)
            })

        for tier_idx, tier in enumerate(tiers):
            logger.info(f"Executing DAG Tier {tier_idx + 1}/{len(tiers)} ({len(tier)} nodes)")

            for node in tier:
                execution_order.append(node.id)
                resolved_params = self._resolve_params(node.params, context)

                if event_callback:
                    await event_callback("node_start", {
                        "node_id": node.id,
                        "tool_name": node.tool_name,
                        "description": node.description,
                        "params": resolved_params
                    })

                # Execute MCP Tool with retry support
                success = False
                res_output = None
                last_err = ""

                for attempt in range(node.retries + 1):
                    try:
                        call_res = await self.hub.call_tool(node.tool_name, resolved_params)
                        if call_res.is_error:
                            last_err = f"Tool returned error: {call_res.content}"
                        else:
                            success = True
                            # Prefer structured content or first text content
                            if call_res.structured_content:
                                res_output = call_res.structured_content
                                # Unpack single result wrapper if present
                                if isinstance(res_output, dict) and "result" in res_output and len(res_output) == 1:
                                    res_output = res_output["result"]
                            elif call_res.content:
                                res_output = call_res.content[0].text
                            else:
                                res_output = {}
                            break
                    except Exception as e:
                        last_err = str(e)
                        logger.warning(f"Error invoking {node.tool_name} on attempt {attempt+1}: {e}")

                if success:
                    node_results[node.id] = res_output
                    # Save into context for downstream steps
                    context[node.id] = res_output
                    self.preserver.record_step(sess_id, node.id, resolved_params, res_output if isinstance(res_output, dict) else {"result": res_output})

                    if event_callback:
                        await event_callback("node_complete", {
                            "node_id": node.id,
                            "tool_name": node.tool_name,
                            "output": res_output
                        })
                else:
                    errors[node.id] = last_err
                    logger.error(f"Node {node.id} ({node.tool_name}) failed: {last_err}")
                    if event_callback:
                        await event_callback("node_error", {
                            "node_id": node.id,
                            "tool_name": node.tool_name,
                            "error": last_err
                        })
                    if node.is_critical:
                        logger.error(f"Critical node {node.id} failed. Halting DAG execution.")
                        break

            if errors and any(node_map[nid].is_critical for nid in errors if (node_map := {n.id: n for n in plan.nodes}).get(nid)):
                break

        overall_status = "SUCCESS"
        if errors:
            overall_status = "FAILED" if len(errors) == len(plan.nodes) else "PARTIAL_SUCCESS"

        if event_callback:
            await event_callback("plan_complete", {
                "plan_id": plan.plan_id,
                "status": overall_status,
                "session_id": sess_id,
                "executed_nodes": execution_order
            })

        return DAGExecutionResult(
            plan_id=plan.plan_id,
            session_id=sess_id,
            status=overall_status,
            node_results=node_results,
            execution_order=execution_order,
            errors=errors
        )


dag_executor = DAGExecutor()
