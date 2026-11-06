#!/usr/bin/env python3
"""README visuals for dsh-payroll-audit, derived from the shipped material.

Every number below is read from this repository, not invented:

  * rules/payroll-bj-2026.yaml     17 rules, 28 derived columns, 7 citations,
                                   3 disabled rules; four-state precedence lives
                                   in src/engine.ts.
  * rules/params-110000.yaml       Beijing 2026-07: base floor 7,270, ceiling
                                   36,348; pension 16% / 8%; unemployment
                                   0.5% / 0.5%; 4 declared parameter gaps.
  * samples/quickstart/            three rows, summary fail 2, review 0,
                                   pass_with_gaps 1, pass 0; 15 unchecked items,
                                   4 parameter gaps. Row E002 is 7,000 under the
                                   7,270 floor, impact 67.50; row E003's
                                   employer pension is 100.00 short.
  * src/report.ts                  the report leads with unchecked items and
                                   parameter gaps, then per-person verdicts and
                                   findings with citations.

Two figures:

  hero 1440x576 (Pillow, 4 files: zh/en x light/dark)
      The left column is the plugin name and its promise. The right side is one
      payroll row dissected: four field tiles with the declared base ringed, then
      the published-base corridor with the declaration sitting just outside it,
      the 25% contribution multiplier arithmetic, and the four-state tally.
      It is a payslip audit strip, not a generic flowchart.

  flow 1100x660 (hand-written SVG, 2 files)
      A four-state verdict staircase. The left stack is the material (payroll
      rows, ingest, rule pack + parameter document); the middle is the per-row
      work (28 derived columns, then 17 rules); the right is the precedence
      cascade that decides one state per row. The unchecked channel (skipped,
      disabled rules, parameter gaps) enters at pass_with_gaps and is barred
      from pass. The report strip runs along the bottom.

Run once:  python scripts/gen-readme-assets.py
Requires:  Pillow + Windows fonts msyh.ttc / msyhbd.ttc / consola.ttf.
"""
from __future__ import annotations

import math
import os
from html import escape

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

FONT_CJK = r"C:\Windows\Fonts\msyh.ttc"
FONT_CJK_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
FONT_MONO_BOLD = r"C:\Windows\Fonts\consolab.ttf"
for _p in (FONT_CJK, FONT_CJK_BOLD, FONT_MONO, FONT_MONO_BOLD):
    if not os.path.exists(_p):
        raise SystemExit(f"FATAL: font missing: {_p}")

RADIUS = 22
SHADOW = 26

SKIN = {
    "light": dict(
        bg_from="#f9f6fd", bg_to="#e4eaf8",
        card="#ffffff", card_edge="#e6e2ef",
        text="#141419", sub="#4d5261", faint="#8f94a4",
        accent="#4B67B4", accent2="#16a34a",
        red="#cf222e", orange="#b45309", green="#16a34a",
        pill="#ece7f9", band="#f5f2fb", grid="#e7e4f0",
        mark="#b45309", mark_bg="#fdf3e9",
        red_bg="#fdf0ef", red_edge="#e8c0bc",
        amber_bg="#fdf6ea", amber_edge="#e6d0ab",
        blue_bg="#eef2fb", blue_edge="#c6d0ea",
        green_bg="#eef8ef", green_edge="#c2dfc8",
        shadow=(32, 26, 64), glow2="#7a68c9",
    ),
    "dark": dict(
        bg_from="#131a2a", bg_to="#0c1016",
        card="#1b2231", card_edge="#2e374b",
        text="#f0f3f9", sub="#a8b1c4", faint="#737b8d",
        accent="#8496f5", accent2="#3fb950",
        red="#f85149", orange="#d9a441", green="#3fb950",
        pill="#242d42", band="#202839", grid="#262f42",
        mark="#d9a441", mark_bg="#2a2216",
        red_bg="#2a1a1d", red_edge="#7a3b3b",
        amber_bg="#2a2318", amber_edge="#7a5a2a",
        blue_bg="#1f2638", blue_edge="#3d4a70",
        green_bg="#17251c", green_edge="#2f5a3a",
        shadow=(0, 0, 0), glow2="#8496f5",
    ),
}

FONT_FILES = {"cjk": FONT_CJK, "cjk_bold": FONT_CJK_BOLD,
              "mono": FONT_MONO, "mono_bold": FONT_MONO_BOLD}


def font(size: int, kind: str = "cjk_bold") -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_FILES[kind], size)


def hx(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def gradient(w: int, h: int, c1: str, c2: str) -> Image.Image:
    base = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(base)
    a, b = hx(c1), hx(c2)
    for y in range(h):
        t = 0.15 * (y / h) + 0.85 * (y / h) ** 1.35
        draw.line([(0, y), (w, y)],
                  fill=tuple(int(p + (q - p) * t) for p, q in zip(a, b)))
    return base


def glow(img: Image.Image, cx: int, cy: int, r: int, color: tuple,
         alpha: int = 40) -> Image.Image:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for i in range(9, 0, -1):
        rr = r * i / 9
        draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                     fill=color + (int(alpha * (1 - i / 10)),))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def card(img: Image.Image, box: tuple, s: dict, radius: int = RADIUS,
         shadow: int = SHADOW, fill: str | None = None) -> Image.Image:
    x0, y0, x1, y1 = box
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for i in range(shadow, 0, -3):
        sd.rounded_rectangle([x0 - i // 5, y0 + i // 2, x1 + i // 5, y1 + i],
                             radius=radius + i // 5,
                             fill=s["shadow"] + (int(9 * (1 - i / shadow)),))
    base = Image.alpha_composite(img.convert("RGBA"),
                                 sh.filter(ImageFilter.GaussianBlur(10)))
    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle(box, radius=radius, fill=hx(fill or s["card"]),
                           outline=hx(s["card_edge"]), width=2)
    return base.convert("RGB")


_SCRATCH = ImageDraw.Draw(Image.new("RGB", (8, 8)))


def measure(text: str, size: int, kind: str) -> float:
    return _SCRATCH.textlength(text, font=font(size, kind))


def require_w(text: str, size: int, kind: str, max_w: float, what: str) -> None:
    width = measure(text, size, kind)
    if width > max_w + 0.4:
        raise SystemExit(f"FATAL: {what} overflows: {text!r} needs "
                         f"{width:.1f}px > {max_w}px")


def fit(text: str, kind: str, max_w: float, start: int, minimum: int) -> int:
    size = start
    while size > minimum:
        if measure(text, size, kind) <= max_w:
            return size
        size -= 1
    raise SystemExit(f"FATAL: text does not fit {max_w}px at >= {minimum}px: "
                     f"{text!r}")


def fit_lines(lines: list[str], kind: str, max_w: float, start: int,
              minimum: int) -> int:
    return min(fit(t, kind, max_w, start, minimum) for t in lines)


def pill(img: Image.Image, xy: tuple[int, int], text: str, s: dict,
         size: int = 17, fg: str | None = None, bg: str | None = None,
         kind: str = "cjk_bold") -> tuple[int, int]:
    draw = ImageDraw.Draw(img)
    f = font(size, kind)
    width = draw.textlength(text, font=f)
    x, y = xy
    h = size + 20
    draw.rounded_rectangle([x, y, x + width + 30, y + h], radius=h // 2,
                           fill=hx(bg or s["pill"]))
    draw.text((x + 15, y + h / 2), text, font=f, fill=hx(fg or s["accent"]),
              anchor="lm")
    return int(x + width + 30), int(y + h)


def chip(img: Image.Image, xy: tuple[int, int], text: str, fg: str, bg: str,
         size: int = 11, kind: str = "cjk_bold", padx: int = 9,
         height: int = 20) -> int:
    draw = ImageDraw.Draw(img)
    f = font(size, kind)
    width = draw.textlength(text, font=f)
    x, y = xy
    draw.rounded_rectangle([x, y, x + width + padx * 2, y + height],
                           radius=height // 2, fill=hx(bg))
    draw.text((x + padx, y + height / 2), text, font=f, fill=hx(fg),
              anchor="lm")
    return int(width + padx * 2)


def dash_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int],
              color: str, width: int = 2, dash: int = 7, gap: int = 5) -> None:
    x0, y0, x1, y1 = box
    for a, b in (((x0, y0), (x1, y0)), ((x0, y1), (x1, y1)),
                 ((x0, y0), (x0, y1)), ((x1, y0), (x1, y1))):
        dist = math.hypot(b[0] - a[0], b[1] - a[1])
        n = int(dist // (dash + gap)) + 1
        for i in range(n):
            t0 = i * (dash + gap) / dist
            t1 = min(i * (dash + gap) + dash, dist) / dist
            if t0 >= 1:
                break
            draw.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                       (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)],
                      fill=hx(color), width=width)


# --------------------------------------------------------------------------- hero
HERO = {
    "zh": dict(
        kicker="DeepSeek Harness 插件 · 核查器",
        value=["把工资表逐行核到公开参数上", "差异、金额与条款依据一次说清"],
        sub=["17 条规则 · 28 个派生列；参数缺失即停用规则",
             "未核验不等于合规——结论留给复核人。"],
        meta="social-bj-2026 v0.1.0 · 北京 2026-07 · 基数 7,270–36,348",
        foot="Apache-2.0 · PerryLink DSH plugin family",
        row_title="工资表 · 第 2 / 3 行",
        row_chip="只读",
        employee="E002 李娜 · 2026-07 · 北京",
        fields=[("base_declared", "7,000", "低于下限"),
                ("gross_pay", "7,000", ""),
                ("net_pay", "5,425", ""),
                ("ee_hf", "840", "")],
        finding=("P0", "SI_BASE_BELOW_FLOOR", "影响 +67.50 元/月"),
        basis="依据：北京市人社局 2026 年度社保缴费基数通告（7,270 / 36,348）",
        corridor_title="申报基数落在公布走廊之外",
        corridor_tag="2026-07",
        corridor_l="下限 7,270",
        corridor_r="上限 36,348",
        declared="申报 7,000",
        gap="少 270",
        formula="(7,270 - 7,000) × (16% + 8% + 2 × 0.5%) = 67.50",
        rates="单位养老 16% · 个人养老 8% · 个人失业 0.5% —— 合计 25%",
        verdicts=[("fail", "2"), ("review", "0"),
                  ("pass_with_gaps", "1"), ("pass", "0")],
        unchecked="未核验 15 项 · 参数缺口 4 个",
        stamp=("未核验 ≠ 合规", "结论留给复核人"),
    ),
    "en": dict(
        kicker="DeepSeek Harness plugin · checker",
        value=["Check every payroll row against rates",
               "differences, amounts and clauses"],
        sub=["17 rules · 28 derived columns; gaps disable rules",
             "unchecked is never pass — the verdict stays human."],
        meta="social-bj-2026 v0.1.0 · Beijing 2026-07 · base 7,270–36,348",
        foot="Apache-2.0 · PerryLink DSH plugin family",
        row_title="Payroll row 2 / 3",
        row_chip="read-only",
        employee="E002 Li Na · 2026-07 · Beijing",
        fields=[("base_declared", "7,000", "below floor"),
                ("gross_pay", "7,000", ""),
                ("net_pay", "5,425", ""),
                ("ee_hf", "840", "")],
        finding=("P0", "SI_BASE_BELOW_FLOOR", "impact +67.50 CNY/month"),
        basis="Source: Beijing 2026 contribution-base notice (7,270 / 36,348)",
        corridor_title="Declared base sits outside the corridor",
        corridor_tag="2026-07",
        corridor_l="floor 7,270",
        corridor_r="ceiling 36,348",
        declared="declared 7,000",
        gap="short 270",
        formula="(7,270 - 7,000) × (16% + 8% + 2 × 0.5%) = 67.50",
        rates="employer pension 16% · employee pension 8% · unemployment 0.5% — 25%",
        verdicts=[("fail", "2"), ("review", "0"),
                  ("pass_with_gaps", "1"), ("pass", "0")],
        unchecked="15 unchecked · 4 parameter gaps",
        stamp=("UNCHECKED ≠ PASS", "the verdict stays human"),
    ),
}


def hero(lang: str, skin: str) -> None:
    s = SKIN[skin]
    H = HERO[lang]
    W, HT = 1440, 576
    img = gradient(W, HT, s["bg_from"], s["bg_to"])
    img = glow(img, 1180, 30, 420, hx(s["accent"]),
               24 if skin == "light" else 38)
    img = glow(img, 90, 580, 300, hx(s["glow2"]),
               10 if skin == "light" else 16)

    draw = ImageDraw.Draw(img)
    m = 64
    col_w = 590

    # ---- left column: kicker / title / value / sub / meta / footer -----------
    pill(img, (m, 54), H["kicker"], s, size=17)
    draw = ImageDraw.Draw(img)

    title_size = fit("dsh-payroll-audit", "mono_bold", col_w, 58, 48)
    draw.text((m - 2, 112), "dsh-payroll-audit",
              font=font(title_size, "mono_bold"), fill=hx(s["text"]))

    value_size = fit_lines(H["value"], "cjk_bold", col_w, 42, 30)
    for i, line in enumerate(H["value"]):
        require_w(line, value_size, "cjk_bold", col_w, "hero value")
        draw.text((m, 204 + i * 56), line, font=font(value_size, "cjk_bold"),
                  fill=hx(s["text"]))

    for i, line in enumerate(H["sub"]):
        require_w(line, 22, "cjk", col_w, "hero sub")
        draw.text((m + 1, 338 + i * 34), line, font=font(22, "cjk"),
                  fill=hx(s["sub"]))

    meta_size = fit(H["meta"], "cjk", col_w, 19, 12)
    require_w(H["meta"], meta_size, "cjk", col_w, "hero meta")
    require_w(H["foot"], 16, "cjk", col_w, "hero footer")
    draw.text((m + 1, 430), H["meta"], font=font(meta_size, "cjk"),
              fill=hx(s["faint"]))
    draw.line([m + 1, 474, m + col_w - 4, 474], fill=hx(s["grid"]), width=2)
    draw.text((m + 1, 492), H["foot"], font=font(16, "cjk"),
              fill=hx(s["faint"]))

    # ---- right top: one payroll row, four field tiles -----------------------
    img = card(img, (700, 40, 1376, 232), s, radius=RADIUS, shadow=SHADOW)
    draw = ImageDraw.Draw(img)
    draw.text((724, 58), H["row_title"], font=font(15, "cjk_bold"),
              fill=hx(s["accent"]))
    chip(img, (1340 - int(measure(H["row_chip"], 11, "cjk")) - 18, 54),
         H["row_chip"], s["accent"], s["pill"], size=11)
    draw = ImageDraw.Draw(img)
    draw.text((724, 82), H["employee"], font=font(17, "cjk_bold"),
              fill=hx(s["text"]))
    require_w(H["employee"], 17, "cjk_bold", 600, "employee line")

    tile_widths = [178, 140, 140, 140]
    tile_gap = 10
    tile_y, tile_h = 110, 64
    tile_x = 724
    for i, (name, value, badge) in enumerate(H["fields"]):
        tile_w = tile_widths[i]
        x = tile_x
        tile_x += tile_w + tile_gap
        marked = i == 0
        box = (x, tile_y, x + tile_w, tile_y + tile_h)
        draw.rounded_rectangle(box, radius=13,
                               fill=hx(s["mark_bg"] if marked else s["band"]),
                               outline=hx(s["mark"] if marked else s["card_edge"]),
                               width=2 if marked else 1)
        draw.text((x + 12, tile_y + 8), name, font=font(10, "mono"),
                  fill=hx(s["mark"] if marked else s["faint"]))
        draw.text((x + 12, tile_y + 26), value, font=font(22, "mono_bold"),
                  fill=hx(s["mark"] if marked else s["text"]))
        if badge:
            bw = measure(badge, 9, "cjk_bold")
            label_w = measure(name, 10, "mono")
            if 12 + label_w + 8 > tile_w - bw - 24:
                raise SystemExit(f"FATAL: tile badge overlaps label: {name!r}")
            draw.rounded_rectangle([x + tile_w - bw - 24, tile_y + 8,
                                    x + tile_w - 8, tile_y + 26], radius=9,
                                   fill=hx(s["red_bg"]),
                                   outline=hx(s["red_edge"]), width=1)
            draw.text((x + tile_w - bw - 16, tile_y + 10), badge,
                      font=font(9, "cjk_bold"), fill=hx(s["red"]))

    draw.text((724, 186), H["finding"][0], font=font(12, "mono_bold"),
              fill=hx(s["red"]))
    draw.text((760, 184), H["finding"][1], font=font(13.5, "mono_bold"),
              fill=hx(s["text"]))
    impact_w = measure(H["finding"][2], 14, "cjk_bold")
    draw.text((1352 - impact_w, 184), H["finding"][2],
              font=font(14, "cjk_bold"), fill=hx(s["red"]))
    draw.text((724, 210), H["basis"], font=font(11.5, "cjk"),
              fill=hx(s["faint"]))
    require_w(H["finding"][1], 13.5, "mono_bold", 200, "finding rule")
    require_w(H["basis"], 11.5, "cjk", 620, "finding basis")

    # ---- right middle: published-base corridor + the 25% arithmetic ---------
    img = card(img, (700, 248, 1376, 428), s, radius=RADIUS, shadow=20)
    draw = ImageDraw.Draw(img)
    draw.text((724, 264), H["corridor_title"], font=font(15, "cjk_bold"),
              fill=hx(s["text"]))
    tag_w = measure(H["corridor_tag"], 11, "mono")
    draw.rounded_rectangle([1352 - tag_w - 18, 260, 1352, 282], radius=11,
                           fill=hx(s["pill"]))
    draw.text((1352 - tag_w - 9, 266), H["corridor_tag"],
              font=font(11, "mono"), fill=hx(s["accent"]))
    require_w(H["corridor_title"], 15, "cjk_bold", 520, "corridor title")

    cx0, cx1, cy = 940, 1350, 308
    draw.text((cx0, 288), H["corridor_l"], font=font(11.5, "cjk"),
              fill=hx(s["sub"]))
    rw = measure(H["corridor_r"], 11.5, "cjk")
    draw.text((cx1 - rw, 288), H["corridor_r"], font=font(11.5, "cjk"),
              fill=hx(s["sub"]))
    draw.rounded_rectangle([cx0, cy, cx1, cy + 22], radius=11,
                           fill=hx(s["blue_bg"]), outline=hx(s["blue_edge"]),
                           width=2)
    for x in range(cx0 + 14, cx1 - 6, 22):
        draw.line([(x, cy + 6), (x + 8, cy + 16)], fill=hx(s["blue_edge"]),
                  width=1)

    declared_x, declared_y = 898, cy + 11
    draw.ellipse([declared_x - 7, declared_y - 7,
                  declared_x + 7, declared_y + 7],
                 fill=hx(s["red"]), outline=hx(s["card"]), width=2)
    dw = measure(H["declared"], 13, "cjk_bold")
    draw.text((declared_x - dw - 22, declared_y - 8), H["declared"],
              font=font(13, "cjk_bold"), fill=hx(s["red"]))
    draw.line([(declared_x + 8, declared_y), (cx0 - 2, declared_y)],
              fill=hx(s["red"]), width=2)
    draw.line([(cx0 - 2, declared_y - 6), (cx0 - 2, declared_y + 6)],
              fill=hx(s["red"]), width=2)
    gw = measure(H["gap"], 11, "cjk_bold")
    draw.text(((declared_x + cx0) / 2 - gw / 2, declared_y + 10), H["gap"],
              font=font(11, "cjk_bold"), fill=hx(s["red"]))

    draw.text((724, 352), H["formula"], font=font(13.5, "mono"),
              fill=hx(s["text"]))
    require_w(H["formula"], 13.5, "mono", 620, "hero formula")
    draw.text((724, 378), H["rates"], font=font(11.5, "cjk"),
              fill=hx(s["sub"]))
    require_w(H["rates"], 11.5, "cjk", 620, "hero rates")

    # ---- right bottom: four-state tally + the unchecked stamp ---------------
    img = card(img, (700, 444, 1376, 544), s, radius=18, shadow=16)
    draw = ImageDraw.Draw(img)
    vx = 724
    for name, count in H["verdicts"]:
        color = {"fail": s["red"], "review": s["orange"],
                 "pass_with_gaps": s["accent"], "pass": s["green"]}[name]
        draw.ellipse([vx, 462, vx + 8, 470], fill=hx(color))
        vx += 14
        label = f"{name} {count}"
        width = measure(label, 12.5, "mono")
        draw.text((vx, 458), label, font=font(12.5, "mono"),
                  fill=hx(s["text"]))
        vx += int(width) + 20
    draw.text((724, 484), H["unchecked"], font=font(12.5, "cjk"),
              fill=hx(s["mark"]))

    stamp_box = (1148, 454, 1352, 522)
    dash_rect(draw, stamp_box, s["mark"], width=2, dash=6, gap=4)
    stamp_cx = (stamp_box[0] + stamp_box[2]) // 2
    draw.text((stamp_cx, 472), H["stamp"][0],
              font=font(13, "cjk_bold"), fill=hx(s["mark"]), anchor="mm")
    draw.text((stamp_cx, 498), H["stamp"][1],
              font=font(11, "cjk"), fill=hx(s["sub"]), anchor="mm")
    require_w(H["stamp"][0], 13, "cjk_bold", 184, "hero stamp 1")
    require_w(H["stamp"][1], 11, "cjk", 184, "hero stamp 2")
    require_w(H["unchecked"], 12.5, "cjk", 380, "hero unchecked")

    name = f"dsh-payroll-audit-hero-{lang}-{skin}.webp"
    img.save(os.path.join(OUT, name), "WEBP", quality=92, method=6)
    print(f"wrote {name} ({W}x{HT})")


# --------------------------------------------------------------------------- flow
FLOW = {
    "light": dict(
        bg_from="#f9f6fd", bg_to="#e4eaf8",
        panel="#ffffff", edge="#e6e2ef", band="#f5f2fb", band_alt="#faf8fe",
        text="#141419", sub="#4d5261", faint="#8f94a4",
        accent="#4B67B4", accent2="#16a34a",
        red="#cf222e", orange="#b45309", green="#16a34a",
        red_bg="#fdf0ef", red_edge="#e8c0bc",
        amber_bg="#fdf6ea", amber_edge="#e6d0ab",
        blue_bg="#eef2fb", blue_edge="#c6d0ea",
        green_bg="#eef8ef", green_edge="#c2dfc8",
        grid="#e7e4f0", shadow="0.10",
    ),
    "dark": dict(
        bg_from="#131a2a", bg_to="#0c1016",
        panel="#1b2231", edge="#2e374b", band="#202839", band_alt="#1e2534",
        text="#f0f3f9", sub="#a8b1c4", faint="#737b8d",
        accent="#8496f5", accent2="#3fb950",
        red="#f85149", orange="#d9a441", green="#3fb950",
        red_bg="#2a1a1d", red_edge="#7a3b3b",
        amber_bg="#2a2318", amber_edge="#7a5a2a",
        blue_bg="#1f2638", blue_edge="#3d4a70",
        green_bg="#17251c", green_edge="#2f5a3a",
        grid="#2b3348", shadow="0.45",
    ),
}

FONT_CSS_CJK = ("'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',"
                "'Source Han Sans SC',sans-serif")
FONT_CSS_MONO = ("'Consolas','SFMono-Regular','Menlo',ui-monospace,monospace")


class Svg:
    """Small SVG writer that measures every string before emitting it."""

    def __init__(self) -> None:
        self.parts: list[str] = []
        self.overflows: list[str] = []

    def add(self, markup: str) -> None:
        self.parts.append(markup)

    def text(self, x: float, y: float, content: str, size: float, fill: str, *,
             anchor: str = "start", weight: int | None = None,
             mono: bool = False, max_w: float | None = None,
             opacity: float | None = None) -> None:
        kind = "mono" if mono else "cjk"
        if weight:
            kind += "_bold"
        if max_w is not None:
            width = measure(content, size, kind)
            if width > max_w + 0.4:
                self.overflows.append(
                    f"{content!r} needs {width:.1f}px > {max_w}px")
        family = FONT_CSS_MONO if mono else FONT_CSS_CJK
        attrs = [f'x="{x}"', f'y="{y}"', f'fill="{fill}"',
                 f'font-family="{family}"', f'font-size="{size}"']
        if anchor != "start":
            attrs.append(f'text-anchor="{anchor}"')
        if weight:
            attrs.append(f'font-weight="{weight}"')
        if opacity is not None:
            attrs.append(f'opacity="{opacity}"')
        self.add(f'<text {" ".join(attrs)}>{escape(content)}</text>')

    def rect(self, x: float, y: float, w: float, h: float, *, fill: str,
             rx: float = 0, stroke: str | None = None, sw: float = 1.5,
             shadow: bool = False, dash: str | None = None,
             opacity: float | None = None) -> None:
        attrs = [f'x="{x}"', f'y="{y}"', f'width="{w}"', f'height="{h}"']
        if rx:
            attrs.append(f'rx="{rx}"')
        attrs.append(f'fill="{fill}"')
        if stroke:
            attrs.extend([f'stroke="{stroke}"', f'stroke-width="{sw}"'])
        if dash:
            attrs.append(f'stroke-dasharray="{dash}"')
        if opacity is not None:
            attrs.append(f'opacity="{opacity}"')
        if shadow:
            attrs.append('filter="url(#soft)"')
        self.add(f'<rect {" ".join(attrs)}/>')

    def line(self, x1: float, y1: float, x2: float, y2: float, *, stroke: str,
             sw: float = 1.5, dash: str | None = None,
             marker: str | None = None, opacity: float | None = None) -> None:
        attrs = [f'x1="{x1}"', f'y1="{y1}"', f'x2="{x2}"', f'y2="{y2}"',
                 f'stroke="{stroke}"', f'stroke-width="{sw}"']
        if dash:
            attrs.append(f'stroke-dasharray="{dash}"')
        if marker:
            attrs.append(f'marker-end="url(#{marker})"')
        if opacity is not None:
            attrs.append(f'opacity="{opacity}"')
        self.add(f'<line {" ".join(attrs)}/>')

    def path(self, d: str, *, stroke: str, sw: float = 1.5,
             marker: str | None = None, dash: str | None = None,
             fill: str = "none") -> None:
        attrs = [f'd="{d}"', f'fill="{fill}"', f'stroke="{stroke}"',
                 f'stroke-width="{sw}"', 'stroke-linecap="round"',
                 'stroke-linejoin="round"']
        if dash:
            attrs.append(f'stroke-dasharray="{dash}"')
        if marker:
            attrs.append(f'marker-end="url(#{marker})"')
        self.add(f'<path {" ".join(attrs)}/>')

    def circle(self, cx: float, cy: float, r: float, *, fill: str,
               stroke: str | None = None, sw: float = 1.5) -> None:
        attrs = [f'cx="{cx}"', f'cy="{cy}"', f'r="{r}"', f'fill="{fill}"']
        if stroke:
            attrs.extend([f'stroke="{stroke}"', f'stroke-width="{sw}"'])
        self.add(f'<circle {" ".join(attrs)}/>')

    def chip(self, x: float, y: float, label: str, fg: str, bg: str, *,
             size: float = 11.5, pad: float = 9, height: float = 22,
             mono: bool = False, weight: int | None = None,
             align: str = "left") -> None:
        kind = "mono" if mono else "cjk"
        if weight:
            kind += "_bold"
        w = measure(label, size, kind) + pad * 2
        left = x if align == "left" else x - w
        self.rect(left, y, w, height, fill=bg, rx=height / 2)
        self.text(left + pad, y + height / 2 + size * 0.35, label, size, fg,
                  weight=weight, mono=mono)

    def svg(self, w: int, h: int, label: str) -> str:
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" '
                f'height="{h}" viewBox="0 0 {w} {h}" role="img" '
                f'aria-label="{escape(label)}">')
        return "\n".join([head, *self.parts, "</svg>"]) + "\n"


def flow_svg(skin: str) -> str:
    s = FLOW[skin]
    W, H = 1100, 660
    v = Svg()

    v.add("<defs>")
    v.add(f'<linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">'
          f'<stop offset="0" stop-color="{s["bg_from"]}"/>'
          f'<stop offset="1" stop-color="{s["bg_to"]}"/></linearGradient>')
    v.add(f'<filter id="soft" x="-30%" y="-30%" width="160%" height="170%">'
          f'<feDropShadow dx="0" dy="7" stdDeviation="9" '
          f'flood-color="#16122c" flood-opacity="{s["shadow"]}"/></filter>')
    for name, color in (("arr", s["accent"]), ("arr-green", s["green"]),
                        ("arr-amber", s["orange"])):
        v.add(f'<marker id="{name}" viewBox="0 0 10 10" refX="9" refY="5" '
              f'markerWidth="6.4" markerHeight="6.4" '
              f'orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" '
              f'fill="{color}"/></marker>')
    v.add("</defs>")
    v.add(f'<rect width="{W}" height="{H}" fill="url(#bg)"/>')

    # ---- header -------------------------------------------------------------
    v.text(44, 58, "dsh-payroll-audit", 28, s["text"], weight=700, mono=True,
           max_w=520)
    v.text(44, 88, "一张工资表 → 28 个派生列 → 17 条规则 → 四态结论；"
           "未执行的规则同样写进报告。", 15, s["sub"], max_w=780)
    v.chip(1056, 34, "social-bj-2026 v0.1.0 · 17 rules · 28 derived",
           s["accent"], s["band"], size=11.5, pad=12, height=26, align="right")

    # ---- left: material stack ----------------------------------------------
    v.rect(44, 118, 242, 126, fill=s["panel"], rx=18, stroke=s["edge"],
           sw=1.5, shadow=True)
    v.text(60, 144, "工资表 rows[]", 14, s["text"], weight=700, max_w=104)
    v.chip(270, 132, ".csv / .xlsx", s["faint"], s["band"], size=11,
           pad=8, height=20, align="right")
    v.text(60, 168, "工号 · base_declared", 11, s["faint"], max_w=210)
    v.rect(54, 192, 220, 19, fill=s["amber_bg"], rx=8)
    for i, (emp, base, hot) in enumerate((("E001", "8,000", False),
                                          ("E002", "7,000", True),
                                          ("E003", "10,000", False))):
        y = 186 + i * 18
        v.text(60, y, emp, 12.5, s["text"], mono=True)
        v.text(270, y, base, 12.5,
               s["orange"] if hot else s["sub"], mono=True, anchor="end")
    v.text(60, 238, "一人一行 · 原件只读", 11, s["faint"], max_w=210)
    v.path("M165 244 V258", stroke=s["accent"], sw=2, marker="arr")

    v.rect(44, 262, 242, 68, fill=s["panel"], rx=18, stroke=s["edge"],
           sw=1.5, shadow=True)
    v.text(60, 288, "dsh-table-ingest", 14, s["text"], weight=700, mono=True,
           max_w=210)
    v.text(60, 310, "rows[3] · 表头识别 · 只读", 11.5, s["sub"], max_w=210)
    # The rows go to the per-row work; the rule pack/parameter document are a
    # separate input family, so they get their own connector rather than being
    # drawn as a continuation of ingest.
    v.path("M286 292 H304 V222 H318", stroke=s["accent"], sw=2,
           marker="arr")

    v.rect(44, 348, 242, 192, fill=s["panel"], rx=18, stroke=s["edge"],
           sw=1.5, shadow=True)
    v.text(60, 372, "规则包 + 参数", 14, s["text"], weight=700, max_w=100)
    v.chip(270, 360, "数据", s["accent"], s["band"], size=11, pad=8,
           height=20, align="right")
    v.text(60, 396, "payroll-bj-2026.yaml", 12.5, s["text"], mono=True,
           max_w=210)
    v.text(60, 416, "17 条规则 · 28 个派生列", 11.5, s["sub"], max_w=210)
    v.text(60, 434, "7 条引文 · 3 条 disabled_rules", 11.5, s["sub"],
           max_w=210)
    v.line(58, 446, 272, 446, stroke=s["grid"], sw=1)
    v.text(60, 468, "params-110000.yaml", 12.5, s["text"], mono=True,
           max_w=210)
    v.text(60, 488, "基数 7,270–36,348 · 养老 16%/8%", 11.5, s["sub"],
           max_w=210)
    v.text(60, 506, "4 个参数缺口 · 缺值解析为空", 11.5, s["orange"],
           max_w=210)
    v.text(60, 528, "valid_from / valid_to 生效窗口", 11, s["faint"],
           max_w=210)
    v.path("M286 430 H304 V310 H318", stroke=s["accent"], sw=2,
           marker="arr")

    # ---- centre: per-row work ---------------------------------------------
    v.rect(320, 118, 400, 146, fill=s["panel"], rx=18, stroke=s["edge"],
           sw=1.5, shadow=True)
    v.text(338, 144, "派生列 28 · 逐行求值", 14.5, s["text"], weight=700,
           max_w=230)
    v.chip(704, 132, "无 eval", s["accent"], s["band"], size=11,
           pad=9, height=20, align="right")
    v.text(338, 176, "base_for_rate = min(nz(base_declared), 36,348)",
           13, s["text"], mono=True, max_w=364)
    v.text(338, 202, "emp_pension_should = round(base_for_rate × 16%, 2)",
           13, s["text"], mono=True, max_w=364)
    v.text(338, 228, "net_should = round(gross_pay - 扣款合计, 2)",
           13, s["text"], mono=True, max_w=364)
    v.text(338, 252, "参数缺值 → 空，不按 0 代入", 11, s["orange"],
           max_w=364)
    v.path("M520 264 V276", stroke=s["accent"], sw=2, marker="arr")

    v.rect(320, 280, 400, 260, fill=s["panel"], rx=18, stroke=s["edge"],
           sw=1.5, shadow=True)
    v.text(338, 306, "规则 17 条 · 逐条判定", 14.5, s["text"], weight=700,
           max_w=230)
    v.chip(704, 294, "when.all_of", s["accent"], s["band"], size=11,
           pad=9, height=20, align="right")
    for label, x in (("基数 9", 338), ("公积金 3", 410),
                     ("发薪/个税 4", 492), ("通检 1", 592)):
        v.chip(x, 318, label, s["sub"], s["band"], size=11, pad=8, height=22)
    legend = (("fail", s["red"], 338), ("review", s["orange"], 392),
              ("pass", s["green"], 452), ("skipped", s["faint"], 506),
              ("不适用", s["faint"], 576))
    for label, color, x in legend:
        v.rect(x, 352, 8, 8, fill=color, rx=2)
        v.text(x + 13, 360, label, 11, s["sub"], max_w=44,
               mono=label != "不适用")
    v.text(338, 388, "E002 · fail 1 · skipped 5 · 不适用 11", 13,
           s["text"], max_w=364)
    v.line(336, 400, 704, 400, stroke=s["grid"], sw=1)

    v.rect(334, 408, 372, 48, fill=s["green_bg"], rx=12,
           stroke=s["green_edge"], sw=1)
    v.rect(334, 408, 4, 48, fill=s["green"], rx=2)
    v.text(350, 428, "已执行", 12.5, s["text"], weight=700, max_w=52)
    v.text(408, 428, "fail / review / pass → 结论", 11.5, s["sub"],
           max_w=230)
    v.text(696, 428, "1 条", 11, s["green"], anchor="end", max_w=44)

    v.rect(334, 466, 372, 58, fill=s["amber_bg"], rx=12,
           stroke=s["amber_edge"], sw=1)
    v.rect(334, 466, 4, 58, fill=s["orange"], rx=2)
    v.text(350, 486, "未执行", 12.5, s["text"], weight=700, max_w=52)
    v.text(408, 486, "skipped 5 · disabled 3 · 缺口 4", 11.5, s["sub"],
           max_w=280)
    v.text(350, 506, "字段缺失 / 条件不可求值 / 参数缺口", 11,
           s["orange"], max_w=330)

    # ---- right: verdict staircase -----------------------------------------
    v.text(744, 108, "逐行归并 · 按优先级向下", 11, s["faint"], max_w=260)

    stairs = (
        dict(x=744, y=120, w=298, h=84, name="fail", zh="不通过",
             color=s["red"], bg=s["red_bg"], edge=s["red_edge"],
             guard="任一适用规则 fail", detail="E002 基数低于下限",
             count="2", tag="fail"),
        dict(x=760, y=220, w=282, h=84, name="review", zh="需人工确认",
             color=s["orange"], bg=s["amber_bg"], edge=s["amber_edge"],
             guard="无 fail；有 review", detail="或关键条件不可求值",
             count="0", tag="review"),
        dict(x=776, y=320, w=266, h=84, name="pass_with_gaps",
             zh="通过但有未核验", color=s["accent"], bg=s["blue_bg"],
             edge=s["blue_edge"], guard="有规则未执行 → 封顶",
             detail="未核验 ≠ 合规", count="1", tag="gaps"),
        dict(x=792, y=420, w=250, h=84, name="pass", zh="通过",
             color=s["green"], bg=s["green_bg"], edge=s["green_edge"],
             guard="全部适用规则执行", detail="且无 fail",
             count="0", tag="pass"),
    )
    for st in stairs:
        v.rect(st["x"], st["y"], st["w"], st["h"], fill=st["bg"], rx=16,
               stroke=st["edge"], sw=1.5, shadow=True)
        v.rect(st["x"], st["y"], 4, st["h"], fill=st["color"], rx=2)
        v.text(st["x"] + 18, st["y"] + 28, st["name"], 16, st["color"],
               mono=True, weight=700, max_w=170)
        if st["name"] == "pass_with_gaps":
            # The long state name and its Chinese label need separate rows,
            # otherwise the label collides with the counter.
            v.text(st["x"] + 18, st["y"] + 52, st["zh"], 12, s["text"],
                   max_w=196)
            v.text(st["x"] + 18, st["y"] + 70, st["guard"], 11.5, s["sub"],
                   max_w=196)
        else:
            v.text(st["x"] + 18 + measure(st["name"], 16, "mono_bold") + 10,
                   st["y"] + 27, st["zh"], 12, s["text"], max_w=96)
            v.text(st["x"] + 18, st["y"] + 52, st["guard"], 11.5, s["sub"],
                   max_w=196)
            v.text(st["x"] + 18, st["y"] + 70, st["detail"], 11,
                   st["color"], max_w=196)
        v.text(st["x"] + st["w"] - 16, st["y"] + 38, st["count"], 24,
               st["color"], mono=True, weight=700, anchor="end", max_w=36)
        v.text(st["x"] + st["w"] - 16, st["y"] + 58, "样例行", 11,
               s["faint"], anchor="end", max_w=40)

    for x1, top, x2, bottom, label_y in ((893, 204, 901, 220, 216),
                                         (901, 304, 909, 320, 316),
                                         (909, 404, 917, 420, 416)):
        v.path(f"M{x1} {top} L{x2} {bottom - 2}", stroke=s["faint"], sw=1.5,
               marker="arr")
        v.text(x2 + 8, label_y, "否则", 11, s["faint"], max_w=28)

    # checked result bus -> the fail gate; unchecked channel -> pass_with_gaps
    v.path("M720 432 H736 V162 H742", stroke=s["accent"], sw=2,
           marker="arr")
    v.path("M720 495 H748 V362 H774", stroke=s["orange"], sw=2,
           dash="6 4", marker="arr-amber")

    # ---- footer: report order ---------------------------------------------
    v.rect(44, 552, 1012, 72, fill=s["panel"], rx=18, stroke=s["edge"],
           sw=1.5, shadow=True)
    v.text(62, 576, "报告顺序", 13, s["text"], weight=700, max_w=64)
    order = ("未核验项", "参数缺口", "逐人四态", "差异 + 引文")
    x = 150
    for i, label in enumerate(order):
        w = measure(label, 11.5, "cjk_bold") + 18
        v.rect(x, 586, w, 22, fill=s["band"], rx=11)
        v.text(x + 9, 601, label, 11.5, s["sub"], max_w=w - 18)
        x += w
        if i < len(order) - 1:
            v.path(f"M{x + 3} 597 H{x + 13}", stroke=s["faint"], sw=1.4,
                   marker="arr")
            x += 20
    v.rect(900, 560, 138, 30, fill="none", rx=12,
           stroke=s["orange"], sw=1.5, dash="5 3")
    v.text(969, 580, "未核验 ≠ 合规", 11.5, s["orange"], weight=700,
           anchor="middle", max_w=126)
    v.text(62, 617, "output.schema：summary · uncheckedCount · "
           "parameterGaps · markdown · resultJson", 11, s["faint"],
           mono=True, max_w=780)
    v.text(1038, 617, "结论留给复核人", 11, s["sub"], anchor="end",
           max_w=110)

    if v.overflows:
        raise SystemExit("FATAL: SVG text overflow:\n  " + "\n  ".join(v.overflows))
    return v.svg(W, H, "dsh-payroll-audit four-state verdict staircase")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for lang in ("zh", "en"):
        for skin in ("light", "dark"):
            hero(lang, skin)
    for skin in ("light", "dark"):
        name = f"dsh-payroll-audit-flow-v5-{skin}.svg"
        with open(os.path.join(OUT, name), "w", encoding="utf-8",
                  newline="\n") as fh:
            fh.write(flow_svg(skin))
        print(f"wrote {name} (1100x660)")
    print("done: 4 hero WebP + 2 flow SVG in docs/assets/")


if __name__ == "__main__":
    main()
