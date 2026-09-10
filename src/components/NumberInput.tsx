import { useState, useEffect } from 'react';

export interface NumberInputProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
  className?: string;
  title?: string;
  stopPropagation?: boolean;
}

export default function NumberInput({
  value,
  min,
  max,
  onChange,
  className,
  title,
  stopPropagation,
}: NumberInputProps) {
  const [internalValue, setInternalValue] = useState<string>(value.toString());

  useEffect(() => {
    setInternalValue(value.toString());
  }, [value]);

  return (
    <input
      type="number"
      className={className}
      value={internalValue}
      min={min}
      max={max}
      onClick={(e) => {
        if (stopPropagation) {
          e.stopPropagation();
        }
      }}
      onChange={(e) => {
        setInternalValue(e.target.value);
        const parsed = parseInt(e.target.value);
        if (!isNaN(parsed)) {
          onChange(parsed);
        }
      }}
      onBlur={() => {
        if (internalValue === '') {
          setInternalValue(value.toString());
        }
      }}
      title={title}
    />
  );
}
