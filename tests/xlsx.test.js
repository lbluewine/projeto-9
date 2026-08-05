import test from 'node:test';
import assert from 'node:assert/strict';
import { createXlsxWorkbook } from '../src/xlsx-writer.js';

test('gera um arquivo ZIP/XLSX com assinaturas válidas', () => {
  const bytes = createXlsxWorkbook([
    {
      name: 'Resumo',
      columns: [
        { key: 'item', label: 'Item', width: 20 },
        { key: 'value', label: 'Valor', type: 'number' },
      ],
      rows: [
        { item: 'Produtos', value: 8 },
        { item: 'Cobertura média', value: 12.5 },
      ],
    },
  ]);

  assert.ok(bytes.length > 1000);
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...bytes.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
});
