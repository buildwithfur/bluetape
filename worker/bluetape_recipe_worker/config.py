from __future__ import annotations

import os
from dataclasses import dataclass


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@dataclass(frozen=True)
class Settings:
    convex_site_url: str
    worker_secret: str
    openrouter_api_key: str | None
    openrouter_model: str
    openrouter_vision_model: str
    transcription_provider: str
    transcription_api_key: str | None
    transcription_api_url: str
    transcription_model: str
    worker_id: str
    poll_seconds: float
    max_video_seconds: int
    max_download_bytes: int
    max_visual_frames: int
    dataimpulse_proxy_url: str | None

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            convex_site_url=required("CONVEX_SITE_URL").rstrip("/"),
            worker_secret=required("RECIPE_WORKER_SECRET"),
            openrouter_api_key=os.environ.get("OPENROUTER_API_KEY", "").strip() or None,
            openrouter_model=os.environ.get(
                "OPENROUTER_RECIPE_MODEL", "deepseek/deepseek-v4-flash"
            ).strip(),
            openrouter_vision_model=os.environ.get(
                "OPENROUTER_VISION_MODEL", "google/gemini-2.5-flash"
            ).strip(),
            transcription_provider=os.environ.get("TRANSCRIPTION_PROVIDER", "api").strip(),
            transcription_api_key=(
                os.environ.get("TRANSCRIPTION_API_KEY", "").strip()
                or os.environ.get("OPENROUTER_API_KEY", "").strip()
                or None
            ),
            transcription_api_url=os.environ.get(
                "TRANSCRIPTION_API_URL", "https://openrouter.ai/api/v1/audio/transcriptions"
            ).strip(),
            transcription_model=os.environ.get(
                "TRANSCRIPTION_MODEL", "openai/whisper-large-v3-turbo"
            ).strip(),
            worker_id=os.environ.get("RAILWAY_REPLICA_ID", os.uname().nodename),
            poll_seconds=float(os.environ.get("WORKER_POLL_SECONDS", "5")),
            max_video_seconds=int(os.environ.get("MAX_VIDEO_SECONDS", "1800")),
            max_download_bytes=int(os.environ.get("MAX_DOWNLOAD_BYTES", str(150 * 1024 * 1024))),
            max_visual_frames=int(os.environ.get("MAX_VISUAL_FRAMES", "12")),
            dataimpulse_proxy_url=(
                os.environ.get("DATAIMPULSE_PROXY_URL", "").strip() or None
            ),
        )
