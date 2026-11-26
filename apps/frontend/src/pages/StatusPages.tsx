import { MODULES } from '@az/shared';
import { Construction, Lock, MapPinOff } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** Honest placeholder for modules scheduled in later phases. It shows no fake data. */
export function PlannedModulePage() {
  const { pathname } = useLocation();
  const mod = MODULES.find((m) => m.path !== '/' && pathname.startsWith(m.path));
  return (
    <div>
      <PageHeader title={mod?.label ?? 'Module'} />
      <Card>
        <EmptyState
          icon={<Construction className="h-5 w-5" />}
          title={`${mod?.label ?? 'This module'} is scheduled for Phase ${mod?.phase ?? '-'}`}
          description="The database tables and permissions for this module are already in place. Screens and workflows will be added in their development phase."
        />
      </Card>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <Card className="mt-6">
      <EmptyState icon={<Lock className="h-5 w-5" />} title="Access denied" description="Your role does not include permission to open this page. Ask the business owner for access."
        action={<Button asChild variant="outline" size="sm"><Link to="/">Go to dashboard</Link></Button>} />
    </Card>
  );
}

export function NotFoundPage() {
  return (
    <Card className="mt-6">
      <EmptyState icon={<MapPinOff className="h-5 w-5" />} title="Page not found" action={<Button asChild variant="outline" size="sm"><Link to="/">Go to dashboard</Link></Button>} />
    </Card>
  );
}
