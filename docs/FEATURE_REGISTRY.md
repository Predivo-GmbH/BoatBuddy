# Feature Registry -- BoatBuddy

**Last updated:** 2026-06-02
**Codebase path:** `C:\Business\Internal Projects\BoatBuddy`
**Supabase URL:** `https://xzythvxmuxmczuiophwp.supabase.co`

## Features

| ID | Feature | E2E Test | Status |
|----|---------|----------|--------|
| AUTH-001 | PasswordGate blocks access without password | `critical-path.spec.ts:"blocks access without password"` | COVERED |
| AUTH-002 | PasswordGate grants access after correct password | `critical-path.spec.ts:"grants access after bypass"` | COVERED |
| NAV-001 | Sidebar shows all 6 nav items | `critical-path.spec.ts:"sidebar shows all 6 nav items"` | COVERED |
| NAV-002 | Navigates to each page without error | `critical-path.spec.ts:"navigates to each page without error"` | COVERED |
| NAV-003 | Bottom navigation (mobile) shows 6 items | `critical-path.spec.ts:"bottom nav shows 6 items on mobile"` | COVERED |
| NAV-004 | Dark mode toggle in sidebar | `critical-path.spec.ts:"dark mode toggle works"` | COVERED |
| NAV-005 | Mobile header with logo and dark mode toggle | `critical-path.spec.ts:"mobile header visible on small viewport"` | COVERED |
| NAV-006 | Footer shows copyright and slogan (desktop) | `critical-path.spec.ts:"footer shows copyright and slogan"` | COVERED |
| DASH-001 | Dashboard shows Bootkonto balance card | `critical-path.spec.ts:"shows hero balance card"` | COVERED |
| DASH-002 | Dashboard shows stat cards (Ausgaben, Betriebsstunden) | `critical-path.spec.ts:"shows stat cards"` | COVERED |
| DASH-003 | Dashboard quick action buttons (Fahrt loggen, Neue Ausgabe, Reservierung, Gastsession) | `critical-path.spec.ts:"shows quick action buttons"` | COVERED |
| DASH-004 | Dashboard next reservation hero card | `critical-path.spec.ts:"shows next reservation or empty state"` | COVERED |
| DASH-005 | Dashboard season overview (Ausgaben, Gast-Sessions, Stunden, Treibstoff) | `critical-path.spec.ts:"shows season overview cards"` | COVERED |
| DASH-006 | Dashboard letzte Fahrten list (recent trips) | `critical-path.spec.ts:"shows letzte Fahrten section"` | COVERED |
| DASH-007 | Dashboard letzte Ausgaben list (recent expenses) | `critical-path.spec.ts:"shows letzte Ausgaben section"` | COVERED |
| DASH-008 | Dashboard quick trip log dialog (Fahrt loggen) | `critical-path.spec.ts:"Fahrt loggen dialog opens with expected fields"` | COVERED |
| DASH-009 | Dashboard quick expense dialog (Neue Ausgabe from dashboard) | `critical-path.spec.ts:"Neue Ausgabe dialog opens from dashboard"` | COVERED |
| FIN-001 | Finanzen tab navigation (Ubersicht, Ausgaben, Beitrage) | `critical-path.spec.ts:"tab navigation works"` | COVERED |
| FIN-002 | Finanzen Ubersicht tab: KontoBilanzCard (balance display + update form) | `critical-path.spec.ts:"Ubersicht shows KontoBilanzCard"` | COVERED |
| FIN-003 | Finanzen Ubersicht tab: Ausgaben year summary card | `critical-path.spec.ts:"Ubersicht shows Ausgaben year card"` | COVERED |
| FIN-004 | Finanzen Ubersicht tab: Beitrage year summary card | `critical-path.spec.ts:"Ubersicht shows Beitrage year card"` | COVERED |
| FIN-005 | Finanzen Ubersicht tab: MonatsdiagrammChart (bar chart with year nav) | `critical-path.spec.ts:"Ubersicht shows Monatsdiagramm chart"` | COVERED |
| FIN-006 | Finanzen Ubersicht tab: KategorieChart (pie chart with year filter) | `critical-path.spec.ts:"Ubersicht shows Kategorie chart"` | COVERED |
| FIN-007 | Finanzen Ausgaben tab: AusgabenTabelle with search and category filter | `critical-path.spec.ts:"Ausgaben tab shows table with search and filter"` | COVERED |
| FIN-008 | Finanzen Ausgaben tab: AusgabeFormDialog (create new expense) | `critical-path.spec.ts:"Ausgaben tab Neue Ausgabe dialog has expected fields"` | COVERED |
| FIN-009 | Finanzen Ausgaben tab: InvoiceUpload (drag-and-drop AI extraction) | `critical-path.spec.ts:"Ausgaben tab shows invoice upload zone"` | COVERED |
| FIN-010 | Finanzen Ausgaben tab: Sortable columns (datum, betrag, kategorie) | `critical-path.spec.ts:"Ausgaben tab columns are sortable"` | COVERED |
| FIN-011 | Finanzen Beitrage tab: BeitraegeGrid with year nav and payment toggle | `critical-path.spec.ts:"Beitrage tab shows grid with year navigation"` | COVERED |
| KAL-001 | Calendar month navigation (prev/next/today) | `critical-path.spec.ts:"shows month navigation and calendar grid"` | COVERED |
| KAL-002 | Calendar month changes on navigation | `critical-path.spec.ts:"month navigation changes displayed month"` | COVERED |
| KAL-003 | Calendar grid with weekday headers and day cells | `critical-path.spec.ts:"calendar grid shows weekday headers"` | COVERED |
| KAL-004 | Calendar legend showing driver colors | `critical-path.spec.ts:"calendar shows driver legend"` | COVERED |
| KAL-005 | Calendar upcoming reservations list | `critical-path.spec.ts:"upcoming reservations section visible"` | COVERED |
| KAL-006 | Calendar ReservierungDialog opens on day click | `critical-path.spec.ts:"clicking a day opens ReservierungDialog"` | COVERED |
| KAL-007 | ReservierungDialog: driver selector, start time, duration, notiz, submit | `critical-path.spec.ts:"ReservierungDialog has all form fields"` | COVERED |
| KAL-008 | Calendar shows Swiss holidays (Feiertage) | `critical-path.spec.ts:"calendar highlights Swiss holidays"` | COVERED |
| GAST-001 | Gastsessions stats cards (per driver + total) | `critical-path.spec.ts:"shows session stats cards"` | COVERED |
| GAST-002 | GastsessionForm with guest name autocomplete, betrag, bezahlt_an, datum | `critical-path.spec.ts:"session form has expected fields"` | COVERED |
| GAST-003 | GastsessionTabelle with search, driver filter pills, year filter | `critical-path.spec.ts:"session table has search and filters"` | COVERED |
| GAST-004 | GastsessionTabelle sortable columns (datum, betrag) | `critical-path.spec.ts:"session table columns are sortable"` | COVERED |
| GAST-005 | GastsessionTabelle summary row with count and total | `critical-path.spec.ts:"session table shows summary row"` | COVERED |
| NUTZ-001 | Nutzungslog season stats (hours, fuel, trips, avg) | `critical-path.spec.ts:"shows season stats cards"` | COVERED |
| NUTZ-002 | Nutzungslog all-time stats | `critical-path.spec.ts:"shows all-time stats cards"` | COVERED |
| NUTZ-003 | BootStatsKarte (model, purchase date, total hours, editable) | `critical-path.spec.ts:"shows boot stats card"` | COVERED |
| NUTZ-004 | NutzungslogForm (date, driver, hours, fuel, expanded activities + notes) | `critical-path.spec.ts:"nutzungslog form has expected fields"` | COVERED |
| NUTZ-005 | NutzungslogForm expanded section with AktivitaetenEditor | `critical-path.spec.ts:"nutzungslog form expanded shows activities editor"` | COVERED |
| NUTZ-006 | NutzungslogTabelle with driver filter and year filter | `critical-path.spec.ts:"nutzungslog table has driver and year filters"` | COVERED |
| NUTZ-007 | NutzungslogTabelle sortable columns (datum, stunden, liter) | `critical-path.spec.ts:"nutzungslog table columns are sortable"` | COVERED |
| NUTZ-008 | NutzungslogTabelle summary row | `critical-path.spec.ts:"nutzungslog table shows summary row"` | COVERED |
| NUTZ-009 | Fuel per driver breakdown (bar chart per driver) | `critical-path.spec.ts:"shows fuel per driver breakdown"` | COVERED |
| BOOT-001 | Boot page shows 4 tabs (Eigentumer, Abrechnung, Wartung, Gentleman-Rules) | `critical-path.spec.ts:"shows 4 tabs"` | COVERED |
| BOOT-002 | Eigentumer tab shows ownership percentages | `critical-path.spec.ts:"Eigentumer tab shows ownership percentages"` | COVERED |
| BOOT-003 | Eigentumer tab: edit mode for anteil and einstieg datum | `critical-path.spec.ts:"Eigentumer tab has edit button"` | COVERED |
| BOOT-004 | Eigentumer tab: total percentage check (100% validation) | `critical-path.spec.ts:"Eigentumer tab shows total percentage"` | COVERED |
| BOOT-005 | Abrechnung tab: Bewertung & Austrittsregeln config (Marktwert, Kundigungsfrist, Beitrag) | `critical-path.spec.ts:"Abrechnung tab shows config values"` | COVERED |
| BOOT-006 | Abrechnung tab: Austrittssimulation (payout per owner) | `critical-path.spec.ts:"Abrechnung tab shows exit simulation"` | COVERED |
| BOOT-007 | Abrechnung tab: Boot-Info summary (model, date, hours) | `critical-path.spec.ts:"Abrechnung tab shows boot info"` | COVERED |
| BOOT-008 | Wartung tab shows empty state or tasks | `critical-path.spec.ts:"Wartung tab shows empty state or tasks"` | COVERED |
| BOOT-009 | Wartung tab: add new maintenance task form | `critical-path.spec.ts:"Wartung tab has Neue Aufgabe button"` | COVERED |
| BOOT-010 | Wartung tab: toggle task completion and delete | `critical-path.spec.ts:"Wartung tab tasks have toggle and delete"` | COVERED |
| BOOT-011 | Wartung tab: overdue warning banner | `critical-path.spec.ts:"Wartung tab shows overdue warning if applicable"` | COVERED |
| BOOT-012 | Gentleman-Rules tab shows real rules from data | `critical-path.spec.ts:"Gentleman-Rules tab shows real rules from Excel"` | COVERED |
| BOOT-013 | Gentleman-Rules tab: add new rule input | `critical-path.spec.ts:"Gentleman-Rules tab has add rule input"` | COVERED |
| BOOT-014 | Gentleman-Rules tab: inline edit and delete rules | `critical-path.spec.ts:"Gentleman-Rules tab rules have edit and delete"` | COVERED |
| FER-001 | Ferien eintragen button on Kalender page | `critical-path.spec.ts:"Ferien eintragen button visible on Kalender page"` | COVERED |
| FER-002 | FerienDialog opens on button click | `critical-path.spec.ts:"clicking Ferien eintragen opens FerienDialog"` | COVERED |
| FER-003 | FerienDialog has date inputs and submit button | `critical-path.spec.ts:"FerienDialog has date inputs and submit button"` | COVERED |
| FER-004 | Upcoming vacations section on Kalender page | `critical-path.spec.ts:"upcoming vacations section shows when vacations exist"` | COVERED |
| INFRA-001 | Supabase project reachable (GraphQL health check) | `critical-path.spec.ts:"Supabase project is reachable"` | COVERED |
| INFRA-002 | ErrorBoundary catches render errors | `critical-path.spec.ts:"ErrorBoundary renders fallback"` | COVERED |
| INFRA-003 | 404 page shows not-found message with link to dashboard | `critical-path.spec.ts:"404 page shows not found message"` | COVERED |
| INFRA-004 | Loading skeletons shown while data loads | `critical-path.spec.ts:"loading skeleton appears"` | COVERED |
| NEWS-001 | Neuigkeiten page shows changelog timeline grouped by month | — | NOT COVERED |
| NEWS-002 | Neuigkeiten page: add new entry form (titel, beschreibung, kategorie, datum) | — | NOT COVERED |
| NEWS-003 | Neuigkeiten page: inline edit entries | — | NOT COVERED |
| NEWS-004 | Neuigkeiten page: delete entries with confirm dialog | — | NOT COVERED |
| NEWS-005 | Dashboard NeuigkeitenCard shows 3 most recent entries | — | NOT COVERED |
| NEWS-006 | Sidebar + bottom nav show Neuigkeiten link | — | NOT COVERED |

## Summary

- **Total features:** 78
- **Covered by E2E:** 72
- **Not covered:** 6 (NEWS-001 through NEWS-006)
- **Coverage:** 92%
