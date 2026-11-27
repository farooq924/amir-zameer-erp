import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { StatCard } from '@/features/dashboard/StatCard';
import { DateRange, monthStartPK, todayPK } from '@/features/finance/shared';
import { api, errorMessage } from '@/services/api';
import type { AccountLedger } from '@/types/finance';
import { cn } from '@/utils/cn';
import { formatDate, formatPKR } from '@/utils/format';
import { JournalDialog } from './AccountingPage';

/** Statement of one account: opening balance, every posted line and the running balance. */
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
              {!d.entries.length ? <EmptyState icon={<BookOpen />} title="No entries in these dates" /> : (
                <Table>
                  <THead><TR><TH>Date</TH><TH>Entry</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH><TH className="text-right">Balance</TH></TR></THead>
                  <TBody>
                    <TR className="bg-muted/40"><TD colSpan={4} className="font-medium">Opening balance</TD><TD className="text-right font-semibold tabular-nums">{formatPKR(d.opening)}</TD></TR>
                    {d.entries.map((e) => (
                      <TR key={e.id} className="cursor-pointer" tabIndex={0} onClick={() => setOpen(e.entryId)} onKeyDown={(k) => k.key === 'Enter' && setOpen(e.entryId)}>
                        <TD className="whitespace-nowrap">{formatDate(e.date)}</TD>
                        <TD><span className="font-mono text-xs font-semibold">{e.entryNo}</span> <span className="text-xs text-muted-foreground">{e.source}</span>
                          <span className="block line-clamp-2 text-sm">{e.description}</span></TD>
                        <TD className="text-right tabular-nums">{Number(e.debit) ? formatPKR(e.debit) : ''}</TD>
                        <TD className="text-right tabular-nums">{Number(e.credit) ? formatPKR(e.credit) : ''}</TD>
                        <TD className={cn('text-right font-medium tabular-nums', Number(e.balance) < 0 && 'text-rose-700 dark:text-rose-400')}>{formatPKR(e.balance)}</TD>
                      </TR>
                    ))}
                    <TR className="bg-muted/50 font-semibold"><TD colSpan={2}>Total</TD><TD className="text-right tabular-nums">{formatPKR(d.totals.debit)}</TD><TD className="text-right tabular-nums">{formatPKR(d.totals.credit)}</TD><TD className="text-right tabular-nums">{formatPKR(d.closing)}</TD></TR>
                  </TBody>
                </Table>
              )}
            </Card>
          </>
        );
      })()}
      <JournalDialog id={open} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}
