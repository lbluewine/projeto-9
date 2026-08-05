import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeItems, buildSummary, parseReport } from '../src/parser.js';

const report = `Prefeitura Municipal de Criciúma
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
( 1376 ) ACIDO FOLICO 0,2 MG/ML FRASCO DE 30 FR 11,00 0,00 4,00 2,90 2,90
ML
( 408 ) ÁCIDO VALPRÓICO 500 MG CP 6.650,00 0,00 2.350,00 0,56 0,56`;

test('interpreta produtos, período e descrições quebradas', () => {
  const parsed = parseReport(report);
  assert.equal(parsed.items.length, 4);
  assert.equal(parsed.unparsedBlocks.length, 0);
  assert.equal(parsed.metadata.periodDays, 31);
  assert.equal(parsed.metadata.unitName, 'FARMACIA DISTRITAL BOA VISTA');
  assert.equal(parsed.items[0].code, 3963);
  assert.equal(parsed.items[0].monthlyOutput, 1403);
  assert.equal(parsed.items[0].description, 'ACETILCISTEINA 600MG/ENV 5GR (FARM. DISTRITAIS)');
  assert.equal(parsed.items[2].description, 'ACIDO FOLICO 0,2 MG/ML FRASCO DE 30 ML');
});

test('calcula a cobertura e as faixas cumulativas', () => {
  const parsed = parseReport(report);
  const analyzed = analyzeItems(parsed.items, 31, 20);
  const acetylcysteine = analyzed.find((item) => item.code === 3963);
  assert.ok(Math.abs(acetylcysteine.coverageDays - 0.662865) < 0.001);
  assert.equal(acetylcysteine.riskBand, 'Abaixo de 5 dias');
  assert.equal(acetylcysteine.replenishmentQuantity, 876);

  const summary = buildSummary(analyzed);
  assert.equal(summary.total, 4);
  assert.equal(summary.below5, 1);
  assert.equal(summary.below10, 1);
  assert.equal(summary.below20, 4);
});
