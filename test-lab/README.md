# Nexa Test Lab 1.1.0

Nexa Test Lab is an independent Electron companion application for validating artifacts produced by Nexa App Builder Pro.

## Phase 1 scope

Implemented:

- Local Windows EXE selection.
- File size and SHA-256 validation.
- Isolated temporary artifact copy.
- Windows Portable process, window, stability, screenshot and close checks.
- Explicitly confirmed Installer wizard smoke test.
- Cancellation and registered process-tree cleanup.
- Persistent history under Electron `app.getPath("userData")`.
- JSON, HTML and ZIP reports with logs and screenshots.
- Simulated Android SDK/ADB and WSL2 detection.
- Blocked descriptors for later providers.

Not implemented in Phase 1:

- Android APK execution.
- Linux AppImage or DEB execution.
- Web, PWA, Docker, API or service execution.
- Local macOS virtualization.
- Installer path, shortcut and uninstall certification without configured product expectations.
- Video recording.

A successful Installer wizard smoke test only confirms that the trusted installer starts, presents the expected window and does not immediately fail. It does not certify installation locations or uninstall behavior.

## Security

The renderer has `contextIsolation: true`, `nodeIntegration: false` and sandboxing enabled. It cannot submit shell commands. Profiles accept only allowlisted actions. Remote paths are rejected for Windows execution. Installers always require a native confirmation dialog showing name, size and SHA-256. Test Lab does not disable UAC, antivirus or other host protections.

No SDK, emulator, Docker engine or virtualization product is installed automatically.

## Local commands

From the repository root, install the existing locked Electron build tools:

    npm ci

Then from `test-lab/`:

    npm ci
    npm run validate
    npm test
    npm start
    npm run build:win

The Windows build creates Installer EXE, Portable EXE and ZIP under `test-lab/release/`.

## Storage

Test Lab uses its own Electron userData directory and creates:

- `settings.json`
- `environments.json`
- `test-history.json`
- `reports/`
- `logs/`
- `screenshots/`
- `downloads/`
- `temp/`

JSON replacement uses a temporary file, validation, backup and atomic rename.

## Rollback

Nexa Task Desk files and its existing Windows workflow are not modified. Rollback consists of deleting `test-lab/` and `.github/workflows/test-lab-windows-build.yml`, or restoring the pre-change external snapshot created by the implementation host.
