"""
Generator raportów PDF — KSWS Track A/B
Przyjmuje słownik master_record z /api/analyze i produkuje plik PDF.
"""
import io
import math
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import numpy as np

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, Image as RLImage,
)
from reportlab.lib.colors import HexColor, white, black

C_PRIMARY  = HexColor("#2C3E7A")
C_ACCENT   = HexColor("#E74C3C")
C_GOLD     = HexColor("#F39C12")
C_BLUE     = HexColor("#3498DB")
C_GREEN    = HexColor("#27AE60")
C_LIGHT_BG = HexColor("#F4F6F8")
C_DARK_TXT = HexColor("#1A1A2E")
C_BORDER   = HexColor("#BDC3C7")
C_YELLOW   = HexColor("#FEF9E7")


# ── Helpers ────────────────────────────────────────────────────────────────────

def fig_to_bytes(fig, dpi=150):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    buf.seek(0)
    plt.close(fig)
    return buf


def fmt_pln(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "—"
    return f"{v:,.2f} PLN".replace(",", " ")


def approx_dims(area_m2, perim_m):
    """Approximate rectangle dimensions from area + perimeter."""
    try:
        lw = perim_m / 2
        disc = lw ** 2 - 4 * area_m2
        if disc < 0:
            return math.sqrt(area_m2), math.sqrt(area_m2)
        l = (lw + math.sqrt(disc)) / 2
        w = (lw - math.sqrt(disc)) / 2
        return max(l, w), min(l, w)
    except Exception:
        return math.sqrt(area_m2), math.sqrt(area_m2)


def make_styles():
    base = getSampleStyleSheet()
    s = {}
    def P(name, **kw):
        kw.setdefault("parent", base["Normal"])
        s[name] = ParagraphStyle(name, **kw)

    P("h1",    fontSize=20, textColor=C_PRIMARY, fontName="Helvetica-Bold",
               spaceAfter=6, spaceBefore=4, alignment=TA_CENTER)
    P("h2",    fontSize=13, textColor=C_PRIMARY, fontName="Helvetica-Bold",
               spaceBefore=12, spaceAfter=5)
    P("h3",    fontSize=10.5, textColor=C_PRIMARY, fontName="Helvetica-Bold",
               spaceBefore=8, spaceAfter=4)
    P("body",  fontSize=9.5, textColor=C_DARK_TXT, leading=14,
               alignment=TA_JUSTIFY, spaceAfter=5)
    P("small", fontSize=8.5, textColor=HexColor("#555555"), leading=12,
               spaceAfter=3)
    P("center",fontSize=9.5, alignment=TA_CENTER, textColor=C_DARK_TXT,
               leading=14)
    P("bc",    fontSize=10, alignment=TA_CENTER, textColor=C_DARK_TXT,
               fontName="Helvetica-Bold", leading=14)
    P("alert", fontSize=9.5, textColor=HexColor("#7D0000"),
               fontName="Helvetica-Bold", leading=13, spaceAfter=4,
               leftIndent=6, borderPadding=3)
    P("note",  fontSize=9, textColor=HexColor("#555500"), leading=13,
               backColor=HexColor("#FFFDE7"), leftIndent=6, rightIndent=6,
               spaceAfter=5, borderPadding=4)
    P("th",    fontSize=9, textColor=white, fontName="Helvetica-Bold",
               alignment=TA_CENTER)
    P("money_gold", fontSize=17, textColor=C_GOLD, fontName="Helvetica-Bold",
                    alignment=TA_CENTER, leading=22)
    P("money_blue", fontSize=17, textColor=C_BLUE, fontName="Helvetica-Bold",
                    alignment=TA_CENTER, leading=22)
    P("cover_title",fontSize=26, textColor=white, fontName="Helvetica-Bold",
                    alignment=TA_CENTER, leading=32, spaceAfter=6)
    P("cover_sub",  fontSize=13, textColor=HexColor("#D6EAF8"),
                    alignment=TA_CENTER, leading=18, spaceAfter=4)
    P("cover_det",  fontSize=10.5, textColor=HexColor("#AED6F1"),
                    alignment=TA_CENTER, leading=15, spaceAfter=3)
    return s


def std_table(rows, widths, hdr_bg=None, zebra=True):
    t = Table(rows, colWidths=widths, repeatRows=1)
    cmds = [
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,0), 9),
        ("BACKGROUND",    (0,0), (-1,0), hdr_bg or C_PRIMARY),
        ("TEXTCOLOR",     (0,0), (-1,0), white),
        ("ALIGN",         (0,0), (-1,-1), "CENTER"),
        ("ALIGN",         (0,1), (0,-1), "LEFT"),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",      (0,1), (-1,-1), 9),
        ("GRID",          (0,0), (-1,-1), 0.4, C_BORDER),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 7),
        ("RIGHTPADDING",  (0,0), (-1,-1), 7),
    ]
    if zebra:
        for i in range(1, len(rows)):
            bg = C_LIGHT_BG if i % 2 == 1 else white
            cmds.append(("BACKGROUND", (0,i), (-1,i), bg))
    t.setStyle(TableStyle(cmds))
    return t


# ── WYKRESY ────────────────────────────────────────────────────────────────────

def chart_3d_bars(parcels):
    """3D bar — Track A vs B per parcel + total. Max 15 parcels displayed."""
    MAX_BARS = 15
    display = parcels[:MAX_BARS]
    n = len(display)
    labels, vals_a, vals_b = [], [], []
    for p in display:
        comp = p.get("compensation", {})
        ta = (comp.get("track_a") or {}).get("total", 0)
        tb = (comp.get("track_b") or {}).get("total", 0)
        geom = p.get("geometry", {})
        area = geom.get("area_m2", 0)
        pid = p.get("_parcel_id", "?")
        labels.append(f"Dz. {pid.split('.')[-1] if '.' in pid else pid}\n{area/10000:.2f} ha")
        vals_a.append(ta / 1000 if ta else 0)
        vals_b.append(tb / 1000 if tb else 0)

    # Always add SUMA from ALL parcels
    all_a = sum((((p.get("compensation") or {}).get("track_a") or {}).get("total") or 0) for p in parcels) / 1000
    all_b = sum((((p.get("compensation") or {}).get("track_b") or {}).get("total") or 0) for p in parcels) / 1000
    if len(parcels) > 1:
        labels.append("SUMA")
        vals_a.append(all_a)
        vals_b.append(all_b)
        n += 1

    fig = plt.figure(figsize=(min(22, max(9, n*2.0)), 5.5), facecolor="#F4F6F8")
    ax = fig.add_subplot(111, projection="3d", facecolor="#F4F6F8")

    x = np.arange(n) * 2.5
    dx, dy = 0.55, 0.45
    colors_a = ["#3498DB"] * (n-1) + (["#1A5276"] if n > 1 else ["#3498DB"])
    colors_b = ["#F39C12"] * (n-1) + (["#B7770D"] if n > 1 else ["#F39C12"])

    for i in range(n):
        ax.bar3d(x[i],       0,   0, dx, dy, vals_a[i], color=colors_a[i], alpha=0.88, shade=True)
        ax.bar3d(x[i]+0.65,  -0.7, 0, dx, dy, vals_b[i], color=colors_b[i], alpha=0.88, shade=True)
        if vals_a[i] > 0:
            ax.text(x[i]+dx/2,    dy/2,  vals_a[i]+0.5, f"{vals_a[i]:.1f}k",
                    ha="center", va="bottom", fontsize=8, color="#1A5276", fontweight="bold")
        if vals_b[i] > 0:
            ax.text(x[i]+0.65+dx/2, -0.7+dy/2, vals_b[i]+0.5, f"{vals_b[i]:.1f}k",
                    ha="center", va="bottom", fontsize=8, color="#B7770D", fontweight="bold")

    ax.set_xticks(x + dx/2 + 0.3)
    ax.set_xticklabels(labels, fontsize=8.5)
    ax.set_yticks([])
    ax.set_zlabel("PLN (tys.)", fontsize=9, labelpad=6)
    ax.set_title("Odszkodowanie KSWS — Track A / Track B [PLN tys.]",
                 fontsize=11, fontweight="bold", color="#2C3E7A", pad=14)
    ax.legend(handles=[
        mpatches.Patch(color="#3498DB", label="Track A — sąd"),
        mpatches.Patch(color="#F39C12", label="Track B — negocjacje (×1,80)"),
    ], loc="upper left", fontsize=9, framealpha=0.8)
    ax.view_init(elev=22, azim=-55)
    ax.grid(True, alpha=0.2)
    fig.tight_layout()
    return fig_to_bytes(fig)


def chart_3d_parcel(parcels):
    """3D diagram showing parcel + WN corridor with pylon. Max 6 parcels."""
    display = parcels[:6]
    fig = plt.figure(figsize=(12, 6.5), facecolor="#EEF2F7")
    ax = fig.add_subplot(111, projection="3d", facecolor="#D6EAF8")

    x_offset = 0
    gap = 35
    line_y = 15  # oś linii w Y
    pole_h = 20

    all_x = []
    for pi, p in enumerate(display):
        geom = p.get("geometry", {})
        area  = geom.get("area_m2",   2000)
        perim = geom.get("perimeter_m", 200)
        ksws  = p.get("ksws", {})
        band_w = ksws.get("band_width_m", 30)
        pid = p.get("_parcel_id", f"Dz.{pi+1}")
        nr = pid.split(".")[-1] if "." in pid else pid

        L, W = approx_dims(area, perim)
        W_actual = min(W, band_w * 2.5)  # cap for display

        # Pas ochronny (czerwony)
        verts_in = [[(x_offset, 0, 0), (x_offset+L, 0, 0),
                     (x_offset+L, band_w, 0), (x_offset, band_w, 0)]]
        poly_in = Poly3DCollection(verts_in, alpha=0.55,
                                   facecolor="#FADBD8", edgecolor="#922B21", linewidth=1.0)
        ax.add_collection3d(poly_in)

        # Teren poza pasem (jeśli szeroka działka)
        if W_actual > band_w:
            out_w = W_actual - band_w
            verts_out = [[(x_offset, band_w, 0), (x_offset+L, band_w, 0),
                          (x_offset+L, band_w+out_w, 0), (x_offset, band_w+out_w, 0)]]
            poly_out = Poly3DCollection(verts_out, alpha=0.45,
                                        facecolor="#ABEBC6", edgecolor="#1E8449", linewidth=1.0)
            ax.add_collection3d(poly_out)

        ax.text(x_offset + L/2, W_actual/2, 0.5,
                f"Dz. {nr}\n{area:,.0f} m²",
                ha="center", va="bottom", fontsize=8.5, fontweight="bold", color="#7D6608")

        all_x.append((x_offset, x_offset + L))
        x_offset += L + gap

    # Słupy linii WN + przewody
    total_len = x_offset - gap
    pole_xs = np.arange(0, total_len + 1, min(150, total_len / 3))
    for px in pole_xs:
        ax.plot([px, px], [line_y, line_y], [0, pole_h], "k-", linewidth=2)
        ax.plot([px-8, px+8], [line_y, line_y], [pole_h, pole_h], "k-", linewidth=1.5)
        for pw in [-6, 0, 6]:
            ax.plot([px+pw], [line_y], [pole_h], "ko", markersize=2.5)

    for i in range(len(pole_xs)-1):
        p1, p2 = pole_xs[i], pole_xs[i+1]
        xs = np.linspace(p1, p2, 30)
        zs = pole_h - 1.5 * np.sin(np.pi * (xs - p1) / (p2-p1))
        for pw in [-6, 0, 6]:
            ax.plot(xs, [line_y]*30, zs, color="#E74C3C", linewidth=1.2, alpha=0.85)

    # Granice pasa
    ax.plot([0, total_len], [0, 0],          [0,0], "r--", lw=1.2, alpha=0.6)
    ax.plot([0, total_len], [band_w, band_w], [0,0], "r--", lw=1.2, alpha=0.6)

    ax.set_xlim(0, total_len + 10)
    ax.set_ylim(-5, W_actual + 20)
    ax.set_zlim(0, pole_h + 10)
    ax.set_xlabel("Długość [m]", fontsize=9, labelpad=8)
    ax.set_ylabel("Szerokość [m]", fontsize=9, labelpad=8)
    ax.set_zlabel("Wys. [m]", fontsize=9, labelpad=5)
    suffix = f" (pierwsze 6 z {len(parcels)})" if len(parcels) > 6 else ""
    ax.set_title(f"Wizualizacja 3D — Działki z korytarzem linii WN (pas={band_w} m){suffix}",
                 fontsize=11, fontweight="bold", color="#2C3E7A", pad=14)
    ax.view_init(elev=24, azim=-50)
    ax.grid(True, alpha=0.15)
    ax.legend(handles=[
        mpatches.Patch(facecolor="#FADBD8", edgecolor="#922B21", label=f"Pas ochronny WN ({band_w} m)"),
        mpatches.Patch(facecolor="#ABEBC6", edgecolor="#1E8449", label="Teren poza pasem"),
    ], loc="upper left", fontsize=8.5, framealpha=0.88)
    fig.tight_layout()
    return fig_to_bytes(fig)


def chart_donut_band(parcels):
    """Donuts showing band coverage per parcel. Max 9 parcels in 3x3 grid."""
    MAX_D = 9
    display = parcels[:MAX_D]
    n = len(display)
    cols = min(3, n)
    rows = math.ceil(n / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(5*cols, 4.5*rows), facecolor="#F4F6F8",
                              squeeze=False)
    axes_flat = [axes[r][c] for r in range(rows) for c in range(cols)]
    # Hide unused axes
    for ax in axes_flat[n:]:
        ax.set_visible(False)
    fig.suptitle(
        f"Pokrycie działek pasem ochronnym (pierwsze {n} z {len(parcels)})" if len(parcels) > MAX_D
        else "Pokrycie działek pasem ochronnym",
        fontsize=11, fontweight="bold", color="#2C3E7A")

    for ax, p in zip(axes_flat, display):
        geom = p.get("geometry", {})
        ksws = p.get("ksws", {})
        area     = geom.get("area_m2", 1)
        band_area = ksws.get("band_area_m2", 0)
        band_pct = min(100, band_area / area * 100) if area > 0 else 0
        free_pct = 100 - band_pct
        pid = p.get("_parcel_id", "?")
        nr = pid.split(".")[-1] if "." in pid else pid

        sizes  = [band_pct, free_pct] if free_pct > 0 else [100, 0]
        clrs   = ["#E74C3C", "#27AE60"] if free_pct > 0 else ["#E74C3C", "#ECF0F1"]
        labels = [f"Pas WN\n{band_area:,.0f} m²",
                  f"Poza pasem\n{area-band_area:,.0f} m²" if free_pct > 0 else ""]
        wedge  = {"edgecolor": "white", "linewidth": 2.5, "width": 0.55}
        ax.pie(sizes, labels=labels, colors=clrs, startangle=90, wedgeprops=wedge,
               autopct=lambda p2: f"{p2:.0f}%" if p2 > 0 else "",
               textprops={"fontsize": 9.5, "fontweight": "bold"})
        ax.set_title(f"Dz. {nr}  —  {area:,.0f} m²", fontsize=10, fontweight="bold",
                     color="#2C3E7A")

    fig.tight_layout()
    return fig_to_bytes(fig)


def chart_bar_breakdown(parcels):
    """Horizontal bar — WSP/WBK/OBN breakdown. Max 15 działek dla czytelności."""
    # Limituj do 15 działek żeby wykres był czytelny
    parcels = parcels[:15]
    rows = []
    for p in parcels:
        comp = p.get("compensation") or {}
        ta   = comp.get("track_a") or {}
        tb   = comp.get("track_b") or {}
        pid  = p.get("_parcel_id", "?")
        nr   = pid.split(".")[-1] if "." in pid else pid
        rows.append({
            "label_a": f"Dz. {nr} — Track A",
            "label_b": f"Dz. {nr} — Track B",
            "wsp": ta.get("wsp", 0),
            "wbk": ta.get("wbk", 0),
            "obn": ta.get("obn", 0),
            "track_a": ta.get("total", 0),
            "track_b": tb.get("total", 0),
        })
    if len(rows) > 1:
        rows.append({
            "label_a": "SUMA — Track A",
            "label_b": "SUMA — Track B",
            "wsp": sum(r["wsp"] for r in rows),
            "wbk": sum(r["wbk"] for r in rows),
            "obn": sum(r["obn"] for r in rows),
            "track_a": sum(r["track_a"] for r in rows),
            "track_b": sum(r["track_b"] for r in rows),
        })

    labels = []
    v_wsp, v_wbk, v_obn, v_full = [], [], [], []
    for r in rows:
        labels += [r["label_a"], r["label_b"]]
        v_wsp  += [r["wsp"], 0]
        v_wbk  += [r["wbk"], 0]
        v_obn  += [r["obn"], 0]
        v_full += [0, r["track_b"]]

    fig, ax = plt.subplots(figsize=(11, min(18, max(4, len(labels)*0.55 + 1.5))),
                           facecolor="#F4F6F8")
    ax.set_facecolor("#FDFEFE")
    y = np.arange(len(labels))
    h = 0.55
    v_wsp = np.array(v_wsp)
    v_wbk = np.array(v_wbk)
    v_obn = np.array(v_obn)
    v_full = np.array(v_full)

    ax.barh(y, v_wsp,            h,                   label="WSP",  color="#3498DB", alpha=0.9)
    ax.barh(y, v_wbk,            h, left=v_wsp,        label="WBK",  color="#2ECC71", alpha=0.9)
    ax.barh(y, v_obn,            h, left=v_wsp+v_wbk,  label="OBN",  color="#E74C3C", alpha=0.9)
    ax.barh(y, v_full,           h,                    label="Track B (×1,80)", color="#F39C12", alpha=0.9)

    totals = v_wsp + v_wbk + v_obn + v_full
    for i, tot in enumerate(totals):
        if tot > 0:
            ax.text(tot + max(totals)*0.01, i, f"{tot:,.0f} PLN",
                    va="center", ha="left", fontsize=8.5, fontweight="bold")

    ax.set_yticks(y)
    ax.set_yticklabels(labels, fontsize=9.5)
    ax.set_xlabel("PLN", fontsize=10)
    ax.set_title("Struktura odszkodowania KSWS (WSP + WBK + OBN)",
                 fontsize=11, fontweight="bold", color="#2C3E7A", pad=10)
    ax.legend(fontsize=9, loc="lower right")
    ax.grid(axis="x", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    if len(rows) > 1:
        for pos in np.arange(1.5, len(labels)-0.5, 2):
            ax.axhline(y=pos, color="#BDC3C7", lw=0.8, ls="--")
    fig.tight_layout()
    return fig_to_bytes(fig)


def chart_parcel_minimap(p):
    """Rysuje mini-mapę: obrys działki + linie energetyczne. Zwraca bytes PNG."""
    geom = p.get("geometry") or {}
    geojson = geom.get("geojson_ll") or geom.get("geojson")
    pl = (p.get("infrastructure") or {}).get("power_lines") or {}
    pl_geojson = pl.get("geojson") or {}
    collision = pl.get("detected", False)

    fig, ax = plt.subplots(figsize=(4, 4), facecolor="#F8F9FC")
    ax.set_facecolor("#EEF2F7")
    ax.set_aspect("equal")

    # Działka
    if geojson and geojson.get("coordinates"):
        try:
            coords_raw = geojson.get("coordinates", [])
            if geojson.get("type") == "Polygon" and coords_raw:
                ring = coords_raw[0]
                lons = [c[0] for c in ring]
                lats = [c[1] for c in ring]
                ax.fill(lons, lats, facecolor="#E74C3C" if collision else "#27AE60",
                        alpha=0.35, edgecolor="#C0392B" if collision else "#1E8449", linewidth=2)
            elif geojson.get("type") == "MultiPolygon" and coords_raw:
                ring = coords_raw[0][0] if coords_raw[0] else []
                if ring:
                    lons = [c[0] for c in ring]
                    lats = [c[1] for c in ring]
                    ax.fill(lons, lats, facecolor="#E74C3C" if collision else "#27AE60",
                            alpha=0.35, edgecolor="#C0392B" if collision else "#1E8449", linewidth=2)
        except Exception:
            pass

    # Linie energetyczne
    for feat in (pl_geojson.get("features") or []):
        g = feat.get("geometry")
        if not g or g.get("type") != "LineString":
            continue
        coords = g.get("coordinates", [])
        if len(coords) < 2:
            continue
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        v = feat.get("properties", {}).get("voltage", "SN")
        col = "#E60000" if v == "WN" else "#0066FF" if v == "nN" else "#FF9800"
        ax.plot(lons, lats, color=col, linewidth=2.5, alpha=0.9)

    ax.tick_params(labelsize=7)
    ax.set_title("Działka + infrastruktura", fontsize=9, fontweight="bold", color="#2C3E7A")
    ax.grid(True, alpha=0.3)
    fig.tight_layout(pad=0.8)
    return fig_to_bytes(fig)


def generate_pdf_cards(parcels_data: list, parcel_ids: list) -> bytes:
    """
    PDF z jedną stroną na działkę — karta jak pojedyncza analiza.
    Cover + dla każdej działki: header, metryki, Track A/B/Razem, mini-mapa.
    """
    buf = io.BytesIO()
    W, H = A4
    S = make_styles()

    pairs = [(pid, p) for pid, p in zip(parcel_ids, parcels_data) if p]
    if not pairs:
        raise ValueError("Brak danych do wygenerowania PDF")
    MAX_PARCELS = 50
    if len(pairs) > MAX_PARCELS:
        pairs = pairs[:MAX_PARCELS]
    parcel_ids = [x[0] for x in pairs]
    parcels_data = [x[1] for x in pairs]

    for i, p in enumerate(parcels_data):
        p["_parcel_id"] = parcel_ids[i] if i < len(parcel_ids) else f"Dz.{i+1}"

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=1.5*cm, bottomMargin=1.5*cm,
    )

    story = []
    W_txt = W - 3*cm

    # Cover
    total_a = sum((((p.get("compensation") or {}).get("track_a") or {}).get("total") or 0) for p in parcels_data)
    total_b = sum((((p.get("compensation") or {}).get("track_b") or {}).get("total") or 0) for p in parcels_data)
    story.append(Spacer(1, 50*mm))
    story.append(Paragraph("ANALIZA ODSZKODOWAWCZA", S["cover_title"]))
    story.append(Paragraph("Oferty hurtowe · karty działek", S["cover_sub"]))
    story.append(Spacer(1, 10*mm))
    story.append(Paragraph(f"{len(parcels_data)} działek · Razem: <b>{total_a + total_b:,.2f} PLN</b>".replace(",", " "), S["cover_det"]))
    story.append(Spacer(1, 6*mm))
    story.append(Paragraph(f"Data: <b>{datetime.now().strftime('%d.%m.%Y')}</b>", S["cover_det"]))
    story.append(PageBreak())

    VOLT_LABEL = {"WN": "WN >110 kV", "SN": "SN 1–110 kV", "nN": "nN <1 kV"}

    for idx, p in enumerate(parcels_data):
        pid = p["_parcel_id"]
        geom = p.get("geometry") or {}
        ksws = p.get("ksws") or {}
        pl = (p.get("infrastructure") or {}).get("power_lines") or {}
        md = p.get("market_data") or {}
        comp = p.get("compensation") or {}
        ta = comp.get("track_a") or {}
        tb = comp.get("track_b") or {}
        collision = pl.get("detected", False)
        volt = VOLT_LABEL.get(pl.get("voltage"), pl.get("voltage") or "—")

        # Header
        acc = C_ACCENT if collision else C_GREEN
        hdr_cells = [
            [Paragraph(f"<b>#{idx+1}</b>", S["body"]), Paragraph(f"<b>{pid}</b>", S["body"]),
             Paragraph(f"<font color={'#c62828' if collision else '#2e7d32'}>{'KOLIZJA' if collision else 'BEZ KOLIZJI'}</font>", S["body"])]
        ]
        hdr_t = Table(hdr_cells, colWidths=[15*mm, W_txt*0.5, 35*mm])
        hdr_t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), HexColor("#F8F9FC")),
            ("BOX", (0,0), (-1,-1), 1, acc),
            ("TOPPADDING", (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ]))
        story.append(hdr_t)
        story.append(Spacer(1, 3*mm))

        # Metryki 2x4
        area = geom.get("area_m2") or 0
        price = md.get("average_price_m2") or 0
        value = ksws.get("property_value_total") or (area * price)
        line_len = ksws.get("line_length_m") or 0
        band_w = ksws.get("band_width_m") or 0
        band_a = ksws.get("band_area_m2") or 0
        pct = min(100, round(band_a / area * 100)) if area > 0 and band_a > 0 else 0

        metric_rows = [
            [Paragraph("Pow. działki", S["small"]), f"{area:,.0f} m²".replace(",", " "),
             Paragraph("Cena gruntu", S["small"]), f"{price:.2f} zł/m²",
             Paragraph("Wartość nier.", S["small"]), f"{value:,.0f} PLN".replace(",", " "),
             Paragraph("Napięcie", S["small"]), volt],
            [Paragraph("Dł. linii", S["small"]), f"{line_len:.1f} m" if line_len else "—",
             Paragraph("Szer. pasa", S["small"]), f"{band_w} m" if band_w else "—",
             Paragraph("Pow. pasa", S["small"]), f"{band_a:,.0f} m²".replace(",", " ") if band_a else "—",
             Paragraph("% w pasie", S["small"]), f"{pct}%" if pct else "—"],
        ]
        mtab = Table(metric_rows, colWidths=[35*mm, 40*mm]*4)
        mtab.setStyle(TableStyle([
            ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
            ("FONTSIZE", (0,0), (-1,-1), 9),
            ("GRID", (0,0), (-1,-1), 0.3, C_BORDER),
            ("BACKGROUND", (0,0), (0,-1), C_LIGHT_BG),
            ("BACKGROUND", (2,0), (2,-1), C_LIGHT_BG),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        story.append(mtab)
        story.append(Spacer(1, 4*mm))

        # Track A / B / RAZEM + mapa (2 kolumny)
        ta_total = ta.get("total") or 0
        tb_total = tb.get("total") or 0
        razem = ta_total + tb_total

        track_cells = [
            [Paragraph("Track A — Sąd", S["small"]), Paragraph(fmt_pln(ta_total), S["body"])],
            [Paragraph("Track B — Neg.", S["small"]), Paragraph(fmt_pln(tb_total), S["body"])],
            [Paragraph("<b>RAZEM A+B</b>", S["body"]), Paragraph(f"<b>{fmt_pln(razem)}</b>", S["body"])],
        ]
        track_t = Table(track_cells, colWidths=[55*mm, 45*mm])
        track_t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (0,1), HexColor("#EEF4FF")),
            ("BACKGROUND", (0,2), (-1,2), HexColor("#3D2319")),
            ("TEXTCOLOR", (0,2), (-1,2), white),
            ("BOX", (0,0), (-1,-1), 0.5, C_BORDER),
            ("TOPPADDING", (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ]))
        story.append(track_t)

        # Mini-mapa (obok lub pod)
        try:
            map_bytes = chart_parcel_minimap(p)
            story.append(Spacer(1, 3*mm))
            story.append(RLImage(map_bytes, width=10*cm, height=10*cm))
        except Exception:
            story.append(Paragraph("<i>Mapa niedostępna</i>", S["small"]))

        story.append(PageBreak())

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ── STRONA TYTUŁOWA ─────────────────────────────────────────────────────────────

def draw_cover(canvas_obj, doc):
    W, H = A4
    n = 60
    for i in range(n):
        t = i / n
        r = int(44 + t*(20-44)); g = int(62 + t*(40-62)); b = int(122 + t*(80-122))
        canvas_obj.setFillColorRGB(r/255, g/255, b/255)
        y = H * (1 - (i+1)/n)
        canvas_obj.rect(0, y, W, H/n+1, fill=1, stroke=0)
    # Linia WN dekoracyjna
    canvas_obj.setStrokeColorRGB(0.9, 0.3, 0.1)
    canvas_obj.setLineWidth(3)
    canvas_obj.line(0, H*0.62, W, H*0.62)
    canvas_obj.setLineWidth(1.5)
    canvas_obj.line(0, H*0.615, W, H*0.615)
    # Słupy dekoracyjne
    for px in [40, 100, 510, 570]:
        canvas_obj.setStrokeColorRGB(0.15, 0.15, 0.15)
        canvas_obj.setLineWidth(3.5)
        canvas_obj.line(px, H*0.20, px, H*0.62)
        canvas_obj.setLineWidth(2)
        canvas_obj.line(px-14, H*0.62, px+14, H*0.62)
        canvas_obj.setFillColorRGB(0.15, 0.15, 0.15)
        for pw in [-11, 0, 11]:
            canvas_obj.circle(px+pw, H*0.62, 3, fill=1)
    # Dolna belka
    canvas_obj.setFillColorRGB(0.13, 0.18, 0.42)
    canvas_obj.rect(0, 0, W, H*0.18, fill=1, stroke=0)


def draw_header_footer(canvas_obj, doc, meta):
    W, H = A4
    canvas_obj.setFillColor(C_PRIMARY)
    canvas_obj.rect(0, H-20*mm, W, 20*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(white)
    canvas_obj.setFont("Helvetica-Bold", 9)
    title_short = meta.get("kw", "")
    owner_short = meta.get("owner", "")
    canvas_obj.drawString(20*mm, H-13*mm, f"RAPORT ODSZKODOWAWCZY · KW {title_short} · {owner_short}")
    canvas_obj.setFont("Helvetica", 9)
    canvas_obj.drawRightString(W-20*mm, H-13*mm, f"Strona {doc.page}")
    # Footer
    canvas_obj.setFillColor(C_PRIMARY)
    canvas_obj.rect(0, 0, W, 12*mm, fill=1, stroke=0)
    canvas_obj.setFillColor(white)
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.drawString(20*mm, 4*mm,
        f"Wygenerowano: {datetime.now().strftime('%d.%m.%Y %H:%M')} · "
        "Metodyka KSWS-V.5 · TK P 10/16 · Źródło: ULDK GUGiK (REAL DATA)")
    canvas_obj.drawRightString(W-20*mm, 4*mm, "POUFNE — do użytku wewnętrznego")


# ── GŁÓWNA FUNKCJA ─────────────────────────────────────────────────────────────

def generate_pdf(
    parcels_data: list,          # lista master_record (każdy to jeden parcel)
    parcel_ids: list,
    owner_name: str = "Właściciel",
    kw_number: str = "",
    address: str = "",
) -> bytes:
    """
    Generuje PDF i zwraca jako bytes.

    parcels_data: lista słowników master_record z /api/analyze
    parcel_ids:   lista stringów identyfikatorów (w tej samej kolejności)
    """
    buf = io.BytesIO()
    W, H = A4
    S = make_styles()

    # Odfiltruj None / puste rekordy
    pairs = [(pid, p) for pid, p in zip(parcel_ids, parcels_data) if p]
    if not pairs:
        raise ValueError("Brak danych do wygenerowania PDF")
    # Limituj do 50 działek (PDF byłby zbyt duży)
    MAX_PARCELS = 50
    if len(pairs) > MAX_PARCELS:
        pairs = pairs[:MAX_PARCELS]
    parcel_ids    = [x[0] for x in pairs]
    parcels_data  = [x[1] for x in pairs]

    # Wstrzykujemy _parcel_id do każdego rekordu
    for i, p in enumerate(parcels_data):
        p["_parcel_id"] = parcel_ids[i] if i < len(parcel_ids) else f"Dz.{i+1}"

    meta = {"owner": owner_name, "kw": kw_number or "—"}

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2.2*cm,
        title=f"Raport odszkodowawczy — {owner_name}",
        author="KALKULATOR v3.0 / KSWS",
        subject="KSWS Track A/B",
    )

    story = []
    W_txt = W - 4*cm

    # ═══ STRONA TYTUŁOWA ═══
    story.append(Spacer(1, 65*mm))
    story.append(Paragraph("RAPORT ODSZKODOWAWCZY", S["cover_title"]))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Analiza roszczeń z tytułu służebności przesyłu", S["cover_sub"]))
    # Typ infrastruktury
    infra_label = (parcels_data[0].get("ksws", {}).get("label", "")
                   or parcels_data[0].get("ksws", {}).get("infra_type", "Nieznany"))
    story.append(Paragraph(f"Infrastruktura: <b>{infra_label}</b>", S["cover_sub"]))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph(f"Właściciel: <b>{owner_name}</b>", S["cover_det"]))
    if address:
        story.append(Paragraph(address, S["cover_det"]))
    if kw_number:
        story.append(Paragraph(f"Księga Wieczysta: <b>{kw_number}</b>", S["cover_det"]))
    story.append(Paragraph(
        f"Działki: <b>{', '.join(parcel_ids)}</b>", S["cover_det"]))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph(f"Data: <b>{datetime.now().strftime('%d.%m.%Y')}</b>", S["cover_det"]))
    story.append(Paragraph("Metodyka: <b>KSWS-V.5 Track A/B · TK P 10/16</b>", S["cover_det"]))
    story.append(Spacer(1, 16*mm))

    # Kwota-rama
    def _safe_comp(p, track):
        return ((p.get("compensation") or {}).get(track) or {}).get("total") or 0
    total_a = sum(_safe_comp(p, "track_a") for p in parcels_data)
    total_b = sum(_safe_comp(p, "track_b") for p in parcels_data)
    cover_tbl = Table([
        [Paragraph("ROSZCZENIE ŁĄCZNE (TRACK B):", S["bc"])],
        [Paragraph(f"{total_b:,.2f} PLN".replace(",", " "), S["money_gold"])],
        [Paragraph(f"Track A (sądowa): {total_a:,.2f} PLN".replace(",", " "), S["center"])],
    ], colWidths=[W_txt])
    cover_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), HexColor("#1A2A5C")),
        ("TEXTCOLOR",    (0,0),(-1,-1), white),
        ("BOX",          (0,0),(-1,-1), 2, C_GOLD),
        ("TOPPADDING",   (0,0),(-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
    ]))
    story.append(cover_tbl)
    story.append(PageBreak())

    # ═══ I. IDENTYFIKACJA — tabela wierszowa (działka = wiersz) ═══
    story.append(HRFlowable(width="100%", thickness=3, color=C_PRIMARY, spaceAfter=4))
    story.append(Paragraph("I. IDENTYFIKACJA NIERUCHOMOŚCI", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=6))

    id_rows = [[
        Paragraph("TERYT / ID", S["th"]),
        Paragraph("Gmina / Powiat", S["th"]),
        Paragraph("Pow. [m²]", S["th"]),
        Paragraph("Użytek", S["th"]),
        Paragraph("Typ", S["th"]),
        Paragraph("Cena [zł/m²]", S["th"]),
    ]]
    for p in parcels_data:
        pm = p.get("parcel_metadata") or {}
        geom = p.get("geometry") or {}
        egib = p.get("egib") or {}
        md   = p.get("market_data") or {}
        teryt = (p.get("metadata") or {}).get("teryt_id","—")
        gmina = f"{pm.get('commune','—')} / {pm.get('county','—')}"
        area  = f"{(geom.get('area_m2') or 0):,.0f}"
        klasa = egib.get("primary_class","—")
        typ   = "Bud." if egib.get("land_type") == "building" else "Rolny"
        cena  = f"{(md.get('average_price_m2') or 0):.2f}"
        id_rows.append([teryt, gmina, area, klasa, typ, cena])
    cw_id = [W_txt*0.25, W_txt*0.30, W_txt*0.12, W_txt*0.09, W_txt*0.10, W_txt*0.14]
    story.append(std_table(id_rows, cw_id, C_PRIMARY))

    # ═══ II. INFRASTRUKTURA — tabela wierszowa ═══
    story.append(Spacer(1, 5*mm))
    story.append(HRFlowable(width="100%", thickness=3, color=C_ACCENT, spaceAfter=4))
    story.append(Paragraph("II. INFRASTRUKTURA — LINIA PRZESYŁOWA", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=6))

    infra_rows = [[
        Paragraph("TERYT / ID", S["th"]),
        Paragraph("Kolizja", S["th"]),
        Paragraph("Napięcie", S["th"]),
        Paragraph("Pas [m]", S["th"]),
        Paragraph("Pow. pasa [m²]", S["th"]),
        Paragraph("% w pasie", S["th"]),
        Paragraph("Wart. nier. [PLN]", S["th"]),
    ]]
    for p in parcels_data:
        teryt = (p.get("metadata") or {}).get("teryt_id","—")
        ksws  = p.get("ksws") or {}
        geom  = p.get("geometry") or {}
        pl    = (p.get("infrastructure") or {}).get("power_lines") or {}
        pw    = (p.get("infrastructure") or {}).get("power") or {}
        wykr  = "TAK" if (pl.get("detected") or pw.get("exists")) else "NIE"
        volt  = pl.get("voltage") or pw.get("voltage") or "—"
        pas   = str(ksws.get("band_width_m","—"))
        ppas  = f"{(ksws.get('band_area_m2') or 0):,.0f}"
        a_m2  = (geom.get('area_m2') or 1)
        b_m2  = (ksws.get('band_area_m2') or 0)
        pct   = f"{min(100, b_m2/max(1,a_m2)*100):.0f}%"
        wart  = fmt_pln(ksws.get("property_value_total"))
        infra_rows.append([teryt, wykr, volt, pas, ppas, pct, wart])
    cw_inf = [W_txt*0.24, W_txt*0.08, W_txt*0.10, W_txt*0.09, W_txt*0.13, W_txt*0.10, W_txt*0.26]
    story.append(std_table(infra_rows, cw_inf, C_ACCENT))

    story.append(PageBreak())

    # ═══ III. WIZUALIZACJA 3D ═══
    story.append(HRFlowable(width="100%", thickness=3, color=C_PRIMARY, spaceAfter=4))
    story.append(Paragraph("III. WIZUALIZACJA 3D — DZIAŁKI Z KORYTARZEM LINII", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=6))
    story.append(Paragraph(
        "Schematyczna wizualizacja 3D przedstawia proporcjonalne położenie działek względem "
        "osi linii przesyłowej oraz zasięg strefy ochronnej. Czerwona strefa to pas ochronny "
        "objęty ograniczeniami korzystania. Słupy symbolizują linię WN.", S["body"]))
    story.append(Spacer(1, 2*mm))

    viz_bytes = chart_3d_parcel(parcels_data)
    story.append(RLImage(viz_bytes, width=16*cm, height=9*cm))
    story.append(Spacer(1, 4*mm))

    donut_n = min(9, len(parcels_data))
    donut_cols = min(3, donut_n)
    donut_rows = math.ceil(donut_n / donut_cols)
    donut_bytes = chart_donut_band(parcels_data)
    story.append(RLImage(donut_bytes, width=16*cm, height=min(16*cm, 5*cm*donut_rows)))

    story.append(PageBreak())

    # ═══ IV. WYCENA ═══
    story.append(HRFlowable(width="100%", thickness=3, color=C_GREEN, spaceAfter=4))
    story.append(Paragraph("IV. WYCENA ODSZKODOWANIA — KSWS TRACK A/B", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=6))

    # Parametry KSWS
    basis = (parcels_data[0].get("compensation") or {}).get("basis") or {}
    ksws0 = parcels_data[0].get("ksws") or {}
    story.append(Paragraph("Parametry KSWS:", S["h3"]))
    ksws_rows = [
        [Paragraph("Wsp.", S["th"]), Paragraph("Wartość", S["th"]), Paragraph("Opis", S["th"])],
        ["S", str(basis.get("S","0,250")), "Obniżenie wartości gruntu w pasie"],
        ["k", str(basis.get("k","0,650")), "Współczynnik korzystania z nieruchomości"],
        ["R", str(basis.get("R","0,060")), "Stopa kapitalizacji (WBK)"],
        ["impact", str(basis.get("impact_judicial","0,073")), "Wskaźnik wpływu OBN"],
        ["Mnożnik B", f"×{basis.get('track_b_multiplier',1.80)}", "Track B = Track A × mnożnik"],
        ["Pas ochronny", f"{ksws0.get('band_width_m',30)} m", "Szerokość strefy ochronnej"],
        ["Cena gruntu", f"{ksws0.get('price_per_m2',6.50):.2f} zł/m²",
         "Źródło: " + (parcels_data[0].get("market_data") or {}).get("price_source","GUS")],
    ]
    story.append(std_table(ksws_rows,
                           [W_txt*0.14, W_txt*0.16, W_txt*0.70], C_GREEN))
    story.append(Spacer(1, 4*mm))

    # Szczegóły każdej działki (max 20 — przy dużych batchach pokazuj tylko tabelę zbiorczą)
    MAX_DETAIL = 20
    detail_parcels = parcels_data[:MAX_DETAIL]
    if len(parcels_data) > MAX_DETAIL:
        story.append(Paragraph(
            f"Uwaga: szczegółowe wyliczenia pokazane dla pierwszych {MAX_DETAIL} z {len(parcels_data)} działek. "
            f"Pełne dane w tabeli zbiorczej poniżej.", S["body"]
        ))
        story.append(Spacer(1, 2*mm))
    for p in detail_parcels:
        pid = p["_parcel_id"]
        nr  = pid.split(".")[-1] if "." in pid else pid
        comp = p.get("compensation") or {}
        ta   = comp.get("track_a") or {}
        tb   = comp.get("track_b") or {}
        ksws = p.get("ksws")   or {}
        geom = p.get("geometry") or {}

        story.append(Paragraph(f"Działka {nr} — szczegółowe wyliczenie:", S["h3"]))
        det_rows = [
            [Paragraph("Element", S["th"]),
             Paragraph("Obliczenie", S["th"]),
             Paragraph("Kwota [PLN]", S["th"])],
            ["Wartość nieruchomości",
             f"{geom.get('area_m2',0):,.1f} m² × {ksws.get('price_per_m2',0):.2f} zł/m²",
             fmt_pln(ksws.get("property_value_total"))],
            ["Pas ochronny",
             f"{ksws.get('band_area_m2',0):,.0f} m²  ({min(100,ksws.get('band_area_m2',0)/max(1,geom.get('area_m2',1))*100):.0f}%)",
             ""],
            ["WSP (służebność przesyłu)", "Wart. × S × k × %pasa", fmt_pln(ta.get("wsp"))],
            [f"WBK (bezumowne {ta.get('years',6)} lat)", f"Wart. × R × k × %pasa × {ta.get('years',6)}", fmt_pln(ta.get("wbk"))],
            ["OBN (obniżenie wartości)", "Wart. × impact × (lat/10)", fmt_pln(ta.get("obn"))],
            [Paragraph("<b>TRACK A (sąd)</b>", S["body"]),
             Paragraph("<b>WSP + WBK + OBN</b>", S["body"]),
             Paragraph(f"<b>{fmt_pln(ta.get('total'))}</b>", S["body"])],
            [Paragraph("<b>TRACK B (negocjacje)</b>", S["body"]),
             Paragraph(f"<b>Track A × {tb.get('multiplier',1.80)}</b>", S["body"]),
             Paragraph(f"<b>{fmt_pln(tb.get('total'))}</b>", S["body"])],
        ]
        story.append(std_table(det_rows,
                               [W_txt*0.30, W_txt*0.42, W_txt*0.28], C_BLUE))
        story.append(Spacer(1, 3*mm))

    # Tabela zbiorcza
    story.append(Paragraph("Zestawienie łączne:", S["h3"]))
    sum_rows = [
        [Paragraph("Działka", S["th"]),
         Paragraph("Track A — Sąd", S["th"]),
         Paragraph("Track B — Negocjacje", S["th"])],
    ]
    for p in parcels_data:
        pid = p["_parcel_id"]
        nr  = pid.split(".")[-1] if "." in pid else pid
        ta  = (p.get("compensation") or {}).get("track_a") or {}
        tb  = (p.get("compensation") or {}).get("track_b") or {}
        sum_rows.append([f"Dz. {nr}", fmt_pln(ta.get("total")), fmt_pln(tb.get("total"))])
    if len(parcels_data) > 1:
        sum_rows.append([
            Paragraph("<b>SUMA</b>", S["body"]),
            Paragraph(f"<b>{fmt_pln(total_a)}</b>", S["body"]),
            Paragraph(f"<b>{fmt_pln(total_b)}</b>", S["body"]),
        ])
    story.append(std_table(sum_rows, [W_txt*0.28, W_txt*0.36, W_txt*0.36], C_PRIMARY))
    story.append(Spacer(1, 4*mm))

    # Ramka z kluczową kwotą
    money_tbl = Table([
        [Paragraph("ZALECANY PRÓG NEGOCJACYJNY (TRACK B):", S["bc"])],
        [Paragraph(f"{fmt_pln(total_b)}", S["money_gold"])],
        [Paragraph(f"Track A (ścieżka sądowa): {fmt_pln(total_a)}", S["center"])],
    ], colWidths=[W_txt])
    money_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), HexColor("#FEF9E7")),
        ("BOX",          (0,0),(-1,-1), 2.5, C_GOLD),
        ("TOPPADDING",   (0,0),(-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
    ]))
    story.append(money_tbl)

    story.append(PageBreak())

    # ═══ V. KWALIFIKACJA ROSZCZEŃ R1–R5 ═══
    story.append(HRFlowable(width="100%", thickness=3, color=C_PRIMARY, spaceAfter=4))
    story.append(Paragraph("V. KWALIFIKACJA ROSZCZEŃ — METODOLOGIA", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=6))
    story.append(Paragraph(
        "Roszczenia zakwalifikowane na podstawie infrastruktury, planowania przestrzennego "
        "i charakteru gruntu. Kwoty wg KSWS-V.5 i art. 361 §1–2 KC.",
        S["body"]))
    story.append(Spacer(1, 3*mm))

    for p in detail_parcels:
        pid = p["_parcel_id"]
        nr  = pid.split(".")[-1] if "." in pid else pid
        cq  = p.get("claims_qualification") or {}
        if not cq:
            continue

        story.append(Paragraph(f"Działka {nr}:", S["h3"]))

        # Tabela R1–R5 w jednym miejscu
        cq_rows = [
            [Paragraph("Roszczenie", S["th"]),
             Paragraph("Podstawa", S["th"]),
             Paragraph("Obliczenie", S["th"]),
             Paragraph("Kwota [PLN]", S["th"])],
        ]

        r1 = cq.get("R1") or {}
        r2 = cq.get("R2") or {}
        r3 = cq.get("R3") or {}
        r4 = cq.get("R4") or {}
        r5 = cq.get("R5") or {}
        comp = p.get("compensation", {})
        ta   = comp.get("track_a", {})

        cq_rows.append([
            Paragraph("<b>R1 — Służebność przesyłu (WSP)</b>", S["body"]),
            Paragraph("art. 305¹–305⁴ KC", S["small"]),
            Paragraph("Wartość × S × k × %pasa", S["small"]),
            Paragraph(fmt_pln(r1.get("value")), S["small"]),
        ])
        cq_rows.append([
            Paragraph(f"<b>R2 — Bezumowne korzystanie (WBK)</b><br/>{r2.get('years',6)} lat — art. 118 KC", S["body"]),
            Paragraph("art. 224–225 KC", S["small"]),
            Paragraph(f"Wartość × R × k × %pasa × {r2.get('years',6)} lat", S["small"]),
            Paragraph(fmt_pln(r2.get("value")), S["small"]),
        ])
        cq_rows.append([
            Paragraph("<b>R3 — Obniżenie wartości nieruchomości (OBN)</b>", S["body"]),
            Paragraph("art. 305² KC", S["small"]),
            Paragraph("Wartość × impact × (lat/10)", S["small"]),
            Paragraph(fmt_pln(r3.get("value")), S["small"]),
        ])

        if r4.get("active"):
            cq_rows.append([
                Paragraph("<b>R4 — Blokada zabudowy</b>", S["body"]),
                Paragraph("art. 140 KC + WZ/MPZP", S["small"]),
                Paragraph(r4.get("damage_calc") or "—", S["small"]),
                Paragraph(fmt_pln(r4.get("value")), S["small"]),
            ])

        if r5.get("active"):
            r5d = r5.get("detail") or {}
            r51 = r5d.get("r51") or {}
            r52 = r5d.get("r52") or {}
            prod_gus = r5d.get("prod_per_ha_year_gus", 0)
            cq_rows.append([
                Paragraph("<b>R5.1 — Fundamenty słupów</b><br/>Damnum emergens", S["body"]),
                Paragraph("art. 361 §1 KC", S["small"]),
                Paragraph(r51.get("formula", "—"), S["small"]),
                Paragraph(fmt_pln(r51.get("value")), S["small"]),
            ])
            cq_rows.append([
                Paragraph("<b>R5.2 — Wyspy/kliny niedostępne sprzętowi</b><br/>Lucrum cessans", S["body"]),
                Paragraph("art. 361 §2 KC", S["small"]),
                Paragraph(
                    f"{r52.get('formula','—')}<br/>"
                    f"<font size='8'>GUS prod. globalna: {prod_gus:,.0f} zł/ha/rok</font>",
                    S["small"]),
                Paragraph(fmt_pln(r52.get("value")), S["small"]),
            ])

        story.append(std_table(cq_rows, [W_txt*0.27, W_txt*0.18, W_txt*0.34, W_txt*0.21], C_PRIMARY))
        story.append(Spacer(1, 2*mm))

        # R4 nota jeśli aktywne
        if r4.get("active"):
            story.append(Paragraph(
                f"R4: {r4.get('note','—')}",
                S["note"]))
            story.append(Spacer(1, 1*mm))

        # R5 — uzasadnienie szkody rolnej (pełna argumentacja)
        if r5.get("active"):
            r5d = r5.get("detail") or {}
            prod_gus = r5d.get("prod_per_ha_year_gus", 0)
            r5_total = r5.get("value", 0)
            story.append(Paragraph("Uzasadnienie szkody rolnej (R5):", S["h3"]))
            story.append(Paragraph(
                "Posadowienie słupów kratowych żelbetonowych wzdłuż i w poprzek ciągów uprawnych tworzy "
                "trwałe przeszkody technologiczne o charakterze nieodwracalnym, skutkujące stałą, wymierną "
                "szkodą operacyjną:",
                S["body"]))
            uzasadnienie_rows = [
                [Paragraph("Przyczyna szkody", S["th"]),
                 Paragraph("Opis", S["th"])],
                [Paragraph("<b>Maszyny rolnicze</b>", S["body"]),
                 Paragraph(
                    "Słupy uniemożliwiają uprawę mechaniczną sprzętem o szerokim zasięgu roboczym: "
                    "opryskiwaczy polowych o belce 24–36 m, kombajnów zbożowych, agregatów uprawowych. "
                    "Każdy przejazd wymaga omijania słupów, co wyklucza efektywne prowadzenie prac polowych.",
                    S["small"])],
                [Paragraph("<b>Wyspy i kliny uprawne</b>", S["body"]),
                 Paragraph(
                    "Rozmieszczenie słupów tworzy trwałe kliny i wyspy uprawne — fragmenty gruntu fizycznie "
                    "niedostępne dla standardowego sprzętu — co oznacza systematyczną, coroczną utratę plonu "
                    "z tych obszarów. Wartość strat obliczono na podstawie GUS: produkcja globalna rolnicza "
                    f"{prod_gus:,.0f} zł/ha/rok ({r5d.get('r52',{}).get('note','')}).",
                    S["small"])],
                [Paragraph("<b>GPS/RTK</b>", S["body"]),
                 Paragraph(
                    "Obecność słupów w pasach przejazdowych wyklucza technologię GPS/RTK stosowaną "
                    "powszechnie w precyzyjnym rolnictwie. Systemy automatycznego prowadzenia maszyn "
                    "wymagają niezakłóconych, prostoliniowych pasów przejazdowych.",
                    S["small"])],
                [Paragraph("<b>Koszty operacyjne</b>", S["body"]),
                 Paragraph(
                    "Każdy sezon rolniczy generuje zwiększone koszty: dodatkowe przebiegi przy omijaniu "
                    "przeszkód, ręczna uprawa w strefach niedostępnych mechanicznie, straty czasu maszyn "
                    "i operatorów. Szkoda ciągła — nie ustanie do czasu usunięcia infrastruktury "
                    "(art. 361 §2 k.c.).",
                    S["small"])],
            ]
            story.append(std_table(uzasadnienie_rows, [W_txt*0.22, W_txt*0.78], C_GREEN))
            story.append(Spacer(1, 2*mm))
            story.append(Paragraph(
                f"Łączna szkoda rolna (R5.1 + R5.2): <b>{fmt_pln(r5_total)}</b> "
                f"— szkoda ciągła w rozumieniu art. 361 §2 k.c.",
                S["note"]))
            story.append(Spacer(1, 2*mm))

        # Suma
        grand_total = cq.get("total_active_claims", 0)
        sum_tbl = Table([
            [Paragraph("ŁĄCZNIE AKTYWNE ROSZCZENIA:", S["bc"])],
            [Paragraph(fmt_pln(grand_total), S["money_blue"])],
        ], colWidths=[W_txt])
        sum_tbl.setStyle(TableStyle([
            ("BACKGROUND",   (0,0),(-1,-1), HexColor("#EBF5FB")),
            ("BOX",          (0,0),(-1,-1), 2, C_BLUE),
            ("TOPPADDING",   (0,0),(-1,-1), 6),
            ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ]))
        story.append(sum_tbl)
        story.append(Spacer(1, 5*mm))

    story.append(PageBreak())

    # ═══ VI. WYKRESY ═══
    story.append(HRFlowable(width="100%", thickness=3, color=C_PRIMARY, spaceAfter=4))
    story.append(Paragraph("VI. WYKRESY ANALITYCZNE", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=6))

    story.append(Paragraph("Porównanie 3D Track A / Track B:", S["h3"]))
    story.append(RLImage(chart_3d_bars(parcels_data), width=15*cm, height=8*cm))
    story.append(Spacer(1, 4*mm))

    story.append(Paragraph("Struktura składników odszkodowania:", S["h3"]))
    bar_h = min(18, max(5, min(15, len(parcels_data)) * 1.8 + 2))
    story.append(RLImage(chart_bar_breakdown(parcels_data), width=15*cm, height=bar_h*cm))

    story.append(PageBreak())

    # ═══ VII. PODSTAWY PRAWNE ═══
    story.append(HRFlowable(width="100%", thickness=3, color=C_PRIMARY, spaceAfter=4))
    story.append(Paragraph("VII. PODSTAWY PRAWNE", S["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=6))

    legal = [
        [Paragraph("Podstawa", S["th"]), Paragraph("Zakres", S["th"])],
        ["Art. 305¹–305⁴ KC", "Służebność przesyłu — ustanowienie i wynagrodzenie (WSP)"],
        ["Art. 225 × 224§2 KC", "Bezumowne korzystanie z nieruchomości (WBK)"],
        ["Art. 128 u.g.n.", "Odszkodowanie za ograniczenie korzystania (OBN)"],
        ["Art. 144 KC", "Immisje ponadnormatywne (EMF, hałas) — nieruchomości mieszkalne"],
        ["TK P 10/16", "Wyrok TK — konstytucyjność wynagrodzenia za służebność"],
        ["KSWS-V.5", "Komisja Standardów Wyceny — metodyka WSP+WBK+OBN"],
    ]
    story.append(std_table(legal, [W_txt*0.28, W_txt*0.72], C_PRIMARY))

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph("Dane techniczne:", S["h3"]))
    tech = [
        [Paragraph("Parametr", S["th"]), Paragraph("Wartość", S["th"])],
        ["Źródło geometrii", "ULDK GUGiK — status: REAL"],
        ["Infrastruktura", "Potwierdzona — geoportal.gov.pl (GESUT/KIUT)"],
        ["Metodyka", "KSWS-V.5 Track A/B"],
        ["System", "KALKULATOR v3.0 — Strict Real Data Policy"],
        ["Data i godzina", datetime.now().strftime("%d.%m.%Y  %H:%M")],
    ]
    story.append(std_table(tech, [W_txt*0.35, W_txt*0.65], C_PRIMARY))

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph(
        "Niniejszy raport ma charakter informacyjno-analityczny i nie zastępuje operatu "
        "szacunkowego sporządzonego przez uprawnionego rzeczoznawcę majątkowego. "
        "Dane geometryczne pochodzą z systemu ULDK GUGiK. "
        "Ceny gruntów na podstawie GUS BDL i/lub RCN (GUGiK).",
        S["small"]))

    # ── BUILD ──
    first_page_drawn = [False]

    def on_first(c, d):
        draw_cover(c, d)
        first_page_drawn[0] = True

    def on_later(c, d):
        draw_header_footer(c, d, meta)

    doc.build(story, onFirstPage=on_first, onLaterPages=on_later)
    return buf.getvalue()
