from __future__ import annotations

import base64
import json
import re
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse

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
    sourceLanguage: str | None = Field(default=None, max_length=35)


class RecipeAssessment(BaseModel):
    title: str = Field(default="", max_length=200)
    ingredients: list[str] = Field(default_factory=list, max_length=100)
    steps: list[str] = Field(default_factory=list, max_length=100)
    sufficient: bool = False
    missingEvidence: list[str] = Field(default_factory=list, max_length=20)
    needsVisualReview: bool = False
    sourceLanguage: str | None = Field(default=None, max_length=35)


@dataclass
class SourceAccess:
    """Use direct access first, then keep one sticky proxy session for the job."""

    proxy_url: str | None
    using_proxy: bool = False

    def _command(self, args: list[str]) -> list[str]:
        if self.using_proxy and self.proxy_url:
            return ["yt-dlp", "--proxy", self.proxy_url, *args]
        return ["yt-dlp", *args]

    def run_ytdlp(
        self,
        args: list[str],
        *,
        cwd: Path,
        timeout: int = 180,
    ) -> subprocess.CompletedProcess[str]:
        try:
            return _run(self._command(args), cwd=cwd, timeout=timeout)
        except ExtractionError as direct_error:
            if (
                self.using_proxy
                or not self.proxy_url
                or not _should_retry_with_proxy(direct_error)
            ):
                raise _redact_proxy_error(direct_error, self.proxy_url) from direct_error
            self.using_proxy = True
            try:
                return _run(self._command(args), cwd=cwd, timeout=timeout)
            except ExtractionError as proxy_error:
                raise _redact_proxy_error(proxy_error, self.proxy_url) from proxy_error

    def run_gallerydl(
        self,
        args: list[str],
        *,
        cwd: Path,
        timeout: int = 180,
    ) -> subprocess.CompletedProcess[str]:
        def command() -> list[str]:
            if self.using_proxy and self.proxy_url:
                return ["gallery-dl", "--proxy", self.proxy_url, *args]
            return ["gallery-dl", *args]

        try:
            return _run(command(), cwd=cwd, timeout=timeout)
        except ExtractionError as direct_error:
            direct_error = _gallery_error(direct_error)
            if (
                self.using_proxy
                or not self.proxy_url
                or not _should_retry_with_proxy(direct_error)
            ):
                raise _redact_proxy_error(direct_error, self.proxy_url) from direct_error
            self.using_proxy = True
            try:
                return _run(command(), cwd=cwd, timeout=timeout)
            except ExtractionError as proxy_error:
                proxy_error = _gallery_error(proxy_error)
                raise _redact_proxy_error(proxy_error, self.proxy_url) from proxy_error

    def fetch(
        self,
        url: str,
        *,
        max_bytes: int = 2_000_000,
        max_redirects: int = 5,
    ) -> httpx.Response:
        try:
            return _safe_fetch(
                url,
                max_bytes=max_bytes,
                max_redirects=max_redirects,
                proxy=self.proxy_url if self.using_proxy else None,
            )
        except ExtractionError as direct_error:
            if (
                self.using_proxy
                or not self.proxy_url
                or not _should_retry_with_proxy(direct_error)
            ):
                raise _redact_proxy_error(direct_error, self.proxy_url) from direct_error
            self.using_proxy = True
            try:
                return _safe_fetch(
                    url,
                    max_bytes=max_bytes,
                    max_redirects=max_redirects,
                    proxy=self.proxy_url,
                )
            except ExtractionError as proxy_error:
                raise _redact_proxy_error(proxy_error, self.proxy_url) from proxy_error


def _redact_proxy_error(error: ExtractionError, proxy_url: str | None) -> ExtractionError:
    message = str(error)
    if proxy_url:
        message = message.replace(proxy_url, "[proxy]")
    return ExtractionError(error.code, message)


def _should_retry_with_proxy(error: ExtractionError) -> bool:
    """Retry only platform-block signals, never arbitrary extractor failures."""
    if error.code == "site_blocked":
        return True
    if error.code != "source_unavailable":
        return False
    detail = str(error).lower()
    return any(marker in detail for marker in (
        "http error 401",
        "http error 403",
        "http error 407",
        "http error 429",
        "too many requests",
        "rate limit",
        "confirm you\u2019re not a bot",
        "confirm you're not a bot",
    ))


def _gallery_error(error: ExtractionError) -> ExtractionError:
    detail = str(error)
    lowered = detail.lower()
    if "login" in lowered or "authentication" in lowered or "cookie" in lowered:
        return ExtractionError("login_required", detail)
    return error


def _proxy_url_for_job(template: str | None, job_id: str) -> str | None:
    if not template:
        return None
    session_id = re.sub(r"[^a-zA-Z0-9]", "", job_id)[-24:] or "bluetape"
    return template.replace("{session}", session_id)


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


def _safe_fetch(
    url: str,
    *,
    max_bytes: int = 2_000_000,
    max_redirects: int = 5,
    proxy: str | None = None,
) -> httpx.Response:
    current = url
    try:
        with httpx.Client(
            timeout=20,
            follow_redirects=False,
            headers={"User-Agent": "BluetapeRecipeBot/1.0"},
            proxy=proxy,
        ) as client:
            for _ in range(max_redirects + 1):
                validate_public_url(current)
                with client.stream("GET", current) as streamed:
                    if streamed.status_code in {301, 302, 303, 307, 308}:
                        location = streamed.headers.get("location")
                        if not location:
                            raise ExtractionError("site_blocked", "Redirect had no destination")
                        current = urljoin(current, location)
                        continue
                    if streamed.status_code in {401, 403, 407, 429}:
                        raise ExtractionError("site_blocked", f"Source returned {streamed.status_code}")
                    streamed.raise_for_status()
                    body = bytearray()
                    for chunk in streamed.iter_bytes():
                        body.extend(chunk)
                        if len(body) > max_bytes:
                            raise ExtractionError(
                                "source_too_large", "Source page exceeded the size limit"
                            )
                    return httpx.Response(
                        streamed.status_code,
                        headers=streamed.headers,
                        content=bytes(body),
                        request=streamed.request,
                    )
    except ExtractionError:
        raise
    except httpx.HTTPError as exc:
        raise ExtractionError("source_unavailable", "Source request failed") from exc
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


def _source_image_url(raw: str | None, source_url: str) -> str | None:
    if not raw:
        return None
    candidate = urljoin(source_url, raw.strip())
    parsed = urlparse(candidate)
    if (
        parsed.scheme in {"http", "https"}
        and parsed.hostname
        and not parsed.username
        and not parsed.password
        and len(candidate) <= 2000
    ):
        return candidate
    return None


def source_page_image(html: str, source_url: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    selectors = (
        'meta[property="og:image"]',
        'meta[property="og:image:secure_url"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]',
        'link[rel="image_src"]',
    )
    for selector in selectors:
        node = soup.select_one(selector)
        raw = node.get("content") if node and node.name == "meta" else node.get("href") if node else None
        image = _source_image_url(str(raw) if raw else None, source_url)
        if image:
            return image
    return None


def _json_object(content: str) -> dict[str, Any]:
    value = content.strip()
    if value.startswith("```"):
        value = re.sub(r"^```(?:json)?\s*|\s*```$", "", value, flags=re.IGNORECASE)
    payload = json.loads(value)
    if not isinstance(payload, dict):
        raise TypeError("Model response was not an object")
    return payload


def _parse_llm(
    settings: Settings,
    *,
    source: str,
    images: list[Path] | None = None,
) -> RecipeAssessment:
    if not settings.openrouter_api_key:
        raise ExtractionError("recipe_parser_not_configured", "Recipe parser API key is missing")
    user_content: str | list[dict[str, Any]] = source[:80_000]
    model = settings.openrouter_model
    if images:
        model = settings.openrouter_vision_model
        user_content = [{"type": "text", "text": source[:60_000]}]
        for path in images:
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            mime_type = {
                ".png": "image/png",
                ".webp": "image/webp",
            }.get(path.suffix.lower(), "image/jpeg")
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{encoded}"},
            })
    response = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        timeout=120 if images else 60,
        headers={"Authorization": f"Bearer {settings.openrouter_api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "reasoning": {"effort": "none"},
            "temperature": 0.1,
            "max_tokens": 4000,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Extract only the recipe supported by the supplied evidence. Return one JSON "
                        "object with exactly these fields: title (string), ingredients (string array), "
                        "steps (string array), sufficient (boolean), missingEvidence (string array), "
                        "needsVisualReview (boolean), and sourceLanguage (BCP 47 language code or null). "
                        "Write title, ingredients, and steps in the dominant language of the recipe "
                        "evidence and do not translate them. Preserve every supported quantity, unit, "
                        "timing, temperature, ingredient, and action exactly. "
                        "Do not invent missing quantities, timings, temperatures, or actions. Mark "
                        "sufficient true only when there is a clear title, a useful ingredient list, "
                        "and actionable ordered cooking steps. Mark needsVisualReview true when text "
                        "refers to unseen actions or on-screen quantities, or when frames are still "
                        "needed to explain how ingredients are combined or cooked. When images are "
                        "provided, use them to fill only visually supported gaps."
                    ),
                },
                {"role": "user", "content": user_content},
            ],
        },
    )
    response.raise_for_status()
    try:
        content = response.json()["choices"][0]["message"]["content"]
        return RecipeAssessment.model_validate(_json_object(content))
    except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError) as exc:
        raise ExtractionError("recipe_not_found", "The source did not contain a usable recipe") from exc


def _translate_assessment(
    settings: Settings,
    assessment: RecipeAssessment,
    target_locale: str,
) -> RecipeAssessment:
    source_language = (assessment.sourceLanguage or "").strip()
    if source_language and source_language.lower().split("-")[0] == target_locale.lower().split("-")[0]:
        return assessment
    if not settings.openrouter_api_key:
        raise ExtractionError("recipe_parser_not_configured", "Recipe parser API key is missing")
    fields = {
        **{f"ingredient:{index}": value for index, value in enumerate(assessment.ingredients)},
        **{f"step:{index}": value for index, value in enumerate(assessment.steps)},
    }
    response = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        timeout=60,
        headers={"Authorization": f"Bearer {settings.openrouter_api_key}", "Content-Type": "application/json"},
        json={
            "model": settings.openrouter_model,
            "reasoning": {"effort": "none"},
            "temperature": 0,
            "max_tokens": 3000,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        f"Translate every value in this JSON object into locale {target_locale}. Return "
                        "one flat JSON object with exactly the same keys. Keys are immutable field IDs: "
                        "never rename, add, remove, merge, split, or reorder them. Translate each value "
                        "independently. Never infer or substitute ingredients or actions. Preserve every "
                        "number, quantity, unit, time, and temperature exactly."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(fields, ensure_ascii=False),
                },
            ],
        },
    )
    response.raise_for_status()
    try:
        content = response.json()["choices"][0]["message"]["content"]
        translated = _json_object(content)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise ExtractionError("translation_failed", "Recipe translation was not usable") from exc
    if set(translated) != set(fields) or any(
        not isinstance(value, str) or not value.strip() for value in translated.values()
    ):
        raise ExtractionError("translation_failed", "Recipe translation changed the recipe structure")
    return assessment.model_copy(update={
        "ingredients": [translated[f"ingredient:{index}"].strip() for index in range(len(assessment.ingredients))],
        "steps": [translated[f"step:{index}"].strip() for index in range(len(assessment.steps))],
    })


def _assessment_result(
    assessment: RecipeAssessment,
    *,
    source_name: str | None,
    image: str | None,
    require_sufficient: bool = True,
) -> RecipeResult | None:
    if require_sufficient and (not assessment.sufficient or assessment.needsVisualReview):
        return None
    try:
        return RecipeResult(
            title=assessment.title.strip(),
            ingredients=[item.strip() for item in assessment.ingredients if item.strip()],
            steps=[item.strip() for item in assessment.steps if item.strip()],
            sourceName=str(source_name).strip() if source_name else None,
            sourceImageUrl=str(image).strip() if image else None,
            sourceLanguage=assessment.sourceLanguage,
        )
    except ValidationError:
        return None


def _localized_result(
    settings: Settings,
    assessment: RecipeAssessment,
    *,
    target_locale: str,
    source_name: str | None,
    image: str | None,
    require_sufficient: bool = True,
) -> RecipeResult | None:
    if require_sufficient and (not assessment.sufficient or assessment.needsVisualReview):
        return None
    localized = _translate_assessment(settings, assessment, target_locale)
    return _assessment_result(
        localized,
        source_name=source_name,
        image=image,
        require_sufficient=False,
    )


def _subtitle_choice(metadata: dict[str, Any]) -> tuple[str, bool] | None:
    manual_tracks = metadata.get("subtitles") or {}
    automatic_tracks = metadata.get("automatic_captions") or {}
    tracks = manual_tracks or automatic_tracks
    if not tracks:
        return None

    languages = list(tracks)
    declared_language = str(metadata.get("language") or "").strip()
    original_languages = [
        language
        for language, formats in tracks.items()
        if language.endswith("-orig")
        or any("original" in str(item.get("name") or "").lower() for item in formats)
    ]
    # Providers normally put the video's source/default subtitle first. Prefer
    # an explicit language or original marker when yt-dlp exposes one, then
    # preserve provider order. English is the first fallback after that.
    provider_default = languages[0]
    english = [
        language
        for language in languages
        if language.lower() == "en" or language.lower().startswith("en-")
    ]
    language_order = [
        declared_language,
        *original_languages,
        provider_default,
        *english,
        *languages,
    ]
    language = next(
        (item for item in dict.fromkeys(language_order) if item and item in tracks),
        None,
    )
    return (language, not bool(manual_tracks)) if language else None


def _subtitle_text(
    metadata: dict[str, Any],
    access: SourceAccess,
    source_url: str,
    temp: Path,
) -> str:
    choice = _subtitle_choice(metadata)
    if not choice:
        return ""
    language, automatic = choice
    output_template = str(temp / "subtitle-%(id)s.%(ext)s")
    args = [
        "--no-playlist",
        "--write-auto-subs" if automatic else "--write-subs",
        "--sub-langs",
        language,
        "--sub-format",
        "vtt",
        "--skip-download",
        "-o",
        output_template,
        source_url,
    ]
    access.run_ytdlp(args, cwd=temp)
    subtitle_files = sorted(temp.glob("subtitle-*.vtt"))
    if not subtitle_files:
        raise ExtractionError("source_unavailable", "yt-dlp did not write the selected subtitle")
    text = subtitle_files[0].read_text(encoding="utf-8", errors="replace")
    text = re.sub(r"<[^>]+>|\d\d:\d\d[^\n]*|WEBVTT", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:60_000]


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


def _download_audio(
    settings: Settings,
    access: SourceAccess,
    source_url: str,
    temp: Path,
) -> Path:
    access.run_ytdlp([
        "--no-playlist", "-f", "bestaudio/best",
        "--max-filesize", str(settings.max_download_bytes),
        "-o", "source-audio.%(ext)s", source_url,
    ], cwd=temp, timeout=300)
    source_file = next(temp.glob("source-audio.*"), None)
    if not source_file:
        raise ExtractionError("media_unavailable", "No audio stream was available")
    audio = temp / "audio.mp3"
    _run([
        "ffmpeg", "-nostdin", "-y", "-i", str(source_file), "-vn",
        "-ac", "1", "-ar", "16000", "-b:a", "64k", str(audio),
    ], cwd=temp, timeout=180)
    return audio


def _download_visual_frames(
    settings: Settings,
    access: SourceAccess,
    source_url: str,
    temp: Path,
    duration: int,
) -> list[Path]:
    access.run_ytdlp([
        "--no-playlist", "-f", "best[height<=480]/best[height<=720]/best",
        "--max-filesize", str(settings.max_download_bytes),
        "--merge-output-format", "mp4", "-o", "source-video.%(ext)s", source_url,
    ], cwd=temp, timeout=300)
    video = next(temp.glob("source-video.*"), None)
    if not video:
        raise ExtractionError("media_unavailable", "No video stream was available")
    frame_count = max(1, min(settings.max_visual_frames, 20))
    interval = max(3, duration // frame_count) if duration else 15
    _run([
        "ffmpeg", "-nostdin", "-y", "-i", str(video),
        "-vf", f"fps=1/{interval},scale=480:-2", "-frames:v", str(frame_count),
        "-q:v", "3", "frame-%02d.jpg",
    ], cwd=temp, timeout=180)
    frames = sorted(temp.glob("frame-*.jpg"))[:frame_count]
    if not frames:
        raise ExtractionError("visual_evidence_unavailable", "No review frames were produced")
    return frames


def _social_evidence(metadata: dict[str, Any], caption: str, transcript: str = "") -> str:
    sections = [
        f"TITLE:\n{metadata.get('title', '')}",
        f"CAPTION OR DESCRIPTION:\n{caption}",
    ]
    if transcript:
        sections.append(f"SUBTITLES OR TRANSCRIPT:\n{transcript}")
    return "\n\n".join(sections)


def _selected_playlist_entry(metadata: dict[str, Any], source_url: str) -> dict[str, Any]:
    entries = metadata.get("entries")
    if not isinstance(entries, list):
        return {}
    raw_index = parse_qs(urlparse(source_url).query).get("img_index", [""])[0]
    if raw_index.isdigit():
        index = int(raw_index) - 1
        if 0 <= index < len(entries) and isinstance(entries[index], dict):
            return entries[index]
    return next((entry for entry in entries if isinstance(entry, dict)), {})


def _download_gallery_images(
    settings: Settings,
    access: SourceAccess,
    source_url: str,
    temp: Path,
) -> list[Path]:
    gallery = temp / "gallery"
    gallery.mkdir(exist_ok=True)
    access.run_gallerydl([
        "--config-ignore",
        "--no-input",
        "--directory", str(gallery),
        "--filename", "{num:>02}.{extension}",
        "--range", f"1-{settings.max_visual_frames}",
        "--filesize-max", str(settings.max_download_bytes),
        "--filter", "extension in ('jpg', 'jpeg', 'png', 'webp')",
        source_url,
    ], cwd=temp, timeout=300)
    images = sorted(
        path for path in gallery.iterdir()
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    )[:settings.max_visual_frames]
    if not images:
        raise ExtractionError("visual_evidence_unavailable", "No carousel images were available")
    return images


def extract_social(settings: Settings, client: ConvexWorkerClient, job: ClaimedJob, temp: Path) -> RecipeResult:
    validate_public_url(job.source_url)
    access = SourceAccess(_proxy_url_for_job(settings.dataimpulse_proxy_url, job.job_id))
    metadata_result = access.run_ytdlp([
        "--dump-single-json", "--skip-download", "--no-playlist", "--ignore-errors",
        "--socket-timeout", "20", job.source_url,
    ], cwd=temp)
    metadata = json.loads(metadata_result.stdout)
    selected_entry = _selected_playlist_entry(metadata, job.source_url)
    duration = int(metadata.get("duration") or selected_entry.get("duration") or 0)
    if duration and duration > settings.max_video_seconds:
        raise ExtractionError("video_too_long", "Video exceeds the duration limit")
    source_name = metadata.get("uploader") or metadata.get("channel")
    image = metadata.get("thumbnail") or selected_entry.get("thumbnail")
    caption = str(metadata.get("description") or "").strip()
    client.stage(job, "reading_caption")
    source = _social_evidence(metadata, caption)
    assessment = _parse_llm(settings, source=source)
    result = _localized_result(
        settings,
        assessment,
        target_locale=job.target_locale,
        source_name=source_name,
        image=image,
    )
    if result:
        return result

    if job.source_type == "instagram" and isinstance(metadata.get("entries"), list):
        client.stage(job, "extracting_recipe")
        gallery_images = _download_gallery_images(settings, access, job.source_url, temp)
        visual_source = (
            f"{source}\n\nTEXT EXTRACTION GAPS:\n"
            f"{'; '.join(assessment.missingEvidence) or 'Check carousel images for missing details.'}"
        )
        visual_assessment = _parse_llm(settings, source=visual_source, images=gallery_images)
        result = _localized_result(
            settings,
            visual_assessment,
            target_locale=job.target_locale,
            source_name=source_name,
            image=image,
            require_sufficient=False,
        )
        if result:
            return result

    try:
        subtitle_text = _subtitle_text(metadata, access, job.source_url, temp)
    except ExtractionError as error:
        if error.code not in {"site_blocked", "source_unavailable"}:
            raise
        subtitle_text = ""
    if subtitle_text:
        source = _social_evidence(metadata, caption, subtitle_text)
        assessment = _parse_llm(settings, source=source)
        result = _localized_result(
            settings,
            assessment,
            target_locale=job.target_locale,
            source_name=source_name,
            image=image,
        )
        if result:
            return result

    client.stage(job, "transcribing")
    audio = _download_audio(settings, access, job.source_url, temp)
    transcript = _transcribe(settings, audio)
    combined_transcript = "\n".join(item for item in (subtitle_text, transcript) if item)
    source = _social_evidence(metadata, caption, combined_transcript)
    assessment = _parse_llm(settings, source=source)
    result = _localized_result(
        settings,
        assessment,
        target_locale=job.target_locale,
        source_name=source_name,
        image=image,
    )
    if result:
        return result

    client.stage(job, "extracting_recipe")
    frames = _download_visual_frames(settings, access, job.source_url, temp, duration)
    visual_source = (
        f"{source}\n\nTEXT EXTRACTION GAPS:\n"
        f"{'; '.join(assessment.missingEvidence) or 'Check frames for missing recipe details.'}"
    )
    visual_assessment = _parse_llm(
        settings,
        source=visual_source,
        images=frames,
    )
    result = _localized_result(
        settings,
        visual_assessment,
        target_locale=job.target_locale,
        source_name=source_name,
        image=image,
        require_sufficient=False,
    )
    if result:
        return result
    raise ExtractionError("recipe_not_found", "The source did not contain a usable recipe")


def extract_website(settings: Settings, client: ConvexWorkerClient, job: ClaimedJob) -> RecipeResult:
    access = SourceAccess(_proxy_url_for_job(settings.dataimpulse_proxy_url, job.job_id))
    response = access.fetch(job.source_url)
    page_image = source_page_image(response.text, job.source_url)
    schema_recipe = extract_recipe_schema(response.text)
    if schema_recipe:
        client.stage(job, "extracting_recipe")
        assessment = _parse_llm(
            settings,
            source=json.dumps(
                {
                    "title": schema_recipe.title,
                    "ingredients": schema_recipe.ingredients,
                    "steps": schema_recipe.steps,
                },
                ensure_ascii=False,
            ),
        )
        result = _localized_result(
            settings,
            assessment,
            target_locale=job.target_locale,
            source_name=schema_recipe.sourceName,
            image=_source_image_url(schema_recipe.sourceImageUrl, job.source_url) or page_image,
            require_sufficient=False,
        )
        if result:
            return result
        raise ExtractionError("recipe_not_found", "The source did not contain a usable recipe")
    client.stage(job, "extracting_recipe")
    text = readable_page_text(response.text)
    if len(text) < 100:
        raise ExtractionError("site_blocked", "Website did not expose readable recipe content")
    assessment = _parse_llm(settings, source=text)
    result = _localized_result(
        settings,
        assessment,
        target_locale=job.target_locale,
        source_name=None,
        image=page_image,
        require_sufficient=False,
    )
    if not result:
        raise ExtractionError("recipe_not_found", "The source did not contain a usable recipe")
    return result


def extract_job(settings: Settings, client: ConvexWorkerClient, job: ClaimedJob, temp: Path) -> RecipeResult:
    if job.source_type == "website":
        return extract_website(settings, client, job)
    return extract_social(settings, client, job, temp)
