"""Markdown reading copy -> PDF (ReportLab), for the documents Matt reads.

Handles what these docs use: headings, paragraphs, bullet and numbered lists,
pipe tables, block quotes, fenced code, horizontal rules, and inline bold,
italic, code and links. Dense on purpose.

  python md2pdf.py input.md output.pdf
"""
import html
import os
import re
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle, XPreformatted)

FONTS = r'C:\Windows\Fonts'
pdfmetrics.registerFont(TTFont('Body', os.path.join(FONTS, 'arial.ttf')))
pdfmetrics.registerFont(TTFont('Body-Bold', os.path.join(FONTS, 'arialbd.ttf')))
pdfmetrics.registerFont(TTFont('Body-Italic', os.path.join(FONTS, 'ariali.ttf')))
pdfmetrics.registerFont(TTFont('Body-BoldItalic', os.path.join(FONTS, 'arialbi.ttf')))
pdfmetrics.registerFont(TTFont('Mono', os.path.join(FONTS, 'consola.ttf')))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Body-Bold', italic='Body-Italic', boldItalic='Body-BoldItalic')

BASE = ParagraphStyle('base', fontName='Body', fontSize=9.5, leading=12.5, alignment=TA_LEFT, spaceAfter=5)
H = {
    1: ParagraphStyle('h1', parent=BASE, fontName='Body-Bold', fontSize=17, leading=21, spaceBefore=4, spaceAfter=8),
    2: ParagraphStyle('h2', parent=BASE, fontName='Body-Bold', fontSize=13, leading=16, spaceBefore=10, spaceAfter=5,
                      textColor=colors.HexColor('#1F3A5F')),
    3: ParagraphStyle('h3', parent=BASE, fontName='Body-Bold', fontSize=11, leading=14, spaceBefore=8, spaceAfter=4),
}
QUOTE = ParagraphStyle('quote', parent=BASE, fontName='Body-Italic', leftIndent=14, textColor=colors.HexColor('#333333'))
CELL = ParagraphStyle('cell', parent=BASE, fontSize=8.2, leading=10.2, spaceAfter=0)
CELL_H = ParagraphStyle('cellh', parent=CELL, fontName='Body-Bold')
CODE = ParagraphStyle('code', parent=BASE, fontName='Mono', fontSize=8, leading=10, leftIndent=8,
                      backColor=colors.HexColor('#F3F4F6'), borderPadding=4, spaceBefore=3, spaceAfter=8)
LIST = ParagraphStyle('list', parent=BASE, leftIndent=16, bulletIndent=5, spaceAfter=2.5)


def inline(text):
    """Markdown inline -> ReportLab mini-HTML. Code spans are protected first."""
    spans = []

    def keep(m):
        spans.append('<font name="Mono">%s</font>' % html.escape(m.group(1)))
        return '\x00%d\x00' % (len(spans) - 1)

    text = re.sub(r'`([^`]+)`', keep, text)
    text = html.escape(text, quote=False)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<link href="\2" color="#1A56DB"><u>\1</u></link>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', text)
    return re.sub('\x00(\\d+)\x00', lambda m: spans[int(m.group(1))], text)


def table(lines, width):
    rows = []
    for ln in lines:
        cells = [c.strip() for c in ln.strip().strip('|').split('|')]
        if all(re.fullmatch(r':?-{3,}:?', c) for c in cells if c):
            continue
        rows.append(cells)
    ncol = max(len(r) for r in rows)
    rows = [r + [''] * (ncol - len(r)) for r in rows]
    lengths = [max(min(len(r[i]), 90) for r in rows) + 4 for i in range(ncol)]
    total = sum(lengths)
    widths = [max(width * n / total, 0.6 * inch) for n in lengths]
    scale = width / sum(widths)
    widths = [w * scale for w in widths]
    data = [[Paragraph(inline(c), CELL_H if i == 0 else CELL) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#B8BEC6')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E8ECF1')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3), ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    return t


def build(md_path, pdf_path):
    with open(md_path, encoding='utf-8') as f:
        lines = f.read().splitlines()
    doc = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=0.7 * inch, rightMargin=0.7 * inch,
                            topMargin=0.65 * inch, bottomMargin=0.65 * inch)
    width = letter[0] - 1.4 * inch
    story, title, i = [], None, 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        if ln.startswith('```'):
            j = i + 1
            while j < len(lines) and not lines[j].startswith('```'):
                j += 1
            story.append(XPreformatted(html.escape('\n'.join(lines[i + 1:j])), CODE))
            i = j + 1
            continue
        m = re.match(r'(#{1,3})\s+(.*)', ln)
        if m:
            level = len(m.group(1))
            title = title or m.group(2)
            story.append(Paragraph(inline(m.group(2)), H[level]))
            i += 1
            continue
        if re.fullmatch(r'\s*-{3,}\s*', ln):
            story.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#B8BEC6'), spaceBefore=4, spaceAfter=6))
            i += 1
            continue
        if ln.lstrip().startswith('|'):
            j = i
            while j < len(lines) and lines[j].lstrip().startswith('|'):
                j += 1
            story.append(table(lines[i:j], width))
            story.append(Spacer(1, 6))
            i = j
            continue
        if ln.startswith('>'):
            j, buf = i, []
            while j < len(lines) and lines[j].startswith('>'):
                buf.append(lines[j].lstrip('>').strip())
                j += 1
            story.append(Paragraph(inline(' '.join(buf)), QUOTE))
            i = j
            continue
        lm = re.match(r'(\s*)(-|\d+\.)\s+(.*)', ln)
        if lm:
            items = []
            j = i
            while j < len(lines):
                cur = re.match(r'(\s*)(-|\d+\.)\s+(.*)', lines[j])
                if cur:
                    items.append([len(cur.group(1)), cur.group(2), cur.group(3)])
                    j += 1
                elif lines[j].startswith('  ') and lines[j].strip() and items:
                    items[-1][2] += ' ' + lines[j].strip()
                    j += 1
                else:
                    break
            flow = []
            for indent, marker, text in items:
                style = ParagraphStyle('li', parent=LIST, leftIndent=16 + indent * 6, bulletIndent=5 + indent * 6)
                bullet = u'\u2022' if marker == '-' else marker
                flow.append(Paragraph(inline(text), style, bulletText=bullet))
            story.extend(flow)
            story.append(Spacer(1, 3))
            i = j
            continue
        j, buf = i, []
        while j < len(lines) and lines[j].strip() and not re.match(r'(#{1,3}\s|\||```|>|\s*(-|\d+\.)\s)', lines[j]):
            buf.append(lines[j].strip())
            j += 1
        story.append(Paragraph(inline(' '.join(buf)), BASE))
        i = j

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont('Body', 7.5)
        canvas.setFillColor(colors.HexColor('#6B7280'))
        canvas.drawString(0.7 * inch, 0.4 * inch, os.path.basename(md_path))
        canvas.drawRightString(letter[0] - 0.7 * inch, 0.4 * inch, 'page %d' % d.page)
        canvas.restoreState()

    doc.title = title or os.path.basename(md_path)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
    print('wrote', sys.argv[2])
