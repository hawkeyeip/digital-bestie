"""
Hawkeye Automated Ingestion Hooks
Chunks and embeds unstructured data passing through Resource Tracker,
Personality Calibration, and Task Tracker retrospectives into Qdrant.
"""

import datetime
import logging
import uuid
from typing import List, Dict, Any, Optional
from rag.embeddings import embeddings_service
from rag.qdrant_mgr import qdrant_manager

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split raw unstructured text into overlapping chunks."""
    cleaned = text.strip()
    if not cleaned:
        return []
    if len(cleaned) <= chunk_size:
        return [cleaned]

    chunks = []
    start = 0
    while start < len(cleaned):
        end = start + chunk_size
        chunk = cleaned[start:end]
        chunks.append(chunk)
        if end >= len(cleaned):
            break
        start += (chunk_size - overlap)
    return chunks


class IngestionPipeline:
    def __init__(self):
        self.embeddings = embeddings_service
        self.qdrant = qdrant_manager

    def ingest_resource(
        self,
        resource_id: str,
        name: str,
        content: str,
        category: str = "general",
        source_url: str = "",
        resource_type: str = "reference",
        extra_metadata: Optional[Dict[str, Any]] = None
    ) -> List[str]:
        """Chunk, embed, and ingest a resource (URL, PDF, snippet, document)."""
        text_to_index = f"{name}\n{content}"
        chunks = chunk_text(text_to_index)
        point_ids = []

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        for idx, chunk in enumerate(chunks):
            vector = self.embeddings.get_embedding(chunk)
            payload = {
                "source_module": "resource_tracker",
                "entity_id": resource_id,
                "name": name,
                "document_type": resource_type,
                "category": category,
                "source_url": source_url,
                "chunk_index": idx,
                "total_chunks": len(chunks),
                "chunk_text": chunk,
                "created_at": now_iso,
                "metadata": extra_metadata or {}
            }
            pid = self.qdrant.upsert_point(
                point_id=str(uuid.uuid4()),
                vector=vector,
                payload=payload
            )
            point_ids.append(pid)

        logger.info(f"Ingested resource '{name}' ({resource_id}) into {len(point_ids)} Qdrant points.")
        return point_ids

    def ingest_personality_milestone(
        self,
        domain: str,
        confidence_score: float,
        milestone_text: str,
        epic_name: str = "",
        metrics: Optional[Dict[str, Any]] = None
    ) -> str:
        """Embed and ingest a skill calibration milestone into vector memory."""
        summary_text = (
            f"Skill Domain Milestone: {domain}\n"
            f"Epic: {epic_name}\n"
            f"Confidence Score: {confidence_score:.2f}\n"
            f"Summary: {milestone_text}\n"
            f"Metrics: {metrics or {}}"
        )
        vector = self.embeddings.get_embedding(summary_text)
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        payload = {
            "source_module": "personality",
            "entity_id": f"milestone-{domain}-{uuid.uuid4().hex[:6]}",
            "domain": domain,
            "confidence_score": confidence_score,
            "epic_name": epic_name,
            "chunk_text": summary_text,
            "document_type": "calibration_milestone",
            "created_at": now_iso,
            "metadata": metrics or {}
        }
        pid = self.qdrant.upsert_point(
            point_id=str(uuid.uuid4()),
            vector=vector,
            payload=payload
        )
        logger.info(f"Ingested personality milestone for domain '{domain}' with score {confidence_score}")
        return pid

    def ingest_task_retrospective(
        self,
        task_id: str,
        title: str,
        description: str,
        metrics: Dict[str, Any],
        tools_used: List[str],
        deliverables: List[str]
    ) -> str:
        """Embed a resolved task with metrics and deliverables for future experience capitalization."""
        text = (
            f"Resolved Task Epic: {title}\n"
            f"Description: {description}\n"
            f"Metrics: {metrics}\n"
            f"Tools Used: {', '.join(tools_used)}\n"
            f"Deliverables: {', '.join(deliverables)}"
        )
        vector = self.embeddings.get_embedding(text)
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        payload = {
            "source_module": "task_tracker",
            "entity_id": task_id,
            "title": title,
            "tools_used": tools_used,
            "deliverables": deliverables,
            "metrics": metrics,
            "chunk_text": text,
            "document_type": "task_retrospective",
            "created_at": now_iso
        }
        pid = self.qdrant.upsert_point(
            point_id=str(uuid.uuid4()),
            vector=vector,
            payload=payload
        )
        logger.info(f"Ingested task retrospective for '{title}' ({task_id})")
        return pid


ingestion_pipeline = IngestionPipeline()
