# ADR 002: External Docker worker for recipe media extraction

## Status

Accepted

## Context

PER-3 imports recipes from public TikTok, Instagram, YouTube, and website URLs. Social imports need metadata/caption extraction, optional media download, subtitle discovery, audio normalization, transcription, and structured LLM parsing. These tasks require frequently updated native and Python tooling such as `yt-dlp`, `ffmpeg`, `ffprobe`, and a supported JavaScript runtime for current YouTube extraction.

Convex remains the correct home for authenticated mutations, family-scoped permissions, durable job state, retries, recipe records, and realtime UI updates. It is not a suitable process host for this workload: Convex actions have a ten-minute timeout and 512 MB Node.js memory limit, and the managed runtime does not provide a deployable system image where Bluetape can install and maintain media binaries.

## Decision

Run media acquisition and extraction in a separate Linux Docker worker. Keep Convex as the system of record and durable queue.

### Job lifecycle

1. An authenticated Convex mutation validates the family, normalizes the URL, checks for an existing source, and inserts a `recipeImportJobs` row with status `queued`.
2. The worker polls an authenticated Convex HTTP claim endpoint. Claiming is transactional and gives the worker a time-limited lease so an abandoned job can be retried.
3. The worker posts coarse stages back to Convex: `reading_source`, `reading_caption`, `transcribing`, `extracting_recipe`, `needs_review`, `failed`, or `complete`.
4. The worker submits a validated structured draft. Convex verifies the job lease and writes the family-scoped recipe/import records.
5. The UI observes the Convex job record reactively; it never connects to the media worker directly.

Polling from the worker keeps local development simple because the Convex development deployment is publicly reachable while a laptop's `localhost` is not. It also avoids an extra queue product for the low-volume MVP.

### Worker image

The initial image contains:

- Python 3.12
- `yt-dlp[default]`
- `gallery-dl` for bounded Instagram carousel-image fallback
- `ffmpeg` and `ffprobe`
- Deno for `yt-dlp-ejs` / current YouTube JavaScript challenges
- an HTTP client and HTML/JSON-LD parser
- the transcription and structured-output LLM client

`yt-dlp` remains the primary video and post-metadata path. A real mixed Instagram carousel fixture showed that it can return a valid post caption while reporting “No video formats found” for a still-image child. Metadata extraction therefore tolerates unavailable child items and parses the post-level caption first. Only when that caption is insufficient does the worker use `gallery-dl` to fetch a bounded set of carousel images for vision review. If Instagram redirects the extractor to login, the job fails with `login_required`; the UI explains that the source is not public or requires login and lets the importer clear the failed draft.

For social video, parse the title plus caption/description first. If that evidence already contains a useful ingredient list and actionable steps, return the draft without downloading subtitles or media. Otherwise fetch original-language subtitles without downloading the video and parse the accumulated evidence again. Download and transcribe the smallest suitable audio stream only when the subtitle-enriched draft is still incomplete. Download a 480p-or-smaller video and inspect a bounded set of sampled frames only when the transcript still leaves visual gaps such as on-screen quantities or unstated actions. Website imports do not use the media binaries: fetch bounded HTML, prefer Recipe JSON-LD/schema.org, and fall back to readable page text plus structured LLM extraction.

Source access is direct by default. A configured DataImpulse residential proxy is used only after an access failure. Once activated, the worker reuses one job-specific `sessid` for metadata, subtitle, audio, and video requests for the remainder of that import. Convex and OpenRouter traffic never uses this proxy.

### Deployment

Use Railway for the first production worker deployment, under the **Indiego Lab** workspace (`202ab447-dd12-462e-85b5-b2e70799d7ac`). The dedicated **bluetape** project (`8f3dbd79-5e5a-414e-b6f4-38b9b12a0c5b`) contains the production environment for this worker. A Railway service can build the repository's Dockerfile and run the long-lived polling process without adding queue infrastructure. It is the shortest path to a reliable MVP and allows the same container to run locally with Docker Compose.

Cloudflare Containers is the preferred consolidation option if keeping all non-Convex compute on Cloudflare becomes more important than MVP simplicity. It supports `linux/amd64` Docker images and short-lived batch workloads, but requires a Worker/Durable Object lifecycle layer and its disk is ephemeral. A push-based job trigger would be a better fit there than an always-on polling worker.

### Operational and security rules

- Accept public `http`/`https` sources only; do not accept browser cookie uploads in V1. Sources requiring an authenticated platform session fail clearly rather than borrowing a user's browser session.
- Block loopback, link-local, private, and metadata-service destinations before fetches and after redirects.
- Invoke binaries with an argument array and `shell: false`; never interpolate a user URL into a shell command.
- Use one isolated temporary directory per job and remove it in a `finally` path.
- Cap source duration, download bytes, HTML bytes, redirects, execution time, and transcript length.
- Start at concurrency one per worker; increase only after observing CPU, memory, platform throttling, and transcription costs.
- Authenticate worker endpoints with a rotatable secret and constant-time verification. Never expose the worker secret to the browser.
- Pin image dependencies for reproducible deploys, rebuild frequently, and run smoke fixtures against all supported platforms because extractors break when source sites change.
- Preserve only the source metadata, transcript/extraction evidence needed for retry/debugging, and the final recipe. Do not retain downloaded media by default.

## Consequences

- Bluetape gains a small second backend deployment, but Convex remains the only database and authorization authority.
- Native binaries and Python packages are isolated from the frontend and Convex runtime.
- Local and production processing use the same Docker image.
- Job progress and retries remain durable and visible in realtime.
- Social-source reliability is best effort: public posts can still be blocked, rate-limited, or require platform tokens/cookies. The UI must retain the planned partial/failure states.
- `yt-dlp`, `gallery-dl`, and the JavaScript runtime need active maintenance; these are operational dependencies, not one-time installations.
