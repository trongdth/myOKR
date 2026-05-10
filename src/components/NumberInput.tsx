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
  return (
    <input
      type="number"
      className={className}
      value={value}
      min={min}
      max={max}
      onClick={(e) => {
        if (stopPropagation) {
          e.stopPropagation();
        }
      }}
      onChange={(e) => {
        const parsed = parseInt(e.target.value);
        if (!isNaN(parsed)) {
          onChange(parsed);
        }
      }}
      title={title}
    />
  );
}
