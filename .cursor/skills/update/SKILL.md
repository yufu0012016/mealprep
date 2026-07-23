---
name: update
description: Sync mealprep recipes from the Notion Recipes database and AI-enrich portions, steps, and nutrition. Use when the user asks to update recipes, sync from Notion, refresh the recipe library, or optimize nutrition and serving sizes with AI.
---

# Update Mealprep Recipes

从 Notion 拉取最新食谱，并用 AI 完善两人份份量、简易做法和营养估算。

## Source of truth

| 位置 | 用途 |
|------|------|
| [Notion Recipes](https://www.notion.so/Recipes-2b48bc4052e780b48d9ceadd673938a0) | 原始菜谱（名称、标签、食材、做法、链接） |
| `recipes.json` | 仓库内主数据 |
| `recipes.js` | 由 `recipes.json` 自动生成，供网页读取 |

Notion 数据库当前约 **88 道**。公开页面表格可能只显示 50 行；**必须以 API 同步脚本为准**，不要只读网页快照。

## Quick start

在项目根目录执行：

```bash
python3 .cursor/skills/update/scripts/update.py
```

需要 AI 完善时，先设置环境变量：

```bash
export OPENAI_API_KEY="sk-..."
# 可选，兼容 OpenAI 格式的代理
export OPENAI_API_BASE="https://api.openai.com/v1"

python3 .cursor/skills/update/scripts/update.py
```

## Workflow

按顺序执行，并向用户汇报结果：

```
Task Progress:
- [ ] Step 1: Sync from Notion → recipes.json + recipes.js
- [ ] Step 2: AI-enrich new/changed recipes
- [ ] Step 3: Summarize diff (count, new names, failures)
```

### Step 1 — Sync

```bash
python3 .cursor/skills/update/scripts/sync-from-notion.py
```

行为：
- 通过 Notion 公开 API 拉取全部条目（limit 200）
- 跳过标题为 `Recipes` 的空行
- **按菜名保留已有 `id`**，新菜自动生成 slug id
- 写入 `notionHash`；若 Notion 内容未变且已有 AI 完善结果，保留现有 `ingredients` / `steps` / `nutrition`
- 覆盖写入 `recipes.json` 和 `recipes.js`

### Step 2 — AI enrich

```bash
python3 .cursor/skills/update/scripts/enrich-recipes.py
```

行为：
- 目标人群：**2 名 50kg、经常运动女生**，每人每餐约 850–1000 kcal，蛋白质 30–40g
- 仅处理未 AI 完善、或仍含「适量」生鲜份量的菜谱
- 有 `OPENAI_API_KEY` → 调用 `gpt-4o-mini` 生成精确份量 + 4–6 步做法 + 营养摘要
- 无 API Key → 离线 heuristic 估算（应提醒用户配置 Key 后重跑）
- 失败时自动 fallback 到 heuristic

### Flags

```bash
python3 .cursor/skills/update/scripts/update.py --sync-only
python3 .cursor/skills/update/scripts/update.py --enrich-only
```

## Field mapping (Notion → mealprep)

| Notion | JSON 字段 | 规则 |
|--------|-----------|------|
| Name | `name` | 主键（按名称合并） |
| Multi-select | `tags` | 原样保留 |
| Multi-select | `category` | `Hard`→耗时；仅 `Bake`→烘焙；否则→快手 |
| 想吃指数 | `craving` | number |
| Instruction | `instruction` | text |
| Ingredients | `ingredients` | 每项 `{name, amount:1, unit:"适量"}` |
| link | `link` | 可选 |

常见英文食材会在同步时中文化（如 `Kale`→羽衣甘蓝、`Basil`→罗勒）。

## After update

1. 告诉用户新增/变更数量
2. 若未设置 `OPENAI_API_KEY`，说明当前为离线估算，建议配置后重跑
3. 提醒浏览器端若缓存了旧完善结果：打开网页 → **⚙ 营养 & AI → 清除本地缓存**
4. **不要**擅自 commit；仅在用户明确要求时提交

## Troubleshooting

| 问题 | 处理 |
|------|------|
| 只同步到 50 道 | 不要用网页抓取；运行 `sync-from-notion.py` |
| Notion MCP 需登录 | 本 skill 不依赖 MCP；脚本走公开 API |
| AI 429/超时 | 脚本已 400ms 节流；失败条目会 heuristic fallback |
| 网络失败 | 请求 `full_network` 权限后重试 |

## Config

Notion IDs 在 [scripts/config.json](scripts/config.json)。若数据库迁移，更新其中的 `collectionId` / `viewId` / `spaceId`。
