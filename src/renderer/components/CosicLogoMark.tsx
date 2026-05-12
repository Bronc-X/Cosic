import { useId } from 'react';

interface CosicLogoMarkProps {
  className?: string;
}

const glyphs = {
  C: ['11111', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['11111', '10001', '10001', '10001', '10001', '10001', '11111'],
  S: ['11111', '10000', '10000', '11111', '00001', '00001', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111']
} as const;

const logoLetters = ['C', 'O', 'S', 'I', 'C'] as const;
const cellSize = 6;
const cellStep = 9;
const letterGap = 10;
const glyphColumns = 5;
const glyphWidth = (glyphColumns - 1) * cellStep + cellSize;
const glyphHeight = 6 * cellStep + cellSize;
const paddingX = 7;
const paddingY = 6;
const viewWidth = paddingX * 2 + logoLetters.length * glyphWidth + (logoLetters.length - 1) * letterGap;
const viewHeight = paddingY * 2 + glyphHeight;

const cells = logoLetters.flatMap((letter, letterIndex) => {
  const glyph = glyphs[letter];
  const letterX = paddingX + letterIndex * (glyphWidth + letterGap);

  return glyph.flatMap((row, rowIndex) =>
    [...row].flatMap((value, columnIndex) =>
      value === '1'
        ? [
            {
              id: `${letter}-${letterIndex}-${rowIndex}-${columnIndex}`,
              x: letterX + columnIndex * cellStep,
              y: paddingY + rowIndex * cellStep
            }
          ]
        : []
    )
  );
});

export function CosicLogoMark({ className }: CosicLogoMarkProps) {
  const glowId = useId().replace(/:/g, '');
  const classNames = ['cosic-logo-mark', className].filter(Boolean).join(' ');

  return (
    <div className={classNames} role="img" aria-label="Cosic logo">
      <svg
        className="cosic-logo-svg"
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter id={`${glowId}-pixel-glow`} x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="cosic-logo-pixel-glow" filter={`url(#${glowId}-pixel-glow)`}>
          {cells.map((cell, index) => (
            <rect
              key={`glow-${cell.id}`}
              x={cell.x}
              y={cell.y}
              width={cellSize}
              height={cellSize}
              rx="1.2"
              style={{ animationDelay: `${index * 8}ms` }}
            />
          ))}
        </g>
        <g className="cosic-logo-pixel-core">
          {cells.map((cell, index) => (
            <rect
              key={cell.id}
              x={cell.x}
              y={cell.y}
              width={cellSize}
              height={cellSize}
              rx="1.2"
              style={{ animationDelay: `${index * 8}ms` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
