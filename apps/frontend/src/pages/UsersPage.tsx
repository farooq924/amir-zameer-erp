import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Power, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, PageHeader } from '@/components/common';
import { type DataColumn, DataTable, fetchAllPages } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toggle, setToggle] = useState<UserRow | null>(null);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState('');

  const users = useQuery({
    queryKey: ['users', { search, page, pageSize }],
    queryFn: () => api.get<Paginated<UserRow>>('/users', { search, page, pageSize }),
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

  const columns: DataColumn<UserRow>[] = [
    { id: 'name', header: 'Name', value: (u) => u.fullName, text: (u) => `${u.fullName}${u.email ? ` (${u.email})` : ''}`,
      cell: (u) => <><div className="font-medium">{u.fullName}</div><div className="text-xs text-muted-foreground">{u.email}</div></> },
    { id: 'username', header: 'Username', value: (u) => u.username, cell: (u) => <span className="text-muted-foreground">{u.username}</span> },
    { id: 'roles', header: 'Roles', value: (u) => u.roles.map((r) => r.name).join(', '), cell: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r.id} variant="secondary">{r.name}</Badge>)}</div> },
    { id: 'status', header: 'Status', value: (u) => (u.isActive ? 'Active' : 'Inactive'),
      cell: (u) => <>{u.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}{u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge variant="warning" className="ml-1">Locked</Badge>}</> },
    { id: 'lastLogin', header: 'Last login', value: (u) => u.lastLoginAt, text: (u) => formatDateTime(u.lastLoginAt), className: 'whitespace-nowrap text-muted-foreground' },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        description="Login accounts. Activate staff logins here when they are ready to use the ERP."
        actions={can('users', 'CREATE') && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus /> Add user</Button>}
      />
      <Card>
        <DataTable
          title="Users"
          module="users"
          noun="user"
          rows={users.data?.data}
          columns={columns}
          getRowId={(u) => u.id}
          loading={users.isLoading}
          error={users.error}
          onRetry={() => users.refetch()}
          pagination={{ page, pageSize, total: users.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<UserRow>>('/users', { search, page: pg, pageSize: size }))}
          onEdit={can('users', 'EDIT') ? (u) => { setEditing(u); setFormOpen(true); } : undefined}
          rowMenu={can('users', 'EDIT') || can('users', 'MANAGE_SETTINGS') ? (u) => (
            <>
              {can('users', 'MANAGE_SETTINGS') && <DropdownMenuItem onSelect={() => setResetFor(u)}><KeyRound /> Reset password</DropdownMenuItem>}
              {can('users', 'EDIT') && u.id !== me?.id && <DropdownMenuItem onSelect={() => setToggle(u)}><Power /> {u.isActive ? 'Deactivate' : 'Activate'}</DropdownMenuItem>}
            </>
          ) : undefined}
          toolbar={
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search name, email or username" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          }
          empty={<EmptyState title="No users found" />}
        />
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
