# Mermaid Studio

Build a local-first React Mermaid editor served by nginx in Docker on port 3010. Use a dark, restrained workspace with a document sidebar, CodeMirror source editor and bright diagram canvas. No backend or accounts are needed; documents autosave to this browser's localStorage.

Features: named documents with create/rename/duplicate/delete, debounced Mermaid rendering and useful syntax errors, editor history/search/completion, diagram templates, zoom/pan/fit/fullscreen, themes and backgrounds, SVG/PNG/source exports, source import, share links containing encoded source, shortcuts and responsive panes. Mermaid uses strict security and all dependencies are bundled. Export the actual rendered SVG; PNG uses a canvas with configurable resolution and background. Failures in storage or clipboard produce actionable messages.

Architecture: App owns document and UI state. Editor owns CodeMirror. Preview owns rendering and viewport. Templates and file utilities are separate. Persist documents and preferences locally, and recognize shared source on startup. Docker Compose publishes 3010:80 and restarts the app automatically.

The user requested direct execution without questions, so design and implementation choices are resolved autonomously.
