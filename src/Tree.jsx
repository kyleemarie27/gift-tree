import React from 'react';

// Pre-placed slots around the base of the tree, front row last so it overlaps.
const SLOTS = [
  [118, 236, 34, 30], [152, 240, 30, 26], [86, 244, 28, 24], [184, 244, 32, 28],
  [60, 250, 26, 22], [214, 250, 28, 24], [130, 258, 40, 32], [96, 264, 32, 28],
  [172, 264, 34, 30], [40, 268, 30, 26], [234, 268, 30, 26], [68, 276, 28, 22],
  [204, 278, 30, 22], [140, 284, 30, 20],
];
const WRAP = [
  ['#c8423b', '#f6d36b'], ['#3f8f5f', '#fbeee0'], ['#e5a93b', '#c8423b'], ['#6b8fd6', '#ffffff'],
  ['#d870a0', '#fff3c4'], ['#f3efe6', '#c8423b'], ['#8f63c9', '#f6d36b'], ['#2f6f8f', '#f3efe6'],
];

function Present({ x, y, w, h, i }) {
  const [box, ribbon] = WRAP[i % WRAP.length];
  return (
    <g className="present" style={{ animationDelay: `${i * 60}ms` }}>
      <rect x={x} y={y} width={w} height={h} rx="3" fill={box} stroke="rgba(0,0,0,.12)" />
      <rect x={x + w / 2 - 3} y={y} width="6" height={h} fill={ribbon} />
      <rect x={x} y={y + h / 3 - 3} width={w} height="5" fill={ribbon} />
      <path d={`M${x + w / 2} ${y} q-9 -10 -12 -2 q4 6 12 2 q9 -10 12 -2 q-4 6 -12 2`} fill={ribbon} stroke="rgba(0,0,0,.1)" />
    </g>
  );
}

export default function Tree({ count = 0, name }) {
  const shown = Math.min(count, SLOTS.length);
  const extra = count - shown;
  return (
    <div className="tree-wrap">
      <svg viewBox="0 0 280 300" className="tree" role="img"
        aria-label={`${count} ${count === 1 ? 'gift' : 'gifts'} under ${name ? name + "'s" : 'your'} tree`}>
        <ellipse cx="140" cy="286" rx="128" ry="12" fill="rgba(255,255,255,.55)" />
        <rect x="128" y="214" width="24" height="30" rx="3" fill="#8a5a3b" />
        <polygon points="140,40 210,130 70,130" fill="#2f7d4f" />
        <polygon points="140,80 232,180 48,180" fill="#2a7148" />
        <polygon points="140,120 250,226 30,226" fill="#25653f" />
        <path d="M86 120 Q140 140 196 116" stroke="#f6d36b" strokeWidth="3" fill="none" strokeDasharray="2 6" strokeLinecap="round" />
        <path d="M66 170 Q140 196 214 166" stroke="#f6d36b" strokeWidth="3" fill="none" strokeDasharray="2 6" strokeLinecap="round" />
        <path d="M48 214 Q140 240 232 210" stroke="#f6d36b" strokeWidth="3" fill="none" strokeDasharray="2 6" strokeLinecap="round" />
        {[[112, 104, '#c8423b'], [160, 98, '#6b8fd6'], [92, 154, '#e5a93b'], [140, 160, '#d870a0'], [190, 150, '#c8423b'],
          [70, 204, '#6b8fd6'], [118, 206, '#c8423b'], [166, 210, '#e5a93b'], [212, 198, '#d870a0']].map(([cx, cy, f], i) => (
          <circle key={i} cx={cx} cy={cy} r="6" fill={f} className="ornament" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
        <polygon className="star" fill="#f6c23e" stroke="#e0a520" strokeWidth="1.5"
          points="140,14 146,30 163,30 149,40 154,56 140,46 126,56 131,40 117,30 134,30" />
        {SLOTS.slice(0, shown).map(([x, y, w, h], i) => <Present key={i} x={x} y={y} w={w} h={h} i={i} />)}
      </svg>
      <div className="tree-caption">
        {count === 0 && <>No presents under the tree yet… 🎄</>}
        {count > 0 && <><strong>{count}</strong> {count === 1 ? 'present' : 'presents'} under the tree{extra > 0 ? ` (+${extra} hiding in the back)` : ''}</>}
      </div>
    </div>
  );
}
