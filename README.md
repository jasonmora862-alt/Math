# MSVO / TNPO Learning Navigator v0.2

A learner-first, local-first Progressive Web App implementing the current frozen MSVO/TNPO governance stack.

## Primary navigation

- **Learn** — choose a mathematical target, record exposure/practice, inspect why the next step is allowed, and submit learner corrections as SELF_REPORT observations.
- **Map** — browse/search the bundled MSVO map with deterministic MAP FACT provenance.
- **Progress** — inspect exposure, practice, validation, retention, and evidence separately. No mastery percentage is calculated.
- **More** — inspect TNPO, export grounded AI context, run the protected pilot lane, manage local data, and inspect research status.

## Governance implemented

- deterministic MAP FACT / OBSERVATION / INFERENCE / DECISION provenance badges;
- ESTABLISHED / SUPPORTED_NOT_ESTABLISHED / CONFLICTING_EVIDENCE / INSUFFICIENT_EVIDENCE vocabulary;
- learner corrections are evidence, never direct validation-state commands;
- practice cannot create validation;
- assisted performance cannot create independent validation;
- validation role must be declared prospectively;
- retention reminders require an authorized policy trigger;
- historical validation remains preserved;
- missing prerequisite evidence is surfaced instead of invented;
- learner-facing semantic outputs are registered in `data/semantic_catalog.json` for reverse traceability;
- state writes are centralized through governed transition logic;
- event ledgers use append-only `add()` writes during ordinary operation.

## Current evidence status

- Automated/static conformance lane: **PASS**.
- Required manual/rendered-device conformance lane: **PENDING**.
- Pilot build: **NOT FROZEN**.
- Real-user Pilot 01: **NOT STARTED**.
- Learning efficacy: **NOT TESTED**.

See `audit/CONFORMANCE_AUDIT_REPORT_v0.2.md`.

## Bundled map state

- MSVO nodes: 782
- MSVO edges: 1,744
- TNPO roots: 5
- TNPO frozen branches: 26

The bundled MSVO edge set currently contains no `REQUIRES` edges. v0.2 therefore explicitly refuses to invent prerequisite claims from the ontology tree.

## Run locally

Because the app uses ES modules and a service worker, serve the directory over HTTP/HTTPS rather than opening `index.html` directly.

Example on a laptop:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy as a phone web app

This folder is a static site and includes `.nojekyll`, so it can be published from the repository root with GitHub Pages.

After deployment, open the HTTPS site on iPhone in Safari, choose **Add to Home Screen**, leave **Open as Web App** enabled, and add it.

## Files

- `index.html` — learner-first UI
- `app.js` — interface/controller logic
- `governance.js` — deterministic governance and transition rules
- `db.js` — IndexedDB storage and protected pilot data lanes
- `data/semantic_catalog.json` — learner-facing semantic output registry
- `service-worker.js` — offline shell/map caching
- `tests/governance.test.mjs` — deterministic governance tests
- `audit/` — traceability, static audit, and manual-device checklist
- `specs/` — frozen governing artifacts copied into this build package
- `BUILD_MANIFEST.json` — runtime SHA-256 hashes
