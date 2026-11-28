import {
  AlertTriangle, Banknote, Building2, CreditCard, Crown, History, Package, BarChart3, BookOpen, CalendarCheck, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, DatabaseBackup, Download,
  ExternalLink, FileText, IdCard, Layers, LayoutDashboard, Lightbulb, ListChecks, Lock, MessageCircle, Printer, Receipt, RefreshCw, Ruler,
  Scissors, Search, Settings, ShieldCheck, Shirt, ShoppingCart, Table2, Truck, UserCog, Users, Wallet, WifiOff, type LucideIcon,
} from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { useAuth } from '@/store/auth';
import { GUIDE_PARTS, GUIDE_SECTIONS, type GuideBlock, type GuideSection, sectionText } from '@/features/guide';
import { useCan } from '@/hooks/use-permission';
import { cn } from '@/utils/cn';

const ICONS: Record<string, LucideIcon> = {
  BookOpen, Lock, ListChecks, LayoutDashboard, Settings, UserCog, ShieldCheck, Users, Ruler, Shirt, ClipboardList, Printer, Layers, Truck,
  ShoppingCart, IdCard, CalendarCheck, Scissors, Wallet, Banknote, Receipt, BarChart3, MessageCircle, WifiOff, RefreshCw, DatabaseBackup,
  CircleHelp, Download, Building2, CreditCard, Crown, History, Package, Table2,
};

/** "Press **Save**" -> Press <strong>Save</strong>. Guide text marks on-screen names with double stars. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <strong key={i} className="font-semibold text-foreground">{p}</strong> : <Fragment key={i}>{p}</Fragment>))}</>;
}

function BlockTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-base font-semibold text-foreground">{children}</h3>;
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case 'para':
      return <div>{block.title && <BlockTitle>{block.title}</BlockTitle>}<p className="text-sm leading-relaxed text-muted-foreground"><Rich text={block.text} /></p></div>;
    case 'steps':
      return (
        <div>
          <BlockTitle>{block.title}</BlockTitle>
          <ol className="space-y-2">
            {block.items.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span className="print-color-exact mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-gold">{i + 1}</span>
                <span className="min-w-0 flex-1 pt-0.5"><Rich text={item} /></span>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'options':
      return (
        <div>
          <BlockTitle>{block.title}</BlockTitle>
          <dl className="divide-y overflow-hidden rounded-xl border">
            {block.items.map((item, i) => (
              <div key={i} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4">
                <dt className="text-sm font-semibold text-foreground">{item.name}</dt>
                <dd className="text-sm leading-relaxed text-muted-foreground"><Rich text={item.text} /></dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case 'tip':
      return (
        <div className="flex gap-3 rounded-xl border border-primary/30 bg-gold-soft/60 p-3 text-sm leading-relaxed">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p><span className="sr-only">Tip: </span><Rich text={block.text} /></p>
        </div>
      );
    case 'warning':
      return (
        <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-relaxed text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p><span className="sr-only">Warning: </span><Rich text={block.text} /></p>
        </div>
      );
  }
}

function SectionView({ section, number, canOpen }: { section: GuideSection; number: number; canOpen: boolean }) {
  const Icon = ICONS[section.icon] ?? FileText;
  const part = GUIDE_PARTS.find((p) => p.key === section.part)?.label;
  return (
    <article className="guide-section" aria-labelledby={`guide-${section.id}`}>
      <header className="mb-4 flex flex-wrap items-start gap-3 border-b pb-4">
        <span className="print-color-exact icon-tile h-11 w-11 bg-navy text-gold [&_svg]:h-5 [&_svg]:w-5"><Icon /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Section {number} · {part}</p>
          <h2 id={`guide-${section.id}`} className="text-xl font-bold leading-tight">{section.title}</h2>
        </div>
        {section.path && section.path !== '/login' && (
          <div className="no-print w-full shrink-0 pl-14 sm:w-auto sm:pl-0">
            {canOpen ? (
              <Button asChild variant="gold" size="sm"><Link to={section.path}><ExternalLink />Open page</Link></Button>
            ) : (
              <Badge variant="secondary"><Lock className="h-3 w-3" />No access for your role</Badge>
            )}
          </div>
        )}
      </header>
      <p className="mb-5 text-[15px] leading-relaxed"><Rich text={section.summary} /></p>
      <div className="space-y-5">{section.blocks.map((b, i) => <Block key={i} block={b} />)}</div>
    </article>
  );
}

/** Documents: the built-in user guide, section by section from login to backups. */
export function DocumentsPage() {
  const can = useCan();
  const user = useAuth((st) => st.user);
  // Super Admin sections are shown only to the Super Admin.
  const sections = useMemo(() => GUIDE_SECTIONS.filter((x) => !x.superAdmin || !!user?.isSuperAdmin), [user?.isSuperAdmin]);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [printAll, setPrintAll] = useState(false);

  const index = Math.max(0, sections.findIndex((s) => s.id === params.get('s')));
  const current = sections[index]!;
  const term = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!term) return sections;
    const words = term.split(/\s+/);
    return sections.filter((s) => { const t = sectionText(s); return words.every((w) => t.includes(w)); });
  }, [term, sections]);

  const open = (id: string) => {
    setParams((p) => { p.set('s', id); return p; });
    // The layout scrolls inside <main>, not the window.
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const canOpen = (s: GuideSection) => !s.module || can(s.module);

  useEffect(() => {
    if (!printAll) return;
    const done = () => setPrintAll(false);
    window.addEventListener('afterprint', done);
    const t = window.setTimeout(() => window.print(), 100);
    return () => { window.clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [printAll]);

  const prev = sections[index - 1];
  const next = sections[index + 1];

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Documents"
          description={`User guide for every page of the ERP, step by step (${sections.length} sections).`}
          actions={(
            <>
              <Button variant="outline" onClick={() => setPrintAll(true)}><BookOpen />Print full guide</Button>
              <Button onClick={() => window.print()}><Printer />Print section</Button>
            </>
          )}
        />
      </div>

      <div className="print-only mb-4 border-b pb-2">
        <p className="text-lg font-bold">TailoringERP - User Guide</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="no-print space-y-3 lg:sticky lg:top-0 lg:self-start">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search the guide..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the guide" />
          </div>
          {term && <p className="px-1 text-xs text-muted-foreground">{matches.length} section{matches.length === 1 ? '' : 's'} found</p>}

          {/* Phones: a simple section picker */}
          <div className="lg:hidden">
            <NativeSelect value={current.id} onChange={(e) => open(e.target.value)} aria-label="Choose a section">
              {matches.map((s) => <option key={s.id} value={s.id}>{sections.indexOf(s) + 1}. {s.title}</option>)}
              {!matches.includes(current) && <option value={current.id}>{index + 1}. {current.title}</option>}
            </NativeSelect>
          </div>

          <Card className="hidden max-h-[calc(100vh-10rem)] overflow-y-auto p-2 lg:block">
            <nav aria-label="Guide sections">
              {!matches.length && <p className="p-3 text-sm text-muted-foreground">No section matches.</p>}
              {GUIDE_PARTS.map((part) => {
                const items = matches.filter((s) => s.part === part.key);
                if (!items.length) return null;
                return (
                  <div key={part.key} className="mb-2">
                    <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{part.label}</p>
                    {items.map((s) => {
                      const n = sections.indexOf(s) + 1;
                      const active = s.id === current.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => open(s.id)}
                          aria-current={active ? 'page' : undefined}
                          className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                            active ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-gold-soft/60')}
                        >
                          <span className={cn('w-5 shrink-0 text-right text-xs tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{n}</span>
                          <span className="min-w-0 flex-1 truncate">{s.title}</span>
                          {!canOpen(s) && <Lock className="h-3 w-3 shrink-0 opacity-60" aria-label="No access for your role" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </Card>
        </aside>

        <div className="min-w-0">
          {printAll ? (
            <div className="space-y-8">
              {sections.map((s, i) => (
                <Card key={s.id} className="p-5 print:break-inside-auto print:border-0 print:p-0 print:shadow-none">
                  <SectionView section={s} number={i + 1} canOpen={canOpen(s)} />
                </Card>
              ))}
            </div>
          ) : term && !matches.length ? (
            <Card><EmptyState icon={<Search />} title="No section matches" description="Try another word, e.g. order, payment, salary or backup." /></Card>
          ) : (
            <>
              <Card className="p-5 sm:p-6 print:border-0 print:p-0 print:shadow-none">
                <SectionView section={current} number={index + 1} canOpen={canOpen(current)} />
              </Card>
              <div className="no-print mt-4 grid grid-cols-2 gap-3">
                {prev ? (
                  <Button variant="outline" className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => open(prev.id)}>
                    <ChevronLeft /><span><span className="block text-xs font-normal text-muted-foreground">Previous</span>{prev.title}</span>
                  </Button>
                ) : <span />}
                {next && (
                  <Button variant="outline" className="h-auto justify-end whitespace-normal py-2 text-right" onClick={() => open(next.id)}>
                    <span><span className="block text-xs font-normal text-muted-foreground">Next</span>{next.title}</span><ChevronRight />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
