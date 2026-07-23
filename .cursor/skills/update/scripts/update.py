#!/usr/bin/env python3
"""Sync recipes from Notion, then AI-enrich portions and nutrition."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[3]
ENV_LOCAL = ROOT / ".env.local"


def run(script_name: str, extra_args: list[str] | None = None) -> None:
    script = SCRIPT_DIR / script_name
    cmd = [sys.executable, str(script), *(extra_args or [])]
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> int:
    parser = argparse.ArgumentParser(description="Update mealprep recipes from Notion")
    parser.add_argument("--sync-only", action="store_true", help="Only sync from Notion")
    parser.add_argument("--enrich-only", action="store_true", help="Only run AI enrichment")
    parser.add_argument(
        "--require-ai",
        action="store_true",
        help="Require OPENAI_API_KEY for enrichment (no heuristic fallback)",
    )
    args = parser.parse_args()

    enrich_args = ["--require-ai"] if args.require_ai else []

    if args.enrich_only:
        run("enrich-recipes.py", enrich_args)
        return 0

    run("sync-from-notion.py")
    if not args.sync_only:
        run("enrich-recipes.py", enrich_args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
