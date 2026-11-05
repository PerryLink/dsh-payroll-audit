#!/usr/bin/env python3
"""Generate README image assets for dsh-payroll-audit (docs/assets/).

Outputs (idempotent overwrite):
  dsh-payroll-audit-flow-light.svg / dsh-payroll-audit-flow-dark.svg
      Hero data-flow diagram. Two hand-written SVG files (vector — never
      rasterized to webp). Text inside is command-surface tokens only
      (`payroll_audit`, `dsh-table-ingest`, rule-pack and parameter paths,
      verdict names), so all five README languages share the same pair.

There is no evidence chart: this repository ships no benchmark or measured
dataset, so no WebP asset is produced. The family palette and the CJK font
probe from the shared template are kept so a future localized label cannot
silently render as tofu boxes.

Run once:  python scripts/gen-readme-assets.py
Requires:  Pillow only if an evidence chart is added later.
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

# --- palette: PerryLink family (accent) + GitHub page backgrounds ----------
FAMILY = "#4B67B4"   # family accent (badges labelColor family uses #2B3245)
RED = {"light": "#cf222e", "dark": "#f85149"}
ORANGE = {"light": "#bc4c00", "dark": "#d29922"}
BLUE = {"light": FAMILY, "dark": FAMILY}
GREEN = {"light": "#16a34a", "dark": "#3fb950"}
SKIN = {
    "light": dict(bg="#ffffff", box="#f6f8fa", border="#d0d7de",
                  text="#1f2328", sub="#57606a", track="#eaeef2"),
    "dark": dict(bg="#0d1117", box="#161b22", border="#30363d",
                 text="#f0f6fc", sub="#8b949e", track="#21262d"),
}

# webp quality the shared template uses for evidence charts. No benchmark data
# ships in this repository, so no webp is written today.
WEBP_QUALITY = 90

# --- CJK font probe: Chinese must never render as tofu boxes ----------------
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",      # Microsoft YaHei
    r"C:\Windows\Fonts\simhei.ttf",    # SimHei
    r"C:\Windows\Fonts\Deng.ttf",      # DengXian
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]
FONT_PATH = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
if FONT_PATH is None:
    sys.exit("FATAL: no CJK font found (looked for msyh.ttc, simhei.ttf, "
             "Deng.ttf, Noto Sans CJK, PingFang). Refusing to render Chinese "
             "as tofu boxes; install one of the probed fonts and re-run.")

# ---------------------------------------------------------------------------
# Hero data-flow SVG (light + dark)
# ---------------------------------------------------------------------------
# Pipeline mirrored from src/index.ts and rules/*.yaml:
#   file -> dsh-table-ingest -> rule pack + parameter document -> payroll_audit
#   -> markdown/JSON report with a four-state verdict and citations.
FLOW_NODES = [
    ("payroll.csv", "xlsx / xlsm / csv"),
    ("dsh-table-ingest", "rows[]"),
    ("rule pack", "payroll-bj-2026.yaml"),
    ("payroll_audit", "derived + rules"),
    ("report", "markdown + JSON"),
]

VERDICTS = [
    ("fail", RED),
    ("review", ORANGE),
    ("pass_with_gaps", BLUE),
    ("pass", GREEN),
]


def flow_svg(skin: str) -> str:
    s = SKIN[skin]
    w, h = 1250, 430
    nw, nh, gap = 210, 96, 30
    x0, y0 = 48, 150
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" aria-label="dsh-payroll-audit data flow">',
        '<title>dsh-payroll-audit data flow</title>',
        f'<rect width="{w}" height="{h}" rx="18" fill="{s["bg"]}"/>',
        f'<text x="48" y="58" fill="{s["text"]}" font-family="ui-sans-serif,'
        f'system-ui,sans-serif" font-size="30" font-weight="700">dsh-payroll-audit</text>',
        f'<text x="48" y="90" fill="{s["sub"]}" font-family="ui-monospace,'
        f'SFMono-Regular,Menlo,monospace" font-size="16">payroll_audit · payroll '
        f'sheet -> rules + params -> four-state verdict</text>',
        f'<line x1="48" y1="112" x2="1202" y2="112" stroke="{s["border"]}"/>',
    ]
    for i, (label, sub) in enumerate(FLOW_NODES):
        x = x0 + i * (nw + gap)
        accent = FAMILY if i in (1, 2, 3) else (
            GREEN[skin] if i == 4 else s["border"])
        parts.append(
            f'<rect x="{x}" y="{y0}" width="{nw}" height="{nh}" rx="14" '
            f'fill="{s["box"]}" stroke="{accent}" stroke-width="2"/>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 38}" fill="{s["text"]}" '
            f'text-anchor="middle" font-family="ui-monospace,SFMono-Regular,'
            f'monospace" font-size="14" font-weight="700">{label}</text>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 66}" fill="{s["sub"]}" '
            f'text-anchor="middle" font-family="ui-monospace,SFMono-Regular,'
            f'monospace" font-size="11">{sub}</text>')
        if i == 2:
            parts.append(
                f'<text x="{x + nw // 2}" y="{y0 + 84}" fill="{s["sub"]}" '
                f'text-anchor="middle" font-family="ui-monospace,SFMono-Regular,'
                f'monospace" font-size="11">params-110000.yaml</text>')
        if i < len(FLOW_NODES) - 1:
            ax = x + nw + 4
            ay = y0 + nh // 2
            parts.append(
                f'<path d="M{ax} {ay}h{gap - 9}" stroke="{s["sub"]}" '
                f'stroke-width="3"/>')
            parts.append(
                f'<path d="M{ax + gap - 12} {ay - 6}l9 6-9 6" fill="none" '
                f'stroke="{s["sub"]}" stroke-width="3" '
                f'stroke-linecap="round" stroke-linejoin="round"/>')
    # four-state verdict row
    parts.append(
        f'<text x="48" y="286" fill="{s["sub"]}" font-family="ui-monospace,'
        f'SFMono-Regular,Menlo,monospace" font-size="13">four-state verdict</text>')
    vw, vh, vgap = 210, 40, 14
    vx0 = 230
    for i, (label, color) in enumerate(VERDICTS):
        x = vx0 + i * (vw + vgap)
        parts.append(
            f'<rect x="{x}" y="{266}" width="{vw}" height="{vh}" rx="10" '
            f'fill="{s["box"]}" stroke="{color[skin]}" stroke-width="2"/>')
        parts.append(
            f'<text x="{x + vw // 2}" y="{266 + 26}" fill="{s["text"]}" '
            f'text-anchor="middle" font-family="ui-monospace,SFMono-Regular,'
            f'monospace" font-size="14" font-weight="700">{label}</text>')
    parts.append(
        f'<text x="48" y="352" fill="{s["sub"]}" font-family="ui-monospace,'
        f'SFMono-Regular,Menlo,monospace" font-size="13">unchecked &#8800; pass '
        f'· disabled_rules + parameter gaps</text>')
    parts.append(
        f'<text x="48" y="380" fill="{s["sub"]}" font-family="ui-monospace,'
        f'SFMono-Regular,Menlo,monospace" font-size="13">citations: source · '
        f'locator · quote · evidence_level</text>')
    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for skin in ("light", "dark"):
        with open(os.path.join(OUT, f"dsh-payroll-audit-flow-{skin}.svg"),
                  "w", encoding="utf-8", newline="\n") as fh:
            fh.write(flow_svg(skin))
    print("wrote 2 SVG assets to docs/assets/")


if __name__ == "__main__":
    main()
