# Directive 04 — Reports & Analytics

## Responsibility
Own `app/src/pages/ReportsPage.jsx`, `MatchSummaryPage.jsx`, all `app/src/components/charts/`, `CourtHeatMap.jsx`, and `app/src/stats/export.js`.

## Report Pages

### MatchSummaryPage
- Final score + set scores header
- Tabs: Serving | Passing | Attacking | Blocking | Defense | Rotation
- Each tab shows a sortable player stat table for that category
- Export bar: Download PDF | Download CSV

### ReportsPage
Filters: team, season, date range, player (optional)

Tabs:
1. **Team Stats** — aggregate team stats table + trend line chart (recharts LineChart)
2. **Player Stats** — sortable multi-stat player table across selected matches
3. **Rotation Analysis** — sideout% per rotation as RadarChart + table
4. **Heat Map** — attack landing zones as CourtHeatMap

## Chart Components

### TrendLineChart (Recharts LineChart)
- X axis: match dates
- Y axis: selected stat (hitting%, ace%, etc.)
- Multiple series: one per player or team

### RotationRadarChart (Recharts RadarChart)
- 6 axes, one per rotation
- Metrics: sideout%, points per rotation
- Two series: ours vs opponent sideout%

### HittingBarChart (Recharts BarChart)
- X: players
- Y: hitting%
- Color-coded: green > .250, yellow .100–.250, red < .100

### SideoutPieChart (Recharts PieChart)
- Slices: sideout win vs loss

### CourtHeatMap
- SVG court overlay
- Zone color intensity = frequency (log scale for readability)
- Toggles: attack kills | attack errors | serve aces | serve errors | dig locations

## Export

### PDF (jsPDF + jsPDF-autoTable)
- Page 1: Match header, set scores, team totals
- Page 2: Individual player stat table
- Page 3: Rotation analysis
- CourtHeatMap SVG → canvas → embedded image

### CSV (PapaParse)
- One row per player per match
- All stat categories as columns
- Unparse with headers

## Rules
- Never make fetch/API calls for data — all from Dexie
- Charts must be responsive (ResponsiveContainer from recharts)
- Export buttons disabled while data is loading
