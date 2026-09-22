# Put v0.2 on the iPhone and run the rendered-device audit — v1.1 handoff

Target runtime: v0.2.0  
SHA-256: `5ffb351b599934a496f5def7a0f62e8a8e78ab08e62cfc7ebb3cffbae251d2a0`

Rendered-device protocol: `RENDERED_DEVICE_AUDIT_PROTOCOL_v1.1_FROZEN.md`

## Revision status

Protocol v1.1 was frozen **before any rendered-device review**. It supersedes v1.0 for first execution but does not change runtime code or the runtime hash. The v1.0 protocol remains preserved as the prior frozen record.

The v1.1 amendment is deliberately narrow: MAN-001 must be tested by a cold R2 reviewer through a short ordinary learner-facing mini-session, rather than by showing the uncertainty state without the topic/task context a real learner would have. No interpretive coaching is allowed. MAN-002 through MAN-007 criteria are unchanged.

## Publish the exact build

Use the contents of the phone-ready runtime folder as the root of a GitHub repository. Keep `.nojekyll` in the root.

In GitHub: Settings -> Pages -> Build and deployment -> Deploy from a branch -> `main` -> `/(root)` -> Save.

Do not add personal learner state or participant data to the repository. The static site is publishable; personal state stays in the browser database.

## Install on iPhone

Open the published HTTPS URL in Safari -> Share/Page Menu -> Add to Home Screen -> leave **Open as Web App** enabled -> Add.

Launch the new Home Screen icon once while online so bundled static assets can be cached.

## Do not freeze the pilot build yet

Run `audit/RENDERED_DEVICE_AUDIT_PROTOCOL_v1.1_FROZEN.md` against this exact runtime build.

MAN-001 and MAN-006 require a cold semantic reviewer who is not P01-P05 and has not read the TNPO/MSVO governance documents.

For MAN-001, R2 must encounter both uncertainty states through ordinary learner-facing contextual entry. R1 may navigate but may not explain or contrast the intended evidence-state meanings before scoring.

Record results in `audit/rendered_device_audit_results_template_v1.1.csv`.

Only after MAN-001 through MAN-007 are all PASS may this runtime hash be adjudicated for Pilot-01 build freeze.
