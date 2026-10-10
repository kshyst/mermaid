function palette(id, name, background, primary, secondary, tertiary, text, border, line, dark, colors) {
  return { id, name, dark, background, grid: dark ? '#ffffff18' : '#00000012', config: {
    theme: 'base',
    themeVariables: {
      darkMode: dark, background, primaryColor: primary, secondaryColor: secondary, tertiaryColor: tertiary,
      primaryTextColor: text, secondaryTextColor: text, tertiaryTextColor: text, textColor: text,
      primaryBorderColor: border, secondaryBorderColor: border, tertiaryBorderColor: border,
      lineColor: line, mainBkg: primary, nodeBorder: border, nodeTextColor: text,
      clusterBkg: tertiary, clusterBorder: border, edgeLabelBackground: background, titleColor: text,
      noteBkgColor: secondary, noteTextColor: text, noteBorderColor: border,
      actorBkg: primary, actorBorder: border, actorTextColor: text, actorLineColor: line,
      signalColor: line, signalTextColor: text, labelBoxBkgColor: primary, labelBoxBorderColor: border,
      labelTextColor: text, loopTextColor: text, activationBkgColor: secondary, activationBorderColor: border,
      sequenceNumberColor: background, pieTitleTextColor: text, pieSectionTextColor: dark ? '#111827' : '#ffffff', pieLegendTextColor: text,
      pieStrokeColor: background, pieOuterStrokeColor: border, git0: colors[0], git1: colors[1], git2: colors[2],
      gitBranchLabel0: dark ? '#111827' : '#ffffff', gitBranchLabel1: dark ? '#111827' : '#ffffff',
      gitBranchLabel2: dark ? '#111827' : '#ffffff', gitCommitLabelColor: text, gitCommitLabelBackground: background,
      cScale0: primary, cScale1: secondary, cScale2: tertiary,
      cScaleLabel0: text, cScaleLabel1: text, cScaleLabel2: text,
      ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`pie${index + 1}`, colors[index % colors.length]])),
      xyChart: { backgroundColor: background, titleColor: text, xAxisLabelColor: text, xAxisTitleColor: text,
        xAxisTickColor: line, xAxisLineColor: line, yAxisLabelColor: text, yAxisTitleColor: text,
        yAxisTickColor: line, yAxisLineColor: line, plotColorPalette: colors.join(',') },
    },
  } };
}

export const diagramThemes = [
  { id: 'default', name: 'Default', dark: false, background: '#fafafa', grid: '#d9d8e0', config: { theme: 'default' } },
  { id: 'neutral', name: 'Neutral', dark: false, background: '#ffffff', grid: '#dddddd', config: { theme: 'neutral' } },
  { id: 'forest', name: 'Forest', dark: false, background: '#f0fdf4', grid: '#c6decb', config: { theme: 'forest' } },
  palette('ocean', 'Ocean', '#eff8ff', '#dbeafe', '#cffafe', '#e0f2fe', '#12304b', '#3683a3', '#34647d', false, ['#0369a1','#0e7490','#1d4ed8','#0f766e','#075985','#155e75']),
  palette('mint', 'Mint', '#edfdf4', '#c5f3d8', '#d1fae5', '#e4f8ed', '#123c2a', '#39976a', '#286c4e', false, ['#15803d','#047857','#0f766e','#4d7c0f','#166534','#065f46']),
  palette('paper', 'Paper', '#fbf4e8', '#f0e2c9', '#faeacd', '#f7eddb', '#493927', '#a88b65', '#776047', false, ['#a16207','#b45309','#78716c','#854d0e','#9a3412','#92400e']),
  palette('sunset', 'Sunset', '#fff2ed', '#fed7aa', '#fecdd3', '#ffedd5', '#6c2d26', '#db7860', '#b35141', false, ['#c2410c','#e11d48','#b45309','#9a3412','#be123c','#92400e']),
  palette('lavender', 'Lavender', '#f5f0ff', '#e9d5ff', '#ddd6fe', '#f3e8ff', '#40265e', '#a078cb', '#80569d', false, ['#9333ea','#7c3aed','#c026d3','#4f46e5','#7e22ce','#6d28d9']),
  { id: 'dark', name: 'Dark', dark: true, background: '#1f2020', grid: '#ffffff18', config: { theme: 'dark' } },
  palette('midnight', 'Midnight', '#0f172a', '#1e3a5f', '#164e63', '#1e293b', '#e2f3ff', '#38bdf8', '#a5d8f3', true, ['#38bdf8','#22d3ee','#818cf8','#2dd4bf','#a78bfa','#60a5fa']),
  palette('nord', 'Nord', '#2e3440', '#434c5e', '#3b4252', '#4c566a', '#eceff4', '#88c0d0', '#a6c9d3', true, ['#88c0d0','#81a1c1','#a3be8c','#ebcb8b','#b48ead','#d08770']),
  palette('dracula', 'Dracula', '#282a36', '#44475a', '#3c3f54', '#343746', '#f8f8f2', '#bd93f9', '#8be9fd', true, ['#bd93f9','#ff79c6','#8be9fd','#50fa7b','#ffb86c','#f1fa8c']),
];

export function getDiagramTheme(id) {
  return diagramThemes.find(theme => theme.id === id) || diagramThemes[0];
}

export function mermaidThemeConfig(id) {
  return structuredClone(getDiagramTheme(id).config);
}

export function applySvgBackground(svg, color) {
  for (const child of Array.from(svg.children)) {
    if (child.getAttribute('data-diagram-background') === 'true') child.remove();
  }
  svg.style.backgroundColor = color;
  if (color === 'transparent') return;
  const values = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  const box = values?.length === 4 && values.every(Number.isFinite)
    ? values : [0, 0, parseFloat(svg.getAttribute('width')) || 1200, parseFloat(svg.getAttribute('height')) || 800];
  const rect = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('data-diagram-background', 'true');
  for (const [key, value] of Object.entries({ x: box[0], y: box[1], width: box[2], height: box[3], fill: color })) rect.setAttribute(key, String(value));
  rect.setAttribute('stroke', 'none');
  rect.style.fill = color;
  rect.style.stroke = 'none';
  rect.setAttribute('pointer-events', 'none');
  svg.insertBefore(rect, svg.firstChild);
}
