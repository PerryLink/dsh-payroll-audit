/**
 * Payroll audit against the two shipped packs.
 *
 * The cases here are the ones from the specification's acceptance suite, chosen
 * because each is constructed to fool a plausible wrong implementation. Two of
 * them matter most:
 *
 *  - A high earner whose base is already capped at the ceiling must not be
 *    reported as under-paying. Recomputing "base × rate" from gross pay gets this
 *    wrong for almost every senior employee.
 *  - Shanghai's housing-fund maximum is 7%, not the 5%–12% in the national
 *    regulation. Hard-coding 12% would let a 12% contribution in Shanghai pass.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadParams } from '../src/params.ts'
import { audit, loadRulePack } from '../src/engine.ts'
import { renderMarkdown } from '../src/report.ts'
import { parseExpr, evaluate } from '../src/expr.ts'

const HERE = import.meta.dirname
const fixture = (name: string): string => readFileSync(join(HERE, 'fixtures', name), 'utf8')

/** The Beijing pack and its parameters. */
function beijing() {
  return {
    pack: loadRulePack(fixture('bj-rulepack.yaml')),
    params: loadParams(fixture('110000.yaml'), '2026-07'),
  }
}

/** Case C1's row: base below the floor, everything else internally consistent. */
function belowFloorRow(): Record<string, string> {
  return {
    employee_id: 'E001',
    employee_name: '张伟',
    city_code: '110000',
    period: '2026-07',
    person_type: 'regular',
    base_declared: '7000',
    gross_pay: '12000',
    employer_pension: '1120.00',
    employee_pension: '560.00',
    ee_medical: '140.00',
    ee_unemployment: '35.00',
    ee_injury: '0',
    ee_hf: '840.00',
    hf_base: '7000',
    hf_employer_rate: '0.12',
    hf_employee_rate: '0.12',
    insurance_set: 'pension,medical,unemployment,injury',
    iit_withheld: '0',
    other_deduction: '0',
    net_pay: '10425.00',
  }
}

describe('expression language', () => {
  const context = {
    fields: { base_declared: 7000, iit_taxable_cum: 7000 },
    params: { 'si.pension.employer': 0.16, 'si.base.floor': 7270 },
    brackets: { 'iit.withholding': [{ upper: 36000, rate: 0.03, quick: 0 }] },
  }

  it('evaluates a derived expression with a parameter reference', () => {
    const node = parseExpr("round(p('si.base.floor') - base_declared, 2)")
    expect(evaluate(node, context)).toBe(270)
  })

  it('rounds half away from zero, matching the pack rounding rule', () => {
    expect(evaluate(parseExpr('round(2.345, 2)'), context)).toBe(2.35)
    expect(evaluate(parseExpr('round(-2.345, 2)'), context)).toBe(-2.35)
  })

  it('looks a value up in a progressive table', () => {
    expect(evaluate(parseExpr("bracket_rate(iit_taxable_cum, 'iit.withholding')"), context)).toBe(0.03)
  })

  it('refuses a string literal outside a bracket lookup', () => {
    // Parsing accepts the literal; evaluating it is what fails, because a string
    // is only meaningful as a table name for bracket_rate/bracket_quick.
    expect(() => evaluate(parseExpr("nz('x')"), context)).toThrow()
  })

  it('refuses division by zero rather than returning Infinity', () => {
    expect(() => evaluate(parseExpr('base_declared / 0'), context)).toThrow()
  })

  it('rejects an unknown function at parse time', () => {
    expect(() => parseExpr('eval(base_declared)')).toThrow()
  })
})

describe('parameters', () => {
  it('resolves the Beijing figures the packs reference', () => {
    const params = loadParams(fixture('110000.yaml'), '2026-07')
    expect(params.values['si.base.floor']?.value).toBe(7270)
    expect(params.values['si.base.ceiling']?.value).toBe(36348)
    expect(params.values['si.pension.employer']?.value).toBe(0.16)
    expect(params.values['si.unemployment.employee']?.value).toBe(0.005)
  })

  it('exposes Shanghai housing-fund rates as 5%–7%, not the national 5%–12%', () => {
    const params = loadParams(fixture('310000.yaml'), '2026-07')
    expect(params.values['hf.fund.employee_max']?.value).toBe(0.07)
    expect(params.values['hf.fund.employee_min']?.value).toBe(0.05)
  })

  it('reports a declared gap instead of substituting zero', () => {
    const params = loadParams(fixture('110000.yaml'), '2026-07')
    const medical = params.gaps.find((gap) => gap.key === 'medical')
    expect(medical).toBeDefined()
    expect(medical?.blocks.length).toBeGreaterThan(0)
    // The value must be absent, not 0: a rule reading it would otherwise compute
    // with a rate of zero and pass.
    expect(params.values['si.medical.employer']).toBeUndefined()
  })

  it('carries provenance so a finding can cite the document', () => {
    const params = loadParams(fixture('110000.yaml'), '2026-07')
    const entry = params.values['si.base.floor']
    expect(entry?.from.document).toContain('缴费工资基数')
    expect(entry?.from.evidence).toBe('verbatim')
    expect(entry?.from.url).toContain('beijing.gov.cn')
  })

  it('rejects a document that is not a payroll-params file', () => {
    expect(() => loadParams('schema: other/v1', undefined)).toThrow()
  })
})

describe('rule pack', () => {
  it('loads every rule and derived column', () => {
    const { pack } = beijing()
    expect(pack.rules.length).toBe(17)
    expect(pack.derived.length).toBeGreaterThan(20)
    expect(pack.citations.size).toBeGreaterThan(0)
  })

  it('carries citations that were quoted verbatim', () => {
    const { pack } = beijing()
    const citation = pack.citations.get('c_bj_si_limit')
    expect(citation?.quote).toContain('36348')
    expect(citation?.locator).not.toBe('')
  })

  it('refuses a pack whose condition lost its fields', () => {
    const broken = `schema: payroll-audit-rulepack/v1
id: x
rules:
  - id: r1
    when:
      all_of:
        - "{field: a, op: exists}"
    then: {verdict: fail, reason_code: X}
`
    expect(() => loadRulePack(broken)).toThrow()
  })
})

describe('audit', () => {
  it('fails a base below the floor and does not also report a rate error', () => {
    const { pack, params } = beijing()
    const result = audit(pack, params, [belowFloorRow()])
    const row = result.rows[0]
    expect(row?.verdict).toBe('fail')
    const codes = row?.outcomes.filter((o) => o.verdict === 'fail').map((o) => o.reasonCode) ?? []
    expect(codes).toContain('SI_BASE_BELOW_FLOOR')
    // The same error must not be reported twice through the rate rules.
    expect(codes).not.toContain('SI_PENSION_EMPLOYER_MISMATCH')
    expect(codes).not.toContain('SI_PENSION_EMPLOYEE_MISMATCH')
  })

  it('computes the impact of a below-floor base', () => {
    const { pack, params } = beijing()
    const result = audit(pack, params, [belowFloorRow()])
    const finding = result.rows[0]?.outcomes.find((o) => o.reasonCode === 'SI_BASE_BELOW_FLOOR')
    // (7270 - 7000) × (16% + 8% + 2 × 0.5%) = 67.50
    expect(finding?.impact).toBeCloseTo(67.5, 2)
    expect(finding?.impactUnit).toContain('CNY')
  })

  it('does not report a high earner whose base is already capped', () => {
    const { pack, params } = beijing()
    const capped = {
      ...belowFloorRow(),
      employee_id: 'E002',
      base_declared: '36348',
      gross_pay: '60000',
      employer_pension: '5815.68',
      employee_pension: '2907.84',
      ee_unemployment: '181.74',
      ee_hf: '4361.76',
      hf_base: '36348',
      net_pay: '60000',
    }
    const result = audit(pack, params, [capped])
    const failures = result.rows[0]?.outcomes.filter((o) => o.verdict === 'fail').map((o) => o.reasonCode) ?? []
    expect(failures).not.toContain('SI_BASE_ABOVE_CEILING_UNCAPPED')
  })

  it('marks a row with missing fields as pass_with_gaps, never pass', () => {
    const { pack, params } = beijing()
    const sparse = { employee_id: 'E003', employee_name: '王芳', period: '2026-07' }
    const result = audit(pack, params, [sparse])
    expect(result.rows[0]?.verdict).not.toBe('pass')
    expect(result.rows[0]?.unchecked.length).toBeGreaterThan(0)
  })

  it('surfaces the rules the pack disabled instead of silently omitting them', () => {
    const { pack, params } = beijing()
    const result = audit(pack, params, [belowFloorRow()])
    // These rules are not in `rules` at all; a report that just lists findings
    // would read as "medical contributions are fine".
    expect(result.disabled.length).toBeGreaterThan(0)
    const medical = result.disabled.find((rule) => rule.id.includes('medical'))
    expect(medical).toBeDefined()
    expect(medical?.reason).not.toBe('')
    expect(medical?.unblockBy).not.toBe('')
    const markdown = renderMarkdown(result, 'x.xlsx')
    expect(markdown).toContain('本次没有执行')
    expect(markdown).toContain(medical?.id ?? '')
  })

  it('every firing rule carries a citation', () => {
    const { pack, params } = beijing()
    const result = audit(pack, params, [belowFloorRow()])
    for (const outcome of result.rows[0]?.outcomes ?? []) {
      if (outcome.verdict === 'fail' || outcome.verdict === 'pass' || outcome.verdict === 'review') {
        expect(outcome.citations.length, `规则 ${outcome.ruleId} 没有引文`).toBeGreaterThan(0)
      }
    }
  })
})
