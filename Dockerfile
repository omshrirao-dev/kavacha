FROM python:3.11-slim

WORKDIR /app

# psycopg2-binary and chromadb's onnxruntime ship manylinux wheels, but they
# still need libpq/libgomp present at runtime on a slim base image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# Railway mounts a persistent Volume at this path (configured in the
# dashboard, not in code) -- without it, every redeploy wipes ChromaDB's
# semantic memory since the rest of the container filesystem is ephemeral.
ENV CHROMA_PERSIST_DIR=/data/chroma_data
RUN mkdir -p /data/chroma_data

# Agent system prompts (see app/core/prompts.py, LICENSE) are never part of
# this image -- gitignored locally, and this directory isn't in the COPY
# above either. In production they live on the same Railway Volume,
# uploaded once via `railway volume files upload` (not part of this build).
ENV PROMPT_DIR=/data/prompts

# chromadb's embedding function hardcodes its ONNX model cache to
# Path.home()/.cache/chroma -- which Python resolves from $HOME. Left at the
# default (some ephemeral container path), that ~80MB model re-downloads on
# every single redeploy and container restart, and any request that needs an
# embedding while the download is still in flight gets back an empty/failed
# semantic search -- this was misdiagnosed earlier as "ChromaDB recall gets
# worse as the collection grows" when it was actually "the model isn't
# cached yet after this restart." Pointing $HOME at the persistent volume
# fixes it at the source.
ENV HOME=/data/home
RUN mkdir -p /data/home

EXPOSE 8000

# Shell form (not exec form) so $PORT actually expands -- Railway assigns it
# dynamically per deploy, it is not fixed at 8000.
# --proxy-headers --forwarded-allow-ips='*': Railway terminates TLS at its
# edge and forwards plain HTTP to this container, so without this flag,
# HTTPSRedirectMiddleware would redirect-loop (it sees scheme=http) and
# slowapi's get_remote_address would rate-limit by Railway's proxy IP
# instead of the real client IP, sharing one bucket across every user.
# Trusting all forwarded IPs is safe here only because Railway's network
# model means this container is never reachable except through that proxy.
# Single worker (not --workers N): APScheduler's BackgroundScheduler keeps
# jobs in this process's memory only -- multiple workers would each run
# their own copy of every monitor job, duplicating issues and notifications.
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*' --no-server-header
