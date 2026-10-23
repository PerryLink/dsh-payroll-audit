/**
 * Markdown report for a payroll audit.
 *
 * The report leads with what was *not* checked. A document that lists ten findings
 * and omits that two rules could not run reads as "ten findings and everything
 * else is fine", which is the opposite of the truth.
 */

import type { AuditResult, RowOutcome } from './engine.ts'

/** Chinese label for a four-state verdict. */
const VERDICT_LABEL: Record<RowOutcome['verdict'], string> = {
  fail: '不通过',
  review: '需人工确认',
  pass_with_gaps: '通过但有未核验项',
  pass: '通过',
}

/**
 * Render the audit as markdown.
 *
 * @param result - the audit outcome.
 * @param source - the payroll file path.
 * @returns markdown text.
 */
export function renderMarkdown(result: AuditResult, source: string): string {
  const lines: string[] = []
  const { pack, params, summary } = result

  lines.push(`# 算薪核验 · ${pack.title}`)
  lines.push('')
  lines.push(`- 检查对象：${source}`)
  lines.push(`- 适用地区：${pack.jurisdiction}（${pack.cityCode}）`)
  lines.push(`- 规则包：${pack.id} v${pack.version}｜${pack.rules.length} 条规则`)
  lines.push(`- 参数：${params.city}，复核截止 ${params.reviewBy}`)
  lines.push(
    `- 结果统计：不通过 ${summary.fail} · 需人工确认 ${summary.review} · 通过但有未核验项 ${summary.pass_with_gaps} · 通过 ${summary.pass}`,
  )
  lines.push('')

  // Coverage first: what could not be checked.
  const allUnchecked = new Map<string, number>()
  for (const row of result.rows) {
    for (const item of row.unchecked) allUnchecked.set(item.reason, (allUnchecked.get(item.reason) ?? 0) + 1)
  }
  if (result.disabled.length > 0) {
    lines.push('## 未核验项（不代表合规）')
    lines.push('')
    lines.push('以下规则因参数未取得而**关闭**，本次没有执行：')
    lines.push('')
    for (const rule of result.disabled) {
      lines.push(`- \`${rule.id}\`：${rule.reason}`)
      if (rule.unblockBy !== '') lines.push(`  - 解封条件：${rule.unblockBy}`)
    }
    lines.push('')
  }

  if (params.gaps.length > 0) {
    lines.push('## 参数缺口')
    lines.push('')
    for (const gap of params.gaps) {
      lines.push(`- **${gap.key}**：${gap.reason}`)
      if (gap.blocks.length > 0) lines.push(`  - 受影响规则：${gap.blocks.join('、')}`)
    }
    lines.push('')
  }

  lines.push('## 逐人结果')
  lines.push('')
  lines.push('| 行 | 工号 | 姓名 | 结论 | 未核验项 |')
  lines.push('|---|---|---|---|---|')
  for (const row of result.rows) {
    lines.push(`| ${row.row} | ${row.employeeId} | ${row.employeeName} | ${VERDICT_LABEL[row.verdict]} | ${row.unchecked.length} |`)
  }
  lines.push('')

  const withFindings = result.rows.filter((row) => row.outcomes.some((o) => o.verdict === 'fail' || o.verdict === 'review'))
  if (withFindings.length === 0) {
    lines.push('## 未发现差异')
    lines.push('')
    lines.push('所有可执行的规则均已执行，且未发现问题。未核验项见上。')
  } else {
    lines.push('## 差异明细')
    lines.push('')
    for (const row of withFindings) {
      lines.push(`### 第 ${row.row} 行 · ${row.employeeName || row.employeeId}`)
      lines.push('')
      for (const outcome of row.outcomes) {
        if (outcome.verdict !== 'fail' && outcome.verdict !== 'review') continue
        const impact = outcome.impact === undefined ? '' : `｜影响约 ${outcome.impact.toFixed(2)} ${outcome.impactUnit}`
        lines.push(`- **[${outcome.severity}] ${outcome.reasonCode}**${impact}`)
        if (outcome.note !== '') lines.push(`  - 说明：${outcome.note.replace(/\s+/gu, ' ')}`)
        for (const citation of outcome.citations) {
          lines.push(`  - 依据：${citation.source}（${citation.locator}）`)
          if (citation.quote !== '') lines.push(`    > ${citation.quote.replace(/\s+/gu, ' ')}`)
        }
      }
      lines.push('')
    }
  }

  if (result.warnings.length > 0) {
    lines.push('## 提示')
    lines.push('')
    for (const warning of [...new Set(result.warnings)]) lines.push(`- ${warning}`)
    lines.push('')
  }

  lines.push('## 边界')
  lines.push('')
  lines.push('本报告只核对工资表与已公开参数之间的算术与字段一致性，不代申报，不替代社保经办机构核定，也不对用工关系作判断。')
  lines.push('「未核验」不等于「合规」：参数未取得或字段缺失时，对应规则不执行，并在上面的参数缺口与未核验项中列出。')
  lines.push('')
  return lines.join('\n')
}
