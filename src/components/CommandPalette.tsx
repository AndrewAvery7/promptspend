import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  label: string;
  kind: string;
  run: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

const MAX_RESULTS = 9;

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? commands.filter((command) => `${command.label} ${command.kind}`.toLowerCase().includes(needle))
      : commands;
    return matches.slice(0, MAX_RESULTS);
  }, [commands, query]);

  /**
   * Focus goes into the palette on open and back where it came from on close.
   * Dropping it on `<body>` instead means a keyboard user who presses Escape
   * has to tab from the top of the document to get back to what they were
   * doing — the dialog is only usable if it hands focus back.
   */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // Tab stays inside the dialog. `aria-modal` tells a screen reader the rest of
  // the page is inert; this makes that true for the keyboard as well.
  useEffect(() => {
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !boxRef.current) return;
      const focusable = boxRef.current.querySelectorAll<HTMLElement>(
        'input, button:not([disabled]), a[href]',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onTab);
    return () => document.removeEventListener('keydown', onTab);
  }, []);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected((index) => Math.min(index + 1, results.length - 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected((index) => Math.max(index - 1, 0));
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const command = results[selected];
        if (command) {
          command.run();
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [results, selected, onClose]);

  return (
    <div
      className="cmdk"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cmdk__box" ref={boxRef}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Type a command or model name…"
          aria-label="Search commands"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="cmdk__list" role="listbox" aria-label="Commands">
          {results.length === 0 && (
            <li className="cmdk__item">
              <span className="marker">·</span> No matches
            </li>
          )}
          {results.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                className="cmdk__item"
                role="option"
                aria-selected={index === selected}
                onMouseEnter={() => setSelected(index)}
                onClick={() => {
                  command.run();
                  onClose();
                }}
              >
                <span className="marker">▸</span>
                {command.label}
                <span className="kind">{command.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
