#!/usr/bin/env python3
"""Render docs/demo.gif — a walkthrough of `npm run init` in quick mode.

Recreates the @clack/prompts UI (symbols, colors, note boxes) with the
real wizard copy and cost numbers from scripts/cost.ts. Geometric box
drawing keeps the GIF crisp at GIF-friendly palettes.

Usage:
    python3 scripts/demo/render-gif.py
"""

from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "demo.gif"
FONT_PATH = Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")
FONT_BOLD = Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf")

# One Dark-ish, matching picocolors roles clack uses (cyan/green/gray/magenta).
PALETTE = {
    "bg": (27, 30, 40),
    "titlebar": (35, 38, 51),
    "rule": (48, 52, 67),
    "fg": (216, 222, 233),
    "dim": (123, 131, 148),
    "gray": (91, 100, 117),
    "cyan": (121, 192, 206),
    "green": (163, 190, 140),
    "magenta": (197, 163, 224),
    "red": (191, 97, 106),
    "yellow": (235, 203, 139),
    "traffic_r": (255, 95, 86),
    "traffic_y": (255, 189, 46),
    "traffic_g": (39, 201, 63),
}

COLS = 94
ROWS = 25
FONT_SIZE = 15
LINE_HEIGHT = 22
PAD_X = 22
PAD_Y = 14
TITLE_H = 36

SUMMARY_BODY = """\
Project     Acme (acme)
Target      ../acme
Region      eu-central-1
Domain      acme.example
Database    aurora-serverless-v2 / acme
Stages      dev, staging, production*
Review PRs  no
Bucket      acme-files-<stage>

Estimated monthly spend: $235
  dev                   $11 / mo
  staging               $11 / mo
  production           $201 / mo

Biggest levers:
  - Aurora min ACU is billed 24/7. 1 ACU is ~$88/month before replicas."""

CREATED_BODY = """\
../acme
  acme-app/
  acme-root-project/
  acme-vault/
  docs/costs.md
  bootstrap-init.answers.json

Deploy order: vault → root project → app."""


@dataclass(frozen=True)
class Cell:
    ch: str
    color: str = "fg"
    inverse: bool = False


Line = list[Cell]


def cells(text: str, color: str = "fg", inverse: bool = False) -> Line:
    return [Cell(ch, color, inverse) for ch in text]


def join_lines(*parts: Line) -> Line:
    out: Line = []
    for part in parts:
        out.extend(part)
    return out


def gray_bar() -> Line:
    return cells("│", "gray")


def cyan_bar() -> Line:
    return cells("│", "cyan")


def intro_line(title: str) -> Line:
    return join_lines(cells("┌", "gray"), cells(f"  {title}", "fg"))


def outro_line(title: str) -> Line:
    return join_lines(cells("└", "gray"), cells(f"  {title}", "fg"))


def submitted_header(message: str) -> Line:
    return join_lines(cells("◇", "green"), cells(f"  {message}", "fg"))


def active_header(message: str) -> Line:
    return join_lines(cells("◆", "cyan"), cells(f"  {message}", "fg"))


def dim_value(value: str) -> Line:
    return join_lines(gray_bar(), cells(f"  {value}", "dim"))


def placeholder_line(placeholder: str) -> Line:
    line = cyan_bar() + cells("  ")
    if not placeholder:
        line += [Cell(" ", "fg", inverse=True)]
        return line
    line += [Cell(placeholder[0], "fg", inverse=True)]
    line += cells(placeholder[1:], "dim")
    return line


def typing_line(value: str, cursor: bool = True) -> Line:
    line = cyan_bar() + cells(f"  {value}", "fg")
    if cursor:
        line.append(Cell(" ", "fg", inverse=True))
    return line


def cyan_end() -> Line:
    return cells("└", "cyan")


def select_active(label: str, hint: str) -> Line:
    return join_lines(
        cyan_bar(),
        cells("  "),
        cells("●", "green"),
        cells(f" {label}", "fg"),
        cells(f" ({hint})", "dim") if hint else [],
    )


def select_inactive(label: str) -> Line:
    return join_lines(
        cyan_bar(),
        cells("  "),
        cells("○", "dim"),
        cells(f" {label}", "dim"),
    )


def confirm_active(yes: bool) -> Line:
    if yes:
        return join_lines(
            cyan_bar(),
            cells("  "),
            cells("●", "green"),
            cells(" Yes", "fg"),
            cells(" / ", "dim"),
            cells("○", "dim"),
            cells(" No", "dim"),
        )
    return join_lines(
        cyan_bar(),
        cells("  "),
        cells("○", "dim"),
        cells(" Yes", "dim"),
        cells(" / ", "dim"),
        cells("●", "green"),
        cells(" No", "fg"),
    )


def note_lines(title: str, body: str) -> list[Line]:
    """Match @clack/prompts `note()` box geometry (without extra blank padding)."""
    wrapped = body.split("\n")
    content_w = max(len(line) for line in wrapped)
    width = max(content_w, len(title)) + 2
    dashes = max(width - len(title) - 1, 1)
    header = join_lines(
        cells("◇", "green"),
        cells(f"  {title} ", "fg"),
        cells("─" * dashes + "╮", "gray"),
    )
    rows = [
        join_lines(
            gray_bar(),
            cells(f"  {line}", "dim"),
            cells(" " * (width - len(line)), "dim"),
            cells("│", "gray"),
        )
        for line in wrapped
    ]
    footer = cells("├" + "─" * (width + 2) + "╯", "gray")
    return [gray_bar(), header, *rows, footer]


def visible(lines: list[Line]) -> list[Line]:
    if len(lines) <= ROWS:
        return lines + [[] for _ in range(ROWS - len(lines))]
    return lines[-ROWS:]


class Terminal:
    def __init__(self) -> None:
        self.font = ImageFont.truetype(str(FONT_PATH), FONT_SIZE)
        self.font_bold = ImageFont.truetype(str(FONT_BOLD), 13)
        self.cw = round(self.font.getlength("M"))
        self.ch = LINE_HEIGHT
        self.term_w = PAD_X * 2 + self.cw * COLS
        self.term_h = TITLE_H + PAD_Y * 2 + self.ch * ROWS
        self.w = self.term_w
        self.h = self.term_h

    def render(self, lines: list[Line], spinner_frame: int | None = None) -> Image.Image:
        img = Image.new("RGB", (self.w, self.h), PALETTE["titlebar"])
        draw = ImageDraw.Draw(img)
        # Title bar
        draw.rectangle((0, TITLE_H, self.w, self.h), fill=PALETTE["bg"])
        draw.line((0, TITLE_H, self.w, TITLE_H), fill=PALETTE["rule"])
        r = 6
        for i, key in enumerate(("traffic_r", "traffic_y", "traffic_g")):
            cx = 18 + i * 16
            cy = TITLE_H // 2
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=PALETTE[key])
        title = "npm run init"
        tw = self.font_bold.getlength(title)
        draw.text(
            ((self.w - tw) / 2, (TITLE_H - 16) / 2),
            title,
            font=self.font_bold,
            fill=PALETTE["dim"],
        )

        origin_x = PAD_X
        origin_y = TITLE_H + PAD_Y
        for row, line in enumerate(visible(lines)):
            y = origin_y + row * self.ch
            x = origin_x
            for col, cell in enumerate(line):
                if col >= COLS:
                    break
                self._draw_cell(draw, x, y, cell, spinner_frame if col == 0 else None)
                x += self.cw
        return img

    def _draw_cell(
        self,
        draw: ImageDraw.ImageDraw,
        x: int,
        y: int,
        cell: Cell,
        spinner_frame: int | None,
    ) -> None:
        color = PALETTE[cell.color]
        cx = x + self.cw / 2
        cy = y + self.ch / 2
        if cell.inverse:
            draw.rectangle((x, y + 3, x + self.cw, y + self.ch - 3), fill=PALETTE["fg"])
            fill = PALETTE["bg"]
        else:
            fill = color

        ch = cell.ch
        if spinner_frame is not None and ch in "◐◓◑◒":
            self._draw_spinner(draw, cx, cy, spinner_frame, PALETTE["magenta"])
            return
        if ch in "┌┐└┘│─├┤╮╯◇◆●○":
            self._draw_shape(draw, ch, cx, cy, x, y, fill)
            return
        if ch == " ":
            return
        draw.text((x, y + 2), ch, font=self.font, fill=fill)

    def _hbar(
        self,
        draw: ImageDraw.ImageDraw,
        x0: float,
        x1: float,
        y: float,
        fill: tuple[int, int, int],
        weight: int = 2,
    ) -> None:
        y0 = int(round(y - weight / 2))
        draw.rectangle(
            (int(round(x0)), y0, int(round(x1)), y0 + weight - 1),
            fill=fill,
        )

    def _vbar(
        self,
        draw: ImageDraw.ImageDraw,
        x: float,
        y0: float,
        y1: float,
        fill: tuple[int, int, int],
        weight: int = 2,
    ) -> None:
        x0 = int(round(x - weight / 2))
        draw.rectangle(
            (x0, int(round(y0)), x0 + weight - 1, int(round(y1))),
            fill=fill,
        )

    def _draw_shape(
        self,
        draw: ImageDraw.ImageDraw,
        ch: str,
        cx: float,
        cy: float,
        x: int,
        y: int,
        fill: tuple[int, int, int],
    ) -> None:
        mx = x + self.cw / 2
        my = y + self.ch / 2
        x1 = x + self.cw
        y1 = y + self.ch
        # Overlap neighbouring cells by 1px so joints stay closed.
        if ch == "│":
            self._vbar(draw, mx, y, y1 + 1, fill)
        elif ch == "─":
            self._hbar(draw, x, x1 + 1, my, fill)
        elif ch == "┌":
            self._vbar(draw, mx, my, y1 + 1, fill)
            self._hbar(draw, mx, x1 + 1, my, fill)
        elif ch == "└":
            self._vbar(draw, mx, y, my + 1, fill)
            self._hbar(draw, mx, x1 + 1, my, fill)
        elif ch == "├":
            self._vbar(draw, mx, y, y1 + 1, fill)
            self._hbar(draw, mx, x1 + 1, my, fill)
        elif ch == "╮":
            self._hbar(draw, x, mx + 1, my, fill)
            self._vbar(draw, mx, my, y1 + 1, fill)
        elif ch == "╯":
            self._hbar(draw, x, mx + 1, my, fill)
            self._vbar(draw, mx, y, my + 1, fill)
        elif ch == "◆":
            r = 5
            draw.polygon(
                [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)],
                fill=fill,
            )
        elif ch == "◇":
            r = 5.5
            pts = [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]
            draw.line(pts + [pts[0]], fill=fill, width=2, joint="curve")
        elif ch == "●":
            draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=fill)
        elif ch == "○":
            draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), outline=fill, width=2)

    def _draw_spinner(
        self,
        draw: ImageDraw.ImageDraw,
        cx: float,
        cy: float,
        frame: int,
        fill: tuple[int, int, int],
    ) -> None:
        r = 5
        bbox = (cx - r, cy - r, cx + r, cy + r)
        draw.arc(bbox, 0, 360, fill=fill, width=2)
        start = (frame % 8) * 45
        draw.pieslice(bbox, start, start + 80, fill=fill)


def prompt_history() -> list[Line]:
    return [
        intro_line("bootstrap-init"),
        gray_bar(),
        submitted_header("Project name (slug)"),
        dim_value("acme"),
        gray_bar(),
        submitted_header("Display name"),
        dim_value("Acme"),
        gray_bar(),
        submitted_header("Target directory (project folders are created inside it)"),
        dim_value("../acme"),
        gray_bar(),
        submitted_header("Setup mode"),
        dim_value("Quick"),
    ]


def cmd_lines(typed: str, cursor: bool) -> list[Line]:
    line = cells("$ ", "green") + cells(typed, "fg")
    if cursor:
        line.append(Cell(" ", "fg", inverse=True))
    return [line, []]


class Timeline:
    def __init__(self, terminal: Terminal, tmp: Path) -> None:
        self.terminal = terminal
        self.tmp = tmp
        self.frames: list[tuple[Path, float]] = []
        self.n = 0

    def add(self, lines: list[Line], seconds: float, spinner_frame: int | None = None) -> None:
        img = self.terminal.render(lines, spinner_frame)
        path = self.tmp / f"frame-{self.n:04d}.png"
        img.save(path, "PNG")
        self.frames.append((path, seconds))
        self.n += 1

    def hold(self, lines: list[Line], seconds: float, spinner_frame: int | None = None) -> None:
        self.add(lines, seconds, spinner_frame)


def build_timeline(tl: Timeline) -> None:

    # Type the command.
    command = "npm run init"
    typed = ""
    tl.hold(cmd_lines(typed, True), 0.45)
    for ch in command:
        typed += ch
        tl.hold(cmd_lines(typed, True), 0.07 if ch != " " else 0.12)
    tl.hold(cmd_lines(typed, True), 0.35)
    tl.hold(cmd_lines(typed, False), 0.12)

    after_cmd = [join_lines(cells("$ ", "green"), cells("npm run init", "fg")), []]

    def screen(*extra: Line) -> list[Line]:
        return after_cmd + list(extra)

    # Intro + empty project name prompt with placeholder.
    empty_name = screen(
        intro_line("bootstrap-init"),
        gray_bar(),
        active_header("Project name (slug)"),
        placeholder_line("acme"),
        cyan_end(),
    )
    tl.hold(empty_name, 0.55)

    name = ""
    for ch in "acme":
        name += ch
        tl.hold(
            screen(
                intro_line("bootstrap-init"),
                gray_bar(),
                active_header("Project name (slug)"),
                typing_line(name),
                cyan_end(),
            ),
            0.14,
        )
    tl.hold(
        screen(
            intro_line("bootstrap-init"),
            gray_bar(),
            active_header("Project name (slug)"),
            typing_line(name, cursor=True),
            cyan_end(),
        ),
        0.35,
    )

    # Display name (prefilled).
    display = screen(
        intro_line("bootstrap-init"),
        gray_bar(),
        submitted_header("Project name (slug)"),
        dim_value("acme"),
        gray_bar(),
        active_header("Display name"),
        typing_line("Acme"),
        cyan_end(),
    )
    tl.hold(display, 0.7)

    # Target directory (prefilled default).
    target = screen(
        intro_line("bootstrap-init"),
        gray_bar(),
        submitted_header("Project name (slug)"),
        dim_value("acme"),
        gray_bar(),
        submitted_header("Display name"),
        dim_value("Acme"),
        gray_bar(),
        active_header("Target directory (project folders are created inside it)"),
        typing_line("../acme"),
        cyan_end(),
    )
    tl.hold(target, 0.75)

    # Setup mode select — Quick highlighted.
    mode_hint = "eu-central-1, dev/staging/production, Aurora scale-to-zero, EC2 NAT, no proxy"
    mode = screen(
        intro_line("bootstrap-init"),
        gray_bar(),
        submitted_header("Project name (slug)"),
        dim_value("acme"),
        gray_bar(),
        submitted_header("Display name"),
        dim_value("Acme"),
        gray_bar(),
        submitted_header("Target directory (project folders are created inside it)"),
        dim_value("../acme"),
        gray_bar(),
        active_header("Setup mode"),
        select_active("Quick", mode_hint),
        select_inactive("Advanced"),
        cyan_end(),
    )
    tl.hold(mode, 1.8)

    history = screen(*prompt_history())
    summary = history + note_lines("Summary", SUMMARY_BODY)
    confirm = summary + [
        gray_bar(),
        active_header("Generate the project?"),
        confirm_active(True),
        cyan_end(),
    ]
    tl.hold(confirm, 3.4)

    # Confirm submitted, spinner.
    generating_base = history + note_lines("Summary", SUMMARY_BODY) + [
        gray_bar(),
        submitted_header("Generate the project?"),
        dim_value("Yes"),
        gray_bar(),
    ]
    for i in range(16):
        dots = (i % 4)
        line = join_lines(cells("◐", "magenta"), cells(f"  Generating project{'.' * dots}", "fg"))
        tl.hold(generating_base + [line], 0.09, spinner_frame=i)

    generated = generating_base + [
        join_lines(cells("◇", "green"), cells("  Project generated", "fg")),
    ]
    created = generated + note_lines("Created", CREATED_BODY)
    done = created + [gray_bar(), outro_line("Done.")]
    tl.hold(done, 3.6)


def encode_gif(frames: list[tuple[Path, float]], dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["convert", "-loop", "0", "-dither", "None"]
    for path, seconds in frames:
        delay = max(2, round(seconds * 100))
        cmd.extend(["-delay", str(delay), str(path)])
    cmd.extend(["-layers", "OptimizeFrame", str(dest)])
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        return

    images: list[Image.Image] = []
    durations: list[int] = []
    for path, seconds in frames:
        images.append(Image.open(path).convert("RGB"))
        durations.append(max(20, int(round(seconds * 1000))))

    colors = list(PALETTE.values())
    while len(colors) < 256:
        colors.append((0, 0, 0))
    palette = Image.new("P", (1, 1))
    palette.putpalette([channel for rgb in colors for channel in rgb])
    quantized = [
        image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images
    ]
    quantized[0].save(
        dest,
        save_all=True,
        append_images=quantized[1:],
        duration=durations,
        loop=0,
        optimize=False,
        disposal=2,
    )


def main() -> None:
    if not FONT_PATH.exists():
        raise SystemExit(f"Missing font: {FONT_PATH}")
    terminal = Terminal()
    with tempfile.TemporaryDirectory(prefix="bootstrap-init-demo-") as raw:
        tmp = Path(raw)
        tl = Timeline(terminal, tmp)
        build_timeline(tl)
        encode_gif(tl.frames, OUT)
    size_kb = OUT.stat().st_size / 1024
    print(f"Wrote {OUT.relative_to(ROOT)} ({size_kb:.0f} KiB, {terminal.w}×{terminal.h})")


if __name__ == "__main__":
    main()
