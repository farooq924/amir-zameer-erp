import { formatPhone } from '@az/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Search, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomerStatusBadge } from '@/features/customers/badges';
import { CustomerFormDialog } from '@/features/customers/CustomerFormDialog';
import { useCan } from '@/hooks/use-permission';
import { api } from '@/services/api';
import type { Customer, Paginated } from '@/types';
import { cn } from '@/utils/cn';
import { initials } from '@/utils/format';

export type PickedCustomer = Pick<Customer, 'id' | 'code' | 'name' | 'mobile' | 'status'> & { city?: string | null };

/** Search-as-you-type customer selector with a gold "+" to add a new customer on the spot. */
export function CustomerPicker({ value, onChange, invalid, disabled }: {
  value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void; invalid?: boolean; disabled?: boolean;
}) {
  const can = useCan();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const results = useQuery({
    queryKey: ['customers', 'picker', debounced],
    queryFn: () => api.get<Paginated<Customer>>('/customers', { search: debounced, pageSize: 8, sortBy: debounced ? 'name' : 'createdAt', sortOrder: debounced ? 'asc' : 'desc' }),
    enabled: open && !value,
  });

  if (value) {
    return (
      <div className={cn('flex items-center gap-3 rounded-lg border bg-card p-2.5', invalid && 'border-destructive')}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-gold">{initials(value.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-semibold">{value.name}{value.status !== 'ACTIVE' && <CustomerStatusBadge status={value.status} />}</span>
          <span className="block text-xs text-muted-foreground">{value.code} · {formatPhone(value.mobile)}{value.city ? ` · ${value.city}` : ''}</span>
        </span>
        {!disabled && <Button type="button" variant="ghost" size="icon" aria-label="Change customer" onClick={() => { onChange(null); setText(''); setOpen(true); }}><X /></Button>}
      </div>
    );
  }

  return (
    <div className="flex gap-2" ref={boxRef}>
      <div className="relative flex-1">
        <UserRound className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search customer by name, code or mobile" value={text} aria-label="Select customer" aria-invalid={invalid}
          onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }} />
        {open && (
          <div className="absolute inset-x-0 top-11 z-40 max-h-72 overflow-y-auto rounded-lg border bg-card shadow-lg" role="listbox">
            {results.isFetching && !results.data ? (
              <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching...</p>
            ) : !results.data?.data.length ? (
              <p className="p-3 text-sm text-muted-foreground">{debounced ? 'No customer found.' : 'Type to search.'}{can('customers', 'CREATE') && ' Use + to add a new customer.'}</p>
            ) : results.data.data.map((c) => (
              <button key={c.id} type="button" role="option" aria-selected={false} disabled={c.status === 'BLOCKED'}
                onClick={() => { onChange(c); setOpen(false); }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-soft text-xs font-semibold text-[#8a6a1f] dark:text-gold">{initials(c.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">{c.code} · {formatPhone(c.mobile)}</span>
                </span>
                {c.status !== 'ACTIVE' && <CustomerStatusBadge status={c.status} />}
              </button>
            ))}
            <div className="flex items-center gap-1 border-t px-3 py-1.5 text-[11px] text-muted-foreground"><Search className="h-3 w-3" /> Blocked customers cannot get new orders</div>
          </div>
        )}
      </div>
      {can('customers', 'CREATE') && (
        <Button type="button" size="icon" className="h-10 w-10 shrink-0" aria-label="Add new customer" onClick={() => setAddOpen(true)}><Plus /></Button>
      )}
      <CustomerFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={(c) => onChange(c)} />
    </div>
  );
}
