#!/usr/bin/env python3
"""Rebuild the proposed Limitless entity diagram without third-party packages.

Run: python3 docs/assets/render_backend_schema.py
SVG and Mermaid are portable. PNG is rendered on macOS with Swift/AppKit.
Only the entities and real foreign-key relationships are shown; this is not
a migration or a statement about the currently deployed database.
"""

from __future__ import annotations

import html
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


OUT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1920, 1152
INK = "#172B46"
MUTED = "#607188"
ARROW = "#487698"
COMMANDS = []
ENTITIES = []
RELATIONS = [
    ("workout_programs", "program_exercises", False),
    ("exercises", "program_exercises", False),
    ("workout_programs", "workouts", True),
    ("workouts", "workout_exercises", False),
    ("exercises", "workout_exercises", False),
    ("dishes", "nutrition_entries", True),
    ("subjects", "lab_works", False),
]
COLORS = {
    "core": ("#6C59BB", "#F5F2FC", "#D9D0EF"),
    "sport": ("#2870B4", "#F0F6FC", "#BED5EA"),
    "food": ("#267B69", "#F0F8F5", "#BEDFD3"),
    "study": ("#AB6B29", "#FFF8EF", "#ECD4B4"),
    "work": ("#7955A2", "#F7F3FB", "#D9CAE8"),
    "mind": ("#4F7383", "#F1F7F9", "#C7DDE4"),
}


def rect(x, y, w, h, fill, stroke=None, radius=16, line_width=1.4):
    COMMANDS.append(dict(kind="rect", x=x, y=y, w=w, h=h, fill=fill,
                         stroke=stroke, radius=radius, line_width=line_width))


def text(x, y, value, size=20, color=INK, bold=False, anchor="start"):
    COMMANDS.append(dict(kind="text", x=x, y=y, value=value, size=size,
                         color=color, bold=bold, anchor=anchor))


def line(points, color=ARROW, width=2.6, arrow=False):
    COMMANDS.append(dict(kind="line", points=points, color=color,
                         line_width=width, arrow=arrow))


def panel(x, y, w, h, title, palette, count, header=True):
    accent, _, _ = COLORS[palette]
    rect(x, y, w, h, "#FFFFFF", "#DCE5EF", radius=20)
    if header:
        rect(x + 28, y + 24, 5, 24, accent, radius=2)
        text(x + 46, y + 44, title, size=25, bold=True)
        text(x + w - 28, y + 43, str(count), size=20,
             color=accent, bold=True, anchor="end")


def entity(name, title, x, y, w, h, palette, size=23):
    _, fill, stroke = COLORS[palette]
    rect(x, y, w, h, fill, stroke, radius=12)
    text(x + w / 2, y + h / 2 - 3, title, size=size, bold=True, anchor="middle")
    text(x + w / 2, y + h / 2 + 24, name, size=18,
         color=MUTED, anchor="middle")
    ENTITIES.append((name, title, palette))


def cardinality(x, y):
    rect(x - 26, y - 19, 52, 29, "#FFFFFF", radius=8)
    text(x, y + 2, "1:N", size=18, color=ARROW, bold=True, anchor="middle")


def compose():
    rect(0, 0, WIDTH, HEIGHT, "#F3F6FA", radius=0)
    text(48, 69, "Limitless · Схема данных", size=42, bold=True)
    text(50, 105, "18 сущностей · 6 разделов · 7 связей FK", size=21, color=MUTED)
    rect(1538, 40, 334, 42, "#E8EEF6", radius=21)
    text(1705, 68, "Проект будущей схемы", size=20, color="#415976", anchor="middle")

    panel(48, 132, 1824, 164, "Ядро", "core", 5)
    for index, (name, title) in enumerate([
        ("profiles", "Профиль"), ("tasks", "Дейлики"), ("quests", "Квесты"),
        ("focus_sessions", "Фокус"), ("mentors", "Менторы"),
    ]):
        entity(name, title, 80 + index * 356, 190, 336, 78, "core")

    panel(48, 320, 900, 612, "Спорт", "sport", 5)
    panel(972, 320, 438, 256, "Питание", "food", 2)
    panel(1434, 320, 438, 256, "Учёба", "study", 2)
    panel(972, 600, 900, 140, "Работа", "work", 1, header=False)
    panel(972, 764, 900, 168, "Рациональность", "mind", 3)

    # Arrows point from the referenced (one) entity to the referencing (many)
    # entity. Ports and right-angle routes keep the five sports links apart.
    line([(353, 480), (353, 526), (436, 526), (436, 558)], arrow=True)
    line([(645, 480), (645, 526), (580, 526), (580, 558)], arrow=True)
    line([(190, 480), (190, 778)], arrow=True)
    line([(840, 480), (840, 778)], arrow=True)
    line([(428, 820), (568, 820)], arrow=True)
    cardinality(390, 525)
    cardinality(614, 525)
    cardinality(190, 678)
    cardinality(840, 678)
    cardinality(498, 819)

    entity("workout_programs", "Программы", 80, 392, 348, 88, "sport")
    entity("exercises", "Упражнения", 568, 392, 348, 88, "sport")
    entity("program_exercises", "Состав программ", 334, 558, 348, 88, "sport")
    entity("workouts", "Посещения зала / волейбола", 80, 778, 348, 88, "sport", size=21)
    entity("workout_exercises", "Результаты упражнений", 568, 778, 348, 88, "sport", size=22)
    text(80, 906, "Для зала программа обязательна; у волейбола её нет.", size=18, color=MUTED)

    line([(1191, 452), (1191, 489)], arrow=True)
    text(1230, 478, "1:N", size=18, color=ARROW, bold=True)
    entity("dishes", "Блюда", 1004, 382, 374, 70, "food", size=22)
    entity("nutrition_entries", "Питание сегодня", 1004, 489, 374, 70, "food", size=22)

    line([(1653, 452), (1653, 489)], arrow=True)
    text(1692, 478, "1:N", size=18, color=ARROW, bold=True)
    entity("subjects", "Предметы", 1466, 382, 374, 70, "study", size=22)
    entity("lab_works", "Лабораторные", 1466, 489, 374, 70, "study", size=22)

    rect(1000, 650, 5, 24, COLORS["work"][0], radius=2)
    text(1018, 672, "Работа", size=25, bold=True)
    entity("coding_tasks", "Задачи LeetCode", 1204, 624, 636, 92, "work", size=24)

    for index, (name, title) in enumerate([
        ("knowledge_entries", "Справочник"), ("books", "Книги"), ("scenarios", "Ситуации"),
    ]):
        entity(name, title, 1004 + index * 284, 823, 268, 81, "mind", size=22)

    rect(48, 956, 1824, 150, "#E8EEF5", radius=18)
    line([(80, 992), (150, 992)], arrow=True)
    text(172, 1000, "Сплошная стрелка — реальный внешний ключ (FK), связь 1:N: от одной записи к многим.", size=21)
    text(80, 1040, "Программа нужна только для зала; ручное питание не связано с блюдом.", size=20, color=MUTED)
    text(80, 1079, "Один пользователь. XP и статы меняются backend-операциями; внешних ключей к profiles нет.", size=20, color=MUTED)


def arrow_triangle(points):
    (x0, y0), (x, y) = points[-2:]
    distance = math.hypot(x - x0, y - y0)
    ux, uy = (x - x0) / distance, (y - y0) / distance
    return [(x, y), (x - 11 * ux + 5 * uy, y - 11 * uy - 5 * ux),
            (x - 11 * ux - 5 * uy, y - 11 * uy + 5 * ux)]


def write_svg():
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title desc">',
             '<title id="title">Проект схемы данных Limitless — 18 сущностей</title>',
             '<desc id="desc">Таблицы сгруппированы по разделам: ядро, спорт, питание, учёба, работа и рациональность. Показаны семь реальных связей внешних ключей 1:N. Внешних ключей к профилю нет. Это проект будущей схемы, не применённая база данных.</desc>']
    for c in COMMANDS:
        if c["kind"] == "rect":
            parts.append(f'<rect x="{c["x"]}" y="{c["y"]}" width="{c["w"]}" height="{c["h"]}" rx="{c["radius"]}" fill="{c["fill"]}" stroke="{c["stroke"] or "none"}" stroke-width="{c["line_width"]}"/>')
        elif c["kind"] == "text":
            weight = 700 if c["bold"] else 400
            parts.append(f'<text x="{c["x"]}" y="{c["y"]}" fill="{c["color"]}" font-family="Arial, Helvetica, sans-serif" font-size="{c["size"]}" font-weight="{weight}" text-anchor="{c["anchor"]}">{html.escape(c["value"])}</text>')
        elif c["kind"] == "line":
            points = " ".join(f"{x},{y}" for x, y in c["points"])
            parts.append(f'<polyline points="{points}" fill="none" stroke="{c["color"]}" stroke-width="{c["line_width"]}" stroke-linecap="round" stroke-linejoin="round"/>')
            if c["arrow"]:
                triangle = " ".join(f"{x},{y}" for x, y in arrow_triangle(c["points"]))
                parts.append(f'<polygon points="{triangle}" fill="{c["color"]}"/>')
    parts.append('</svg>')
    (OUT / "backend-schema.svg").write_text("\n".join(parts) + "\n", encoding="utf-8")


def write_mermaid():
    parts = ["%% Proposed schema only; not a migration or a deployed-schema snapshot.",
             "%% Arrows run from referenced entity (one) to referencing entity (many).",
             "%% profiles has no user_id foreign-key relationships in this single-user app.",
             "flowchart TB"]
    for group, label in [("core", "Ядро"), ("sport", "Спорт"), ("food", "Питание"),
                         ("study", "Учёба"), ("work", "Работа"), ("mind", "Рациональность")]:
        parts.append(f'    subgraph {group}["{label}"]')
        for name, title, entity_group in ENTITIES:
            if entity_group == group:
                parts.append(f'        {name}["{title}<br/>{name}"]')
        parts.append("    end")
    parts.append("")
    for parent, child, optional in RELATIONS:
        label = "1:N"
        if optional:
            label = "1:N · только для зала" if child == "workouts" else "1:N · кроме ручного ввода"
        parts.append(f'    {parent} -->|"{label}"| {child}')
    parts.extend(["", "%% Для зала программа обязательна; у волейбола её нет.",
                  "%% Программа нужна только для зала; ручное питание не связано с блюдом.",
                  "%% XP and stats are changed by backend operations, not profile FKs."])
    (OUT / "backend-schema.mmd").write_text("\n".join(parts) + "\n", encoding="utf-8")


SWIFT_RENDERER = r'''
import AppKit
import CoreText

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let document = try JSONSerialization.jsonObject(with: Data(contentsOf: input)) as! [String: Any]
let width = document["width"] as! Int
let height = document["height"] as! Int
let commands = document["commands"] as! [[String: Any]]
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width,
    pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0)!
let graphics = NSGraphicsContext(bitmapImageRep: bitmap)!
let context = graphics.cgContext
context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)

func number(_ c: [String: Any], _ key: String) -> CGFloat {
    return CGFloat((c[key] as! NSNumber).doubleValue)
}
func color(_ value: String) -> NSColor {
    let value = UInt32(value.dropFirst(), radix: 16)!
    return NSColor(srgbRed: CGFloat((value >> 16) & 255) / 255,
                   green: CGFloat((value >> 8) & 255) / 255,
                   blue: CGFloat(value & 255) / 255, alpha: 1)
}
func point(_ pair: [Double]) -> CGPoint {
    return CGPoint(x: pair[0], y: Double(height) - pair[1])
}

for command in commands {
    switch command["kind"] as! String {
    case "rect":
        let x = number(command, "x"), y = number(command, "y")
        let w = number(command, "w"), h = number(command, "h")
        let radius = number(command, "radius")
        let path = CGPath(roundedRect: CGRect(x: x, y: CGFloat(height) - y - h,
            width: w, height: h), cornerWidth: radius, cornerHeight: radius, transform: nil)
        context.addPath(path)
        context.setFillColor(color(command["fill"] as! String).cgColor)
        context.fillPath()
        if let stroke = command["stroke"] as? String {
            context.addPath(path)
            context.setStrokeColor(color(stroke).cgColor)
            context.setLineWidth(number(command, "line_width"))
            context.strokePath()
        }
    case "text":
        let bold = command["bold"] as! Bool
        let font = NSFont(name: bold ? "Arial-BoldMT" : "ArialMT", size: number(command, "size"))!
        let attributed = NSAttributedString(string: command["value"] as! String,
            attributes: [.font: font, .foregroundColor: color(command["color"] as! String)])
        let textLine = CTLineCreateWithAttributedString(attributed)
        let textWidth = CGFloat(CTLineGetTypographicBounds(textLine, nil, nil, nil))
        var x = number(command, "x")
        if command["anchor"] as! String == "middle" { x -= textWidth / 2 }
        if command["anchor"] as! String == "end" { x -= textWidth }
        context.textPosition = CGPoint(x: x, y: CGFloat(height) - number(command, "y"))
        CTLineDraw(textLine, context)
    case "line":
        let points = command["points"] as! [[Double]]
        context.beginPath()
        context.move(to: point(points[0]))
        for p in points.dropFirst() { context.addLine(to: point(p)) }
        context.setStrokeColor(color(command["color"] as! String).cgColor)
        context.setLineWidth(number(command, "line_width"))
        context.setLineCap(.round)
        context.setLineJoin(.round)
        context.strokePath()
        if command["arrow"] as! Bool {
            let previous = points[points.count - 2], end = points.last!
            let distance = hypot(end[0] - previous[0], end[1] - previous[1])
            let ux = (end[0] - previous[0]) / distance, uy = (end[1] - previous[1]) / distance
            context.beginPath()
            context.move(to: point(end))
            context.addLine(to: point([end[0] - 11 * ux + 5 * uy, end[1] - 11 * uy - 5 * ux]))
            context.addLine(to: point([end[0] - 11 * ux - 5 * uy, end[1] - 11 * uy + 5 * ux]))
            context.closePath()
            context.setFillColor(color(command["color"] as! String).cgColor)
            context.fillPath()
        }
    default:
        fatalError("Unknown drawing command")
    }
}
try bitmap.representation(using: .png, properties: [:])!.write(to: output)
'''


def write_png():
    if sys.platform != "darwin" or not shutil.which("swift"):
        print("SVG and Mermaid saved; PNG requires macOS with Swift/AppKit.", file=sys.stderr)
        return
    with tempfile.TemporaryDirectory(prefix="limitless-schema-") as temp:
        temp = Path(temp)
        source = temp / "render.swift"
        drawing = temp / "drawing.json"
        source.write_text(SWIFT_RENDERER, encoding="utf-8")
        drawing.write_text(json.dumps(dict(width=WIDTH, height=HEIGHT, commands=COMMANDS),
                                      ensure_ascii=False), encoding="utf-8")
        import os
        env = os.environ.copy()
        env["CLANG_MODULE_CACHE_PATH"] = str(temp / "module-cache")
        subprocess.run(["swift", str(source), str(drawing), str(OUT / "backend-schema.png")],
                       env=env, check=True)


def main():
    compose()
    assert len(ENTITIES) == 18 and len({entity[0] for entity in ENTITIES}) == 18
    assert len(RELATIONS) == 7
    names = {entity[0] for entity in ENTITIES}
    assert all(a in names and b in names for a, b, _ in RELATIONS)
    assert not any("profiles" in (a, b) for a, b, _ in RELATIONS)
    OUT.mkdir(parents=True, exist_ok=True)
    write_svg()
    write_mermaid()
    write_png()
    print(f"Generated 18 entities and 7 relationships in {OUT}")


if __name__ == "__main__":
    main()
