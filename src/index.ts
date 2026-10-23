import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ingestToTable } from 'dsh-table-ingest/api'
import { Config } from './config.ts'
import type { Config as ConfigShape } from './config.ts'
import { audit } from './engine.ts'
import { loadRulePack } from './engine.ts'
import { loadParams } from './params.ts'
import { renderMarkdown } from './report.ts'

export const name = 'dsh-payroll-audit'
export const inject = ['tools']
export { Config }

/** Tool id exposed to the model, and the row id in `cordis.patch.yml`. */
export const TOOL_NAME = 'payroll_audit'

/**
 * Resolve a package-owned file such as the rule pack.
 *
 * @param relative - configured path, relative to the package root.
 * @returns the resolved absolute path.
 * @throws Error naming every location tried, when the file is absent.
 */
export function resolvePackageFile(relative: string): string {
  if (isAbsolute(relative)) return relative
  const tried: string[] = []
  let directory = import.meta.dirname
  for (;;) {
    const candidate = join(directory, relative)
    tried.push(candidate)
    if (existsSync(candidate)) return candidate
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  const fromCwd = resolve(relative)
  tried.push(fromCwd)
  if (existsSync(fromCwd)) return fromCwd
  throw new Error(`找不到 ${relative}；尝试过：\n${tried.join('\n')}`)
}

/**
 * Register the payroll audit tool.
 *
 * @param ctx - plugin context, with `tools` already available.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: ConfigShape): () => void {
  return ctx.tools.register(
    defineTool({
      name: TOOL_NAME,
      description:
        '按已核实的社保/公积金/个税参数核对一张工资表，逐条给出差异、影响金额与条款依据。' +
        '只输出差异供人复核，不代申报、不替代经办机构核定。参数未取得或字段缺失时，对应规则不执行，结论会标为「未核验」，不等于合规。',
      parameters: {
        file: { type: 'string', description: '工资表文件绝对路径（.xlsx / .xlsm / .csv）。' },
        period: { type: 'string', description: '工资所属期，形如 2026-07。用于选择参数的生效区间。' },
        rulePackFile: { type: 'string', description: '覆盖配置中的规则包路径（相对包根或绝对路径）。' },
        paramsFile: { type: 'string', description: '覆盖配置中的参数文件路径。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            plugin: { type: 'string' },
            target: { type: 'string' },
            pack: { type: 'string' },
            city: { type: 'string' },
            summary: {
              type: 'object',
              additionalProperties: false,
              properties: {
                fail: { type: 'integer' },
                review: { type: 'integer' },
                pass_with_gaps: { type: 'integer' },
                pass: { type: 'integer' },
              },
            },
            rowCount: { type: 'integer' },
            findingCount: { type: 'integer' },
            uncheckedCount: { type: 'integer' },
            parameterGaps: { type: 'array', items: { type: 'string' } },
            markdown: { type: 'string' },
            resultJson: { type: 'string' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: (value as { markdown: string }).markdown }],
      },
      timeoutMs: config.timeoutMs,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        if (args.file === undefined || args.file.trim() === '') throw new Error('必须提供 file')
        const path = resolve(args.file)
        exec.signal.throwIfAborted()
        const buffer = await readFile(path)

        const packPath = resolvePackageFile(args.rulePackFile?.trim() || config.rulePackFile)
        const paramsPath = resolvePackageFile(args.paramsFile?.trim() || config.paramsFile)
        const pack = loadRulePack(await readFile(packPath, 'utf8'))

        const ingested = ingestToTable(buffer, path)
        if (!ingested.ok || ingested.table === undefined) {
          throw new Error(`无法从 ${path} 抽出表格：${ingested.error ?? '未知原因'}`)
        }
        const rows = ingested.table.rows
        const period = args.period?.trim() || rows[0]?.['period'] || ''
        if (period === '') throw new Error('无法确定工资所属期：请传入 period（形如 2026-07），或让表中含 period 列')

        const params = loadParams(await readFile(paramsPath, 'utf8'), period)
        exec.signal.throwIfAborted()

        const result = audit(pack, params, rows)
        const markdown = renderMarkdown(result, path)
        const findingCount = result.rows.reduce(
          (total, row) => total + row.outcomes.filter((o) => o.verdict === 'fail' || o.verdict === 'review').length,
          0,
        )
        const uncheckedCount = result.rows.reduce((total, row) => total + row.unchecked.length, 0)

        return {
          plugin: name,
          target: path,
          pack: `${pack.id} v${pack.version}`,
          city: params.city,
          summary: result.summary,
          rowCount: result.rows.length,
          findingCount,
          uncheckedCount,
          parameterGaps: params.gaps.map((gap) => `${gap.key}: ${gap.reason}`),
          markdown,
          resultJson: JSON.stringify({
            pack: pack.id,
            city: params.city,
            period,
            summary: result.summary,
            rows: result.rows.map((row) => ({
              row: row.row,
              employeeId: row.employeeId,
              verdict: row.verdict,
              unchecked: row.unchecked,
              findings: row.outcomes
                .filter((o) => o.verdict === 'fail' || o.verdict === 'review')
                .map((o) => ({
                  ruleId: o.ruleId,
                  reasonCode: o.reasonCode,
                  severity: o.severity,
                  impact: o.impact,
                  unit: o.impactUnit,
                  citations: o.citations.map((c) => c.id),
                })),
            })),
            parameterGaps: params.gaps,
          }),
        }
      },
    }),
  )
}
