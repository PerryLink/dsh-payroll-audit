# dsh-payroll-audit — Payroll audit

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

<!-- topblock:v1 -->
> **What it is** — Checks a payroll table against verified contribution and tax parameters, with a reason for every difference.
> **Who it is for** — payroll and HR staff.
> **What you give it** — a payroll table
> **What it does not do** — no compliance verdict, no liability finding, no replacement for the reviewer; differences only.
> **How to start** — from the command line (not sold separately yet):
> `dsh plugin --profile <name> add dsh-payroll-audit`
<!-- /topblock:v1 -->

[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-payroll-audit?metric=downloads)](https://dshfind.com/en/plugins/PerryLink/dsh-payroll-audit?ref=badge)

`dsh-payroll-audit` checks a payroll sheet against published social-insurance, housing-fund and individual-income-tax parameters, and reports each difference with the clause it comes from and the amount at stake.

The outcome is deliberately four-valued: `pass`, `pass_with_gaps`, `review`, `fail`. A rule whose parameter was never obtained is **disabled and listed**, so "no finding" is never rendered as "compliant". The parameter documents carry their own `next_review_by` date, and a rule whose parameter is out of date degrades to `review` rather than passing on last year's number.

## Install

```sh
dsh plugin --profile <name> add dsh-payroll-audit
dsh --profile <name> --dump-config | grep 'dsh-payroll-audit'
```

## What it looks like

![Workflow diagram for dsh-payroll-audit: document → rule pack → findings.](docs/assets/dsh-payroll-audit-flow.svg)

*Workflow overview: document → rule pack → findings.*

**Boundary:** this is an arithmetic and field-consistency check, not a filing, an audit opinion, or a determination of the employment relationship. It does not submit anything, does not replace the social-insurance agency's own assessment, and does not tell you whether a person should be enrolled. Two consequences follow, and both are visible in the report: a rule that could not run is listed as such, and the wording never says 合规 (compliant) — only 未发现差异 (no discrepancy found among the checked items).

## What it answers

- Is a declared contribution base inside the city's floor and ceiling for the period?
- Do the contribution amounts equal the base times the published rate?
- Does the net pay follow from gross pay minus the deductions?
- Which rules could not run because a parameter was never obtained?

## Standards it follows

Every rule cites a document. The packs ship with their citations inline, and each citation carries the source, a locator, and a verbatim quote, so a reader can go and check it:

- Beijing social-insurance base limits: 北京市人社局 2026 年度缴费工资基数上下限通告 (7,270 / 36,348).
- Beijing housing fund: 5%–12%, base 2,540–36,348.
- Shanghai: base limits, and housing fund **5%–7%** — not the 5%–12% in the national regulation, which is why the range is read from the parameter file rather than hard-coded.
- Individual income tax: cumulative withholding per 国家税务总局公告 2018 年第 61 号.

Parameters that were not obtained are declared `pending` with the reason and what would unblock them; the corresponding rules are listed under `disabled_rules` and never evaluated.

## Compatibility

| Surface | Status |
|---|---|
| Harness | peer range `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | all (pure ESM; no native code, no network, no model call) |

## What it does

For each row the engine evaluates the pack's derived columns (restricted arithmetic, no `eval`), then tests each rule's conditions. A rule that fires contributes its `reason_code`, severity, impact and citations. Rules are grouped into the four-state verdict described above.

Parameters are addressed by dotted keys (`si.base.floor`, `hf.fund.employee_max`, `iit.extra.child_edu_monthly`), resolved from the official parameter document. A value that is declared missing resolves to *nothing* rather than zero.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `rulesFile` | `rules/payroll-audit.yaml` | 规则库路径 |

## Material format

A payroll sheet is a table with one row per person. The fields the packs read include:

| Field | Meaning |
|---|---|
| `period` | `2026-07`; selects the parameter validity window |
| `base_declared` | Declared contribution base |
| `gross_pay`, `net_pay` | Gross and net pay |
| `employer_pension`, `employee_pension` | Pension contributions as paid |
| `ee_unemployment`, `ee_medical`, `ee_hf` | Employee-side contributions |
| `hf_base`, `hf_employer_rate`, `hf_employee_rate` | Housing fund inputs |
| `insurance_set` | Enrolled schemes, comma separated |

The file is read through `dsh-table-ingest`, so `.xlsx`, `.xlsm` and `.csv` all work.

## Rule sources

No evidence directory: the quotations live inside the rule pack, next to the rule that uses them, and `check:citations` verifies each one appears verbatim in the pack's citation table.

Known limits: the two shipped packs cover Beijing and Shanghai for 2026-07 onward; an earlier period has no parameters and every rule degrades to `gaps`. Medical, maternity, injury-tier and minimum-wage checks are disabled because the rates were not obtained from a primary source — each is listed with what would unblock it. The engine does not file anything and does not compute a corrected payroll.

## Troubleshooting

- **The plugin installs but the tool never appears**: check that `main` resolves to `lib/index.mjs` and that `pnpm run build` produced it.
- **`dsh plugin add` rejects the package**: the peer range covers `0.1.x` and `0.2.x`; outside it, grant an explicit exemption.
- **A rule did not run**: read the `skipped` array.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
node ../scripts/sync-shared.mjs dsh-payroll-audit
```

## PerryLink DSH Plugin Family

Full family index: [choose a checker by material](https://perrylink.github.io/zh/checkers/choose/) and [all plugins](https://github.com/PerryLink). This repository is one of them.

## License

[Apache License 2.0](LICENSE) © 2026 dsh-payroll-audit contributors.
