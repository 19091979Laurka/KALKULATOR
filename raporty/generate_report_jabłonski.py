"""
Generator PDF — Raport odszkodowawczy Jabłoński / KW PL1G/00006089/5
Działki 60 i 129, Strzemeszno, gm. Gąbin — Linia 110 kV
"""

import io
import math
import os
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyArrowPatch, Polygon as MplPolygon
from mpl_toolkits.mplot3d import Axes3D
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import numpy as np
from PIL import Image

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, Image as RLImage, KeepTogether
)
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics import renderPDF

# ─── KOLORY ────────────────────────────────────────────────────────────────────
C_PRIMARY   = HexColor("#2C3E7A")   # granat
C_ACCENT    = HexColor("#E74C3C")   # czerwień (WN linia)
C_GOLD      = HexColor("#F39C12")   # złoto (Track B)
C_BLUE      = HexColor("#3498DB")   # niebieski (Track A)
C_GREEN     = HexColor("#27AE60")   # zieleń
C_LIGHT_BG  = HexColor("#F4F6F8")
C_DARK_TXT  = HexColor("#1A1A2E")
C_BORDER    = HexColor("#BDC3C7")
C_YELLOW_BG = HexColor("#FEF9E7")

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "raport_jabłonski_KW_00006089_5.pdf")

# ─── DANE ──────────────────────────────────────────────────────────────────────
DATA = {
    "owner":       "Waldemar Jabłoński",
    "address":     "Strzemeszno 30, 09-530 Gąbin",
    "kw":          "PL1G/00006089/5",
    "date":        datetime.now().strftime("%d.%m.%Y"),
    "d60": {
        "teryt": "141906_5.0029.60",
        "area":  2866.3,
        "perim": 422.7,
        "dims":  (196.8, 14.6),
        "class": "R",
        "price": 8.50,
        "band_area": 2866.3,   # 100% działki w pasie
        "band_pct":  100,
        "prop_val":  24363.55,
        "wsp":    3959.08,
        "wbk":    9501.78,
        "obn":    1778.54,
        "track_a": 15239.40,
        "track_b": 27430.92,
        "mult":   1.80,
    },
    "d129": {
        "teryt": "141906_5.0029.129",
        "area":  39306.68,
        "perim": 1424.7,
        "dims":  (652.1, 60.3),
        "class": "R",
        "price": 8.50,
        "band_area": 19562.0,  # ≈50%
        "band_pct":  50,
        "prop_val":  334106.78,
        "wsp":    27020.16,
        "wbk":    64848.38,
        "obn":    24389.79,
        "track_a": 116258.33,
        "track_b": 209265.00,
        "mult":   1.80,
        "building": True,
        "obn_budynek_min": 75000,
        "obn_budynek_max": 150000,
    },
    "total": {
        "track_a": 131497.73,
        "track_b": 236695.92,
        "min_with_building": 206498.0,
        "max_with_building": 386696.0,
    }
}


# ════════════════════════════════════════════════════════════════════════════════
#  GENERATORY WYKRESÓW (matplotlib → PNG bajtowy)
# ════════════════════════════════════════════════════════════════════════════════

def fig_to_bytes(fig, dpi=180):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight", facecolor=fig.get_facecolor())
    buf.seek(0)
    plt.close(fig)
    return buf


def chart_3d_compensation():
    """3D słupkowy — Track A/B dla obu działek + suma."""
    fig = plt.figure(figsize=(11, 6), facecolor="#F4F6F8")
    ax = fig.add_subplot(111, projection="3d", facecolor="#F4F6F8")

    categories = ["Dz. 60\n(rolna, 100% pasa)", "Dz. 129\n(rolna, 50% pasa, dom)", "SUMA\nKW PL1G/00006089/5"]
    track_a_vals = [15239.40, 116258.33, 131497.73]
    track_b_vals = [27430.92, 209265.00, 236695.92]

    x = np.array([0, 2.5, 5.5])
    y_a = np.zeros(3)
    y_b = np.ones(3) * 0.7
    z = np.zeros(3)
    dx = 0.55
    dy = 0.45

    colors_a = ["#3498DB", "#3498DB", "#1A5276"]
    colors_b = ["#F39C12", "#F39C12", "#B7770D"]

    for i in range(3):
        ax.bar3d(x[i],       y_a[i], z[i], dx, dy, track_a_vals[i] / 1000, color=colors_a[i], alpha=0.88, shade=True)
        ax.bar3d(x[i] + 0.6, y_b[i] - 0.7, z[i], dx, dy, track_b_vals[i] / 1000, color=colors_b[i], alpha=0.88, shade=True)
        ax.text(x[i] + dx/2, y_a[i] + dy/2, track_a_vals[i]/1000 + 1,
                f"{track_a_vals[i]/1000:.1f}k", ha="center", va="bottom", fontsize=8, color="#1A5276", fontweight="bold")
        ax.text(x[i] + 0.6 + dx/2, y_b[i] - 0.7 + dy/2, track_b_vals[i]/1000 + 1,
                f"{track_b_vals[i]/1000:.1f}k", ha="center", va="bottom", fontsize=8, color="#B7770D", fontweight="bold")

    ax.set_xticks(x + dx/2 + 0.3)
    ax.set_xticklabels(categories, fontsize=8.5)
    ax.set_yticks([])
    ax.set_zlabel("PLN (tys.)", fontsize=9, labelpad=6)
    ax.set_title("Odszkodowanie KSWS Track A / Track B [PLN tys.]", fontsize=12, fontweight="bold",
                 color="#2C3E7A", pad=16)

    patch_a = mpatches.Patch(color="#3498DB", label="Track A — ścieżka sądowa")
    patch_b = mpatches.Patch(color="#F39C12", label="Track B — negocjacje (×1,80)")
    ax.legend(handles=[patch_a, patch_b], loc="upper left", fontsize=9, framealpha=0.8)
    ax.view_init(elev=22, azim=-55)
    ax.grid(True, alpha=0.2)

    fig.tight_layout()
    return fig_to_bytes(fig, dpi=160)


def chart_3d_parcel_corridor():
    """3D widok działek z korytarzem linii WN — perspektywa terenowa."""
    fig = plt.figure(figsize=(12, 7), facecolor="#EEF2F7")
    ax = fig.add_subplot(111, projection="3d", facecolor="#D6EAF8")

    # ── Działka 60 (196.8 × 14.6m) — cały w pasie ──
    L60, W60 = 196.8, 14.6
    # Na osi X = wzdłuż linii, Y = poprzecznie, Z = wysokość
    verts_60 = [
        [(0, 0, 0), (L60, 0, 0), (L60, W60, 0), (0, W60, 0)]
    ]
    poly_60 = Poly3DCollection(verts_60, alpha=0.55, facecolor="#F9E79F", edgecolor="#B7950B", linewidth=1.2)
    ax.add_collection3d(poly_60)
    ax.text(L60/2, W60/2, 0.5, "Dz. nr 60\n2 866 m²\n(100% w pasie)", ha="center", va="bottom",
            fontsize=8.5, color="#7D6608", fontweight="bold")

    # ── Działka 129 (652 × 60m) — 50% w pasie ─ zaczyna się 30m dalej od dz. 60 ──
    GAP = 40
    L129, W129 = 652.1, 60.3
    offset_y = -30  # linia przebiega przez środek (y=30), pas=0..30m (prawa strona)

    # Teren poza pasem
    verts_129_out = [
        [(GAP, 30, 0), (GAP + L129, 30, 0), (GAP + L129, 30 + W129, 0), (GAP, 30 + W129, 0)]
    ]
    poly_129_out = Poly3DCollection(verts_129_out, alpha=0.45, facecolor="#ABEBC6", edgecolor="#1E8449", linewidth=1.2)
    ax.add_collection3d(poly_129_out)

    # Teren w pasie ochronnym
    verts_129_in = [
        [(GAP, 0, 0), (GAP + L129, 0, 0), (GAP + L129, 30, 0), (GAP, 30, 0)]
    ]
    poly_129_in = Poly3DCollection(verts_129_in, alpha=0.55, facecolor="#FADBD8", edgecolor="#922B21", linewidth=1.2)
    ax.add_collection3d(poly_129_in)

    ax.text(GAP + L129/2, W129/2 + 15, 0.5, "Dz. nr 129  39 307 m² — poza pasem (50%)",
            ha="center", va="bottom", fontsize=8.5, color="#1E8449", fontweight="bold")
    ax.text(GAP + L129/2, 15, 0.5, "Dz. nr 129 — PAS OCHRONNY ≈ 19 562 m² (50%)",
            ha="center", va="bottom", fontsize=8.5, color="#922B21", fontweight="bold")

    # ── Dom mieszkalny na dz. 129 (poza pasem) ──
    house_x = GAP + 400
    house_y = 45
    house_w = 20
    house_d = 14
    house_h = 8
    house_verts = [
        # podłoga
        [(house_x, house_y, 0), (house_x+house_w, house_y, 0),
         (house_x+house_w, house_y+house_d, 0), (house_x, house_y+house_d, 0)],
        # ściana front
        [(house_x, house_y, 0), (house_x+house_w, house_y, 0),
         (house_x+house_w, house_y, house_h), (house_x, house_y, house_h)],
        # ściana prawa
        [(house_x+house_w, house_y, 0), (house_x+house_w, house_y+house_d, 0),
         (house_x+house_w, house_y+house_d, house_h), (house_x+house_w, house_y, house_h)],
    ]
    poly_house = Poly3DCollection(house_verts, alpha=0.75, facecolor="#85C1E9", edgecolor="#2471A3", linewidth=1.0)
    ax.add_collection3d(poly_house)
    # Dach
    roof_verts = [
        [(house_x, house_y, house_h), (house_x+house_w, house_y, house_h),
         (house_x+house_w/2, house_y+house_d/2, house_h+6), ],
        [(house_x, house_y+house_d, house_h), (house_x+house_w, house_y+house_d, house_h),
         (house_x+house_w/2, house_y+house_d/2, house_h+6), ],
    ]
    poly_roof = Poly3DCollection(roof_verts, alpha=0.8, facecolor="#E74C3C", edgecolor="#922B21", linewidth=1.0)
    ax.add_collection3d(poly_roof)
    ax.text(house_x + house_w/2, house_y + house_d/2, house_h + 8,
            "DOM\nmieszkalny", ha="center", va="bottom", fontsize=7.5, color="#2471A3", fontweight="bold")

    # ── Linia 110 kV — słupy + przewody ──
    pole_positions = [0, 150, 300, 450, 600, 750]
    pole_h = 22
    line_y = 15  # oś linii: y=15 (środek pasa 0..30)

    for px in pole_positions:
        # Słup (trzon)
        ax.plot([px, px], [line_y, line_y], [0, pole_h], "k-", linewidth=2.0, zorder=10)
        # Trawersa
        ax.plot([px-7, px+7], [line_y, line_y], [pole_h, pole_h], "k-", linewidth=1.5)
        # 3 przewody
        for pw in [-6, 0, 6]:
            ax.plot([px+pw], [line_y], [pole_h], "ko", markersize=3)

    # Przewody poziome między słupami
    for i in range(len(pole_positions)-1):
        p1, p2 = pole_positions[i], pole_positions[i+1]
        mid_sag = -1.5  # zwis
        xs = np.linspace(p1, p2, 30)
        zs = pole_h + mid_sag * np.sin(np.pi * (xs - p1)/(p2-p1))
        for pw in [-6, 0, 6]:
            ax.plot(xs, [line_y]*30, zs, color="#E74C3C", linewidth=1.2, alpha=0.85)

    # Strefy ochronne (linie przerywane)
    xline = np.array([0, GAP + L129])
    ax.plot(xline, [0, 0], [0, 0], "r--", linewidth=1.2, alpha=0.6, label="Granica pasa ochronnego")
    ax.plot(xline, [30, 30], [0, 0], "r--", linewidth=1.2, alpha=0.6)

    # Strzałka z opisem pasa
    ax.quiver(80, 0, 3, 0, 30, 0, color="#E74C3C", arrow_length_ratio=0.08, linewidth=1.2)
    ax.text(80, 15, 4, "← 30 m pas →", ha="center", va="bottom", fontsize=8, color="#C0392B", fontweight="bold")

    # Ustawienia osi
    ax.set_xlim(0, GAP + L129 + 20)
    ax.set_ylim(-5, W129 + 35)
    ax.set_zlim(0, pole_h + 12)
    ax.set_xlabel("Długość [m]", fontsize=9, labelpad=8)
    ax.set_ylabel("Szerokość [m]", fontsize=9, labelpad=8)
    ax.set_zlabel("Wys. [m]", fontsize=9, labelpad=5)
    ax.set_title("Wizualizacja 3D — Działki 60 i 129 z korytarzem linii 110 kV",
                 fontsize=12, fontweight="bold", color="#2C3E7A", pad=16)
    ax.view_init(elev=25, azim=-45)
    ax.grid(True, alpha=0.15)

    # Legenda
    p1 = mpatches.Patch(facecolor="#FADBD8", edgecolor="#922B21", label="Pas ochronny WN (30 m)")
    p2 = mpatches.Patch(facecolor="#ABEBC6", edgecolor="#1E8449", label="Teren poza pasem")
    p3 = mpatches.Patch(facecolor="#F9E79F", edgecolor="#B7950B", label="Dz. 60 (100% w pasie)")
    p4 = mpatches.Patch(facecolor="#85C1E9", edgecolor="#2471A3", label="Dom mieszkalny")
    ax.legend(handles=[p1, p2, p3, p4], loc="upper left", fontsize=8.5, framealpha=0.88)

    fig.tight_layout()
    return fig_to_bytes(fig, dpi=160)


def chart_pie_band_coverage():
    """Koło — procent zajęcia działek przez pas."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9, 4.5), facecolor="#F4F6F8")
    fig.suptitle("Pokrycie działek pasem ochronnym 30 m linii 110 kV",
                 fontsize=11, fontweight="bold", color="#2C3E7A", y=1.01)

    # Dz. 60
    sizes_60 = [100, 0]
    labels_60 = ["W pasie WN\n2 866 m²\n(100% !)", ""]
    colors_60 = ["#E74C3C", "#BDC3C7"]
    wedgeprops = {"edgecolor": "white", "linewidth": 2.5, "antialiased": True}
    ax1.pie(sizes_60, labels=labels_60, colors=colors_60, autopct=lambda p: f"{p:.0f}%" if p > 0 else "",
            startangle=90, wedgeprops=wedgeprops, textprops={"fontsize": 10, "fontweight": "bold"})
    ax1.set_title("Działka nr 60\n2 866 m²", fontsize=10.5, fontweight="bold", color="#2C3E7A")

    # Dz. 129
    band_129 = 19562
    free_129 = 39306.68 - band_129
    sizes_129 = [band_129, free_129]
    labels_129 = [f"Pas WN\n{band_129:,.0f} m²\n(≈50%)", f"Poza pasem\n{free_129:,.0f} m²"]
    colors_129 = ["#E74C3C", "#27AE60"]
    ax2.pie(sizes_129, labels=labels_129, colors=colors_129, autopct=lambda p: f"{p:.0f}%",
            startangle=90, wedgeprops=wedgeprops, textprops={"fontsize": 9.5})
    ax2.set_title("Działka nr 129\n39 307 m² — z domem mieszkalnym", fontsize=10.5, fontweight="bold", color="#2C3E7A")

    fig.tight_layout()
    return fig_to_bytes(fig, dpi=160)


def chart_bar_trackAB_detailed():
    """Poziomy wykres słupkowy — rozłożenie WSP/WBK/OBN dla każdej działki."""
    fig, ax = plt.subplots(figsize=(10, 5), facecolor="#F4F6F8")
    ax.set_facecolor("#FDFEFE")

    labels = ["Dz. 60 — Track A", "Dz. 60 — Track B", "Dz. 129 — Track A", "Dz. 129 — Track B",
              "RAZEM — Track A", "RAZEM — Track B"]
    vals_wsp  = [3959,  0, 27020,  0, 30979,  0]
    vals_wbk  = [9502,  0, 64848,  0, 74350,  0]
    vals_obn  = [1779,  0, 24390,  0, 26169,  0]
    vals_full = [0, 27431, 0, 209265, 0, 236696]

    y = np.arange(len(labels))
    height = 0.55

    b1 = ax.barh(y, vals_wsp, height, label="WSP — służebność", color="#3498DB", alpha=0.9)
    b2 = ax.barh(y, vals_wbk, height, left=vals_wsp, label="WBK — bezumowne (10 lat)", color="#2ECC71", alpha=0.9)
    b3 = ax.barh(y, vals_obn, height, left=np.array(vals_wsp)+np.array(vals_wbk),
                 label="OBN — obniżenie wartości", color="#E74C3C", alpha=0.9)
    b4 = ax.barh(y, vals_full, height, label="Track B (pełna, ×1,80)", color="#F39C12", alpha=0.9)

    for i, (v, bar_list) in enumerate(zip(
        [15239, 27431, 116258, 209265, 131498, 236696], y
    )):
        ax.text(v + 800, bar_list, f"{v:,.0f} PLN", va="center", ha="left",
                fontsize=9, fontweight="bold", color="#1A1A2E")

    ax.set_yticks(y)
    ax.set_yticklabels(labels, fontsize=10)
    ax.set_xlabel("PLN", fontsize=10)
    ax.set_title("Struktura odszkodowania KSWS — Działki 60 i 129", fontsize=12,
                 fontweight="bold", color="#2C3E7A", pad=12)
    ax.legend(fontsize=9, loc="lower right")
    ax.grid(axis="x", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    # Linie oddzielające pary A/B
    for pos in [1.5, 3.5]:
        ax.axhline(y=pos, color="#BDC3C7", linewidth=1, linestyle="--")

    fig.tight_layout()
    return fig_to_bytes(fig, dpi=160)


# ════════════════════════════════════════════════════════════════════════════════
#  STYLE TEKSTU
# ════════════════════════════════════════════════════════════════════════════════

def make_styles():
    base = getSampleStyleSheet()
    s = {}

    s["h1"] = ParagraphStyle("h1", parent=base["Normal"],
        fontSize=22, textColor=C_PRIMARY, fontName="Helvetica-Bold",
        spaceAfter=6, spaceBefore=4, alignment=TA_CENTER)

    s["h2"] = ParagraphStyle("h2", parent=base["Normal"],
        fontSize=14, textColor=C_PRIMARY, fontName="Helvetica-Bold",
        spaceBefore=14, spaceAfter=6, borderPadding=(0,0,3,0),
        borderColor=C_PRIMARY, borderWidth=0, leftIndent=0)

    s["h3"] = ParagraphStyle("h3", parent=base["Normal"],
        fontSize=11.5, textColor=C_PRIMARY, fontName="Helvetica-Bold",
        spaceBefore=10, spaceAfter=4)

    s["body"] = ParagraphStyle("body", parent=base["Normal"],
        fontSize=9.5, textColor=C_DARK_TXT, leading=14,
        alignment=TA_JUSTIFY, spaceAfter=5)

    s["small"] = ParagraphStyle("small", parent=base["Normal"],
        fontSize=8.5, textColor=HexColor("#555555"), leading=12, spaceAfter=3)

    s["center"] = ParagraphStyle("center", parent=base["Normal"],
        fontSize=9.5, alignment=TA_CENTER, textColor=C_DARK_TXT, leading=14)

    s["bold_center"] = ParagraphStyle("bold_center", parent=base["Normal"],
        fontSize=10, alignment=TA_CENTER, textColor=C_DARK_TXT,
        fontName="Helvetica-Bold", leading=14)

    s["alert"] = ParagraphStyle("alert", parent=base["Normal"],
        fontSize=10, textColor=HexColor("#7D0000"), fontName="Helvetica-Bold",
        leading=14, spaceAfter=4, leftIndent=8)

    s["note"] = ParagraphStyle("note", parent=base["Normal"],
        fontSize=9, textColor=HexColor("#555500"), leading=13,
        backColor=HexColor("#FFFDE7"), leftIndent=8, rightIndent=8,
        spaceAfter=5, borderPadding=4)

    s["cover_title"] = ParagraphStyle("cover_title", parent=base["Normal"],
        fontSize=28, textColor=white, fontName="Helvetica-Bold",
        alignment=TA_CENTER, leading=34, spaceAfter=8)

    s["cover_sub"] = ParagraphStyle("cover_sub", parent=base["Normal"],
        fontSize=14, textColor=HexColor("#D6EAF8"), fontName="Helvetica",
        alignment=TA_CENTER, leading=20, spaceAfter=4)

    s["cover_detail"] = ParagraphStyle("cover_detail", parent=base["Normal"],
        fontSize=11, textColor=HexColor("#AED6F1"), fontName="Helvetica",
        alignment=TA_CENTER, leading=16, spaceAfter=3)

    s["table_header"] = ParagraphStyle("th", parent=base["Normal"],
        fontSize=9, textColor=white, fontName="Helvetica-Bold",
        alignment=TA_CENTER)

    s["money_big"] = ParagraphStyle("money_big", parent=base["Normal"],
        fontSize=18, textColor=C_PRIMARY, fontName="Helvetica-Bold",
        alignment=TA_CENTER, leading=22)

    s["money_gold"] = ParagraphStyle("money_gold", parent=base["Normal"],
        fontSize=18, textColor=C_GOLD, fontName="Helvetica-Bold",
        alignment=TA_CENTER, leading=22)
    return s


# ════════════════════════════════════════════════════════════════════════════════
#  HELPERY TABEL
# ════════════════════════════════════════════════════════════════════════════════

def std_table(data_rows, col_widths, header_bg=None, zebra=True):
    t = Table(data_rows, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,0), 9),
        ("BACKGROUND",  (0,0), (-1,0), header_bg or C_PRIMARY),
        ("TEXTCOLOR",   (0,0), (-1,0), white),
        ("ALIGN",       (0,0), (-1,-1), "CENTER"),
        ("ALIGN",       (0,1), (0,-1), "LEFT"),
        ("FONTNAME",    (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",    (0,1), (-1,-1), 9),
        ("ROWBACKGROUND",(0,0),(-1,-1), [C_LIGHT_BG, white]),
        ("GRID",        (0,0), (-1,-1), 0.4, C_BORDER),
        ("TOPPADDING",  (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING",(0,0),(-1,-1), 7),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t


def money_table(d60_a, d60_b, d129_a, d129_b, total_a, total_b, S):
    rows = [
        [Paragraph("Działka", S["table_header"]),
         Paragraph("Track A — Sąd", S["table_header"]),
         Paragraph("Track B — Negocjacje", S["table_header"]),
         Paragraph("Uwagi", S["table_header"])],
        ["Dz. nr 60", f"{d60_a:,.2f} PLN", f"{d60_b:,.2f} PLN", "100% pasa, rolna"],
        ["Dz. nr 129 (grunt)", f"{d129_a:,.2f} PLN", f"{d129_b:,.2f} PLN", "50% pasa, dom"],
        ["Dz. nr 129 (OBN dom min)", "75 000,00 PLN", "75 000,00 PLN", "szacunek 15%"],
        ["Dz. nr 129 (OBN dom max)", "150 000,00 PLN", "150 000,00 PLN", "szacunek 30%"],
        [Paragraph("<b>SUMA GRUNT</b>", S["body"]),
         Paragraph(f"<b>{total_a:,.2f} PLN</b>", S["body"]),
         Paragraph(f"<b>{total_b:,.2f} PLN</b>", S["body"]), "—"],
        [Paragraph("<b>MIN (z OBN dom 15%)</b>", S["body"]),
         Paragraph("<b>206 498,00 PLN</b>", S["body"]),
         Paragraph("<b>311 696,00 PLN</b>", S["body"]), "zalecane min."],
        [Paragraph("<b>MAX (z OBN dom 30%)</b>", S["body"]),
         Paragraph("<b>281 498,00 PLN</b>", S["body"]),
         Paragraph(f"<b>386 696,00 PLN</b>", S["body"]), "maks. ocena"],
    ]
    W = A4[0] - 2*cm - 2*cm
    t = Table(rows, colWidths=[W*0.26, W*0.26, W*0.26, W*0.22], repeatRows=1)
    t.setStyle(TableStyle([
        ("FONTNAME",  (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",  (0,0), (-1,0), 9),
        ("BACKGROUND",(0,0), (-1,0), C_PRIMARY),
        ("TEXTCOLOR", (0,0), (-1,0), white),
        ("ALIGN",     (0,0), (-1,-1), "CENTER"),
        ("ALIGN",     (0,1), (0,-1), "LEFT"),
        ("FONTNAME",  (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",  (0,1), (-1,-1), 9),
        ("BACKGROUND",(0,1), (-1,1), C_LIGHT_BG),
        ("BACKGROUND",(0,2), (-1,2), white),
        ("BACKGROUND",(0,3), (-1,3), HexColor("#FEF9E7")),
        ("BACKGROUND",(0,4), (-1,4), HexColor("#FEF9E7")),
        ("BACKGROUND",(0,5), (-1,5), HexColor("#EBF5FB")),
        ("FONTNAME",  (0,5), (-1,5), "Helvetica-Bold"),
        ("BACKGROUND",(0,6), (-1,6), HexColor("#D5F5E3")),
        ("FONTNAME",  (0,6), (-1,6), "Helvetica-Bold"),
        ("BACKGROUND",(0,7), (-1,7), HexColor("#FDEBD0")),
        ("FONTNAME",  (0,7), (-1,7), "Helvetica-Bold"),
        ("GRID",      (0,0), (-1,-1), 0.4, C_BORDER),
        ("TOPPADDING",(0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("RIGHTPADDING",(0,0),(-1,-1), 7),
    ]))
    return t


# ════════════════════════════════════════════════════════════════════════════════
#  STRONA TYTUŁOWA (canvas background)
# ════════════════════════════════════════════════════════════════════════════════

class CoverPageTemplate:
    def __init__(self, c, W, H):
        self.c, self.W, self.H = c, W, H

    def draw(self):
        c, W, H = self.c, self.W, self.H

        # Gradient tło (symulowane pasami)
        n_steps = 60
        for i in range(n_steps):
            t = i / n_steps
            r = int(44 + t * (20 - 44))
            g = int(62 + t * (40 - 62))
            b = int(122 + t * (80 - 122))
            c.setFillColorRGB(r/255, g/255, b/255)
            y = H * (1 - (i+1)/n_steps)
            c.rect(0, y, W, H/n_steps + 1, fill=1, stroke=0)

        # Dekoracyjna linia pozioma (jak linia WN)
        c.setStrokeColorRGB(0.9, 0.3, 0.1)
        c.setLineWidth(3)
        c.line(0, H*0.62, W, H*0.62)
        c.setStrokeColorRGB(0.9, 0.3, 0.1)
        c.setLineWidth(1.5)
        c.line(0, H*0.615, W, H*0.615)

        # Słupy energetyczne (dekoracja)
        pole_xs = [35, 90, 520, 575]
        pole_top = H * 0.62
        for px in pole_xs:
            c.setStrokeColorRGB(0.15, 0.15, 0.15)
            c.setLineWidth(3.5)
            c.line(px, H*0.18, px, pole_top)
            c.setLineWidth(2)
            c.line(px-14, pole_top, px+14, pole_top)
            c.setLineWidth(1)
            c.setFillColorRGB(0.15, 0.15, 0.15)
            c.circle(px-12, pole_top, 3, fill=1)
            c.circle(px,    pole_top, 3, fill=1)
            c.circle(px+12, pole_top, 3, fill=1)

        # Dolna belka
        c.setFillColorRGB(0.13, 0.18, 0.42)
        c.rect(0, 0, W, H*0.18, fill=1, stroke=0)


def on_first_page(canvas_obj, doc):
    W, H = A4
    tpl = CoverPageTemplate(canvas_obj, W, H)
    tpl.draw()


def on_later_pages(canvas_obj, doc):
    W, H = A4
    # Nagłówek
    canvas_obj.setFillColor(C_PRIMARY)
    canvas_obj.rect(0, H - 20*mm, W, 20*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(white)
    canvas_obj.setFont("Helvetica-Bold", 9)
    canvas_obj.drawString(20*mm, H - 12*mm, "RAPORT ODSZKODOWAWCZY · KW PL1G/00006089/5 · Jabłoński")
    canvas_obj.setFont("Helvetica", 9)
    canvas_obj.drawRightString(W - 20*mm, H - 12*mm, f"Strona {doc.page}")

    # Stopka
    canvas_obj.setFillColor(C_PRIMARY)
    canvas_obj.rect(0, 0, W, 12*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(white)
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.drawString(20*mm, 4*mm, f"Wygenerowano: {datetime.now().strftime('%d.%m.%Y %H:%M')} · Metodyka KSWS-V.5 · Track A/B · Źródło: ULDK GUGiK (REAL DATA)")
    canvas_obj.drawRightString(W - 20*mm, 4*mm, "POUFNE — do użytku wewnętrznego")


# ════════════════════════════════════════════════════════════════════════════════
#  BUDOWANIE DOKUMENTU
# ════════════════════════════════════════════════════════════════════════════════

def build_pdf():
    print(f"Generowanie PDF: {OUTPUT_PATH}")
    W, H = A4
    S = make_styles()

    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2.2*cm,
        title="Raport odszkodowawczy — Jabłoński",
        author="KALKULATOR v3.0 / KSWS",
        subject="Analiza KSWS Track A/B — Linia 110 kV — KW PL1G/00006089/5",
    )

    story = []

    # ════════════════ STRONA TYTUŁOWA ════════════════
    # Duży spacer na tło
    story.append(Spacer(1, 68*mm))
    story.append(Paragraph("RAPORT ODSZKODOWAWCZY", S["cover_title"]))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Analiza roszczeń z tytułu służebności przesyłu", S["cover_sub"]))
    story.append(Paragraph("Linia elektroenergetyczna 110 kV (WN)", S["cover_sub"]))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("Właściciel: <b>Waldemar Jabłoński</b>", S["cover_detail"]))
    story.append(Paragraph("Strzemeszno 30, 09-530 Gąbin", S["cover_detail"]))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("Księga Wieczysta: <b>PL1G/00006089/5</b>", S["cover_detail"]))
    story.append(Paragraph("Działki nr <b>60</b> i nr <b>129</b> — obręb Strzemeszno, gm. Gąbin, pow. płocki", S["cover_detail"]))
    story.append(Spacer(1, 10*mm))
    story.append(Paragraph(f"Data sporządzenia: <b>{DATA['date']}</b>", S["cover_detail"]))
    story.append(Paragraph("Metodyka: <b>KSWS-V.5 Track A/B · TK P 10/16</b>", S["cover_detail"]))
    story.append(Paragraph("Źródła danych: <b>ULDK GUGiK / GUS BDL / GESUT KIUT</b>", S["cover_detail"]))
    story.append(Spacer(1, 18*mm))

    # Ramka z kwotą na okładce
    cover_table = Table([
        [Paragraph("ROSZCZENIE ŁĄCZNE (TRACK B):", S["bold_center"])],
        [Paragraph("236 696 – 386 696 PLN", S["money_gold"])],
        [Paragraph("(grunt + OBN dom mieszkalny)", S["center"])],
    ], colWidths=[W - 4*cm])
    cover_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), HexColor("#1A2A5C")),
        ("TEXTCOLOR",  (0,0), (-1,-1), white),
        ("BOX",        (0,0), (-1,-1), 2, C_GOLD),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
        ("ROUNDEDCORNERS", [6,6,6,6]),
    ]))
    story.append(cover_table)

    story.append(PageBreak())

    # ════════════════ SEKCJA 1 — IDENTYFIKACJA ════════════════
    story.append(HRFlowable(width="100%", thickness=3, color=C_PRIMARY, spaceAfter=4))
    story.append(Paragraph("I. IDENTYFIKACJA NIERUCHOMOŚCI", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=8))

    ident_rows = [
        [Paragraph("Parametr", S["table_header"]),
         Paragraph("Działka nr 60", S["table_header"]),
         Paragraph("Działka nr 129", S["table_header"])],
        ["TERYT (GUGiK/ULDK)", "141906_5.0029.60", "141906_5.0029.129"],
        ["Obręb", "Strzemeszno", "Strzemeszno"],
        ["Gmina / Powiat", "Gąbin / pow. płocki", "Gąbin / pow. płocki"],
        ["Województwo", "mazowieckie", "mazowieckie"],
        ["Powierzchnia", "2 866,3 m²  (0,2866 ha)", "39 306,68 m²  (3,9307 ha)"],
        ["Obwód", "422,7 m", "1 424,7 m"],
        ["Wymiary (approx.)", "≈ 197 m × 14,6 m", "≈ 652 m × 60,3 m"],
        ["Kształt EGiB", "niekorzystny (bardzo wąska)", "niekorzystny (wydłużona)"],
        ["Użytek (EGiB)", "R — rolna", "R — rolna"],
        ["Zabudowa", "brak budynków", "DOM MIESZKALNY"],
        ["Cena rynkowa", "8,50 zł/m² (GUS rolna)", "8,50 zł/m² (GUS rolna)"],
        ["Księga Wieczysta", "PL1G/00006089/5", "PL1G/00006089/5 (ta sama!)"],
    ]
    W_col = (W - 4*cm) / 3
    it = std_table(ident_rows, [W_col, W_col, W_col], C_PRIMARY)
    story.append(it)
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        "⚠ Obie działki objęte są jedną Księgą Wieczystą PL1G/00006089/5. "
        "Inwestor był w pełni świadomy tej okoliczności na etapie analizy przedinwestycyjnej. "
        "Pominięcie działki nr 129 w złożonej propozycji nie może być uznane za omyłkę.",
        S["alert"]))

    # ════════════════ SEKCJA 2 — INFRASTRUKTURA ════════════════
    story.append(Spacer(1, 6*mm))
    story.append(HRFlowable(width="100%", thickness=3, color=C_ACCENT, spaceAfter=4))
    story.append(Paragraph("II. INFRASTRUKTURA — LINIA 110 kV (WN)", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=8))

    infra_rows = [
        [Paragraph("Parametr", S["table_header"]),
         Paragraph("Działka nr 60", S["table_header"]),
         Paragraph("Działka nr 129", S["table_header"])],
        ["Typ infrastruktury", "Linia WN 110 kV napowietrzna", "Linia WN 110 kV napowietrzna"],
        ["Potwierdzenie", "✅ TAK (geoportal.gov.pl, GESUT)", "✅ TAK (geoportal.gov.pl, GESUT)"],
        ["Pas ochronny (KSWS-V.5)", "30 m (15 m od osi)", "30 m (15 m od osi)"],
        ["Szerokość działki", "14,6 m  (!!)", "60,3 m"],
        ["Kolizja z pasem", "CAŁKOWITA (14,6 m < 30 m)", "CZĘŚCIOWA (30 m z 60,3 m)"],
        ["Pow. pasa na działce", "2 866 m²  (100% !)", "≈ 19 562 m²  (≈ 50%)"],
        ["Zakaz budowy w pasie", "cała działka", "strefa 0–30 m od osi"],
        ["Źródło danych geometrii", "ULDK GUGiK (REAL)", "ULDK GUGiK (REAL)"],
    ]
    it2 = std_table(infra_rows, [W_col, W_col, W_col], C_ACCENT)
    story.append(it2)
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        "💥 UWAGA KLUCZOWA: Działka nr 60 o szerokości zaledwie 14,6 m mieści się "
        "W CAŁOŚCI w pasie ochronnym linii 110 kV (pas = 30 m). Cała działka jest "
        "zajęta przez korytarz przesyłowy — de facto pełni funkcję techniczną.",
        S["alert"]))

    story.append(PageBreak())

    # ════════════════ SEKCJA 3 — WIZUALIZACJA 3D ════════════════
    story.append(HRFlowable(width="100%", thickness=3, color=C_PRIMARY, spaceAfter=4))
    story.append(Paragraph("III. WIZUALIZACJA 3D — DZIAŁKI Z KORYTARZEM LINII 110 kV", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=6))
    story.append(Paragraph(
        "Poniższy diagram 3D przedstawia proporcjonalne położenie obu działek względem osi linii 110 kV "
        "oraz zasięg strefy ochronnej 30 m. Czerwona strefa to pas ochronny objęty ograniczeniami "
        "korzystania. Zielona strefa to teren działki 129 pozostający poza pasem. Dom mieszkalny "
        "zaznaczono symbolem budynku na działce 129.", S["body"]))
    story.append(Spacer(1, 3*mm))
    viz_3d_bytes = chart_3d_parcel_corridor()
    story.append(RLImage(viz_3d_bytes, width=17*cm, height=10*cm))
    story.append(Spacer(1, 4*mm))

    # Kółka
    story.append(Paragraph("Pokrycie działek pasem ochronnym:", S["h3"]))
    pie_bytes = chart_pie_band_coverage()
    story.append(RLImage(pie_bytes, width=15*cm, height=7.5*cm))

    story.append(PageBreak())

    # ════════════════ SEKCJA 4 — PODSTAWA PRAWNA ════════════════
    story.append(HRFlowable(width="100%", thickness=3, color=C_PRIMARY, spaceAfter=4))
    story.append(Paragraph("IV. PODSTAWY PRAWNE ROSZCZENIA", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=8))

    legal_rows = [
        [Paragraph("Podstawa prawna", S["table_header"]),
         Paragraph("Zakres zastosowania", S["table_header"]),
         Paragraph("Dotyczy", S["table_header"])],
        ["Art. 305¹–305⁴ KC", "Służebność przesyłu — ustanowienie i wynagrodzenie (WSP)", "Dz. 60 + Dz. 129"],
        ["Art. 225 KC × Art. 224 §2 KC", "Wynagrodzenie za bezumowne korzystanie z nieruchomości (WBK)", "Dz. 60 + Dz. 129"],
        ["Art. 128 u.g.n.", "Odszkodowanie za ograniczenie sposobu korzystania z nieruchomości (OBN)", "Dz. 60 + Dz. 129"],
        ["Art. 144 KC", "Immisje ponadnormatywne (EMF, hałas) — nieruchomość mieszkalna", "Dz. 129 z domem"],
        ["TK P 10/16", "Wyrok TK — konstytucyjność wynagrodzenia za służebność (podstawa Track A)", "Oba"],
        ["KSWS-V.5", "Komisja Standardów Wyceny — metodyka branżowa WSP+WBK+OBN", "Oba"],
        ["PN-EN 50341-1", "Minimalne odległości poziome dla linii WN — zakaz zabudowy", "Dz. 129 z domem"],
    ]
    W2 = (W - 4*cm)
    tl = std_table(legal_rows, [W2*0.28, W2*0.50, W2*0.22], C_PRIMARY)
    story.append(tl)

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph("Argumentacja dodatkowa — nierzetelność oferty Inwestora:", S["h3"]))
    story.append(Paragraph(
        "Inwestor złożył ofertę dotyczącą wyłącznie działki nr 60, pomijając działkę nr 129 zabudowaną "
        "domem mieszkalnym, mimo że obie objęte są jedną KW i fakt ten był Inwestorowi znany. "
        "Stanowi to działanie zmierzające do ograniczenia zakresu służebności i wynagrodzenia. "
        "Właściciel jest uprawniony do żądania objęcia ofertą całości nieruchomości ewidencyjnej "
        "oraz do dochodzenia roszczeń z tytułu szkody lokalizacyjnej na działce zabudowanej.", S["body"]))

    # ════════════════ SEKCJA 5 — WYCENA KSWS ════════════════
    story.append(Spacer(1, 6*mm))
    story.append(HRFlowable(width="100%", thickness=3, color=C_GREEN, spaceAfter=4))
    story.append(Paragraph("V. WYCENA ODSZKODOWANIA — METODYKA KSWS TRACK A/B", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=8))

    # Parametry KSWS
    story.append(Paragraph("Parametry KSWS dla linii 110–400 kV (WN):", S["h3"]))
    ksws_rows = [
        [Paragraph("Wsp.", S["table_header"]),
         Paragraph("Wartość", S["table_header"]),
         Paragraph("Opis", S["table_header"])],
        ["S = 0,250", "0,250", "Obniżenie wartości gruntu w pasie ochronnym"],
        ["k = 0,650", "0,650", "Współczynnik korzystania z nieruchomości"],
        ["R = 0,060", "0,060", "Stopa kapitalizacji (WBK)"],
        ["impact = 0,073", "0,073", "Wskaźnik wpływu sądowego (OBN)"],
        ["Mnożnik Track B", "×1,80", "Benchmark negocjacyjny rynkowy"],
        ["Szerokość pasa", "30 m", "15 m od osi linii × 2 strony"],
        ["Okres WBK", "10 lat", "Bezumowne korzystanie historyczne"],
        ["Cena gruntu", "8,50 zł/m²", "GUS BDL mazowieckie — grunt rolny (R)"],
    ]
    tk = std_table(ksws_rows, [(W-4*cm)*0.22, (W-4*cm)*0.18, (W-4*cm)*0.60], C_GREEN)
    story.append(tk)
    story.append(Spacer(1, 3*mm))

    # Dz. 60 — szczegółowe
    story.append(Paragraph("Działka nr 60 — szczegółowe wyliczenie:", S["h3"]))
    d60_rows = [
        [Paragraph("Element", S["table_header"]),
         Paragraph("Obliczenie", S["table_header"]),
         Paragraph("Kwota [PLN]", S["table_header"])],
        ["Wartość nieruchomości", "2 866,3 m² × 8,50 zł/m²", "24 363,55 PLN"],
        ["Pas ochronny", "100% (cała działka w pasie!)", "2 866,3 m²"],
        ["WSP (służebność)", "24 364 × 0,25 × 0,65 × 100%", "3 959,08 PLN"],
        ["WBK (bezumowne 10 lat)", "24 364 × 0,06 × 0,65 × 100% × 10", "9 501,78 PLN"],
        ["OBN (obniżenie wartości)", "24 364 × 0,073 × 1,0", "1 778,54 PLN"],
        [Paragraph("<b>TRACK A (sądowa)</b>", S["body"]),
         Paragraph("<b>WSP + WBK + OBN</b>", S["body"]),
         Paragraph("<b>15 239,40 PLN</b>", S["body"])],
        [Paragraph("<b>TRACK B (negocjacje)</b>", S["body"]),
         Paragraph("<b>Track A × 1,80</b>", S["body"]),
         Paragraph("<b>27 430,92 PLN</b>", S["body"])],
    ]
    t60 = std_table(d60_rows, [(W-4*cm)*0.35, (W-4*cm)*0.38, (W-4*cm)*0.27], C_BLUE)
    story.append(t60)
    story.append(Spacer(1, 4*mm))

    story.append(PageBreak())

    # Dz. 129 — szczegółowe
    story.append(HRFlowable(width="100%", thickness=2, color=C_GREEN, spaceAfter=4))
    story.append(Paragraph("Działka nr 129 — szczegółowe wyliczenie:", S["h3"]))
    d129_rows = [
        [Paragraph("Element", S["table_header"]),
         Paragraph("Obliczenie", S["table_header"]),
         Paragraph("Kwota [PLN]", S["table_header"])],
        ["Wartość gruntu", "39 306,68 m² × 8,50 zł/m²", "334 106,78 PLN"],
        ["Pas ochronny", "30 m × 652 m = 19 562 m² (≈50%)", "19 562 m²"],
        ["WSP (służebność)", "334 107 × 0,25 × 0,65 × 50%", "27 020,16 PLN"],
        ["WBK (bezumowne 10 lat)", "334 107 × 0,06 × 0,65 × 50% × 10", "64 848,38 PLN"],
        ["OBN grunt", "334 107 × 0,073 × 1,0", "24 389,79 PLN"],
        [Paragraph("<b>TRACK A grunt</b>", S["body"]),
         Paragraph("<b>WSP + WBK + OBN</b>", S["body"]),
         Paragraph("<b>116 258,33 PLN</b>", S["body"])],
        [Paragraph("<b>TRACK B grunt</b>", S["body"]),
         Paragraph("<b>Track A × 1,80</b>", S["body"]),
         Paragraph("<b>209 265,00 PLN</b>", S["body"])],
        ["OBN dom (min 15%)", "szac. wartość domu ~500 000 PLN × 15%", "75 000,00 PLN"],
        ["OBN dom (max 30%)", "szac. wartość domu ~500 000 PLN × 30%", "150 000,00 PLN"],
    ]
    t129 = std_table(d129_rows, [(W-4*cm)*0.35, (W-4*cm)*0.38, (W-4*cm)*0.27], C_BLUE)
    story.append(t129)
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        "UWAGA: Cena 8,50 zł/m² dotyczy gruntu rolnego. Jeżeli działka 129 zostanie wyceniona "
        "jako nieruchomość zabudowana (co jest faktem), przy cenie 200 zł/m² roszczenie Track A "
        "wzrośnie do ok. 2,73 mln PLN, a Track B do ok. 4,92 mln PLN.", S["note"]))

    # ════════════════ SEKCJA 6 — PODSUMOWANIE ════════════════
    story.append(Spacer(1, 5*mm))
    story.append(HRFlowable(width="100%", thickness=3, color=C_GOLD, spaceAfter=4))
    story.append(Paragraph("VI. PODSUMOWANIE ROSZCZENIA — CAŁOŚĆ KW PL1G/00006089/5", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=8))

    story.append(money_table(
        DATA["d60"]["track_a"], DATA["d60"]["track_b"],
        DATA["d129"]["track_a"], DATA["d129"]["track_b"],
        DATA["total"]["track_a"], DATA["total"]["track_b"], S
    ))
    story.append(Spacer(1, 5*mm))

    # Ramka z kluczową kwotą
    sum_tbl = Table([
        [Paragraph("ZALECANY PRÓG NEGOCJACYJNY (GRUNT, TRACK B):", S["bold_center"])],
        [Paragraph("236 696 PLN", S["money_gold"])],
        [Paragraph("Z OBN domu mieszkalnego (15–30%): 311 696 – 386 696 PLN", S["center"])],
    ], colWidths=[W - 4*cm])
    sum_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_YELLOW_BG),
        ("TEXTCOLOR",     (0,0), (-1,-1), C_DARK_TXT),
        ("BOX",           (0,0), (-1,-1), 2.5, C_GOLD),
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("ROUNDEDCORNERS", [5,5,5,5]),
    ]))
    story.append(sum_tbl)

    story.append(PageBreak())

    # ════════════════ SEKCJA 7 — WYKRESY ════════════════
    story.append(HRFlowable(width="100%", thickness=3, color=C_PRIMARY, spaceAfter=4))
    story.append(Paragraph("VII. WYKRESY ANALITYCZNE", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=8))

    story.append(Paragraph("Struktura odszkodowania (WSP/WBK/OBN) — Track A i Track B:", S["h3"]))
    bar_bytes = chart_bar_trackAB_detailed()
    story.append(RLImage(bar_bytes, width=16*cm, height=8.5*cm))
    story.append(Spacer(1, 5*mm))

    story.append(Paragraph("Porównanie 3D Track A/B dla obu działek i sumy:", S["h3"]))
    bars_3d_bytes = chart_3d_compensation()
    story.append(RLImage(bars_3d_bytes, width=16*cm, height=8.5*cm))

    story.append(PageBreak())

    # ════════════════ SEKCJA 8 — ZALECENIA ════════════════
    story.append(HRFlowable(width="100%", thickness=3, color=C_PRIMARY, spaceAfter=4))
    story.append(Paragraph("VIII. ZALECENIA STRATEGICZNE", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=8))

    reco_rows = [
        [Paragraph("Krok", S["table_header"]),
         Paragraph("Działanie", S["table_header"]),
         Paragraph("Podstawa / Uwagi", S["table_header"])],
        ["1", "Wezwanie Inwestora do uzupełnienia oferty o działkę nr 129", "KW PL1G/00006089/5 — jawna dla Inwestora"],
        ["2", "Żądanie projektu służebności obejmującego obie działki", "Art. 305¹ KC"],
        ["3", "Zlecenie operatu szacunkowego rzec. maj. dla dz. 129 (z domem)", "Wycena jako zabudowana — wyższe podstawy"],
        ["4", "Wskazanie Track B = 236 696 PLN jako minimum negocjacyjne", "KSWS-V.5 — grunt rolny, WN"],
        ["5", "Zastrzeżenie roszczenia OBN budynku (75–150 tys.) odrębnie", "Szkoda lokalizacyjna / immisje EMF"],
        ["6", "W razie braku reakcji — wniosek sądowy art. 305² §2 KC", "Sąd ustanawia służebność za wynagrodzeniem"],
        ["7", "Rozważyć wycenę gruntu jako zabudowanego (200+ zł/m²)", "Drastyczny wzrost podstawy — mln PLN"],
    ]
    tr = std_table(reco_rows, [(W-4*cm)*0.06, (W-4*cm)*0.52, (W-4*cm)*0.42], C_PRIMARY)
    story.append(tr)

    story.append(Spacer(1, 6*mm))
    story.append(Paragraph("Dane techniczne raportu:", S["h3"]))
    tech_rows = [
        [Paragraph("Parametr", S["table_header"]), Paragraph("Wartość", S["table_header"])],
        ["Źródło geometrii", "ULDK GUGiK — status: REAL"],
        ["TERYT dz. 60", "141906_5.0029.60"],
        ["TERYT dz. 129", "141906_5.0029.129"],
        ["Współrzędne (dz. 60)", "52°25'31\"N  19°46'47\"E"],
        ["Współrzędne (dz. 129)", "52°25'24\"N  19°47'28\"E"],
        ["Infrastruktura", "Potwierdzona — geoportal.gov.pl (GESUT/KIUT)"],
        ["Metodyka", "KSWS-V.5 Track A (TK P 10/16) + Track B (×1,80)"],
        ["System kalkulatora", "KALKULATOR v3.0 — Strict Real Data Policy"],
        ["Data i godzina", datetime.now().strftime("%d.%m.%Y  %H:%M")],
    ]
    tt = std_table(tech_rows, [(W-4*cm)*0.38, (W-4*cm)*0.62], C_PRIMARY)
    story.append(tt)

    story.append(Spacer(1, 6*mm))
    story.append(Paragraph(
        "Niniejszy raport ma charakter informacyjno-analityczny i nie zastępuje operatu szacunkowego "
        "sporządzonego przez uprawnionego rzeczoznawcę majątkowego. Dane geometryczne pochodzą "
        "z systemu ULDK GUGiK. Ceny gruntów na podstawie GUS BDL (tabele regionalne 2024). "
        "Współczynniki KSWS zgodne z Komisją Standardów Wyceny edycja V.5.",
        S["small"]))

    # ════════════════ BUDOWANIE ════════════════
    doc.build(story,
              onFirstPage=on_first_page,
              onLaterPages=on_later_pages)

    print(f"✅ PDF wygenerowany: {OUTPUT_PATH}")
    return OUTPUT_PATH


if __name__ == "__main__":
    build_pdf()
