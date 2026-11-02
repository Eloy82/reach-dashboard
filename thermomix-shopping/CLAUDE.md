# CLAUDE.md — project context for Claude Code

> Read this first. It briefs a fresh session on what this project is, what's
> done, the decisions already made, and what to build next.

## What this project is

A personal tool to take the recipes/ingredients planned in **Cookidoo**
(Thermomix) and push them into a **UK supermarket** online basket, so the weekly
shop is semi-automated. The user reviews and checks out manually — it is **not**
meant to place orders unattended.

Pipeline:

```
[ Leg 1: Cookidoo read ]  ->  [ Leg 2: matcher (TODO) ]  ->  [ Leg 3: basket (TODO) ]
   DONE (fetch_plan.py)        ingredient -> product           uk-grocery-cli
```

## Where this lives (and should live)

Currently a `thermomix-shopping/` subfolder inside the `reach-dashboard` repo,
only because that was the one repo the authoring session had push access to.
The intended home is a dedicated private repo **`Eloy82/thermomix-shopping`**
(already created). To move it there: start a new Claude Code web session with
that repo selected, and copy this folder's contents to the repo root.

## Decisions already made (don't re-litigate without asking)

- **Target supermarket: Tesco.** Chosen over Sainsbury's because Tesco's
  cookie-import session persists, whereas Sainsbury's forces SMS 2FA on *every*
  fresh login (bad for a recurring weekly run). Sainsbury's remains a fallback.
- **Ocado was dropped.** No official API, and the community `uk-grocery-cli`
  Ocado integration is currently broken (Ocado moved to a client-side React UI).
- **Design is semi-automated, not hands-off.** Supermarket login needs 2FA /
  has bot-detection, so the intended UX is: bot builds the basket, user reviews
  and checks out. This is also safer (never silently buys the wrong product).
- **Chosen libraries:**
  - Cookidoo read: [`cookidoo-api`](https://github.com/miaucl/cookidoo-api)
    (Python, requires **Python 3.12+**, pinned `0.17.2`). This is the same
    library behind the official Home Assistant Cookidoo integration.
  - Supermarket basket: [`uk-grocery-cli`](https://github.com/abracadabra50/uk-grocery-cli)
    (TypeScript/Node). Search + basket add/remove/update confirmed working for
    Tesco & Sainsbury's. Not yet integrated here.

## What's done — Leg 1 (`fetch_plan.py`)

Reads (read-only, writes nothing back to Cookidoo):
- planned recipes for a week (`get_recipes_in_calendar_week`)
- aggregated shopping-list ingredients (`get_ingredient_items`)
- manually added items (`get_additional_items`)

Outputs human-readable text or `--json` (the JSON is the contract for Leg 2).
Has `--week this|next`, `--no-cache`, and `--demo` (sample data, no login).
Verified working via `--demo`; verified against the real installed library API.
Not yet run against a live account (needs the user's Cookidoo credentials).

### Gotchas discovered (important for Leg 2)
- **Calendar plan ≠ shopping list.** Scheduling a recipe does NOT auto-add its
  ingredients to the shopping list; the user taps "add to shopping list" in the
  app. The script surfaces both so the gap is visible.
- **Quantities are free text.** `CookidooIngredientItem` is
  `{id, name, is_owned, description}` — the quantity/unit lives in `description`
  as a string like `"500 g"`, not as numeric fields. Leg 2 must parse this.
- **Custom (user-created) recipes** get bucketed as "Other" in Cookidoo and may
  not appear in the structured shopping list.
- **UK localization** = country `gb`, language `en-GB` (`cookidoo.co.uk`).

## What to build next — Leg 2 (the matcher)

Turn each shopping-list ingredient (e.g. `"chestnut mushrooms", "250 g"`) into a
concrete Tesco product. Plan:
1. Take Leg 1's `--json` output as input.
2. For each non-owned ingredient, search Tesco (via `uk-grocery-cli`) and pick
   the best product, considering food name, pack size vs required quantity,
   price, and availability.
3. Produce a proposed basket the user confirms before anything is added.
   An LLM-assisted matcher with a human confirm step is the intended approach.

Then Leg 3: push the confirmed list into the Tesco basket via `uk-grocery-cli`;
user does the final checkout.

## Environment / running

- Python **3.12+** required. `uv venv --python 3.12 && uv pip install -r requirements.txt`.
- Credentials go in `.env` (gitignored) — never commit. See `.env.example`.
- `cookies.json` caches the Cookidoo session after first login (gitignored).
- Repo is **private**. Eventually supermarket credentials will also be needed —
  keep all secrets in `.env`, never in the repo.

## Conventions

- Keep Leg 1 read-only.
- Keep the JSON output shape stable — it's the interface between legs.
- Prefer minimal dependencies (the `.env` loader is hand-rolled to avoid one).
