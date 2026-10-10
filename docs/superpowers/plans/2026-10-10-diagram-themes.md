# Diagram Themes Implementation Plan

**Goal:** Provide twelve diagram palettes with matching preview and export backgrounds.

**Architecture:** A shared theme catalog configures Mermaid, the preview canvas and export backgrounds. UI preferences keep the existing theme IDs.

- [x] Add eight custom palettes and compatible existing presets.
- [x] Apply theme variables and canvas grid/background colors in Preview.
- [x] Preserve backgrounds in SVG and support theme/white/dark/transparent PNG options.
- [x] Verify theme configuration, preview changes, and export background overrides.
- [ ] Build locally, push, and redeploy both Docker frontends.

Validation: automated checks cover all twelve Mermaid configurations, persisted theme selection, diagram-only canvas changes, explicit SVG backgrounds with nonzero viewBox, transparent/white overrides and PNG default selection. These UI checks use a simulated DOM, with Mermaid SVG rendering stubbed for geometry.
