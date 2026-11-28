import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/data-table/DataTable';
import { StatCard } from '@/features/dashboard/StatCard';
import { DateRange, monthStartPK, todayPK } from '@/features/finance/shared';
import { api, errorMessage } from '@/services/api';
import type { AccountLedger } from '@/types/finance';
import { cn } from '@/utils/cn';
import { formatDate, formatPKR } from '@/utils/format';
import { JournalDialog } from './AccountingPage';

/** Statement of one account: opening balance, every posted line and the running balance. */
type LedgerRow = AccountLedger['entries'][number];

export function AccountLedgerPage() {
  const { id = '' } = useParams();
  const [from, setFrom] = useState(monthStartPK());
  const [to, setTo] = useState(todayPK());
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['accounting', 'ledger', id, from, to], queryFn: () => api.get<AccountLedger>(`/accounting/accounts/${id}/ledger`, { from, to }), enabled: !!from && !!to });
  const a = q.data?.account;
  return (
    <div>
      <PageHeader title={a ? `${a.code} ${a.name}` : 'Account ledger'} description={a ? `${a.subTypeLabel ?? a.type} · ${formatDate(from)} to ${formatDate(to)}` : undefined}
        actions={<div className="no-print flex gap-2"><Button variant="outline" asChild><Link to="/accounting?tab=accounts"><ArrowLeft /> Accounts</Link></Button><Button variant="outline" onClick={() => window.print()}><Printer /> Print</Button></div>} />
      <Card className="no-print mb-4 p-3"><DateRange idPrefix="lg" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></Card>
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : (() => {
        const d = q.data!;
        return (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard compact label="Opening balance" value={formatPKR(d.opening)} icon={BookOpen} tile="slate" />
              <StatCard compact label="Debits" value={formatPKR(d.totals.debit)} icon={BookOpen} tile="green" />
              <StatCard compact label="Credits" value={formatPKR(d.totals.credit)} icon={BookOpen} tile="rose" />
              <StatCard compact featured label="Closing balance" value={formatPKR(d.closing)} icon={BookOpen} />
            </div>
            <Card>
              <DataTable
                title={`${a?.code ?? ''} ${a?.name ?? 'Account'} ledger`}
                module="accounting"
                noun="entry"
                rows={[{ id: 'opening', entryId: '', date: from, entryNo: '', source: '', description: 'Opening balance', debit: '0', credit: '0', balance: d.opening } as LedgerRow, ...d.entries]}
                getRowId={(e) => e.id}
                onRowClick={(e) => e.entryId && setOpen(e.entryId)}
                onView={(e) => setOpen(e.entryId)}
                canRow={(_, e) => e.id !== 'opening'}
                rowClassName={(e) => (e.id === 'opening' ? 'bg-muted/40 font-medium' : undefined)}
                defaultPageSize={50}
                columns={[
                  { id: 'date', header: 'Date', value: (e) => e.date, text: (e) => formatDate(e.date), sortable: false, className: 'whitespace-nowrap' },
                  { id: 'entry', header: 'Entry', value: (e) => e.entryNo, text: (e) => [e.entryNo, e.source, e.description].filter(Boolean).join(' - '), sortable: false,
                    cell: (e) => <><span className="font-mono text-xs font-semibold">{e.entryNo}</span> <span className="text-xs text-muted-foreground">{e.source}</span><span className="block line-clamp-2 text-sm">{e.description}</span></> },
                  { id: 'debit', header: 'Debit', type: 'money', value: (e) => e.debit, sortable: false, cell: (e) => (Number(e.debit) ? formatPKR(e.debit) : '') },
                  { id: 'credit', header: 'Credit', type: 'money', value: (e) => e.credit, sortable: false, cell: (e) => (Number(e.credit) ? formatPKR(e.credit) : '') },
                  { id: 'balance', header: 'Balance', type: 'money', value: (e) => e.balance, sortable: false,
                    cell: (e) => <span className={cn('font-medium', Number(e.balance) < 0 && 'text-rose-700 dark:text-rose-400')}>{formatPKR(e.balance)}</span> },
                ]}
                footer={() => ({ entry: 'Total', debit: formatPKR(d.totals.debit), credit: formatPKR(d.totals.credit), balance: formatPKR(d.closing) })}
                empty={<EmptyState icon={<BookOpen />} title="No entries in these dates" />}
              />
            </Card>
          </>
        );
      })()}
      <JournalDialog id={open} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}
