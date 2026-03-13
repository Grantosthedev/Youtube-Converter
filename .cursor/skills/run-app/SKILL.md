---
name: run-app
description: Runs or reruns the Downroad Electron app. Use when the user says "run", "run app", "start app", "rerun", or "restart app". Kills any existing instance first, then starts the app.
---

# Run App

## When to Use

Apply this skill when the user says:
- "run"
- "run app"
- "start app"
- "rerun"
- "restart app"

## Instructions

**Option A — Use the run script:**
```bash
/Users/grantjenkinsmax/Documents/Youtube\ Converter\ App/Youtube-Converter/.cursor/skills/run-app/scripts/run.sh
```
Run in the background.

**Option B — Manual steps:**
1. Kill existing instance: `pkill -f "Youtube-Converter" 2>/dev/null || true; sleep 1`
2. Start the app: `cd /Users/grantjenkinsmax/Documents/Youtube\ Converter\ App/Youtube-Converter && npm start`
3. Run in the **background** (long-running process).

Confirm to the user: "The app is running. The Downroad window should be open."
