# Source shape picker

Add a collapsible panel immediately beneath CodeMirror, above the source status footer. Display searchable flowchart shapes with small SVG previews, names, and syntax in their tooltips. Include the classic Mermaid flowchart shapes plus document, cloud, delay, preparation, manual input and junction shapes supported by Mermaid 11.

The picker calls a local Editor insertion function rather than replacing the document through React. Use the current CodeMirror selection as the insertion range, generate the first unused nodeN identifier, and select the new node's label so the user can type immediately. Preserve the selection when clicking with a pointer; return focus to CodeMirror for both pointer and keyboard activation. Insertion is a separate undoable transaction and flows through the existing onChange, autosave and live rendering paths.

Enable the picker for graph/flowchart documents and empty source. For other diagram types show a brief flowchart-only explanation and disabled shapes. Recognize flowchart declarations after comments and YAML frontmatter. Keep the panel height bounded so the source remains editable on small screens. Rebuild the Docker service on port 3010.

For empty source, insert a flowchart declaration before the first shape so the result is a valid diagram.

The user's existing instruction requests direct implementation without questions. No additional approval gate is used.
