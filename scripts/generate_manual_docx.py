#!/usr/bin/env python3
"""
從 MANUAL.md 生成 MANUAL.docx(Word 檔)。

用法:
    python3 scripts/generate_manual_docx.py

依賴:
    python-docx(已內建於 macOS python3 環境;若無:pip3 install python-docx)

設計:
- 支援的 Markdown 子集:
  · # / ## / ### 三層標題
  · 段落
  · - / * 條列、1. 編號清單
  · > 引用
  · | a | b | 表格(GFM)
  · **粗體** / *斜體* / `行內 code`
  · ```code block``` 多行程式碼區塊
  · [text](url) 連結(轉成「text (url)」純文字呈現)
"""

import os
import re
import sys

try:
    from docx import Document
    from docx.shared import Pt, RGBColor, Cm
    from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
except ImportError:
    print("缺 python-docx,請執行:pip3 install python-docx", file=sys.stderr)
    sys.exit(1)


# --- 樣式常數(對齊 Carbon Mate 品牌) ---
CCS_NAVY   = RGBColor(0x1F, 0x3C, 0x6E)
CCS_BLUE   = RGBColor(0x31, 0x65, 0xA7)
CCS_TEAL   = RGBColor(0x1A, 0x9A, 0x83)
CCS_GRAY_6 = RGBColor(0x6B, 0x6E, 0x73)
CCS_GRAY_2 = RGBColor(0xDA, 0xDC, 0xE0)
CCS_BG_50  = "F7F8F9"  # cell shading (hex without #)


def set_cell_shading(cell, fill_hex):
    """為儲存格設定背景色。"""
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill_hex)
    tc_pr.append(shd)


def add_inline_runs(paragraph, text):
    """把含 **bold** / *italic* / `code` / [link](url) 的文字轉成 runs。"""
    # 連結優先轉成「text (url)」純文字,避免 docx hyperlink 程式碼過繁
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", text)

    # token 切分(注意順序:先取雙星號 bold,再取單星號 italic,再取 code)
    pattern = re.compile(r"(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)")
    parts = pattern.split(text)
    for part in parts:
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            run = paragraph.add_run(part[2:-2])
            run.bold = True
        elif part.startswith("*") and part.endswith("*") and len(part) > 1:
            run = paragraph.add_run(part[1:-1])
            run.italic = True
            run.font.color.rgb = CCS_TEAL
        elif part.startswith("`") and part.endswith("`"):
            run = paragraph.add_run(part[1:-1])
            run.font.name = "JetBrains Mono"
            run.font.size = Pt(10)
            run.font.color.rgb = CCS_NAVY
        else:
            paragraph.add_run(part)


def render_md_to_docx(md_text, output_path):
    doc = Document()

    # 預設樣式調整
    style = doc.styles["Normal"]
    style.font.name = "Noto Sans TC"
    style.font.size = Pt(11)
    # 中文 fallback
    r_pr = style.element.get_or_add_rPr()
    r_fonts = OxmlElement("w:rFonts")
    r_fonts.set(qn("w:eastAsia"), "Noto Sans TC")
    r_pr.append(r_fonts)

    lines = md_text.split("\n")
    i = 0
    in_code = False
    code_lines = []

    while i < len(lines):
        line = lines[i].rstrip("\n")

        # ----- code block -----
        if line.startswith("```"):
            if in_code:
                # 結束 code block
                code_text = "\n".join(code_lines)
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Cm(0.5)
                p.paragraph_format.space_after = Pt(6)
                run = p.add_run(code_text)
                run.font.name = "JetBrains Mono"
                run.font.size = Pt(9.5)
                run.font.color.rgb = CCS_NAVY
                code_lines = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue

        if in_code:
            code_lines.append(line)
            i += 1
            continue

        # ----- 標題 -----
        if line.startswith("# "):
            p = doc.add_heading(line[2:].strip(), level=1)
            for run in p.runs:
                run.font.color.rgb = CCS_NAVY
                run.font.size = Pt(20)
                run.bold = True
            i += 1
            continue
        if line.startswith("## "):
            p = doc.add_heading(line[3:].strip(), level=2)
            for run in p.runs:
                run.font.color.rgb = CCS_NAVY
                run.font.size = Pt(15)
                run.bold = True
            i += 1
            continue
        if line.startswith("### "):
            p = doc.add_heading(line[4:].strip(), level=3)
            for run in p.runs:
                run.font.color.rgb = CCS_BLUE
                run.font.size = Pt(12.5)
                run.bold = True
            i += 1
            continue

        # ----- 分隔線 -----
        if re.match(r"^---+\s*$", line):
            p = doc.add_paragraph()
            p_pr = p._p.get_or_add_pPr()
            border = OxmlElement("w:pBdr")
            bottom = OxmlElement("w:bottom")
            bottom.set(qn("w:val"), "single")
            bottom.set(qn("w:sz"), "6")
            bottom.set(qn("w:color"), "DADCE0")
            border.append(bottom)
            p_pr.append(border)
            i += 1
            continue

        # ----- 引用 -----
        if line.startswith("> "):
            quote_lines = []
            while i < len(lines) and lines[i].startswith(">"):
                quote_lines.append(lines[i][1:].strip().lstrip(">").strip())
                i += 1
            text = " ".join(filter(None, quote_lines))
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.5)
            p.paragraph_format.space_after = Pt(8)
            add_inline_runs(p, text)
            for run in p.runs:
                run.font.color.rgb = CCS_GRAY_6
                run.italic = True
            continue

        # ----- 表格 -----
        if "|" in line and i + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-+", lines[i + 1]):
            # 收集所有相連的表格列
            tbl_lines = []
            while i < len(lines) and "|" in lines[i]:
                tbl_lines.append(lines[i])
                i += 1
            # 第一行 header,第二行 separator,其餘 data
            header = [c.strip() for c in tbl_lines[0].strip().strip("|").split("|")]
            rows = []
            for ln in tbl_lines[2:]:
                if not ln.strip():
                    break
                rows.append([c.strip() for c in ln.strip().strip("|").split("|")])
            tbl = doc.add_table(rows=1 + len(rows), cols=len(header))
            tbl.style = "Light Grid Accent 1"
            # header
            for j, h in enumerate(header):
                cell = tbl.rows[0].cells[j]
                cell.text = ""
                p = cell.paragraphs[0]
                add_inline_runs(p, h)
                for run in p.runs:
                    run.bold = True
                    run.font.color.rgb = CCS_NAVY
                set_cell_shading(cell, CCS_BG_50)
            # data rows
            for r_idx, row in enumerate(rows):
                for j, v in enumerate(row):
                    if j >= len(header):
                        continue
                    cell = tbl.rows[r_idx + 1].cells[j]
                    cell.text = ""
                    add_inline_runs(cell.paragraphs[0], v)
            doc.add_paragraph()  # 表格後空一行
            continue

        # ----- 條列 -----
        if re.match(r"^\s*[-*]\s", line):
            indent_level = (len(line) - len(line.lstrip())) // 2
            content = re.sub(r"^\s*[-*]\s", "", line)
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.left_indent = Cm(0.6 + indent_level * 0.5)
            add_inline_runs(p, content)
            i += 1
            continue

        # ----- 編號清單 -----
        if re.match(r"^\s*\d+\.\s", line):
            content = re.sub(r"^\s*\d+\.\s", "", line)
            p = doc.add_paragraph(style="List Number")
            add_inline_runs(p, content)
            i += 1
            continue

        # ----- 空行 -----
        if not line.strip():
            i += 1
            continue

        # ----- 普通段落 -----
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(6)
        add_inline_runs(p, line)
        i += 1

    doc.save(output_path)
    return output_path


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    md_path = os.path.join(project_root, "MANUAL.md")
    docx_path = os.path.join(project_root, "MANUAL.docx")

    if not os.path.exists(md_path):
        print(f"找不到 {md_path}", file=sys.stderr)
        sys.exit(1)

    with open(md_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    out = render_md_to_docx(md_text, docx_path)
    print(f"✓ 已生成 {out}")


if __name__ == "__main__":
    main()
