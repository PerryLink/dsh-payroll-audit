/**
 * Parameter loading for payroll rule packs.
 *
 * A pack does not read the parameter YAML directly; it asks for dotted keys such
 * as `si.base.floor`. This module is the one place that knows how the published
 * parameter document is shaped, so a rule pack can stay stable when the document
 * gains a field.
 *
 * Two behaviours matter more than the mapping itself:
 *
 *  - **A parameter that is declared `pending` resolves to nothing.** The pack's
 *    own `pending[].blocks_checks` disables the affected rules and the report
 *    lists the gap. Substituting a national constant or zero would turn "we do not
 *    know the Beijing medical rate" into "the rate is zero", which is a wrong
 *    answer rather than an absent one.
 *  - **Every value carries its provenance** (`doc_no`, `source_url`,
 *    `evidence_level`), so a finding can cite where the number came from.
 */

import { parseYaml } from './shared/yaml.ts'

/** Where a parameter value came from. */
export interface ParamProvenance {
  /** Document number or title, verbatim from the source. */
  document: string
  /** URL of the primary source, when known. */
  url: string
  /** `verbatim` when the text was quoted, `paraphrase` when summarised. */
  evidence: string
  /** When the value was retrieved. */
  retrievedAt: string
}

/** One resolved parameter. */
export interface ParamValue {
  value: number
  from: ParamProvenance
}

/** A declared gap: the parameter is known to exist but was not obtained. */
export interface ParamGap {
  /** The parameter or insurance name. */
  key: string
  /** Why it is missing. */
  reason: string
  /** Rule ids the gap disables. */
  blocks: string[]
}

/** One row of a progressive table. */
export interface Bracket {
  /** Exclusive upper bound of the band, or null for the top band. */
  upper: number | null
  rate: number
  quick: number
}

/** Everything a rule pack can resolve, plus what it cannot. */
export interface Params {
  /** Resolved values by dotted key. */
  values: Record<string, ParamValue>
  /** Declared gaps. */
  gaps: ParamGap[]
  /** City name, for the report header. */
  city: string
  /** Period the values apply to, e.g. `2026-07-01` .. `null`. */
  cityCode: string
  /** Date the parameter file says it must be reviewed by. */
  reviewBy: string
  /** Warnings raised while loading. */
  warnings: string[]
  /** Progressive tables addressable by `bracket_rate(x, '<name>')`. */
  brackets: Record<string, Bracket[]>
}

/** Raised when a parameter document cannot be used. */
export class ParamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParamError'
  }
}

/** Shorthand for building a provenance record from a `source_*` block. */
function provenanceOf(entry: Record<string, unknown>): ParamProvenance {
  return {
    document: String(entry.doc_no ?? entry.cite ?? '(未注明文件)'),
    url: String(entry.source_url ?? ''),
    evidence: String(entry.evidence_level ?? 'paraphrase'),
    retrievedAt: String(entry.retrieved_at ?? ''),
  }
}

/** Coerce a value to a finite number, or `undefined`. */
function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** True when the entry's validity window covers the requested period. */
function covers(entry: Record<string, unknown>, period: string | undefined): boolean {
  if (period === undefined) return true
  const from = entry.valid_from === undefined || entry.valid_from === null ? '' : String(entry.valid_from)
  const to = entry.valid_to === undefined || entry.valid_to === null ? '' : String(entry.valid_to)
  const day = `${period}-01`
  if (from !== '' && day < from) return false
  if (to !== '' && day > to) return false
  return true
}

/**
 * Load a parameter document.
 *
 * @param yaml - the parameter file's text.
 * @param period - the payroll period (`YYYY-MM`), used to pick the validity window.
 * @returns resolved values plus declared gaps.
 * @throws ParamError when the document is not a payroll-params file.
 */
export function loadParams(yaml: string, period: string | undefined): Params {
  const parsed = parseYaml(yaml) as Record<string, unknown> | undefined
  if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
    throw new ParamError('参数文件不是映射')
  }
  if (parsed.schema !== 'payroll-params/v1') {
    throw new ParamError(`参数文件的 schema 不是 payroll-params/v1：${String(parsed.schema)}`)
  }

  const values: Record<string, ParamValue> = {}
  const warnings: string[] = []

  const baseLimits = Array.isArray(parsed.base_limits) ? parsed.base_limits : []
  const limitsByRef = new Map<string, { floor?: number; ceiling?: number; from: ParamProvenance }>()
  for (const raw of baseLimits) {
    const entry = raw as Record<string, unknown>
    if (!covers(entry, period)) continue
    const id = String(entry.id ?? '')
    const from = provenanceOf(entry)
    limitsByRef.set(id, { floor: num(entry.floor), ceiling: num(entry.ceiling), from })
    const scope = String(entry.scope ?? '')
    const prefix = scope === 'housing_fund' ? 'hf.base' : scope === 'social' ? 'si.base' : ''
    if (prefix === '') {
      warnings.push(`基数条目 ${id} 的 scope「${scope}」未识别，未参与解析`)
      continue
    }
    const floor = num(entry.floor)
    const ceiling = num(entry.ceiling)
    if (floor !== undefined) values[`${prefix}.floor`] = { value: floor, from }
    if (ceiling !== undefined) values[`${prefix}.ceiling`] = { value: ceiling, from }
  }

  const contributions = Array.isArray(parsed.contributions) ? parsed.contributions : []
  for (const raw of contributions) {
    const entry = raw as Record<string, unknown>
    if (!covers(entry, period)) continue
    const insurance = String(entry.insurance ?? '')
    if (insurance === '') continue
    const from = provenanceOf(entry)
    const prefix = insurance === 'housing_fund' ? 'hf.fund'
      : insurance === 'supplementary_housing_fund' ? 'hf.supplementary_housing_fund'
        : `si.${insurance}`
    const employee = num(entry.employee_rate)
    const employer = num(entry.employer_rate)
    const employeeMin = num(entry.employee_rate_min)
    const employeeMax = num(entry.employee_rate_max)
    const employerMin = num(entry.employer_rate_min)
    const employerMax = num(entry.employer_rate_max)
    if (employee !== undefined) values[`${prefix}.employee`] = { value: employee, from }
    if (employer !== undefined) values[`${prefix}.employer`] = { value: employer, from }
    if (employeeMin !== undefined) values[`${prefix}.employee_min`] = { value: employeeMin, from }
    if (employeeMax !== undefined) values[`${prefix}.employee_max`] = { value: employeeMax, from }
    if (employerMin !== undefined) values[`${prefix}.employer_min`] = { value: employerMin, from }
    if (employerMax !== undefined) values[`${prefix}.employer_max`] = { value: employerMax, from }
  }

  const iit = parsed.iit as Record<string, unknown> | undefined
  if (iit !== undefined && iit !== null) {
    const iitFrom: ParamProvenance = {
      document: String(iit.cite ?? '个人所得税法及实施条例'),
      url: String(iit.source_url ?? ''),
      evidence: String(iit.evidence_level ?? 'paraphrase'),
      retrievedAt: String(iit.retrieved_at ?? ''),
    }
    const basic = num(iit.basic_deduction_monthly)
    if (basic !== undefined) values['iit.basic_deduction_monthly'] = { value: basic, from: iitFrom }
    // Flatten the rest of `iit` so a pack can address any published value by its
    // real path, e.g. `iit.extra_deduction_caps.child_edu_monthly_per_child`.
    const walk = (node: unknown, prefix: string): void => {
      if (node === null || typeof node !== 'object' || Array.isArray(node)) return
      for (const [name, raw] of Object.entries(node as Record<string, unknown>)) {
        const value = num(raw)
        if (value !== undefined) {
          values[`${prefix}.${name}`] = { value, from: iitFrom }
          continue
        }
        walk(raw, `${prefix}.${name}`)
      }
    }
    walk(iit, 'iit')

    // Short aliases the shipped packs use. The parameter document calls the same
    // numbers `extra_deduction_caps.<name>_monthly_per_child`; addressing them by a
    // shorter name is convenient, so both spellings resolve and a warning records
    // that an alias was taken rather than the canonical path.
    const ALIASES: Record<string, string> = {
      'iit.extra.child_edu_monthly': 'iit.extra_deduction_caps.child_edu_monthly_per_child',
      'iit.extra.infant_care_monthly': 'iit.extra_deduction_caps.infant_care_monthly_per_child',
      'iit.extra.elderly_support_monthly': 'iit.extra_deduction_caps.elderly_support_monthly_max',
      'iit.extra.housing_loan_interest_monthly': 'iit.extra_deduction_caps.housing_loan_interest_monthly',
    }
    for (const [alias, canonical] of Object.entries(ALIASES)) {
      const target = values[canonical]
      if (target !== undefined && values[alias] === undefined) {
        values[alias] = target
        warnings.push(`参数别名 ${alias} → ${canonical}（参数文件中没有该短名）`)
      }
    }
  }

  const brackets: Record<string, Bracket[]> = {}
  if (iit !== undefined && iit !== null) {
    const table = (name: string, source: unknown): void => {
      if (!Array.isArray(source)) return
      const rows: Bracket[] = []
      for (const raw of source) {
        const entry = raw as Record<string, unknown>
        const rate = num(entry.rate)
        const quick = num(entry.quick)
        if (rate === undefined || quick === undefined) continue
        const upper = entry.upper === null || entry.upper === undefined ? null : num(entry.upper) ?? null
        rows.push({ upper, rate, quick })
      }
      if (rows.length > 0) brackets[name] = rows
    }
    table('iit.withholding', iit.withholding_table)
    table('iit.bonus', iit.bonus_monthly_table)
  }

  const gaps: ParamGap[] = []
  const pending = Array.isArray(parsed.pending) ? parsed.pending : []
  for (const raw of pending) {
    const entry = raw as Record<string, unknown>
    const blocks = Array.isArray(entry.blocks_checks) ? entry.blocks_checks.map(String) : []
    gaps.push({
      key: String(entry.insurance ?? entry.key ?? '(未命名)'),
      reason: String(entry.reason ?? ''),
      blocks,
    })
  }

  return {
    values,
    gaps,
    city: String(parsed.city_name ?? ''),
    cityCode: String(parsed.city_code ?? ''),
    reviewBy: String(parsed.next_review_by ?? ''),
    warnings,
    brackets,
  }
}
