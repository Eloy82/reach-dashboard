# Thermomix → Supermarket (proof of concept)

Reads your **Cookidoo** weekly meal plan and shopping list so the items can
later be pushed into a UK supermarket basket (Tesco/Sainsbury's). This project
currently implements **Leg 1 only**: reading from Cookidoo. It is read-only and
writes nothing back.

```
[ Leg 1: Cookidoo read ]  ->  [ Leg 2: matcher (TODO) ]  ->  [ Leg 3: basket (TODO) ]
   this script                 ingredient -> product          uk-grocery-cli
```

> Note: this lives in a `thermomix-shopping/` subfolder of the `reach-dashboard`
> repo for now, only because that was the single repo the authoring session
> could push to. Its intended home is a dedicated repo (`Eloy82/thermomix-shopping`).

## Requirements

- **Python 3.12+** (the `cookidoo-api` library requires it)
- A Cookidoo subscription / account

## Setup

```bash
# from this directory
python3.12 -m venv .venv          # or: uv venv --python 3.12
source .venv/bin/activate
pip install -r requirements.txt    # or: uv pip install -r requirements.txt

cp .env.example .env               # then edit .env and add your Cookidoo login
```

Your credentials live only in `.env` (gitignored). After the first run a
`cookies.json` session cache is saved so subsequent runs skip the login.

## Usage

```bash
python fetch_plan.py               # next week's plan + current shopping list
python fetch_plan.py --week this   # current week
python fetch_plan.py --json        # machine-readable output (for the future matcher)
python fetch_plan.py --no-cache    # force a fresh login
python fetch_plan.py --demo        # sample data, no login needed (preview the output)
```

## Important notes / caveats

- **Planned recipes vs shopping list are separate in Cookidoo.** Scheduling a
  recipe in the calendar does *not* automatically put its ingredients on the
  shopping list — in the app you tap "add to shopping list". This script shows
  both so you can see the gap.
- **Custom (user-created) recipes**: their ingredients are bucketed as "Other"
  in Cookidoo and may not appear in the structured shopping list.
- Ingredient quantity/unit comes back as free text in the `description` field
  (e.g. `"500 g"`), not as separate numeric fields. Leg 2 (the matcher) will
  need to parse this.
- This uses the unofficial `cookidoo-api`. It can break if Cookidoo changes
  their site, and may be against their terms of service. Use for personal use.

## Status

- [x] Leg 1 — read Cookidoo weekly plan + shopping list
- [ ] Leg 2 — match ingredients to Tesco/Sainsbury's products
- [ ] Leg 3 — push matched products into the basket (via `uk-grocery-cli`)
