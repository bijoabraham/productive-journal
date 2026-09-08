import { useState, type KeyboardEvent } from 'react';

interface AddItemInputProps {
  placeholder: string;
  onAdd: (text: string) => void;
  /** When false the field is hidden — used when a per-day cap is reached. */
  enabled?: boolean;
  /** Shown in place of the field when disabled. */
  disabledHint?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * A borderless "type and press Enter" field. Deliberately not a form with a
 * button: the journal is keyboard-first and the paper aesthetic has no room
 * for an Add button in every panel.
 */
export default function AddItemInput({
  placeholder,
  onAdd,
  enabled = true,
  disabledHint,
  inputRef,
}: AddItemInputProps) {
  const [value, setValue] = useState('');

  if (!enabled) {
    return <p className="pt-2 text-xs text-faint">{disabledHint}</p>;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const text = value.trim();
    if (!text) return;
    onAdd(text);
    setValue('');
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className="mt-1 w-full bg-transparent py-1.5 text-sm text-body placeholder:text-faint focus:outline-none"
    />
  );
}
