# Instructions for AI assistants working in this repository

Bubblesheet is a static quiz app published to GitHub Pages from `main`. Most requests are "write a question bank". These instructions apply to Claude and to any other AI assistant; `AGENTS.md` points here.

## Writing a question bank (the usual request)

1. Read `docs/QUESTION-SCHEMA.md` in full. It covers the file format, the rules that protect saved answers, and the item-writing method.
2. Read the existing files in `bank/`, in particular each question's `id`, `topics` and `subtopic`.
   - Choose `topics` by the rules under "Choosing topics" in `docs/QUESTION-SCHEMA.md`. In short: the first topic is the area tested; female-specific problems go to `Pregnancy and reproductive health` or `Women's health`, never because the patient is female; every patient under 18 also gets `Paediatrics`.
   - Don't repeat a scenario that already exists. Pick a different decision point.
   - Pick a new bank `id` and an ID prefix that isn't already used.
3. If the user names source material (lecture slides, guidelines), read it before writing.
   - Base facts on that material and on current Australian guidelines.
   - Don't copy questions that already appear in the material.
   - This repository is public. In the bank, `source` names a published guideline with its year. No field may name the user's files, courses, decks, recall papers or past exams, give their page or slide numbers, or quote them.
   - Put exact locations and short quotes in a private references file, `refs/<bank-id>.json`, and give it to the user to upload to the private answers repository. You can't reach that repository. Never guess a location. The full rule is under "Citing attached references" in `docs/QUESTION-SCHEMA.md`.
   - If you can't read a source the user named, stop and say so.
4. Apply the defaults unless the user says otherwise:
   - Patient ages depend on the exam, always in an Australian setting:
     - `RACGP`: all ages, from neonates to older adults, in proportions like the real exam (most adult, a regular share of paediatric and adolescent cases).
     - `RACP`, especially Advanced Training study: adults, plus young adults aged 16 to 18 years (adolescent and young adult medicine).
     - Other exams: adults only, unless the user says otherwise.
   - Therapeutic Guidelines doses.
   - `exams: ["RACGP"]` for RACGP study.
   - About 2 SBA for every 1 CDP. The app labels these AKT and KFP in its RACGP style.
5. Save the bank as a new file `bank/<bank-id>.json`. Never edit `index.html`, `assets/` or `.github/` for a question request.
6. Run `node scripts/build.mjs --check` and fix every ERROR. Warnings about option order should also be fixed.
7. Commit to `main` and push. Use a neutral author identity in the clone:
   ```
   git config user.name "QuarkStack"
   git config user.email "QuarkStack@users.noreply.github.com"
   ```
   - Commit message: `Add bank: <title>`.
   - In Claude sessions, push with `git -c push.negotiate=true push origin main`.
8. Check the **Check and publish** run in the repository's Actions tab (`gh run list -R QuarkStack/bubblesheet --limit 1`). If it's red, fix the problem and push again. A red run never changes the live site.
9. Report back:
   - The bank title.
   - The question count by format.
   - The topics covered.
   - Anything you weren't sure about.
   - The private references file, if there is one, for the user to upload.

## Never

- Change the `id` of a published question, or reorder, insert or delete its options. Saved answers depend on both. To change a question's meaning, add a new question.
- Put real names, emails or other personal details in this public repository. Patients in stems are fictional.
- Commit answer logs here. They live in a separate private repository.
- Commit handoff notes (`*handoff*` files) or confidential exam material, such as RACGP practice booklets or SAPT items. Handoffs live in the user's private Claude project files. `.gitignore` blocks `*handoff*`.

## Changing the app (only when asked)

- **The app:** `assets/app.js`, plain JavaScript with no libraries or build tools. Styles are in `assets/styles.css`.
- **Answer logs:** saved per person at `logs/<id>.json` in a private repository, through the GitHub Contents API.
  - Keep the log format backward compatible.
  - Merging must never drop attempts, notes or flags.
- **Private references:** `refs/<bank-id>.json` in the private repository, fetched by signed-in profiles and shown after answering. Never commit these to this repository.
- **Shared papers:** the Share button writes `papers/<CODE>.json` to the same private repository: question IDs in order, plus mode, pace, style and label. Never put answers in these files. Codes are 6 characters from `CODE_CHARS` in `app.js`.
- **Testing:** run `node scripts/build.mjs`, serve `_site/` locally, and test at phone width (about 390 px) and desktop width, in day and night themes.
