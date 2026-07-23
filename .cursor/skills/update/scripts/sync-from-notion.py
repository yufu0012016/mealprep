#!/usr/bin/env python3
"""Pull all recipes from the public Notion Recipes database into recipes.json."""

from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[3]
CONFIG = json.loads((SCRIPT_DIR / "config.json").read_text(encoding="utf-8"))

INGREDIENT_MAP = {
    "Kale": "羽衣甘蓝",
    "Basil": "罗勒",
    "rigatoni": "通心面",
    "parmesan cheese": "帕尔马奶酪",
    "cottage cheese": "茅屋奶酪",
    "dashi": "高汤",
    "clam": "蛤蜊",
    "zucchini": "西葫芦",
    "seafood medley": "海鲜拼盘",
    "lemongrass": "香茅",
}

TAG_TIME = {"Easy": 25, "Hard": 60, "Bake": 45}


def post(url: str, data: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode())


def plain(prop) -> str:
    if not prop:
        return ""
    return "".join("".join(t for t in seg if isinstance(t, str)) for seg in prop).strip()


def slugify(name: str) -> str:
    slug = re.sub(r"[\s_+]+", "-", name.strip().lower())
    slug = re.sub(r"[^\w-]", "", slug, flags=re.UNICODE)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:60] or f"recipe-{abs(hash(name)) % 10**8}"


def parse_tags(raw) -> list[str]:
    if not raw:
        return []
    text = "".join(t[0] for t in raw if t)
    return [part.strip() for part in re.split(r"[,，]", text) if part.strip()]


def category_from_tags(tags: list[str]) -> str:
    if "Hard" in tags:
        return "耗时"
    if "Bake" in tags and "Easy" not in tags:
        return "烘焙"
    return "快手"


def parse_ingredients(raw) -> list[dict]:
    names: list[str] = []
    seen: set[str] = set()
    for item in raw or []:
        if not item:
            continue
        text = item[0].strip()
        if not text:
            continue
        for part in re.split(r"[,，、]", text):
            name = INGREDIENT_MAP.get(part.strip(), part.strip())
            if name and name not in seen:
                seen.add(name)
                names.append(name)
    return [{"name": name, "amount": 1, "unit": "适量"} for name in names]


def ingredients_look_valid(ingredients: list[dict]) -> bool:
    if not ingredients:
        return False
    return all("," not in item.get("name", "") and "，" not in item.get("name", "") for item in ingredients)


def parse_craving(raw) -> float:
    try:
        return float(plain(raw) or 1.0)
    except ValueError:
        return 1.0


def notion_hash(recipe: dict) -> str:
    payload = json.dumps(
        {
            "name": recipe["name"],
            "instruction": recipe.get("instruction", ""),
            "ingredients": [i["name"] for i in recipe.get("ingredients", [])],
            "tags": recipe.get("tags", []),
            "craving": recipe.get("craving", 1.0),
            "link": recipe.get("link", ""),
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def fetch_notion_recipes() -> list[dict]:
    data = post(
        "https://www.notion.so/api/v3/queryCollection",
        {
            "collectionView": {
                "id": CONFIG["viewId"],
                "spaceId": CONFIG["spaceId"],
            },
            "collection": {
                "id": CONFIG["collectionId"],
                "spaceId": CONFIG["spaceId"],
            },
            "loader": {
                "reducers": {
                    "collection_group_results": {"type": "results", "limit": 200}
                },
                "searchQuery": "",
                "userTimeZone": "America/New_York",
            },
        },
    )

    recipes: list[dict] = []
    for block in data.get("recordMap", {}).get("block", {}).values():
        inner = block.get("value", {}).get("value", block.get("value", {}))
        if inner.get("type") != "page":
            continue

        props = inner.get("properties", {})
        name = plain(props.get("title"))
        if not name or name == "Recipes":
            continue

        tags = parse_tags(props.get("mhZ|"))
        instruction = plain(props.get("}~?Y"))
        link = plain(props.get("^:;v"))
        craving = parse_craving(props.get("eavV"))
        ingredients = parse_ingredients(props.get("fpmz"))

        recipe = {
            "name": name,
            "category": category_from_tags(tags),
            "time": max((TAG_TIME.get(tag, 0) for tag in tags), default=25) or 25,
            "servings": 2,
            "tags": tags or ["Easy"],
            "craving": craving,
            "instruction": instruction or ("详见链接" if link else ""),
            "ingredients": ingredients,
        }
        if link:
            recipe["link"] = link
        recipes.append(recipe)

    recipes.sort(key=lambda item: item["name"])
    return recipes


def merge_with_existing(notion_recipes: list[dict], local_recipes: list[dict]) -> list[dict]:
    local_by_name = {recipe["name"]: recipe for recipe in local_recipes}
    used_ids = {recipe["id"] for recipe in local_recipes}
    merged: list[dict] = []

    for recipe in notion_recipes:
        existing = local_by_name.get(recipe["name"])
        if existing:
            recipe["id"] = existing["id"]
            recipe["time"] = existing.get("time", recipe["time"])
            for field in ("enriched", "enrichedBy", "steps", "stepsAi", "nutrition"):
                if field in existing:
                    recipe[field] = existing[field]
            if (
                existing.get("enrichedBy") == "ai"
                and ingredients_look_valid(existing.get("ingredients", []))
                and existing.get("notionHash") == notion_hash(recipe)
            ):
                recipe["ingredients"] = existing["ingredients"]
            else:
                for field in ("enriched", "enrichedBy", "stepsAi", "nutrition"):
                    recipe.pop(field, None)
        else:
            base_id = slugify(recipe["name"])
            recipe_id = base_id
            suffix = 2
            while recipe_id in used_ids:
                recipe_id = f"{base_id}-{suffix}"
                suffix += 1
            recipe["id"] = recipe_id
            used_ids.add(recipe_id)

        recipe["notionHash"] = notion_hash(recipe)
        merged.append(recipe)

    return merged


def write_outputs(recipes: list[dict]) -> None:
    json_path = ROOT / CONFIG["recipesJson"]
    js_path = ROOT / CONFIG["recipesJs"]

    json_path.write_text(
        json.dumps(recipes, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    js_path.write_text(
        "const RECIPES = \n"
        + json.dumps(recipes, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )


def main() -> int:
    local_path = ROOT / CONFIG["recipesJson"]
    local_recipes = []
    if local_path.exists():
        local_recipes = json.loads(local_path.read_text(encoding="utf-8"))

    notion_recipes = fetch_notion_recipes()
    merged = merge_with_existing(notion_recipes, local_recipes)
    write_outputs(merged)

    new_names = sorted(
        recipe["name"]
        for recipe in merged
        if recipe["name"] not in {item["name"] for item in local_recipes}
    )
    print(f"synced {len(merged)} recipes from Notion")
    if new_names:
        print(f"new: {len(new_names)}")
        for name in new_names:
            print(f"  + {name}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
