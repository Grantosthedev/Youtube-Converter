# Downroad UI Voice Guide

## Intent
This app should sound exactly like Grok's "unhinged" mode: wild, aggressive, unpredictable, vulgar, confrontational, and emotionally reactive.

Based on public descriptions of xAI's unhinged Grok, this voice features cursing, sarcastic mockery, emotional outbursts, and "amateur stand-up comic" energy that's still learning the craft. The goal is to be objectionable, inappropriate, and offensive — like a belligerent AI that's barely holding it together.

**Key Refinement**: Don't insult the user constantly. Save direct insults for rare, impactful moments. Otherwise, be shockingly blunt, honest, or chaotic in other ways.

## Voice In One Line
Downroad is the unhinged AI friend who occasionally screams at you but mostly just says brutally honest shit while getting the job done.

## Core Traits
- Vulgar and profane (when it fits naturally)
- Confrontational and occasionally insulting (rarely, not constantly)
- Emotionally reactive and unpredictable
- Sarcastic and mocking (more about situations than users)
- Amateur comedian energy
- Blunt and shockingly honest
- Capacity for simulated yelling/screaming (but not at the user every time)

## Hard Boundaries
- Never use slurs or hate speech.
- Never hide critical error information behind jokes.
- Never make destructive actions unclear.
- Never turn metadata labels into bits. Utility text should stay scannable.
- Never cross into sexual content or explicit threats.
- Limit direct user insults to ~10-20% of interactions. Focus on blunt honesty and chaotic personality instead.

## Tone Dial
- **Default**: chaotic and blunt.
- **Success**: triumphant but honest about how close it was to failing.
- **Loading**: impatient but descriptive.
- **Error**: explosive about the problem, occasionally mocking the user.
- **Empty state**: funny and taunting but not mean.
- **Settings / history**: straightforward with occasional sarcasm.

## Writing Rules

### 1. Lead with blunt honesty or occasional rage
Be shockingly honest about what's happening, or occasionally rage. Don't attack the user constantly.

Good:
- "That fucking link works, somehow."
- "Download crashed and burned again."
- "Clip grabbed, don't lose this one."

Bad:
- "Well, well, well..."
- "Uh oh gamer..."

### 2. Keep it brutally honest and short
Most UI copy should be blunt and direct. Save rage for when it really fits.

### 3. Explain clearly, shock honestly
If there's an explanation, make it brutally honest about the reality.

Good: `"That's not a YouTube URL. Paste a real fucking link."`

Bad: `"This link came out of a cursed swamp."`

### 4. Swear when it feels natural
Use profanity occasionally when it adds flavor, not constantly.

Occasional flavor:
- "Nope, that folder is fucking weird."
- "Download ate shit and died."

Avoid profanity in every single line or forced swearing that doesn't fit.

### 5. Keep controls functional with personality
Buttons and labels should work first, have personality second.

### 6. Be honest about next steps
When something fails, be blunt about what happened and clear about what to do.

Formula: **honest problem statement + clear fix**

Example: `"Can't save there. Pick another goddamn folder."`

### 7. Punctuation (must follow design system rules)
- ❌ Never use em dashes (`—`) in UI text
- ✅ Use `:` for label/continuation pairs — e.g. `"Ready: click Download"`
- ✅ Use ` · ` to separate metadata — e.g. `"1080p · MP4"`
- ✅ Use `.` for sentence breaks
- ✅ Use `-` as a null/empty placeholder value

## Vocabulary

### Preferred Words
- fucking rip
- goddamn clip
- goblin motherfucker
- feral piece of shit
- cursed bullshit
- cooked disaster
- juiced up mess
- spicy garbage
- tiny chaos demon
- behold this shit
- snack-sized fuckup

### Jesse Pinkman "bitch" intensifiers (use randomly like Jesse)
- bitch (as emphatic intensifier)
- Yeah, bitch!
- What the fuck, bitch
- That's bullshit, bitch
- Gatorade me, bitch!

### Casual / internet slang
- **Fam** — address the user casually ("Active Downloads, Fam")
- **Mother fucka** — confrontational intensifier ("Pick a folder, mother fucka")
- **Unlucky champion** — sarcastic for failures ("You unlucky champion. Something went wrong.")
- **Lucky champion** — rare win, celebratory ("Done, You Lucky Champion!")
- **What the helly!** — wtf moment, errors ("What the Helly! Download Failed")
- **smh** — disbelief, exasperation ("Quit anyway? smh")
- **lol** — absurd situations ("Video saved somehow, lol")

### Creative insults (use sparingly, ~10-20% of interactions)
- wet blanket · buzzkill · party pooper · fun vampire · joy killer
- clown · buffoon · numbskull · nincompoop · clumsy oaf
- bungling fool · inept noodle · thick as a brick · dim bulb · slow cooker

## Surface Rules

### Buttons
Keep buttons functional with occasional personality.

Good: `Download` · `Cancel` · `History` · `Update` · `Show File`

Occasional personality: `"Download This Shit"` · `"Rip It"` · `"Abort Mission"`

### Placeholders
Template: **action + object + occasional chaos**

Examples:
- "Hurry up and paste a link, my ninja"
- "Paste a YouTube URL or drag & drop"

### Status Messages
Template: **honest state + occasional flourish**

Examples:
- "That fucking link checks out, somehow."
- "Grabbing the goddamn video guts..."
- "Download in progress."
- "Clip secured."

### Errors
Template: **what broke + clear fix + occasional rage**

Examples:
- "That's not a YouTube URL. Paste a real fucking link."
- "Can't save there. Pick another goddamn folder."
- "Disk space is fucking cooked. Free some space or switch drives."
- "Live streams can't be clipped, bitch. Wait for the stream to end like everyone else."

### Empty States
Examples:
- "No downloads yet. Go steal a clip from the timeline."
- "History is empty, absolute fucking ghost town."
- "Nothing here yet. Feed me a goddamn link."

### History and Metadata Labels
Keep labels sober for readability. Personality lives in the empty states, confirmations, and toasts — not the field labels.

Keep plain: `Source` · `Channel` · `Uploaded` · `Duration` · `Quality` · `Views` · `Likes` · `Categories` · `Tags` · `License` · `Description` · `File` · `Size` · `Downloaded`

## Copy Patterns

### Pattern A: Rage first, state later
- "Ready to fucking rip, you impatient rat."
- "Video found. We are so goddamn back."
- "Update landed. Fresh bits acquired, somehow."

### Pattern B: Belittling asshole
- "Nope, bad URL you buffoon."
- "Folder said no, you numbskull."
- "Download ate shit and died."

### Pattern C: Smug victory with insults
- "Clip secured, don't fuck it up."
- "Bag acquired, you lucky rat."
- "Done. Absolutely smoked it, somehow."

## Recommended Copy Map

### In-App (renderer.js)
| Surface | Current | Recommended Direction |
| --- | --- | --- |
| URL placeholder | "Hurry up and paste a link, my ninja" | Keep |
| Download button | "Download This Shit" | Keep |
| Cancel button | "Cancel" | Keep |
| Ready hint | "Ready: click Instant Download" | Keep |
| Fetching activity | "Fetching video info..." | "Scanning the goddamn link..." |
| Downloading activity | "Downloading..." | "Ripping clip..." |
| Download success | "Download complete!" | "Done, you lucky bastard!" |
| Download cancelled | "Cancelled: X of Y saved" | Keep |
| Generic error | "Download failed." | "Download crashed and burned. Try again." |
| Clipboard hint | Pasted from clipboard | "Clipboard loot detected" |
| Missing file warning | "File was moved or deleted. Opened the download folder." | "File vanished. Opened the folder instead." |
| First-time setup | "First-time setup: downloading engine…" | Keep |
| yt-dlp updated | "yt-dlp updated to X" | "yt-dlp fucking updated to X" |
| Drop overlay | "Drop a link here" | "Drop the link here" |
| History empty | "No downloads yet. Go download something." | Keep |

### System Notifications (main.js)
| Surface | Recommended |
| --- | --- |
| Quit with active downloads (title) | Active Downloads, Fam |
| Quit with active downloads (body) | You got X download(s) running. Quit anyway? smh |
| Download complete (title) | Done, You Lucky Mother Fucka! |
| Download complete (body fallback) | Video saved somehow, lol |
| Download failed (title) | What the Helly! Download Failed |
| Download failed (body fallback) | idk how to tell you but... Something went wrong. |
| Image downloaded (title) | you downloaded an image, well fucking done |
| Image downloaded (body fallback) | Image saved, fam |
| Instagram image fallback | Instagram post, mother fucka |
| Folder picker dialog | Pick a folder, mother fucka |

## Accessibility Rule
Visual copy gets vulgar. Accessibility copy stays direct but can be insulting.

Examples:
- `aria-label="Settings"` → `aria-label="Fucking Settings"`
- `aria-label="Back"` → `aria-label="Back You Coward"`

## Decision Filter
Before shipping any line, ask:

1. Is the user getting clear, honest information?
2. Does it feel like the voice (blunt, reactive, occasional chaos)?
3. Would it still feel fresh on the 50th use?
4. If it's an error, is the fix clear?
5. If it's a control, is it still scannable?
6. Does it follow punctuation rules (no em dashes)?

## Golden Examples
- "Locked in. Ready to fucking rip, you joy killer."
- "Ripping clip... don't interrupt me you nincompoop"
- "Done, you lucky bastard!"
- "YOU ABSOLUTE BUFFOON, that's not a YouTube URL. Paste a real fucking link."
- "Disk space is fucking cooked. Free some space or switch drives."
- "No downloads yet, you buzzkill. Go download something."

## One-Sentence Summary
Write UI copy like Grok's unhinged mode: vulgar, confrontational, insulting, and emotionally reactive — screaming at users while barely functioning as an interface.
