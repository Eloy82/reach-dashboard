#!/usr/bin/env python3
"""Leg 1 of the Cookidoo -> supermarket pipeline.

Logs into Cookidoo, reads the planned recipes for a given week and the current
aggregated shopping-list ingredients, and prints them (optionally as JSON so a
later "matcher" stage can consume it).

Nothing is written back to Cookidoo. This is read-only.

Usage:
    python fetch_plan.py                 # next week's plan + shopping list
    python fetch_plan.py --week this     # current week instead
    python fetch_plan.py --json          # machine-readable output for the matcher
    python fetch_plan.py --no-cache      # force a fresh login (ignore saved cookies)
    python fetch_plan.py --demo          # sample data, no login needed
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

from aiohttp import ClientSession, CookieJar

from cookidoo_api import Cookidoo
from cookidoo_api.helpers import get_localization_options
from cookidoo_api.types import CookidooConfig

HERE = Path(__file__).resolve().parent
COOKIE_FILE = HERE / "cookies.json"


# --- tiny .env loader (avoids an extra dependency) -------------------------
def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


def monday_of_target_week(which: str) -> date:
    today = date.today()
    monday_this = today - timedelta(days=today.weekday())  # weekday(): Mon=0
    return monday_this + timedelta(days=7) if which == "next" else monday_this


async def build_client(session: ClientSession, use_cache: bool) -> Cookidoo:
    email = os.environ.get("COOKIDOO_EMAIL") or os.environ.get("EMAIL")
    password = os.environ.get("COOKIDOO_PASSWORD") or os.environ.get("PASSWORD")
    if not email or not password:
        sys.exit(
            "Missing credentials. Copy .env.example to .env and fill in "
            "COOKIDOO_EMAIL and COOKIDOO_PASSWORD."
        )

    country = os.environ.get("COOKIDOO_COUNTRY", "gb")
    language = os.environ.get("COOKIDOO_LANGUAGE", "en-GB")
    localization = (await get_localization_options(country=country, language=language))[0]

    cookidoo = Cookidoo(
        session,
        cfg=CookidooConfig(email=email, password=password, localization=localization),
    )

    # Try to reuse a saved session first; fall back to a full login.
    if use_cache and COOKIE_FILE.exists():
        try:
            cookidoo.load_cookies(COOKIE_FILE)
            await cookidoo.get_user_info()  # cheap call to validate the session
            return cookidoo
        except Exception:
            print("Saved session expired or invalid, logging in fresh...", file=sys.stderr)

    await cookidoo.login()
    try:
        cookidoo.save_cookies(COOKIE_FILE)
    except Exception as exc:  # non-fatal
        print(f"(could not cache cookies: {exc})", file=sys.stderr)
    return cookidoo


async def gather_data(which: str, use_cache: bool) -> dict:
    jar = CookieJar(unsafe=True)  # required for Cookidoo's cross-domain OAuth2 flow
    async with ClientSession(cookie_jar=jar) as session:
        cookidoo = await build_client(session, use_cache)

        target_monday = monday_of_target_week(which)
        calendar_days = await cookidoo.get_recipes_in_calendar_week(target_monday)
        ingredients = await cookidoo.get_ingredient_items()
        additional = await cookidoo.get_additional_items()

        planned = []
        for day in calendar_days:
            recipes = [
                {"id": r.id, "name": r.name, "total_time": r.total_time, "url": r.url}
                for r in getattr(day, "recipes", []) or []
            ]
            if recipes:
                planned.append({"title": day.title, "recipes": recipes})

        return {
            "week_starting": target_monday.isoformat(),
            "planned_days": planned,
            "shopping_list": [
                {"name": i.name, "description": i.description, "is_owned": i.is_owned}
                for i in ingredients
            ],
            "additional_items": [
                {"name": a.name, "is_owned": a.is_owned} for a in additional
            ],
        }


def print_human(data: dict) -> None:
    print(f"\n=== Planned recipes for week starting {data['week_starting']} ===")
    if not data["planned_days"]:
        print("  (no recipes scheduled in the calendar for this week)")
    for day in data["planned_days"]:
        print(f"\n{day['title']}")
        for r in day["recipes"]:
            mins = f"{r['total_time'] // 60} min" if r["total_time"] else "?"
            print(f"  - {r['name']}  ({mins})")

    items = data["shopping_list"]
    print(f"\n=== Shopping list ingredients ({len(items)}) ===")
    if not items:
        print("  (shopping list is empty - add recipes to it in Cookidoo first)")
    for i in items:
        check = "x" if i["is_owned"] else " "
        qty = f"  [{i['description']}]" if i["description"] else ""
        print(f"  [{check}] {i['name']}{qty}")

    extra = data["additional_items"]
    if extra:
        print(f"\n=== Manually added items ({len(extra)}) ===")
        for a in extra:
            check = "x" if a["is_owned"] else " "
            print(f"  [{check}] {a['name']}")
    print()


def demo_data() -> dict:
    """Sample data with the same shape as a real fetch, for previewing output
    without a Cookidoo login."""
    return {
        "week_starting": monday_of_target_week("next").isoformat(),
        "planned_days": [
            {"title": "Monday", "recipes": [
                {"id": "r1", "name": "Thai green chicken curry", "total_time": 2400, "url": "https://cookidoo.co.uk/recipes/r1"},
            ]},
            {"title": "Wednesday", "recipes": [
                {"id": "r2", "name": "Mushroom risotto", "total_time": 1800, "url": "https://cookidoo.co.uk/recipes/r2"},
                {"id": "r3", "name": "Chocolate mousse", "total_time": 900, "url": "https://cookidoo.co.uk/recipes/r3"},
            ]},
        ],
        "shopping_list": [
            {"name": "chicken breast", "description": "500 g", "is_owned": False},
            {"name": "chestnut mushrooms", "description": "250 g", "is_owned": False},
            {"name": "arborio rice", "description": "300 g", "is_owned": False},
            {"name": "coconut milk", "description": "1 tin", "is_owned": False},
            {"name": "dark chocolate", "description": "200 g", "is_owned": False},
            {"name": "salt", "description": "", "is_owned": True},
        ],
        "additional_items": [
            {"name": "kitchen roll", "is_owned": False},
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Read Cookidoo weekly plan + shopping list.")
    parser.add_argument("--week", choices=["this", "next"], default="next")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of text")
    parser.add_argument("--no-cache", action="store_true", help="ignore saved session cookies")
    parser.add_argument("--demo", action="store_true", help="use sample data (no login needed)")
    args = parser.parse_args()

    if args.demo:
        data = demo_data()
    else:
        load_env(HERE / ".env")
        data = asyncio.run(gather_data(args.week, use_cache=not args.no_cache))

    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print_human(data)


if __name__ == "__main__":
    main()
