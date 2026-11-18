# Setting up Bubblesheet

This takes about 20 minutes, done once, on a computer. The person who studies only ever taps a link.

You'll create two repositories:

| Repository | Visibility | Holds |
|---|---|---|
| `bubblesheet` (any name) | **Public** | The app and the question banks. GitHub Pages serves it as a website. |
| `bubblesheet-answers` (any name) | **Private** | One answer file per person: `logs/<profile-id>.json`. Shared papers: `papers/<code>.json`, made when someone taps Share. Private references: `refs/<bank-id>.json`, uploaded by you. |

Menu names below match GitHub's documentation as of November 2026. GitHub sometimes moves things, so the wording on screen may differ slightly.

---

## Step 1. Keep identities out of the public side

1. **Website address.** The site will be `https://<owner>.github.io/<repository>/`. If your GitHub username contains your real name, make a free organisation with a neutral name and own the public repository through it:
   - Click your profile picture (top right).
   - Click **Your organizations**, then **New organization**, then **Free**.
   - Pick a neutral name.
2. **Email address on commits.** Hide your email from public commits:
   - Click your profile picture, then **Settings**, then **Emails**.
   - Tick **Keep my email addresses private**.
3. **Profile IDs.** Use neutral IDs such as `p1` and `p2`, not names. Display names are stored only on each device.

## Step 2. Create the public site repository

1. Click **+** (top right), then **New repository**.
2. Fill in the form:
   - **Owner:** you, or the organisation from step 1.
   - **Repository name:** `bubblesheet` (or anything).
   - **Visibility:** **Public**. Free accounts can only use GitHub Pages with public repositories.
   - Leave the README, .gitignore and licence options off.
3. Click **Create repository**.
4. Put the files in. Choose one way:
   - **Let Claude do it (easiest):** tell Claude "Push Bubblesheet to `<owner>/bubblesheet`". If Claude says it can't reach the repository, go to claude.ai **Settings**, then **Connectors**, then **GitHub**, and grant access to that repository.
   - **Upload them yourself:**
     1. Unzip `bubblesheet.zip`.
     2. On the new repository's page, click **uploading an existing file**.
     3. Drag in everything inside the unzipped folder: `index.html`, `README.md`, `SETUP.md`, and the `assets`, `bank`, `docs`, `scripts` and `.github` folders.
     4. On a Mac, `.github` is hidden in Finder. Press **Cmd + Shift + .** to show it.
     5. Click **Commit changes**.
5. Turn on publishing:
   1. In the repository, click **Settings**.
   2. In the sidebar, under **Code and automation**, click **Pages**.
   3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
6. Check that the site published:
   1. Click the **Actions** tab, then the latest **Check and publish** run.
   2. A green tick means the site is live. The address appears in the run summary, and also under **Settings**, then **Pages**.
   3. If the run is red because Pages wasn't switched on yet, open it and click **Re-run all jobs**.

## Step 3. Create the private answers repository

1. Click **+**, then **New repository**.
2. Fill in the form:
   - **Name:** `bubblesheet-answers`.
   - **Visibility:** **Private**.
   - Turn on **Add a README** so the repository isn't empty.
3. Click **Create repository**.

Keep this repository under your personal account. Tokens are simplest that way.

## Step 4. Make one access token per person

Each person gets their own token, so you can replace one without touching the other.

1. Click your profile picture, then **Settings**.
2. At the bottom of the left sidebar, click **Developer settings**.
3. Click **Personal access tokens**, then **Fine-grained tokens**, then **Generate new token**.
4. Fill in the form:
   - **Token name:** `Bubblesheet p1 (expires MM/YYYY)`, using the month one year from today.
   - **Expiration:** **Custom**, one year from today. When it expires, saving stops until you renew it. The README's "Access tokens expire" box has the steps.
   - **Resource owner:** your personal account, which owns `bubblesheet-answers`.
   - **Repository access:** **Only select repositories**, then pick `bubblesheet-answers`. Pick nothing else.
   - **Permissions:** find **Contents** under repository permissions and set it to **Read and write**. In the newer layout, click **Add permissions**, tick **Contents**, then set **Read and write**. **Metadata: Read-only** is added automatically. Add nothing else.
5. Click **Generate token**, then copy the token straight away. GitHub shows it only once.
6. Repeat for your own profile (`Bubblesheet p2`).

This token can only read and write `bubblesheet-answers`. It can't touch the public site, your other repositories or your account.

## Step 5. Create the profiles and setup links (on your computer)

1. Open the site address from step 2.
2. On the welcome page, tap **Start practising**.
3. Tap the name pill (top right), which opens **Settings**.
4. Under **Add a profile**, open **Create a new profile** and fill in:
   - **GitHub account that owns the answers repository:** your username.
   - **Answers repository name:** `bubblesheet-answers`.
   - **Profile ID:** `p1`.
   - **Display name:** the person's first name (it stays on devices only).
   - **Fine-grained access token:** the p1 token.
5. Tap **Test and save**. Success means the app wrote `logs/p1.json` into the private repository. You can check it's there.
6. Tap **Setup link for another device**, then **Copy link**. Send the link to that person privately, for example by iMessage.
7. Repeat steps 3 to 6 for each other person, with the next profile ID (`p2`, `p3` and so on) and their own token.
8. To switch between profiles on this computer, open **Settings**, then **Profiles on this device**, then tap **Use** on the profile you want.

**Treat every setup link like a password.** It contains that profile's token.

## Step 6. Set up each person's phone (2 minutes)

**iPhone:**

1. Tap the link in Messages. It should open in Safari. If it opens somewhere else, copy the link and paste it into Safari.
2. On the "Hi \<name\>" screen, tap **Continue**. The app removes the secret link from the address bar, then shows the **Add an app icon** steps for that device.
3. Follow the three steps on screen:
   1. Tap **Copy my setup link**.
   2. Add the icon: in Safari, tap **•••** next to the address bar, then **Share** (on an iPad or older iPhone, tap the Share button directly). Scroll down, tap **Add to Home Screen**, leave **Open as Web App** on, then tap **Add**.
   3. Open the new icon and tap **Paste my setup link**. If a small **Paste** button pops up, tap it.
4. From now on, open Bubblesheet from the icon.

Why step 3 is needed: on iPhone and iPad, a Home Screen app keeps its own storage, separate from Safari, so the icon needs the link once. The link is no longer saved inside the icon itself.

**Android (Chrome):** open the link, tap **Continue**, then follow the steps: **⋮**, then **Add to Home screen**. The icon shares Chrome's storage, so it opens already set up.

**Laptop:** open the link, tap **Continue**, then bookmark the page (**Ctrl + D** or **Cmd + D**).

**Another device later:** in the app, open **Settings**, then tap **Setup link for another device**. The **Add an app icon** page also has a **Set up another device** button, which shows the link with **Copy** and **Send** buttons.

**Icons made before version 1.2** still have the link inside them. They now open straight to the dashboard, and an old link in an icon never overwrites a renewed token.

Answers, notes, flags and underlines save to that person's profile automatically. The coloured dot next to their name in the app shows the sync state:

| Dot | Meaning |
|---|---|
| Green | Saved to GitHub |
| Amber | Waiting to save |
| Red | A problem (see Troubleshooting) |

Offline answers are kept on the device and upload when it reconnects.

## Step 7. Adding questions later

Ask Claude in a conversation that can reach GitHub, such as the Claude Code session this was built in, or a new one in the same Project. For example:

> Write a 20-question bank on asthma and COPD for Bubblesheet and push it to `QuarkStack/bubblesheet`. Follow the repository's CLAUDE.md.

- If you have source material (lecture slides, a guideline), attach it or name it.
- If Claude can't reach the repository, grant access under claude.ai **Settings**, then **Connectors**, then **GitHub**.
- In a chat with no GitHub access, ask for the bank as a `.json` file. Then upload it yourself:
  1. In the repository, open the `bank` folder.
  2. Click **Add file**, then **Upload files**.
  3. Click **Commit changes**.

Once Claude has the repository, it reads `CLAUDE.md` (the rules for AI assistants) and `docs/QUESTION-SCHEMA.md` (the question format). It then adds `bank/<name>.json` and commits it. GitHub Actions checks the file:

- If the file passes, the site updates in about a minute. Phones pick it up the next time the app is opened.
- If the file fails, nothing changes on the live site, and the failed run in the **Actions** tab lists each problem.

## Troubleshooting

**Red dot, or "Answers aren't reaching GitHub".** Usually the token has expired or was deleted. Answers are safe on the device in the meantime. To fix it:

1. Make a new token (step 4).
2. On your computer, open **Settings**, then **Create a new profile**. Enter the **same** profile ID (`p1`) and the new token, then tap **Test and save**. This reconnects to the same answer file.
3. Copy the new setup link and send it to the profile's owner.
   - **iPhone or iPad with the icon:** they copy the link in Messages, open the Bubblesheet icon, go to **Settings**, and tap **Paste my setup link** under **Add a profile**. Tapping the link itself opens Safari, which doesn't update the icon.
   - **Other devices:** they tap the link.
4. The new link replaces the old one, and the waiting answers upload.

**Looking at someone else's profile to troubleshoot.** Open their setup link on your device. Their profile is added alongside yours. Switch to it in **Settings**, then **Profiles on this device**. Remove it there when you're finished. Removing a profile only forgets it on that device, and their answers stay on GitHub.

**A profile's raw answer file.** It's at `bubblesheet-answers/logs/<profile-id>.json`, for example `logs/p1.json`.

- Each save is a commit.
- To see or restore an earlier version, click **History** on that file.
- Every attempt is kept. Merging between devices never deletes answers, notes or flags.

**"Your reference" doesn't appear after answering.** Private references are files in `bubblesheet-answers/refs/`, one per bank, named after the bank's ID. Check that the file is in the `refs` folder (not the top level) and ends in `.json`. In the app, **Settings** shows how many questions have a reference; tap **Check now** to fetch new ones straight away. Otherwise the app checks every 10 minutes or so.

**A share code doesn't work.** Share codes are kept in `bubblesheet-answers/papers/`, so they work between profiles that save to this repository.

- "No paper has the code": check the code against the sender's screen. Codes never use 0, 1, I, L or O.
- Sharing or using a code needs an internet connection and a working token (green dot).
- A device that is only practising locally, with no profile, can't share or use codes.
- If a question has left the bank since the paper was shared, the copy starts without it and says so.

**A question looks wrong.** Tell Claude the question ID, which is shown in the file and in the question's meta line after answering. Ask for a wording fix in place.

- For any change in meaning, ask for a new question rather than an edit. Saved answers record option positions, so editing a question's meaning would misalign them.
- If a question has changed since someone answered it, the app shows "This question has been edited since you answered it".

**A question with an image doesn't appear.** It's held back until its image file is in `bank/img/`, named exactly as the question's `images` entry says (for example `cr02-s04-1.jpg`). Open `bank/img` in the repository, then **Add file**, then **Upload files**. The **Actions** run lists held-back questions as warnings.

**The site didn't update after new questions were added.** Check the **Actions** tab. A red run lists every problem in the new bank, and the live site is untouched.
