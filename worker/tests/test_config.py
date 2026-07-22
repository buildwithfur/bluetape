from bluetape_recipe_worker.config import Settings


def test_defaults_to_openrouter_transcription_and_reuses_its_key(monkeypatch) -> None:
    monkeypatch.setenv("CONVEX_SITE_URL", "https://example.convex.site")
    monkeypatch.setenv("RECIPE_WORKER_SECRET", "worker-secret")
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-key")
    monkeypatch.delenv("TRANSCRIPTION_PROVIDER", raising=False)
    monkeypatch.delenv("TRANSCRIPTION_API_KEY", raising=False)
    monkeypatch.delenv("TRANSCRIPTION_API_URL", raising=False)
    monkeypatch.delenv("TRANSCRIPTION_MODEL", raising=False)

    settings = Settings.from_env()

    assert settings.transcription_provider == "api"
    assert settings.transcription_api_key == "openrouter-key"
    assert settings.transcription_api_url == "https://openrouter.ai/api/v1/audio/transcriptions"
    assert settings.transcription_model == "openai/whisper-large-v3-turbo"


def test_dedicated_transcription_key_overrides_openrouter_key(monkeypatch) -> None:
    monkeypatch.setenv("CONVEX_SITE_URL", "https://example.convex.site")
    monkeypatch.setenv("RECIPE_WORKER_SECRET", "worker-secret")
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-key")
    monkeypatch.setenv("TRANSCRIPTION_API_KEY", "transcription-key")

    settings = Settings.from_env()

    assert settings.transcription_api_key == "transcription-key"
