"""
Hawkeye Agent Stack — Automated Test Suite
Verifies all 4 Phases:
  - Phase 1: Central Router Agent & DAG Executor
  - Phase 2: Protocol Layer (FastMCP 4 Silos + Unified Hub + State Preservation)
  - Phase 3: Unified Memory & RAG Pipeline (Qdrant + Ingestion + Context Injection)
  - Phase 4: Inter-Module Workflows (Workflow A, B, and C)
"""

import asyncio
import os
import sys
import unittest

# Ensure hawkeye-stack is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from rag.embeddings import embeddings_service
from rag.qdrant_mgr import qdrant_manager
from rag.ingestion import ingestion_pipeline
from rag.context_injector import context_injector

from mcp_servers.task_tracker_mcp import task_tracker_mcp
from mcp_servers.personality_mcp import personality_mcp
from mcp_servers.resume_architect_mcp import resume_architect_mcp
from mcp_servers.resource_tracker_mcp import resource_tracker_mcp
from mcp_servers.unified_hub import hawkeye_unified_hub, state_preserver

from router.dag_executor import DAGPlan, DAGNode, dag_executor
from router.central_router import central_router
from router.workflows import experience_capitalization, resource_triage_engine, contextual_daily_engine


class TestHawkeyeAgenticSystem(unittest.IsolatedAsyncioTestCase):

    async def test_01_rag_and_vector_pipeline(self):
        print("\n[TEST 1] Testing Qdrant Vector Engine & Ingestion Pipeline...")
        # 1. Embedding generation
        vec = embeddings_service.get_embedding("Autonomous agent nervous system")
        self.assertEqual(len(vec), 768, "Embedding vector must have dimension 768")

        # 2. Ingestion
        pids = ingestion_pipeline.ingest_resource(
            resource_id="test-rag-doc",
            name="Agentic Nervous System Specs",
            content="A central nervous system connects isolated silos through Model Context Protocol and DAG routing.",
            category="Architecture"
        )
        self.assertGreater(len(pids), 0, "Ingestion must return at least one Qdrant point ID")

        # 3. Pre-flight context injection
        injected = context_injector.inject_context("Tell me about the agentic nervous system")
        self.assertIn("UNIFIED MEMORY CONTEXT", injected)
        print("  -> RAG and Qdrant vector engine: PASS")

    async def test_02_fastmcp_silo_servers(self):
        print("\n[TEST 2] Testing 4 FastMCP Silo Servers...")
        # Task Tracker
        tt_tools = await task_tracker_mcp.list_tools()
        tt_names = [t.name for t in tt_tools]
        self.assertIn("list_tasks", tt_names)
        self.assertIn("resolve_task", tt_names)

        # Personality
        p_tools = await personality_mcp.list_tools()
        p_names = [t.name for t in p_tools]
        self.assertIn("get_dossier", p_names)
        self.assertIn("calibrate_trait", p_names)

        # Resume Architect
        ra_tools = await resume_architect_mcp.list_tools()
        ra_names = [t.name for t in ra_tools]
        self.assertIn("generate_master_bullet", ra_names)
        self.assertIn("query_skills_matrix", ra_names)

        # Resource Tracker
        rt_tools = await resource_tracker_mcp.list_tools()
        rt_names = [t.name for t in rt_tools]
        self.assertIn("triage_incoming_resource", rt_names)
        self.assertIn("get_financial_runway", rt_names)

        # Unified Hub
        hub_tools = await hawkeye_unified_hub.list_tools()
        self.assertGreaterEqual(len(hub_tools), 21, "Unified Hub must expose at least 21 cross-silo tools")
        hub_names = [t.name for t in hub_tools]
        self.assertIn("metaprompt_synthesize", hub_names)
        print(f"  -> All 4 FastMCP silos and Unified Hub: PASS ({len(hub_tools)} tools exposed, including metaprompt_synthesize)")

    async def test_03_state_preservation(self):
        print("\n[TEST 3] Testing Cross-Silo State Preservation...")
        sess_id = state_preserver.create_session({"init_var": "agent_alpha"})
        self.assertTrue(sess_id.startswith("sess-"))

        state_preserver.record_step(sess_id, "step_mock", {"input": "test"}, {"result_code": 200})
        sess = state_preserver.get_session(sess_id)
        self.assertEqual(len(sess["step_history"]), 1)
        self.assertEqual(sess["context"]["step_mock_output"]["result_code"], 200)
        print("  -> State preservation across multi-step session: PASS")

    async def test_04_dag_executor_deterministic_engine(self):
        print("\n[TEST 4] Testing Deterministic DAG Executor & Variable Interpolation...")
        plan = DAGPlan(
            plan_id="test-plan-interpol",
            title="Verification Plan",
            nodes=[
                DAGNode(
                    id="stats_node",
                    tool_name="taskflow_get_stats",
                    params={}
                ),
                DAGNode(
                    id="create_node",
                    tool_name="taskflow_create_task",
                    params={
                        "title": "Automated Verified Task",
                        "description": "Total tasks at check time: {{stats_node.total_tasks}}",
                        "priority": "low"
                    },
                    depends_on=["stats_node"]
                )
            ]
        )
        res = await dag_executor.execute_plan(plan)
        self.assertEqual(res.status, "SUCCESS")
        self.assertEqual(res.execution_order, ["stats_node", "create_node"])
        self.assertIn("Total tasks at check time:", res.node_results["create_node"]["description"])
        print("  -> DAG execution, topological ordering & interpolation: PASS")

    async def test_05_workflow_a_experience_capitalization(self):
        print("\n[TEST 5] Testing Workflow A: Experience Capitalization (Task -> Resume -> Memory)...")
        # 1. Create a task in TaskFlow
        task_res = await hawkeye_unified_hub.call_tool("taskflow_create_task", {
            "title": "Build Distributed Vector Synchronization Protocol",
            "description": "High-throughput synchronization between local and edge Qdrant instances",
            "priority": "critical"
        })
        task_id = task_res.structured_content["id"]

        # 2. Execute Workflow A
        res = await experience_capitalization.execute(
            task_id=task_id,
            metrics={"throughput_gain": "4.5x", "latency_reduction": "95%"},
            tools=["FastMCP", "Qdrant", "Ollama", "SQLite"],
            deliverables=["Vector Synchronization Daemon", "SSE Stream Gateway"]
        )
        self.assertEqual(res.status, "SUCCESS")
        self.assertIn("step_generate_bullet", res.node_results)
        self.assertIn("step_append_bullet", res.node_results)
        self.assertIn("step_calibrate_personality", res.node_results)

        bullet = res.node_results["step_generate_bullet"]["bullet_text"]
        self.assertTrue(bullet.startswith("Architected"))
        self.assertIn("4.5x", bullet)
        print(f"  -> Generated Master Bullet: \"{bullet}\"")
        print("  -> Workflow A (Task -> Resume -> Memory): PASS")

    async def test_06_workflow_b_resource_triage(self):
        print("\n[TEST 6] Testing Workflow B: Resource Triage & Delegation (Resource -> Router -> Task)...")
        # Actionable resource
        res_actionable = await resource_triage_engine.process_resource(
            raw_input="CRITICAL BUG: Electron safeStorage decrypt fails on macOS 15. Fix immediately before release.",
            source_url="https://github.com/hawkeyeip/digital-bestie/issues/45"
        )
        self.assertEqual(res_actionable["action_taken"], "TASK_CREATED")
        self.assertIsNotNone(res_actionable.get("created_task"))

        # Referential resource
        res_referential = await resource_triage_engine.process_resource(
            raw_input="FastMCP Architecture Whitepaper: Designing High-Fidelity Agent Tool Interfaces with Pydantic schemas and SSE transport.",
            source_url="https://modelcontextprotocol.io/docs"
        )
        self.assertEqual(res_referential["action_taken"], "SEMANTIC_INDEXED")
        print("  -> Workflow B (Resource -> Router -> Task): PASS")

    async def test_07_workflow_c_contextual_daily_initialization(self):
        print("\n[TEST 7] Testing Workflow C: Contextual Daily Initialization (Memory -> Task -> Resource)...")
        res = await contextual_daily_engine.initialize_daily_queue()
        self.assertIn("prioritized_daily_queue", res)
        self.assertGreater(len(res["prioritized_daily_queue"]), 0)
        self.assertIsNotNone(res.get("runway_months"))
        self.assertIsNotNone(res.get("north_star"))

        top_task = res["prioritized_daily_queue"][0]
        self.assertIn("assigned_focus_block", top_task)
        print(f"  -> Daily Queue Top Item: \"{top_task['title']}\" (Priority: {top_task['priority']}, Focus: {top_task['assigned_focus_block']})")
        print("  -> Workflow C (Memory -> Task -> Resource): PASS")


if __name__ == "__main__":
    unittest.main(verbosity=2)
