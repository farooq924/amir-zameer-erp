import { formatPhone } from '@az/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCan } from '@/hooks/use-permission';
import { api } from '@/services/api';
import type { Customer, Paginated } from '@/types';
import { cn } from '@/utils/cn';

/** Header search. Finds customers by name, code or mobile; more record types join as their modules are built. */
export function GlobalSearch({ className }: { className?: string }) {
  const can = useCan();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const enabled = can('customers', 'VIEW');

  useEffect(() => { const t = setTimeout(() => setDebounced(term.trim()), 250); return () => clearTimeout(t); }, [term]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => api.get<Paginated<Customer>>('/customers', { search: debounced, pageSize: 6 }),
    enabled: enabled && debounced.length >= 2,
  });
  const rows = results.data?.data ?? [];

  if (!enabled) return null;

  const go = (path: string) => { setOpen(false); setTerm(''); inputRef.current?.blur(); navigate(path); };

  return (
    <div className={cn('relative w-full max-w-md', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
          if (e.key === 'Enter' && term.trim()) go(rows[active] ? `/customers/${rows[active].id}` : `/customers?search=${encodeURIComponent(term.trim())}`);
        }}
        placeholder="Search customers by name, code or mobile..."
        aria-label="Search"
        className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-16 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">Ctrl + K</kbd>
      {open && debounced.length >= 2 && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border bg-popover shadow-lg">
          {results.isFetching && !rows.length ? (
            <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching...</p>
          ) : !rows.length ? (
            <p className="p-3 text-sm text-muted-foreground">No customers found for "{debounced}".</p>
          ) : (
            <ul role="listbox" aria-label="Search results">
              {rows.map((c, i) => (
                <li key={c.id} role="option" aria-selected={i === active}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(`/customers/${c.id}`)}
                    className={cn('flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm', i === active ? 'bg-accent' : 'hover:bg-muted')}>
                    <span className="min-w-0"><span className="block truncate font-medium">{c.name}</span><span className="block text-xs text-muted-foreground">{c.code}</span></span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatPhone(c.mobile)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">Press Enter to open, or search all customers.</p>
        </div>
      )}
    </div>
  );
}
