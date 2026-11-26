import { DATE_RANGE_PRESETS, type DateRangePreset } from '@az/shared';
import { Input, NativeSelect } from '@/components/ui/input';

export interface RangeValue {
  preset: DateRangePreset;
  from?: string;
  to?: string;
}

export function DateRangeFilter({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label="Date range"
        className="w-40"
        value={value.preset}
        onChange={(e) => onChange({ ...value, preset: e.target.value as DateRangePreset })}
      >
        {DATE_RANGE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </NativeSelect>
      {value.preset === 'custom' && (
        <>
          <Input type="date" aria-label="From date" className="w-40" value={value.from ?? ''} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" aria-label="To date" className="w-40" value={value.to ?? ''} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </>
      )}
    </div>
  );
}
