# Source Shape Picker Implementation Plan

**Goal:** Insert a selected Mermaid flowchart shape at the source cursor.

**Architecture:** ShapePicker owns the catalog and its compact search/collapse UI. Editor owns the CodeMirror transaction, ID allocation, label selection and focus. Existing document state and Preview consume changes through onChange.

**Tech Stack:** React, CodeMirror 6, inline SVG, Mermaid 11, Docker Compose.

- [x] Add `src/shapes.js` with named shape syntax, label offsets and flowchart detection.
- [x] Add `src/ShapePicker.jsx` with SVG previews, search, collapse and accessible insertion buttons.
- [x] Update `src/Editor.jsx` to insert at the current selection, allocate unused IDs, select the label and isolate undo history.
- [x] Add bounded responsive panel styling to `src/styles.css` and describe insertion in README.
- [x] Build and redeploy Docker Compose; inspect container health and HTTP response.

Production build completed; Docker service is healthy and port 3010 returns HTTP 200. Browser interaction was not inspected because no browser provider was available in this session.
