import json
import subprocess
from types import SimpleNamespace

import pytest

from bluetape_recipe_worker.client import ClaimedJob
from bluetape_recipe_worker import extract
from bluetape_recipe_worker.extract import (
    ExtractionError,
    RecipeAssessment,
    SourceAccess,
    extract_recipe_schema,
    source_page_image,
)
from bluetape_recipe_worker.security import UnsafeSourceUrl, validate_public_url


def test_extracts_recipe_json_ld() -> None:
    payload = {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "Rice",
        "recipeIngredient": ["1 cup rice", "2 cups water"],
        "recipeInstructions": [{"@type": "HowToStep", "text": "Cook the rice."}],
    }
    html = f'<script type="application/ld+json">{json.dumps(payload)}</script>'
    recipe = extract_recipe_schema(html)
    assert recipe is not None
    assert recipe.title == "Rice"
    assert recipe.steps == ["Cook the rice."]


def test_extracts_absolute_source_page_image() -> None:
    html = '<meta property="og:image" content="/images/curry.jpg">'

    assert source_page_image(html, "https://example.com/recipes/curry") == (
        "https://example.com/images/curry.jpg"
    )


def test_rejects_non_http_source_page_image() -> None:
    html = '<meta property="og:image" content="data:image/png;base64,abc">'

    assert source_page_image(html, "https://example.com/recipe") is None


@pytest.mark.parametrize("url", ["http://127.0.0.1/a", "http://localhost/a", "file:///tmp/a"])
def test_rejects_non_public_sources(url: str) -> None:
    with pytest.raises(UnsafeSourceUrl):
        validate_public_url(url)


class FakeClient:
    def __init__(self) -> None:
        self.stages: list[str] = []

    def stage(self, _job: ClaimedJob, stage: str) -> None:
        self.stages.append(stage)


def social_job() -> ClaimedJob:
    return ClaimedJob(
        job_id="job-123",
        recipe_id="recipe-123",
        source_url="https://www.youtube.com/watch?v=abc",
        source_type="youtube",
        target_locale="en",
        lease_token="lease",
    )


def social_settings() -> SimpleNamespace:
    return SimpleNamespace(
        dataimpulse_proxy_url=None,
        max_video_seconds=1800,
        max_download_bytes=10_000_000,
        max_visual_frames=8,
    )


def completed_process(stdout: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(["yt-dlp"], 0, stdout=stdout, stderr="")


def test_caption_recipe_skips_subtitles_and_media(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    commands: list[list[str]] = []
    metadata = {"title": "Soup", "description": "1 cup water. Boil the water."}

    def fake_run(command, **_kwargs):
        commands.append(command)
        return completed_process(json.dumps(metadata))

    monkeypatch.setattr(extract, "_run", fake_run)
    monkeypatch.setattr(
        extract,
        "_parse_llm",
        lambda *_args, **_kwargs: RecipeAssessment(
            title="Soup",
            ingredients=["1 cup water"],
            steps=["Boil the water."],
            sufficient=True,
            sourceLanguage="en",
        ),
    )

    result = extract.extract_social(social_settings(), FakeClient(), social_job(), tmp_path)

    assert result.title == "Soup"
    assert len(commands) == 1
    assert "--skip-download" in commands[0]
    assert "--ignore-errors" in commands[0]


def test_instagram_carousel_uses_requested_item_thumbnail(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    metadata = {
        "title": "Three Cup Chicken",
        "description": "200g chicken. Marinate and stir-fry until cooked.",
        "entries": [
            None,
            {"thumbnail": "https://example.com/second.jpg", "duration": 8},
            {"thumbnail": "https://example.com/third.jpg", "duration": 9},
            {"thumbnail": "https://example.com/fourth.jpg", "duration": 10},
        ],
    }
    job = social_job()
    job = ClaimedJob(
        job_id=job.job_id,
        recipe_id=job.recipe_id,
        source_url="https://www.instagram.com/p/example/?img_index=4",
        source_type="instagram",
        target_locale=job.target_locale,
        lease_token=job.lease_token,
    )

    monkeypatch.setattr(
        extract, "_run", lambda *_args, **_kwargs: completed_process(json.dumps(metadata))
    )
    monkeypatch.setattr(
        extract,
        "_parse_llm",
        lambda *_args, **_kwargs: RecipeAssessment(
            title="Three Cup Chicken",
            ingredients=["200g chicken"],
            steps=["Marinate and stir-fry until cooked."],
            sufficient=True,
            sourceLanguage="en",
        ),
    )

    result = extract.extract_social(social_settings(), FakeClient(), job, tmp_path)

    assert result.sourceImageUrl == "https://example.com/fourth.jpg"


def test_instagram_carousel_uses_gallery_images_only_after_caption_is_insufficient(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    metadata = {
        "title": "Three Cup Chicken",
        "description": "A chicken recipe.",
        "entries": [{"thumbnail": "https://example.com/first.jpg"}],
    }
    job = ClaimedJob(
        job_id="job-123",
        recipe_id="recipe-123",
        source_url="https://www.instagram.com/p/example",
        source_type="instagram",
        target_locale="en",
        lease_token="lease",
    )
    image = tmp_path / "gallery.jpg"
    image.write_bytes(b"image")
    assessments = iter([
        RecipeAssessment(
            title="Three Cup Chicken",
            sufficient=False,
            missingEvidence=["ingredients", "steps"],
            needsVisualReview=True,
        ),
        RecipeAssessment(
            title="Three Cup Chicken",
            ingredients=["200g chicken"],
            steps=["Stir-fry until cooked."],
            sufficient=True,
            sourceLanguage="en",
        ),
    ])

    monkeypatch.setattr(
        extract, "_run", lambda *_args, **_kwargs: completed_process(json.dumps(metadata))
    )
    monkeypatch.setattr(extract, "_download_gallery_images", lambda *_args: [image])
    monkeypatch.setattr(extract, "_parse_llm", lambda *_args, **_kwargs: next(assessments))
    monkeypatch.setattr(
        extract,
        "_download_audio",
        lambda *_args: pytest.fail("audio should not download after successful carousel review"),
    )

    result = extract.extract_social(social_settings(), FakeClient(), job, tmp_path)

    assert result.ingredients == ["200g chicken"]


def test_gallery_login_redirect_maps_to_login_required(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setattr(
        extract,
        "_run",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            ExtractionError("source_unavailable", "HTTP redirect to login page")
        ),
    )

    with pytest.raises(ExtractionError) as error:
        SourceAccess(None).run_gallerydl(["https://example.com/post"], cwd=tmp_path)

    assert error.value.code == "login_required"


def test_subtitle_recipe_skips_audio_download(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    commands: list[list[str]] = []
    assessments = iter([
        RecipeAssessment(title="Soup", sufficient=False, missingEvidence=["ingredients"]),
        RecipeAssessment(
            title="Soup",
            ingredients=["1 cup water"],
            steps=["Boil the water."],
            sufficient=True,
            sourceLanguage="en",
        ),
    ])

    def fake_run(command, **_kwargs):
        commands.append(command)
        return completed_process(json.dumps({"title": "Soup", "description": "Soup"}))

    monkeypatch.setattr(extract, "_run", fake_run)
    monkeypatch.setattr(extract, "_subtitle_text", lambda *_args: "1 cup water. Boil it.")
    monkeypatch.setattr(extract, "_parse_llm", lambda *_args, **_kwargs: next(assessments))

    result = extract.extract_social(social_settings(), FakeClient(), social_job(), tmp_path)

    assert result.ingredients == ["1 cup water"]
    assert len(commands) == 1


def test_subtitle_choice_prefers_provider_default_before_english() -> None:
    metadata = {
        "subtitles": {
            "ms": [{"ext": "vtt"}],
            "en": [{"ext": "vtt"}],
            "fr": [{"ext": "vtt"}],
        }
    }

    assert extract._subtitle_choice(metadata) == ("ms", False)


def test_assessment_result_preserves_detected_source_language() -> None:
    assessment = RecipeAssessment(
        title="Padang chicken curry",
        ingredients=["1 chicken"],
        steps=["Cook the chicken."],
        sufficient=True,
        sourceLanguage="ms",
    )

    result = extract._assessment_result(assessment, source_name=None, image=None)

    assert result is not None
    assert result.sourceLanguage == "ms"


def test_translation_preserves_structure_and_source_language(monkeypatch: pytest.MonkeyPatch) -> None:
    assessment = RecipeAssessment(
        title="Gulai Ayam Padang",
        ingredients=["satu ekor ayam", "garam"],
        steps=["Masak ayam.", "Masukkan garam."],
        sufficient=True,
        sourceLanguage="ms",
    )
    response = SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "ingredient:0": "one whole chicken",
                        "ingredient:1": "salt",
                        "step:0": "Cook the chicken.",
                        "step:1": "Add salt.",
                    }),
                },
            }],
        },
    )
    request: dict = {}

    def fake_post(*_args, **kwargs):
        request.update(kwargs)
        return response

    monkeypatch.setattr(extract.httpx, "post", fake_post)

    translated = extract._translate_assessment(
        SimpleNamespace(openrouter_api_key="key", openrouter_model="model"),
        assessment,
        "en",
    )

    assert translated.ingredients == ["one whole chicken", "salt"]
    assert translated.title == "Gulai Ayam Padang"
    assert translated.sourceLanguage == "ms"
    assert request["json"]["reasoning"] == {"effort": "none"}
    assert request["json"]["max_tokens"] == 3000


def test_translation_rejects_changed_structure(monkeypatch: pytest.MonkeyPatch) -> None:
    assessment = RecipeAssessment(
        title="Sup",
        ingredients=["air", "garam"],
        steps=["Masak."],
        sufficient=True,
        sourceLanguage="ms",
    )
    response = SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "ingredient:0": "water",
                        "step:0": "Cook.",
                    }),
                },
            }],
        },
    )
    monkeypatch.setattr(extract.httpx, "post", lambda *_args, **_kwargs: response)

    with pytest.raises(ExtractionError, match="changed the recipe structure"):
        extract._translate_assessment(
            SimpleNamespace(openrouter_api_key="key", openrouter_model="model"),
            assessment,
            "en",
        )


def test_subtitle_choice_prefers_declared_language() -> None:
    metadata = {
        "language": "ms",
        "subtitles": {
            "en": [{"ext": "vtt"}],
            "ms": [{"ext": "vtt"}],
        },
    }

    assert extract._subtitle_choice(metadata) == ("ms", False)


def test_subtitle_choice_uses_automatic_captions_only_without_manual_subtitles() -> None:
    metadata = {
        "automatic_captions": {
            "en-orig": [{"ext": "vtt", "name": "English (Original)"}],
            "ms-en": [{"ext": "vtt", "name": "Malay from English"}],
        }
    }

    assert extract._subtitle_choice(metadata) == ("en-orig", True)


def test_subtitle_download_uses_ytdlp(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    commands: list[list[str]] = []

    class FakeAccess:
        def run_ytdlp(self, args, *, cwd, timeout=180):
            commands.append(args)
            (cwd / "subtitle-video.ar.vtt").write_text(
                "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nموزة واحدة",
                encoding="utf-8",
            )
            return completed_process()

    text = extract._subtitle_text(
        {"subtitles": {"ar": [{"ext": "vtt"}], "en": [{"ext": "vtt"}]}},
        FakeAccess(),
        "https://www.youtube.com/watch?v=abc",
        tmp_path,
    )

    assert text == "موزة واحدة"
    assert "--write-subs" in commands[0]
    assert commands[0][commands[0].index("--sub-langs") + 1] == "ar"


def test_blocked_subtitle_falls_back_to_audio(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    assessments = iter([
        RecipeAssessment(title="Soup", sufficient=False, missingEvidence=["steps"]),
        RecipeAssessment(
            title="Soup",
            ingredients=["1 cup water"],
            steps=["Boil the water."],
            sufficient=True,
            sourceLanguage="en",
        ),
    ])
    audio = tmp_path / "audio.mp3"
    audio.write_bytes(b"audio")

    monkeypatch.setattr(
        extract,
        "_run",
        lambda *_args, **_kwargs: completed_process(
            json.dumps({"title": "Soup", "description": "Soup"})
        ),
    )
    monkeypatch.setattr(
        extract,
        "_subtitle_text",
        lambda *_args: (_ for _ in ()).throw(ExtractionError("site_blocked", "blocked")),
    )
    monkeypatch.setattr(extract, "_download_audio", lambda *_args: audio)
    monkeypatch.setattr(extract, "_transcribe", lambda *_args: "1 cup water. Boil it.")
    monkeypatch.setattr(extract, "_parse_llm", lambda *_args, **_kwargs: next(assessments))
    client = FakeClient()

    result = extract.extract_social(social_settings(), client, social_job(), tmp_path)

    assert result.steps == ["Boil the water."]
    assert "transcribing" in client.stages


def test_proxy_stays_active_after_direct_failure(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    commands: list[list[str]] = []

    def fake_run(command, **_kwargs):
        commands.append(command)
        if len(commands) == 1:
            raise ExtractionError("source_unavailable", "ERROR: HTTP Error 429: Too Many Requests")
        return completed_process("{}")

    monkeypatch.setattr(extract, "_run", fake_run)
    access = SourceAccess("http://user__sessid.job:secret@gw.dataimpulse.com:823")

    access.run_ytdlp(["--dump-single-json", "https://example.com/video"], cwd=tmp_path)
    access.run_ytdlp(["--list-subs", "https://example.com/video"], cwd=tmp_path)

    assert "--proxy" not in commands[0]
    assert commands[1][1:3] == ["--proxy", access.proxy_url]
    assert commands[2][1:3] == ["--proxy", access.proxy_url]


def test_non_blocking_ytdlp_failure_does_not_enable_proxy(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    commands: list[list[str]] = []

    def fake_run(command, **_kwargs):
        commands.append(command)
        raise ExtractionError("source_unavailable", "ERROR: unsupported URL")

    monkeypatch.setattr(extract, "_run", fake_run)
    access = SourceAccess("http://user__sessid.job:secret@gw.dataimpulse.com:823")

    with pytest.raises(ExtractionError, match="unsupported URL"):
        access.run_ytdlp(["--dump-single-json", "https://example.com/video"], cwd=tmp_path)

    assert len(commands) == 1
    assert "--proxy" not in commands[0]
    assert access.using_proxy is False
