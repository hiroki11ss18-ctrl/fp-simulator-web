import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ configFile: false, envDir: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { DEFAULT_DATA } = await server.ssrLoadModule('/src/lib/defaults.ts');
  const { calcAll } = await server.ssrLoadModule('/src/hooks/useCalculations.ts');
  const { buildExpenseTotals } = await server.ssrLoadModule('/src/lib/planning.ts');
  const { default: PrintProposal } = await server.ssrLoadModule('/src/components/PrintProposal.tsx');
  const data = structuredClone(DEFAULT_DATA);
  data.basic.customerName = '動作確認用サンプル';
  data.basic.date = '2026-10-02';
  const years = Number(process.argv[2] ?? 30);
  if (![30, 40, 50, 60].includes(years)) throw new Error('Choose 30, 40, 50 or 60 years');
  data.simYears = years;
  data.housing.reviewRate = 2.75;
  data.household.electricMonthly = 1.5;
  data.suddenExpenses = [
    { id: 'travel', name: '家族旅行', category: 'travel', amount: 20, cycleYears: 1, firstYear: 1, endYear: 60, once: false },
    { id: 'car', name: '車の買い替え', category: 'car', amount: 250, cycleYears: 8, firstYear: 8, endYear: 60, once: false },
  ];
  const calc = calcAll(data);
  const html = '<!DOCTYPE html>' + renderToStaticMarkup(createElement('html', { lang: 'ja' },
    createElement('head', null, createElement('meta', { charSet: 'utf-8' }), createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }), createElement('title', null, 'FP提案書・検証用サンプル')),
    createElement('body', null, createElement(PrintProposal, { data, calc }))));
  await mkdir('output', { recursive: true });
  const path = years === 30 ? 'output/fp-proposal-sample.html' : `output/fp-proposal-sample-${years}.html`;
  await writeFile(path, html, 'utf8');
  console.log(JSON.stringify({ html: path, cash30: calc.rows[29].balance, cash60: calc.rows[59].balance, annualRows: calc.rows.length, expenses: buildExpenseTotals(data, calc) }));
} finally {
  await server.close();
}
