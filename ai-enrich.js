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

function syncRecipeLibrary(baseRecipes) {
  const base = baseRecipes || [];
  const baseIds = new Set(base.map((r) => r.id));
  const cached = (loadEnrichedRecipes() || []).filter((r) => baseIds.has(r.id));
  const cachedMap = new Map(cached.map((r) => [r.id, r]));

  const merged = [];
  const newRecipes = [];

  for (const recipe of base) {
    if (cachedMap.has(recipe.id)) {
      merged.push(cachedMap.get(recipe.id));
    } else {
      newRecipes.push(recipe);
    }
  }

  return { merged, newRecipes };
}

function buildEnrichPrompt(recipe) {
  const p = NUTRITION_PROFILE;
  return `你是专业营养师兼家庭烹饪顾问。请为以下食谱补充精确食材份量和简易做法。

【用餐对象】${p.people} 名 ${p.weightKg}kg、${p.activity} 的女性，一起吃一顿（${p.description}）
【食谱名称】${recipe.name}
【现有做法参考】${recipe.instruction || '无'}
【现有食材】${recipe.ingredients.map((i) => i.name).join('、')}

要求：
1. servings 固定为 2（两人一份餐）
2. 每人每餐蛋白质尽量 30–40g，碳水 80–110g，蔬菜充足，总热量约 850–1000 kcal/人
3. 肉类用 g，蔬菜用 g，鸡蛋用「个」，液体用 ml；尽量不用「适量」
4. 调料标记 pantry: true；生鲜标记 pantry: false
5. steps 写 4–6 步简易快手流程，每步一句话，适合厨房新手

只返回 JSON，不要 markdown：
{
  "ingredients": [{"name":"...", "amount":数字, "unit":"g|ml|个|...", "pantry":false}],
  "steps": ["步骤1", "步骤2"],
  "nutrition": {"proteinGPerPerson":数字, "caloriesPerPerson":数字, "note":"一句话说明"}
}`;
}

function buildStepsPrompt(recipe) {
  return `为快手正餐「${recipe.name}」写简易做法（两人份，4–6 步，每步一句，清晰可操作）。
参考食材：${recipe.ingredients.map((i) => i.name).join('、')}
${recipe.instruction ? `参考原文：${recipe.instruction}` : ''}

只返回 JSON：{"steps":["步骤1","步骤2"]}`;
}

function parseAiJson(text) {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

async function callOpenAI(apiKey, apiBase, messages) {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 返回为空');
  return content;
}

async function generateStepsWithAI(recipe, apiKey, apiBase) {
  const content = await callOpenAI(apiKey, apiBase, [
    { role: 'system', content: '你只输出合法 JSON。' },
    { role: 'user', content: buildStepsPrompt(recipe) },
  ]);
  const parsed = parseAiJson(content);
  return {
    ...recipe,
    steps: parsed.steps?.length ? parsed.steps : resolveRecipeSteps(recipe),
    stepsAi: true,
  };
}

async function enrichRecipeWithAI(recipe, apiKey, apiBase) {
  const content = await callOpenAI(apiKey, apiBase, [
    { role: 'system', content: '你只输出合法 JSON，用于膳食份量与做法。' },
    { role: 'user', content: buildEnrichPrompt(recipe) },
  ]);

  const parsed = parseAiJson(content);
  return {
    ...recipe,
    servings: 2,
    ingredients: parsed.ingredients.map((i) => ({
      ...i,
      pantry: Boolean(i.pantry) || isPantryItem(i.name),
    })),
    steps: parsed.steps?.length ? parsed.steps : resolveRecipeSteps(recipe),
    nutrition: parsed.nutrition,
    enriched: true,
    enrichedBy: 'ai',
    stepsAi: true,
  };
}

async function enrichNewRecipe(recipe, { apiKey, apiBase, onProgress }) {
  onProgress?.(`AI 完善中：${recipe.name}…`);

  if (apiKey) {
    try {
      return await enrichRecipeWithAI(recipe, apiKey, apiBase);
    } catch (e) {
      console.warn(`AI 失败 ${recipe.name}:`, e);
      onProgress?.(`AI 失败，改用离线估算：${recipe.name}`);
    }
  }

  return heuristicEnrichRecipe(recipe);
}

async function enrichNewRecipes(recipes, { apiKey, apiBase, onProgress }) {
  const results = [];
  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    onProgress?.(
      apiKey
        ? `AI 完善新菜 ${i + 1}/${recipes.length}：${recipe.name}`
        : `离线估算新菜 ${i + 1}/${recipes.length}：${recipe.name}`
    );
    results.push(await enrichNewRecipe(recipe, { apiKey, apiBase, onProgress }));
    if (apiKey && i < recipes.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return results;
}

async function enrichMissingStepsWithAI(recipes, { apiKey, apiBase, onProgress }) {
  const results = [];
  const missing = recipes.filter((r) => !r.stepsAi);

  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    if (recipe.stepsAi) {
      results.push({ ...recipe, steps: resolveRecipeSteps(recipe) });
      continue;
    }

    onProgress?.(`生成做法 ${i + 1}/${recipes.length}：${recipe.name}`);
    try {
      results.push(await generateStepsWithAI(recipe, apiKey, apiBase));
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      console.warn(`做法生成失败 ${recipe.name}:`, e);
      results.push({ ...recipe, steps: resolveRecipeSteps(recipe) });
    }
  }

  return results;
}

function parseIngredientLines(text) {
  return text
    .split(/[\n,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, amount: 1, unit: '适量' }));
}

function createRecipeDraft({ name, instruction, ingredientsText, category, time }) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('请填写菜名');

  const ingredients = parseIngredientLines(ingredientsText);
  if (ingredients.length === 0) throw new Error('请至少填写一种食材');

  return {
    id: `custom-${Date.now().toString(36)}`,
    name: trimmed,
    category: category || '快手',
    time: Number(time) || 25,
    servings: 2,
    tags: ['Easy'],
    craving: 1.0,
    instruction: instruction.trim(),
    ingredients,
    source: 'custom',
  };
}

function downloadRecipesJson(recipes, filename = 'recipes-enriched.json') {
  const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
