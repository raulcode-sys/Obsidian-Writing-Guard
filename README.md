# Writing Style Guard

An Obsidian plugin that finds and fixes writing-style inconsistencies across your entire vault: mixed US/UK spelling, inconsistent Oxford comma usage, inconsistent heading capitalization, inconsistent hyphenation/term variants ("e-mail" vs "email"), and any custom regex pattern you define.

## Features

- **Style rule engine** — configure spelling mode (US/UK/auto-detect majority/off), Oxford comma (require/forbid), heading capitalization (Title Case/Sentence case), custom hyphenation/term-variant groups, and unlimited custom regex rules with optional auto-fix replacements.
- **Rules live in your vault** at `.obsidian/style-rules.json` — plain JSON, easy to version, sync, or edit by hand.
- **Vault scanner** — scans every Markdown file, groups inconsistencies together (e.g. *"you use 'color' in 12 notes and 'colour' in 3"*), and shows exact file + line locations.
- **Auto-correct** — fix a single occurrence, preview a batch of changes before applying, or fix every occurrence of one inconsistency across the whole vault in one click. Full undo/redo for every batch of fixes.
- **Rule wizard** — analyzes your existing notes with local frequency analysis (no external AI calls, nothing leaves your machine) to suggest new rules, e.g. catching that you write "JavaScript" three different ways, or mix "e.g." and "eg".
- **Compliance dashboard** — per-rule compliance percentage, a leaderboard of files with the most violations, and a trend chart if history tracking is enabled.
- **Custom dictionary** — approved terms (like your own product or project names) are never flagged. One-click bulk-add for auto-detected acronyms.

## Installing in Obsidian (from source)

1. Clone this repo into `<your-vault>/.obsidian/plugins/writing-style-guard` (or symlink it there, as this dev copy does).
2. `npm install`
3. `npm run build` (or `npm run dev` to rebuild on save while developing).
4. In Obsidian: Settings → Community plugins → enable community plugins if prompted → enable **Writing Style Guard**.

## Usage

- Ribbon icon or the **"Scan vault"** command runs a scan and opens the results panel.
- Each inconsistency group can be expanded to see every location, previewed, or fixed all at once.
- Open the **dashboard** (command palette → "Open style compliance dashboard") for compliance scores and trends.
- Open the **rule wizard** (button in the scan results panel) for pattern-based rule suggestions.
- All settings — including custom regex rules, hyphenation groups, and the approved-terms dictionary — are under Settings → Writing Style Guard.

## How detection works

- **Spelling**: built-in list of ~120 common US/UK variant pairs, plus any custom pairs you add. In "auto-detect" mode, whichever spelling you use *less* often for a given word across the vault is flagged as inconsistent; "US only"/"UK only" instead enforce one style everywhere.
- **Hyphenation/term variants**: you define groups of alternate spellings of the same term; the majority form in your vault wins unless you set an explicit preferred form.
- **Oxford comma**: detects simple 3-item lists ("A, B and C" / "A, B, and C") — works well for plain prose, not exhaustive for every possible list construction.
- **Heading case**: checks every Markdown heading against Title Case or Sentence case rules, aware of terms with internal capitals (e.g. won't rewrite "JavaScript" or "iPhone").
- **Rule wizard**: pure local frequency analysis over casing variants and common abbreviation pairs (e.g./eg, i.e./ie, etc.). It is intentionally *not* backed by a network AI call, so it works fully offline and needs no API key.
- Fenced code blocks and inline code spans, and YAML frontmatter, are ignored by default (configurable).

## Development

```bash
npm install
npm run dev     # esbuild watch mode
npm run build   # type-check + production bundle
```

Project layout:

```
main.ts                  Plugin entry point
src/types.ts             Shared types
src/defaults.ts           Default rule set
src/spellingDictionary.ts Built-in US/UK word pairs
src/rulesStore.ts         Reads/writes .obsidian/style-rules.json
src/scanner.ts            Vault-wide scan + compliance scoring
src/fixManager.ts         Apply fixes + undo/redo history
src/wizard.ts             Rule-suggestion heuristics
src/dictionary.ts         Acronym auto-detection
src/settings.ts           Settings tab UI
src/rules/                Individual rule implementations
src/views/                Scan results panel + dashboard
src/views/modals/         Preview and rule-wizard modals
```


