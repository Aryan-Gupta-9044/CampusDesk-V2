# Theme (light / dark) and colours

* Switch themes from the sun/moon button in the top bar, on the login pages, or **Settings → Appearance** (Light / Dark / Match device). The choice is saved in the browser; "Match device" follows the OS setting live.
* The saved theme is applied by a tiny script in `index.html` *before* the first paint, so dark mode never flashes white.
* Printing (Academic Report, receipts) is always light, so paper output stays readable.
* **All colours live in two blocks at the top of `src/styles/theme.css`** (`:root` = light, `:root[data-theme="dark"]` = dark). Change a value there and the whole app, including charts, follows. No colour is hardcoded in components.

## Palette
Warm paper background with a sage-teal primary, plus accents used consistently:

| Token | Use |
|---|---|
| `--primary` (sage teal) | main actions, active navigation, attendance/score highlights |
| `--chart-2` terracotta · `--chart-3` honey · `--chart-4` lavender · `--chart-5` sky · `--chart-6` rose | chart series, KPI top-borders, sidebar section icons, avatars, event types |
| `--success / --warning / --danger / --info` (+ `-bg`) | status badges and notices (always shown with text, never colour alone) |

Contrast was checked against WCAG AA in both themes (body text ≥ 7:1; muted text, status text and primary-on-surface ≥ 4.5:1).
Fonts: Plus Jakarta Sans (UI) and Fraunces (headings), loaded from Google Fonts with system fallbacks.
