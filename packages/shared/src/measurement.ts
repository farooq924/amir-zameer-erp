export const MEASUREMENT_UNITS = ['INCH', 'CM'] as const;
export type MeasurementUnitCode = (typeof MEASUREMENT_UNITS)[number];

export const GARMENT_CATEGORIES = [
  { key: 'SHALWAR_KAMEEZ', label: 'Shalwar Kameez' },
  { key: 'WAISTCOAT', label: 'Waistcoat' },
  { key: 'FORMAL_SUIT', label: 'Formal Suit' },
  { key: 'SHIRT', label: 'Shirt' },
  { key: 'TROUSER', label: 'Trouser' },
  { key: 'PANT', label: 'Pant' },
  { key: 'KURTA', label: 'Kurta' },
  { key: 'CUSTOM', label: 'Custom Garment' },
] as const;

export interface TemplateSeed {
  code: string;
  name: string;
  garmentCategory: (typeof GARMENT_CATEGORIES)[number]['key'];
  fields: { key: string; label: string; required?: boolean }[];
}

const f = (label: string, required = false) => ({
  key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  label,
  required,
});

/** Default measurement templates seeded into the database (owner can edit them later). */
export const DEFAULT_MEASUREMENT_TEMPLATES: TemplateSeed[] = [
  {
    code: 'SHALWAR_KAMEEZ', name: 'Shalwar Kameez', garmentCategory: 'SHALWAR_KAMEEZ',
    fields: [f('Length', true), f('Shoulder', true), f('Chest', true), f('Waist'), f('Hip'), f('Sleeve Length', true), f('Armhole'),
      f('Neck'), f('Cuff'), f('Shalwar Length', true), f('Shalwar Waist'), f('Bottom Opening')],
  },
  {
    code: 'WAISTCOAT', name: 'Waistcoat', garmentCategory: 'WAISTCOAT',
    fields: [f('Length', true), f('Chest', true), f('Waist'), f('Shoulder', true), f('Neck'), f('Armhole')],
  },
  {
    code: 'FORMAL_SUIT', name: 'Formal Suit', garmentCategory: 'FORMAL_SUIT',
    fields: [f('Coat Length', true), f('Shoulder', true), f('Chest', true), f('Waist', true), f('Hip'), f('Sleeve Length', true), f('Armhole'),
      f('Neck'), f('Trouser Length', true), f('Trouser Waist', true), f('Thigh'), f('Knee'), f('Bottom')],
  },
  {
    code: 'SHIRT', name: 'Shirt', garmentCategory: 'SHIRT',
    fields: [f('Length', true), f('Chest', true), f('Shoulder', true), f('Sleeve', true), f('Collar', true), f('Cuff'), f('Waist')],
  },
  {
    code: 'TROUSER', name: 'Trouser', garmentCategory: 'TROUSER',
    fields: [f('Length', true), f('Waist', true), f('Hip'), f('Thigh'), f('Knee'), f('Bottom'), f('Rise')],
  },
  {
    code: 'PANT', name: 'Pant', garmentCategory: 'PANT',
    fields: [f('Length', true), f('Waist', true), f('Hip'), f('Thigh'), f('Knee'), f('Bottom'), f('Rise')],
  },
  {
    code: 'KURTA', name: 'Kurta', garmentCategory: 'KURTA',
    fields: [f('Length', true), f('Shoulder', true), f('Chest', true), f('Waist'), f('Hip'), f('Sleeve Length', true), f('Armhole'), f('Neck'), f('Cuff')],
  },
  { code: 'CUSTOM', name: 'Custom Garment', garmentCategory: 'CUSTOM', fields: [f('Length'), f('Chest'), f('Waist')] },
];

/** Exact conversion factor (1 inch = 2.54 cm). */
export const CM_PER_INCH = 2.54;
