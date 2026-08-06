# Recipe worker

The worker polls authenticated Convex endpoints for recipe import jobs. Websites use Recipe JSON-LD first and bounded readable HTML second. Social imports use a progressive evidence ladder: caption/description, a bounded set of non-social recipe links found in that text, original-language subtitles, audio transcription, then low-resolution video frames. A linked page is read only when the social text does not already contain a usable recipe, is accepted only when it yields a complete recipe on its own, and the saved source remains the original social post. Instagram carousel metadata tolerates still-image child errors; when its caption is incomplete, `gallery-dl` downloads a bounded set of carousel images for vision review. Each later stage runs only when the LLM judges the accumulated evidence incomplete. Audio transcription uses OpenRouter's `openai/whisper-large-v3-turbo` through its OpenAI-compatible transcription endpoint and reuses `OPENROUTER_API_KEY` by default.

Direct source access is always attempted first. To retry bot-detected or blocked requests through DataImpulse, set `DATAIMPULSE_PROXY_URL` to an HTTP proxy URL whose username includes `sessid.{session}`. The worker replaces `{session}` with a job-specific value and reuses that proxy session for the rest of the import. Proxy credentials are never sent to Convex or the browser.

Public-only is intentional. If a provider redirects `gallery-dl` to login, the worker reports `login_required`; it does not read browser cookies or accept user session uploads.

Copy `.env.example` to `.env`, set the same `RECIPE_WORKER_SECRET` in Convex and the worker, then run:

```sh
docker compose -f docker-compose.recipe.yml up --build
```

Downloaded audio, video, sampled frames, and other working media live only in a per-job temporary directory and are removed after each attempt. A source thumbnail, when available and no larger than `MAX_SOURCE_IMAGE_BYTES` (default 8 MiB), is uploaded to Convex file storage so recipe cards do not depend on expiring provider URLs.
