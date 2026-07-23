const STORAGE_KEY_API = 'mealprep_openai_key';
const STORAGE_KEY_BASE = 'mealprep_api_base';
const STORAGE_KEY_ENRICHED = 'mealprep_enriched_recipes';

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY_API) || '';
}

function getApiBase() {
  return localStorage.getItem(STORAGE_KEY_BASE) || 'https://api.openai.com/v1';
}

function saveApiSettings(key, base) {
  if (key) localStorage.setItem(STORAGE_KEY_API, key);
  else localStorage.removeItem(STORAGE_KEY_API);
  if (base) localStorage.setItem(STORAGE_KEY_BASE, base);
}

function loadEnrichedRecipes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENRICHED);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveEnrichedRecipes(recipes) {
  localStorage.setItem(STORAGE_KEY_ENRICHED, JSON.stringify(recipes));
}

function clearEnrichedRecipes() {
  localStorage.removeItem(STORAGE_KEY_ENRICHED);
}

function buildEnrichPrompt(recipe) {
  const p = NUTRITION_PROFILE;
  return `你是专业营养师兼家庭烹饪顾问。请为以下食谱补充精确食材份量。

【用餐对象】${p.people} 名 ${p.weightKg}kg、${p.activity} 的女性，一起吃一顿（${p.description}）
【食谱名称】${recipe.name}
【做法】${recipe.instruction || '无'}
【现有食材】${recipe.ingredients.map((i) => i.name).join('、')}

要求：
1. servings 固定为 2（两人一份餐）
2. 每人每餐蛋白质尽量 30–40g，碳水 80–110g，蔬菜充足，总热量约 850–1000 kcal/人
3. 肉类用 g，蔬菜用 g，鸡蛋用「个」，液体用 ml；尽量不用「适量」
4. 调料（盐糖酱醋油淀粉香料等）标记 pantry: true，给大致用量即可
5. 生鲜标记 pantry: false

只返回 JSON，不要 markdown：
{
  "ingredients": [{"name":"...", "amount":数字, "unit":"g|ml|个|...", "pantry":false}],
  "nutrition": {"proteinGPerPerson":数字, "caloriesPerPerson":数字, "note":"一句话说明"}
}`;
}

function parseAiJson(text) {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

async function enrichRecipeWithAI(recipe, apiKey, apiBase) {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: '你只输出合法 JSON，用于膳食份量计算。' },
        { role: 'user', content: buildEnrichPrompt(recipe) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 返回为空');

  const parsed = parseAiJson(content);
  return {
    ...recipe,
    servings: 2,
    ingredients: parsed.ingredients.map((i) => ({
      ...i,
      pantry: Boolean(i.pantry) || isPantryItem(i.name),
    })),
    nutrition: parsed.nutrition,
    enriched: true,
    enrichedBy: 'ai',
  };
}

async function enrichAllRecipes(recipes, { apiKey, apiBase, onProgress, useAi }) {
  const results = [];
  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    onProgress?.({ current: i + 1, total: recipes.length, name: recipe.name });

    if (useAi && apiKey) {
      try {
        results.push(await enrichRecipeWithAI(recipe, apiKey, apiBase));
        await new Promise((r) => setTimeout(r, 400));
        continue;
      } catch (e) {
        console.warn(`AI 失败 ${recipe.name}:`, e);
      }
    }
    results.push(heuristicEnrichRecipe(recipe));
  }
  return results;
}

function downloadRecipesJson(recipes, filename = 'recipes-enriched.json') {
  const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
