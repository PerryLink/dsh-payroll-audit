/**
 * The payroll rule engine.
 *
 * A rule pack declares derived columns as expressions and rules as conditions over
 * those columns. This module evaluates one row at a time and decides, per rule,
 * whether it fired, was skipped for lack of input, or was never applicable.
 *
 * The four-state outcome is the point of the whole design:
 *
 *  - `fail`            at least one rule fired with `verdict: fail`
 *  - `review`          a rule fired with `verdict: review`, or a rule that could
 *                      change the outcome could not be evaluated
 *  - `pass_with_gaps`  no failure, but some rules were not checked, so the row is
 *                      not *proven* clean
 *  - `pass`            every applicable rule ran and none failed
 *
 * Collapsing `pass_with_gaps` into `pass` is the mistake this engine exists to
 * prevent: a missing medical rate would otherwise read as "medical contributions
 * are correct".
 */

import { evaluate, inputsOf, parseExpr, type EvalContext, type Node } from './expr.ts'
import type { Params } from './params.ts'
import { parseYaml } from './shared/yaml.ts'

/** One comparison in a `when` block. */
export interface Comparison {
  /** Row field or derived column to test. */
  field: string
  /** Comparison operator. */
  op: string
  /** Literal value. */
  value?: unknown
  /** Derived column or field to compare against. */
  ref?: string
}

/** A condition tree: a comparison, or a group of them. */
export type Condition = Comparison | { all_of: Condition[] } | { any_of: Condition[] } | { not: Condition }

/** True when the value is a group rather than a comparison. */
function isGroup(value: Condition): value is { all_of: Condition[] } | { any_of: Condition[] } | { not: Condition } {
  return 'all_of' in value || 'any_of' in value || 'not' in value
}

/** A rule as declared by a pack. */
export interface Rule {
  id: string
  when: { all_of?: Condition[] }
  then: {
    verdict: 'fail' | 'pass' | 'review'
    severity: string
    reason_code: string
    cite?: string[]
    message?: string
  }
  impact?: { expr?: string; unit?: string; excludes?: string[] }
  require_fields?: string[]
  note?: string
}

/** A loaded rule pack. */
export interface RulePack {
  id: string
  title: string
  version: string
  cityCode: string
  jurisdiction: string
  periodScope: string[]
  rules: Rule[]
  derived: { name: string; expr: string }[]
  /** Citation table, by id. */
  citations: Map<string, { source: string; locator: string; quote: string }>
  /** Rule ids disabled because a parameter is missing. */
  blockedByGap: Map<string, string>
  /**
   * Rules the pack declares as disabled, with why and what would unblock them.
   *
   * These are deliberately *not* in `rules`: a rule whose parameter was never
   * obtained must not run at all, and it must still appear in the report so that
   * "no finding" is not read as "checked and clean".
   */
  disabled: { id: string; reason: string; unblockBy: string }[]
}

/** A computed derived column, evaluated once per row. */
interface Derived {
  nodes: Map<string, Node>
  /** Fields each derived column depends on, for cycle-free evaluation order. */
  order: string[]
}

/** Raised when a pack cannot be loaded or evaluated. */
export class RulePackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RulePackError'
  }
}

/**
 * Reject a malformed condition before any row is evaluated.
 *
 * A condition that silently parsed into a string (the failure mode this reader
 * had for `- {a: b}`) would make every rule "not applicable" and the report would
 * read as clean. Failing at load time instead is the whole point.
 *
 * @param condition - one entry of `when.all_of`.
 * @param ruleId - for the error message.
 */
function validateCondition(condition: unknown, ruleId: string): void {
  if (condition === null || typeof condition !== 'object') {
    throw new RulePackError(`规则 ${ruleId} 的条件不是映射：${JSON.stringify(condition)}`)
  }
  const entry = condition as Record<string, unknown>
  if (Array.isArray(entry.all_of)) {
    for (const child of entry.all_of) validateCondition(child, ruleId)
    return
  }
  if (Array.isArray(entry.any_of)) {
    for (const child of entry.any_of) validateCondition(child, ruleId)
    return
  }
  if (entry.not !== undefined) {
    validateCondition(entry.not, ruleId)
    return
  }
  if (entry.field === undefined || entry.op === undefined) {
    throw new RulePackError(`规则 ${ruleId} 的条件缺少 field 或 op：${JSON.stringify(entry)}`)
  }
}

/**
 * Load and validate a rule pack.
 *
 * @param yaml - the pack file's text.
 * @returns the parsed pack.
 * @throws RulePackError when the schema does not match or a rule is malformed.
 */
export function loadRulePack(yaml: string): RulePack {
  const parsed = parseYaml(yaml) as Record<string, unknown> | undefined
  if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
    throw new RulePackError('规则包不是映射')
  }
  if (parsed.schema !== 'payroll-audit-rulepack/v1') {
    throw new RulePackError(`规则包 schema 不是 payroll-audit-rulepack/v1：${String(parsed.schema)}`)
  }
  const rawRules = Array.isArray(parsed.rules) ? parsed.rules : []
  if (rawRules.length === 0) throw new RulePackError('规则包没有任何规则')

  const rules: Rule[] = rawRules.map((raw) => {
    const rule = raw as Record<string, unknown>
    const id = String(rule.id ?? '')
    if (id === '') throw new RulePackError('有规则缺少 id')
    const when = rule.when as Record<string, unknown> | undefined
    const allOf = Array.isArray(when?.all_of) ? (when.all_of as Condition[]) : undefined
    if (allOf === undefined) throw new RulePackError(`规则 ${id} 缺少 when.all_of（本引擎只支持 all_of）`)
    for (const condition of allOf) validateCondition(condition, id)
    const then = rule.then as Record<string, unknown> | undefined
    if (then === undefined || then.verdict === undefined || then.reason_code === undefined) {
      throw new RulePackError(`规则 ${id} 缺少 then.verdict 或 then.reason_code`)
    }
    const verdict = String(then.verdict)
    if (verdict !== 'fail' && verdict !== 'pass' && verdict !== 'review') {
      throw new RulePackError(`规则 ${id} 的 verdict「${verdict}」不受支持`)
    }
    return {
      id,
      when: { all_of: allOf },
      then: {
        verdict,
        severity: String(then.severity ?? 'P2'),
        reason_code: String(then.reason_code),
        cite: Array.isArray(then.cite) ? then.cite.map(String) : undefined,
        message: then.message === undefined ? undefined : String(then.message),
      },
      impact: rule.impact as Rule['impact'],
      require_fields: Array.isArray(rule.require_fields) ? rule.require_fields.map(String) : undefined,
      note: rule.note === undefined ? undefined : String(rule.note),
    }
  })

  const derived = (Array.isArray(parsed.derived) ? parsed.derived : []).map((raw) => {
    const entry = raw as Record<string, unknown>
    return { name: String(entry.name ?? ''), expr: String(entry.expr ?? '') }
  })

  const citations = new Map<string, { source: string; locator: string; quote: string }>()
  for (const raw of Array.isArray(parsed.citations) ? parsed.citations : []) {
    const entry = raw as Record<string, unknown>
    const id = String(entry.id ?? '')
    if (id === '') continue
    citations.set(id, {
      source: String(entry.source ?? ''),
      locator: String(entry.locator ?? ''),
      quote: String(entry.quote ?? ''),
    })
  }

  const disabled = (Array.isArray(parsed.disabled_rules) ? parsed.disabled_rules : []).map((raw) => {
    const entry = raw as Record<string, unknown>
    return {
      id: String(entry.id ?? ''),
      reason: String(entry.reason ?? ''),
      unblockBy: String(entry.unblock_by ?? ''),
    }
  })

  for (const entry of disabled) {
    if (rules.some((rule) => rule.id === entry.id)) {
      throw new RulePackError(`规则 ${entry.id} 同时出现在 rules 与 disabled_rules 中，二选一`)
    }
  }


  return {
    id: String(parsed.id ?? ''),
    title: String(parsed.title ?? ''),
    version: String(parsed.version ?? ''),
    cityCode: String(parsed.city_code ?? ''),
    jurisdiction: String(parsed.jurisdiction ?? ''),
    periodScope: Array.isArray(parsed.period_scope) ? parsed.period_scope.map(String) : [],
    rules,
    derived,
    citations,
    blockedByGap: new Map(),
    disabled,
  }
}

/** Build the derived-column expression table, rejecting unknown identifiers early. */
function compileDerived(pack: RulePack): Derived {
  const nodes = new Map<string, Node>()
  const order: string[] = []
  const known = new Set(['p'])
  for (const entry of pack.derived) {
    if (entry.name === '') throw new RulePackError('有派生字段缺少 name')
    nodes.set(entry.name, parseExpr(entry.expr))
    order.push(entry.name)
    known.add(entry.name)
  }
  return { nodes, order }
}

/** Coerce a cell to a number when it looks numeric. */
export function numeric(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const cleaned = value.replace(/[\s,，¥￥]/gu, '')
  if (cleaned === '' || !/^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/u.test(cleaned)) return undefined
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Evaluate one condition against a row; `undefined` means "cannot tell". */
function test(condition: Condition, context: EvalContext, raw: Record<string, string>): boolean | undefined {
  if (isGroup(condition)) {
    if ('not' in condition) {
      const inner = test(condition.not, context, raw)
      return inner === undefined ? undefined : !inner
    }
    const children = 'all_of' in condition ? condition.all_of : condition.any_of
    const isAll = 'all_of' in condition
    let sawIndeterminate = false
    for (const child of children) {
      const result = test(child, context, raw)
      if (result === undefined) {
        sawIndeterminate = true
        continue
      }
      if (isAll && !result) return false
      if (!isAll && result) return true
    }
    // An `all_of` with an unknown child is unknown only if nothing already failed;
    // an `any_of` with an unknown child is unknown only if nothing already passed.
    if (sawIndeterminate) return undefined
    return isAll
  }
  const left = context.fields[condition.field]
  const right = condition.ref === undefined ? condition.value : context.fields[condition.ref]
  switch (condition.op) {
    case 'exists':
      return raw[condition.field] !== undefined && raw[condition.field] !== ''
    case 'absent':
      return raw[condition.field] === undefined || raw[condition.field] === ''
    case 'in':
    case 'not_in': {
      const list = Array.isArray(condition.value) ? condition.value.map(String) : []
      const value = raw[condition.field] ?? ''
      const member = list.includes(value)
      return condition.op === 'in' ? member : !member
    }
    case 'not_superset': {
      // The tested field is a set (comma or pipe separated); the reference is the
      // list it must contain. Used for `insurance_set` coverage.
      const actual = new Set((raw[condition.field] ?? '').split(/[,，|、]/u).map((item) => item.trim()).filter((item) => item !== ''))
      const required = Array.isArray(condition.value) ? condition.value.map(String) : []
      return required.some((item) => !actual.has(item))
    }
    default: {
      if (left === undefined || typeof right !== 'number') return undefined
      switch (condition.op) {
        case '<':
          return left < right
        case '<=':
          return left <= right
        case '>':
          return left > right
        case '>=':
          return left >= right
        case '==':
          return left === right
        case '!=':
          return left !== right
        default:
          throw new RulePackError(`不支持的比较运算符 ${condition.op}`)
      }
    }
  }
}

/** One rule's outcome on one row. */
export interface RuleOutcome {
  ruleId: string
  verdict: 'fail' | 'pass' | 'review' | 'skipped' | 'not-applicable'
  reasonCode: string
  severity: string
  message: string
  impact: number | undefined
  impactUnit: string
  citations: { id: string; source: string; locator: string; quote: string }[]
  /** Whitespace-normalised `note` from the pack, for the report's explanation. */
  note: string
}

/** One row's complete audit. */
export interface RowOutcome {
  /** Row ordinal in the input, 1-based excluding the header. */
  row: number
  employeeId: string
  employeeName: string
  verdict: 'pass' | 'pass_with_gaps' | 'review' | 'fail'
  outcomes: RuleOutcome[]
  /** Rules that could not run, with why. */
  unchecked: { ruleId: string; reason: string }[]
  /** Derived columns, for the report's "how we computed it" trace. */
  derived: Record<string, number>
}

/** The whole audit. */
export interface AuditResult {
  pack: RulePack
  params: Params
  rows: RowOutcome[]
  /** Reason codes seen, in first-seen order. */
  reasonCodes: string[]
  /** Rules the pack disabled, surfaced so the report can list them. */
  disabled: { id: string; reason: string; unblockBy: string }[]
  summary: Record<'pass' | 'pass_with_gaps' | 'review' | 'fail', number>
  warnings: string[]
}

/**
 * Audit every row of a table.
 *
 * @param pack - loaded rule pack.
 * @param params - resolved parameters.
 * @param rows - input rows as string maps.
 * @returns per-row outcomes and aggregate counters.
 */
export function audit(pack: RulePack, params: Params, rows: Record<string, string>[]): AuditResult {
  const derivedTable = compileDerived(pack)
  const paramValues: Record<string, number | undefined> = {}
  for (const [key, entry] of Object.entries(params.values)) paramValues[key] = entry.value

  const blocked = new Map<string, string>()
  for (const gap of params.gaps) for (const ruleId of gap.blocks) blocked.set(ruleId, gap.reason)
  pack.blockedByGap = blocked

  const warnings: string[] = [...params.warnings]
  const outcomes: RowOutcome[] = []
  const reasonCodes: string[] = []
  const summary = { pass: 0, pass_with_gaps: 0, review: 0, fail: 0 }

  rows.forEach((raw, index) => {
    const fields: Record<string, number | undefined> = {}
    for (const [key, value] of Object.entries(raw)) fields[key] = numeric(value)

    // Named fields the packs address directly.
    for (const name of ['base_declared', 'gross_pay', 'net_pay', 'hf_base']) {
      if (fields[name] === undefined) fields[name] = numeric(raw[name])
    }

    const context: EvalContext = { fields, params: paramValues, brackets: params.brackets }
    const derived: Record<string, number> = {}
    for (const name of derivedTable.order) {
      const node = derivedTable.nodes.get(name)
      if (node === undefined) continue
      try {
        const value = evaluate(node, context)
        derived[name] = value
        fields[name] = value
      } catch {
        // A derived column whose inputs are absent stays absent; a rule that needs
        // it becomes unchecked rather than being evaluated against a zero.
      }
    }

    const rowOutcomes: RuleOutcome[] = []
    const unchecked: { ruleId: string; reason: string }[] = []

    for (const rule of pack.rules) {
      const gapReason = blocked.get(rule.id)
      if (gapReason !== undefined) {
        unchecked.push({ ruleId: rule.id, reason: `参数缺口：${gapReason}` })
        rowOutcomes.push({
          ruleId: rule.id,
          verdict: 'skipped',
          reasonCode: 'PARAM_GAP',
          severity: rule.then.severity,
          message: `未执行：${gapReason}`,
          impact: undefined,
          impactUnit: '',
          citations: [],
          note: rule.note ?? '',
        })
        continue
      }

      const missing = (rule.require_fields ?? []).filter((field) => raw[field] === undefined || raw[field] === '')
      if (missing.length > 0) {
        unchecked.push({ ruleId: rule.id, reason: `缺少字段 ${missing.join('、')}` })
        rowOutcomes.push({
          ruleId: rule.id,
          verdict: 'skipped',
          reasonCode: 'FIELD_MISSING',
          severity: rule.then.severity,
          message: `未执行：缺少字段 ${missing.join('、')}`,
          impact: undefined,
          impactUnit: '',
          citations: [],
          note: rule.note ?? '',
        })
        continue
      }

      let matched = true
      let indeterminate = false
      for (const condition of rule.when.all_of ?? []) {
        const result = test(condition, context, raw)
        if (result === undefined) {
          indeterminate = true
          break
        }
        if (!result) {
          matched = false
          break
        }
      }
      if (indeterminate) {
        unchecked.push({ ruleId: rule.id, reason: '条件中的字段或派生值无法计算' })
        rowOutcomes.push({
          ruleId: rule.id,
          verdict: 'skipped',
          reasonCode: 'NOT_EVALUABLE',
          severity: rule.then.severity,
          message: '未执行：条件无法求值',
          impact: undefined,
          impactUnit: '',
          citations: [],
          note: rule.note ?? '',
        })
        continue
      }
      if (!matched) {
        rowOutcomes.push({
          ruleId: rule.id,
          verdict: 'not-applicable',
          reasonCode: '',
          severity: rule.then.severity,
          message: '',
          impact: undefined,
          impactUnit: '',
          citations: [],
          note: rule.note ?? '',
        })
        continue
      }

      let impact: number | undefined
      if (rule.impact?.expr !== undefined) {
        try {
          impact = evaluate(parseExpr(rule.impact.expr), context)
        } catch {
          impact = undefined
        }
      }
      const citations = (rule.then.cite ?? []).map((id) => {
        const citation = pack.citations.get(id)
        return citation === undefined
          ? { id, source: '(规则包未提供该引文)', locator: '', quote: '' }
          : { id, ...citation }
      })
      if ((rule.then.cite ?? []).length === 0) warnings.push(`规则 ${rule.id} 没有引文（cite 为空）`)

      rowOutcomes.push({
        ruleId: rule.id,
        verdict: rule.then.verdict,
        reasonCode: rule.then.reason_code,
        severity: rule.then.severity,
        message: rule.then.message ?? rule.note ?? '',
        impact,
        impactUnit: rule.impact?.unit ?? '',
        citations,
        note: rule.note ?? '',
      })
      if (!reasonCodes.includes(rule.then.reason_code)) reasonCodes.push(rule.then.reason_code)
    }

    const effective = rowOutcomes.filter((item) => item.verdict === 'fail' || item.verdict === 'pass' || item.verdict === 'review')
    const hasFail = effective.some((item) => item.verdict === 'fail')
    const hasReview = effective.some((item) => item.verdict === 'review')
    const verdict: RowOutcome['verdict'] = hasFail
      ? 'fail'
      : hasReview
        ? 'review'
        : unchecked.length > 0
          ? 'pass_with_gaps'
          : 'pass'
    summary[verdict] += 1

    outcomes.push({
      row: index + 1,
      employeeId: raw.employee_id ?? '',
      employeeName: raw.employee_name ?? '',
      verdict,
      outcomes: rowOutcomes,
      unchecked,
      derived,
    })
  })

  return { pack, params, rows: outcomes, reasonCodes, disabled: pack.disabled, summary, warnings }
}
