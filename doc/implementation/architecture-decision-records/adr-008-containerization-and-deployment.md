# ADR-008 — Containerization and Deployment Pipeline

**Date:** 2026-03-08
**Status:** Accepted

---

## Context

The application is a pure static SPA: after `npm run build`, the output is a `dist/` directory of HTML, CSS, and JavaScript assets with no server-side runtime dependency. The deployment artifact must be:

- **Portable** — runnable in any environment without platform-specific tooling
- **Self-contained** — includes the HTTP server, configuration, and security headers
- **Multi-architecture** — must run natively on both `linux/amd64` (standard cloud VMs, CI runners, x86 servers) and `linux/arm64` (AWS Graviton, Raspberry Pi, Apple Silicon servers, modern cloud-native infrastructure)
- **Versioned and traceable** — every image is tagged to a specific commit

A static file host (GitHub Pages, Netlify, Cloudflare Pages) would satisfy the portability concern but introduces vendor dependency and removes the ability to self-host or deploy into a private infrastructure. A container image satisfies all constraints without vendor lock-in.

---

## Decision

The deployment artifact is an **OCI-compliant multi-architecture container image** published to the **GitHub Container Registry (`ghcr.io`)**.

The image is built using a **two-stage Dockerfile**: a Node build stage produces the `dist/` assets; an `nginx:alpine` serve stage copies only those assets into the final image. The final image contains no Node runtime, no npm, and no source code — only the compiled static assets and the nginx server.

Multi-architecture support (`linux/amd64` and `linux/arm64`) is achieved via **Docker Buildx** with QEMU emulation in the GitHub Actions runner.

---

## Dockerfile Specification

### Structure

```
Stage 1 — build (node:20-alpine)
  COPY package*.json
  RUN npm ci
  COPY src/ index.html vite.config.ts tsconfig.json
  RUN npm run build
  → produces /app/dist/

Stage 2 — serve (nginx:1.27-alpine)
  COPY --from=build /app/dist /usr/share/nginx/html
  COPY nginx.conf /etc/nginx/conf.d/default.conf
  EXPOSE 80
  CMD ["nginx", "-g", "daemon off;"]
```

### nginx configuration requirements

The nginx config (`nginx.conf` at project root) must:

- Serve `index.html` for all routes (`try_files $uri $uri/ /index.html`) — required for a SPA with client-side routing
- Set security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`
- Enable gzip compression for JS, CSS, and HTML assets
- Set long-lived cache headers (`Cache-Control: max-age=31536000, immutable`) for hashed asset filenames; short-lived headers for `index.html` (`Cache-Control: no-cache`)
- Not expose server version information (`server_tokens off`)

### Final image size target

The final image must be **under 30 MB compressed**. nginx:alpine base is ~8 MB; the SPA assets are expected to be under 5 MB. Exceeding 30 MB indicates an accidental inclusion of build artifacts or source files and must be treated as a build error.

---

## Image Tagging Strategy

Every published image receives two tags:

| Tag | Value | Purpose |
|-----|-------|---------|
| `sha-<short-git-sha>` | e.g. `sha-abc1234` | Immutable reference to a specific commit — use this in production deployments |
| `latest` | Always points to the most recent build from `main` | Convenience tag for development/preview environments |

On a version tag push (e.g. `v1.0.0`), the image additionally receives the semver tag:

| Tag | Example |
|-----|---------|
| `v1.0.0` | Exact version |
| `v1.0` | Minor floating tag |
| `v1` | Major floating tag |

Semver tags are produced using `docker/metadata-action` with the `semver` flavour.

---

## GitHub Actions Pipeline

The full pipeline is split across two workflow files:

### `.github/workflows/ci.yml` — Continuous Integration

Triggers: every push to any branch, every pull request targeting `main`.

```
Jobs (run in order, fail fast):
  1. test-unit      — npm run test:unit (Vitest)
  2. build          — npm run build (TypeScript check + Vite build)
  3. test-e2e       — npm run test:e2e (Playwright, depends on build artefact)
```

This workflow produces no image. It validates correctness only.

### `.github/workflows/release.yml` — Continuous Delivery

Triggers: push to `main` branch OR push of a tag matching `v*.*.*`.

```
Jobs (run in order, fail fast):
  1. test-unit      — npm run test:unit
  2. build          — npm run build
  3. test-e2e       — npm run test:e2e
  4. publish        — Docker Buildx multi-arch build + push to ghcr.io
                      (only runs if jobs 1–3 pass)
```

The `publish` job:

```yaml
- uses: docker/setup-qemu-action@v3          # enables ARM64 emulation
- uses: docker/setup-buildx-action@v3        # enables multi-platform build
- uses: docker/login-action@v3               # authenticate to ghcr.io
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}    # no additional secret required
- uses: docker/metadata-action@v5            # generates tags and labels
  with:
    images: ghcr.io/${{ github.repository }}
    tags: |
      type=sha,prefix=sha-
      type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
      type=semver,pattern={{version}}
      type=semver,pattern={{major}}.{{minor}}
      type=semver,pattern={{major}}
- uses: docker/build-push-action@v6
  with:
    platforms: linux/amd64,linux/arm64
    push: true
    tags: ${{ steps.meta.outputs.tags }}
    labels: ${{ steps.meta.outputs.labels }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

GitHub Actions cache (`type=gha`) is used for the Docker layer cache to keep build times fast across runs.

### Image size gate

After the `docker/build-push-action` step, a size check step pulls the image and fails the job if the compressed image size exceeds 30 MB:

```yaml
- name: Verify image size
  run: |
    SIZE=$(docker manifest inspect ghcr.io/${{ github.repository }}:sha-${{ github.sha }} \
      | jq '[.manifests[].size] | add')
    echo "Total manifest size: $SIZE bytes"
    if [ "$SIZE" -gt 31457280 ]; then
      echo "Image exceeds 30 MB limit"
      exit 1
    fi
```

---

## Alternatives Considered

### Static file host (GitHub Pages, Netlify, Cloudflare Pages)

GitHub Pages and similar platforms serve static assets directly from a CDN with zero operational overhead. For a public hobby project this would be the simplest choice.

**Rejected because:** vendor lock-in for deployment configuration, no control over HTTP headers, no ability to self-host in a private environment or deploy into a container orchestration platform (Kubernetes, ECS, Nomad). A container image works everywhere a static host works and more.

### Single-architecture image (amd64 only)

Simpler to build — no QEMU setup required, faster CI.

**Rejected because:** ARM64 is now the dominant architecture for cost-effective cloud compute (AWS Graviton3 is ~20% cheaper than equivalent x86 at AWS). Apple Silicon is standard for development machines. An amd64-only image runs on ARM64 via emulation but with a measurable performance and memory overhead. The cost of adding multi-arch via Buildx is low (three additional CI steps); the benefit is a first-class native image on both architectures.

### Self-hosted container registry

Running a private registry (Harbor, Gitea) gives full control over image retention and access policies.

**Rejected for v1:** operational overhead is disproportionate for a project at this stage. GitHub Container Registry is free for public repositories, integrates natively with GitHub Actions via `GITHUB_TOKEN` (no additional secret management), and supports multi-architecture manifests. Migrating to a self-hosted registry later requires only updating the `registry` field in the workflow.

### Caddy instead of nginx

Caddy has automatic HTTPS and a simpler configuration syntax.

**Rejected:** HTTPS termination is the responsibility of the infrastructure layer (load balancer, reverse proxy, ingress controller) in a containerised deployment, not the application container. nginx:alpine is a smaller, more widely understood base image for this use case. Caddy would add image size without meaningful benefit.

---

## Consequences

- A `Dockerfile` must be created at the project root as part of the first implementation task
- An `nginx.conf` must be created at the project root
- `.github/workflows/ci.yml` covers testing only (see ADR-007)
- `.github/workflows/release.yml` is the new file that owns the build and publish pipeline
- `GITHUB_TOKEN` permissions in the release workflow must include `packages: write` to push to ghcr.io
- The image size gate (30 MB) is a hard build failure — not a warning
- ARM64 builds via QEMU are slower than native; expected CI time for the publish job is 4–8 minutes
- Any coding agent that modifies the Dockerfile or nginx.conf must verify the image builds locally before opening a PR
