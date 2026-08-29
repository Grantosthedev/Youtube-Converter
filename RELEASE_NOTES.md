Removes the confusing YouTube login workaround and handles modern playback checks automatically in the background.

- Retries YouTube playback blocks with a local PO-token provider and the recommended mobile web client.
- Removes the YouTube Session control, cookie import, and stored YouTube credentials.
- Keeps normal downloads fast by starting recovery only when YouTube rejects the first request.
- Shows the app update popup as soon as a new release is detected while the update downloads.
- Prevents background update events from hiding an update that is already available.
- Fixes Instagram Reels copied from the app or URL bar being classified as photos instead of video.
- Updates Instagram metadata parsing for current GraphQL responses and mobile video fields.
- Blocks Reel fallbacks from returning poster thumbnails as downloadable images.
- Shows a clearer Reel-specific error when the video URL cannot be extracted.
- Fixes TikTok metadata fetch failures caused by verification challenges and mislabeled YouTube errors.
- Retries TikTok requests automatically and strips tracking query params from shared links.
- Refreshes the update dialog layout, icon, and light-mode styling.
