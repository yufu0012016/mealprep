const NUTRITION_PROFILE = {
  people: 2,
  weightKg: 50,
  activity: '经常运动',
  mealsPerDay: 2,
  perPersonPerMeal: {
    calories: [850, 1000],
    proteinG: [30, 40],
    carbsG: [80, 110],
    vegG: [150, 250],
  },
  description: '2 名 50kg、经常运动女生 · 每人每餐约 850–1000 kcal · 蛋白质 30–40g',
};

const PANTRY = new Set([
  '盐', '糖', '生抽', '老抽', '蚝油', '味增', '酱油', '醋', '香醋', '巴萨米克醋', '果醋', '黑醋',
  '料酒', '味淋', '香油', '食用油', '橄榄油', '黄油', '奶油', '淡奶油',
  '花生酱', '麻酱', '豆瓣酱', '韩国辣酱', '辣酱', '番茄酱', '番茄膏',
  '咖喱', '咖喱粉', '孜然粉', '辣椒粉', '胡椒粉', '黑胡椒', '白胡椒粉',
  '大蒜粉', '洋葱粉', '甜椒粉', '姜黄', '花椒粉', '五香粉',
  '淀粉', '玉米淀粉', '白芝麻', '蜂蜜', '辣蜂蜜', '冰糖', '白糖',
  '米酒', '白葡萄酒', '鱼露', '美乃滋', '青酱', '关东煮酱汁', '木鱼花',
  '高汤', 'dashi', '丁香', '八角', '香叶', '干辣椒', '小米辣', '泡椒',
  '米饭', '隔夜米饭', '面条', '粉丝', '意面', 'rigatoni', '面粉', '酵母',
  '干菌', '海苔', '白豆', '果酱',
]);

const FRESH_PATTERN =
  /肉|鸡|鸭|猪|牛|羊|排骨|虾|蟹|鱼|贝|章|蛤|蚝|翅|腿|腩|丝|馅|肠|培根|海鲜|蛋|豆腐|豆乳|豆浆|菜|瓜|茄|椒|葱|蒜|姜|菇|菌|萝卜|土豆|番茄|西兰|包菜|甘蓝|羽衣|生菜|沙拉|菠菜|黄瓜|胡萝卜|洋葱|苹果|柠檬|百香果|薄荷|香菜|罗勒|basil|牛油果|南瓜|红薯|玉米|豌豆|青豆|豆芽|白菜|西葫芦|杏鲍菇|口蘑|蘑菇|香菇|奶酪|马苏里|cottage|欧芹|枸杞|红枣|椰子|饺子|香肠|火腿|裙带|海带|章鱼|扇贝|虾仁|三文鱼|巴沙|羊肚|蛤蜊/i;

function isPantryItem(name) {
  const trimmed = name.trim();
  return PANTRY.has(trimmed) || PANTRY.has(trimmed.toLowerCase());
}

function isFreshIngredient(name) {
  const trimmed = name.trim();
  if (FRESH_PATTERN.test(trimmed)) return true;
  return !isPantryItem(trimmed);
}

function inferIngredientPortion(name) {
  const n = name.trim();

  if (/三文鱼|巴沙|鳕鱼|鲈鱼/.test(n)) return { amount: 320, unit: 'g' };
  if (/虾|虾仁/.test(n)) return { amount: 300, unit: 'g' };
  if (/扇贝|蛤蜊|生蚝|章鱼|海鲜/.test(n)) return { amount: 350, unit: 'g' };
  if (/鱼/.test(n)) return { amount: 300, unit: 'g' };

  if (/排骨/.test(n)) return { amount: 400, unit: 'g' };
  if (/牛肋|牛腩|牛肉|牛/.test(n)) return { amount: 280, unit: 'g' };
  if (/猪里脊|猪/.test(n)) return { amount: 260, unit: 'g' };
  if (/鸡腿|鸡|鸡肉/.test(n)) return { amount: 400, unit: 'g' };
  if (/培根|香肠|火腿/.test(n)) return { amount: 120, unit: 'g' };
  if (/肉|馅|丝/.test(n)) return { amount: 280, unit: 'g' };

  if (/蛋/.test(n) && !/豆瓣/.test(n)) return { amount: 4, unit: '个' };
  if (/豆腐|豆乳|豆浆/.test(n)) return { amount: 350, unit: 'g' };
  if (/奶酪|马苏里|cottage/i.test(n)) return { amount: 80, unit: 'g' };

  if (/米饭|rigatoni|意面|面|年糕|饺子/.test(n)) return { amount: 200, unit: 'g' };
  if (/粉丝/.test(n)) return { amount: 80, unit: 'g' };

  if (/土豆|红薯|南瓜/.test(n)) return { amount: 350, unit: 'g' };
  if (/番茄/.test(n)) return { amount: 300, unit: 'g' };
  if (/西兰花|包菜|甘蓝|羽衣|菠菜|生菜|沙拉菜|蔬菜|小白菜/.test(n)) return { amount: 400, unit: 'g' };
  if (/胡萝卜|黄瓜|西葫芦|彩椒|青椒|洋葱|葱|蒜|姜/.test(n)) return { amount: 150, unit: 'g' };
  if (/蘑菇|口蘑|香菇|杏鲍菇|鸡油菌|菌/.test(n)) return { amount: 200, unit: 'g' };
  if (/牛油果/.test(n)) return { amount: 2, unit: '个' };
  if (/苹果|柠檬|百香果/.test(n)) return { amount: 2, unit: '个' };
  if (/椰子水/.test(n)) return { amount: 500, unit: 'ml' };
  if (/椰子/.test(n)) return { amount: 200, unit: 'g' };
  if (/板栗|栗子/.test(n)) return { amount: 150, unit: 'g' };
  if (/玉米/.test(n)) return { amount: 1, unit: '根' };
  if (/豌豆|青豆|豆芽/.test(n)) return { amount: 150, unit: 'g' };
  if (/海苔|裙带|海带/.test(n)) return { amount: 30, unit: 'g' };
  if (/羊肚菌/.test(n)) return { amount: 30, unit: 'g' };
  if (/罗勒|薄荷|香菜|欧芹/.test(n)) return { amount: 20, unit: 'g' };
  if (/枸杞|红枣/.test(n)) return { amount: 15, unit: 'g' };

  if (isPantryItem(n)) return { amount: 1, unit: '适量', pantry: true };
  return { amount: 200, unit: 'g' };
}

function resolveRecipeSteps(recipe) {
  if (recipe.steps?.length) return recipe.steps;

  const ins = recipe.instruction?.trim();
  if (ins && ins.length > 8 && !/详见|链接|http/i.test(ins)) {
    return ins
      .split(/[。；!\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
  }

  const ing =
    recipe.ingredients
      ?.filter((i) => !i.pantry && isFreshIngredient(i.name))
      .map((i) => i.name)
      .slice(0, 5)
      .join('、') || '';

  return [
    `备好${recipe.name}所需材料${ing ? `：${ing}` : ''}`,
    '主食材洗净切块，肉类可提前略腌',
    '热锅少油，按先硬后软顺序下料翻炒或煮制',
    '加入调料，中火煮至熟透并收汁',
    '装盘即可，两人份一起享用',
  ];
}

function heuristicEnrichRecipe(recipe) {
  const ingredients = recipe.ingredients.map((ing) => {
    if (ing.pantry || isPantryItem(ing.name)) {
      return { ...ing, pantry: true, unit: ing.unit || '适量' };
    }
    if (ing.unit && ing.unit !== '适量') {
      return { ...ing, pantry: false };
    }
    const portion = inferIngredientPortion(ing.name);
    return {
      name: ing.name,
      amount: portion.amount,
      unit: portion.unit,
      pantry: portion.pantry || false,
    };
  });

  return {
    ...recipe,
    servings: NUTRITION_PROFILE.people,
    ingredients,
    steps: resolveRecipeSteps(recipe),
    enriched: true,
    enrichedBy: 'heuristic',
    nutrition: estimateNutrition(ingredients),
  };
}

function estimateNutrition(ingredients) {
  let protein = 0;
  let calories = 0;
  const fresh = ingredients.filter((i) => !i.pantry && isFreshIngredient(i.name));

  for (const ing of fresh) {
    const n = ing.name;
    const a = ing.amount || 1;
    if (/肉|鸡|猪|牛|羊|排骨|馅|丝|培根|肠|火腿/.test(n)) {
      protein += a * 0.2;
      calories += a * 1.6;
    } else if (/鱼|虾|蟹|贝|海鲜|三文鱼|扇贝/.test(n)) {
      protein += a * 0.18;
      calories += a * 1.2;
    } else if (/蛋/.test(n)) {
      protein += a * 6;
      calories += a * 70;
    } else if (/豆腐|豆乳/.test(n)) {
      protein += a * 0.08;
      calories += a * 0.8;
    } else if (/米饭|面|粉丝|意面|rigatoni|年糕/.test(n)) {
      calories += a * 1.3;
    } else if (/土豆|红薯|南瓜|玉米/.test(n)) {
      calories += a * 0.9;
    } else if (/菜|瓜|茄|菇|菌|萝卜|番茄|西兰|包菜|甘蓝|菠菜|黄瓜|胡萝卜|洋葱|生菜/.test(n)) {
      calories += a * 0.3;
    } else if (/奶酪|马苏里|cottage/i.test(n)) {
      protein += a * 0.25;
      calories += a * 2.5;
    } else if (/牛油果/.test(n)) {
      calories += a * 160;
    }
  }

  const perPerson = NUTRITION_PROFILE.people;
  return {
    proteinGPerPerson: Math.round(protein / perPerson),
    caloriesPerPerson: Math.round(calories / perPerson),
    note: '估算值，AI 完善后更准确',
  };
}

function heuristicEnrichAll(recipes) {
  return recipes.map(heuristicEnrichRecipe);
}
