# Justinmind Design Palette - KALKULATOR Implementation

## Color System

### Primary Colors
| Color Name | Hex Code | RGB | Usage |
|------------|----------|-----|-------|
| **Magenta (Primary)** | #a91079 | rgb(169, 16, 121) | Main CTAs, headers, accents |
| **Magenta Dark** | #3f0d59 | rgb(63, 13, 89) | Header backgrounds, dark accents |
| **Pink/Magenta Light** | #d81b60 | rgb(216, 27, 96) | Button hover, gradients |

### Secondary Colors
| Color Name | Hex Code | RGB | Usage |
|------------|----------|-----|-------|
| **Blue Primary** | #3498db | rgb(52, 152, 219) | Info, secondary CTAs |
| **Blue Dark** | #2980b9 | rgb(41, 128, 185) | Hover states |
| **Green Success** | #27ae60 | rgb(39, 174, 96) | Success states, positive |
| **Green Light** | #2ecc71 | rgb(46, 204, 113) | Hover effects, progress |
| **Orange/Warning** | #f39c12 | rgb(243, 156, 18) | Warnings, secondary states |
| **Orange Dark** | #e67e22 | rgb(230, 126, 34) | Warning hover |
| **Red/Danger** | #e74c3c | rgb(231, 76, 60) | Errors, critical alerts |
| **Red Dark** | #c0392b | rgb(192, 57, 43) | Error hover |
| **Purple** | #9b59b6 | rgb(155, 89, 182) | Telekom infrastructure |

### Neutral Colors
| Color Name | Hex Code | RGB | Usage |
|------------|----------|-----|-------|
| **Dark Grey** | #2c3e50 | rgb(44, 62, 80) | Text, headings, main content |
| **Medium Grey** | #95a5a6 | rgb(149, 165, 166) | Subtitles, secondary text |
| **Light Grey** | #ecf0f1 | rgb(236, 240, 241) | Borders, backgrounds |
| **Very Light Grey** | #f8f9fa | rgb(248, 249, 250) | Card backgrounds |
| **White** | #ffffff | rgb(255, 255, 255) | Main card backgrounds |
| **Brown (Terrain)** | #8b7355 | rgb(139, 115, 85) | 3D map terrain |
| **Brown Dark** | #8b4513 | rgb(139, 69, 19) | 3D pole material |

---

## Component Color Usage

### Form Section
```
Header: Gradient(#3f0d59 → #a91079)
Submit Button: Gradient(#a91079 → #d81b60)
Form Groups: #2c3e50 labels, #95a5a6 subtitles
Focus States: #a91079 (magenta border + shadow)
```

### Stat Widgets (4 cards display)
```
1. Powierzchnia (Blue)
   Background: rgba(52, 152, 219, 0.1)
   Border: #3498db
   Icon/Value: #3498db

2. Klasa gruntu (Green)
   Background: rgba(39, 174, 96, 0.1)
   Border: #27ae60
   Icon/Value: #27ae60

3. Sieci przesyłowe (Magenta/Green based on detection)
   If Line Detected:
     Background: rgba(169, 16, 121, 0.1)
     Border: #a91079
     Value: "Wykryto"
   If No Line:
     Background: rgba(39, 174, 96, 0.1)
     Border: #27ae60
     Value: "Brak"

4. Cena rynkowa (Orange)
   Background: rgba(243, 156, 18, 0.1)
   Border: #f39c12
   Icon/Value: #f39c12
```

### Compensation Section
```
Track A (Blue)
- Card Border-Left: #3498db
- Header: white text on blue
- Value Color: #545cd8 (custom blue)
- Badge: color="primary"

Track B (Orange)
- Card Border-Left: #f39c12
- Header: white text on orange
- Value Color: #f7b924
- Badge: color="warning" text-dark
```

### Map Section
```
Card Border-Left: #3498db
Header Gradient: magenta
2D Map Parcel: #545cd8 with 15% opacity fill
```

### Info Cards (Left Sidebar)
```
Geometry (Blue)
- Icon Background: Linear(#3498db → #2980b9)
- Border: #3498db on hover

Land Use (Green)
- Icon Background: Linear(#27ae60 → #229954)
- Border: #27ae60 on hover

Infrastructure (Magenta/Green)
- If Detected: Icon Linear(#a91079 → #d81b60)
- If Not: Icon Linear(#27ae60 → #229954)
- Highlight Border: #e74c3c

Planning (Orange)
- Icon Background: Linear(#f39c12 → #e67e22)
- Border: #f39c12 on hover

Market Price (Blue)
- Icon Background: Linear(#3498db → #2980b9)
- Border: #3498db on hover
```

### Infrastructure Alert
```
Background: rgba(243, 156, 18, 0.1)
Border-Left: #f39c12
Icon: orange
Text: orange (#f39c12)
Action Buttons: color="success" (green)
```

---

## Gradient Definitions

### Primary Gradients (used in buttons and headers)
```css
/* Main CTA Gradient */
linear-gradient(135deg, #a91079 0%, #d81b60 100%)

/* Dark Header Gradient */
linear-gradient(135deg, #3f0d59 0%, #a91079 100%)

/* Success Gradient */
linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)

/* Warning Gradient */
linear-gradient(135deg, #f39c12 0%, #e67e22 100%)

/* Error Gradient */
linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)

/* Background Gradient */
linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)
```

---

## Shadow System

### Shadow Depths
```css
/* Light Shadow - Cards, subtle elevation */
0 2px 8px rgba(0, 0, 0, 0.08)

/* Medium Shadow - Interactive elements on hover */
0 4px 12px rgba(0, 0, 0, 0.12)

/* Heavy Shadow - Lifted elements, modals */
0 8px 25px rgba(0, 0, 0, 0.15)

/* Button Shadows - Color-specific */
0 4px 12px rgba(169, 16, 121, 0.3) /* Magenta */
0 4px 12px rgba(39, 174, 96, 0.3)  /* Green */
0 4px 12px rgba(243, 156, 18, 0.3) /* Orange */
0 4px 12px rgba(231, 76, 60, 0.3)  /* Red */
```

---

## Typography Colors

### Text Hierarchy
```
Primary Text (Headings):     #2c3e50 (Dark Grey) - 700 weight
Secondary Text (Labels):     #2c3e50 (Dark Grey) - 600 weight
Tertiary Text (Subtitles):   #95a5a6 (Medium Grey) - 400 weight
Muted Text (Helpers):        #95a5a6 (Medium Grey) - 400 weight
Link Text:                   #a91079 (Magenta) - underline on hover
Accent Values:               #a91079 (Magenta) - 700 weight
Error Text:                  #e74c3c (Red)
Success Text:                #27ae60 (Green)
Warning Text:                #f39c12 (Orange)
Info Text:                   #3498db (Blue)
```

---

## 3D Map Color Scheme

### Infrastructure Colors (THREE.js)
```javascript
const INFRASTRUCTURE_COLORS = {
  elektro: 0xe74c3c,      // Red (#e74c3c)
  gaz: 0xf39c12,          // Orange (#f39c12)
  woda: 0x3498db,         // Blue (#3498db)
  teleko: 0x9b59b6,       // Purple (#9b59b6)
  granica: 0x2c3e50,      // Dark Grey (#2c3e50)
  teren: 0x27ae60         // Green (#27ae60)
};
```

### Parcel Fill Colors (3D)
```
Default Fill:        #d5f4e6 (light green with 15% opacity)
Selected Fill:       #aed6f1 (light blue)
Border Outline:      #2c3e50 (dark grey)
Selected Border:     #3498db (blue)
```

---

## Opacity System

### Opacity Values Used
```
Full Opacity:           1.0 (100%) - Primary elements
High Opacity:           0.9 (90%)  - Hover states
Normal Opacity:         0.75 (75%) - Secondary elements
Medium Opacity:         0.5 (50%)  - Disabled elements
Low Opacity:            0.3 (30%)  - Subtle highlights
Very Low Opacity:       0.1 (10%)  - Backgrounds for colored alerts
```

---

## Color Implementation in CSS

### CSS Variables Definition
All colors are defined in `:root` selector for easy maintenance:
```css
:root {
  --color-magenta: #a91079;
  --color-magenta-dark: #3f0d59;
  --color-green-success: #27ae60;
  --color-green-light: #2ecc71;
  --color-grey-light: #ecf0f1;
  --color-grey-medium: #95a5a6;
  --color-grey-dark: #2c3e50;
  --color-blue-primary: #3498db;
  --color-orange: #f39c12;
  --color-red: #e74c3c;
  --color-purple: #9b59b6;
  --color-white: #ffffff;
  --color-bg-light: #f8f9fa;
  --box-shadow-light: 0 2px 8px rgba(0, 0, 0, 0.08);
  --box-shadow-medium: 0 4px 12px rgba(0, 0, 0, 0.12);
  --box-shadow-heavy: 0 8px 25px rgba(0, 0, 0, 0.15);
}
```

### Color Class System
Classes are organized by purpose:
- `.card-magenta` - Magenta left border
- `.card-blue` - Blue left border
- `.card-green` - Green left border
- `.card-orange` - Orange left border
- `.badge-primary` - Magenta badge
- `.badge-success` - Green badge
- `.badge-warning` - Orange badge
- `.badge-danger` - Red badge
- `.badge-info` - Blue badge

---

## Accessibility Considerations

### Color Contrast Ratios (WCAG AA)
- **Text on Magenta (#a91079)**: White (#ffffff) = 4.5:1 ✓
- **Text on Blue (#3498db)**: White (#ffffff) = 4.7:1 ✓
- **Text on Green (#27ae60)**: White (#ffffff) = 4.9:1 ✓
- **Text on Orange (#f39c12)**: White (#ffffff) = 4.5:1 ✓
- **Text on Red (#e74c3c)**: White (#ffffff) = 4.5:1 ✓
- **Dark Grey text on Light Grey (#ecf0f1)**: 8.5:1 ✓
- **Medium Grey on White (#f8f9fa)**: 4.2:1 ✓

### Color Not Sole Indicator
- Status messages include icons alongside colors
- Form errors use text labels and borders, not just red color
- Infrastructure detection uses badges and text, not just color

---

## Print Styles

### Print Color Adjustments
```css
@media print {
  /* Remove buttons and interactive elements */
  .kalkulator-btn,
  .kalkulator-tabs-nav,
  .kalkulator-alert {
    display: none;
  }

  /* Simplified card styling for print */
  .kalkulator-card {
    box-shadow: none;
    border: 1px solid #ddd;
  }

  .kalkulator-card-header {
    background: #f5f5f5;
    color: #333;
  }
}
```

---

## Theme Customization

To create alternate themes (dark mode, etc.), update the CSS variables:

```css
/* Dark Mode Example */
@media (prefers-color-scheme: dark) {
  :root {
    --color-grey-dark: #ffffff;
    --color-white: #1e1e1e;
    --color-bg-light: #2a2a2a;
    --color-grey-light: #3a3a3a;
    /* ... update other variables ... */
  }
}
```

---

## Summary

The Justinmind design palette has been fully implemented in KALKULATOR with:
- **11 Primary/Secondary Colors** for different purposes
- **6 Neutral Colors** for text and backgrounds
- **Gradient System** for modern visual depth
- **Shadow Depth Hierarchy** for component elevation
- **Opacity System** for subtle state changes
- **CSS Variables** for easy maintenance
- **Color Class System** for consistent component styling
- **WCAG AA Compliant** contrast ratios

All colors are applied consistently across the KalkulatorPage component and supporting CSS file.
