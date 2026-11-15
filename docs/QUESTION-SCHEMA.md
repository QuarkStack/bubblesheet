# Writing question banks for Bubblesheet

This is the only file a question author (human or AI) needs. Don't read or change `assets/app.js`.

## How to add questions

1. Read the existing files in `bank/`. Reuse their topic names, and don't repeat a scenario that's already there.
2. Create `bank/<bank-id>.json` (one file per set, 10–40 questions), or append to an existing bank.
3. Run `node scripts/build.mjs --check`. Fix every `ERROR` line; warnings are advisory.
4. Commit to `main` with a message like `Add bank: <title>`. GitHub Actions re-runs the check and publishes in about a minute. If the check fails, nothing is published and the live site stays as it was.

No list or index needs updating: the build finds every `bank/*.json` file.

### Writing without access to the repository (e.g. another AI tool)

- **Output:** one complete JSON file in a single code block, named `bank/<bank-id>.json`. The user uploads it in GitHub: open `bank/`, then **Add file**, then **Upload files**.
- **Bank ID and prefix:** use a date-stamped bank id such as `cardiology-20261113` and a matching ID prefix such as `card1113`. This avoids clashing with banks you can't see.
- **Topics:** reuse these names where they fit: `Paediatrics`, `Renal`, `Resuscitation`, `Rheumatology`, `Women's health`.
- **Check before output:** you can't run `build.mjs`, so check the rules yourself:
  - Options are in alphabetical order.
  - Each SBA has exactly one `correct: true`.
  - Each CDP's `select` equals its number of options with `score` above 0.
  - Every table row has as many cells as its `head`.
  - The JSON is valid.
  - No field names an attached file, gives its page or slide numbers, or quotes it (see "Citing attached references").
- **Private references:** if reference files were attached, give a second code block after the bank: the private references file `refs/<bank-id>.json` (format under "Citing attached references"). The user uploads it to the private answers repository, not to this one.

## Rules that protect people's saved answers

- **Never change a published question's `id`.** Answers are stored against it.
- **Never reorder, insert or delete options in a published question.** Saved answers store option positions. For a small wording fix, edit the text in place. For anything that changes the meaning, add a new question with a new `id` and delete the old one.
- Deleting a question is safe. Its past answers are kept but stop counting.
- IDs are unique across all banks: `<bank prefix>-s01`… for SBA, `<bank prefix>-c01`… for CDP.

## File shape

```json
{
  "schema": 1,
  "bank": {
    "id": "rheum-renal-01",
    "title": "Rheumatology and Renal, set 1",
    "description": "One or two sentences on scope and level.",
    "created": "2026-11-07",
    "reviewBy": "2027-11-07",
    "sources": ["Therapeutic Guidelines (Rheumatology)", "..."]
  },
  "questions": [ { "...": "see below" } ]
}
```

| Bank field | Required | Notes |
|---|---|---|
| `schema` | yes | Always `1`. |
| `bank.id` | yes | Lowercase letters, digits and hyphens. Unique across banks. |
| `bank.title` | yes | Shown in the app. |
| `bank.description`, `bank.sources` | no | For authors and reviewers. |
| `bank.created`, `bank.reviewBy` | no | `YYYY-MM-DD`. After `reviewBy`, the app shows "content review overdue" under each answer. |

## Question fields

| Field | SBA | CDP | Notes |
|---|---|---|---|
| `id` | yes | yes | See ID rules above. |
| `format` | `"sba"` | `"cdp"` | Single best answer or clinical decision problem. In the app's RACGP paper style these are labelled AKT and KFP. |
| `select` | – | yes | How many options to choose (1–8). It must equal the number of options with `score` above 0. |
| `exams` | optional | optional | Exam tags for filtering, e.g. `["RACGP"]`, `["ALS1"]`, `["RACP"]`. Never shown during a question. |
| `topics` | yes | yes | Broad areas used for filters and the dashboard, e.g. `["Rheumatology"]`. Reuse the existing names (see existing banks) so topics don't fragment. Put the main topic first. |
| `subtopic` | recommended | recommended | e.g. `"Gout"`. Shown after answering. |
| `source` | optional | optional | The published guideline or reference that supports the answer, with its year. Shown after answering. Public: never a private file, page number or quote. |
| `stem` | yes | yes | Array of paragraph strings. |
| `tables` | optional | optional | `[{ "caption": "optional", "head": ["Test","Result","Reference"], "rows": [["Sodium","134 mmol/L","135–145"]] }]`. Every row has as many cells as `head`. |
| `lead` | yes | yes | The question sentence, e.g. "What is the MOST appropriate next step?" For CDP, don't write "Select 3" in the lead; the app adds it. |
| `options` | 4–12 | 6–20 | In alphabetical order (numeric order where options differ only by a number). Each option is `{ "text": "...", "why": "..." }`. |
| `options[].correct` | exactly one `true` | – | SBA only. |
| `options[].score` | – | 0–3 each | CDP only. 1 for a correct option, 2 for a critical one. |
| `options[].critical` | – | optional `true` | CDP only, with `score` 2 or 3. Usually 1 per question, at most 2. |
| `keyPoint` | yes | yes | One or two sentences: the take-home rule. |
| `reviewBy` | optional | optional | Overrides the bank date for this question. |
| `penalty` | – | optional | Share of the item lost per extra option chosen. Default 0.245 (0.35% of a 70-item paper). |

Scoring: SBA scores 1 or 0. CDP scores (sum of chosen option scores ÷ sum of all positive scores) − penalty × options chosen beyond `select`.

## Minimal examples

```json
{
  "id": "gen01-s01",
  "format": "sba",
  "exams": ["RACGP"],
  "topics": ["Endocrinology"],
  "subtopic": "Thyroid",
  "stem": ["Ana Silva, 34, ..."],
  "tables": [{ "head": ["Test", "Result", "Reference"], "rows": [["TSH", "< 0.01 mU/L", "0.4–4.0"]] }],
  "lead": "What is the MOST likely diagnosis?",
  "options": [
    { "text": "Graves disease", "correct": true, "why": "..." },
    { "text": "Postpartum thyroiditis", "why": "..." },
    { "text": "Subacute thyroiditis", "why": "..." },
    { "text": "Toxic multinodular goitre", "why": "..." }
  ],
  "keyPoint": "..."
}
```

```json
{
  "id": "gen01-c01",
  "format": "cdp",
  "select": 3,
  "exams": ["RACGP"],
  "topics": ["Renal"],
  "subtopic": "AKI",
  "stem": ["..."],
  "lead": "Which THREE actions are MOST appropriate now?",
  "options": [
    { "text": "Cease ibuprofen", "score": 2, "critical": true, "why": "Critical. ..." },
    { "text": "Repeat EUC within 24–48 hours", "score": 1, "why": "..." },
    { "text": "Withhold metformin", "score": 1, "why": "..." },
    { "text": "Arrange admission for IV fluids", "score": 0, "why": "..." },
    { "text": "Cease atorvastatin", "score": 0, "why": "..." },
    { "text": "Request an urgent renal ultrasound", "score": 0, "why": "..." }
  ],
  "keyPoint": "..."
}
```

(Option order in these examples is shortened for space. Real files must be alphabetical.)

## Item-writing method

These are the conventions of the RACGP written papers, and the NBME item-writing standard behind them. They suit any college exam.

- **Age range by exam:**
  - `RACGP`: all ages. Most stems are adults, with a regular share of infants, children, adolescents and older adults, as on the real papers. A paediatric stem has a named carer. Doses are by weight where the guideline uses weight-based dosing, and the stem gives the weight.
  - `RACP`, especially Advanced Training: adults plus young adults aged 16 to 18 years.
  - Others: adults unless the user says otherwise.
- **Stem:** a named patient with age and occupation (or school year, for a child), then history, past history, medicines with doses, examination, and results in a table with reference ranges. Australian setting, metric units (mmol/L, g/L), generic drug names and Therapeutic Guidelines doses. Anything not stated is assumed normal or negative. The setting is metropolitan unless stated otherwise.
- **Lead-in:** positive, with capitalised MOST ("What is the MOST appropriate…"). Never NOT, EXCEPT, "all of the above" or "none of the above". The question must be answerable with the options covered.
- **Options:** homogeneous (all diagnoses, or all drugs with doses), alphabetical, with no cueing (the key is not the longest option and there is no grammatical mismatch).
- **No logical elimination.** Every option must be consistent with the stem's facts and with any plan the stem has already committed to. A candidate should not be able to discard an option by logic alone, without clinical knowledge. Before saving, test each distractor: could someone with no medical knowledge rule it out just from the stem or from the other options? If yes, rewrite it as a clinically plausible wrong answer. Common forms:
  - An option that contradicts a stem fact or plan. Example: the stem says a second serology sample is planned in 2 weeks, and an option reads "IgM positive on the first sample, with no second sample".
  - An option of a different kind from the rest, such as a plan among results, or a drug among investigations.
  - Two options that are opposites, so one of them must be the key.
  - An option that repeats the stem's wording.
  - An absolute ("always", "never") in a field where nothing is absolute.
  
  Fix by replacing the option with one that has the same form as the key and fails only on clinical grounds. For the serology example: "Ross River virus IgM positive on both samples, with IgG negative on both samples". This is a possible false-positive IgM with no seroconversion, so it is wrong only for a candidate who knows the confirmation criteria.
- **Exactly one defensible key.** Use stem facts to rule out rival answers (an HbA1c of 9.4% rules out systemic steroid, a patient who declines antibiotics, a vaccine already given). Leave out options that experts could argue either way.
- **Distractors on purpose:** right answer for the wrong diagnosis; right drug at the wrong dose or duration; right concept for the wrong drug; correct only in another setting; correct but premature; unsafe delay; over-investigation; a rule applied outside its scope.
- **CDP:** the stem states actions already taken, to push the candidate to the next decision. There are 2–6 keyed answers, with one critical answer worth 2. Low-value care scores 0.
- **Difficulty (RACGP standard):** aim at a borderline-competent independent GP, not a specialist and not a medical student.
  - Test common or important presentations and the decision that changes the outcome, not rare trivia.
  - The key should need at least two steps: recognise the problem, then choose the action or interpret the result.
  - At least two distractors should be options that a partly prepared candidate would pick. Use the distractor types listed above.
  - Benchmark against RACGP's sample questions and Self-Assessment Progress Test (SAPT) items. If an item is easier than these, or answerable by logic, rewrite it.
- **Explanations (`why`):** one line for each option. Write longer ones for the key and for traps, and start a trap with "Often chosen." or "The common trap." Start a critical CDP answer's `why` with "Critical."
- **Tone:** plain Australian English, no em-dashes, and no filler words (delve, pivotal, crucial, robust).
- **Citing attached references.** This repository and its website are public, so attached material is cited in two places.
  - **Public, in the bank:** `source` names the published guideline that supports the answer, with its year, e.g. `"Therapeutic Guidelines: Rheumatology (gout)"` or `"SOMANZ Hypertension in Pregnancy Guideline (2023)"`. No field in a bank (`source`, `why`, `keyPoint`, `bank.sources`, `description`) may name a user's file, course, lecture deck, recall paper or past exam, give its page or slide numbers, or quote it. Write everything in your own words.
  - **Private, in a separate file:** the exact location goes in `refs/<bank-id>.json`, which the user uploads to the private answers repository. Signed-in users see it after answering, under "Your reference".
    ```json
    {
      "schema": 1,
      "bank": "cardiology-20261113",
      "sources": ["Lecture deck: Heart failure", "College recall paper 2022a"],
      "refs": {
        "card1113-s01": { "source": "Heart failure deck, slide 14", "quote": "Optional short direct quote, under about 25 words." }
      }
    }
    ```
  - Cite only a location you actually read. Never guess a page or slide number. Leave a question out of `refs` if the attachments don't cover it.
  - AI assistants with access to this repository still can't reach the private repository: give the refs file to the user as a code block or file to upload.
- **Check facts** against the source decks and current guidelines. Prefer current guidelines when they conflict with an older manual, and say so in the `why`.
