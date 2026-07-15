# Nexa Test Lab 1.0.6

Nexa Test Lab is the Electron application delivered by the root Windows workflow.

## Active delivery graph

- Root package entry: `test-lab/main.js`
- Active preload: `test-lab/preload.js`
- Source renderer: `test-lab/src/index.html`
- Packaged renderer: `resources/app.asar/test-lab/src/index.html`
- Build manifest: `nexa-build-manifest.json`

The former root template is not an active entry point. Its compatibility HTML no longer contains the old template message or local-check button.

## Packaged application modules

The allowlist in `package.json > build.files` includes:

- Electron main and preload files.
- Core validation, storage, process and runner modules.
- Windows, Android descriptor and Linux descriptor providers.
- Windows PowerShell process/window helpers.
- Reports, screenshots, logs and recording descriptor modules.
- Test profiles, schema, renderer HTML, CSS and JavaScript.
- `nexa.project.json` and `nexa-build-manifest.json`.
- Compatibility `preload.js` and `src/index.html` required by delivery validation.

It excludes tests, validation scripts, releases, generated logs, artifacts, temporary files and `node_modules` from the application payload.

## Validation and local build

Run:

    npm ci
    npm run validate
    npm run build:win
    npm run inspect:package

`npm run validate` verifies the active main/preload/renderer graph, Electron isolation, packaged-file coverage, JavaScript syntax, unit and persistence behavior, acceptance simulations and a real Electron renderer smoke test.

The smoke test verifies Dashboard, Select Artifact, Artifact Information, SHA-256, Environment Status, Test Profile, Start Test, Stop Test, Timeline, Log Console, Screenshots, Final Result, History, Reports and Settings.

The Windows workflow creates:

- Nexa Test Lab Installer EXE.
- Nexa Test Lab Portable EXE.
- Nexa Test Lab ZIP.
- Build manifest and package-inspection report.

Artifact names contain version `1.0.6` and the Build ID. The manifest records the GitHub Run ID, commit SHA and SHA-256 hashes of the active entry points.

## Backup and rollback

Before applying the change, preserve the current commit or create a branch/tag. To inspect and revert this delivery repair:

    git diff
    git diff --check
    git restore package.json nexa.project.json preload.js src/index.html README.md .github/workflows/nexa-windows-build.yml
    git clean -f scripts/create-build-manifest.js scripts/validate-delivery.js scripts/build-windows.js scripts/inspect-package.js test-lab/scripts/ui-smoke.js nexa-build-manifest.json

For an already committed repair, use `git revert <commit-sha>` so rollback remains auditable and does not rewrite history.
