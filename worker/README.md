# Recipe worker

The worker polls authenticated Convex endpoints for recipe import jobs. Websites use Recipe JSON-LD first and bounded readable HTML second. Social imports use a progressive evidence ladder: caption/description, original-language subtitles, audio transcription, then low-resolution video frames. Instagram carousel metadata tolerates still-image child errors; when its caption is incomplete, `gallery-dl` downloads a bounded set of carousel images for vision review. Each later stage runs only when the LLM judges the accumulated evidence incomplete. Audio transcription uses OpenRouter's `openai/whisper-large-v3-turbo` through its OpenAI-compatible transcription endpoint and reuses `OPENROUTER_API_KEY` by default.

Direct source access is always attempted first. To retry bot-detected or blocked requests through DataImpulse, set `DATAIMPULSE_PROXY_URL` to an HTTP proxy URL whose username includes `sessid.{session}`. The worker replaces `{session}` with a job-specific value and reuses that proxy session for the rest of the import. Proxy credentials are never sent to Convex or the browser.

Public-only is intentional. If a provider redirects `gallery-dl` to login, the worker reports `login_required`; it does not read browser cookies or accept user session uploads.

Copy `.env.example` to `.env`, set the same `RECIPE_WORKER_SECRET` in Convex and the worker, then run:

```sh
docker compose -f docker-compose.recipe.yml up --build
```

Downloaded media and sampled frames live only in a per-job temporary directory and are removed after each attempt.
