# 每周食谱生成器

从食谱库随机抽取一周 14 餐（7 天 × 午饭 + 晚饭），并自动生成两人份**生鲜**购物清单（调料默认已有）。

食谱数据来自 Notion：[Recipes](https://www.notion.so/Recipes-2b48bc4052e780b48d9ceadd673938a0)

## 使用方式

**直接打开**：双击 `index.html` 即可使用，无需安装任何依赖。

## 食谱库说明

当前已导入 **50 道**食谱，分类规则：

| Notion 标签 | 工具内 category | 说明 |
|-------------|-----------------|------|
| Easy | 快手 | 随机抽取优先池 |
| Hard | 耗时 | 不参与随机抽取 |
| Bake | 烘焙 | 不参与随机抽取 |

- 食材份量 Notion 中未标注，统一标记为「适量」
- 每条食谱保留 `instruction`（做法）、`tags`、`craving`（想吃指数）等字段
- 主数据源：`recipes.json`，`recipes.js` 由前者同步生成

## 自定义食谱库

编辑 `recipes.json`，然后重新生成 `recipes.js`：

```bash
{ echo 'const RECIPES = '; cat recipes.json; echo ';'; } > recipes.js
```

```json
{
  "id": "unique-id",
  "name": "菜名",
  "category": "快手",
  "time": 20,
  "servings": 2,
  "ingredients": [
    { "name": "鸡蛋", "amount": 3, "unit": "个" }
  ]
}
```

- `category` 设为 `"快手"` 才会被优先抽取
- `servings` 是食谱原始份量，工具会自动换算成两人份
- 同名同单位的食材会在购物清单中自动合并
