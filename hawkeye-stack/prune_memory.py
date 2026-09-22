#!/usr/bin/env python3
"""
Hawkeye Intelligence — SQLite Episodic Memory Pruning Script

Clusters old episodic memory records by tag, summarizes each cluster via
the local Ollama Qwen 2.5 endpoint, inserts compressed summaries, and
deletes the raw records. Designed for weekly cron execution.

Schedule: 0 3 * * 0 (Sundays at 3:00 AM)
"""

import sqlite3
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────

MEMORY_DB_PATH = Path.home() / "Downloads" / "Hawkeye_Agent_Workspace" / "episodic_memory.db"
OLLAMA_API_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5"
PRUNE_THRESHOLD_DAYS = 30
REQUEST_TIMEOUT_SECONDS = 120


def verify_database_exists() -> bool:
    """Confirms the SQLite database file exists before attempting operations."""
    if not MEMORY_DB_PATH.exists():
        print(f"[!] Database not found at {MEMORY_DB_PATH}. Nothing to prune.")
        return False
    return True


def verify_ollama_available() -> bool:
    """Pings the Ollama API to ensure the local model server is reachable."""
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models = [m["name"] for m in response.json().get("models", [])]
            if any(OLLAMA_MODEL in m for m in models):
                print(f"[+] Ollama is running. Model '{OLLAMA_MODEL}' is available.")
                return True
            else:
                print(f"[!] Ollama is running but model '{OLLAMA_MODEL}' is not loaded.")
                print(f"    Available models: {models}")
                print(f"    Run: ollama pull {OLLAMA_MODEL}")
                return False
        return False
    except requests.ConnectionError:
        print("[!] Ollama is not running. Start it with: ollama serve")
        return False


def fetch_old_records(conn: sqlite3.Connection, cutoff_date: str) -> list:
    """Retrieves all memory records older than the cutoff date."""
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, timestamp, topic, content, tags FROM agent_memory WHERE timestamp < ?",
        (cutoff_date,)
    )
    return cursor.fetchall()


def cluster_by_primary_tag(records: list) -> dict:
    """Groups records by their first tag for batch summarization."""
    clustered = {}
    for row in records:
        record_id, timestamp, topic, content, tags_str = row
        tags = tags_str.split(",") if tags_str else ["general"]
        primary_tag = tags[0].strip() if tags[0].strip() else "general"
        if primary_tag not in clustered:
            clustered[primary_tag] = []
        clustered[primary_tag].append(row)
    return clustered


def summarize_cluster(tag: str, records: list) -> str:
    """Sends the cluster text to the local Qwen 2.5 model for compression."""
    raw_text = "\n".join(
        [f"[{r[1]}] {r[2]}: {r[3]}" for r in records]
    )

    prompt = (
        f"Summarize the following historical agent logs into a single, dense episodic memory block. "
        f"Retain all critical facts, technical details, and outcomes. Omit conversational fluff.\n\n"
        f"{raw_text}"
    )

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False
    }

    try:
        response = requests.post(
            OLLAMA_API_URL,
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        summary = response.json().get("response", "").strip()

        if not summary:
            print(f"    [!] Model returned empty summary for tag '{tag}'. Preserving raw records.")
            return ""

        return summary

    except requests.Timeout:
        print(f"    [!] Summarization timed out for tag '{tag}' after {REQUEST_TIMEOUT_SECONDS}s.")
        return ""
    except requests.RequestException as e:
        print(f"    [!] Summarization request failed for tag '{tag}': {e}")
        return ""


def commit_summary_and_delete(
    conn: sqlite3.Connection,
    tag: str,
    summary: str,
    record_ids: list
):
    """Inserts the compressed summary and deletes the original raw records."""
    cursor = conn.cursor()

    # Insert compressed archive entry
    cursor.execute(
        "INSERT INTO agent_memory (timestamp, topic, content, tags) VALUES (?, ?, ?, ?)",
        (
            datetime.now().isoformat(),
            f"Archived Summary: {tag}",
            summary,
            f"{tag},archive"
        )
    )

    # Delete the raw records that were summarized
    placeholders = ",".join("?" * len(record_ids))
    cursor.execute(
        f"DELETE FROM agent_memory WHERE id IN ({placeholders})",
        record_ids
    )

    conn.commit()


def summarize_and_prune():
    """Main pruning pipeline: fetch → cluster → summarize → replace."""
    if not verify_database_exists():
        return

    if not verify_ollama_available():
        return

    conn = sqlite3.connect(MEMORY_DB_PATH)
    cutoff_date = (datetime.now() - timedelta(days=PRUNE_THRESHOLD_DAYS)).isoformat()

    print(f"[*] Pruning records older than {PRUNE_THRESHOLD_DAYS} days (before {cutoff_date[:10]})")

    old_records = fetch_old_records(conn, cutoff_date)

    if not old_records:
        print("[+] No records require pruning. Database is within retention threshold.")
        conn.close()
        return

    print(f"[*] Found {len(old_records)} records eligible for pruning.")

    clustered_records = cluster_by_primary_tag(old_records)
    total_pruned = 0
    total_skipped = 0

    for tag, records in clustered_records.items():
        print(f"\n  -> Processing cluster '{tag}' ({len(records)} records)...")

        summary = summarize_cluster(tag, records)

        if not summary:
            total_skipped += len(records)
            print(f"    [!] Skipped cluster '{tag}' — summarization failed.")
            continue

        record_ids = [r[0] for r in records]
        commit_summary_and_delete(conn, tag, summary, record_ids)
        total_pruned += len(records)
        print(f"    [+] Compressed {len(records)} records into 1 archived summary.")

    conn.close()

    print(f"\n[*] Pruning complete. Pruned: {total_pruned} | Skipped: {total_skipped}")


if __name__ == "__main__":
    print(f"{'='*60}")
    print(f"  Hawkeye Intelligence — Memory Pruning Engine")
    print(f"  Execution Time: {datetime.now().isoformat()}")
    print(f"{'='*60}\n")

    summarize_and_prune()
