from __future__ import annotations

import logging
import tempfile
import time
from pathlib import Path

from .client import ConvexWorkerClient
from .config import Settings
from .extract import ExtractionError, extract_job


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("bluetape.recipe-worker")


def run() -> None:
    settings = Settings.from_env()
    client = ConvexWorkerClient(settings.convex_site_url, settings.worker_secret)
    logger.info("worker_started worker_id=%s", settings.worker_id)
    try:
        while True:
            try:
                job = client.claim(settings.worker_id)
            except Exception:
                logger.exception("claim_failed")
                time.sleep(settings.poll_seconds)
                continue
            if job is None:
                time.sleep(settings.poll_seconds)
                continue
            logger.info("job_claimed job_id=%s source_type=%s", job.job_id, job.source_type)
            try:
                with tempfile.TemporaryDirectory(prefix="bluetape-recipe-") as directory:
                    result = extract_job(settings, client, job, Path(directory))
                client.complete(job, result.model_dump(exclude_none=True))
                logger.info("job_ready_for_review job_id=%s", job.job_id)
            except ExtractionError as exc:
                logger.warning(
                    "job_failed job_id=%s code=%s detail=%s",
                    job.job_id,
                    exc.code,
                    str(exc),
                )
                client.fail(job, exc.code, str(exc))
            except Exception as exc:
                logger.exception("job_failed job_id=%s", job.job_id)
                try:
                    client.fail(job, "processing_failed", str(exc))
                except Exception:
                    logger.exception("job_failure_report_failed job_id=%s", job.job_id)
    finally:
        client.close()


if __name__ == "__main__":
    run()
