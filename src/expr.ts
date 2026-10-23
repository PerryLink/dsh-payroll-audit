/**
 * A whitelisted arithmetic expression evaluator for rule packs.
 *
 * Rule packs compute derived columns (`base_for_rate`, `pension_emp_delta`, …) in
 * a small expression language instead of in code, so a jurisdiction's arithmetic
 * can change without a release. That language must never reach `eval`: a rule pack
 * is data, and data does not get the host's scope.
 *
 * Grammar, in precedence order:
 *
 * ```
 * expr    := term (('+' | '-') term)*
 * term    := unary (('*' | '/') unary)*
 * unary   := ('-' | '+')? primary
 * primary := number | field | p('param.key') | fn '(' args ')'
 * fn      := nz | min | max | abs | round | sum
 * ```
 */

/** Raised when an expression cannot be parsed or evaluated. */
export class ExprError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExprError'
  }
}

/** A parsed expression node. Kept as a plain union so it can be logged. */
export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'field'; name: string }
  | { kind: 'param'; key: string }
  | { kind: 'unary'; op: '+' | '-'; operand: Node }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'literal'; value: string }

/** Evaluation context: row fields and resolved parameter values. */
export interface EvalContext {
  /** Row values, already coerced to numbers where numeric. */
  fields: Record<string, number | undefined>
  /** Parameter values keyed by dotted path. */
  params: Record<string, number | undefined>
  /** Progressive tables keyed by name, each sorted by an exclusive upper bound. */
  brackets?: Record<string, { upper: number | null; rate: number; quick: number }[]>
}

/** The functions the language exposes, with their arity. */
const FUNCTIONS: Record<string, { min: number; max: number }> = {
  nz: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
  round: { min: 1, max: 2 },
  min: { min: 1, max: 64 },
  max: { min: 1, max: 64 },
  sum: { min: 1, max: 64 },
  // Progressive-table lookups. The second argument names the table
  // (`iit.withholding`); the table itself comes from the parameter document.
  bracket_rate: { min: 2, max: 2 },
  bracket_quick: { min: 2, max: 2 },
}

/** Token kinds produced by the lexer. */
type Token =
  | { kind: 'number'; value: number; at: number }
  | { kind: 'ident'; value: string; at: number }
  | { kind: 'string'; value: string; at: number }
  | { kind: 'punct'; value: string; at: number }

/** Split the source into tokens, rejecting anything outside the grammar. */
function lex(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const character = source[index] ?? ''
    if (/\s/u.test(character)) {
      index++
      continue
    }
    if (/[0-9.]/u.test(character)) {
      const start = index
      while (index < source.length && /[0-9.]/u.test(source[index] ?? '')) index++
      const text = source.slice(start, index)
      const value = Number.parseFloat(text)
      if (!Number.isFinite(value)) throw new ExprError(`数字 ${text} 不合法（位置 ${start}）`)
      tokens.push({ kind: 'number', value, at: start })
      continue
    }
    if (/[A-Za-z_]/u.test(character)) {
      const start = index
      while (index < source.length && /[A-Za-z0-9_]/u.test(source[index] ?? '')) index++
      tokens.push({ kind: 'ident', value: source.slice(start, index), at: start })
      continue
    }
    if (character === "'") {
      const start = index
      index++
      let text = ''
      while (index < source.length && source[index] !== "'") {
        text += source[index]
        index++
      }
      if (source[index] !== "'") throw new ExprError(`字符串未闭合（位置 ${start}）`)
      index++
      tokens.push({ kind: 'string', value: text, at: start })
      continue
    }
    if ('+-*/(),'.includes(character)) {
      tokens.push({ kind: 'punct', value: character, at: index })
      index++
      continue
    }
    throw new ExprError(`表达式含有不允许的字符 ${JSON.stringify(character)}（位置 ${index}）`)
  }
  return tokens
}

/** Recursive-descent parser over the token stream. */
class Parser {
  private position = 0
  private readonly tokens: Token[]
  private readonly source: string

  constructor(tokens: Token[], source: string) {
    this.tokens = tokens
    this.source = source
  }

  private peek(): Token | undefined {
    return this.tokens[this.position]
  }

  private take(): Token {
    const token = this.tokens[this.position]
    if (token === undefined) throw new ExprError(`表达式意外结束：${this.source}`)
    this.position++
    return token
  }

  private expect(value: string): void {
    const token = this.take()
    if (token.kind !== 'punct' || token.value !== value) {
      throw new ExprError(`期望 ${value}，实际 ${JSON.stringify(token)}`)
    }
  }

  parse(): Node {
    const node = this.expression()
    if (this.position !== this.tokens.length) {
      throw new ExprError(`表达式在位置 ${this.tokens[this.position]?.at ?? '?'} 之后还有多余内容`)
    }
    return node
  }

  private expression(): Node {
    let left = this.term()
    for (;;) {
      const token = this.peek()
      if (token?.kind !== 'punct' || (token.value !== '+' && token.value !== '-')) return left
      this.take()
      const right = this.term()
      left = { kind: 'binary', op: token.value, left, right }
    }
  }

  private term(): Node {
    let left = this.unary()
    for (;;) {
      const token = this.peek()
      if (token?.kind !== 'punct' || (token.value !== '*' && token.value !== '/')) return left
      this.take()
      const right = this.unary()
      left = { kind: 'binary', op: token.value, left, right }
    }
  }

  private unary(): Node {
    const token = this.peek()
    if (token?.kind === 'punct' && (token.value === '-' || token.value === '+')) {
      this.take()
      const operand = this.unary()
      return token.value === '-' ? { kind: 'unary', op: '-', operand } : operand
    }
    return this.primary()
  }

  private primary(): Node {
    const token = this.take()
    if (token.kind === 'number') return { kind: 'number', value: token.value }
    if (token.kind === 'string') return { kind: 'literal', value: token.value }
    if (token.kind === 'punct' && token.value === '(') {
      const inner = this.expression()
      this.expect(')')
      return inner
    }
    if (token.kind !== 'ident') throw new ExprError(`无法解析的记号 ${JSON.stringify(token)}`)

    const name = token.value
    const next = this.peek()
    if (next?.kind === 'punct' && next.value === '(') {
      this.take()
      const args: Node[] = []
      const closing = this.peek()
      if (closing?.kind === 'punct' && closing.value === ')') {
        this.take()
      } else {
        for (;;) {
          args.push(this.expression())
          const separator = this.peek()
          if (separator?.kind === 'punct' && separator.value === ',') {
            this.take()
            continue
          }
          this.expect(')')
          break
        }
      }
      if (name === 'p') {
        const [first] = args
        if (args.length !== 1 || first?.kind !== 'number') {
          // p('key') is rewritten by the caller into a param node before parsing,
          // so reaching here means the expression used p( with a non-literal.
          throw new ExprError("p(...) 只接受字符串字面量，例如 p('si.base.floor')")
        }
        return { kind: 'param', key: String(first.value) }
      }
      const spec = FUNCTIONS[name]
      if (spec === undefined) throw new ExprError(`未知函数 ${name}`)
      if (args.length < spec.min || args.length > spec.max) {
        throw new ExprError(`函数 ${name} 需要 ${spec.min}..${spec.max} 个参数，实际 ${args.length}`)
      }
      return { kind: 'call', name, args }
    }
    return { kind: 'field', name }
  }
}

/**
 * Rewrite `p('key')` into a marker the lexer can carry.
 *
 * The lexer treats `'…'` as a string token, and the parser only accepts a literal
 * inside `p(...)`. Rather than special-casing strings in the grammar, the literal
 * is substituted with a numeric token carrying an index into a side table.
 *
 * @param source - the raw expression.
 * @returns the rewritten expression plus the parameter keys by index.
 */
function hoistParamLiterals(source: string): { rewritten: string; keys: string[] } {
  const keys: string[] = []
  const rewritten = source.replace(/\bp\s*\(\s*'([^']*)'\s*\)/gu, (_match, key: string) => {
    keys.push(key)
    return `__param${keys.length - 1}`
  })
  return { rewritten, keys }
}

/** Parse an expression into an AST. */
export function parseExpr(source: string): Node {
  const { rewritten, keys } = hoistParamLiterals(source)
  const parser = new Parser(lex(rewritten), source)
  const node = parser.parse()
  return substituteParams(node, keys)
}

/** Replace `__paramN` field references with parameter nodes. */
function substituteParams(node: Node, keys: string[]): Node {
  switch (node.kind) {
    case 'field': {
      const match = /^__param(\d+)$/u.exec(node.name)
      if (match === null) return node
      const key = keys[Number.parseInt(match[1] ?? '-1', 10)]
      if (key === undefined) throw new ExprError(`内部错误：参数占位 ${node.name} 没有对应键`)
      return { kind: 'param', key }
    }
    case 'unary':
      return { ...node, operand: substituteParams(node.operand, keys) }
    case 'binary':
      return { ...node, left: substituteParams(node.left, keys), right: substituteParams(node.right, keys) }
    case 'call':
      return { ...node, args: node.args.map((arg) => substituteParams(arg, keys)) }
    default:
      return node
  }
}

/** Round half away from zero to `digits` places, matching the pack's stated rule. */
function roundHalfUp(value: number, digits: number): number {
  const factor = 10 ** digits
  const scaled = value * factor
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)
  return rounded / factor
}

/** Evaluate a parsed expression. A missing field or parameter is an error. */
export function evaluate(node: Node, context: EvalContext): number {
  switch (node.kind) {
    case 'number':
      return node.value
    case 'field': {
      const value = context.fields[node.name]
      if (value === undefined) throw new ExprError(`字段 ${node.name} 没有值`)
      return value
    }
    case 'param': {
      const value = context.params[node.key]
      if (value === undefined) throw new ExprError(`参数 ${node.key} 未提供`)
      return value
    }
    case 'unary':
      return -evaluate(node.operand, context)
    case 'binary': {
      const left = evaluate(node.left, context)
      const right = evaluate(node.right, context)
      if (node.op === '/' && right === 0) throw new ExprError('除以零')
      switch (node.op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        default:
          return left / right
      }
    }
    case 'literal':
      throw new ExprError('字符串字面量只能作为 bracket_* 的表名')
    case 'call': {
      if (node.name === 'bracket_rate' || node.name === 'bracket_quick') {
        const [valueNode, nameNode] = node.args
        if (valueNode === undefined || nameNode?.kind !== 'literal') {
          throw new ExprError(`${node.name} 的第二个参数必须是表名字符串`)
        }
        const table = context.brackets?.[nameNode.value]
        if (table === undefined) throw new ExprError(`累进表 ${nameNode.value} 未提供`)
        const value = evaluate(valueNode, context)
        const bracket = table.find((entry) => entry.upper === null || value <= entry.upper)
        if (bracket === undefined) throw new ExprError(`累进表 ${nameNode.value} 没有覆盖 ${value}`)
        return node.name === 'bracket_rate' ? bracket.rate : bracket.quick
      }
      const args = node.args.map((arg) => evaluate(arg, context))
      switch (node.name) {
        case 'nz':
          return args[0] ?? 0
        case 'abs':
          return Math.abs(args[0] ?? 0)
        case 'round':
          return roundHalfUp(args[0] ?? 0, args[1] ?? 2)
        case 'min':
          return Math.min(...args)
        case 'max':
          return Math.max(...args)
        case 'sum':
          return args.reduce((total, value) => total + value, 0)
        default:
          throw new ExprError(`未知函数 ${node.name}`)
      }
    }
  }
}

/**
 * Names of the fields and parameters an expression reads.
 *
 * Used to decide whether a rule is applicable: a rule whose inputs are absent is
 * `unchecked`, not `pass`.
 *
 * @param node - parsed expression.
 * @returns field names and parameter keys.
 */
export function inputsOf(node: Node): { fields: string[]; params: string[] } {
  const fields: string[] = []
  const params: string[] = []
  const walk = (current: Node): void => {
    switch (current.kind) {
      case 'field':
        fields.push(current.name)
        return
      case 'param':
        params.push(current.key)
        return
      case 'unary':
        walk(current.operand)
        return
      case 'binary':
        walk(current.left)
        walk(current.right)
        return
      case 'call':
        for (const arg of current.args) walk(arg)
        return
      case 'literal':
        return
      default:
        return
    }
  }
  walk(node)
  return { fields, params }
}
