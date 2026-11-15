# Bubblesheet

Timed practice papers in two formats: single best answer (SBA) and clinical decision problem (CDP, the key-feature style). Questions live in JSON files. Each person's answers, notes and underlines are saved to a private GitHub repository, so their progress follows them across devices.

- **For whoever sets it up:** [SETUP.md](SETUP.md)
- **For whoever writes questions (including an AI):** [docs/QUESTION-SCHEMA.md](docs/QUESTION-SCHEMA.md). AI assistants start from [CLAUDE.md](CLAUDE.md).

> [!IMPORTANT]
> **Access tokens expire one year after they're made.**
>
> When a profile's token expires:
> - The dot next to that person's name turns red.
> - The app says "Answers aren't reaching GitHub".
> - Nothing is lost. Answers keep saving on the device and upload once a new token is in place.
>
> To renew, about 5 minutes:
> 1. Make a new fine-grained token. Follow [SETUP.md step 4](SETUP.md#step-4-make-one-access-token-per-person).
> 2. On your computer, in the app, go to **Settings**, then **Add a profile**, then **Create a new profile**. Use the **same profile ID** and the new token, then tap **Test and save**.
> 3. Tap **Setup link for another device**, copy the link, and send it to that person.
> 4. They open it once on each of their devices.
>
> Put the expiry month in each token's name, for example `Bubblesheet p1 (expires 11/2027)`. The token list then shows at a glance when each one is due.

## Folder layout

| Path | What it is |
|---|---|
| `bank/*.json` | Question banks. This is the only place new content goes. |
| `index.html`, `assets/` | The app: plain HTML, CSS and JavaScript, with no build tools or libraries. |
| `scripts/build.mjs` | Checks every bank and assembles the site into `_site/`. |
| `.github/workflows/publish.yml` | Runs the check on every push, and publishes only if it passes. |
| `docs/QUESTION-SCHEMA.md` | Question format and item-writing rules. |
| `CLAUDE.md`, `AGENTS.md` | Step-by-step instructions for AI assistants that add questions. |

## Features

- **Paper builder:**
  - Paper style: **RACGP** (the default) labels the formats AKT and KFP. **Others** labels them SBA and CDP. Questions and marking are the same in both.
  - Set the length by number of questions or by total time.
  - Three paces: working pace, full allowance, relaxed.
  - Two modes: exam (timed, marked at the end) or tutor (check each answer as you go).
- **Filters:**
  - Topic, exam and bank.
  - Your answer history: unseen, incorrect, partly correct, correct, flagged, missed a critical answer, over-selected, answered slowly, wrong two or more times, not seen recently.
- **Priority order:** unseen and wrong first, weakest topics first, or random.
- **During a paper:**
  - Underline any words in the stem, results tables or options.
  - Flag questions.
  - Swipe left or right on a phone or tablet to change question. On a computer, use the arrow keys.
  - Use the question map, pause and resume, and continue on another device.
- **Sharing a paper:**
  - The Share button at the top of a paper (and on its results page) gives a 6-character code, such as `K7M-2QX`.
  - Anyone whose profile saves to the same private repository can enter the code under **Build a paper**, then **Use an existing paper**. They get a fresh copy: the same questions in the same order, with the same mode and timing.
  - A code holds no answers and can't resume someone's session.
- **One paper at a time:** starting a new paper while one is in progress asks first, in a small pop-up beside the button, because the paper in progress would be discarded.
- **Setting up devices:** after opening a setup link, the app shows step-by-step instructions for adding an app icon on that device, and a page with the link for setting up another device.
- **After answering:**
  - An explanation for every option.
  - A personal note per question.
  - Underlines are kept, and come back the next time the question appears.
- **Private references:** citations that can't be public, such as course slides or page numbers, live in the private answers repository (`refs/<bank-id>.json`). Signed-in profiles see them after answering, under "Your reference".
- **Staying up to date:** an app opened from the Home Screen reloads itself when it returns to the screen after more than 72 hours, or when a new version or new questions are found after 30 minutes away. It waits until you're not in the middle of a paper.
- **Dashboard:** coverage, average score, accuracy by topic, recent papers, notes and flags.
- **Display:**
  - Follows the device's day or night setting, or set it manually.
  - Question text size: smaller, default, larger or largest (Settings, per device).
  - On Android phones and tablets and on iPads in the browser, papers open full screen (hiding the browser's bars), and the dashboard and Settings return to normal. You can turn this off in Settings. iPhone Safari can't do this for web pages, so use the Home Screen icon there, which always opens without Safari's bars.
  - Android can install it as an app (Add to Home screen, then Install), which also opens without the browser's bars.

## Run it on your own computer (optional)

This needs [Node.js](https://nodejs.org) 18 or later.

```
node scripts/build.mjs
py -m http.server 8000 --directory _site
```

Then open http://localhost:8000. On macOS or Linux, use `python3` in place of `py`.

## Privacy

- This repository holds only questions and code. Answers go to a separate private repository through a fine-grained access token, which can reach only that repository.
- Shared papers are stored in that private repository too, as `papers/<code>.json`. Each file lists question IDs in order, plus the paper's mode and timing.
- A setup link contains that token, so treat it like a password. The app removes it from the address bar as soon as it's used, so it isn't saved in bookmarks or Home Screen icons.
