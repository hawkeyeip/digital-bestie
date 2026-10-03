"""
Hawkeye Unified Memory — Qdrant Manager
Connects to local Qdrant server (http://localhost:6333) with graceful embedded local fallback.
Manages the unified 'hawkeye_memory' vector collection.
"""

import logging
import os
import uuid
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest_models

logger = logging.getLogger(__name__)

DEFAULT_COLLECTION = "hawkeye_memory"
DEFAULT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
EMBEDDING_DIM = 768


class QdrantMemoryManager:
    def __init__(self, url: str = DEFAULT_URL, local_path: Optional[str] = None):
        self.url = url
        self.local_path = local_path or os.path.expanduser("~/.digital-bestie/qdrant_embedded")
        self.client = self._init_client()
        self.ensure_collection(DEFAULT_COLLECTION)

    def _init_client(self) -> QdrantClient:
        """Connect to HTTP Qdrant instance, or fall back to local disk storage if unavailable."""
        try:
            client = QdrantClient(url=self.url, timeout=5)
            # Ping
            client.get_collections()
            logger.info(f"Successfully connected to Qdrant HTTP at {self.url}")
            return client
        except Exception as e:
            logger.warning(f"Could not connect to Qdrant HTTP at {self.url} ({e}). Falling back to local embedded storage.")
            os.makedirs(self.local_path, exist_ok=True)
            return QdrantClient(path=self.local_path)

    def ensure_collection(self, collection_name: str = DEFAULT_COLLECTION):
        """Create the collection if it does not exist."""
        try:
            collections = self.client.get_collections().collections
            exists = any(c.name == collection_name for c in collections)
            if not exists:
                self.client.create_collection(
                    collection_name=collection_name,
                    vectors_config=rest_models.VectorParams(
                        size=EMBEDDING_DIM,
                        distance=rest_models.Distance.COSINE
                    )
                )
                logger.info(f"Created Qdrant collection '{collection_name}' (dim={EMBEDDING_DIM}, metric=Cosine)")
        except Exception as e:
            logger.error(f"Error ensuring collection '{collection_name}': {e}")

    def upsert_point(
        self,
        point_id: Optional[str],
        vector: List[float],
        payload: Dict[str, Any],
        collection_name: str = DEFAULT_COLLECTION
    ) -> str:
        """Upsert a single point into Qdrant."""
        pid = point_id or str(uuid.uuid4())
        point = rest_models.PointStruct(
            id=pid,
            vector=vector,
            payload=payload
        )
        self.client.upsert(
            collection_name=collection_name,
            points=[point]
        )
        return pid

    def search_similar(
        self,
        query_vector: List[float],
        limit: int = 5,
        score_threshold: Optional[float] = None,
        filter_dict: Optional[Dict[str, Any]] = None,
        collection_name: str = DEFAULT_COLLECTION
    ) -> List[Dict[str, Any]]:
        """Search for most similar vectors in the unified memory store."""
        query_filter = None
        if filter_dict:
            must_conditions = []
            for k, v in filter_dict.items():
                must_conditions.append(
                    rest_models.FieldCondition(
                        key=k,
                        match=rest_models.MatchValue(value=v)
                    )
                )
            query_filter = rest_models.Filter(must=must_conditions)

        response = self.client.query_points(
            collection_name=collection_name,
            query=query_vector,
            limit=limit,
            score_threshold=score_threshold,
            query_filter=query_filter,
            with_payload=True
        )

        output = []
        for r in response.points:
            output.append({
                "id": r.id,
                "score": float(r.score),
                "payload": r.payload
            })
        return output

    def count(self, collection_name: str = DEFAULT_COLLECTION) -> int:
        """Return the number of points in the collection."""
        res = self.client.count(collection_name=collection_name)
        return res.count


# Singleton instance
qdrant_manager = QdrantMemoryManager()
