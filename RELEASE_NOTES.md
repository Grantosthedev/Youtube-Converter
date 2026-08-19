# Downroad 1.5.3

Fixes widespread YouTube 403 download failures caused by retired player clients in stale download-engine builds.

- Moves yt-dlp to a verified nightly build containing the upstream YouTube fix.
- Bundles Deno so modern YouTube JavaScript challenges work without extra setup.
- Adds checksum verification, atomic engine installation, and automatic rollback.
- Correctly distinguishes 403 access failures from real 429 rate limiting.
- Improves privacy-safe diagnostics for future platform changes.
