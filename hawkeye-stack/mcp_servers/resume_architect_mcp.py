"""
Resume Architect MCP Server (FastMCP)
Encapsulates the Resume Architect repository (/Users/brandonheisey/Projects/github-semver-pipeline/Resume-Architect).
Exposes tools for generating high-impact master resume bullets (XYZ pattern),
updating the master resume JSON store, and querying the dynamic skills matrix.
"""

import datetime
import json
import logging
import os
import uuid
from typing import List, Dict, Any, Optional
from fastmcp import FastMCP
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

MASTER_RESUME_PATH = os.environ.get(
    "MASTER_RESUME_PATH",
    "/Users/brandonheisey/Projects/github-semver-pipeline/Resume-Architect/data/master_resume.json"
)

resume_architect_mcp = FastMCP("ResumeArchitectServer")


def load_master_resume() -> Dict[str, Any]:
    """Load or initialize the master resume structure."""
    if not os.path.exists(MASTER_RESUME_PATH):
        default_data = {
            "profile": {
                "name": "Brandon Heisey",
                "title": "Principal Autonomous Systems & AI Architecture Engineer",
                "summary": "Specialist in autonomous agent architectures, local LLM orchestration, Model Context Protocol, and real-time event-driven systems."
            },
            "skills": [
                {"id": "sk-1", "name": "Model Context Protocol (FastMCP)", "category": "AI/Agentic"},
                {"id": "sk-2", "name": "Local LLM Orchestration (Ollama)", "category": "AI/Agentic"},
                {"id": "sk-3", "name": "Vector Databases (Qdrant)", "category": "Databases & RAG"},
                {"id": "sk-4", "name": "Event-Driven DAG Workflows (n8n)", "category": "Automation & DevOps"},
                {"id": "sk-5", "name": "Electron & Native Desktop Systems", "category": "Frontend/Client"}
            ],
            "experiences": [
                {
                    "id": "exp-1",
                    "role": "Lead Agentic Systems Architect",
                    "company": "Hawkeye Autonomous Systems",
                    "startDate": "2024-01",
                    "endDate": "Present",
                    "bullets": [
                        {
                            "id": "b-1",
                            "text": "Architected distributed multi-agent DAG orchestrator integrating FastMCP, Ollama, and Qdrant vector memory, decreasing manual context handoffs by 85%.",
                            "skills": ["sk-1", "sk-2", "sk-3", "sk-4"],
                            "tags": ["agentic", "architecture"]
                        }
                    ]
                }
            ],
            "last_updated": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        os.makedirs(os.path.dirname(MASTER_RESUME_PATH), exist_ok=True)
        with open(MASTER_RESUME_PATH, "w", encoding="utf-8") as f:
            json.dump(default_data, f, indent=2)
        return default_data

    with open(MASTER_RESUME_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_master_resume(data: Dict[str, Any]) -> None:
    """Save the updated master resume safely."""
    os.makedirs(os.path.dirname(MASTER_RESUME_PATH), exist_ok=True)
    temp_path = f"{MASTER_RESUME_PATH}.tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(temp_path, MASTER_RESUME_PATH)


# --- Tools ---

@resume_architect_mcp.tool()
def generate_master_bullet(
    role: str,
    action_verb: str,
    tools_used: List[str],
    metrics: str,
    outcome: str
) -> Dict[str, Any]:
    """
    Synthesize an executive-level, XYZ-formula master resume bullet:
    'Accomplished [Outcome] as measured by [Metrics] by executing [Action Verb] with [Tools].'
    """
    tools_str = ", ".join(tools_used) if tools_used else "modern engineering toolchains"
    action_verb_clean = action_verb.strip().capitalize()
    
    # Executive format
    bullet_text = (
        f"{action_verb_clean} {outcome.strip().rstrip('.')} leveraging {tools_str}, "
        f"achieving {metrics.strip().rstrip('.')}."
    )

    return {
        "bullet_id": f"b-{uuid.uuid4().hex[:8]}",
        "role": role,
        "bullet_text": bullet_text,
        "action_verb": action_verb_clean,
        "tools_used": tools_used,
        "metrics": metrics,
        "outcome": outcome
    }


@resume_architect_mcp.tool()
def append_bullet_to_resume(
    role: str,
    company: str,
    bullet_text: str,
    skills: List[str] = [],
    tags: List[str] = []
) -> Dict[str, Any]:
    """
    Append a verified master bullet to the user's master resume and update the skills registry.
    """
    resume = load_master_resume()
    experiences = resume.setdefault("experiences", [])

    # Find matching experience or create new
    target_exp = None
    for exp in experiences:
        if exp.get("role", "").lower() == role.lower() and exp.get("company", "").lower() == company.lower():
            target_exp = exp
            break

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if not target_exp:
        target_exp = {
            "id": f"exp-{uuid.uuid4().hex[:6]}",
            "role": role,
            "company": company,
            "startDate": now_iso[:7],
            "endDate": "Present",
            "bullets": []
        }
        experiences.insert(0, target_exp)

    bullet_id = f"b-{uuid.uuid4().hex[:8]}"
    bullet_entry = {
        "id": bullet_id,
        "text": bullet_text,
        "skills": skills,
        "tags": tags,
        "created_at": now_iso
    }
    target_exp.setdefault("bullets", []).append(bullet_entry)

    # Ensure skills exist in skill matrix
    existing_skills = {s["name"].lower(): s for s in resume.setdefault("skills", [])}
    for sk in skills:
        if sk.lower() not in existing_skills:
            new_sk_obj = {
                "id": f"sk-{uuid.uuid4().hex[:6]}",
                "name": sk,
                "category": "Engineered Competency"
            }
            resume["skills"].append(new_sk_obj)
            existing_skills[sk.lower()] = new_sk_obj

    resume["last_updated"] = now_iso
    save_master_resume(resume)

    return {
        "status": "appended",
        "bullet_id": bullet_id,
        "role": role,
        "company": company,
        "bullet_text": bullet_text,
        "total_bullets_in_experience": len(target_exp["bullets"])
    }


@resume_architect_mcp.tool()
def query_skills_matrix() -> Dict[str, Any]:
    """Query the verified skills matrix and bullet counts for each skill."""
    resume = load_master_resume()
    skills = resume.get("skills", [])
    experiences = resume.get("experiences", [])

    skill_counts: Dict[str, int] = {}
    for exp in experiences:
        for b in exp.get("bullets", []):
            for sk in b.get("skills", []):
                skill_counts[sk] = skill_counts.get(sk, 0) + 1

    matrix = []
    for s in skills:
        s_id = s.get("id")
        s_name = s.get("name")
        count = skill_counts.get(s_id, 0) + skill_counts.get(s_name, 0)
        matrix.append({
            "id": s_id,
            "name": s_name,
            "category": s.get("category", "General"),
            "evidence_count": count
        })

    return {
        "total_skills": len(matrix),
        "skills": matrix
    }


@resume_architect_mcp.tool()
def get_master_resume() -> Dict[str, Any]:
    """Retrieve the complete structured master resume."""
    return load_master_resume()


if __name__ == "__main__":
    resume_architect_mcp.run()
