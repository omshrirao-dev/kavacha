# kavacha

The official Python SDK for [Kavacha](https://github.com/omshrirao-dev/kavacha) — autonomous AI maintenance infrastructure. Connect your AI product in three lines:

```python
import kavacha

kavacha.init(api_key="kv_...", project_id="your-project-id")
kavacha.watch(your_ai_app)
```

That's it. Kavacha never crashes your application — if something on Kavacha's side fails (bad key, network blip, anything), the SDK prints one warning to stderr and your code keeps running exactly as it would without it.

## Install

```bash
pip install kavacha
```

## Get an API key

API keys are issued per-project from your Kavacha dashboard (**Project → Settings → API Keys**). The raw key is shown to you exactly once at creation — Kavacha stores only a hash of it, the same way a password would be stored. If you lose it, generate a new one.

Treat it like any other secret: environment variable or secrets manager, never committed to source control.

```python
import os
import kavacha

kavacha.init(api_key=os.environ["KAVACHA_API_KEY"], project_id="your-project-id")
```

## The three functions

### `kavacha.init(api_key, project_id, base_url=None)`

Call once, at startup, before `watch()` or `log_decision()`. Does a lightweight connectivity check and warns (never raises) if it fails.

```python
kavacha.init(api_key="kv_...", project_id="proj_abc123")
```

`base_url` is optional and only needed if you're pointed at something other than the default endpoint (e.g. a local dev instance).

### `kavacha.watch(target)`

Starts observing calls made through `target`.

**For an object** — a LangChain chain, an OpenAI/Anthropic client wrapper, any custom class with an `.invoke()`, `.run()`, `.generate()`, `.predict()`, or `.chat()` method — the bare statement is enough:

```python
chain = build_my_chain()
kavacha.watch(chain)   # patches chain.invoke (or whichever method exists) in place

chain.invoke("hello")  # now observed
```

This works because Python objects are mutable — `watch()` replaces the method on that specific instance, so every later call through the same reference is observed automatically.

**For a plain function**, Python doesn't allow patching a function "in place" the same way. Reassign the return value instead:

```python
def call_my_model(prompt):
    return client.chat(prompt)

call_my_model = kavacha.watch(call_my_model)
```

**What gets sent**: only call metadata — a timestamp, latency in milliseconds, and whether the call succeeded or raised. **Never the prompt or the response content.** This is a hard rule for Kavacha, not a configurable option: a tool that monitors your AI product's reliability should not become a new place your users' data has to be trusted with.

Exceptions from the wrapped call still propagate normally — `watch()` observes, it never swallows.

### `kavacha.log_decision(decision, reason, layer=None)`

Record an architectural decision — and *why* you made it — into your project's permanent memory. This is Kavacha's core differentiator: six months from now, "why did we do this?" has a real, citable answer instead of a guess.

```python
kavacha.log_decision(
    decision="Switched cache backend from in-memory to Redis",
    reason="In-memory cache was lost on every redeploy, causing repeated cold-start latency spikes",
    layer="infrastructure",  # optional
)
```

## What this SDK does *not* do yet

Honestly, on purpose: `watch()` does not auto-detect arbitrary AI frameworks the way the long-term vision describes. It patches a fixed, documented list of common method names (`invoke`, `run`, `generate`, `predict`, `chat`). Deep, automatic instrumentation of any stack is real, ongoing engineering work — this SDK doesn't claim to do it today.

## Security

- The API key is never logged, printed, or included in any exception message this SDK raises or prints.
- All requests are sent over HTTPS in production.
- Every SDK call catches its own errors. None of the three functions will ever raise an exception into your application as a result of a Kavacha-side problem (a malformed call on *your* side, like a wrong type, will still raise normally — that's a bug in your code, not network/auth noise).
