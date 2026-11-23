# B01 · Foundation carry-forward and Compose packaging

`Project_Main/Teaching_CWN2026/week2_student` is the authoritative application. The team works on its sanitized `app/` copy. The 18 Nov historical evidence covers T001–T013 (101 unit/integration and 20 compiled HTTP checks) and T014–T020 (118 unit/integration, four canonical AUTH cases, 15 supplemental UI checks and 199 HTML/RSC checks). The historical checkout contained five canonical Playwright cases including RBAC-03, whose allowed-service assertions depend on later tasks. Full 51-case acceptance and the mutation campaign remain pending. B01 verified file integrity in the imported copy without starting the app. [Foundation evidence](../specs/001-municipal-eservice/foundation/verification-20261118.md) · [Auth evidence](../specs/001-municipal-eservice/auth/verification-20261118.md)

Keep design C, its 64 tokens and approved visuals. Preserve the header-free shell, fixed shadows, the `hero-text-fade` token, the greeting pseudo-element at `translateY(12px)` and `#staff-login .field + .button` at `margin-top:20px`. The custom server owns HTTP lifecycle checks and page guards. B14 owns integration of the shared router, policy, serializers, test hooks and layout. [Team handoff](00-HANDOFF.md)

## Integrity preflight

B01 matched all 10 source documents and 10 approved MP4/poster files to their tracked SHA-256 values. The panorama and SVG match their canonical copies, and the token/motion/design metadata in `web/` matches `specs/`. The imported `web/package-lock.json` SHA-256 is `877f76cba0b3fe1f4e2cf0be600fe2c29464109a762c568b3e81a41c52af2b36`. Record the lockfile hash used for each future run.

Run the following from `app/` and again from the sanitized snapshot before executing it. Keep the authoritative SHA-256 values as the comparison baseline. Wait for run authorization before preparing the snapshot. Exclude `.env.local` and other environment secrets, `var/` and SQLite files or journals, `node_modules/`, `.next/`, `dist/`, `evidence/` and other generated test reports. Leave the user database in its original location. Create run keys and data within the isolated runtime.

```sh
sha256sum -c <<'CHECKSUMS' && python3 - <<'PY'
c5ae4b69c216a72c82fd82a8ee8e851e3b9dccac50a902238b98b5dffea5669f  specs/001-municipal-eservice/source-manifest.json
000189f569c3248fa61fbbd6d49f79ec9c1bbcddbf4ed2f8e57e608895708e05  specs/001-municipal-eservice/design-assets/motion/manifest.json
5b7c3728ae59c9eec216d40911b36a26c40b420f1eadfebdfccb942ef9cee147  specs/001-municipal-eservice/design-tokens.css
ba9780181adf24c29c2aa7defe0af91502db7ee3a726a0f8532fe230c4ba6f62  specs/001-municipal-eservice/design-tokens.json
8f676ee4efb2d040212f0eaf2f579cb55ec7e33478a58f71e3522f54e58e4789  specs/001-municipal-eservice/design-assets.json
329bf2c2884f7ebf0ad87ec7d173feef73a640c66b9eabc271ead9464a86ff3e  web/public/illustrations/civic-thai-suburban-wide.jpg
d217138ab09e5cb240ac0f5b8171c827ce2b4e55b976f668a8689b897344d005  web/public/illustrations/civic-illustrations.svg
CHECKSUMS
import hashlib
import json
import re
from pathlib import Path

feature = Path('specs/001-municipal-eservice')
public = Path('web/public/illustrations')
motion = feature / 'design-assets/motion'

def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

sources = load(feature / 'source-manifest.json')['files']
assert len(sources) == 10
for name, expected in sources.items():
    assert digest(Path(name)) == expected, name

manifest = load(motion / 'manifest.json')
approved = {}
for scene in [*manifest['assets'].values(), *manifest['login_illustrations'].values()]:
    assert scene['user_approved']
    approved[scene['video']] = scene['sha256']
    approved[scene['poster']] = scene['poster_sha256']
provenance = load(public / 'provenance.json')
assert len(approved) == 10 and provenance['sha256'] == approved
assert provenance['selectedVariant'] == 'C' and provenance['greetingFadeTranslateY'] == '12px'
for name, expected in approved.items():
    assert digest(motion / name) == digest(public / name) == expected, name

design = load(feature / 'design-assets.json')
assert design['selectedVariant'] == 'C'
for name in (design['scene']['path'], design['sprite']):
    asset = Path(name)
    assert digest(feature / asset) == digest(public / asset.name), name
for name in ('design-tokens.json', 'design-assets.json'):
    assert digest(feature / name) == digest(public / name), name
assert digest(motion / 'manifest.json') == digest(public / 'motion-manifest.json')

css = Path('web/src/styles/tokens.css')
assert digest(css) == digest(feature / 'design-tokens.css')
tokens = load(feature / 'design-tokens.json')['css']
assert len(tokens) == 64
assert all(f'--ds-{key}: {value};' in css.read_text(encoding='utf-8-sig') for key, value in tokens.items())
civic = Path('web/src/styles/civic.css').read_text(encoding='utf-8')
hero = re.search(r'\.hero-copy::?before\s*\{([^}]+)\}', civic)
assert hero and re.search(r'transform:\s*translateY\(12px\)', hero[1])
assert re.search(r'background:\s*var\(--ds-hero-text-fade\)', hero[1])
assert re.search(r'#staff-login\s+\.field\s*\+\s*\.button\s*\{[^}]*margin-top:\s*20px', civic)
print('10 source documents, 10 approved motion files, panorama, SVG and 64 tokens verified')
PY
```

## Compose recipe for the authorized run

`PROMPTS.md` requires a one-command Compose delivery. The three packaging files are pending. The recipe below uses the pinned Node `24.22.3` from `web/.node-version` and keeps `npm ci` on the Linux target with the existing `.npmrc`. Confirm the base image tag and record its digest for repeatable builds. The current workspace's Node `22.23.3` is outside the supported range. The recipe includes a native module smoke check to catch Linux/ABI issues during the build.

`web/Dockerfile`, with the repository root as the build context:

```dockerfile
FROM node:24.22.3-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends socat tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/web
RUN chown node:node /app/web
USER node
COPY --chown=node:node web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci
COPY --chown=node:node web/ ./
RUN node -e "new (require('better-sqlite3'))(':memory:').close(); require('sharp')" \
    && npm run build
ENV NODE_ENV=production
EXPOSE 8080
CMD ["sh", "-c", "socat TCP-LISTEN:8080,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:3000 & exec node --import tsx scripts/start-acceptance-server.ts"]
```

Root `.dockerignore` for that build context:

```dockerignore
**
!web/
!web/**
**/.git
**/.env*
**/node_modules
**/.next
**/dist
**/var
**/evidence
**/test-results
**/playwright-report
**/*.tsbuildinfo
**/*.sqlite*
**/*.db
**/*.db-*
```

Root `compose.yaml`:

```yaml
services:
  web:
    build:
      context: .
      dockerfile: web/Dockerfile
    init: true
    environment:
      TEST_MODE: "${TEST_MODE:-0}"
      BUG_MODE: "${BUG_MODE:-}"
      TZ: Asia/Bangkok
      DB_PATH: /app/web/var/compose.sqlite
      PORT: "3000"
    tmpfs:
      - /app/web/var:mode=0700,uid=1000,gid=1000
    ports:
      - "127.0.0.1:3000:8080"
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - >-
          const socket = require('node:net').connect(3000, '127.0.0.1');
          socket.once('connect', () => socket.end());
          socket.once('error', () => process.exit(1));
      interval: 5s
      timeout: 3s
      retries: 24
```

`server.ts` binds to container loopback even when `HOSTNAME` is set. The forwarder publishes only to host loopback and keeps the app's custom server in the request path. The TCP readiness probe avoids HTTP lifecycle mutations. The existing launcher creates three distinct keys in the app process and seeds only an uninitialized DB. The writable tmpfs belongs to the app user and holds data only for that container run, so each fresh run starts with a fresh seed and matching keys. [Server entry point](../web/server.ts) · [Acceptance launcher](../web/scripts/start-acceptance-server.ts)

After authorization and preflight, the one-command baseline is `TEST_MODE=1 BUG_MODE= docker compose up --build --wait`. From the host check `GET http://127.0.0.1:3000/api/health` for HTTP 200 and `{"status":"ok"}`. Check `/login` and seed verification through the same address. Verify hooks with `TEST_MODE=1` and verify that `POST /api/test/reset` returns 404 in a separate hooks-disabled run. Apply `BUG_MODE` at startup as a comma-separated value, with an empty value for baseline. [Contract](../CONTRACT.md) · [Mutation oracle](../BUGS.md)

For Playwright, retain the sanitized `specs/001-municipal-eservice/contracts/inventory.json` beside `web/`. The runner defaults to owning a server and rejects server reuse. An explicitly coordinated run sets `ACCEPTANCE_OWNED_SERVER=1`, `BASE_URL`, `TEST_MODE=1`, `BUG_MODE` and `DB_PATH`. Use the DB path reachable by the runner, especially for at-rest inspection. B14 owns the two baseline passes on one server, per-mutant restarts, the two combined runs and the final clean pass. Keep evidence per run and log in again after each reset. [Playwright config](../web/playwright.config.ts) · [Acceptance preflight](../web/scripts/check-acceptance.ts)

B01 reran the integrity preflight above and validated the sample Compose configuration with `docker compose config --quiet` from standard input. Building the image, starting the Compose service, preparing the execution snapshot and producing new Playwright evidence remain pending.


## Orchestrator note (2026-11-22)

The step-3 run is authorized. The orchestrator wrote `compose.yaml`, `web/Dockerfile` and `.dockerignore` verbatim from the recipe above. They are untested; B14 builds and verifies them.
