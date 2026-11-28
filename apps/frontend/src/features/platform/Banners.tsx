import { AlertTriangle, Clock, LogOut, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/store/auth';
import { formatDate } from '@/utils/format';
import { useExitCompany } from './shared';

const SUPPORT_CONTACT = 'Brandistan, 0333-2532924';

/** Shown while a Super Admin has a company open for support. */
export function SupportBanner() {
  const user = useAuth((s) => s.user);
  const exit = useExitCompany();
  if (!user?.supportMode || !user.company) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-[#101f3d] no-print">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span className="flex-1">Support access: you are working inside <strong>{user.company.name}</strong>. Everything you do is recorded in its audit log.</span>
      <Button size="sm" variant="navy" loading={exit.isPending} onClick={() => exit.mutate()}><LogOut /> Back to Super Admin</Button>
    </div>
  );
}

/** Trial ending, grace period or read-only notice for the company's users. */
export function SubscriptionBanner() {
  const company = useAuth((s) => s.user?.company);
  if (!company) return null;
  const { access, daysLeft, endsAt, graceEndsAt, status } = company;
  if (access === 'READ_ONLY') {
    return (
      <div role="alert" className="flex items-start gap-2 bg-rose-600 px-4 py-2 text-sm text-white no-print">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Your TailoringERP subscription ended on {formatDate(endsAt)}. The ERP is <strong>read-only</strong>: you can view and print, but not add or change anything. To renew, contact {SUPPORT_CONTACT}.</span>
      </div>
    );
  }
  if (access === 'GRACE') {
    return (
      <div role="alert" className="flex items-start gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200 no-print">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Your subscription ended on {formatDate(endsAt)}. Please renew before {formatDate(graceEndsAt)}, after that the ERP becomes read-only. Contact {SUPPORT_CONTACT}.</span>
      </div>
    );
  }
  if (daysLeft !== null && daysLeft <= 7) {
    return (
      <div className="flex items-start gap-2 bg-gold-soft px-4 py-2 text-sm text-[#6b5216] dark:text-gold no-print">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{status === 'TRIAL' ? 'Your free trial' : 'Your subscription'} ends {daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`} ({formatDate(endsAt)}). To continue, contact {SUPPORT_CONTACT}.</span>
      </div>
    );
  }
  return null;
}
