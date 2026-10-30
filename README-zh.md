# dsh-payroll-audit — 工资表核算核对

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

<!-- topblock:v1 -->
> **这是什么**　按已核实的社保、公积金、个税参数核对工资表，逐条给出差异和依据。
> **给谁用**　薪酬、人事、财务。
> **你交什么**　一份工资表（表格）；不改原件。
> **它不做什么**　不判合规、不认定责任、不替代审核人；只列材料内部能逐条指认的差异。
> **怎么开始**　命令行安装（暂未单独上架）：
> `dsh plugin --profile <name> add dsh-payroll-audit`
<!-- /topblock:v1 -->

[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-payroll-audit?metric=downloads)](https://dshfind.com/en/plugins/PerryLink/dsh-payroll-audit?ref=badge)

`dsh-payroll-audit` 按已公开的社保、公积金与个税参数核对一张工资表，逐条给出差异、所依据的条款与涉及金额。

结论刻意做成四态：`pass`、`pass_with_gaps`、`review`、`fail`。参数没取到的规则会被**停用并列出**，所以「没发现问题」永远不会被渲染成「合规」。参数文件自带 `next_review_by` 复核截止日；参数过期时，相关规则降级为 `review`，不拿去年的数字下判断。

## Install

```sh
dsh plugin --profile <name> add dsh-payroll-audit
dsh --profile <name> --dump-config | grep 'dsh-payroll-audit'
```

## What it looks like

![Workflow diagram for dsh-payroll-audit: document → rule pack → findings.](docs/assets/dsh-payroll-audit-flow.svg)

*Workflow overview: document → rule pack → findings.*

**边界：** 这是算术与字段一致性核对，不是申报、不是审计意见，也不判断用工关系。它不代申报、不替代社保经办机构核定、也不告诉你某个人该不该参保。两个后果在报告里都看得见：无法执行的规则会单独列出；措辞从不说「合规」，只说「已核验项未发现差异」。

## What it answers

- 申报的缴费基数是否落在该城市该期间的上下限内？
- 缴费金额是否等于基数乘以已公布的费率？
- 实发是否等于应发减去各项扣款？
- 哪些规则因为参数没取到而根本没能执行？

## Standards it follows

每条规则都带引文。规则包自带引用表，每条引文都有出处、定位与逐字引用，读者可以自己去核：

- 北京社保基数上下限：北京市人社局 2026 年度通告（7,270 / 36,348）。
- 北京公积金：5%–12%，基数 2,540–36,348。
- 上海：基数上下限，公积金**5%–7%** —— 不是国家条例的 5%–12%，所以区间从参数文件读，不写死。
- 个税：累计预扣法，依国家税务总局公告 2018 年第 61 号。

未取到的参数在文件里声明为 `pending`，写明原因与解封条件；对应规则列在 `disabled_rules` 中，永不执行。

## Compatibility

| Surface | Status |
|---|---|
| Harness | peer range `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | all (pure ESM; no native code, no network, no model call) |

## What it does

逐行计算规则包声明的派生列（受限算术，不用 `eval`），再判定每条规则的条件。命中的规则贡献 `reason_code`、严重度、影响金额与引文。规则聚合成上面说的四态结论。

参数用点号键寻址（`si.base.floor`、`hf.fund.employee_max`、`iit.extra.child_edu_monthly`），从官方参数文件解析。声明为缺失的值解析成**空**，不是 0。

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `rulesFile` | `rules/payroll-audit.yaml` | 规则库路径 |

## Material format

工资表是一人一行的表格。规则包读取的字段包括：

| 字段 | 含义 |
|---|---|
| `period` | `2026-07`，用于选择参数的生效区间 |
| `base_declared` | 申报的缴费基数 |
| `gross_pay`、`net_pay` | 应发与实发 |
| `employer_pension`、`employee_pension` | 实际缴纳的养老（单位/个人） |
| `ee_unemployment`、`ee_medical`、`ee_hf` | 个人侧各项 |
| `hf_base`、`hf_employer_rate`、`hf_employee_rate` | 公积金输入 |
| `insurance_set` | 参保险种，逗号分隔 |

文件经由 `dsh-table-ingest` 读取，因此 `.xlsx`、`.xlsm`、`.csv` 都支持。

## Rule sources

没有独立取证目录：引文就在规则包里，紧挨着使用它的规则，`check:citations` 逐条校验它在引用表中逐字出现。

已知边界：两个包覆盖北京与上海 2026-07 起；更早的期间没有参数，所有规则降级为缺口。医疗、生育、工伤档次与最低工资四项因未取得一手费率而停用，每项都写明解封条件。引擎不代申报，也不计算更正后的工资表。

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

完整清单（62 个核查器 + 通用插件）见 [按材料选核查器](https://perrylink.github.io/zh/checkers/choose/)；本仓只是其中一个。

## License

[Apache License 2.0](LICENSE) © 2026 dsh-payroll-audit contributors.
