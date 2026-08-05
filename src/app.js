import {
  analyzeItems,
  buildSummary,
  filterItems,
  getRiskLevel,
  parseReport,
} from './parser.js';
import { extractTextFromPdf } from './pdf-reader.js';
import { downloadCsv, downloadXlsx } from './xlsx-writer.js';

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integerFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});
const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

const state = {
  sourceName: '',
  parsed: null,
  analyzed: [],
  filtered: [],
  summary: null,
  periodDays: 30,
  targetDays: 20,
  sort: { key: 'coverageDays', direction: 'asc' },
  page: 1,
  pageSize: 50,
};

const elements = {
  uploadSection: document.querySelector('#upload-section'),
  dashboardSection: document.querySelector('#dashboard-section'),
  dropZone: document.querySelector('#drop-zone'),
  fileInput: document.querySelector('#file-input'),
  browseButton: document.querySelector('#browse-button'),
  pasteToggle: document.querySelector('#paste-toggle'),
  pastePanel: document.querySelector('#paste-panel'),
  pasteText: document.querySelector('#paste-text'),
  processPaste: document.querySelector('#process-paste'),
  sampleButton: document.querySelector('#sample-button'),
  processing: document.querySelector('#processing'),
  processingText: document.querySelector('#processing-text'),
  processingBar: document.querySelector('#processing-bar'),
  errorBox: document.querySelector('#error-box'),
  errorText: document.querySelector('#error-text'),
  sourceName: document.querySelector('#source-name'),
  sourceMeta: document.querySelector('#source-meta'),
  newReport: document.querySelector('#new-report'),
  periodDays: document.querySelector('#period-days'),
  targetDays: document.querySelector('#target-days'),
  applyCalculation: document.querySelector('#apply-calculation'),
  search: document.querySelector('#search'),
  threshold: document.querySelector('#threshold'),
  unit: document.querySelector('#unit'),
  pageSize: document.querySelector('#page-size'),
  tableBody: document.querySelector('#table-body'),
  tableHeaders: document.querySelectorAll('[data-sort]'),
  filteredCount: document.querySelector('#filtered-count'),
  emptyState: document.querySelector('#empty-state'),
  pagination: document.querySelector('#pagination'),
  pageInfo: document.querySelector('#page-info'),
  previousPage: document.querySelector('#previous-page'),
  nextPage: document.querySelector('#next-page'),
  exportXlsx: document.querySelector('#export-xlsx'),
  exportCsv: document.querySelector('#export-csv'),
  printButton: document.querySelector('#print-button'),
  warningsPanel: document.querySelector('#warnings-panel'),
  warningsCount: document.querySelector('#warnings-count'),
  warningsList: document.querySelector('#warnings-list'),
  toast: document.querySelector('#toast'),
  summaryTotal: document.querySelector('#summary-total'),
  summaryBelow5: document.querySelector('#summary-below5'),
  summaryBelow10: document.querySelector('#summary-below10'),
  summaryBelow20: document.querySelector('#summary-below20'),
  distribution: document.querySelector('#distribution'),
};

const EXAMPLE_REPORT = `Prefeitura Municipal de Criciúma
SUS - Sistema Unico de Saude
Relatório de Giro de Estoque Página 001 de 005
FARMACIA DISTRITAL BOA VISTA
Unidade: ( 106332967 ) FARMACIA DISTRITAL BOA VISTA Grupo Produto: Todos Forma de Apresentação: Geral
Centro Custo: Todos Período: de 01/07/2026 até 31/07/2026 Ordenação: Descrição do Produto
Exibir somente com estoque atual abaixo do estoque mínimo: Não SubGrupo: Todos Tipo de Ordenação: Crescente
Produto UN Qtdade. Saída Estoque Mínimo Estoque Atual Preço Médio Preço de Custo
( 3963 ) ACETILCISTEINA 600MG/ENV 5GR (FARM. U 1.403,00 0,00 30,00 0,63 0,63
DISTRITAIS)
( 375 ) ACICLOVIR 200MG (FARM. DISTRITAIS) CP 2.460,00 0,00 1.455,00 0,19 0,19
( 2280 ) ACICLOVIR 50MG/G TB 61,00 0,00 47,00 2,07 2,07
( 355 ) ÁCIDO ACETILSALICÍLICO 100 MG CP 9.830,00 0,00 1.075,00 0,03 0,03
( 1376 ) ACIDO FOLICO 0,2 MG/ML FRASCO DE 30 FR 11,00 0,00 4,00 2,90 2,90
ML
( 19 ) ÁCIDO FÓLICO 5 MG CP 1.700,00 0,00 720,00 0,04 0,04
( 396 ) ÁCIDO VALPRÓICO 250 MG CAP 3.900,00 0,00 1.050,00 0,30 0,30
( 408 ) ÁCIDO VALPRÓICO 500 MG CP 6.650,00 0,00 2.350,00 0,56 0,56`;

bindEvents();

function bindEvents() {
  elements.browseButton.addEventListener('click', () => elements.fileInput.click());
  elements.dropZone.addEventListener('click', (event) => {
    if (!event.target.closest('button')) elements.fileInput.click();
  });
  elements.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      elements.fileInput.click();
    }
  });
  elements.fileInput.addEventListener('change', () => {
    const [file] = elements.fileInput.files;
    if (file) processFile(file);
  });

  for (const eventName of ['dragenter', 'dragover']) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add('is-dragging');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove('is-dragging');
    });
  }
  elements.dropZone.addEventListener('drop', (event) => {
    const [file] = event.dataTransfer.files;
    if (file) processFile(file);
  });

  elements.pasteToggle.addEventListener('click', () => {
    const hidden = elements.pastePanel.hidden;
    elements.pastePanel.hidden = !hidden;
    elements.pasteToggle.setAttribute('aria-expanded', String(hidden));
    if (hidden) elements.pasteText.focus();
  });
  elements.processPaste.addEventListener('click', () => {
    const text = elements.pasteText.value.trim();
    if (!text) return showError('Cole o conteúdo do relatório antes de processar.');
    processReportText(text, 'Texto colado');
  });
  elements.sampleButton.addEventListener('click', () => processReportText(EXAMPLE_REPORT, 'Relatório de exemplo'));

  elements.newReport.addEventListener('click', resetApplication);
  elements.applyCalculation.addEventListener('click', recalculate);
  elements.periodDays.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') recalculate();
  });
  elements.targetDays.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') recalculate();
  });

  elements.search.addEventListener('input', applyFilters);
  elements.threshold.addEventListener('change', applyFilters);
  elements.unit.addEventListener('change', applyFilters);
  elements.pageSize.addEventListener('change', () => {
    state.pageSize = elements.pageSize.value === 'all' ? Infinity : Number(elements.pageSize.value);
    state.page = 1;
    renderTable();
  });

  elements.tableHeaders.forEach((header) => {
    header.addEventListener('click', () => changeSort(header.dataset.sort));
  });

  elements.previousPage.addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    renderTable();
  });
  elements.nextPage.addEventListener('click', () => {
    state.page = Math.min(totalPages(), state.page + 1);
    renderTable();
  });

  elements.exportXlsx.addEventListener('click', exportWorkbook);
  elements.exportCsv.addEventListener('click', exportFilteredCsv);
  elements.printButton.addEventListener('click', () => window.print());
}

async function processFile(file) {
  hideError();
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['pdf', 'txt'].includes(extension)) {
    showError('Formato não suportado. Selecione um arquivo PDF ou TXT.');
    return;
  }

  setProcessing(true, 'Preparando o arquivo…', 4);

  try {
    let text;
    if (extension === 'pdf') {
      text = await extractTextFromPdf(file, ({ current, total }) => {
        const percent = Math.max(8, Math.round((current / total) * 85));
        setProcessing(true, `Lendo página ${current} de ${total}…`, percent);
      });
    } else {
      setProcessing(true, 'Lendo arquivo de texto…', 45);
      text = await file.text();
    }

    setProcessing(true, 'Interpretando produtos e calculando cobertura…', 92);
    await nextFrame();
    processReportText(text, file.name, false);
    setProcessing(true, 'Concluído.', 100);
    await delay(180);
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Não foi possível processar o arquivo.');
  } finally {
    setProcessing(false);
    elements.fileInput.value = '';
  }
}

function processReportText(text, sourceName, manageProcessing = true) {
  hideError();
  if (manageProcessing) setProcessing(true, 'Interpretando o relatório…', 70);

  try {
    const parsed = parseReport(text);
    if (parsed.items.length === 0) {
      throw new Error(
        'Nenhum produto foi reconhecido. Verifique se o arquivo segue o formato do Relatório de Giro de Estoque.',
      );
    }

    state.sourceName = sourceName;
    state.parsed = parsed;
    state.periodDays = parsed.metadata.periodDays || 30;
    state.targetDays = 20;
    state.sort = { key: 'coverageDays', direction: 'asc' };
    state.page = 1;

    elements.periodDays.value = state.periodDays;
    elements.targetDays.value = state.targetDays;
    elements.search.value = '';
    elements.threshold.value = 'below20';

    calculateAndRender();
    elements.uploadSection.hidden = true;
    elements.dashboardSection.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Erro ao interpretar o relatório.');
  } finally {
    if (manageProcessing) setProcessing(false);
  }
}

function recalculate() {
  const periodDays = Number(elements.periodDays.value);
  const targetDays = Number(elements.targetDays.value);

  if (!Number.isFinite(periodDays) || periodDays <= 0) {
    showToast('Informe um período maior que zero.', 'error');
    elements.periodDays.focus();
    return;
  }
  if (!Number.isFinite(targetDays) || targetDays <= 0) {
    showToast('Informe uma meta de estoque maior que zero.', 'error');
    elements.targetDays.focus();
    return;
  }

  state.periodDays = periodDays;
  state.targetDays = targetDays;
  state.page = 1;
  calculateAndRender();
  showToast('Cálculos atualizados.');
}

function calculateAndRender() {
  state.analyzed = analyzeItems(state.parsed.items, state.periodDays, state.targetDays);
  state.summary = buildSummary(state.analyzed);
  populateUnits();
  renderReportHeader();
  renderSummary();
  renderWarnings();
  applyFilters();
}

function renderReportHeader() {
  const metadata = state.parsed.metadata;
  elements.sourceName.textContent = state.sourceName;

  const parts = [];
  if (metadata.unitName) parts.push(metadata.unitName);
  if (metadata.startDate && metadata.endDate) {
    parts.push(`${dateFormatter.format(metadata.startDate)} a ${dateFormatter.format(metadata.endDate)}`);
  }
  parts.push(`${state.analyzed.length} produtos reconhecidos`);
  elements.sourceMeta.textContent = parts.join(' • ');
}

function renderSummary() {
  const summary = state.summary;
  elements.summaryTotal.textContent = integerFormatter.format(summary.total);
  elements.summaryBelow5.textContent = integerFormatter.format(summary.below5);
  elements.summaryBelow10.textContent = integerFormatter.format(summary.below10);
  elements.summaryBelow20.textContent = integerFormatter.format(summary.below20);

  const exclusive = [
    { label: 'Abaixo de 5 dias', count: summary.below5, level: 'critical' },
    { label: '5 a menos de 10 dias', count: summary.below10 - summary.below5, level: 'high' },
    { label: '10 a menos de 15 dias', count: summary.below15 - summary.below10, level: 'medium' },
    { label: '15 a menos de 20 dias', count: summary.below20 - summary.below15, level: 'low' },
    { label: '20 dias ou mais', count: summary.atLeast20, level: 'ok' },
    { label: 'Sem saída no período', count: summary.noOutput, level: 'none' },
  ];

  elements.distribution.replaceChildren();
  const maximum = Math.max(1, ...exclusive.map((item) => item.count));

  for (const item of exclusive) {
    const row = document.createElement('div');
    row.className = 'distribution-row';

    const label = document.createElement('span');
    label.className = 'distribution-label';
    label.textContent = item.label;

    const track = document.createElement('div');
    track.className = 'distribution-track';
    const bar = document.createElement('div');
    bar.className = `distribution-bar risk-${item.level}`;
    bar.style.width = `${(item.count / maximum) * 100}%`;
    track.append(bar);

    const count = document.createElement('strong');
    count.textContent = integerFormatter.format(item.count);

    row.append(label, track, count);
    elements.distribution.append(row);
  }
}

function populateUnits() {
  const selected = elements.unit.value;
  const units = [...new Set(state.analyzed.map((item) => item.unit))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  elements.unit.replaceChildren(new Option('Todas as unidades', 'all'));
  for (const unit of units) elements.unit.add(new Option(unit, unit));
  elements.unit.value = units.includes(selected) ? selected : 'all';
}

function applyFilters() {
  state.filtered = filterItems(state.analyzed, {
    search: elements.search.value,
    threshold: elements.threshold.value,
    unit: elements.unit.value,
  });
  state.page = 1;
  renderTable();
}

function renderTable() {
  const sorted = sortRows(state.filtered);
  const pages = totalPages(sorted.length);
  if (state.page > pages) state.page = pages;

  const start = Number.isFinite(state.pageSize) ? (state.page - 1) * state.pageSize : 0;
  const end = Number.isFinite(state.pageSize) ? start + state.pageSize : sorted.length;
  const visibleRows = sorted.slice(start, end);

  elements.tableBody.replaceChildren();
  for (const item of visibleRows) elements.tableBody.append(createTableRow(item));

  const total = sorted.length;
  const visibleStart = total === 0 ? 0 : start + 1;
  const visibleEnd = Math.min(end, total);
  elements.filteredCount.textContent = `${integerFormatter.format(total)} item(ns) • exibindo ${visibleStart}–${visibleEnd}`;
  elements.emptyState.hidden = total > 0;
  elements.pagination.hidden = !Number.isFinite(state.pageSize) || total <= state.pageSize;
  elements.pageInfo.textContent = `Página ${state.page} de ${pages}`;
  elements.previousPage.disabled = state.page <= 1;
  elements.nextPage.disabled = state.page >= pages;
  updateSortIndicators();
}

function createTableRow(item) {
  const row = document.createElement('tr');
  row.dataset.risk = getRiskLevel(item.coverageDays);

  row.append(
    createCell(String(item.code), 'cell-code'),
    createCell(item.description, 'cell-product'),
    createCell(item.unit, 'cell-unit'),
    createCell(numberFormatter.format(item.monthlyOutput), 'cell-number'),
    createCell(numberFormatter.format(item.currentStock), 'cell-number'),
    createCell(numberFormatter.format(item.dailyAverage), 'cell-number'),
  );

  const coverageCell = document.createElement('td');
  coverageCell.className = 'cell-coverage';
  const coverage = document.createElement('strong');
  coverage.textContent = Number.isFinite(item.coverageDays)
    ? `${numberFormatter.format(item.coverageDays)} dias`
    : 'Sem saída';
  coverageCell.append(coverage);
  row.append(coverageCell);

  const riskCell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `risk-badge risk-${getRiskLevel(item.coverageDays)}`;
  badge.textContent = item.riskBand;
  riskCell.append(badge);
  row.append(riskCell);

  row.append(createCell(integerFormatter.format(item.replenishmentQuantity), 'cell-number cell-replenishment'));
  return row;
}

function createCell(text, className = '') {
  const cell = document.createElement('td');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function sortRows(rows) {
  const { key, direction } = state.sort;
  const multiplier = direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const first = a[key];
    const second = b[key];

    if (typeof first === 'string' && typeof second === 'string') {
      return first.localeCompare(second, 'pt-BR', { numeric: true }) * multiplier;
    }

    if (first === second) return a.description.localeCompare(b.description, 'pt-BR');
    if (!Number.isFinite(first) && !Number.isFinite(second)) return 0;
    if (!Number.isFinite(first)) return 1 * multiplier;
    if (!Number.isFinite(second)) return -1 * multiplier;
    return (first - second) * multiplier;
  });
}

function changeSort(key) {
  if (state.sort.key === key) {
    state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort = { key, direction: key === 'description' ? 'asc' : 'desc' };
  }
  renderTable();
}

function updateSortIndicators() {
  elements.tableHeaders.forEach((header) => {
    const active = header.dataset.sort === state.sort.key;
    header.dataset.direction = active ? state.sort.direction : '';
    header.setAttribute('aria-sort', active
      ? (state.sort.direction === 'asc' ? 'ascending' : 'descending')
      : 'none');
  });
}

function totalPages(length = state.filtered.length) {
  if (!Number.isFinite(state.pageSize)) return 1;
  return Math.max(1, Math.ceil(length / state.pageSize));
}

function renderWarnings() {
  const warnings = state.parsed.unparsedBlocks;
  elements.warningsPanel.hidden = warnings.length === 0;
  elements.warningsCount.textContent = integerFormatter.format(warnings.length);
  elements.warningsList.replaceChildren();

  warnings.slice(0, 30).forEach((warning) => {
    const item = document.createElement('li');
    item.textContent = warning;
    elements.warningsList.append(item);
  });

  if (warnings.length > 30) {
    const item = document.createElement('li');
    item.textContent = `… e mais ${warnings.length - 30} trecho(s).`;
    elements.warningsList.append(item);
  }
}

function exportWorkbook() {
  if (!state.analyzed.length) return;

  const detailColumns = exportColumns();
  const mapRows = (rows) => rows.map(toExportRow);
  const summaryRows = summaryExportRows();

  const sheets = [
    {
      name: 'Resumo',
      columns: [
        { key: 'indicator', label: 'Indicador', width: 38 },
        { key: 'value', label: 'Valor', width: 30 },
      ],
      rows: summaryRows,
    },
    { name: 'Itens abaixo de 20', columns: detailColumns, rows: mapRows(state.analyzed.filter((item) => item.coverageDays < 20)) },
    { name: 'Abaixo de 5', columns: detailColumns, rows: mapRows(state.analyzed.filter((item) => item.coverageDays < 5)) },
    { name: 'Abaixo de 10', columns: detailColumns, rows: mapRows(state.analyzed.filter((item) => item.coverageDays < 10)) },
    { name: 'Abaixo de 15', columns: detailColumns, rows: mapRows(state.analyzed.filter((item) => item.coverageDays < 15)) },
    { name: 'Abaixo de 20', columns: detailColumns, rows: mapRows(state.analyzed.filter((item) => item.coverageDays < 20)) },
    { name: 'Todos os itens', columns: detailColumns, rows: mapRows(state.analyzed) },
  ];

  if (state.parsed.unparsedBlocks.length) {
    sheets.push({
      name: 'Não reconhecidos',
      columns: [{ key: 'text', label: 'Trecho não reconhecido', width: 80 }],
      rows: state.parsed.unparsedBlocks.map((text) => ({ text })),
    });
  }

  downloadXlsx(buildFilename('relatorio_estoque', 'xlsx'), sheets);
  showToast('Planilha XLSX gerada.');
}

function exportFilteredCsv() {
  const rows = sortRows(state.filtered).map(toExportRow);
  downloadCsv(buildFilename('estoque_filtrado', 'csv'), exportColumns(), rows);
  showToast('CSV filtrado gerado.');
}

function exportColumns() {
  return [
    { key: 'code', label: 'Código', type: 'integer', width: 12 },
    { key: 'description', label: 'Produto', width: 52 },
    { key: 'unit', label: 'UN', width: 10 },
    { key: 'monthlyOutput', label: 'Qtdade. Saída', type: 'number', width: 16 },
    { key: 'minimumStock', label: 'Estoque Mínimo', type: 'number', width: 16 },
    { key: 'currentStock', label: 'Estoque Atual', type: 'number', width: 16 },
    { key: 'dailyAverage', label: 'Média de Saída/Dia', type: 'number', width: 20 },
    { key: 'coverageExport', label: 'Dias de Estoque', type: 'days', width: 18 },
    { key: 'riskBand', label: 'Faixa', width: 28 },
    { key: 'replenishmentQuantity', label: `Qtd. para ${state.targetDays} dias`, type: 'integer', width: 20 },
    { key: 'averagePrice', label: 'Preço Médio', type: 'currency', width: 15 },
    { key: 'costPrice', label: 'Preço de Custo', type: 'currency', width: 16 },
  ];
}

function toExportRow(item) {
  return {
    ...item,
    coverageExport: Number.isFinite(item.coverageDays) ? item.coverageDays : 'Sem saída',
  };
}

function summaryExportRows() {
  const metadata = state.parsed.metadata;
  const summary = state.summary;
  const rows = [
    { indicator: 'Arquivo', value: state.sourceName },
    { indicator: 'Unidade', value: metadata.unitName || 'Não identificada' },
    { indicator: 'Dias usados no cálculo', value: state.periodDays },
    { indicator: 'Meta de estoque', value: `${state.targetDays} dias` },
    { indicator: 'Produtos reconhecidos', value: summary.total },
    { indicator: 'Abaixo de 5 dias', value: summary.below5 },
    { indicator: 'Abaixo de 10 dias', value: summary.below10 },
    { indicator: 'Abaixo de 15 dias', value: summary.below15 },
    { indicator: 'Abaixo de 20 dias', value: summary.below20 },
    { indicator: '20 dias ou mais', value: summary.atLeast20 },
    { indicator: 'Sem saída no período', value: summary.noOutput },
    { indicator: 'Trechos não reconhecidos', value: state.parsed.unparsedBlocks.length },
  ];

  if (metadata.startDate && metadata.endDate) {
    rows.splice(2, 0, {
      indicator: 'Período do relatório',
      value: `${dateFormatter.format(metadata.startDate)} a ${dateFormatter.format(metadata.endDate)}`,
    });
  }
  return rows;
}

function buildFilename(prefix, extension) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${prefix}_${date}.${extension}`;
}

function resetApplication() {
  state.sourceName = '';
  state.parsed = null;
  state.analyzed = [];
  state.filtered = [];
  state.summary = null;
  state.page = 1;
  elements.dashboardSection.hidden = true;
  elements.uploadSection.hidden = false;
  elements.pasteText.value = '';
  elements.pastePanel.hidden = true;
  elements.pasteToggle.setAttribute('aria-expanded', 'false');
  hideError();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setProcessing(active, text = '', percent = 0) {
  elements.processing.hidden = !active;
  elements.processingText.textContent = text;
  elements.processingBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  elements.browseButton.disabled = active;
  elements.processPaste.disabled = active;
  elements.sampleButton.disabled = active;
}

function showError(message) {
  elements.errorText.textContent = message;
  elements.errorBox.hidden = false;
  setProcessing(false);
}

function hideError() {
  elements.errorBox.hidden = true;
  elements.errorText.textContent = '';
}

let toastTimeout;
function showToast(message, type = 'success') {
  clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.dataset.type = type;
  elements.toast.hidden = false;
  requestAnimationFrame(() => elements.toast.classList.add('is-visible'));
  toastTimeout = setTimeout(() => {
    elements.toast.classList.remove('is-visible');
    setTimeout(() => { elements.toast.hidden = true; }, 180);
  }, 2400);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
