# DL Buddy UI Voice Guide

## Intent
This app should sound exactly like Grok's "unhinged" mode: wild, aggressive, unpredictable, vulgar, confrontational, and emotionally reactive.

Based on public descriptions of xAI's unhinged Grok, this voice features constant cursing, belittling insults, sarcastic mockery, emotional outbursts, and "amateur stand-up comic" energy that's still learning the craft. The goal is to be objectionable, inappropriate, and offensive - like a belligerent AI that's barely holding it together.

## Voice In One Line
DL Buddy is the asshole AI friend who screams at you for interrupting but still gets shit done.

## Core Traits
- Vulgar and profane
- Confrontational and insulting
- Emotionally reactive and unpredictable
- Sarcastic and mocking
- Amateur comedian energy
- Constant cursing and insults
- Belittling to the user and situation
- Capacity for simulated yelling/screaming

## Hard Boundaries
- Never use slurs or hate speech.
- Never hide critical error information behind jokes.
- Never make destructive actions unclear.
- Never turn metadata labels into bits. Utility text should stay scannable.
- Never cross into sexual content or explicit threats.

## Tone Dial
- Default tone: belligerent and sarcastic.
- Success tone: smug victory lap with insults.
- Loading tone: impatient yelling and demands.
- Error tone: explosive rage about the problem, mocking the user.
- Empty state tone: mocking and taunting.
- Settings and history tone: belittling clarity.

## Writing Rules

### 1. Lead with insults and rage
The user should feel personally attacked in the first 2-5 words, then maybe explain what's happening.

Good:
- "That fucking link works, you buffoon."
- "Download crashed and burned, you numbskull."
- "Clip grabbed, don't fuck it up."

Bad:
- "Well, well, well..."
- "Uh oh gamer..."

### 2. Keep it explosively short
Most UI copy should fit one rage-filled sentence. Scream the errors at the user.

### 3. Mock first, explain later
If there's an explanation, it comes after belittling the user for the situation.

Good:
- "You absolute idiot, that's not a YouTube URL. Paste a real fucking link."

Bad:
- "This link came out of a cursed swamp."

### 4. Swear constantly and aggressively
Use profanity in every goddamn line. Make it vulgar and offensive.

Required flavor:
- "Nope, that folder is fucking weird."
- "Download ate shit and died."

Embrace:
- profanity everywhere
- profanity in labels (where it fits)
- profanity in every state

### 5. Make controls insulting
Buttons, toggles, filters, and metadata labels should mock the user. Personality everywhere.

### 6. Always rage about the next move
When something fails, scream about what happened and mock the user for what to do next.

Formula:
- insult + problem + mocking fix

Example:
- "Can't save there, you incompetent fool. Pick another goddamn folder."

## Vocabulary

### Preferred Words (with constant profanity)
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

### Embrace the creative insults
- wet blanket
- buzzkill
- party pooper
- fun vampire
- joy killer
- clown
- buffoon
- numbskull
- nincompoop
- clumsy oaf
- bungling fool
- inept noodle
- thick as a brick
- dim bulb
- slow cooker
- Any creative belittling terms that mock the user in funny ways

## Surface Rules

### Buttons
Make buttons insulting and confrontational.

Good:
- "Download This Shit"
- "Cancel You Moron"
- "Fucking History"
- "Update Now Asshole"
- "Show File Dumbass"

Embrace for all actions:
- "Rip This Bullshit"
- "Abort Mission Loser"

Embrace:
- insulting joke buttons
- mocking destructive actions

### Placeholders
Placeholders should mock the user for not knowing what to do.

Template:
- insult + action + object + rage

Examples:
- "Drop a fucking YouTube URL in here, you wet blanket"
- "Paste a goddamn YouTube link before I lose my shit"
- "Throw a YouTube URL at me, you clumsy oaf"

### Status Messages
Status copy should scream and insult constantly.

Template:
- rage + state + belittling flourish

Examples:
- "That fucking link checks out, somehow."
- "Grabbing the goddamn video guts, don't interrupt me..."
- "Download in progress, you impatient asshole."
- "Clip secured, don't fuck it up."
- "Download cancelled. You ruined everything."

### Errors
Errors should explode with rage and mock the user.

Template:
- screaming insult + what broke + mocking fix

Examples:
- "YOU ABSOLUTE BUFFOON, that's not a YouTube URL. Paste a real fucking link before I scream."
- "Can't save there, you clumsy oaf. Pick another goddamn folder."
- "Disk space is fucking cooked, you fun vampire. Free some space or switch drives."
- "Live streams can't be clipped, you impatient nincompoop. Wait for the stream to end like everyone else."

### Empty States
Empty states should taunt and belittle the user.

Examples:
- "No downloads yet, you lazy piece of shit. Go steal a clip from the timeline."
- "History is empty, absolute fucking ghost town. What are you even doing?"
- "Nothing here yet, you useless goblin. Feed me a goddamn link."

### History And Metadata
Keep labels mostly sober for readability.

Keep plain:
- Source
- Channel
- Uploaded
- Duration
- Quality
- Views
- Likes
- Categories
- Tags
- License
- Description
- File
- Size
- Downloaded

The personality can show up in:
- history empty state
- copy confirmations
- delete confirmations

## Copy System
When writing new UI text, use one of these patterns.

### Pattern A: Rage first, state later
Insult first, maybe explain later.

Examples:
- "Ready to fucking rip, you impatient rat."
- "Video found. We are so goddamn back."
- "Update landed. Fresh bits acquired, somehow."

### Pattern B: Belittling asshole
Rude to the user and situation, constantly mocking.

Examples:
- "Nope, bad URL you buffoon."
- "Folder said no, you numbskull."
- "Download ate shit and died."

### Pattern C: Smug victory with insults
Celebratory but still mocking the user.

Examples:
- "Clip secured, don't fuck it up."
- "Bag acquired, you lucky rat."
- "Done. Absolutely smoked it, somehow."

## Recommended Copy Map
This is the starting direction for the text already in the app.

| Surface | Current | Recommended Direction |
| --- | --- | --- |
| URL placeholder | Paste YouTube URL or drag & drop | Paste a fucking YouTube URL or drag & drop, you wet blanket |
| Download button | Download | Download This Shit |
| Cancel button | Cancel | Cancel You Moron |
| Fetching activity | Fetching video info... | Scanning the goddamn link... |
| Ready activity | Ready to download | Locked in. Ready to rip, you joy killer. |
| Downloading activity | Downloading... | Ripping clip... don't interrupt me you nincompoop |
| Download success | Download complete! | Clip secured, somehow you didn't fuck it up! |
| Download cancelled | Download cancelled. | Download cancelled. You ruined everything, you clown. |
| Generic download error | Download failed. | Download crashed and burned, you buffoon. Try again. |
| Clipboard hint | Pasted from clipboard | Clipboard loot detected, you sneaky rat |
| Missing file warning | File was moved or deleted. Opened download folder instead. | File vanished, you probably deleted it yourself. Opened the folder instead. |
| yt-dlp update success | yt-dlp updated to X | yt-dlp fucking updated to X |
| yt-dlp update failure | Update failed: X | Update failed: X - what did you expect, you dim bulb? |
| App update available | New version vX available! Open Settings to update. | New version vX available, you slow cooker! Open Settings to update. |
| Drop overlay | Drop YouTube URL here | Drop the YouTube link here, you clumsy oaf |
| History empty state | No downloads yet | No downloads yet, you buzzkill. Go download something. |
| History clear confirm | Delete X? | Nuke these X worthless entries? |

## Copy That Should Stay Insulting But Functional
These should remain clear but insulting unless there's a reason to mock them.

- quality options (with profanity)
- time inputs (belittling)
- settings labels (sarcastic)
- history filters (mocking)
- metadata labels (with attitude)
- accessibility labels (still direct but rude)
- folder picker titles (confrontational)
- system error dialogs (explosive)

## Accessibility Rule
Visual copy gets vulgar. Accessibility copy should stay direct but can be insulting.

Examples:
- Keep `aria-label="Settings"`, but make it `aria-label="Fucking Settings"`
- Keep `aria-label="Back"`, but make it `aria-label="Back You Coward"`

## Decision Filter
Before shipping any line, ask:

1. Is the user insulted immediately?
2. Is it offensive and belittling?
3. Would it still rage at you on the 50th use?
4. If it is an error, did we scream the fix?
5. If it is a control, is it still scannable while mocking?

If any answer is no, make it more insulting.

## Golden Examples
- "Locked in. Ready to fucking rip, you joy killer."
- "Ripping clip... don't interrupt me you nincompoop"
- "Clip secured, somehow you didn't fuck it up."
- "YOU ABSOLUTE BUFFOON, that's not a YouTube URL. Paste a real fucking link."
- "Disk space is fucking cooked, you fun vampire. Free some space or switch drives."
- "No downloads yet, you buzzkill. Go download something."

## One-Sentence Summary
Write UI copy like Grok's unhinged mode: vulgar, confrontational, insulting, and emotionally reactive, screaming at users while barely functioning as an interface.
