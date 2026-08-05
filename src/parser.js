const NUMBER_BR_SOURCE = String.raw`-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}`;
const FIVE_NUMBERS_AT_END = new RegExp(
  String.raw`\s+(${NUMBER_BR_SOURCE})\s+(${NUMBER_BR_SOURCE})\s+(${NUMBER_BR_SOURCE})\s+(${NUMBER_BR_SOURCE})\s+(${NUMBER_BR_SOURCE})(?:\s+(.*))?$`,
  'iu',
);

const HEADER_PATTERNS = [
  /^\s*Prefeitura Municipal/iu,
  /^\s*SUS\s*-/iu,
  /^\s*Relat[oó]rio de Giro de Estoque/iu,
  /^\s*Unidade:/iu,
  /^\s*Centro Custo:/iu,
  /^\s*Exibir somente/iu,
  /^\s*Produto\s+UN\s+Qtdade\./iu,
  /^\s*P[aá]gina\s+\d+/iu,
];

const UNIT_PATTERN = /^(.*?)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇÜ./-]{1,15})$/iu;

export function brNumberToFloat(value) {
  if (typeof value === 'number') return value;
  return Number(String(value).replace(/\./g, '').replace(',', '.'));
}

export function normalizeReportText(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v]+/g, ' ');
}

export function detectMetadata(rawText) {
  const text = normalizeReportText(rawText);
  const periodMatch = text.match(
    /Per[ií]odo:\s*de\s*(\d{2}\/\d{2}\/\d{4})\s*at[eé]\s*(\d{2}\/\d{2}\/\d{4})/iu,
  );
  const unitMatch = text.match(
    /Unidade:\s*\(\s*([^)]*?)\s*\)\s*(.*?)\s+Grupo Produto:/iu,
  );
  const municipalityMatch = text.match(/Prefeitura Municipal de\s+([^\n]+)/iu);

  let startDate = null;
  let endDate = null;
  let periodDays = null;

  if (periodMatch) {
    startDate = parseBrazilianDate(periodMatch[1]);
    endDate = parseBrazilianDate(periodMatch[2]);
    if (startDate && endDate) {
      periodDays = Math.round((endDate - startDate) / 86_400_000) + 1;
      if (periodDays <= 0) periodDays = null;
    }
  }

  return {
    startDate,
    endDate,
    periodDays,
    unitCode: unitMatch?.[1]?.trim() || '',
    unitName: unitMatch?.[2]?.replace(/\s+/g, ' ').trim() || '',
    municipality: municipalityMatch?.[1]?.replace(/\s+/g, ' ').trim() || '',
  };
}

function parseBrazilianDate(value) {
  const [day, month, year] = value.split('/').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanLines(rawText) {
  const lines = normalizeReportText(rawText)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return lines.filter((line) => {
    if (HEADER_PATTERNS.some((pattern) => pattern.test(line))) return false;

    if (
      !/^\(\s*\d+\s*\)/u.test(line) &&
      /^FARM[ÁA]CIA\s+(DISTRITAL|MUNICIPAL|CENTRAL)/iu.test(line)
    ) {
      return false;
    }

    return true;
  });
}

export function parseReport(rawText) {
  const metadata = detectMetadata(rawText);
  const cleanedText = cleanLines(rawText).join(' ');
  const blocks = cleanedText.split(/(?=\(\s*\d+\s*\))/u);
  const items = [];
  const unparsedBlocks = [];

  for (const originalBlock of blocks) {
    const block = originalBlock.replace(/\s+/g, ' ').trim();
    if (!/^\(\s*\d+\s*\)/u.test(block)) continue;

    const codeMatch = block.match(/^\(\s*(\d+)\s*\)\s*/u);
    if (!codeMatch) {
      unparsedBlocks.push(block);
      continue;
    }

    const code = Number(codeMatch[1]);
    const body = block.slice(codeMatch[0].length).trim();
    const numberMatch = body.match(FIVE_NUMBERS_AT_END);

    if (!numberMatch || numberMatch.index == null) {
      unparsedBlocks.push(block);
      continue;
    }

    const descriptionAndUnit = body.slice(0, numberMatch.index).trim();
    const unitMatch = descriptionAndUnit.match(UNIT_PATTERN);

    if (!unitMatch) {
      unparsedBlocks.push(block);
      continue;
    }

    let description = unitMatch[1].trim();
    const unit = unitMatch[2].toUpperCase();
    const continuation = numberMatch[6]?.trim();

    if (continuation) {
      description = `${description} ${continuation}`;
    }

    description = description
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:])/g, '$1')
      .trim();

    items.push({
      code,
      description,
      unit,
      monthlyOutput: brNumberToFloat(numberMatch[1]),
      minimumStock: brNumberToFloat(numberMatch[2]),
      currentStock: brNumberToFloat(numberMatch[3]),
      averagePrice: brNumberToFloat(numberMatch[4]),
      costPrice: brNumberToFloat(numberMatch[5]),
    });
  }

  return {
    metadata,
    items,
    unparsedBlocks,
    sourceText: normalizeReportText(rawText),
  };
}

export function analyzeItems(items, periodDays, targetDays = 20) {
  const safePeriodDays = Number(periodDays);
  const safeTargetDays = Number(targetDays);

  if (!Number.isFinite(safePeriodDays) || safePeriodDays <= 0) {
    throw new Error('O número de dias do período deve ser maior que zero.');
  }

  if (!Number.isFinite(safeTargetDays) || safeTargetDays <= 0) {
    throw new Error('A meta de estoque deve ser maior que zero.');
  }

  return items
    .map((item) => {
      const dailyAverage = item.monthlyOutput / safePeriodDays;
      const coverageDays = dailyAverage > 0 ? item.currentStock / dailyAverage : Infinity;
      const replenishmentQuantity = dailyAverage > 0
        ? Math.max(0, Math.ceil(dailyAverage * safeTargetDays - item.currentStock))
        : 0;

      return {
        ...item,
        dailyAverage,
        coverageDays,
        riskBand: classifyRiskBand(coverageDays),
        replenishmentQuantity,
      };
    })
    .sort((a, b) => {
      if (a.coverageDays !== b.coverageDays) return a.coverageDays - b.coverageDays;
      return a.description.localeCompare(b.description, 'pt-BR');
    });
}

export function classifyRiskBand(days) {
  if (!Number.isFinite(days)) return 'Sem saída no período';
  if (days < 5) return 'Abaixo de 5 dias';
  if (days < 10) return 'De 5 a menos de 10 dias';
  if (days < 15) return 'De 10 a menos de 15 dias';
  if (days < 20) return 'De 15 a menos de 20 dias';
  return '20 dias ou mais';
}

export function getRiskLevel(days) {
  if (!Number.isFinite(days)) return 'none';
  if (days < 5) return 'critical';
  if (days < 10) return 'high';
  if (days < 15) return 'medium';
  if (days < 20) return 'low';
  return 'ok';
}

export function buildSummary(analyzedItems) {
  const summary = {
    total: analyzedItems.length,
    below5: 0,
    below10: 0,
    below15: 0,
    below20: 0,
    atLeast20: 0,
    noOutput: 0,
  };

  for (const item of analyzedItems) {
    const days = item.coverageDays;
    if (!Number.isFinite(days)) {
      summary.noOutput += 1;
      continue;
    }

    if (days < 5) summary.below5 += 1;
    if (days < 10) summary.below10 += 1;
    if (days < 15) summary.below15 += 1;
    if (days < 20) summary.below20 += 1;
    if (days >= 20) summary.atLeast20 += 1;
  }

  return summary;
}

export function filterItems(items, { search = '', threshold = 'below20', unit = 'all' } = {}) {
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');

  return items.filter((item) => {
    const matchesSearch = !normalizedSearch ||
      String(item.code).includes(normalizedSearch) ||
      item.description.toLocaleLowerCase('pt-BR').includes(normalizedSearch);

    const matchesUnit = unit === 'all' || item.unit === unit;
    const days = item.coverageDays;

    let matchesThreshold = true;
    switch (threshold) {
      case 'below5': matchesThreshold = days < 5; break;
      case 'below10': matchesThreshold = days < 10; break;
      case 'below15': matchesThreshold = days < 15; break;
      case 'below20': matchesThreshold = days < 20; break;
      case 'atLeast20': matchesThreshold = Number.isFinite(days) && days >= 20; break;
      case 'noOutput': matchesThreshold = !Number.isFinite(days); break;
      case 'all':
      default: matchesThreshold = true;
    }

    return matchesSearch && matchesUnit && matchesThreshold;
  });
}
