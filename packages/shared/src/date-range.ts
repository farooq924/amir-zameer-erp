export const DATE_RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom Range' },
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number]['key'];

export const BUSINESS_TIMEZONE = 'Asia/Karachi';
export const BUSINESS_CURRENCY = 'PKR';
