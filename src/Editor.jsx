import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, Transaction } from '@codemirror/state';
import { indentWithTab, isolateHistory } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { autocompletion } from '@codemirror/autocomplete';
import ShapePicker from './ShapePicker';
import { shapeSnippet, unusedNodeId } from './shapes';

const language = StreamLanguage.define({
  token(stream) {
    if (stream.match(/%%.*/)) return 'comment';
    if (stream.match(/"[^"\n]*"/)) return 'string';
    if (stream.match(/\b(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|erDiagram|gantt|pie|mindmap|journey|subgraph|end|style|classDef|direction|participant|actor|Note|title|section|autonumber)\b/)) return 'keyword';
    if (stream.match(/[-=]+[<>|]?|[<>][-]+/)) return 'operator';
    if (stream.match(/[\[\]{}()]/)) return 'bracket';
    stream.next(); return null;
  },
});
const words = ['flowchart','sequenceDiagram','classDiagram','stateDiagram-v2','erDiagram','gantt','pie','mindmap','journey','subgraph','end','style','classDef','direction','participant','actor','autonumber'];
export default function Editor({ code, onChange, documentId, wrap }) {
  const host = useRef(null), view = useRef(null), callback = useRef(onChange), wrapping = useRef(new Compartment());
  callback.current = onChange;
  useEffect(() => {
    view.current = new EditorView({ doc: code, parent: host.current, extensions: [
      basicSetup, language, keymap.of([indentWithTab]),
      wrapping.current.of(wrap ? EditorView.lineWrapping : []),
      autocompletion({ override: [context => { const word = context.matchBefore(/\w*/); if (!word || (word.from === word.to && !context.explicit)) return null; return { from: word.from, options: words.map(label => ({ label, type: 'keyword' })) }; }] }),
      EditorView.updateListener.of(update => { if (update.docChanged) callback.current(update.state.doc.toString()); }),
      EditorView.theme({ '&': { height: '100%', backgroundColor: '#151619', color: '#d6d7de', fontSize: '13px' }, '.cm-scroller': { fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', lineHeight: '1.85', overflow: 'auto' }, '.cm-content': { padding: '20px 0', caretColor: 'var(--accent)' }, '.cm-gutters': { backgroundColor: '#151619', color: '#60616d', border: 'none', paddingRight: '12px' }, '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#ffffff04' }, '.cm-cursor': { borderLeftColor: 'var(--accent)' }, '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-selection)' }, '.cm-searchMatch': { backgroundColor: 'var(--accent-search)' }, '.cm-panels': { background: '#222329', color: '#ddd' }, '.cm-tooltip': { background: '#222329', border: '1px solid #383943', color: '#ddd' } }, { dark: true }),
    ] });
    return () => view.current.destroy();
  }, [documentId]);
  useEffect(() => { if (view.current && code !== view.current.state.doc.toString()) view.current.dispatch({ changes: { from: 0, to: view.current.state.doc.length, insert: code } }); }, [code]);
  useEffect(() => { view.current?.dispatch({ effects: wrapping.current.reconfigure(wrap ? EditorView.lineWrapping : []) }); }, [wrap]);
  function insertShape(shape) {
    const editor = view.current;
    if (!editor) return;
    const { from, to } = editor.state.selection.main;
    const source = editor.state.doc.toString();
    const snippet = shapeSnippet(shape, unusedNodeId(source));
    const prefix = source.trim() ? '' : 'flowchart TD\n    ';
    editor.dispatch({
      changes: { from, to, insert: prefix + snippet.text },
      selection: { anchor: from + prefix.length + snippet.labelFrom, head: from + prefix.length + snippet.labelTo },
      annotations: [Transaction.userEvent.of('input.shape'), isolateHistory.of('full')],
      scrollIntoView: true,
    });
    editor.focus();
  }
  return <>
    <div ref={host} className="code-editor" aria-label="Mermaid source editor" />
    <ShapePicker source={code} onInsert={insertShape}/>
  </>;
}
