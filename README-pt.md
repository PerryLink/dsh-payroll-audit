# dsh-payroll-audit — Payroll audit (Português)

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-payroll-audit?metric=downloads)](https://dshfind.com/en/plugins/PerryLink/dsh-payroll-audit?ref=badge)

`dsh-payroll-audit` confere uma folha de pagamento contra parâmetros publicados de previdência, fundo de garantia e imposto de renda, e reporta cada diferença com a cláusula de origem e o valor em jogo.

O resultado tem quatro valores: `pass`, `pass_with_gaps`, `review`, `fail`. Uma regra cujo parâmetro nunca foi obtido fica **desabilitada e listada**, de modo que «sem achados» nunca é apresentado como «em conformidade».

## Install

```sh
dsh plugin --profile <name> add dsh-payroll-audit
dsh --profile <name> --dump-config | grep 'dsh-payroll-audit'
```

## What it looks like

![Workflow diagram for dsh-payroll-audit: document → rule pack → findings.](docs/assets/dsh-payroll-audit-flow.svg)

*Workflow overview: document → rule pack → findings.*

**Limite:** é uma verificação aritmética e de consistência de campos, não uma declaração, um parecer ou uma determinação da relação de trabalho. Não transmite nada, não substitui a apuração do órgão gestor e não diz se alguém deve estar filiado. Regras que não puderam rodar são listadas como tal.

## What it answers

- A base declarada está dentro do piso e do teto do período?
- As contribuições equivalem à base vezes a alíquota publicada?
- O líquido decorre do bruto menos os descontos?
- Quais regras não puderam rodar por falta de parâmetro?

## Standards it follows

Cada regra cita um documento. Os pacotes trazem as citações com fonte, localizador e trecho literal. Parâmetros não obtidos são declarados `pending` com o motivo, e as regras correspondentes ficam em `disabled_rules` e nunca são avaliadas.

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
