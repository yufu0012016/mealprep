#!/usr/bin/env python3
"""Sync recipes from Notion, then AI-enrich portions and nutrition."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent


def run(script_name: str) -> None:
    script = SCRIPT_DIR / script_name
    result = subprocess.run([sys.executable, str(script)], check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> int:
    parser = argparse.ArgumentParser(description="Update mealprep recipes from Notion")
    parser.add_argument("--sync-only", action="store_true", help="Only sync from Notion")
    parser.add_argument("--enrich-only", action="store_true", help="Only run AI enrichment")
    args = parser.parse_args()

    if args.enrich_only:
        run("enrich-recipes.py")
        return 0

    run("sync-from-notion.py")
    if not args.sync_only:
        run("enrich-recipes.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
