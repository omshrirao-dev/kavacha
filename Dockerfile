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
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'
