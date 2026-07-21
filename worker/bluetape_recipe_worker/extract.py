from __future__ import annotations

import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field, ValidationError

from .client import ClaimedJob, ConvexWorkerClient
from .config import Settings
from .security import validate_public_url


class ExtractionError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class RecipeResult(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    ingredients: list[str] = Field(min_length=1, max_length=100)
    steps: list[str] = Field(min_length=1, max_length=100)
    sourceName: str | None = Field(default=None, max_length=200)
    sourceImageUrl: str | None = Field(default=None, max_length=2000)


def _run(command: list[str], *, cwd: Path, timeout: int = 180) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        detail = getattr(exc, "stderr", "") or str(exc)
        raise ExtractionError("source_unavailable", detail[-500:]) from exc


def _safe_fetch(url: str, *, max_bytes: int = 2_000_000, max_redirects: int = 5) -> httpx.Response:
    current = url
    with httpx.Client(timeout=20, follow_redirects=False, headers={"User-Agent": "BluetapeRecipeBot/1.0"}) as client:
        for _ in range(max_redirects + 1):
            validate_public_url(current)
            with client.stream("GET", current) as streamed:
                if streamed.status_code in {301, 302, 303, 307, 308}:
                    location = streamed.headers.get("location")
                    if not location:
                        raise ExtractionError("site_blocked", "Redirect had no destination")
                    current = urljoin(current, location)
                    continue
                streamed.raise_for_status()
                body = bytearray()
                for chunk in streamed.iter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise ExtractionError("source_too_large", "Source page exceeded the size limit")
                return httpx.Response(
                    streamed.status_code,
                    headers=streamed.headers,
                    content=bytes(body),
                    request=streamed.request,
                )
    raise ExtractionError("too_many_redirects", "Source redirected too many times")


def _instruction_text(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            result.extend(_instruction_text(item))
        return result
    if isinstance(value, dict):
        text = value.get("text") or value.get("name")
        nested = value.get("itemListElement")
        return ([str(text)] if text else []) + _instruction_text(nested)
    return []


def _recipe_nodes(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [node for item in value for node in _recipe_nodes(item)]
    if not isinstance(value, dict):
        return []
    nodes = _recipe_nodes(value.get("@graph"))
    kind = value.get("@type")
    kinds = kind if isinstance(kind, list) else [kind]
    if any(str(item).lower() == "recipe" for item in kinds):
        nodes.insert(0, value)
    return nodes


def extract_recipe_schema(html: str) -> RecipeResult | None:
    soup = BeautifulSoup(html, "html.parser")
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            payload = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        for node in _recipe_nodes(payload):
            ingredients = [str(item).strip() for item in node.get("recipeIngredient", []) if str(item).strip()]
            steps = [item.strip() for item in _instruction_text(node.get("recipeInstructions")) if item.strip()]
            title = str(node.get("name") or "").strip()
            if not title or not ingredients or not steps:
                continue
            image = node.get("image")
            if isinstance(image, list):
                image = image[0] if image else None
            if isinstance(image, dict):
                image = image.get("url")
            author = node.get("author")
            if isinstance(author, dict):
                author = author.get("name")
            try:
                return RecipeResult(
                    title=title,
                    ingredients=ingredients,
                    steps=steps,
                    sourceName=str(author).strip() if author else None,
                    sourceImageUrl=str(image).strip() if image else None,
                )
            except ValidationError:
                continue
    return None


def readable_page_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for node in soup(["script", "style", "noscript", "svg", "nav", "footer"]):
        node.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True))[:50_000]


def _parse_llm(settings: Settings, *, source: str, source_name: str | None, image: str | None) -> RecipeResult:
    if not settings.openrouter_api_key:
        raise ExtractionError("recipe_parser_not_configured", "Recipe parser API key is missing")
    response = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        timeout=60,
        headers={"Authorization": f"Bearer {settings.openrouter_api_key}", "Content-Type": "application/json"},
        json={
            "model": settings.openrouter_model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Extract only the recipe supported by the source. Return JSON with title, "
                        "ingredients (one source-faithful line each), and ordered steps. Do not invent "
                        "missing quantities or actions. Each list must contain at least one item."
                    ),
                },
                {"role": "user", "content": source[:80_000]},
            ],
        },
    )
    response.raise_for_status()
    try:
        content = response.json()["choices"][0]["message"]["content"]
        payload = json.loads(content)
        payload.setdefault("sourceName", source_name)
        payload.setdefault("sourceImageUrl", image)
        return RecipeResult.model_validate(payload)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError) as exc:
        raise ExtractionError("recipe_not_found", "The source did not contain a usable recipe") from exc


def _subtitle_text(metadata: dict[str, Any]) -> str:
    tracks = metadata.get("subtitles") or metadata.get("automatic_captions") or {}
    for language in ("en", "en-US", "en-GB", *tracks.keys()):
        formats = tracks.get(language) or []
        preferred = next((item for item in formats if item.get("ext") == "vtt"), None)
        track = preferred or (formats[0] if formats else None)
        if not track or not track.get("url"):
            continue
        response = _safe_fetch(track["url"], max_bytes=3_000_000)
        text = re.sub(r"<[^>]+>|\d\d:\d\d[^\n]*|WEBVTT", " ", response.text)
        return re.sub(r"\s+", " ", text).strip()[:60_000]
    return ""


def _transcribe_api(settings: Settings, audio: Path) -> str:
    if not settings.transcription_api_key:
        raise ExtractionError("transcription_not_configured", "Transcription API key is missing")
    with audio.open("rb") as handle:
        response = httpx.post(
            settings.transcription_api_url,
            timeout=180,
            headers={"Authorization": f"Bearer {settings.transcription_api_key}"},
            data={"model": settings.transcription_model, "response_format": "json"},
            files={"file": (audio.name, handle, "audio/mpeg")},
        )
    response.raise_for_status()
    text = str(response.json().get("text") or "").strip()
    if not text:
        raise ExtractionError("transcript_unavailable", "No transcript was returned")
    return text[:60_000]


@lru_cache(maxsize=2)
def _local_whisper_model(model_name: str):
    from faster_whisper import WhisperModel

    return WhisperModel(model_name, device="cpu", compute_type="int8")


def _transcribe_local(settings: Settings, audio: Path) -> str:
    model = _local_whisper_model(settings.local_whisper_model)
    segments, _info = model.transcribe(str(audio), vad_filter=True, beam_size=3)
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
    if not text:
        raise ExtractionError("transcript_unavailable", "No speech was found in the video")
    return text[:60_000]


def _transcribe(settings: Settings, audio: Path) -> str:
    if settings.transcription_provider == "api":
        return _transcribe_api(settings, audio)
    if settings.transcription_provider == "local":
        return _transcribe_local(settings, audio)
    raise ExtractionError("transcription_not_configured", "Unknown transcription provider")


def extract_social(settings: Settings, client: ConvexWorkerClient, job: ClaimedJob, temp: Path) -> RecipeResult:
    validate_public_url(job.source_url)
    metadata_result = _run([
        "yt-dlp", "--dump-single-json", "--skip-download", "--no-playlist",
        "--socket-timeout", "20", job.source_url,
    ], cwd=temp)
    metadata = json.loads(metadata_result.stdout)
    duration = int(metadata.get("duration") or 0)
    if duration and duration > settings.max_video_seconds:
        raise ExtractionError("video_too_long", "Video exceeds the duration limit")
    source_name = metadata.get("uploader") or metadata.get("channel")
    image = metadata.get("thumbnail")
    caption = str(metadata.get("description") or "").strip()
    client.stage(job, "reading_caption")
    transcript = _subtitle_text(metadata)
    if not transcript:
        client.stage(job, "transcribing")
        max_size = f"{settings.max_download_bytes}"
        _run([
            "yt-dlp", "--no-playlist", "-f", "bestaudio/best", "--max-filesize", max_size,
            "-o", "source.%(ext)s", job.source_url,
        ], cwd=temp, timeout=300)
        source_file = next(temp.glob("source.*"), None)
        if not source_file:
            raise ExtractionError("media_unavailable", "No audio stream was available")
        audio = temp / "audio.mp3"
        _run(["ffmpeg", "-nostdin", "-y", "-i", str(source_file), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", str(audio)], cwd=temp, timeout=180)
        transcript = _transcribe(settings, audio)
    client.stage(job, "extracting_recipe")
    source = f"TITLE:\n{metadata.get('title', '')}\n\nCAPTION:\n{caption}\n\nTRANSCRIPT:\n{transcript}"
    return _parse_llm(settings, source=source, source_name=source_name, image=image)


def extract_website(settings: Settings, client: ConvexWorkerClient, job: ClaimedJob) -> RecipeResult:
    response = _safe_fetch(job.source_url)
    schema_recipe = extract_recipe_schema(response.text)
    if schema_recipe:
        return schema_recipe
    client.stage(job, "extracting_recipe")
    text = readable_page_text(response.text)
    if len(text) < 100:
        raise ExtractionError("site_blocked", "Website did not expose readable recipe content")
    return _parse_llm(settings, source=text, source_name=None, image=None)


def extract_job(settings: Settings, client: ConvexWorkerClient, job: ClaimedJob, temp: Path) -> RecipeResult:
    if job.source_type == "website":
        return extract_website(settings, client, job)
    return extract_social(settings, client, job, temp)
