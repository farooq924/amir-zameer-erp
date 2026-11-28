import { WHATSAPP_AUTO_PURPOSES, WHATSAPP_PURPOSES, WHATSAPP_VARIABLES, formatPhone, renderWhatsAppTemplate, templatePlaceholderCount } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck, Clock, Copy, Link2, MessageCircle, Pencil, Plug, Plus, RefreshCw, RotateCcw, Save, Search, Send, ShieldCheck, Users, X, XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { DateRange, monthStartPK, todayPK } from '@/features/finance/shared';
import { CustomerPicker, type PickedCustomer } from '@/features/orders/CustomerPicker';
import { SendWhatsAppDialog } from '@/features/whatsapp/SendWhatsAppDialog';
import { MetaStatusBadge, WaChannelBadge, WaStatusBadge, purposeLabel } from '@/features/whatsapp/shared';
import { useCan } from '@/hooks/use-permission';
import { useAuth } from '@/store/auth';
import { api, errorMessage } from '@/services/api';
import type { Paginated } from '@/types';
import type { WaConfig, WaMessage, WaSummary, WaTemplate } from '@/types/whatsapp';
import { formatDateTime } from '@/utils/format';

const relatedLink = (m: WaMessage) => (m.relatedType === 'ORDER' && m.relatedId ? `/orders/${m.relatedId}` : m.customer ? `/customers/${m.customer.id}` : null);

// ---------------------------------------------------------------- messages

function MessagesTab() {
  const can = useCan();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [channel, setChannel] = useState('ALL');
  const [from, setFrom] = useState(monthStartPK());
  const [to, setTo] = useState(todayPK());
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<WaMessage | null>(null);
  useEffect(() => setPage(1), [search, status, channel, from, to]);
  const q = useQuery({
    queryKey: ['whatsapp', 'messages', { search, status, channel, from, to, page }],
    queryFn: () => api.get<Paginated<WaMessage>>('/whatsapp/messages', { search: search.trim() || undefined, status, channel, from: from || undefined, to: to || undefined, page, pageSize: 25 }),
    refetchInterval: 20_000,
  });
  const act = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'retry' | 'cancel' }) => api.post<WaMessage>(`/whatsapp/messages/${id}/${kind}`),
    onSuccess: (m, v) => {
      void qc.invalidateQueries({ queryKey: ['whatsapp'] });
      setOpen(null);
      if (v.kind === 'cancel') toast.success('Message cancelled');
      else if (m.status === 'SENT') toast.success('Message sent');
      else toast.warning(m.errorMessage ?? 'Not sent yet. The ERP will try again.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search messages" className="pl-9" placeholder="Customer, mobile or text" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <NativeSelect aria-label="Status" className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All statuses</option><option value="QUEUED">Queued</option><option value="SENT">Sent</option>
          <option value="DELIVERED">Delivered</option><option value="READ">Read</option><option value="FAILED">Failed</option>
        </NativeSelect>
        <NativeSelect aria-label="Channel" className="w-36" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="ALL">All channels</option><option value="CLOUD_API">Cloud API</option><option value="MANUAL">Manual</option>
        </NativeSelect>
        <DateRange idPrefix="wa" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </Card>
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !rows.length ? (
          <EmptyState icon={<MessageCircle />} title="No messages" description="Messages sent from orders, payments and customers appear here with their delivery status." />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead><TR><TH>Sent</TH><TH>Customer</TH><TH>Message</TH><TH>Channel</TH><TH>Status</TH><TH className="w-24"><span className="sr-only">Actions</span></TH></TR></THead>
                <TBody>
                  {rows.map((m) => {
                    const link = relatedLink(m);
                    return (
                      <TR key={m.id} className="cursor-pointer" onClick={() => setOpen(m)}>
                        <TD className="whitespace-nowrap text-xs">{formatDateTime(m.createdAt)}</TD>
                        <TD>
                          {m.customer ? <Link to={`/customers/${m.customer.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary">{m.customer.name}</Link> : <span className="font-medium">-</span>}
                          <span className="block text-xs text-muted-foreground">{formatPhone(m.toNumber)}</span>
                        </TD>
                        <TD className="max-w-[360px]">
                          <span className="text-xs font-medium text-muted-foreground">{m.template ? purposeLabel(m.template.purpose) : 'Typed message'}{link && m.relatedType === 'ORDER' && <> · <Link to={link} onClick={(e) => e.stopPropagation()} className="hover:text-primary">order</Link></>}</span>
                          <span className="block truncate text-sm">{m.body}</span>
                        </TD>
                        <TD><WaChannelBadge channel={m.channel} /></TD>
                        <TD>
                          <WaStatusBadge status={m.status} channel={m.channel} />
                          {m.status === 'QUEUED' && m.attempts > 0 && <span className="block text-[11px] text-muted-foreground">Try {m.attempts + 1} at {formatDateTime(m.nextRetryAt)}</span>}
                          {m.status === 'FAILED' && m.errorMessage && <span className="block max-w-[180px] truncate text-[11px] text-rose-700 dark:text-rose-400" title={m.errorMessage}>{m.errorMessage}</span>}
                        </TD>
                        <TD onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {can('whatsapp', 'CREATE') && m.channel === 'CLOUD_API' && (m.status === 'FAILED' || m.status === 'QUEUED') && <Button variant="ghost" size="icon" aria-label="Send again" loading={act.isPending} onClick={() => act.mutate({ id: m.id, kind: 'retry' })}><RotateCcw /></Button>}
                            {can('whatsapp', 'CREATE') && m.status === 'QUEUED' && <Button variant="ghost" size="icon" aria-label="Cancel message" onClick={() => act.mutate({ id: m.id, kind: 'cancel' })}><X /></Button>}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
            <ul className="divide-y md:hidden">
              {rows.map((m) => (
                <li key={m.id}>
                  <button type="button" className="w-full p-3 text-left" onClick={() => setOpen(m)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{m.customer?.name ?? formatPhone(m.toNumber)}</p>
                        <p className="text-xs text-muted-foreground">{formatPhone(m.toNumber)} · {formatDateTime(m.createdAt)}</p>
                      </div>
                      <WaStatusBadge status={m.status} channel={m.channel} />
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm">{m.body}</p>
                    <div className="mt-1.5 flex items-center gap-2"><WaChannelBadge channel={m.channel} /><span className="text-xs text-muted-foreground">{m.template ? purposeLabel(m.template.purpose) : 'Typed message'}</span></div>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">{q.data!.meta.total} message(s)</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= q.data!.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Card>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-md">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle><MessageCircle className="h-5 w-5 text-emerald-600" /> Message to {open.customer?.name ?? formatPhone(open.toNumber)}</DialogTitle>
                <DialogDescription>{formatPhone(open.toNumber)} · {open.template ? `${purposeLabel(open.template.purpose)} (${open.template.name})` : 'Typed message'}</DialogDescription>
              </DialogHeader>
              <div className="rounded-xl bg-[#e7f8dc] p-3 text-sm leading-relaxed text-[#111b21] dark:bg-emerald-950/60 dark:text-emerald-50"><p className="whitespace-pre-wrap">{open.body}</p></div>
              <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Channel</dt><dd><WaChannelBadge channel={open.channel} /></dd>
                <dt className="text-muted-foreground">Status</dt><dd><WaStatusBadge status={open.status} channel={open.channel} /></dd>
                <dt className="text-muted-foreground">Created</dt><dd>{formatDateTime(open.createdAt)}</dd>
                {open.sentAt && <><dt className="text-muted-foreground">Sent</dt><dd>{formatDateTime(open.sentAt)}</dd></>}
                {open.deliveredAt && <><dt className="text-muted-foreground">Delivered</dt><dd>{formatDateTime(open.deliveredAt)}</dd></>}
                {open.readAt && <><dt className="text-muted-foreground">Read</dt><dd>{formatDateTime(open.readAt)}</dd></>}
                {open.channel === 'CLOUD_API' && <><dt className="text-muted-foreground">Attempts</dt><dd>{open.attempts}</dd></>}
                {open.errorMessage && <><dt className="text-muted-foreground">Error</dt><dd className="text-rose-700 dark:text-rose-400">{open.errorCode ? `${open.errorCode}: ` : ''}{open.errorMessage}</dd></>}
              </dl>
              <DialogFooter>
                {relatedLink(open) && <Button variant="outline" asChild><Link to={relatedLink(open)!}>Open {open.relatedType === 'ORDER' ? 'order' : 'customer'}</Link></Button>}
                {can('whatsapp', 'CREATE') && open.channel === 'CLOUD_API' && (open.status === 'FAILED' || open.status === 'QUEUED') && <Button loading={act.isPending} onClick={() => act.mutate({ id: open.id, kind: 'retry' })}><RotateCcw /> Send again</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- templates

const SAMPLE = Object.fromEntries(WHATSAPP_VARIABLES.map((v) => [v.key, v.sample]));

function TemplateDialog({ template, open, onOpenChange }: { template: WaTemplate | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', language: 'en', category: 'UTILITY', purpose: 'GENERAL', bodyPreview: '', variables: [] as string[], isActive: true });
  useEffect(() => {
    if (!open) return;
    setF(template ? { name: template.name, language: template.language, category: template.category, purpose: template.purpose, bodyPreview: template.bodyPreview, variables: template.variables, isActive: template.isActive }
      : { name: '', language: 'en', category: 'UTILITY', purpose: 'GENERAL', bodyPreview: 'Dear {{1}}, ', variables: ['customer_name'], isActive: true });
  }, [open, template]);
  const needed = templatePlaceholderCount(f.bodyPreview);
  useEffect(() => {
    setF((x) => (x.variables.length === needed ? x : { ...x, variables: Array.from({ length: needed }, (_, i) => x.variables[i] ?? 'customer_name') }));
  }, [needed]);
  const save = useMutation({
    mutationFn: () => (template ? api.put(`/whatsapp/templates/${template.id}`, f) : api.post('/whatsapp/templates', f)),
    onSuccess: () => { toast.success('Template saved'); void qc.invalidateQueries({ queryKey: ['whatsapp', 'templates'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const insert = () => setF((x) => ({ ...x, bodyPreview: `${x.bodyPreview}{{${needed + 1}}}` }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><MessageCircle className="h-5 w-5 text-primary" /> {template ? 'Edit template' : 'New template'}</DialogTitle>
          <DialogDescription>Use exactly the same name, language and text as the template approved in Meta WhatsApp Manager.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="t-name" required>Template name (as in Meta)</Label><Input id="t-name" placeholder="order_ready" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></div>
          <div className="space-y-1.5"><Label htmlFor="t-purpose" required>Used for</Label>
            <NativeSelect id="t-purpose" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>{WHATSAPP_PURPOSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</NativeSelect>
          </div>
          <div className="space-y-1.5"><Label htmlFor="t-lang" required>Language code</Label><Input id="t-lang" placeholder="en" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="t-cat" required>Meta category</Label>
            <NativeSelect id="t-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="UTILITY">Utility (order and payment updates)</option><option value="MARKETING">Marketing (offers)</option></NativeSelect>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between"><Label htmlFor="t-body" required>Message text</Label><Button type="button" size="sm" variant="ghost" onClick={insert}><Plus /> Add value {`{{${needed + 1}}}`}</Button></div>
            <Textarea id="t-body" rows={4} maxLength={1024} value={f.bodyPreview} onChange={(e) => setF({ ...f, bodyPreview: e.target.value })} />
          </div>
          {f.variables.length > 0 && (
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              {f.variables.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 font-mono text-xs font-semibold">{`{{${i + 1}}}`}</span>
                  <NativeSelect aria-label={`Value ${i + 1}`} value={v} onChange={(e) => setF({ ...f, variables: f.variables.map((x, j) => (j === i ? e.target.value : x)) })}>
                    {WHATSAPP_VARIABLES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </NativeSelect>
                </div>
              ))}
            </div>
          )}
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium">Example</p>
            <div className="rounded-xl bg-[#e7f8dc] p-3 text-sm text-[#111b21] dark:bg-emerald-950/60 dark:text-emerald-50">{renderWhatsAppTemplate(f.bodyPreview, f.variables, SAMPLE)}</div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active</label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}><Save /> Save template</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesTab() {
  const can = useCan();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<WaTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['whatsapp', 'templates'], queryFn: () => api.get<WaTemplate[]>('/whatsapp/templates') });
  const sync = useMutation({
    mutationFn: () => api.post<{ found: number; updated: number }>('/whatsapp/templates/sync'),
    onSuccess: (r) => { toast.success(`Read ${r.found} template(s) from Meta, ${r.updated} status change(s)`); void qc.invalidateQueries({ queryKey: ['whatsapp', 'templates'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const manage = can('whatsapp', 'MANAGE_SETTINGS');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">Templates are the fixed messages Meta approves for the Cloud API. Manual sending uses the same text. Values like the customer name fill {'{{1}}'}, {'{{2}}'} automatically.</p>
        {manage && (
          <div className="flex gap-2">
            <Button variant="outline" loading={sync.isPending} onClick={() => sync.mutate()}><RefreshCw /> Check status in Meta</Button>
            <Button variant="gold" onClick={() => { setEdit(null); setOpen(true); }}><Plus /> Add template</Button>
          </div>
        )}
      </div>
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {q.data!.map((t) => (
            <Card key={t.id} className={t.isActive ? '' : 'opacity-60'}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="min-w-0">
                  <CardTitle className="text-base">{purposeLabel(t.purpose)}</CardTitle>
                  <CardDescription className="font-mono text-xs">{t.name} · {t.language} · {t.category.toLowerCase()}</CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!t.isActive && <Badge variant="secondary">Inactive</Badge>}
                  <MetaStatusBadge status={t.metaStatus} />
                  {manage && <Button variant="ghost" size="icon" aria-label={`Edit ${t.name}`} onClick={() => { setEdit(t); setOpen(true); }}><Pencil /></Button>}
                </div>
              </CardHeader>
              <CardContent>
                <p className="rounded-lg bg-muted/60 p-3 text-sm">{t.bodyPreview}</p>
                <p className="mt-2 text-xs text-muted-foreground">{t.variables.map((v, i) => `{{${i + 1}}} ${WHATSAPP_VARIABLES.find((x) => x.key === v)?.label ?? v}`).join(' · ') || 'No values'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.messageCount} message(s) sent</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <TemplateDialog template={edit} open={open} onOpenChange={setOpen} />
    </div>
  );
}

// ---------------------------------------------------------------- settings

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button type="button" variant="outline" size="icon" aria-label={`Copy ${label}`} onClick={() => { void navigator.clipboard?.writeText(value); toast.success('Copied'); }}><Copy /></Button>
      </div>
    </div>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['whatsapp', 'config'], queryFn: () => api.get<WaConfig>('/whatsapp/config') });
  const [d, setD] = useState<Partial<WaConfig> & { accessToken?: string; appSecret?: string }>({});
  useEffect(() => { if (q.data) setD({ ...q.data, accessToken: '', appSecret: '' }); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put<WaConfig>('/whatsapp/config', {
      enabled: d.enabled, apiVersion: d.apiVersion, phoneNumberId: d.phoneNumberId, businessAccountId: d.businessAccountId,
      verifyToken: d.verifyToken, autoSend: d.autoSend, requireOptIn: d.requireOptIn, maxAttempts: Number(d.maxAttempts),
      ...(d.accessToken ? { accessToken: d.accessToken } : {}), ...(d.appSecret ? { appSecret: d.appSecret } : {}),
    }),
    onSuccess: (c) => { qc.setQueryData(['whatsapp', 'config'], c); void qc.invalidateQueries({ queryKey: ['whatsapp', 'summary'] }); toast.success('WhatsApp settings saved'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  // Each company has its own webhook address.
  const companyCode = useAuth((s) => s.user?.company?.code);
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; displayPhoneNumber?: string; verifiedName?: string; quality?: string; error?: string }>('/whatsapp/config/test'),
    onSuccess: (r) => (r.ok ? toast.success(`Connected: ${r.verifiedName ?? ''} ${r.displayPhoneNumber ?? ''}${r.quality ? ` (quality ${r.quality})` : ''}`) : toast.error(r.error ?? 'Connection failed')),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data || !d.autoSend) return <LoadingState />;
  const webhookUrl = `${window.location.origin}/api/whatsapp/webhook${companyCode ? `/${companyCode}` : ''}`;
  return (
    <form className="grid gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5 text-primary" /> WhatsApp Cloud API (Meta)</CardTitle>
          <CardDescription>Official API: messages are sent by the ERP automatically. Leave it off to send manually from the WhatsApp app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span><span className="block text-sm font-medium">Send through the Cloud API</span><span className="text-xs text-muted-foreground">{q.data.cloudReady ? 'Connected and on' : 'Off - manual sending only'}</span></span>
            <Switch aria-label="Send through the Cloud API" checked={!!d.enabled} onCheckedChange={(v) => setD({ ...d, enabled: v })} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="wa-pnid">Phone number ID</Label><Input id="wa-pnid" inputMode="numeric" value={d.phoneNumberId ?? ''} onChange={(e) => setD({ ...d, phoneNumberId: e.target.value.trim() })} /></div>
            <div className="space-y-1.5"><Label htmlFor="wa-waba">WhatsApp Business Account ID</Label><Input id="wa-waba" inputMode="numeric" value={d.businessAccountId ?? ''} onChange={(e) => setD({ ...d, businessAccountId: e.target.value.trim() })} /></div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-token">Permanent access token</Label>
            <Input id="wa-token" type="password" autoComplete="off" placeholder={q.data.hasAccessToken ? `Saved (${q.data.accessTokenHint}). Type to replace.` : 'Paste the System User token'} value={d.accessToken ?? ''} onChange={(e) => setD({ ...d, accessToken: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-secret">App secret</Label>
            <Input id="wa-secret" type="password" autoComplete="off" placeholder={q.data.hasAppSecret ? `Saved (${q.data.appSecretHint}). Type to replace.` : 'Meta app > App settings > Basic > App secret'} value={d.appSecret ?? ''} onChange={(e) => setD({ ...d, appSecret: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="wa-ver">Graph API version</Label><Input id="wa-ver" value={d.apiVersion ?? ''} onChange={(e) => setD({ ...d, apiVersion: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="wa-max">Tries before a message fails</Label><Input id="wa-max" type="number" min={1} max={10} value={String(d.maxAttempts ?? 5)} onChange={(e) => setD({ ...d, maxAttempts: Number(e.target.value) })} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={save.isPending}><Save /> Save</Button>
            <Button type="button" variant="outline" loading={test.isPending} disabled={!q.data.hasAccessToken} onClick={() => test.mutate()}><Plug /> Test connection</Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /> Webhook (delivery and read ticks)</CardTitle>
            <CardDescription>Paste these two values in Meta: WhatsApp &gt; Configuration &gt; Webhook, then subscribe to "messages".</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CopyField label="Callback URL" value={webhookUrl} />
            <CopyField label="Verify token" value={d.verifyToken ?? ''} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" /> Automatic messages</CardTitle>
            <CardDescription>Sent by the Cloud API without anyone pressing a button. Each event sends one message per order or payment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {WHATSAPP_AUTO_PURPOSES.map((p) => (
              <label key={p} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
                <span>{purposeLabel(p)}</span>
                <Switch aria-label={purposeLabel(p)} checked={!!d.autoSend?.[p]} onCheckedChange={(v) => setD({ ...d, autoSend: { ...d.autoSend, [p]: v } })} />
              </label>
            ))}
            <label className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Only customers who agreed (recommended)</span>
              <Switch aria-label="Only customers who agreed" checked={!!d.requireOptIn} onCheckedChange={(v) => setD({ ...d, requireOptIn: v })} />
            </label>
            <p className="text-xs text-muted-foreground">Customers can reply STOP to stop messages and START to agree again; the ERP updates the customer automatically.</p>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- page

export function WhatsAppPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'messages';
  const [pick, setPick] = useState(false);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [send, setSend] = useState(false);
  const summary = useQuery({ queryKey: ['whatsapp', 'summary'], queryFn: () => api.get<WaSummary>('/whatsapp/summary'), refetchInterval: 30_000 });
  const run = useMutation({
    mutationFn: () => api.post<{ processed: number }>('/whatsapp/queue/run'),
    onSuccess: (r) => { toast.success(r.processed ? `${r.processed} queued message(s) tried` : 'Nothing is waiting to be sent'); void qc.invalidateQueries({ queryKey: ['whatsapp'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const s = summary.data;
  return (
    <div>
      <PageHeader
        title="WhatsApp"
        description={s ? (s.cloudReady ? 'Cloud API connected: order and payment updates go out automatically.' : 'Manual mode: messages open in WhatsApp for you to press Send. Set up the Cloud API in Settings.') : 'Customer messages, templates and Cloud API settings.'}
        actions={<>
          {s && s.queued > 0 && can('whatsapp', 'CREATE') && <Button variant="outline" loading={run.isPending} onClick={() => run.mutate()}><RefreshCw /> Send queued now</Button>}
          {can('whatsapp', 'CREATE') && <Button onClick={() => { setCustomer(null); setPick(true); }}><MessageCircle /> New message</Button>}
        </>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Messages this month" value={String(s?.monthTotal ?? 0)} hint={`${s?.today ?? 0} today`} icon={MessageCircle} loading={summary.isLoading} />
        <StatCard label="Delivered / read" value={String(s?.deliveredOrRead ?? 0)} hint="Cloud API ticks" icon={CheckCheck} tile="green" loading={summary.isLoading} />
        <StatCard label="Waiting / failed" value={`${s?.queued ?? 0} / ${s?.failed ?? 0}`} hint="Queued now / failed this month" icon={s?.failed ? XCircle : Clock} tile="rose" tone={s?.failed ? 'negative' : undefined} loading={summary.isLoading} />
        <StatCard label="Customers agreed" value={String(s?.optedIn ?? 0)} hint="WhatsApp opt-in" icon={Users} tile="blue" loading={summary.isLoading} />
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'messages' ? {} : { tab: v }, { replace: true })}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          {can('whatsapp', 'MANAGE_SETTINGS') && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>
        <TabsContent value="messages"><MessagesTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        {can('whatsapp', 'MANAGE_SETTINGS') && <TabsContent value="settings"><SettingsTab /></TabsContent>}
      </Tabs>
      <Dialog open={pick} onOpenChange={setPick}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle><Users className="h-5 w-5 text-primary" /> Choose customer</DialogTitle>
            <DialogDescription>Search by name, code or mobile number.</DialogDescription>
          </DialogHeader>
          <CustomerPicker value={customer} onChange={setCustomer} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPick(false)}>Cancel</Button>
            <Button disabled={!customer} onClick={() => { setPick(false); setSend(true); }}>Next</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {customer && <SendWhatsAppDialog open={send} onOpenChange={setSend} context={{ type: 'CUSTOMER', id: customer.id }} purpose="GENERAL" />}
    </div>
  );
}
