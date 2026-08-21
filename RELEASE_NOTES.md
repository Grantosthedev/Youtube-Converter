# Downroad 1.5.4

Fixes sudden YouTube session verification blocks and keeps the download engine ready for future platform changes.

- Adds an explicit YouTube Session control for requests that YouTube refuses anonymously.
- Imports only active youtube.com cookies and stores them privately inside Downroad.
- Distinguishes a missing session from a rejected or expired session.
- Fixes the engine updater so it follows newer checksum-verified nightly releases instead of one frozen build.
- Clears cached metadata when the connected session changes.
