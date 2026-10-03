"""
Hawkeye RAG Pipeline — Ollama Embeddings Service
Uses nomic-embed-text (dim 768) running on local Ollama (http://localhost:11434).
"""

import logging
from typing import List
import requests

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_EMBED_MODEL = "nomic-embed-text:latest"
EMBEDDING_DIM = 768


class EmbeddingsService:
    def __init__(self, base_url: str = OLLAMA_BASE_URL, model: str = DEFAULT_EMBED_MODEL):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def get_embedding(self, text: str) -> List[float]:
        """Generate a 768-dimensional embedding vector for the provided text."""
        cleaned_text = text.strip()
        if not cleaned_text:
            return [0.0] * EMBEDDING_DIM

        url = f"{self.base_url}/api/embeddings"
        payload = {
            "model": self.model,
            "prompt": cleaned_text
        }
        try:
            resp = requests.post(url, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            embedding = data.get("embedding", [])
            if len(embedding) != EMBEDDING_DIM:
                logger.warning(f"Unexpected embedding dimension: {len(embedding)} (expected {EMBEDDING_DIM})")
            return embedding
        except Exception as e:
            logger.error(f"Error generating embedding via Ollama ({self.model}): {e}")
            raise RuntimeError(f"Failed to generate embedding for text via Ollama: {e}")

    def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of strings."""
        return [self.get_embedding(t) for t in texts]


# Singleton instance
embeddings_service = EmbeddingsService()
