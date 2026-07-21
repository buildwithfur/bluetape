from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class ClaimedJob:
    job_id: str
    recipe_id: str
    source_url: str
    source_type: str
    lease_token: str


class ConvexWorkerClient:
    def __init__(self, site_url: str, secret: str) -> None:
        self._base = site_url.rstrip("/")
        self._client = httpx.Client(
            timeout=httpx.Timeout(30),
            headers={"Authorization": f"Bearer {secret}"},
        )

    def _post(self, path: str, payload: dict[str, Any]) -> Any:
        response = self._client.post(f"{self._base}{path}", json=payload)
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict) and data.get("error"):
            raise RuntimeError(str(data["error"]))
        return data

    def claim(self, worker_id: str) -> ClaimedJob | None:
        data = self._post("/recipe-worker/claim", {"workerId": worker_id})
        if data is None:
            return None
        return ClaimedJob(
            job_id=data["jobId"],
            recipe_id=data["recipeId"],
            source_url=data["sourceUrl"],
            source_type=data["sourceType"],
            lease_token=data["leaseToken"],
        )

    def stage(self, job: ClaimedJob, stage: str) -> None:
        self._post("/recipe-worker/stage", {
            "jobId": job.job_id,
            "leaseToken": job.lease_token,
            "stage": stage,
        })

    def complete(self, job: ClaimedJob, recipe: dict[str, Any]) -> None:
        self._post("/recipe-worker/complete", {
            "jobId": job.job_id,
            "leaseToken": job.lease_token,
            **recipe,
        })

    def fail(self, job: ClaimedJob, error_code: str, message: str) -> None:
        self._post("/recipe-worker/fail", {
            "jobId": job.job_id,
            "leaseToken": job.lease_token,
            "errorCode": error_code,
            "message": message[:500],
        })

    def close(self) -> None:
        self._client.close()
