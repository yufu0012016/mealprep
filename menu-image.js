const MENU_IMAGE_COLORS = {
  paper: '#faf6ef',
  paperLine: 'rgba(180, 170, 150, 0.22)',
  pencil: '#2b2b2b',
  pencilLight: '#6b6b6b',
  pencilFaint: '#a8a098',
  sketchRed: '#cc4444',
  sketchBlue: '#446688',
  highlight: 'rgba(255, 240, 200, 0.75)',
  cardBg: 'rgba(255, 252, 247, 0.95)',
};

function wrapCanvasText(ctx, text, maxWidth) {
  const chars = [...text];
  const lines = [];
  let line = '';

  for (const char of chars) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawSketchRect(ctx, x, y, width, height, options = {}) {
  const { fill = null, stroke = MENU_IMAGE_COLORS.pencil, lineWidth = 2 } = options;
  const radius = 12;

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawPaperBackground(ctx, width, height) {
  ctx.fillStyle = MENU_IMAGE_COLORS.paper;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = MENU_IMAGE_COLORS.paperLine;
  ctx.lineWidth = 1;
  for (let y = 36; y < height; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

async function ensureMenuImageFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load('700 42px Caveat'),
    document.fonts.load('400 20px "Patrick Hand"'),
    document.fonts.load('400 18px "PingFang SC"'),
  ]);
  await document.fonts.ready;
}

function formatMenuImageDate(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function estimateMealRowHeight(ctx, recipeName, rowWidth) {
  const nameMaxWidth = rowWidth - 150;
  const nameLines = wrapCanvasText(ctx, recipeName, nameMaxWidth).slice(0, 2);
  return nameLines.length > 1 ? 42 : 30;
}

function buildMenuImageLayout(ctx, { days, weekRecipes, mealSlots }) {
  const contentWidth = 760 - 104;
  const rowWidth = contentWidth - 32;
  const dayBlocks = days.map((day, dayIndex) => {
    const lunchIdx = dayIndex * 2;
    const dinnerIdx = dayIndex * 2 + 1;
    const meals = [
      { index: lunchIdx, slot: mealSlots[0], recipe: weekRecipes[lunchIdx] },
      { index: dinnerIdx, slot: mealSlots[1], recipe: weekRecipes[dinnerIdx] },
    ];
    const mealsHeight = meals.reduce(
      (sum, meal) => sum + estimateMealRowHeight(ctx, meal.recipe.name, rowWidth),
      0
    );
    return {
      day,
      meals,
      height: Math.max(98, 58 + mealsHeight + 12),
    };
  });

  const height = 170 + dayBlocks.reduce((sum, block) => sum + block.height + 14, 0) + 72;
  return { dayBlocks, height };
}

async function buildMenuImageCanvas({
  days,
  weekRecipes,
  mealClaims,
  mealSlots,
  generatedAt = Date.now(),
}) {
  await ensureMenuImageFonts();

  const width = 760;
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = '400 17px "Patrick Hand", "PingFang SC", sans-serif';
  const { dayBlocks, height } = buildMenuImageLayout(measureCtx, { days, weekRecipes, mealSlots });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  drawPaperBackground(ctx, width, height);
  drawSketchRect(ctx, 24, 24, width - 48, height - 48, {
    fill: MENU_IMAGE_COLORS.cardBg,
    stroke: MENU_IMAGE_COLORS.pencil,
    lineWidth: 2,
  });

  let y = 56;
  ctx.textAlign = 'center';
  ctx.fillStyle = MENU_IMAGE_COLORS.pencil;
  ctx.font = '700 42px Caveat, cursive';
  ctx.fillText('本周菜单', width / 2, y);
  y += 34;

  ctx.font = '400 18px "Patrick Hand", "PingFang SC", sans-serif';
  ctx.fillStyle = MENU_IMAGE_COLORS.pencilLight;
  ctx.fillText(
    `${days.length} 天 · 午饭 + 晚饭 · 两人份 · ${formatMenuImageDate(generatedAt)}`,
    width / 2,
    y
  );
  y += 36;

  const contentX = 52;
  const contentWidth = width - 104;

  for (const block of dayBlocks) {
    drawSketchRect(ctx, contentX, y, contentWidth, block.height, {
      fill: 'rgba(255, 255, 255, 0.35)',
      stroke: MENU_IMAGE_COLORS.pencilFaint,
      lineWidth: 1.5,
    });

    ctx.textAlign = 'left';
    ctx.font = '700 28px Caveat, cursive';
    ctx.fillStyle = MENU_IMAGE_COLORS.sketchRed;
    ctx.fillText(block.day, contentX + 16, y + 30);

    ctx.strokeStyle = MENU_IMAGE_COLORS.pencilFaint;
    ctx.beginPath();
    ctx.moveTo(contentX + 16, y + 38);
    ctx.lineTo(contentX + contentWidth - 16, y + 38);
    ctx.stroke();

    let mealY = y + 58;
    for (const meal of block.meals) {
      const claim = mealClaims[meal.index];
      const rowX = contentX + 16;
      const rowWidth = contentWidth - 32;
      const nameMaxWidth = rowWidth - 150;
      const nameLines = wrapCanvasText(ctx, meal.recipe.name, nameMaxWidth).slice(0, 2);
      const rowHeight = nameLines.length > 1 ? 42 : 30;

      if (claim) {
        drawSketchRect(ctx, rowX, mealY - 18, rowWidth, rowHeight - 2, {
          fill: MENU_IMAGE_COLORS.highlight,
          stroke: null,
        });
      }

      ctx.font = '400 17px "Patrick Hand", "PingFang SC", sans-serif';
      ctx.fillStyle = MENU_IMAGE_COLORS.sketchBlue;
      ctx.fillText(meal.slot, rowX + 4, mealY);

      const nameX = rowX + 58;
      ctx.fillStyle = MENU_IMAGE_COLORS.pencil;
      nameLines.forEach((line, lineIndex) => {
        ctx.fillText(line, nameX, mealY + lineIndex * 20);
      });

      if (claim?.emoji) {
        ctx.fillText(claim.emoji, nameX + nameMaxWidth + 8, mealY);
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = MENU_IMAGE_COLORS.pencilFaint;
      ctx.fillText(`${meal.recipe.time} 分钟`, rowX + rowWidth - 4, mealY);
      ctx.textAlign = 'left';

      mealY += rowHeight;
    }

    y += block.height + 14;
  }

  ctx.textAlign = 'center';
  ctx.font = '400 16px "Patrick Hand", "PingFang SC", sans-serif';
  ctx.fillStyle = MENU_IMAGE_COLORS.pencilFaint;
  ctx.fillText('mealprep · 速写本每周食谱', width / 2, height - 36);

  return canvas;
}

function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('无法生成图片'));
    }, type);
  });
}

function buildMenuImageFilename(generatedAt = Date.now()) {
  const date = new Date(generatedAt);
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate()
  ).padStart(2, '0')}`;
  return `weekly-menu-${stamp}.png`;
}

async function copyMenuImageBlob(blob) {
  if (!navigator.clipboard?.write || !window.ClipboardItem) {
    throw new Error('当前浏览器不支持复制图片');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

async function saveMenuImageBlob(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: '本周菜单',
      text: '本周菜单',
    });
    return 'shared';
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
