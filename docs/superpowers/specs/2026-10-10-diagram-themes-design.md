# Diagram themes

Offer twelve diagram palettes: existing Default, Neutral, Forest and Dark, plus Ocean, Mint, Paper, Sunset, Lavender, Midnight, Nord and Dracula. Custom palettes use Mermaid's base theme and explicit contrasting node, line, label, note and chart colors. Each palette defines a preview background and grid color. Theme changes trigger rendering even with auto-render disabled. Application chrome keeps its existing cyan palette.

Use a colored SVG background rectangle covering the viewBox so SVG exports retain the background. PNG defaults to the current diagram background, with white, dark and transparent overrides that replace or remove the SVG rectangle before rasterization. Preserve current preferences and theme IDs. Existing source-level Mermaid styles take precedence for the nodes they explicitly style.

Validate palette configuration with Mermaid, SVG background extent/override handling, preview scope and theme changes in a simulated DOM. Build locally, push and redeploy the frontend while preserving server authentication, SQLite and restart=always. Continue directly per the user's existing instruction.
