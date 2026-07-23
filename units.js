function formatUs(n) {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded) || rounded === Math.floor(rounded)) {
    return String(Math.round(rounded));
  }
  return String(rounded);
}

function pluralize(value, singular, plural) {
  return value === 1 ? singular : plural || `${singular}s`;
}

function toImperialDisplay(amount, unit) {
  const u = (unit || '').trim();
  if (!u || u === '适量') return 'as needed';

  if (u === 'g') {
    if (amount >= 454) {
      const lb = amount / 453.592;
      return `${formatUs(lb)} ${pluralize(lb, 'lb')}`;
    }
    const oz = amount / 28.3495;
    return `${formatUs(oz)} ${pluralize(oz, 'oz')}`;
  }

  if (u === 'kg') {
    const lb = amount * 2.20462;
    return `${formatUs(lb)} ${pluralize(lb, 'lb')}`;
  }

  if (u === 'ml') {
    if (amount >= 118) {
      const cups = amount / 236.588;
      return `${formatUs(cups)} ${pluralize(cups, 'cup')}`;
    }
    const floz = amount / 29.5735;
    return `${formatUs(floz)} fl oz`;
  }

  if (u === 'l' || u === 'L') {
    const cups = (amount * 1000) / 236.588;
    return `${formatUs(cups)} ${pluralize(cups, 'cup')}`;
  }

  if (u === '个' || u === '根' || u === '颗') {
    return `${formatUs(amount)} ${pluralize(amount, 'each')}`;
  }

  if (u === '瓣') {
    return `${formatUs(amount)} ${pluralize(amount, 'clove')}`;
  }

  if (u === '把') {
    return `${formatUs(amount)} ${pluralize(amount, 'bunch')}`;
  }

  if (u === '片') {
    return `${formatUs(amount)} ${pluralize(amount, 'slice')}`;
  }

  if (u === '盒' || u === '包') {
    return `${formatUs(amount)} ${pluralize(amount, 'pkg')}`;
  }

  if (u === '朵') {
    return `${formatUs(amount)} ${pluralize(amount, 'pc')}`;
  }

  if (u === '条' || u === '只') {
    return `${formatUs(amount)} ${pluralize(amount, 'pc')}`;
  }

  if (u === '碗') {
    const oz = (amount * 150) / 28.3495;
    return `${formatUs(amount)} bowl${amount > 1 ? 's' : ''} (~${formatUs(oz)} oz)`;
  }

  return null;
}

function formatShoppingAmount(item) {
  if (item.unit === '适量') {
    return { metric: '适量', imperial: 'as needed' };
  }

  const metric = `${formatAmount(item.amount)} ${item.unit}`;
  const imperial = toImperialDisplay(item.amount, item.unit);

  return {
    metric,
    imperial: imperial || '',
  };
}

function formatAmount(amount) {
  if (Number.isInteger(amount) || amount === Math.floor(amount)) {
    return String(Math.round(amount));
  }
  return String(Math.round(amount * 100) / 100);
}
