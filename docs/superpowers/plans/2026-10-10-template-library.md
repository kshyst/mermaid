# Template Library Implementation Plan

**Goal:** Fix template creation over HTTP and provide thirty complete, diverse examples.

**Architecture:** A shared ID helper generates UUIDs on HTTP and HTTPS. A dedicated template dialog owns search and filtering. Existing store and editor receive complete new documents.

**Tech Stack:** React, Web Crypto, Mermaid, Vitest/jsdom, Docker Compose.

- [x] Implement HTTP UUID fallback and explicit creation failure handling.
- [x] Add twenty complete examples and a type-filtered searchable dialog with separate query state.
- [x] Make templates accessible from an empty library and show created source with live preview.
- [x] Add regression checks for HTTP creation/save, filter isolation and all Mermaid template syntax.
- [x] Build, commit and push; deploy the frontend image to the existing server without altering its database or authentication.

Validation: 38 automated checks passed, including all thirty Mermaid parsers and template selection/autosave in a simulated DOM without randomUUID. The production frontend image was loaded on the existing server; public authenticated HTML/assets/API returned 200, anonymous access returned 401, and restart policy remains always. No native browser provider was available for a manual browser check.

The empty-library regression also covers deactivating the last document and then creating another from a template.
