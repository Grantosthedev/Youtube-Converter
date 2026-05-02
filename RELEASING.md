# Releasing Updates

How to push updates to all Downroad users.

## Quick Reference

```bash
# 1. Bump version in package.json
# 2. Build, sign, notarize, publish
npm run publish
# 3. Go to GitHub Releases, find the draft, click "Publish release"
```

That's it. Users get prompted to restart within 6 hours (or immediately via the Settings gear).

## Step by Step

### 1. Bump the version

Open `package.json` and increment the `version` field following semver:

- Bug fix: `1.3.0` -> `1.3.1`
- New feature: `1.3.0` -> `1.4.0`
- Breaking change: `1.3.0` -> `2.0.0`

### 2. Build and publish

```bash
npm run publish
```

This does everything in one command:
- Packages the app for macOS (arm64)
- Code signs with your Developer ID certificate
- Notarizes with Apple (takes 1-2 min)
- Creates a ZIP (for auto-updates) and DMG (for manual installs)
- Uploads both to a draft GitHub Release tagged with the version

### 3. Publish the GitHub Release

1. Go to https://github.com/Grantosthedev/Youtube-Converter/releases
2. Find the draft release (e.g. `v1.3.1`)
3. Add release notes if you want
4. Click **Publish release**

### 4. Users get updated

- Installed apps check `update.electronjs.org` on launch and every 6 hours
- When a new version is found, it downloads in the background
- A persistent toast appears: "vX.Y.Z is ready" with an **Update** button and a dismiss X
- Clicking **Update** shows the "Fresh Update, Fam" confirm dialog: **Restart and Update** or **Later**
- On restart, the update is applied
- Users can also trigger a manual check via the **Check Updates** button in Settings

## Prerequisites (one-time setup)

These should already be in your `.env` file:

```
APPLE_ID=your@email.com
APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_SIGNING_IDENTITY=Developer ID Application: Your Name (XXXXXXXXXX)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

- **Apple Developer Program** ($99/year) with a "Developer ID Application" certificate installed in Keychain
- **GitHub PAT** with `repo` scope from https://github.com/settings/tokens
- **Apple app-specific password** from https://appleid.apple.com/account/manage

## Instagram Hot-Fix (no app update needed)

If Instagram changes their API tokens, you can fix it without pushing an app update:

1. Edit `config/instagram-config.json` with new `docIds`
2. Commit and push to `main`
3. All installed apps fetch the updated config within 24 hours

## CI Release (optional)

A GitHub Actions workflow exists at `.github/workflows/release.yml`. To use it:

1. Add these secrets to your repo (Settings > Secrets > Actions):
   - `APPLE_CERTIFICATE` (base64-encoded .p12)
   - `APPLE_CERTIFICATE_PASSWORD`
   - `APPLE_ID`
   - `APPLE_ID_PASSWORD`
   - `APPLE_TEAM_ID`

2. Tag and push:
```bash
git tag v1.3.1
git push origin v1.3.1
```

The workflow builds, signs, notarizes, and uploads a draft release automatically.

## Troubleshooting

**"No identity found for signing"**: Your Developer ID certificate isn't in Keychain. Open Xcode > Settings > Accounts > Manage Certificates.

**"Unable to notarize"**: Check that `APPLE_ID_PASSWORD` is an app-specific password (not your regular Apple ID password).

**Users don't get the update**: Make sure you clicked "Publish release" on GitHub (drafts don't trigger updates). Also check the repo is public (update.electronjs.org only works with public repos).

**npm run publish fails with 401**: Your `GITHUB_TOKEN` expired or doesn't have `repo` scope. Generate a new one.
