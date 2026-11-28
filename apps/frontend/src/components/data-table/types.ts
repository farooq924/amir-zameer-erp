import type { ReactNode } from 'react';

export type CellValue = string | number | boolean | Date | null | undefined;

export interface DataColumn<T> {
  id: string;
  /** Header shown in the table. */
  header: ReactNode;
  /** Plain-text header for print / export (defaults to `header` when it is a string). */
  label?: string;
  /** What the cell shows. Defaults to `text(row)` or `value(row)`. */
  cell?: (row: T) => ReactNode;
  /** Raw value used for sorting and Excel export. */
  value?: (row: T) => CellValue;
  /** Text for print / CSV (defaults to the value). */
  text?: (row: T) => string;
  /** money / number values are right-aligned, sorted as numbers and exported as numbers. */
  type?: 'text' | 'number' | 'money' | 'date';
  /** Client tables: sortable by `value` (default true when `value` is set). */
  sortable?: boolean;
  /** Server tables: the backend sort field. Column is sortable only when this is set. */
  sortKey?: string;
  align?: 'left' | 'right' | 'center';
  /** Extra classes for the <td> and <th> (e.g. 'hidden md:table-cell'). */
  className?: string;
  headerClassName?: string;
  /** Leave the column out of print and export (e.g. a button column). */
  exportable?: boolean;
}

export interface SortState {
  id: string;
  desc: boolean;
}

export interface ServerPagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  example?: string;
  /** Other header names accepted for this field. */
  aliases?: string[];
}

export interface TableImporter {
  fields: ImportField[];
  /** Creates one record. Throw to report the row as failed. */
  createRow: (data: Record<string, string>) => Promise<unknown>;
  note?: string;
}

export type RowAction = 'view' | 'edit' | 'duplicate' | 'delete';
