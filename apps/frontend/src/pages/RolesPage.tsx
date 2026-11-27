import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, ErrorState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { PermissionGroup, RoleSummary } from '@/types';
import { cn } from '@/utils/cn';
import { humanize } from '@/utils/format';

const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'PRINT', 'MANAGE_SETTINGS'];

export function RolesPage() {
  const can = useCan();
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleSummary[]>('/roles') });
  const catalogue = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<PermissionGroup[]>('/roles/permissions') });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', code: '', description: '' });

  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0];
  const isOwnerRole = selected?.code === 'OWNER';
  const editable = can('users', 'MANAGE_SETTINGS') && !isOwnerRole;

  useEffect(() => {
    if (selected) setDraft(new Set(selected.permissions));
  }, [selected?.id, selected?.permissions.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => {
    if (!selected || isOwnerRole) return false;
    const orig = new Set(selected.permissions);
    return orig.size !== draft.size || [...draft].some((p) => !orig.has(p));
  }, [draft, selected, isOwnerRole]);

  const save = useMutation({
    mutationFn: () => api.patch(`/roles/${selected!.id}`, { permissions: [...draft] }),
    onSuccess: () => { toast.success('Permissions saved. Changes apply immediately.'); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const create = useMutation({
    mutationFn: () => api.post<RoleSummary>('/roles', { ...newRole, permissions: [] }),
    onSuccess: (r) => { toast.success('Role created'); qc.invalidateQueries({ queryKey: ['roles'] }); setSelectedId(r.id); setCreateOpen(false); setNewRole({ name: '', code: '', description: '' }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/roles/${selected!.id}`),
    onSuccess: () => { toast.success('Role deleted'); qc.invalidateQueries({ queryKey: ['roles'] }); setSelectedId(null); setDeleteOpen(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const toggle = (code: string, on: boolean) => setDraft((d) => { const n = new Set(d); if (on) n.add(code); else n.delete(code); return n; });
  const toggleRow = (g: PermissionGroup, on: boolean) => setDraft((d) => { const n = new Set(d); g.permissions.forEach((p) => (on ? n.add(p.code) : n.delete(p.code))); return n; });

  if (roles.isError || catalogue.isError) return <ErrorState message={errorMessage(roles.error ?? catalogue.error)} />;

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Choose exactly what each role can do in every module. The server enforces these rules on every request."
        actions={can('users', 'MANAGE_SETTINGS') && <Button variant="outline" onClick={() => setCreateOpen(true)}><Plus /> New role</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="p-2">
          {roles.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <ul className="flex gap-1 overflow-x-auto lg:flex-col">
              {roles.data!.map((r) => (
                <li key={r.id} className="shrink-0">
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted', selected?.id === r.id && 'bg-gold-soft font-semibold hover:bg-gold-soft')}
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.userCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          {selected && (
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{selected.name}</h2>
                  {selected.isSystem && <Badge variant="secondary">Default</Badge>}
                  {!selected.isActive && <Badge variant="danger">Inactive</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{selected.description}</p>
              </div>
              <div className="flex gap-2">
                {editable && !selected.isSystem && <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete</Button>}
                {editable && <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}><Save /> Save changes</Button>}
              </div>
            </div>
          )}
          {isOwnerRole ? (
            <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 text-emerald-600" /> The Owner role always has full access to every module. It cannot be restricted.</div>
          ) : catalogue.isLoading ? <Skeleton className="m-4 h-64" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="sticky left-0 bg-muted/50 px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Module</th>
                    {ACTIONS.map((a) => <th key={a} className="px-2 py-2 text-center text-xs font-medium uppercase text-muted-foreground">{humanize(a)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {catalogue.data!.map((g) => {
                    const all = g.permissions.every((p) => draft.has(p.code));
                    const some = g.permissions.some((p) => draft.has(p.code));
                    return (
                      <tr key={g.module} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="sticky left-0 bg-background px-3 py-2">
                          <label className="flex items-center gap-2">
                            <Checkbox disabled={!editable} checked={all ? true : some ? 'indeterminate' : false} onCheckedChange={(c) => toggleRow(g, c === true)} aria-label={`All ${g.label} permissions`} />
                            <span className="font-medium">{g.label}</span>
                            {g.phase > 1 && <span className="text-[10px] text-muted-foreground">Phase {g.phase}</span>}
                          </label>
                        </td>
                        {ACTIONS.map((a) => {
                          const p = g.permissions.find((x) => x.action === a);
                          return (
                            <td key={a} className="px-2 py-2 text-center">
                              {p ? <Checkbox disabled={!editable} checked={draft.has(p.code)} onCheckedChange={(c) => toggle(p.code, c === true)} aria-label={`${g.label} ${humanize(a)}`} /> : <span className="text-muted-foreground/40">-</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New role</DialogTitle><DialogDescription>Create the role, then tick its permissions in the matrix.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="r-name">Role name</Label>
              <Input id="r-name" value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) })} /></div>
            <div className="space-y-1.5"><Label htmlFor="r-code">Code</Label><Input id="r-code" value={newRole.code} onChange={(e) => setNewRole({ ...newRole, code: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1.5"><Label htmlFor="r-desc">Description</Label><Input id="r-desc" value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button disabled={newRole.name.trim().length < 2 || newRole.code.length < 3} loading={create.isPending} onClick={() => create.mutate()}>Create role</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete role?" destructive confirmLabel="Delete"
        description={`"${selected?.name}" will be removed. Roles assigned to users cannot be deleted.`} loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </div>
  );
}
