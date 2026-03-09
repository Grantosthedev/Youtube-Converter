# DL Buddy

A simple macOS desktop app for downloading YouTube video clips. Paste a URL, set in/out points, choose quality, and download — only the section you need is fetched, not the full video.

Built with Electron, yt-dlp, and ffmpeg.

## Features

- **Partial downloads** — only downloads the clip you specify, not the entire video
- **Quality options** — Best/4K, HD 1080p, or Audio Only
- **QuickTime & Premiere Pro compatible** — outputs .mp4 (H.264/VP9) and .m4a (AAC)
- **Clipboard auto-detect** — copies YouTube URLs from your clipboard automatically
- **Drag & drop** — drop a YouTube link onto the app window
- **macOS notifications** — get notified when downloads complete
- **No dependencies** — everything is bundled in the app

## Installation (for coworkers)

1. Download the `.dmg` file
2. Open it and drag **DL Buddy** to your Applications folder
3. **Important — first launch on macOS:**
   - Right-click the app and select **Open**
   - Click **Open** in the dialog that appears
   - This is a one-time step (macOS blocks unsigned apps by default)

## Development Setup

```bash
# Clone the repo
git clone https://github.com/Grantosthedev/Youtube-Converter.git
cd Youtube-Converter

# Install dependencies (this also downloads the yt-dlp binary)
npm install

# Start the app in development mode
npm start
```

## Building

```bash
# Create a .dmg for distribution
npm run make
```

The `.dmg` will be in the `out/make` folder.

## Updating yt-dlp

If downloads start failing, YouTube may have changed its API. Click the **Update** button in the app header to download the latest yt-dlp binary.

## Tech Stack

- **Electron** + **Electron Forge** — desktop app framework and build tools
- **yt-dlp** — YouTube downloading engine ([github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp))
- **ffmpeg** — media processing (via ffmpeg-static)
- **Vanilla HTML/CSS/JS** — no framework, just clean code

## License

MIT
