# Recipe worker

The worker polls authenticated Convex endpoints for recipe import jobs. It uses Recipe JSON-LD first for websites and `yt-dlp` metadata/subtitles first for social videos, downloading audio only when transcription is required. Transcription defaults to local CPU `faster-whisper` (`base`); set `TRANSCRIPTION_PROVIDER=api` to use an OpenAI-compatible audio transcription endpoint instead.

Copy `.env.example` to `.env`, set the same `RECIPE_WORKER_SECRET` in Convex and the worker, then run:

```sh
docker compose -f docker-compose.recipe.yml up --build
```

Downloaded media lives only in a per-job temporary directory and is removed after each attempt.
