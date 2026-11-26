import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, MoreHorizontal, Pencil, Plus, Power, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { UserFormDialog } from '@/features/settings/UserFormDialog';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import { useAuth } from '@/store/auth';
import type { Paginated, RoleSummary, UserRow } from '@/types';
import { formatDateTime } from '@/utils/format';

export function UsersPage() {
  const can = useCan();
  const me = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toggle, setToggle] = useState<UserRow | null>(null);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState('');

  const users = useQuery({
    queryKey: ['users', { search, page }],
    queryFn: () => api.get<Paginated<UserRow>>('/users', { search, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleSummary[]>('/roles') });

  const statusMut = useMutation({
    mutationFn: (u: UserRow) => api.patch(`/users/${u.id}/status`, { isActive: !u.isActive }),
    onSuccess: () => { toast.success('User status updated'); qc.invalidateQueries({ queryKey: ['users'] }); setToggle(null); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resetMut = useMutation({
    mutationFn: () => api.post(`/users/${resetFor!.id}/reset-password`, { newPassword: newPw }),
    onSuccess: () => { toast.success('Password reset. The user has been logged out everywhere.'); setResetFor(null); setNewPw(''); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Login accounts. Activate staff logins here when they are ready to use the ERP."
        actions={can('users', 'CREATE') && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus /> Add user</Button>}
      />
      <Card>
        <div className="border-b p-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, email or username" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        {users.isError ? <ErrorState message={errorMessage(users.error)} onRetry={() => users.refetch()} /> : users.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : users.data!.data.length === 0 ? <EmptyState title="No users found" /> : (
          <Table>
            <THead><TR><TH>Name</TH><TH>Username</TH><TH>Roles</TH><TH>Status</TH><TH>Last login</TH><TH className="w-10" /></TR></THead>
            <TBody>
              {users.data!.data.map((u) => {
                const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                return (
                  <TR key={u.id}>
                    <TD><div className="font-medium">{u.fullName}</div><div className="text-xs text-muted-foreground">{u.email}</div></TD>
                    <TD className="text-muted-foreground">{u.username}</TD>
                    <TD><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r.id} variant="secondary">{r.name}</Badge>)}</div></TD>
                    <TD>
                      {u.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}
                      {locked && <Badge variant="warning" className="ml-1">Locked</Badge>}
                    </TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(u.lastLoginAt)}</TD>
                    <TD>
                      {(can('users', 'EDIT') || can('users', 'MANAGE_SETTINGS')) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${u.fullName}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {can('users', 'EDIT') && <DropdownMenuItem onSelect={() => { setEditing(u); setFormOpen(true); }}><Pencil /> Edit</DropdownMenuItem>}
                            {can('users', 'MANAGE_SETTINGS') && <DropdownMenuItem onSelect={() => setResetFor(u)}><KeyRound /> Reset password</DropdownMenuItem>}
                            {can('users', 'EDIT') && u.id !== me?.id && (
                              <DropdownMenuItem onSelect={() => setToggle(u)}><Power /> {u.isActive ? 'Deactivate' : 'Activate'}</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {users.data && users.data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">Page {users.data.meta.page} of {users.data.meta.totalPages} · {users.data.meta.total} users</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= users.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} roles={roles.data ?? []} user={editing} />
      <ConfirmDialog
        open={!!toggle}
        onOpenChange={(o) => !o && setToggle(null)}
        title={toggle?.isActive ? 'Deactivate user?' : 'Activate user?'}
        description={toggle?.isActive ? `${toggle?.fullName} will be logged out immediately and cannot sign in.` : `${toggle?.fullName} will be able to sign in again.`}
        confirmLabel={toggle?.isActive ? 'Deactivate' : 'Activate'}
        destructive={toggle?.isActive}
        loading={statusMut.isPending}
        onConfirm={() => toggle && statusMut.mutate(toggle)}
      />
      <Dialog open={!!resetFor} onOpenChange={(o) => { if (!o) { setResetFor(null); setNewPw(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reset password</DialogTitle><DialogDescription>Set a new password for {resetFor?.fullName}. They will be logged out of all devices.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="reset-pw">New password</Label><Input id="reset-pw" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
          <DialogFooter><Button disabled={newPw.length < 10} loading={resetMut.isPending} onClick={() => resetMut.mutate()}>Reset password</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
