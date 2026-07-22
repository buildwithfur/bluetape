FROM denoland/deno:2.4.5 AS deno

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/root/.deno/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deno /usr/bin/deno /usr/local/bin/deno
WORKDIR /app
COPY worker/pyproject.toml /app/pyproject.toml
COPY worker/bluetape_recipe_worker /app/bluetape_recipe_worker
RUN pip install --no-cache-dir .

USER 65532:65532
ENTRYPOINT ["python", "-m", "bluetape_recipe_worker.main"]
