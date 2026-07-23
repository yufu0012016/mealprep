const MEALS_PER_DAY = 2;
const DAYS = 7;
const MEAL_COUNT = MEALS_PER_DAY * DAYS;
const TARGET_SERVINGS = 2;
const MEAL_SLOTS = ['午饭', '晚饭'];

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
  /肉|鸡|鸭|猪|牛|羊|排骨|虾|蟹|鱼|贝|章|蛤|蚝|翅|腿|腩|丝|馅|肠|培根|海鲜|蛋|豆腐|豆乳|豆浆|菜|瓜|茄|椒|葱|蒜|姜|菇|菌|萝卜|土豆|番茄|西兰|包菜|甘蓝|羽衣|生菜|沙拉|菠菜|黄瓜|胡萝卜|洋葱|苹果|柠檬|百香果|薄荷|香菜|罗勒|basil|牛油果|南瓜|红薯|玉米|豌豆|青豆|豆芽|白菜|西葫芦|杏鲍菇|口蘑|蘑菇|香菇|奶酪|马苏里|cottage|欧芹|枸杞|红枣|椰子|饺子|香肠|火腿|裙带|海带|章鱼|扇贝|虾仁|三文鱼|巴沙/i;

let allRecipes = [];
let weekRecipes = [];
let checkedMeals = [];

async function loadRecipes() {
  allRecipes = typeof RECIPES !== 'undefined' ? RECIPES : [];
  document.getElementById('library-count').textContent = allRecipes.length;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRecipes() {
  const quickMeals = allRecipes.filter((r) => r.category === '快手');
  const pool = quickMeals.length >= MEAL_COUNT ? quickMeals : allRecipes;
  if (pool.length < MEAL_COUNT) {
    alert(`食谱库只有 ${pool.length} 道菜，无法生成 ${MEAL_COUNT} 道（需要 ${MEAL_COUNT} 道）`);
    return [];
  }
  return shuffle(pool).slice(0, MEAL_COUNT);
}

function isPantryItem(name) {
  const trimmed = name.trim();
  return PANTRY.has(trimmed) || PANTRY.has(trimmed.toLowerCase());
}

function isFreshIngredient(name) {
  const trimmed = name.trim();
  if (FRESH_PATTERN.test(trimmed)) return true;
  return !isPantryItem(trimmed);
}

function scaleAmount(amount, recipeServings) {
  const factor = TARGET_SERVINGS / recipeServings;
  return Math.round(amount * factor * 100) / 100;
}

function formatAmount(amount) {
  if (Number.isInteger(amount) || amount === Math.floor(amount)) {
    return String(Math.round(amount));
  }
  return String(amount);
}

function getActiveRecipes() {
  return weekRecipes.filter((_, i) => checkedMeals[i]);
}

function buildShoppingList(recipes) {
  const map = new Map();

  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      if (!isFreshIngredient(ing.name)) continue;

      const isFlexible = ing.unit === '适量';
      const key = isFlexible ? ing.name : `${ing.name}__${ing.unit}`;
      const scaled = isFlexible ? 1 : scaleAmount(ing.amount, recipe.servings);
      if (map.has(key)) {
        const item = map.get(key);
        if (!isFlexible) item.amount += scaled;
        item.recipes.add(recipe.name);
      } else {
        map.set(key, {
          name: ing.name,
          unit: ing.unit,
          amount: scaled,
          recipes: new Set([recipe.name]),
        });
      }
    }
  }

  return [...map.values()]
    .map((item) => ({
      ...item,
      recipes: [...item.recipes],
      display: item.unit === '适量' ? '适量' : `${formatAmount(item.amount)} ${item.unit}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function dayLabels() {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
}

function mealRowHtml(index, slot, recipe) {
  const checked = checkedMeals[index];
  return `
    <label class="meal-pick-row ${checked ? 'is-selected' : 'is-unselected'}" data-meal-index="${index}">
      <input type="checkbox" class="meal-checkbox" ${checked ? 'checked' : ''} />
      <span class="meal-slot">${slot}</span>
      <span class="meal-name">${recipe.name}</span>
      <span class="meal-meta">${recipe.time} 分钟</span>
    </label>`;
}

function renderMeals() {
  const container = document.getElementById('meals-list');
  const days = dayLabels();

  container.innerHTML = days
    .map((day, dayIndex) => {
      const lunchIdx = dayIndex * 2;
      const dinnerIdx = dayIndex * 2 + 1;
      const lunch = weekRecipes[lunchIdx];
      const dinner = weekRecipes[dinnerIdx];
      const daySelected = checkedMeals[lunchIdx] || checkedMeals[dinnerIdx];
      return `
    <div class="day-card sketch-box ${daySelected ? 'day-has-selected' : 'day-none-selected'}">
      <h3 class="day-title">${day}</h3>
      <div class="day-meals">
        ${mealRowHtml(lunchIdx, MEAL_SLOTS[0], lunch)}
        ${mealRowHtml(dinnerIdx, MEAL_SLOTS[1], dinner)}
      </div>
    </div>`;
    })
    .join('');
}

function renderWeekPlan() {
  const days = dayLabels();
  const container = document.getElementById('week-plan');

  container.innerHTML = days
    .map((day, dayIndex) => {
      const lunchIdx = dayIndex * 2;
      const dinnerIdx = dayIndex * 2 + 1;
      return `
    <div class="plan-day-group">
      <div class="plan-day-header">${day}</div>
      ${mealRowHtml(lunchIdx, MEAL_SLOTS[0], weekRecipes[lunchIdx])}
      ${mealRowHtml(dinnerIdx, MEAL_SLOTS[1], weekRecipes[dinnerIdx])}
    </div>`;
    })
    .join('');
}

function renderShoppingList(items) {
  const container = document.getElementById('shopping-list');
  const active = getActiveRecipes();

  if (active.length === 0) {
    container.innerHTML = '<p class="empty-list">请先勾选要备的餐</p>';
  } else if (items.length === 0) {
    container.innerHTML = '<p class="empty-list">所选餐次无需额外采购生鲜</p>';
  } else {
    container.innerHTML = items
      .map(
        (item) => `
    <label class="shop-item">
      <input type="checkbox" class="shop-checkbox" />
      <span class="shop-name">${item.name}</span>
      <span class="shop-amount">${item.display}</span>
    </label>`
      )
      .join('');
  }

  document.getElementById('shop-count').textContent = items.length;
  document.getElementById('selected-meal-count').textContent = active.length;
}

function updateView() {
  renderMeals();
  renderWeekPlan();
  renderShoppingList(buildShoppingList(getActiveRecipes()));
}

function setAllMeals(checked) {
  checkedMeals = weekRecipes.map(() => checked);
  updateView();
}

function onMealCheckboxChange(index, checked) {
  checkedMeals[index] = checked;
  updateView();
}

function generate() {
  weekRecipes = pickRecipes();
  if (weekRecipes.length === 0) return;

  checkedMeals = weekRecipes.map(() => true);
  updateView();

  document.getElementById('results').classList.remove('hidden');
  document.getElementById('empty-state').classList.add('hidden');
}

function copyShoppingList() {
  const active = getActiveRecipes();
  const items = buildShoppingList(active);
  const mealNames = active.map((r) => r.name).join('、');
  const text = items.length
    ? items.map((i) => `☐ ${i.name}  ${i.display}`).join('\n')
    : '（无生鲜采购）';
  navigator.clipboard.writeText(
    `备餐生鲜清单（${TARGET_SERVINGS} 人份 · 调料自备）\n` +
      `共 ${active.length} 餐：${mealNames}\n\n${text}`
  );
  const btn = document.getElementById('copy-btn');
  btn.textContent = '已复制 ✓';
  setTimeout(() => (btn.textContent = '复制清单'), 2000);
}

function printPage() {
  window.print();
}

document.getElementById('generate-btn').addEventListener('click', generate);
document.getElementById('copy-btn').addEventListener('click', copyShoppingList);
document.getElementById('print-btn').addEventListener('click', printPage);
document.getElementById('select-all-btn').addEventListener('click', () => setAllMeals(true));
document.getElementById('select-none-btn').addEventListener('click', () => setAllMeals(false));

document.getElementById('results').addEventListener('change', (e) => {
  const row = e.target.closest('[data-meal-index]');
  if (!row || !e.target.classList.contains('meal-checkbox')) return;
  const index = Number(row.dataset.mealIndex);
  onMealCheckboxChange(index, e.target.checked);
});

loadRecipes();
