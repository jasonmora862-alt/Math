# Launch MSVO/TNPO Navigator v0.2 on iPhone

## 1. Put the folder in a GitHub repository

The files in this directory are already arranged as a static site. Keep `index.html` and `.nojekyll` at the repository root.

From the GitHub mobile website/app you can create a repository and upload the unzipped files, or commit them from Codespaces.

## 2. Turn on GitHub Pages

In the repository:

1. Open **Settings**.
2. Open **Pages** under Code, planning, and automation.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your publishing branch (normally `main`).
5. Select `/(root)` as the folder.
6. Save.

GitHub will provide the published HTTPS address.

Important: a GitHub Pages website is publicly reachable. Do not place personal learner-state files or participant data in the repository. This app stores learner/pilot state in browser IndexedDB instead.

## 3. Install it from Safari

1. Open the published URL in Safari.
2. Open the page/share menu.
3. Choose **Add to Home Screen**.
4. Leave **Open as Web App** enabled.
5. Tap **Add**.

You will get an MSVO Tutor icon on the Home Screen and it will launch in a standalone app-like window.

## 4. First launch and offline use

Open it online once so the service worker can cache the app shell and bundled map files. Later navigation can work offline from the cache.

## 5. Before Pilot 01

Do **not** treat this package as the frozen P01–P05 pilot build yet.

Current state:

- automated/static conformance: PASS;
- manual rendered-device audit: PENDING;
- pilot build freeze: NO.

Use the iPhone build to complete the seven manual conformance checks in `audit/manual_review_checklist.csv`. Only after those pass should the build hash be declared the frozen pilot build.
