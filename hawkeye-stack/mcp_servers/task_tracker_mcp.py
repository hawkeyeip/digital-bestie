"""
Task Tracker MCP Server (FastMCP)
Encapsulates TaskFlow SQLite database & REST API with strictly typed schemas.
Exposes tools for task listing, creation, updates, resolution, and backlog analytics.
"""

import datetime
import json
import logging
import os
import sqlite3
import uuid
from typing import List, Dict, Any, Optional
from fastmcp import FastMCP
from pydantic import BaseModel, Field

from rag.ingestion import ingestion_pipeline

logger = logging.getLogger(__name__)

TASKFLOW_DB_PATH = os.environ.get(
    "TASKFLOW_DB_PATH",
    "/Users/brandonheisey/Projects/taskflow/data/tasks.db"
)

# Initialize FastMCP Server
task_tracker_mcp = FastMCP("TaskTrackerServer")


def get_db_connection() -> sqlite3.Connection:
    """Connect to TaskFlow SQLite database with Row factory and WAL mode."""
    os.makedirs(os.path.dirname(TASKFLOW_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(TASKFLOW_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done', 'archived')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical', 'high', 'medium', 'low')),
      tags TEXT DEFAULT '[]',
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      position INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT
    );
    """)
    conn.commit()
    return conn


# --- Schemas ---

class TaskItem(BaseModel):
    id: str
    title: str
    description: str = ""
    status: str
    priority: str
    tags: List[str] = Field(default_factory=list)
    due_date: Optional[str] = None
    created_at: str
    updated_at: str
    position: int = 0
    completed_at: Optional[str] = None


class ResolutionPayload(BaseModel):
    task_id: str
    title: str
    status: str
    completed_at: str
    metrics: Dict[str, Any] = Field(default_factory=dict)
    tools_used: List[str] = Field(default_factory=list)
    deliverables: List[str] = Field(default_factory=list)
    completion_notes: str = ""
    qdrant_point_id: Optional[str] = None


# --- Tools ---

@task_tracker_mcp.tool()
def list_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """List tasks from TaskFlow with optional filtering by status and priority."""
    conn = get_db_connection()
    try:
        query = "SELECT * FROM tasks WHERE 1=1"
        params: List[Any] = []
        if status:
            query += " AND status = ?"
            params.append(status)
        if priority:
            query += " AND priority = ?"
            params.append(priority)
        query += " ORDER BY position ASC, created_at DESC LIMIT ?"
        params.append(limit)

        cursor = conn.execute(query, params)
        rows = cursor.fetchall()
        tasks = []
        for r in rows:
            d = dict(r)
            try:
                d["tags"] = json.loads(d.get("tags") or "[]")
            except Exception:
                d["tags"] = []
            tasks.append(d)
        return tasks
    finally:
        conn.close()


@task_tracker_mcp.tool()
def create_task(
    title: str,
    description: str = "",
    priority: str = "medium",
    tags: List[str] = [],
    due_date: Optional[str] = None
) -> Dict[str, Any]:
    """Create a new task ticket in TaskFlow."""
    conn = get_db_connection()
    try:
        task_id = str(uuid.uuid4())
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        tags_json = json.dumps(tags)

        # Get highest position
        c = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE status = 'todo'")
        next_pos = c.fetchone()[0]

        conn.execute("""
            INSERT INTO tasks (id, title, description, status, priority, tags, due_date, created_at, updated_at, position)
            VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?)
        """, (task_id, title, description, priority, tags_json, due_date, now_iso, now_iso, next_pos))
        conn.commit()

        return {
            "id": task_id,
            "title": title,
            "description": description,
            "status": "todo",
            "priority": priority,
            "tags": tags,
            "due_date": due_date,
            "created_at": now_iso,
            "updated_at": now_iso,
            "position": next_pos
        }
    finally:
        conn.close()


@task_tracker_mcp.tool()
def update_task(
    task_id: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    tags: Optional[List[str]] = None,
    due_date: Optional[str] = None
) -> Dict[str, Any]:
    """Update fields on an existing task."""
    conn = get_db_connection()
    try:
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        updates = ["updated_at = ?"]
        params = [now_iso]

        if title is not None:
            updates.append("title = ?")
            params.append(title)
        if description is not None:
            updates.append("description = ?")
            params.append(description)
        if status is not None:
            updates.append("status = ?")
            params.append(status)
            if status == "done":
                updates.append("completed_at = ?")
                params.append(now_iso)
        if priority is not None:
            updates.append("priority = ?")
            params.append(priority)
        if tags is not None:
            updates.append("tags = ?")
            params.append(json.dumps(tags))
        if due_date is not None:
            updates.append("due_date = ?")
            params.append(due_date)

        params.append(task_id)
        sql = f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?"
        conn.execute(sql, params)
        conn.commit()

        c = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = c.fetchone()
        if not row:
            raise ValueError(f"Task with ID {task_id} not found.")
        d = dict(row)
        try:
            d["tags"] = json.loads(d.get("tags") or "[]")
        except Exception:
            d["tags"] = []
        return d
    finally:
        conn.close()


@task_tracker_mcp.tool()
def resolve_task(
    task_id: str,
    completion_notes: str = "",
    metrics: Dict[str, Any] = {},
    tools_used: List[str] = [],
    deliverables: List[str] = []
) -> Dict[str, Any]:
    """
    Resolve an epic/task in TaskFlow.
    Marks status as 'done', records completion metrics, and triggers automated
    ingestion of the retrospective into Qdrant vector memory.
    """
    conn = get_db_connection()
    try:
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        conn.execute("""
            UPDATE tasks
            SET status = 'done', completed_at = ?, updated_at = ?
            WHERE id = ?
        """, (now_iso, now_iso, task_id))
        conn.commit()

        c = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = c.fetchone()
        if not row:
            raise ValueError(f"Task with ID {task_id} not found.")
        task_data = dict(row)

        # Ingest into Qdrant unified memory
        point_id = ingestion_pipeline.ingest_task_retrospective(
            task_id=task_id,
            title=task_data["title"],
            description=task_data["description"] + f" [Notes: {completion_notes}]",
            metrics=metrics,
            tools_used=tools_used,
            deliverables=deliverables
        )

        payload = {
            "task_id": task_id,
            "title": task_data["title"],
            "status": "done",
            "completed_at": now_iso,
            "metrics": metrics,
            "tools_used": tools_used,
            "deliverables": deliverables,
            "completion_notes": completion_notes,
            "qdrant_point_id": point_id
        }
        return payload
    finally:
        conn.close()


@task_tracker_mcp.tool()
def get_task_stats() -> Dict[str, Any]:
    """Retrieve statistical summary of the TaskFlow board."""
    conn = get_db_connection()
    try:
        c = conn.execute("SELECT status, count(*) FROM tasks GROUP BY status")
        counts = {r[0]: r[1] for r in c.fetchall()}

        c_pri = conn.execute("SELECT priority, count(*) FROM tasks WHERE status != 'done' GROUP BY priority")
        priority_counts = {r[0]: r[1] for r in c_pri.fetchall()}

        c_total = conn.execute("SELECT count(*) FROM tasks")
        total = c_total.fetchone()[0]

        return {
            "total_tasks": total,
            "todo": counts.get("todo", 0),
            "in_progress": counts.get("in_progress", 0),
            "done": counts.get("done", 0),
            "archived": counts.get("archived", 0),
            "active_priorities": priority_counts
        }
    finally:
        conn.close()


@task_tracker_mcp.tool()
def get_active_backlog(limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve top active backlog tasks for prioritization."""
    conn = get_db_connection()
    try:
        c = conn.execute("""
            SELECT * FROM tasks
            WHERE status IN ('todo', 'in_progress')
            ORDER BY
                CASE priority
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                    ELSE 5
                END,
                position ASC,
                created_at ASC
            LIMIT ?
        """, (limit,))
        rows = c.fetchall()
        tasks = []
        for r in rows:
            d = dict(r)
            try:
                d["tags"] = json.loads(d.get("tags") or "[]")
            except Exception:
                d["tags"] = []
            tasks.append(d)
        return tasks
    finally:
        conn.close()


if __name__ == "__main__":
    task_tracker_mcp.run()
