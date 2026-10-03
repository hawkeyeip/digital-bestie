"""
Resource Tracker MCP Server (FastMCP)
Encapsulates the Resource Tracker repository (/Users/brandonheisey/Resource-Tracker)
and Digital Bestie's Superbrain knowledge vault (~/.digital-bestie/superbrain.json).
Exposes tools for adding resources, semantic triage of raw URLs/snippets/PDFs,
and financial runway analytics.
"""

import datetime
import json
import logging
import os
import re
import uuid
from typing import List, Dict, Any, Optional
from fastmcp import FastMCP
from pydantic import BaseModel, Field

from rag.ingestion import ingestion_pipeline
from mcp_servers.personality_mcp import load_user_profile

logger = logging.getLogger(__name__)

RESOURCE_DATA_PATH = os.environ.get(
    "RESOURCE_DATA_PATH",
    "/Users/brandonheisey/Resource-Tracker/data.json"
)
SUPERBRAIN_PATH = os.path.expanduser("~/.digital-bestie/superbrain.json")

resource_tracker_mcp = FastMCP("ResourceTrackerServer")


def load_resources() -> List[Dict[str, Any]]:
    """Load resources from Resource Tracker storage or fallback mock seed."""
    if os.path.exists(RESOURCE_DATA_PATH):
        try:
            with open(RESOURCE_DATA_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                return data.get("resources", [])
        except Exception as e:
            logger.error(f"Error loading {RESOURCE_DATA_PATH}: {e}")

    # Seed data if empty
    initial_resources = [
        {
            "id": "res-delta-1",
            "name": "Delta Flight Credit",
            "type": "credit",
            "category": "Travel",
            "cost": 0.0,
            "value": 250.0,
            "currency": "USD",
            "billingCycle": "one-time",
            "expiryDate": "2026-11-15",
            "url": "https://www.delta.com",
            "notes": "Reference code: DL-9831A92. Received due to flight delay.",
            "status": "active"
        },
        {
            "id": "res-qdrant-docs",
            "name": "Qdrant Vector Database Official Architecture Guide",
            "type": "document",
            "category": "Software/SaaS",
            "cost": 0.0,
            "value": 0.0,
            "currency": "USD",
            "billingCycle": "one-time",
            "expiryDate": None,
            "url": "https://qdrant.tech/documentation/",
            "notes": "Local deployment documentation, vector similarity metrics, and filter conditions.",
            "status": "active"
        },
        {
            "id": "res-github-sub",
            "name": "GitHub Copilot Enterprise",
            "type": "subscription",
            "category": "Software/SaaS",
            "cost": 19.0,
            "value": 200.0,
            "currency": "USD",
            "billingCycle": "monthly",
            "expiryDate": None,
            "url": "https://github.com",
            "notes": "Primary coding copilot license",
            "status": "active"
        }
    ]
    save_resources(initial_resources)
    return initial_resources


def save_resources(resources: List[Dict[str, Any]]) -> None:
    """Save resources to persistent JSON storage."""
    os.makedirs(os.path.dirname(RESOURCE_DATA_PATH), exist_ok=True)
    temp_path = f"{RESOURCE_DATA_PATH}.tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(resources, f, indent=2)
    os.replace(temp_path, RESOURCE_DATA_PATH)


# --- Tools ---

@resource_tracker_mcp.tool()
def add_resource(
    name: str,
    resource_type: str = "document",
    category: str = "Software/SaaS",
    cost: float = 0.0,
    value: float = 0.0,
    currency: str = "USD",
    url: str = "",
    notes: str = "",
    content: str = ""
) -> Dict[str, Any]:
    """Add a new resource, license, or document to the tracker."""
    resources = load_resources()
    res_id = f"res-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    new_item = {
        "id": res_id,
        "name": name,
        "type": resource_type,
        "category": category,
        "cost": float(cost),
        "value": float(value),
        "currency": currency,
        "url": url,
        "notes": notes,
        "content": content,
        "status": "active",
        "created_at": now_iso
    }
    resources.append(new_item)
    save_resources(resources)

    # Ingest text/content into Qdrant vector memory
    qdrant_ids = ingestion_pipeline.ingest_resource(
        resource_id=res_id,
        name=name,
        content=f"{notes}\n{content}",
        category=category,
        source_url=url,
        resource_type=resource_type
    )
    new_item["qdrant_point_ids"] = qdrant_ids
    return new_item


@resource_tracker_mcp.tool()
def list_resources(
    category: Optional[str] = None,
    resource_type: Optional[str] = None
) -> List[Dict[str, Any]]:
    """List resources with optional category and type filtering."""
    resources = load_resources()
    filtered = resources
    if category:
        filtered = [r for r in filtered if r.get("category", "").lower() == category.lower()]
    if resource_type:
        filtered = [r for r in filtered if r.get("type", "").lower() == resource_type.lower()]
    return filtered


@resource_tracker_mcp.tool()
def triage_incoming_resource(
    raw_input: str,
    source_url: str = "",
    content_type: str = "auto"
) -> Dict[str, Any]:
    """
    Triage a raw input (URL, code snippet, PDF text, or note).
    Determines if it is 'actionable' (requires generating a TaskFlow ticket)
    or 'referential' (embeds into vector memory and links to active tasks).
    """
    raw_lower = raw_input.lower()
    
    # Action indicators
    action_keywords = [
        "todo", "fix", "deploy", "implement", "bug", "urgent", "action required",
        "invoice", "pay", "submit", "deadline", "pr #", "refactor", "setup"
    ]
    is_actionable = any(k in raw_lower for k in action_keywords) or (
        "http" in source_url and ("github.com/issues" in source_url or "github.com/pull" in source_url)
    )

    resource_id = f"res-triage-{uuid.uuid4().hex[:6]}"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Extract name/title from first line or snippet
    first_line = raw_input.strip().split("\n")[0][:80]
    inferred_name = first_line if first_line else "Triaged Ingestion Resource"

    # Always embed into Qdrant for semantic reference
    point_ids = ingestion_pipeline.ingest_resource(
        resource_id=resource_id,
        name=inferred_name,
        content=raw_input,
        category="Triaged Ingestion",
        source_url=source_url,
        resource_type="triage_item"
    )

    triage_result = {
        "resource_id": resource_id,
        "name": inferred_name,
        "source_url": source_url,
        "is_actionable": is_actionable,
        "triage_verdict": "ACTIONABLE" if is_actionable else "REFERENTIAL",
        "qdrant_point_ids": point_ids,
        "timestamp": now_iso
    }

    if is_actionable:
        # Determine priority
        priority = "high" if any(w in raw_lower for w in ["urgent", "critical", "immediately", "broken"]) else "medium"
        triage_result["suggested_task"] = {
            "title": f"Action: {inferred_name}",
            "description": f"Auto-generated from incoming resource triage ({source_url or 'snippet'}):\n\n{raw_input[:300]}",
            "priority": priority,
            "tags": ["auto-triage", "inbox"]
        }
    else:
        triage_result["semantic_link"] = {
            "status": "embedded_in_memory",
            "message": "Resource is purely referential; indexed in Qdrant and linked to semantic knowledge base."
        }

    return triage_result


@resource_tracker_mcp.tool()
def get_financial_runway() -> Dict[str, Any]:
    """
    Calculate financial runway by comparing weekly burn rate from Personality
    baseline against total liquid cash reserves and available credits.
    """
    profile = load_user_profile()
    baseline = profile.get("user_profile", {}).get("identity_and_baseline", {})
    weekly_burn = baseline.get("burn_rate_weekly", 150.0)
    cash_reserve = baseline.get("liquid_cash_reserve", 1000.0) or 0.0

    resources = load_resources()
    total_credit_value = sum(
        r.get("value", 0.0) for r in resources if r.get("type") == "credit" and r.get("status") == "active"
    )
    monthly_subs = sum(
        r.get("cost", 0.0) for r in resources if r.get("type") == "subscription" and r.get("billingCycle") == "monthly"
    )

    effective_burn_weekly = max(1.0, weekly_burn + (monthly_subs / 4.33))
    total_liquidity = cash_reserve + total_credit_value
    runway_weeks = round(total_liquidity / effective_burn_weekly, 1)
    runway_months = round(runway_weeks / 4.33, 1)

    return {
        "cash_reserve": cash_reserve,
        "credits_available": total_credit_value,
        "total_liquidity": total_liquidity,
        "weekly_burn_rate": weekly_burn,
        "monthly_subscriptions_cost": round(monthly_subs, 2),
        "effective_weekly_burn": round(effective_burn_weekly, 2),
        "runway_weeks": runway_weeks,
        "runway_months": runway_months,
        "acute_stressor": baseline.get("primary_acute_stressor", "runway")
    }


if __name__ == "__main__":
    resource_tracker_mcp.run()
