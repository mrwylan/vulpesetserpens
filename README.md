# vulpesetserpens

A browser-based tool for musicians to extract click-free loopable fragments from audio samples (WAV, AIFF, etc.). Runs entirely in the browser — no backend, no uploads to any server.

## Run locally with Docker

The pre-built image is published to the GitHub Container Registry for every push to `main` and every version tag.

```bash
docker run --rm -p 8080:80 ghcr.io/mrwylan/vulpesetserpens:latest
```

Then open **http://localhost:8080** in your browser.

### Specific version

```bash
# Pin to a release tag
docker run --rm -p 8080:80 ghcr.io/mrwylan/vulpesetserpens:1.0.0

# Or pin to a specific commit SHA
docker run --rm -p 8080:80 ghcr.io/mrwylan/vulpesetserpens:sha-abc1234
```

### Docker Compose

```yaml
services:
  vulpesetserpens:
    image: ghcr.io/mrwylan/vulpesetserpens:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

```bash
docker compose up -d
```

### Notes

- The image is multi-architecture: `linux/amd64` and `linux/arm64` (Apple Silicon, Raspberry Pi).
- No environment variables or volumes are required — the app is a fully self-contained static site served by nginx.
- Audio processing runs entirely in your browser via the Web Audio API. No audio data leaves your machine.

## Development

```bash
npm install
npm run dev        # start dev server at http://localhost:5173
npm run build      # production build → dist/
npm run test:unit  # unit tests with coverage (79 tests, ~91% coverage)
npm run test:e2e   # Playwright E2E tests (requires dev server or built dist)
```
