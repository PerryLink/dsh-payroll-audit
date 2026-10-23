import Schema from '@deepseek-ai/schemastery'

/** Tunables an operator can change from `cordis.yml`. */
export interface Config {
  /** Tool timeout budget in milliseconds. */
  timeoutMs: number
  /** Rule-pack path relative to the package root. */
  rulePackFile: string
  /** Parameter-document path relative to the package root. */
  paramsFile: string
}

export const Config: Schema<Config> = Schema.object({
  timeoutMs: Schema.number().default(120_000).description('工具超时预算（毫秒）。'),
  rulePackFile: Schema.string().default('rules/payroll-bj-2026.yaml').description('规则包路径。'),
  paramsFile: Schema.string().default('rules/params-110000.yaml').description('参数文件路径。'),
})
