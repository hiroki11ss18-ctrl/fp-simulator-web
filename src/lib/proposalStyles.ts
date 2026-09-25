export const PROPOSAL_STYLES = `
.fp-proposal { color:#263238; background:white; font-family:"Yu Gothic",Meiryo,sans-serif; font-size:12px; line-height:1.6; letter-spacing:0; width:190mm; margin:0 auto; }
.fp-proposal * { box-sizing:border-box; letter-spacing:0; }
.fp-proposal .proposal-page { padding:7mm 0 5mm; break-after:page; }
.fp-proposal .proposal-page:last-child { break-after:auto; }
.fp-proposal .proposal-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; border-bottom:3px solid #287abe; padding-bottom:12px; margin-bottom:16px; }
.fp-proposal h1 { font-size:24px; margin:4px 0; font-weight:700; }
.fp-proposal h2 { font-size:15px; margin:16px 0 8px; border-left:3px solid #237f68; padding-left:8px; font-weight:700; }
.fp-proposal h3 { font-size:12px; margin:10px 0 6px; font-weight:700; }
.fp-proposal p { margin:5px 0; }
.fp-proposal .proposal-subtitle { font-size:12px; color:#57656f; }
.fp-proposal .proposal-status { border:1px solid #bb8543; padding:5px 9px; font-size:11px; white-space:nowrap; }
.fp-proposal .plan-note { font-size:10px; color:#46565f; margin:7px 0; line-height:1.6; overflow-wrap:anywhere; }
.fp-proposal .plan-table { border-collapse:collapse; width:100%; min-width:0; font-size:12px; table-layout:fixed; }
.fp-proposal .plan-table th,.fp-proposal .plan-table td { padding:5px 7px; border-bottom:1px solid #dce2e6; text-align:right; vertical-align:top; overflow-wrap:anywhere; }
.fp-proposal .plan-table th:first-child { text-align:left; font-weight:500; }
.fp-proposal .plan-table thead th { background:#f0f4f6; font-weight:700; }
.fp-proposal .plan-table small { display:block; color:#52636d; font-size:9px; font-weight:400; }
.fp-proposal .horizon-table { font-size:11px; }
.fp-proposal .horizon-table th:first-child { width:28%; }
.fp-proposal .plan-table .strong-row { font-size:inherit; }
.fp-proposal .strong-row { background:#eef5fa; font-weight:700; }
.fp-proposal .negative { color:#b43d34; }
.fp-proposal .metric-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:12px 0; }
.fp-proposal .metric { border-top:1px solid #cfd9de; padding-top:9px; }
.fp-proposal .metric span { font-size:10px; display:block; }
.fp-proposal .metric strong { font-size:25px; display:block; }
.fp-proposal .metric small { font-size:11px; margin-left:3px; }
.fp-proposal .balance-plot svg { width:100%; height:160px; }
.fp-proposal .chart-key { display:flex; justify-content:center; gap:18px; font-size:9px; }
.fp-proposal .chart-key span:first-child { color:#287abe; }
.fp-proposal .chart-key span:nth-child(2) { color:#b84e46; }
.fp-proposal .money-bridge { display:flex; justify-content:space-between; align-items:center; gap:6px; margin:12px 0; }
.fp-proposal .money-bridge span { display:block; font-size:10px; }
.fp-proposal .money-bridge strong { font-size:12px; }
.fp-proposal .split-ledger { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
.fp-proposal .budget-table th { width:75%; }
.fp-proposal .life-stage-table caption { text-align:left; color:#52636d; font-size:11px; padding-bottom:10px; }
.fp-proposal .life-stage-table th:first-child { width:48%; }
.fp-proposal .life-stage-table th,.fp-proposal .life-stage-table td { padding:9px 8px; }
.fp-proposal .life-stage-table thead th:nth-child(2) { border-top:3px solid #287abe; }
.fp-proposal .life-stage-table thead th:nth-child(3) { border-top:3px solid #398575; }
.fp-proposal .annual-table { font-size:11px; }
.fp-proposal .annual-table th,.fp-proposal .annual-table td { padding:5px 4px; }
.fp-proposal .annual-table th:last-child { width:22%; }
.fp-proposal .annual-table .event-cell { text-align:left; font-size:10px; min-width:0; }
.fp-proposal .assumptions-list { padding-left:16px; font-size:10px; }
.fp-proposal .assumptions-list li { margin-bottom:5px; }
.fp-proposal .proposal-footer { border-top:1px solid #dce2e6; padding-top:7px; margin-top:15px; color:#687782; font-size:8px; }
.fp-proposal .condition-list { display:grid; grid-template-columns:1fr 1fr; gap:8px 20px; margin:0; }
.fp-proposal .condition-list div { padding:4px 0; border-bottom:1px solid #e5e9eb; }
.fp-proposal .condition-list dt { font-size:10px; color:#52636d; }
.fp-proposal .condition-list dd { margin:0; font-size:12px; }
.fp-proposal a { color:#287abe; text-decoration:underline; }
@media print { @page { size:A4 portrait; margin:10mm; } .fp-proposal { width:100%; } .fp-proposal thead { display:table-header-group; } .fp-proposal tr { break-inside:avoid; } .fp-proposal { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
@media screen and (max-width:760px) { .fp-proposal { width:100%; padding:12px; } .fp-proposal .table-scroll { overflow-x:auto; } .fp-proposal .horizon-table { min-width:590px; } .fp-proposal .condition-list,.fp-proposal .split-ledger { grid-template-columns:1fr; } }
`;
