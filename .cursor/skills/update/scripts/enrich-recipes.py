#!/usr/bin/env python3
"""AI-enrich recipe portions, steps, and nutrition for mealprep recipes."""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[3]
CONFIG = json.loads((SCRIPT_DIR / "config.json").read_text(encoding="utf-8"))

NUTRITION_PROFILE = {
    "people": 2,
    "weightKg": 50,
    "activity": "经常运动",
    "description": "2 名 50kg、经常运动女生 · 每人每餐约 850–1000 kcal · 蛋白质 30–40g",
}

PANTRY = {
    "盐", "糖", "生抽", "老抽", "蚝油", "味增", "酱油", "醋", "香醋", "巴萨米克醋", "果醋", "黑醋",
    "料酒", "味淋", "香油", "食用油", "橄榄油", "黄油", "奶油", "淡奶油",
    "花生酱", "麻酱", "豆瓣酱", "韩国辣酱", "辣酱", "番茄酱", "番茄膏",
    "咖喱", "咖喱粉", "孜然粉", "辣椒粉", "胡椒粉", "黑胡椒", "白胡椒粉",
    "大蒜粉", "洋葱粉", "甜椒粉", "姜黄", "花椒粉", "五香粉",
    "淀粉", "玉米淀粉", "白芝麻", "蜂蜜", "辣蜂蜜", "冰糖", "白糖",
    "米酒", "白葡萄酒", "鱼露", "美乃滋", "青酱", "关东煮酱汁", "木鱼花",
    "高汤", "dashi", "丁香", "八角", "香叶", "干辣椒", "小米辣", "泡椒",
    "米饭", "隔夜米饭", "面条", "粉丝", "意面", "rigatoni", "面粉", "酵母",
    "干菌", "海苔", "白豆", "果酱",
}


def is_pantry_item(name: str) -> bool:
    trimmed = name.strip()
    return trimmed in PANTRY or trimmed.lower() in PANTRY


def build_enrich_prompt(recipe: dict) -> str:
    ingredients = "、".join(item["name"] for item in recipe.get("ingredients", []))
    return f"""你是专业营养师兼家庭烹饪顾问。请为以下食谱补充精确食材份量和简易做法。

【用餐对象】{NUTRITION_PROFILE["people"]} 名 {NUTRITION_PROFILE["weightKg"]}kg、{NUTRITION_PROFILE["activity"]} 的女性，一起吃一顿（{NUTRITION_PROFILE["description"]}）
【食谱名称】{recipe["name"]}
【现有做法参考】{recipe.get("instruction") or "无"}
【现有食材】{ingredients}

要求：
1. servings 固定为 2（两人一份餐）
2. 每人每餐蛋白质尽量 30–40g，碳水 80–110g，蔬菜充足，总热量约 850–1000 kcal/人
3. 肉类用 g，蔬菜用 g，鸡蛋用「个」，液体用 ml；尽量不用「适量」
4. 调料标记 pantry: true；生鲜标记 pantry: false
5. steps 写 4–6 步简易快手流程，每步一句话，适合厨房新手

只返回 JSON，不要 markdown：
{{
  "ingredients": [{{"name":"...", "amount":数字, "unit":"g|ml|个|...", "pantry":false}}],
  "steps": ["步骤1", "步骤2"],
  "nutrition": {{"proteinGPerPerson":数字, "caloriesPerPerson":数字, "note":"一句话说明"}}
}}"""


def parse_ai_json(text: str) -> dict:
    cleaned = re.sub(r"```json\n?|\n?```", "", text).strip()
    return json.loads(cleaned)


def call_openai(api_key: str, api_base: str, messages: list[dict]) -> str:
    url = f"{api_base.rstrip('/')}/chat/completions"
    req = urllib.request.Request(
        url,
        data=json.dumps(
            {
                "model": "gpt-4o-mini",
                "temperature": 0.3,
                "messages": messages,
            }
        ).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        payload = json.loads(response.read().decode())
    content = payload.get("choices", [{}])[0].get("message", {}).get("content")
    if not content:
        raise RuntimeError("AI 返回为空")
    return content


def heuristic_portion(name: str) -> dict:
    if re.search(r"三文鱼|巴沙|鳕鱼|鲈鱼", name):
        return {"amount": 320, "unit": "g"}
    if re.search(r"虾|虾仁", name):
        return {"amount": 300, "unit": "g"}
    if re.search(r"扇贝|蛤蜊|生蚝|章鱼|海鲜", name):
        return {"amount": 350, "unit": "g"}
    if "鱼" in name:
        return {"amount": 300, "unit": "g"}
    if "排骨" in name:
        return {"amount": 400, "unit": "g"}
    if re.search(r"肉|鸡|猪|牛|羊|馅|丝|培根|肠|火腿", name):
        return {"amount": 350, "unit": "g"}
    if "蛋" in name:
        return {"amount": 3, "unit": "个"}
    if re.search(r"豆腐|豆乳|豆浆", name):
        return {"amount": 300, "unit": "g"}
    if re.search(r"菜|瓜|菇|菌|萝卜|土豆|番茄|西兰|包菜|甘蓝|菠菜|黄瓜|胡萝卜|洋葱|生菜|羽衣", name):
        return {"amount": 250, "unit": "g"}
    if is_pantry_item(name):
        return {"amount": 1, "unit": "适量", "pantry": True}
    return {"amount": 200, "unit": "g"}


def heuristic_enrich(recipe: dict) -> dict:
    ingredients = []
    for item in recipe.get("ingredients", []):
        if item.get("pantry") or is_pantry_item(item["name"]):
            ingredients.append({**item, "pantry": True, "unit": item.get("unit") or "适量"})
            continue
        if item.get("unit") and item["unit"] != "适量":
            ingredients.append({**item, "pantry": False})
            continue
        portion = heuristic_portion(item["name"])
        ingredients.append(
            {
                "name": item["name"],
                "amount": portion["amount"],
                "unit": portion["unit"],
                "pantry": portion.get("pantry", False),
            }
        )

    instruction = (recipe.get("instruction") or "").strip()
    steps = recipe.get("steps")
    if not steps and instruction and len(instruction) > 8 and not re.search(r"详见|链接|http", instruction):
        steps = [part.strip() for part in re.split(r"[。；!\n]+", instruction) if len(part.strip()) > 2]

    enriched = {
        **recipe,
        "servings": 2,
        "ingredients": ingredients,
        "enriched": True,
        "enrichedBy": "heuristic",
        "nutrition": {"note": "估算值，建议配置 OPENAI_API_KEY 后重新 update"},
    }
    if steps:
        enriched["steps"] = steps
    return enriched


def enrich_with_ai(recipe: dict, api_key: str, api_base: str) -> dict:
    content = call_openai(
        api_key,
        api_base,
        [
            {"role": "system", "content": "你只输出合法 JSON，用于膳食份量与做法。"},
            {"role": "user", "content": build_enrich_prompt(recipe)},
        ],
    )
    parsed = parse_ai_json(content)
    return {
        **recipe,
        "servings": 2,
        "ingredients": [
            {
                **item,
                "pantry": bool(item.get("pantry")) or is_pantry_item(item["name"]),
            }
            for item in parsed.get("ingredients", [])
        ],
        "steps": parsed.get("steps") or recipe.get("steps") or [],
        "nutrition": parsed.get("nutrition"),
        "enriched": True,
        "enrichedBy": "ai",
        "stepsAi": True,
    }


def needs_enrichment(recipe: dict) -> bool:
    if not recipe.get("enriched"):
        return True
    if recipe.get("enrichedBy") != "ai":
        return True
    if any(item.get("unit") == "适量" for item in recipe.get("ingredients", []) if not item.get("pantry")):
        return True
    return False


def write_outputs(recipes: list[dict]) -> None:
    json_path = ROOT / CONFIG["recipesJson"]
    js_path = ROOT / CONFIG["recipesJs"]
    json_path.write_text(json.dumps(recipes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    js_path.write_text(
        "const RECIPES = \n" + json.dumps(recipes, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )


def main() -> int:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    api_base = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1").strip()

    recipes_path = ROOT / CONFIG["recipesJson"]
    recipes = json.loads(recipes_path.read_text(encoding="utf-8"))
    targets = [recipe for recipe in recipes if needs_enrichment(recipe)]

    if not targets:
        print("all recipes already AI-enriched")
        return 0

    print(f"enriching {len(targets)} recipes")
    enriched_count = 0

    for index, recipe in enumerate(recipes):
        if not needs_enrichment(recipe):
            continue

        name = recipe["name"]
        print(f"[{enriched_count + 1}/{len(targets)}] {name}")

        try:
            if api_key:
                recipes[index] = enrich_with_ai(recipe, api_key, api_base)
            else:
                recipes[index] = heuristic_enrich(recipe)
                print("  used heuristic fallback (set OPENAI_API_KEY for AI)")
        except Exception as error:  # noqa: BLE001
            print(f"  failed: {error}; using heuristic")
            recipes[index] = heuristic_enrich(recipe)

        enriched_count += 1
        if api_key and enriched_count < len(targets):
            time.sleep(0.4)

    write_outputs(recipes)
    print(f"done: enriched {enriched_count} recipes")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
