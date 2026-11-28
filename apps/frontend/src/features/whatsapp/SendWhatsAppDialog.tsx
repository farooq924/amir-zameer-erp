import { WHATSAPP_VARIABLES } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Info, MessageCircle, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { WaMessage, WaPreview, WaTemplate } from '@/types/whatsapp';
import { purposeLabel } from './shared';

export type WaContext = { type: 'ORDER' | 'PAYMENT' | 'CUSTOMER'; id: string };
const CUSTOM = '__custom__';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Send a WhatsApp message to a customer from any screen.
 * Manual = opens WhatsApp (app or web) with the text filled in. Cloud API = sent by the ERP (needs setup and customer opt-in).
 */
export function SendWhatsAppDialog({ open, onOpenChange, context, purpose, title }: {
  open: boolean; onOpenChange: (o: boolean) => void; context: WaContext; purpose?: string; title?: string;
}) {
  const can = useCan();
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ['whatsapp', 'templates'], queryFn: () => api.get<WaTemplate[]>('/whatsapp/templates'), enabled: open, staleTime: 60_000 });
  const [choice, setChoice] = useState('');
  const [text, setText] = useState('');
  const [toNumber, setToNumber] = useState('');
  const [otherNumber, setOtherNumber] = useState(false);

  /** Templates this record can fill (an order can fill order + customer values, a payment also payment values). */
  const usable = useMemo(() => {
    const ctx = new Set(['ANY', 'CUSTOMER', ...(context.type !== 'CUSTOMER' ? ['ORDER'] : []), ...(context.type === 'PAYMENT' ? ['PAYMENT'] : [])]);
    return (templates.data ?? []).filter((t) => t.isActive && t.variables.every((v) => ctx.has(WHATSAPP_VARIABLES.find((x) => x.key === v)?.context ?? 'ANY')));
  }, [templates.data, context.type]);

  useEffect(() => {
    if (!open) return;
    setText(''); setToNumber(''); setOtherNumber(false);
    setChoice('');
  }, [open, context.id]);
  useEffect(() => {
    if (!open || choice || !templates.data) return;
    const preferred = usable.find((t) => t.purpose === purpose) ?? usable[0];
    setChoice(preferred ? preferred.id : CUSTOM);
  }, [open, choice, templates.data, usable, purpose]);

  const body = {
    ...(choice && choice !== CUSTOM ? { templateId: choice } : { text }),
    relatedType: context.type, relatedId: context.id,
    ...(otherNumber && toNumber.trim() ? { toNumber: toNumber.trim() } : {}),
  };
  const debounced = useDebounced(JSON.stringify(body), 350);
  const ready = open && !!choice && (choice !== CUSTOM || text.trim().length > 0);
  const preview = useQuery({
    queryKey: ['whatsapp', 'preview', debounced],
    queryFn: () => api.post<WaPreview>('/whatsapp/preview', JSON.parse(debounced)),
    enabled: ready && debounced === JSON.stringify(body), retry: false,
  });
  const p = preview.data;

  const done = (m: WaMessage, label: string) => {
    void qc.invalidateQueries({ queryKey: ['whatsapp'] });
    if (m.status === 'FAILED') toast.error(`WhatsApp failed: ${m.errorMessage ?? 'unknown error'}`);
    else if (m.status === 'QUEUED') toast.warning('WhatsApp could not send right now. The ERP will try again automatically.');
    else toast.success(label);
    onOpenChange(false);
  };
  const manual = useMutation({
    mutationFn: () => api.post<{ message: WaMessage; link: string }>('/whatsapp/send', { ...body, channel: 'MANUAL' }),
    onSuccess: (r) => done(r.message, 'Message logged. Press Send in WhatsApp.'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cloud = useMutation({
    mutationFn: () => api.post<{ message: WaMessage }>('/whatsapp/send', { ...body, channel: 'CLOUD_API' }),
    onSuccess: (r) => done(r.message, 'WhatsApp message sent'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const canSend = can('whatsapp', 'CREATE');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><MessageCircle className="h-5 w-5 text-emerald-600" /> {title ?? 'Send WhatsApp'}</DialogTitle>
          <DialogDescription>{p?.customer ? `${p.customer.name} · ${p.toNumberDisplay || 'no number'}` : 'Choose a message and check the text before sending.'}</DialogDescription>
        </DialogHeader>
        {templates.isLoading ? <Skeleton className="h-40" /> : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wa-template">Message</Label>
              <NativeSelect id="wa-template" value={choice} onChange={(e) => setChoice(e.target.value)}>
                {usable.map((t) => <option key={t.id} value={t.id}>{purposeLabel(t.purpose)} ({t.name})</option>)}
                <option value={CUSTOM}>Type my own message</option>
              </NativeSelect>
            </div>
            {choice === CUSTOM && (
              <div className="space-y-1.5">
                <Label htmlFor="wa-text" required>Your message</Label>
                <Textarea id="wa-text" rows={4} maxLength={4000} placeholder="Assalam o Alaikum ..." value={text} onChange={(e) => setText(e.target.value)} />
                <p className="text-xs text-muted-foreground">Typed messages are sent from the WhatsApp app. The Cloud API needs an approved template to start a chat.</p>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={otherNumber} onChange={(e) => setOtherNumber(e.target.checked)} /> Send to a different number
            </label>
            {otherNumber && <Input aria-label="Mobile number" inputMode="tel" placeholder="0300-1234567" value={toNumber} onChange={(e) => setToNumber(e.target.value)} />}

            <div>
              <p className="mb-1.5 text-sm font-medium">Preview</p>
              {preview.isError ? <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage(preview.error)}</p>
                : !ready ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Type a message to see the preview.</p>
                : !p ? <Skeleton className="h-24" /> : (
                  <div className="rounded-xl bg-[#e7f8dc] p-3 text-sm leading-relaxed text-[#111b21] shadow-sm dark:bg-emerald-950/60 dark:text-emerald-50">
                    <p className="whitespace-pre-wrap">{p.text}</p>
                  </div>
                )}
            </div>
            {p && p.warnings.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                {p.warnings.map((w) => <li key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</li>)}
              </ul>
            )}
            {p && !p.cloudAvailable && (
              <p className="flex gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Automatic sending (Cloud API) is not available: {p.cloudReasons.join('; ')}. You can still open WhatsApp and press Send yourself.</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {canSend && p?.link && (
            <Button variant={p.cloudAvailable ? 'outline' : 'default'} asChild>
              <a href={p.link} target="_blank" rel="noopener noreferrer" onClick={() => manual.mutate()}><ExternalLink /> Open WhatsApp</a>
            </Button>
          )}
          {canSend && p?.cloudAvailable && <Button loading={cloud.isPending} onClick={() => cloud.mutate()}><Send /> Send now (Cloud API)</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
