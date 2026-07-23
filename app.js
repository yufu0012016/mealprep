const MEALS_PER_DAY = 2;
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DEFAULT_DAYS = 6;
const FULL_WEEK_DAYS = 7;
const TARGET_SERVINGS = 2;
const MEAL_SLOTS = ['午饭', '晚饭'];
const STORAGE_KEY_LAST_GENERATED = 'mealprep_last_generated_at';
const STORAGE_KEY_LAST_MENU = 'mealprep_last_menu';
const STORAGE_KEY_PERSON_ID = 'mealprep_person_id';
const STORAGE_KEY_SESSION_PERSON_ID = 'mealprep_session_person_id';
const STORAGE_KEY_COLLAB_SESSION = 'mealprep_collaborative_session';
const GENERATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FEMALE_EMOJIS = ['👩', '👩‍🦰', '👩‍🦱', '👩‍🦳', '👧', '🙋‍♀️'];

let allRecipes = [];
let weekRecipes = [];
let mealClaims = [];
let purchasedItems = new Set();
let includeSunday = false;

function getMealCount(includeSun = includeSunday) {
  return MEALS_PER_DAY * (includeSun ? FULL_WEEK_DAYS : DEFAULT_DAYS);
}

function isValidMealCount(count) {
  return count === getMealCount(false) || count === getMealCount(true);
}

function getDayLabels(includeSun = includeSunday) {
  return includeSun ? [...WEEKDAYS] : WEEKDAYS.slice(0, DEFAULT_DAYS);
}

function readIncludeSundayFromCheckbox() {
  return document.getElementById('include-sunday')?.checked ?? false;
}

function syncIncludeSundayCheckbox() {
  const checkbox = document.getElementById('include-sunday');
  if (checkbox) checkbox.checked = includeSunday;
}

function syncIncludeSundayFromMenu() {
  if (weekRecipes.length === getMealCount(true)) includeSunday = true;
  else if (weekRecipes.length === getMealCount(false)) includeSunday = false;
  syncIncludeSundayCheckbox();
  updateMealCountUi();
}

function updateGenerateModalSummary() {
  const includeSun = readIncludeSundayFromCheckbox();
  const days = includeSun ? FULL_WEEK_DAYS : DEFAULT_DAYS;
  const count = getMealCount(includeSun);
  const summary = document.getElementById('generate-modal-summary');
  if (summary) summary.textContent = `${days} 天 × 午饭 + 晚饭 · 共 ${count} 餐`;
}

function updateMealCountUi() {
  const plannedCount = weekRecipes.length || getMealCount(false);
  const stat = document.getElementById('meal-count-stat');
  const total = document.getElementById('total-meal-count');
  const emptyNote = document.getElementById('empty-meal-note');
  const emptyTitle = document.getElementById('empty-meal-title');
  if (stat) stat.textContent = plannedCount;
  if (total) total.textContent = weekRecipes.length || getMealCount(false);
  if (emptyTitle) emptyTitle.textContent = `点一下，随机抽 ${plannedCount} 道菜`;
  if (emptyNote) emptyNote.textContent = `${DEFAULT_DAYS} 天 × 午饭 + 晚饭`;
  updateGenerateModalSummary();
}

function openGenerateModal() {
  const modal = document.getElementById('generate-modal');
  const message = document.getElementById('generate-modal-message');
  const checkbox = document.getElementById('include-sunday');
  const last = getLastGeneratedAt();

  if (checkbox) checkbox.checked = false;
  includeSunday = false;

  if (message) {
    message.textContent = isWithinWeek(last)
      ? '一周内已有菜单。重新生成会替换当前菜单。'
      : '将从食谱库随机抽取本周菜单。';
  }

  updateGenerateModalSummary();
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeGenerateModal() {
  document.getElementById('generate-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function loadRecipeLibrary() {
  const base = typeof RECIPES !== 'undefined' ? RECIPES : [];
  const { merged, newRecipes } = syncRecipeLibrary(base);
  allRecipes = merged.map((r) => ensureRecipePortions(r));
  saveEnrichedRecipes(allRecipes);
  return newRecipes;
}

async function finishLoadRecipeLibrary(newRecipes) {
  if (newRecipes.length > 0) {
    setEnrichStatus(`发现 ${newRecipes.length} 道新菜，正在完善…`);
    await processNewRecipes(newRecipes, document.getElementById('enrich-progress'));
  } else {
    saveEnrichedRecipes(allRecipes);
    setEnrichStatus(`食谱库 ${allRecipes.length} 道 · 已按 50kg 两人份估算份量与热量 · 点击菜名查看`);
  }
}

async function processNewRecipes(newRecipes, progressEl) {
  if (newRecipes.length === 0) return;

  const apiKey = getApiKey();
  const apiBase = getApiBase();
  progressEl?.classList.remove('hidden');

  const enriched = await enrichNewRecipes(newRecipes, {
    apiKey,
    apiBase,
    onProgress: (msg) => {
      if (progressEl) progressEl.textContent = msg;
    },
  });

  allRecipes = [...allRecipes, ...enriched];
  saveEnrichedRecipes(allRecipes);
  document.getElementById('library-count').textContent = allRecipes.length;

  const via = apiKey ? 'AI' : '离线估算';
  setEnrichStatus(`${newRecipes.length} 道新菜已用${via}完善`);
  progressEl?.classList.add('hidden');
}

async function initApp() {
  const newRecipes = loadRecipeLibrary();
  document.getElementById('library-count').textContent = allRecipes.length;
  document.getElementById('profile-desc').textContent = NUTRITION_PROFILE.description;

  const savedKey = getApiKey();
  if (savedKey) document.getElementById('api-key').value = savedKey;
  document.getElementById('api-base').value = getApiBase();

  await finishLoadRecipeLibrary(newRecipes);
  loadSharedMenuFromUrl();
  updateRecentMenuOption();
  syncIncludeSundayCheckbox();
  updateMealCountUi();
  document.getElementById('include-sunday')?.addEventListener('change', updateGenerateModalSummary);
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
  const mealCount = getMealCount(readIncludeSundayFromCheckbox());
  const quickMeals = allRecipes.filter((r) => r.category === '快手');
  const pool = quickMeals.length >= mealCount ? quickMeals : allRecipes;
  if (pool.length < mealCount) {
    alert(`食谱库只有 ${pool.length} 道菜，无法生成 ${mealCount} 道`);
    return [];
  }
  return shuffle(pool).slice(0, mealCount);
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

function createPersonId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLocalPersonId() {
  let id = localStorage.getItem(STORAGE_KEY_PERSON_ID);
  if (!id) {
    id = createPersonId();
    localStorage.setItem(STORAGE_KEY_PERSON_ID, id);
  }
  return id;
}

function getSessionPersonId() {
  let id = sessionStorage.getItem(STORAGE_KEY_SESSION_PERSON_ID);
  if (!id) {
    id = createPersonId();
    sessionStorage.setItem(STORAGE_KEY_SESSION_PERSON_ID, id);
  }
  return id;
}

function beginCollaborativeSession() {
  sessionStorage.setItem(STORAGE_KEY_COLLAB_SESSION, '1');
  sessionStorage.removeItem(STORAGE_KEY_SESSION_PERSON_ID);
}

function clearCollaborativeSession() {
  sessionStorage.removeItem(STORAGE_KEY_COLLAB_SESSION);
  sessionStorage.removeItem(STORAGE_KEY_SESSION_PERSON_ID);
}

function getPersonId() {
  if (sessionStorage.getItem(STORAGE_KEY_COLLAB_SESSION) !== '1') {
    return getLocalPersonId();
  }

  const localId = getLocalPersonId();
  if (mealClaims.some((claim) => claim?.personId === localId)) {
    return localId;
  }
  return getSessionPersonId();
}

function getPersonEmoji(personId) {
  let hash = 0;
  for (let i = 0; i < personId.length; i++) {
    hash = (hash * 31 + personId.charCodeAt(i)) >>> 0;
  }
  return FEMALE_EMOJIS[hash % FEMALE_EMOJIS.length];
}

function getMyPerson() {
  const personId = getPersonId();
  return { personId, emoji: getPersonEmoji(personId) };
}

function isMealClaimed(index) {
  return Boolean(mealClaims[index]?.personId);
}

function isMealClaimedByMe(index) {
  return mealClaims[index]?.personId === getPersonId();
}

function canClaimMeal(index) {
  const claim = mealClaims[index];
  return !claim?.personId || claim.personId === getPersonId();
}

function normalizeMealClaims(rawClaims) {
  if (!Array.isArray(rawClaims) || rawClaims.length !== weekRecipes.length) {
    return emptyMealClaims();
  }
  return rawClaims.map((claim) =>
    claim?.personId
      ? { personId: claim.personId, emoji: claim.emoji || getPersonEmoji(claim.personId) }
      : null
  );
}

function emptyMealClaims() {
  return weekRecipes.map(() => null);
}

function getActiveRecipes() {
  return weekRecipes.filter((_, i) => isMealClaimed(i));
}

function getShopItemKey(item) {
  return item.unit === '适量' ? item.name : `${item.name}__${item.unit}`;
}

function buildShoppingList(recipes) {
  const map = new Map();

  for (const recipe of recipes) {
    for (const ing of normalizeRecipeIngredients(recipe)) {
      if (ing.pantry || !isFreshIngredient(ing.name)) continue;

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
    .map((item) => {
      const amounts = formatShoppingAmount(item);
      return {
        ...item,
        key: getShopItemKey(item),
        recipes: [...item.recipes],
        display: amounts.metric,
        displayImperial: amounts.imperial,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function dayLabels() {
  return getDayLabels(includeSunday);
}

function nutritionBadge(recipe) {
  if (!recipe.nutrition) return '';
  const n = recipe.nutrition;
  return `<span class="nutrition-badge">≈${n.caloriesPerPerson}kcal/人 · ${n.proteinGPerPerson}g蛋白</span>`;
}

function mealRowHtml(index, slot, recipe) {
  const claim = mealClaims[index];
  const claimed = Boolean(claim);
  const claimedByMe = isMealClaimedByMe(index);
  const locked = claimed && !claimedByMe;
  const emojiHtml = claim
    ? `<span class="meal-claimer" title="${locked ? '已被选' : '我的选择'}">${claim.emoji}</span>`
    : '';

  return `
    <div class="meal-pick-row ${claimed ? 'is-selected' : 'is-unselected'} ${locked ? 'is-locked' : ''}" data-meal-index="${index}">
      <label class="meal-check-wrap ${locked ? 'is-disabled' : ''}">
        <input type="checkbox" class="meal-checkbox" ${claimed ? 'checked' : ''} ${locked ? 'disabled' : ''} />
      </label>
      <span class="meal-slot">${slot}</span>
      <button type="button" class="meal-name-btn" data-meal-index="${index}" title="查看做法">
        <span class="meal-name-text">${recipe.name}</span>${emojiHtml}${nutritionBadge(recipe)}
      </button>
      <span class="meal-meta">${recipe.time} 分钟</span>
    </div>`;
}

function getRecipeByMealIndex(index) {
  return weekRecipes[index];
}

function formatIngredientAmount(ing, recipeServings = TARGET_SERVINGS) {
  if (ing.unit === '适量') return '适量';
  const amount = scaleAmount(ing.amount, recipeServings);
  return `${formatAmount(amount)} ${ing.unit}`;
}

function showRecipeModal(recipe) {
  if (!recipe) return;

  const modal = document.getElementById('recipe-modal');
  const ingredients = normalizeRecipeIngredients(recipe);
  document.getElementById('recipe-modal-title').textContent = recipe.name;
  document.getElementById('recipe-modal-meta').textContent =
    `约 ${recipe.time} 分钟 · ${TARGET_SERVINGS} 人份` +
    (recipe.nutrition ? ` · ≈${recipe.nutrition.caloriesPerPerson} kcal/人` : '');

  const ingredientsEl = document.getElementById('recipe-modal-ingredients');
  if (ingredients.length === 0) {
    ingredientsEl.innerHTML = '<li class="recipe-modal-empty">暂无食材清单</li>';
  } else {
    ingredientsEl.innerHTML = ingredients
      .map(
        (ing) =>
          `<li><span class="recipe-ing-name">${ing.name}</span><span class="recipe-ing-amount">${formatIngredientAmount(ing, recipe.servings)}</span></li>`
      )
      .join('');
  }

  const steps = resolveRecipeSteps(recipe);
  document.getElementById('recipe-modal-steps').innerHTML = steps.length
    ? steps.map((step) => `<li>${step}</li>`).join('')
    : '<li class="recipe-modal-empty">暂无做法</li>';

  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeRecipeModal() {
  document.getElementById('recipe-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
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
      const daySelected = isMealClaimed(lunchIdx) || isMealClaimed(dinnerIdx);
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

function shopItemHtml(item, purchased) {
  const imperialHtml = item.displayImperial
    ? `<span class="shop-imperial">${item.displayImperial}</span>`
    : '';
  return `
    <label class="shop-item shop-row ${purchased ? 'shop-item-purchased' : ''}" data-shop-key="${item.key}">
      <input type="checkbox" class="shop-checkbox" ${purchased ? 'checked' : ''} />
      <span class="shop-name">${item.name}</span>
      <span class="shop-amount">
        <span class="shop-metric">${item.display}</span>
        ${imperialHtml}
      </span>
    </label>`;
}

function shopListHeaderHtml() {
  return `
    <div class="shop-header shop-row" aria-hidden="true">
      <span class="shop-col-check"></span>
      <span class="shop-col-name">食材</span>
      <span class="shop-col-amount">数量</span>
    </div>`;
}

function renderShoppingList(items) {
  const container = document.getElementById('shopping-list');
  const active = getActiveRecipes();

  if (active.length === 0) {
    container.innerHTML = '<p class="empty-list">请先勾选要备的餐</p>';
    document.getElementById('shop-count').textContent = '0';
    document.getElementById('selected-meal-count').textContent = active.length;
    return;
  }

  if (items.length === 0) {
    container.innerHTML = '<p class="empty-list">所选餐次无需额外采购生鲜</p>';
    document.getElementById('shop-count').textContent = '0';
    document.getElementById('selected-meal-count').textContent = active.length;
    return;
  }

  const currentKeys = new Set(items.map((i) => i.key));
  for (const key of purchasedItems) {
    if (!currentKeys.has(key)) purchasedItems.delete(key);
  }

  const pending = items.filter((i) => !purchasedItems.has(i.key));
  const purchased = items.filter((i) => purchasedItems.has(i.key));

  let html = shopListHeaderHtml();
  if (pending.length > 0) {
    html += `<div class="shop-pending">${pending.map((i) => shopItemHtml(i, false)).join('')}</div>`;
  } else {
    html += '<p class="empty-list shop-all-done">全部买齐了 ✓</p>';
  }

  if (purchased.length > 0) {
    html += `
      <details class="shop-purchased-wrap">
        <summary class="shop-purchased-summary">已购买 (${purchased.length})</summary>
        <div class="shop-purchased">${purchased.map((i) => shopItemHtml(i, true)).join('')}</div>
      </details>`;
  }

  container.innerHTML = html;
  document.getElementById('shop-count').textContent = pending.length;
  document.getElementById('selected-meal-count').textContent = active.length;
}

function updateView() {
  renderMeals();
  renderWeekPlan();
  renderShoppingList(buildShoppingList(getActiveRecipes()));
  saveLastMenu();
  syncIncludeSundayFromMenu();
  const emojiEl = document.getElementById('my-person-emoji');
  if (emojiEl) emojiEl.textContent = getMyPerson().emoji;
}

function showResultsView() {
  document.getElementById('results').classList.remove('hidden');
  document.getElementById('empty-state').classList.add('hidden');
}

function formatGeneratedTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `今天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function loadLastMenuSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_MENU);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLastMenu() {
  if (!isValidMealCount(weekRecipes.length)) return;

  localStorage.setItem(
    STORAGE_KEY_LAST_MENU,
    JSON.stringify({
      generatedAt: getLastGeneratedAt() || Date.now(),
      includeSunday,
      recipeIds: weekRecipes.map((r) => r.id),
      mealClaims: mealClaims.map((claim) => (claim ? { ...claim } : null)),
      purchasedItems: [...purchasedItems],
    })
  );
  updateRecentMenuOption();
}

function hasRecentMenu() {
  const snap = loadLastMenuSnapshot();
  return Boolean(snap && isWithinWeek(snap.generatedAt) && isValidMealCount(snap.recipeIds?.length));
}

function updateRecentMenuOption() {
  const btn = document.getElementById('restore-menu-btn');
  const hint = document.getElementById('restore-menu-hint');
  const snap = loadLastMenuSnapshot();

  if (hasRecentMenu()) {
    btn.classList.remove('hidden');
    hint.textContent = `上次生成：${formatGeneratedTime(snap.generatedAt)}`;
    hint.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
    hint.classList.add('hidden');
  }
}

function restoreLastMenu() {
  const snap = loadLastMenuSnapshot();
  if (!hasRecentMenu()) {
    alert('一周内没有可恢复的菜单');
    updateRecentMenuOption();
    return;
  }

  try {
    applyMenuSnapshot(snap);
  } catch (e) {
    alert(e.message);
  }
}

function setAllMeals(claim) {
  const me = getMyPerson();
  mealClaims = mealClaims.map((existing) => {
    if (claim) {
      return existing || { ...me };
    }
    return existing?.personId === me.personId ? null : existing;
  });
  updateView();
}

function onMealCheckboxChange(index, checked) {
  if (!canClaimMeal(index) && checked) return;

  if (checked) {
    mealClaims[index] = { ...getMyPerson() };
  } else if (isMealClaimedByMe(index)) {
    mealClaims[index] = null;
  }
  updateView();
}

function getLastGeneratedAt() {
  const raw = localStorage.getItem(STORAGE_KEY_LAST_GENERATED);
  return raw ? Number(raw) : null;
}

function saveLastGeneratedAt(timestamp = Date.now()) {
  localStorage.setItem(STORAGE_KEY_LAST_GENERATED, String(timestamp));
}

function getMenuSnapshot() {
  return {
    generatedAt: getLastGeneratedAt() || Date.now(),
    includeSunday,
    recipeIds: weekRecipes.map((r) => r.id),
    mealClaims: mealClaims.map((claim) => (claim ? { ...claim } : null)),
    purchasedItems: [...purchasedItems],
  };
}

function encodeSharePayload(snapshot) {
  const json = JSON.stringify(snapshot);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeSharePayload(encoded) {
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

function buildShareUrl(snapshot) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('menu', encodeSharePayload(snapshot));
  return url.toString();
}

function applyMenuSnapshot(snap, { fromShare = false } = {}) {
  const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));
  const restored = snap.recipeIds.map((id) => recipeMap.get(id));
  const mealCount = snap.recipeIds.length;

  if (!isValidMealCount(mealCount) || restored.length !== mealCount || restored.some((r) => !r)) {
    throw new Error('食谱库版本不一致，无法加载该菜单');
  }

  if (fromShare) {
    beginCollaborativeSession();
  } else {
    clearCollaborativeSession();
  }

  includeSunday = snap.includeSunday ?? mealCount === getMealCount(true);
  weekRecipes = restored;
  mealClaims =
    snap.mealClaims?.length === mealCount
      ? normalizeMealClaims(snap.mealClaims)
      : emptyMealClaims();
  purchasedItems = new Set(snap.purchasedItems || []);
  saveLastGeneratedAt(snap.generatedAt || Date.now());
  syncIncludeSundayCheckbox();
  updateView();
  showResultsView();
}

function loadSharedMenuFromUrl() {
  const encoded = new URLSearchParams(window.location.search).get('menu');
  if (!encoded) return false;

  try {
    applyMenuSnapshot(decodeSharePayload(encoded), { fromShare: true });
    history.replaceState({}, '', window.location.pathname);
    setEnrichStatus('已打开分享的菜单');
    return true;
  } catch (e) {
    alert(`无法加载分享菜单：${e.message}`);
    history.replaceState({}, '', window.location.pathname);
    return false;
  }
}

function shareMenu() {
  if (!isValidMealCount(weekRecipes.length)) {
    alert('请先生成菜单');
    return;
  }

  const url = buildShareUrl(getMenuSnapshot());
  navigator.clipboard.writeText(url);

  const btn = document.getElementById('share-btn');
  btn.textContent = '链接已复制 ✓';
  setTimeout(() => (btn.textContent = '分享菜单'), 2000);
}

function setEnrichStatus(text) {
  const el = document.getElementById('enrich-status');
  if (el) el.textContent = text;
}

function isWithinWeek(timestamp) {
  return timestamp && Date.now() - timestamp < GENERATION_WINDOW_MS;
}

function doGenerate() {
  clearCollaborativeSession();
  includeSunday = readIncludeSundayFromCheckbox();
  weekRecipes = pickRecipes();
  if (weekRecipes.length === 0) return;

  mealClaims = emptyMealClaims();
  purchasedItems.clear();
  saveLastGeneratedAt();
  updateView();
  showResultsView();
}

function generate() {
  openGenerateModal();
}

function copyShoppingList() {
  const active = getActiveRecipes();
  const items = buildShoppingList(active).filter((i) => !purchasedItems.has(i.key));
  const mealNames = active.map((r) => r.name).join('、');
  const text = items.length
    ? items
        .map((i) => {
          const us = i.displayImperial ? ` (${i.displayImperial})` : '';
          return `☐ ${i.name}  ${i.display}${us}`;
        })
        .join('\n')
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

function toggleSettings(show) {
  document.getElementById('settings-panel').classList.toggle('hidden', !show);
}

async function runEnrichSteps() {
  const btn = document.getElementById('enrich-steps-btn');
  const progress = document.getElementById('enrich-progress');
  const apiKey = document.getElementById('api-key').value.trim();
  const apiBase = document.getElementById('api-base').value.trim() || 'https://api.openai.com/v1';

  if (!apiKey) {
    alert('请先在设置中填入 OpenAI API Key');
    toggleSettings(true);
    return;
  }

  saveApiSettings(apiKey, apiBase);
  btn.disabled = true;
  progress.classList.remove('hidden');

  try {
    allRecipes = await enrichMissingStepsWithAI(allRecipes, {
      apiKey,
      apiBase,
      onProgress: (msg) => {
        progress.textContent = msg;
      },
    });
    saveEnrichedRecipes(allRecipes);
    document.getElementById('library-count').textContent = allRecipes.length;
    setEnrichStatus('AI 已为全部菜谱生成简易做法');
    if (weekRecipes.length) updateView();
  } catch (e) {
    alert(`生成失败：${e.message}`);
  } finally {
    btn.disabled = false;
    progress.classList.add('hidden');
  }
}

document.getElementById('generate-btn').addEventListener('click', generate);
document.getElementById('generate-confirm-btn').addEventListener('click', () => {
  closeGenerateModal();
  doGenerate();
});
document.getElementById('generate-cancel-btn').addEventListener('click', closeGenerateModal);
document.getElementById('generate-modal-close').addEventListener('click', closeGenerateModal);
document.getElementById('generate-modal-backdrop').addEventListener('click', closeGenerateModal);
document.getElementById('restore-menu-btn').addEventListener('click', restoreLastMenu);
document.getElementById('share-btn').addEventListener('click', shareMenu);
document.getElementById('copy-btn').addEventListener('click', copyShoppingList);
document.getElementById('print-btn').addEventListener('click', printPage);
document.getElementById('select-all-btn').addEventListener('click', () => setAllMeals(true));
document.getElementById('select-none-btn').addEventListener('click', () => setAllMeals(false));
document.getElementById('settings-btn').addEventListener('click', () => toggleSettings(true));
document.getElementById('settings-close').addEventListener('click', () => toggleSettings(false));
document.getElementById('save-settings-btn').addEventListener('click', () => {
  saveApiSettings(
    document.getElementById('api-key').value.trim(),
    document.getElementById('api-base').value.trim()
  );
  toggleSettings(false);
});
document.getElementById('enrich-steps-btn').addEventListener('click', runEnrichSteps);
document.getElementById('export-recipes-btn').addEventListener('click', () => downloadRecipesJson(allRecipes));
document.getElementById('reset-recipes-btn').addEventListener('click', async () => {
  if (confirm('清除本地完善记录？')) {
    clearEnrichedRecipes();
    const newRecipes = loadRecipeLibrary();
    document.getElementById('library-count').textContent = allRecipes.length;
    await finishLoadRecipeLibrary(newRecipes);
  }
});

document.getElementById('recipe-modal-close').addEventListener('click', closeRecipeModal);
document.getElementById('recipe-modal-backdrop').addEventListener('click', closeRecipeModal);

document.getElementById('results').addEventListener('click', (e) => {
  const nameBtn = e.target.closest('.meal-name-btn');
  if (nameBtn) {
    showRecipeModal(getRecipeByMealIndex(Number(nameBtn.dataset.mealIndex)));
    return;
  }
});

document.getElementById('results').addEventListener('change', (e) => {
  const row = e.target.closest('[data-meal-index]');
  if (row && e.target.classList.contains('meal-checkbox')) {
    onMealCheckboxChange(Number(row.dataset.mealIndex), e.target.checked);
    return;
  }

  const shopRow = e.target.closest('[data-shop-key]');
  if (shopRow && e.target.classList.contains('shop-checkbox')) {
    const key = shopRow.dataset.shopKey;
    if (e.target.checked) purchasedItems.add(key);
    else purchasedItems.delete(key);
    renderShoppingList(buildShoppingList(getActiveRecipes()));
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('generate-modal').classList.contains('hidden')) {
    closeGenerateModal();
    return;
  }
  closeRecipeModal();
});

initApp();
