"""
Personality Module MCP Server (FastMCP)
Encapsulates Digital Bestie's Living Dossier & Calibration Matrix (~/.digital-bestie/user_profile.json).
Exposes tools for behavioral profiling, trait calibration, mastery milestone logging, and daily constraints.
"""

import datetime
import json
import logging
import os
import uuid
from typing import List, Dict, Any, Optional
from fastmcp import FastMCP
from pydantic import BaseModel, Field

from rag.ingestion import ingestion_pipeline

logger = logging.getLogger(__name__)

USER_PROFILE_PATH = os.path.expanduser("~/.digital-bestie/user_profile.json")

personality_mcp = FastMCP("PersonalityServer")


def load_user_profile() -> Dict[str, Any]:
    """Read the user profile from disk."""
    if not os.path.exists(USER_PROFILE_PATH):
        # Default scaffold if empty
        return {
            "user_profile": {
                "identity_and_baseline": {
                    "current_living_situation": "active founder",
                    "liquid_cash_reserve": 5000.0,
                    "hard_cash_floor": 1000.0,
                    "burn_rate_weekly": 150.0,
                    "primary_acute_stressor": "runway & deployment speed",
                    "active_location": "macOS workspace"
                },
                "cognitive_and_behavioral_profile": {
                    "decision_bias": "action-oriented",
                    "primary_avoidance_triggers": ["administrative friction"],
                    "escape_mechanisms": ["context-switching"],
                    "tone_preference": "direct, sharp, strategic",
                    "execution_style": "execution_first"
                },
                "goal_and_boundary_matrix": {
                    "north_star_90_day": "Agentic ecosystem autonomous execution",
                    "anti_goals": ["premature optimization"],
                    "rate_floor": "150/hr",
                    "deposit_policy": "50% upfront",
                    "client_red_flags": ["vague scope"]
                },
                "skill_calibrations": {},
                "secret_venture_incubator": {
                    "active_project_name": "Hawkeye Digital Bestie",
                    "core_skills_leveraged": [],
                    "milestones": []
                }
            }
        }
    with open(USER_PROFILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_user_profile(data: Dict[str, Any]) -> None:
    """Save the updated user profile to disk safely."""
    os.makedirs(os.path.dirname(USER_PROFILE_PATH), exist_ok=True)
    temp_path = f"{USER_PROFILE_PATH}.tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(temp_path, USER_PROFILE_PATH)


# --- Tools ---

@personality_mcp.tool()
def get_dossier() -> Dict[str, Any]:
    """Retrieve the full behavioral dossier, identity baseline, and calibration profile."""
    profile = load_user_profile()
    return profile.get("user_profile", {})


@personality_mcp.tool()
def calibrate_trait(
    domain: str,
    confidence_score: float,
    notes: str = ""
) -> Dict[str, Any]:
    """
    Calibrate agentic confidence and user mastery level in a specific skill domain (0.0 to 1.0).
    Saves to profile and indexes the calibration milestone in Qdrant memory.
    """
    profile = load_user_profile()
    user_p = profile.setdefault("user_profile", {})
    calibrations = user_p.setdefault("skill_calibrations", {})

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record = {
        "domain": domain,
        "confidence_score": max(0.0, min(1.0, confidence_score)),
        "notes": notes,
        "updated_at": now_iso
    }
    calibrations[domain] = record
    save_user_profile(profile)

    # Ingest milestone into Qdrant memory
    qdrant_id = ingestion_pipeline.ingest_personality_milestone(
        domain=domain,
        confidence_score=record["confidence_score"],
        milestone_text=notes or f"Calibrated domain {domain} to {record['confidence_score']:.2f}",
        epic_name="Direct Calibration",
        metrics={"confidence": record["confidence_score"]}
    )
    record["qdrant_point_id"] = qdrant_id
    return record


@personality_mcp.tool()
def log_confidence_milestone(
    domain: str,
    epic_name: str,
    metrics: Dict[str, Any] = {},
    outcome: str = ""
) -> Dict[str, Any]:
    """
    Log an achieved mastery milestone when an epic or high-leverage project is resolved.
    Increments confidence in that domain and embeds the retrospective into vector memory.
    """
    profile = load_user_profile()
    user_p = profile.setdefault("user_profile", {})
    calibrations = user_p.setdefault("skill_calibrations", {})

    current_conf = calibrations.get(domain, {}).get("confidence_score", 0.70)
    # Calibrate upward upon successful epic resolution (+0.05, max 1.0)
    new_conf = min(1.0, round(current_conf + 0.05, 2))
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    milestone_entry = {
        "id": f"ms-{uuid.uuid4().hex[:8]}",
        "domain": domain,
        "epic_name": epic_name,
        "outcome": outcome,
        "metrics": metrics,
        "confidence_at_time": new_conf,
        "timestamp": now_iso
    }

    calibrations[domain] = {
        "domain": domain,
        "confidence_score": new_conf,
        "last_milestone": epic_name,
        "updated_at": now_iso
    }

    incubator = user_p.setdefault("secret_venture_incubator", {})
    milestones = incubator.setdefault("milestones", [])
    milestones.append(milestone_entry)
    save_user_profile(profile)

    # Vector ingestion
    qdrant_id = ingestion_pipeline.ingest_personality_milestone(
        domain=domain,
        confidence_score=new_conf,
        milestone_text=outcome or f"Resolved epic: {epic_name}",
        epic_name=epic_name,
        metrics=metrics
    )
    milestone_entry["qdrant_point_id"] = qdrant_id
    milestone_entry["new_confidence"] = new_conf
    return milestone_entry


@personality_mcp.tool()
def get_daily_constraints() -> Dict[str, Any]:
    """
    Retrieve psychological constraints, energy parameters, avoidance triggers,
    and tone preferences for daily workflow planning.
    """
    profile = load_user_profile()
    user_p = profile.get("user_profile", {})
    baseline = user_p.get("identity_and_baseline", {})
    cognitive = user_p.get("cognitive_and_behavioral_profile", {})
    goals = user_p.get("goal_and_boundary_matrix", {})

    return {
        "execution_style": cognitive.get("execution_style", "execution_first"),
        "tone_preference": cognitive.get("tone_preference", "digital_bestie"),
        "avoidance_triggers": cognitive.get("primary_avoidance_triggers", []),
        "acute_stressor": baseline.get("primary_acute_stressor", ""),
        "weekly_burn_rate": baseline.get("burn_rate_weekly", 0.0),
        "north_star_90_day": goals.get("north_star_90_day", "Autonomous agency"),
        "focus_blocks_recommended": [
            {"block": "Deep Work 1 (Morning)", "duration_min": 90, "type": "high_leverage"},
            {"block": "Triage & Review (Midday)", "duration_min": 45, "type": "administrative"},
            {"block": "Sprint Execution (Afternoon)", "duration_min": 120, "type": "implementation"}
        ]
    }


if __name__ == "__main__":
    personality_mcp.run()
