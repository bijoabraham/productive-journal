import Card from './Card';

interface BrainDumpPanelProps {
  value: string;
  onChange: (value: string) => void;
  /** Persists the debounced edit immediately when focus leaves. */
  onBlur?: () => void;
}

/**
 * Column 3, top. Spec §4.5 / UI spec §3: a large multiline area with a
 * transparent background and no visible borders inside the card.
 */
export default function BrainDumpPanel({ value, onChange, onBlur }: BrainDumpPanelProps) {
  return (
    <Card title="Brain Dump" className="min-h-0 flex-[3]">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="Ideas, meeting notes, thoughts…"
        spellCheck={false}
        aria-label="Brain dump"
        className="block h-full w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-body placeholder:text-faint focus:outline-none"
      />
    </Card>
  );
}
