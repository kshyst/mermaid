// Flowchart syntax: https://mermaid.js.org/syntax/flowchart.html
export const shapes = [
  { name: 'Rectangle', label: 'Process', kind: 'rectangle', open: '[', close: ']' },
  { name: 'Rounded', label: 'Event', kind: 'rounded', open: '(', close: ')' },
  { name: 'Stadium', label: 'Start or end', kind: 'stadium', open: '([', close: '])' },
  { name: 'Decision', label: 'Decision', kind: 'diamond', open: '{', close: '}' },
  { name: 'Database', label: 'Database', kind: 'cylinder', open: '[(', close: ')]' },
  { name: 'Subroutine', label: 'Subroutine', kind: 'subroutine', open: '[[', close: ']]' },
  { name: 'Circle', label: 'Circle', kind: 'circle', open: '((', close: '))' },
  { name: 'Double circle', label: 'Stop', kind: 'double-circle', open: '(((', close: ')))' },
  { name: 'Hexagon', label: 'Preparation', kind: 'hexagon', open: '{{', close: '}}' },
  { name: 'Asymmetric', label: 'Step', kind: 'asymmetric', open: '>', close: ']' },
  { name: 'Parallelogram', label: 'Input or output', kind: 'parallelogram', open: '[/', close: '/]' },
  { name: 'Reverse slant', label: 'Input or output', kind: 'reverse-slant', open: '[\\', close: '\\]' },
  { name: 'Trapezoid', label: 'Priority action', kind: 'trapezoid', open: '[/', close: '\\]' },
  { name: 'Reverse trapezoid', label: 'Manual operation', kind: 'reverse-trapezoid', open: '[\\', close: '/]' },
  { name: 'Document', label: 'Document', kind: 'document', shape: 'doc' },
  { name: 'Cloud', label: 'Cloud', kind: 'cloud', shape: 'cloud' },
  { name: 'Delay', label: 'Delay', kind: 'delay', shape: 'delay' },
  { name: 'Manual input', label: 'Manual input', kind: 'manual-input', shape: 'sl-rect' },
  { name: 'Junction', label: 'Junction', kind: 'junction', shape: 'f-circ' },
  { name: 'Triangle', label: 'Extract', kind: 'triangle', shape: 'tri' },
];

export function shapeSnippet(shape, id) {
  const text = shape.shape
    ? `${id}@{ shape: ${shape.shape}, label: "${shape.label}" }`
    : `${id}${shape.open}"${shape.label}"${shape.close}`;
  return { text, labelFrom: text.indexOf('"') + 1, labelTo: text.indexOf('"') + 1 + shape.label.length };
}

export function unusedNodeId(source) {
  const used = new Set(source.match(/\bnode\d+\b/g) || []);
  let index = 1;
  while (used.has(`node${index}`)) index++;
  return `node${index}`;
}

export function supportsFlowchartShapes(source) {
  const body = source.replace(/^\uFEFF/, '').replace(/^\s*---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '');
  const declaration = body.split('\n').find(line => line.trim() && !line.trim().startsWith('%%'));
  return !source.trim() || /^\s*(?:flowchart|graph)\b/.test(declaration || '');
}
