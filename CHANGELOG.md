# Changelog

## 0.1.0

First release, covering Beijing and Shanghai from 2026-07.

- Rule packs are data: derived columns are restricted arithmetic expressions
  (whitelisted parser, no `eval`), rules are conditions over those columns.
- Parameters are addressed by dotted key and read from the official parameter
  document, with provenance (document, URL, evidence level, retrieval date)
  carried into every citation.
- **A missing parameter resolves to nothing, not zero.** The affected rules are
  declared in `disabled_rules`, never run, and are listed in the report under
  "未核验项", so "no finding" cannot be read as "compliant".
- **Four-state verdict** (`pass` / `pass_with_gaps` / `review` / `fail`): a row
  with unchecked rules is never reported as passing.
- Impact is computed per finding, e.g. a base below the floor reports the
  contribution shortfall rather than just "base too low".
- Two packs ship: Beijing 2026 (17 rules, 28 derived columns) and Shanghai 2026.
  Shanghai's housing fund is 5%–7%, not the national 5%–12%, which is why rates
  come from the parameter file.
- The YAML reader now accepts a flow mapping as a sequence item (`- {a: b}`).
  Before this, every rule condition was read as a string and the engine rejected
  the pack — which is the correct failure, but the reader was wrong.
- 25 tests over the shipped packs, the parameter documents, the expression
  language and the four-state verdict.
