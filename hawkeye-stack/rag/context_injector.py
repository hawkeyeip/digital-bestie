"""
Hawkeye Context Injector
Executes pre-flight semantic searches against Qdrant to inject historical context
directly into the worker agent prompts and router decision loops.
"""

import logging
from typing import List, Dict, Any, Optional
from rag.embeddings import embeddings_service
from rag.qdrant_mgr import qdrant_manager

logger = logging.getLogger(__name__)


class ContextInjector:
    def __init__(self):
        self.embeddings = embeddings_service
        self.qdrant = qdrant_manager

    def preflight_query(
        self,
        prompt: str,
        limit: int = 4,
        score_threshold: float = 0.4,
        source_module: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Execute pre-flight vector search against Qdrant memory store."""
        if not prompt.strip():
            return []

        query_vec = self.embeddings.get_embedding(prompt)
        filter_dict = {"source_module": source_module} if source_module else None

        results = self.qdrant.search_similar(
            query_vector=query_vec,
            limit=limit,
            score_threshold=score_threshold,
            filter_dict=filter_dict
        )
        return results

    def format_context_block(self, results: List[Dict[str, Any]]) -> str:
        """Format pre-flight retrieval results into a clean markdown context block for prompt injection."""
        if not results:
            return ""

        lines = ["### [UNIFIED MEMORY CONTEXT: HISTORICAL RETRIEVAL]"]
        for idx, item in enumerate(results, 1):
            score = item.get("score", 0.0)
            payload = item.get("payload", {})
            source = payload.get("source_module", "unknown")
            doc_type = payload.get("document_type", "reference")
            text = payload.get("chunk_text", "").strip()
            lines.append(f"- **Item {idx}** (Source: `{source}`, Type: `{doc_type}`, Similarity: {score:.2f}):")
            lines.append(f"  {text}")
        lines.append("### [END UNIFIED MEMORY CONTEXT]\n")
        return "\n".join(lines)

    def inject_context(
        self,
        prompt: str,
        limit: int = 3,
        score_threshold: float = 0.4,
        source_module: Optional[str] = None
    ) -> str:
        """Returns the prompt prefixed with injected historical memory context."""
        results = self.preflight_query(
            prompt=prompt,
            limit=limit,
            score_threshold=score_threshold,
            source_module=source_module
        )
        context_block = self.format_context_block(results)
        if context_block:
            return f"{context_block}\n{prompt}"
        return prompt


context_injector = ContextInjector()
