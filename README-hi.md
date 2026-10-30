# dsh-payroll-audit — Payroll audit (हिन्दी)

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-payroll-audit?metric=downloads)](https://dshfind.com/en/plugins/PerryLink/dsh-payroll-audit?ref=badge)

`dsh-payroll-audit` वेतन-पत्रक को प्रकाशित सामाजिक सुरक्षा, आवास निधि और आयकर मानकों के विरुद्ध जाँचता है, और प्रत्येक अंतर को उसके स्रोत खंड तथा प्रभावित राशि के साथ बताता है।

परिणाम जानबूझकर चार-अवस्था वाला है: `pass`, `pass_with_gaps`, `review`, `fail`. जिस नियम का मानक प्राप्त नहीं हुआ, वह **बंद और सूचीबद्ध** होता है, इसलिए «कोई अंतर नहीं मिला» कभी «अनुरूप» के रूप में नहीं दिखाया जाता।

## Install

```sh
dsh plugin --profile <name> add dsh-payroll-audit
dsh --profile <name> --dump-config | grep 'dsh-payroll-audit'
```

## What it looks like

![Workflow diagram for dsh-payroll-audit: document → rule pack → findings.](docs/assets/dsh-payroll-audit-flow.svg)

*Workflow overview: document → rule pack → findings.*

**सीमा:** यह अंकगणितीय और फ़ील्ड-संगति जाँच है — न घोषणा, न लेखा-परीक्षा राय, न रोज़गार-संबंध का निर्धारण। यह कुछ भी जमा नहीं करता, सामाजिक सुरक्षा एजेंसी के निर्धारण का स्थान नहीं लेता, और यह नहीं बताता कि किसी व्यक्ति का नामांकन होना चाहिए या नहीं। जो नियम नहीं चल सके, वे सूचीबद्ध होते हैं।

## What it answers

- क्या घोषित आधार अवधि की न्यूनतम और अधिकतम सीमा में है?
- क्या अंशदान आधार गुणा प्रकाशित दर के बराबर हैं?
- क्या शुद्ध वेतन सकल में से कटौतियाँ घटाकर आता है?
- कौन-से नियम मानक न मिलने के कारण नहीं चले?

## Standards it follows

प्रत्येक नियम एक दस्तावेज़ उद्धृत करता है। पैक अपने उद्धरण स्रोत, स्थान और शब्दशः अंश के साथ साथ रखते हैं। जो मानक प्राप्त नहीं हुए, वे कारण सहित `pending` घोषित हैं, और संबंधित नियम `disabled_rules` में रहते हैं और कभी नहीं चलाए जाते।

## Compatibility

| Surface | Status |
|---|---|
| Harness | peer range `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | all (pure ESM; no native code, no network, no model call) |

## What it does

For each row the engine evaluates the pack's derived columns (restricted arithmetic, no `eval`) and tests each rule. A firing rule contributes its reason code, severity, impact and citations. Parameters are addressed by dotted keys and a missing value resolves to nothing rather than zero.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `rulesFile` | `rules/payroll-audit.yaml` | 规则库路径 |

## Material format

A payroll sheet is a table with one row per person, with fields for `period`, `base_declared`, `gross_pay`, `net_pay`, the contribution amounts and `insurance_set`. Read through `dsh-table-ingest`, so `.xlsx`, `.xlsm` and `.csv` all work.

## Rule sources

No evidence directory: quotations live inside the rule pack and `check:citations` verifies them. The two packs cover Beijing and Shanghai from 2026-07; medical, maternity, injury-tier and minimum-wage checks are disabled because no primary rate was obtained, and each lists what would unblock it.

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
