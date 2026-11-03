/**
 * Minimal first run for dsh-payroll-audit.
 *
 * Input: `input/payroll-2026-07.csv` is a hand-written synthetic payroll table
 * for Beijing in period 2026-07. Three employees: one consistent row, one whose
 * declared contribution base is below the published floor, and one whose
 * employer pension does not match the published rate.
 *
 * The period is pinned because the parameter document is chosen by its effective
 * date range; the rule pack and parameter file come from the package defaults.
 *
 *   node samples/quickstart/run.mjs           human-readable summary
 *   node samples/quickstart/run.mjs --json    the same summary as JSON
 *   node samples/quickstart/run.mjs --check   compare against expected/result.json
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as plugin from '../../lib/index.mjs'

const here = dirname(fileURLToPath(import.meta.url))

const registered = []
const ctx = { tools: { register: (tool) => { registered.push(tool); return () => {} } } }
plugin.apply(ctx, plugin.Config({}))
const tool = registered.find((t) => t.name === plugin.TOOL_NAME)
if (!tool) throw new Error('tool not registered: ' + plugin.TOOL_NAME)

const result = await tool.execute(
  {
    file: join(here, 'input', 'payroll-2026-07.csv'),
    period: '2026-07',
  },
  { signal: new AbortController().signal },
)

const summary = {
  tool: tool.name,
  pack: result.pack,
  city: result.city,
  rowCount: result.rowCount,
  summary: result.summary,
  findingCount: result.findingCount,
  uncheckedCount: result.uncheckedCount,
  parameterGapCount: result.parameterGaps.length,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2))
} else if (process.argv.includes('--check')) {
  const expected = JSON.parse(await readFile(join(here, 'expected', 'result.json'), 'utf8'))
  if (JSON.stringify(summary, null, 2) !== JSON.stringify(expected, null, 2)) {
    console.error('quickstart: output differs from expected/result.json')
    console.error('--- expected\n' + JSON.stringify(expected, null, 2))
    console.error('--- actual\n' + JSON.stringify(summary, null, 2))
    process.exit(1)
  }
  console.log(`${tool.name}: quickstart OK — output matches expected/result.json`)
} else {
  const s = summary.summary
  console.log('$ node samples/quickstart/run.mjs')
  console.log(
    `${tool.name}: ${summary.rowCount} rows, ${summary.findingCount} finding(s) — ` +
      `fail ${s.fail}, review ${s.review}, pass_with_gaps ${s.pass_with_gaps}, pass ${s.pass}`,
  )
  console.log(`unchecked items: ${summary.uncheckedCount}; parameter gaps: ${summary.parameterGapCount}`)
}
