'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clipboard,
  FileText,
  Fingerprint,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  statuses,
  type Draft,
  type Job,
  type JobInput,
  type Profile,
  type Tracking,
  type Extraction,
} from '@/lib/contracts';
import { matchProfile } from '@/lib/matching';
import { ProfileEditor, RequirementsEditor } from './review-editors';

type View = 'overview' | 'jobs' | 'profile' | 'followups';
type Activity = { kind: string; detail: string; createdAt: string };
const blank: JobInput = {
  company: '',
  position: '',
  location: '',
  employmentType: 'Full-time',
  salary: '',
  sourceUrl: '',
  description: '',
  synthetic: false,
};
const fmt = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
async function api<T>(command?: unknown, query = ''): Promise<T> {
  const response = await fetch(
    '/api/tracker' + query,
    command
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        }
      : { cache: 'no-store' },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed');
  return data;
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <span />
      {status}
    </span>
  );
}
function CompanyMark({ name }: { name: string }) {
  return (
    <span className={`company-mark tone-${name.length % 5}`}>
      {name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const root = ref.current;
    root?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && root) {
        const focusables = [
          ...root.querySelectorAll<HTMLElement>('button,input,textarea,select,a[href]'),
        ].filter((el) => !el.hasAttribute('disabled'));
        const first = focusables[0],
          last = focusables.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Tracker() {
  const [jobs, setJobs] = useState<Job[]>([]),
    [profile, setProfile] = useState<Profile | null>(null),
    [syntheticResume, setSyntheticResume] = useState('');
  const [view, setView] = useState<View>('overview'),
    [selected, setSelected] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('All statuses'),
    [duplicateOnly, setDuplicateOnly] = useState(false);
  const [modal, setModal] = useState<'add' | 'import' | 'edit' | null>(null),
    [editing, setEditing] = useState<JobInput>(blank),
    [csv, setCsv] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]),
    [events, setEvents] = useState<Activity[]>([]),
    [detailTab, setDetailTab] = useState('Requirements'),
    [detailsLoading, setDetailsLoading] = useState(false);
  const [requirementsEditor, setRequirementsEditor] = useState<string | null>(null),
    [confirm, setConfirm] = useState<'delete' | 'profile' | null>(null);
  const [resume, setResume] = useState(''),
    [profileEditor, setProfileEditor] = useState(''),
    [verified, setVerified] = useState(false);
  const [tracking, setTracking] = useState<Tracking>({
    status: 'Saved',
    appliedDate: '',
    followUpDate: '',
    notes: '',
  });
  const [draftText, setDraftText] = useState(''),
    [approve, setApprove] = useState(false);
  const requestVersion = useRef(0);
  async function refresh() {
    const data = await api<{ jobs: Job[]; profile: Profile | null; syntheticResume: string }>();
    setJobs(data.jobs);
    setProfile(data.profile);
    setSyntheticResume(data.syntheticResume);
    return data;
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (profile) {
      setResume(profile.resume);
      setProfileEditor(
        JSON.stringify({ skills: profile.skills, experience: profile.experience }, null, 2),
      );
      setVerified(profile.verified);
    }
  }, [profile]);
  async function loadDetail(id: string) {
    const version = ++requestVersion.current;
    setDetailsLoading(true);
    try {
      const d = await api<{ drafts: Draft[]; events: Activity[] }>(undefined, `?id=${id}`);
      if (version !== requestVersion.current) return;
      setDrafts(d.drafts);
      setEvents(d.events);
      setDraftText(d.drafts[0]?.text || '');
      setApprove(false);
    } finally {
      if (version === requestVersion.current) setDetailsLoading(false);
    }
  }
  useEffect(() => {
    if (!selected) {
      requestVersion.current++;
      return;
    }
    const job = jobs.find((j) => j.id === selected);
    if (job)
      setTracking({
        status: job.status,
        appliedDate: job.appliedDate,
        followUpDate: job.followUpDate,
        notes: job.notes,
      });
    loadDetail(selected).catch((e) => setError(e.message));
  }, [selected, jobs]);
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy('');
    }
  }
  async function mutate(command: unknown, message: string) {
    await api(command);
    await refresh();
    setNotice(message);
  }
  const active = jobs.find((j) => j.id === selected),
    fit = matchProfile(profile, active?.extraction || null);
  const liveCount = jobs.filter(
    (j) =>
      j.extraction?.provider === 'ollama' || j.extraction?.originalInference?.provider === 'ollama',
  ).length;
  const followups = jobs.filter(
    (j) => j.followUpDate && j.followUpDate <= today() && !['Offer', 'Rejected'].includes(j.status),
  );
  const counts = Object.fromEntries(
    statuses.map((s) => [s, jobs.filter((j) => j.status === s).length]),
  );
  const filtered = jobs.filter(
    (j) =>
      (filter === 'All statuses' || j.status === filter) &&
      (!duplicateOnly || j.nearDuplicates.length > 0) &&
      (view !== 'followups' || followups.some((f) => f.id === j.id)) &&
      `${j.company} ${j.position} ${j.location} ${j.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function openJob(j: Job) {
    setSelected(j.id);
    setDetailTab('Requirements');
    setRequirementsEditor(null);
    setError('');
    setNotice('');
  }
  function navigate(next: View) {
    setView(next);
    setSelected(null);
    setError('');
    setNotice('');
  }
  function openAdd() {
    setEditing({ ...blank });
    setModal('add');
  }
  async function submitJob(e: FormEvent) {
    e.preventDefault();
    await run('Saving job', async () => {
      const result = await api<Job>({
        action: modal === 'edit' ? 'edit' : 'add',
        ...(modal === 'edit' ? { id: selected } : {}),
        job: editing,
      });
      await refresh();
      setModal(null);
      setSelected(result.id);
      setNotice('Job saved locally.');
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Rolecraft home">
          <span className="brand-symbol">
            <BriefcaseBusiness size={21} />
          </span>
          rolecraft<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          YOUR WORKSPACE <span>LOCAL</span>
        </div>
        <nav aria-label="Main navigation">
          {(
            [
              ['overview', LayoutDashboard, 'Overview'],
              ['jobs', BriefcaseBusiness, 'Opportunities'],
              ['profile', FileText, 'My profile'],
              ['followups', Clipboard, 'Follow-ups'],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={view === id && !selected ? 'nav-link active' : 'nav-link'}
            >
              <Icon size={18} />
              {label}
              {id === 'jobs' && <span className="nav-count">{jobs.length}</span>}
              {id === 'followups' && followups.length > 0 && (
                <span className="nav-count">{followups.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-card">
            <ShieldCheck size={21} />
            <strong>Your career. Your data.</strong>
            <p>
              Stored on this device.
              <br />
              Only local AI, on your terms.
            </p>
            <span>
              <span className="green-dot" /> Local-first workspace
            </span>
          </div>
          <div className="workspace-user">
            <span className="avatar">Y</span>
            <div>
              <strong>Personal workspace</strong>
              <small>No account needed</small>
            </div>
            <LockKeyhole size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <ChevronRight size={14} />
            <span>
              {active
                ? 'Opportunity details'
                : view === 'profile'
                  ? 'My profile'
                  : view === 'jobs'
                    ? 'Opportunities'
                    : view === 'followups'
                      ? 'Follow-ups'
                      : 'Overview'}
            </span>
          </div>
          <span className="private-label">
            <span className="green-dot" />
            Private & local
          </span>
        </header>
        <main id="main-content">
          {error && !modal && !confirm && (
            <div className="banner error" role="alert">
              <div>
                <strong>Something needs your attention</strong>
                <p>{error}</p>
              </div>
              <button
                aria-label="Dismiss error"
                className="icon-button"
                onClick={() => setError('')}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {notice && (
            <div className="banner success" role="status">
              <CheckCircle2 size={18} />
              {notice}
              <button
                aria-label="Dismiss notification"
                className="icon-button"
                onClick={() => setNotice('')}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              Opening your local workspace…
            </div>
          ) : active ? (
            <>
              <button className="back-link" onClick={() => setSelected(null)}>
                <ArrowLeft size={16} /> Back to opportunities
              </button>
              <div className="detail-hero">
                <CompanyMark name={active.company} />
                <div>
                  <div className="eyebrow">
                    {active.company}{' '}
                    {active.synthetic && <span className="synthetic-label">SYNTHETIC</span>}
                  </div>
                  <h1>{active.position}</h1>
                  <p>
                    <MapPin size={14} />
                    {active.location}
                    <span>·</span>
                    {active.employmentType}
                    <span>·</span>
                    {active.salary || 'Salary not listed'}
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    setEditing({
                      company: active.company,
                      position: active.position,
                      location: active.location,
                      employmentType: active.employmentType,
                      salary: active.salary,
                      sourceUrl: active.sourceUrl,
                      description: active.description,
                      synthetic: active.synthetic,
                    });
                    setModal('edit');
                  }}
                >
                  Edit job
                </button>
              </div>
              {active.nearDuplicates.length > 0 && (
                <div className="banner warning">
                  <Fingerprint size={20} />
                  <div>
                    <strong>Possible duplicate — review before applying</strong>
                    {active.nearDuplicates.map((d) => (
                      <div className="duplicate-row" key={d.id}>
                        <button className="text-button" onClick={() => setSelected(d.id)}>
                          {d.company} · {d.position}
                        </button>
                        <button
                          className="button small secondary"
                          disabled={!!busy}
                          onClick={() =>
                            run('Reviewing duplicate', () =>
                              mutate(
                                { action: 'keep-both', id: active.id, otherId: d.id },
                                'Both records kept. Duplicate pair reviewed.',
                              ),
                            )
                          }
                        >
                          Keep both
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="detail-grid">
                <section className="panel detail-main">
                  <div className="tabs" role="tablist" aria-label="Opportunity sections">
                    {['Requirements', 'Fit comparison', 'Drafts', 'Description'].map((t) => (
                      <button
                        role="tab"
                        aria-selected={detailTab === t}
                        key={t}
                        onClick={() => setDetailTab(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {detailTab === 'Requirements' && (
                    <div className="panel-content">
                      <div className="section-heading">
                        <div>
                          <h2>Understand the role</h2>
                          <p>Evidence first. Every requirement links to the source.</p>
                        </div>
                        <Sparkles size={20} />
                      </div>
                      <div className="ai-notice">
                        <LockKeyhole size={16} />
                        <span>
                          Job text stays on your device. Extraction uses local Ollama · Qwen3 4B.
                        </span>
                      </div>
                      <div className="action-row">
                        <button
                          className="button primary"
                          disabled={!!busy}
                          onClick={() =>
                            run('Running local inference', async () => {
                              try {
                                await api({ action: 'extract', id: active.id });
                                setNotice('Genuine local Ollama inference validated and saved.');
                              } finally {
                                await refresh();
                              }
                            })
                          }
                        >
                          {busy === 'Running local inference' ? (
                            <LoaderCircle size={16} className="spin" />
                          ) : (
                            <Sparkles size={16} />
                          )}{' '}
                          {busy === 'Running local inference'
                            ? 'Extracting locally… (up to 5 min)'
                            : active.extraction
                              ? 'Re-extract with Ollama'
                              : 'Extract with Ollama'}
                        </button>
                        <button
                          className="button secondary"
                          onClick={() =>
                            setRequirementsEditor(
                              JSON.stringify(
                                { requirements: active.extraction?.requirements || [] },
                                null,
                                2,
                              ),
                            )
                          }
                        >
                          Review / enter requirements
                        </button>
                      </div>
                      {active.extractionError && (
                        <div className="banner error" role="alert">
                          Last extraction failed: {active.extractionError}{' '}
                          {active.extraction && 'The previous validated extraction remains saved.'}
                        </div>
                      )}
                      {active.extraction ? (
                        <>
                          <div className="provenance">
                            <span className="green-dot" />
                            {active.extraction.provider === 'ollama'
                              ? 'Actual local Ollama inference'
                              : 'Human-entered / corrected · not live AI'}
                            <span>{fmt(active.extraction.at)}</span>
                          </div>
                          {active.extraction.originalInference && (
                            <p className="field-help">
                              Original local Ollama inference retained:{' '}
                              {active.extraction.originalInference.model} ·{' '}
                              {fmt(active.extraction.originalInference.at)}. Current requirements
                              include human corrections.
                            </p>
                          )}
                          <div className="requirement-list">
                            {active.extraction.requirements.map((r, i) => (
                              <div className="requirement" key={i}>
                                <div>
                                  <strong>{r.term}</strong>
                                  <span className={`priority ${r.priority}`}>{r.priority}</span>
                                  <small>
                                    {r.kind}
                                    {r.minYears !== null ? ` · ${r.minYears}+ years` : ''}
                                  </small>
                                </div>
                                <blockquote>“{r.evidence}”</blockquote>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="empty-state compact">
                          <Sparkles size={28} />
                          <h3>No requirements extracted yet</h3>
                          <p>
                            Run local inference or enter source-backed requirements manually.
                            <br />
                            No demo extraction is presented as a real AI result.
                          </p>
                        </div>
                      )}
                      {requirementsEditor !== null && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            run('Saving requirements', async () => {
                              await mutate(
                                {
                                  action: 'requirements',
                                  id: active.id,
                                  extraction: JSON.parse(requirementsEditor),
                                },
                                'Human-reviewed requirements saved. Fit recalculated.',
                              );
                              setRequirementsEditor(null);
                            });
                          }}
                        >
                          <fieldset className="review-form" disabled={!!busy}>
                            <legend className="sr-only">Review job requirements</legend>
                            <details className="review-source">
                              <summary>Job description for evidence review</summary>
                              <p>{active.description}</p>
                            </details>
                            <RequirementsEditor
                              value={requirementsEditor}
                              onChange={setRequirementsEditor}
                            />
                            <div className="action-row">
                              <button disabled={!!busy} className="button primary">
                                Save human review
                              </button>
                              <button
                                type="button"
                                className="button secondary"
                                onClick={() => setRequirementsEditor(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </fieldset>
                        </form>
                      )}
                    </div>
                  )}
                  {detailTab === 'Fit comparison' && (
                    <div className="panel-content">
                      <div className="section-heading">
                        <div>
                          <h2>A score you can inspect</h2>
                          <p>A measure of documented alignment, never a hiring probability.</p>
                        </div>
                      </div>
                      {fit ? (
                        <>
                          <div className="fit-summary">
                            <div className="fit-number">
                              {fit.score === null ? '—' : fit.score}
                              <small>{fit.score === null ? 'unscored' : '/ 100'}</small>
                            </div>
                            <div>
                              <strong>
                                {fit.earned} of {fit.possible} weighted points
                              </strong>
                              <p>
                                {fit.matched} matched · {fit.missing} missing · {fit.unknown}{' '}
                                unknown
                              </p>
                            </div>
                          </div>
                          <p className="field-help">
                            Required = 3 points. Preferred = 1. Matched evidence earns full points.
                            Missing and unresolved requirements earn 0; unresolved weighted
                            requirements stay in the denominator. Unknown priority has weight 0.
                            Responsibilities and constraints need human assessment. Scores update
                            when verified evidence or requirements change.
                          </p>
                          <div className="fit-list">
                            {fit.rows.map((r, i) => (
                              <div className="fit-row" key={i}>
                                <div>
                                  <span className={`result-dot ${r.result}`} />
                                  <strong>{r.term}</strong>
                                  <span className={`priority ${r.priority}`}>{r.priority}</span>
                                  <span className="contribution">
                                    +{r.points} / {r.weight}
                                  </span>
                                </div>
                                <p className={`result-label ${r.result}`}>{r.result}</p>
                                <p>{r.profileEvidence}</p>
                                <details>
                                  <summary>Job evidence</summary>
                                  <blockquote>{r.evidence}</blockquote>
                                </details>
                              </div>
                            ))}
                          </div>
                          <button className="text-button" onClick={() => navigate('profile')}>
                            Correct résumé evidence <ArrowRight size={14} />
                          </button>
                        </>
                      ) : (
                        <div className="empty-state">
                          <CircleHelp size={28} />
                          <h3>Let’s establish the evidence</h3>
                          <p>
                            Save a verified résumé profile and extract or review this role’s
                            requirements to calculate a reproducible fit score.
                          </p>
                          <button className="button secondary" onClick={() => navigate('profile')}>
                            Review my profile
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {detailTab === 'Drafts' && (
                    <div className="panel-content">
                      <div className="section-heading">
                        <div>
                          <h2>A thoughtful first introduction</h2>
                          <p>Evidence-based template · editable · never sent automatically.</p>
                        </div>
                      </div>
                      <button
                        className="button primary"
                        disabled={!!busy}
                        onClick={() =>
                          run('Creating draft', () =>
                            mutate(
                              { action: 'draft-create', id: active.id },
                              'Evidence-based draft created for your review.',
                            ),
                          )
                        }
                      >
                        <FileText size={16} /> Create tailored draft
                      </button>
                      {detailsLoading ? (
                        <p role="status">Loading drafts…</p>
                      ) : drafts.length ? (
                        <>
                          <div className="draft-heading">
                            <Badge status={drafts[0].status} />
                            <span>{fmt(drafts[0].createdAt)}</span>
                          </div>
                          {drafts[0].stale && (
                            <div className="banner warning">
                              Source evidence changed. This draft’s history is preserved. Create a
                              fresh draft before approval.
                            </div>
                          )}
                          <label>
                            Cover note
                            <textarea
                              aria-label="Cover note"
                              rows={10}
                              value={draftText}
                              maxLength={5000}
                              onChange={(e) => {
                                setDraftText(e.target.value);
                                setApprove(false);
                              }}
                            />
                          </label>
                          <details>
                            <summary>Résumé evidence used</summary>
                            {drafts[0].evidence.map((e, i) => (
                              <blockquote key={i}>{e}</blockquote>
                            ))}
                          </details>
                          <div className="action-row">
                            <button
                              className="button secondary"
                              disabled={!!busy}
                              onClick={() =>
                                run('Saving draft', () =>
                                  mutate(
                                    {
                                      action: 'draft-update',
                                      id: active.id,
                                      draftId: drafts[0].id,
                                      text: draftText,
                                      status: 'pending',
                                      approved: false,
                                    },
                                    'Draft edits saved as pending. Review before approving.',
                                  ),
                                )
                              }
                            >
                              Save edits as pending
                            </button>
                            <button
                              className="text-button danger"
                              disabled={!!busy}
                              onClick={() =>
                                run('Rejecting draft', () =>
                                  mutate(
                                    {
                                      action: 'draft-update',
                                      id: active.id,
                                      draftId: drafts[0].id,
                                      text: draftText,
                                      status: 'rejected',
                                      approved: false,
                                    },
                                    'Draft rejected.',
                                  ),
                                )
                              }
                            >
                              Reject
                            </button>
                          </div>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={approve}
                              onChange={(e) => setApprove(e.target.checked)}
                              disabled={drafts[0].stale}
                            />
                            I reviewed this draft and confirm every claim is accurate.
                          </label>
                          <div className="action-row">
                            <button
                              className="button primary"
                              disabled={
                                !approve ||
                                !!busy ||
                                drafts[0].stale ||
                                drafts[0].text !== draftText
                              }
                              onClick={() =>
                                run('Approving draft', () =>
                                  mutate(
                                    {
                                      action: 'draft-update',
                                      id: active.id,
                                      draftId: drafts[0].id,
                                      text: draftText,
                                      status: 'approved',
                                      approved: true,
                                    },
                                    'Draft approved by you. Nothing has been sent.',
                                  ),
                                )
                              }
                            >
                              <Check size={16} /> Approve draft
                            </button>
                            <button
                              className="button secondary"
                              disabled={
                                drafts[0].status !== 'approved' ||
                                drafts[0].stale ||
                                draftText !== drafts[0].text
                              }
                              onClick={() =>
                                run('Copying draft', async () => {
                                  await navigator.clipboard.writeText(drafts[0].text);
                                  setNotice('Approved draft copied. Nothing was sent.');
                                })
                              }
                            >
                              <Clipboard size={16} /> Copy approved draft
                            </button>
                          </div>
                          {drafts.length > 1 && (
                            <details className="draft-history">
                              <summary>Previous drafts ({drafts.length - 1})</summary>
                              {drafts.slice(1).map((d) => (
                                <article key={d.id}>
                                  <Badge status={d.status} />
                                  <small>
                                    {fmt(d.createdAt)}{' '}
                                    {d.approvedAt && `· Approved ${fmt(d.approvedAt)}`}
                                    {d.stale && ' · Context changed'}
                                  </small>
                                  <p className="preserve-text">{d.text}</p>
                                </article>
                              ))}
                            </details>
                          )}
                        </>
                      ) : (
                        <div className="empty-state compact">
                          <FileText size={28} />
                          <h3>Your draft starts with your evidence</h3>
                          <p>
                            At least one verified skill must match the role before a draft can be
                            created.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {detailTab === 'Description' && (
                    <div className="panel-content">
                      <h2>Original job description</h2>
                      <p className="preserve-text description-text">{active.description}</p>
                      {active.sourceUrl && (
                        <a
                          className="text-button"
                          href={active.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View supplied source <ArrowUpRight size={14} />
                        </a>
                      )}
                    </div>
                  )}
                </section>
                <aside className="detail-aside">
                  <section className="panel">
                    <div className="panel-content">
                      <h2>Application progress</h2>
                      <p className="muted">Your decisions, tracked locally.</p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          run('Saving progress', () =>
                            mutate(
                              { action: 'tracking', id: active.id, tracking },
                              'Application progress saved. No submission or message was sent.',
                            ),
                          );
                        }}
                      >
                        <label>
                          Status
                          <select
                            aria-label="Status"
                            value={tracking.status}
                            onChange={(e) =>
                              setTracking({ ...tracking, status: e.target.value as Job['status'] })
                            }
                          >
                            {statuses.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Application date
                          <input
                            type="date"
                            value={tracking.appliedDate}
                            onChange={(e) =>
                              setTracking({ ...tracking, appliedDate: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Follow-up date
                          <input
                            type="date"
                            value={tracking.followUpDate}
                            onChange={(e) =>
                              setTracking({ ...tracking, followUpDate: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Private notes
                          <textarea
                            aria-label="Private notes"
                            rows={4}
                            maxLength={6000}
                            value={tracking.notes}
                            onChange={(e) => setTracking({ ...tracking, notes: e.target.value })}
                            placeholder="Conversations, next steps, things to ask…"
                          />
                        </label>
                        <button className="button primary full" disabled={!!busy}>
                          Save progress
                        </button>
                      </form>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-content">
                      <h2>Activity & score changes</h2>
                      {detailsLoading ? (
                        <p>Loading history…</p>
                      ) : events.length ? (
                        events.map((ev, i) => (
                          <div className="activity" key={i}>
                            <span className="activity-dot" />
                            <div>
                              <p>{ev.detail}</p>
                              <small>{fmt(ev.createdAt)}</small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="muted">Changes to status and fit will appear here.</p>
                      )}
                    </div>
                  </section>
                  <button className="text-button danger" onClick={() => setConfirm('delete')}>
                    Delete opportunity
                  </button>
                </aside>
              </div>
            </>
          ) : view === 'profile' ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">THE FOUNDATION</div>
                  <h1>Your experience, clearly represented.</h1>
                  <p>Review your evidence once. Make every comparison more useful.</p>
                </div>
                <span className="privacy-chip">
                  <LockKeyhole size={15} /> Stays on this device
                </span>
              </div>
              <div className="profile-grid">
                <section className="panel">
                  <div className="panel-content">
                    <div className="section-heading">
                      <div>
                        <h2>Résumé text</h2>
                        <p>Paste plain text. No uploads or external services.</p>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="resume-text">Your résumé</label>
                      <textarea
                        id="resume-text"
                        rows={17}
                        minLength={30}
                        maxLength={16000}
                        value={resume}
                        onChange={(e) => {
                          setResume(e.target.value);
                          setVerified(false);
                        }}
                        placeholder="Paste your experience, projects and skills…"
                      />
                    </div>
                    <div className="action-row">
                      <button
                        className="button primary"
                        disabled={!!busy || resume.trim().length < 30}
                        onClick={() =>
                          run('Extracting evidence', async () => {
                            const p = await api<Profile>({ action: 'profile-extract', resume });
                            setProfileEditor(
                              JSON.stringify(
                                { skills: p.skills, experience: p.experience },
                                null,
                                2,
                              ),
                            );
                            setVerified(false);
                            setNotice(
                              'Literal skill mentions extracted locally using rules, not AI. Review before verifying. Experience years require explicit evidence.',
                            );
                          })
                        }
                      >
                        Extract skill evidence <ArrowRight size={16} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setResume(syntheticResume);
                          setVerified(false);
                          setProfileEditor('');
                        }}
                      >
                        Use synthetic résumé
                      </button>
                    </div>
                    <p className="field-help">
                      Extraction finds literal mentions from a bounded skill dictionary. It does not
                      infer proficiency, years, degrees or achievements.
                    </p>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-content">
                    <div className="section-heading">
                      <div>
                        <h2>Review structured profile</h2>
                        <p>
                          {profile?.verified
                            ? 'Verified profile saved'
                            : 'Your confirmation is required before matching'}
                        </p>
                      </div>
                      <ShieldCheck size={20} />
                    </div>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        run('Saving verified profile', async () => {
                          const reviewed = JSON.parse(profileEditor);
                          await mutate(
                            { action: 'profile-save', profile: { resume, ...reviewed, verified } },
                            'Verified profile saved locally. Fit scores recalculated.',
                          );
                        });
                      }}
                    >
                      <fieldset className="review-form" disabled={!!busy}>
                        <legend className="sr-only">Review résumé profile</legend>
                        <ProfileEditor
                          value={profileEditor}
                          onChange={(value) => {
                            setProfileEditor(value);
                            setVerified(false);
                          }}
                        />
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={verified}
                            onChange={(e) => setVerified(e.target.checked)}
                          />
                          I reviewed the evidence and confirm this profile is accurate.
                        </label>
                        <button
                          className="button primary full"
                          disabled={!!busy || !profileEditor || !verified}
                        >
                          <Check size={16} /> Save verified profile
                        </button>
                      </fieldset>
                    </form>
                    {profile && (
                      <button
                        className="text-button danger erase-profile"
                        onClick={() => setConfirm('profile')}
                      >
                        Erase résumé and all drafts
                      </button>
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {view === 'overview'
                      ? 'A LITTLE CLARITY FOR YOUR NEXT CHAPTER'
                      : view === 'followups'
                        ? 'KEEP THE CONVERSATION MOVING'
                        : 'YOUR NEXT CHAPTER, ORGANIZED'}
                  </div>
                  <h1>
                    {view === 'overview'
                      ? 'Make your next move a considered one.'
                      : view === 'followups'
                        ? 'The right time to reconnect.'
                        : 'Good opportunities deserve a closer look.'}
                  </h1>
                  <p>
                    {view === 'overview'
                      ? 'A calm workspace for opportunities, evidence, and everything that comes next.'
                      : view === 'followups'
                        ? 'Due and overdue reminders, with the context you saved.'
                        : 'Save the roles that matter. Understand where you fit.'}
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setCsv('');
                      setModal('import');
                    }}
                  >
                    <Upload size={16} /> Import CSV
                  </button>
                  <button className="button primary" onClick={openAdd}>
                    <Plus size={17} /> Add opportunity
                  </button>
                </div>
              </div>
              {view === 'overview' && (
                <>
                  <div className="stats-grid">
                    <Stat
                      title="Total opportunities"
                      value={jobs.length}
                      label="Your possibilities, in one place"
                      icon={<BriefcaseBusiness size={18} />}
                    />
                    <Stat
                      title="Applications sent"
                      value={jobs.filter((j) => j.status !== 'Saved').length}
                      label={`${counts.Applied} awaiting a response`}
                      icon={<ArrowUpRight size={18} />}
                    />
                    <Stat
                      title="In conversation"
                      value={counts.Interview}
                      label="Interviews in progress"
                      icon={<FileText size={18} />}
                    />
                    <Stat
                      title="Offers received"
                      value={counts.Offer}
                      label="A new chapter within reach"
                      icon={<CheckCircle2 size={18} />}
                      accent
                    />
                  </div>
                  <div className="overview-middle">
                    <section className="panel pipeline-panel">
                      <div className="section-heading">
                        <div>
                          <h2>Your application journey</h2>
                          <p>Every step is progress.</p>
                        </div>
                        <span className="quiet-tag">ALL TIME</span>
                      </div>
                      <div className="pipeline">
                        {statuses.map((s, i) => (
                          <div className="pipeline-step" key={s}>
                            <div>
                              <span className={`stage-dot stage-${i}`} />
                              <span>{s}</span>
                            </div>
                            <strong>{counts[s]}</strong>
                            <div className="stage-bar">
                              <span
                                style={{
                                  width: `${jobs.length ? Math.max(4, (counts[s] / jobs.length) * 100) : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="pipeline-caption">
                        <span>
                          <span className="green-dot" />
                          Updated from your saved decisions
                        </span>
                        <span>
                          {followups.length} follow-up{followups.length === 1 ? '' : 's'} due
                        </span>
                      </div>
                    </section>
                    <section className="insight-card">
                      <div className="insight-icon">
                        <Sparkles size={21} />
                        <span>THOUGHTFUL, LOCAL AI</span>
                      </div>
                      <h2>
                        Find the fit.
                        <br />
                        See the evidence.
                      </h2>
                      <p>
                        Compare your experience with a role’s requirements. Every match has a reason
                        you can review.
                      </p>
                      <button className="text-button" onClick={() => navigate('profile')}>
                        {profile?.verified ? 'Review your profile' : 'Set up your profile'}
                        <ArrowRight size={16} />
                      </button>
                      <div className="insight-footer">
                        <LockKeyhole size={13} />
                        {liveCount
                          ? `${liveCount} real local extraction${liveCount === 1 ? '' : 's'} saved`
                          : 'Live inference not yet verified'}
                      </div>
                    </section>
                  </div>
                </>
              )}
              <section className="panel opportunities">
                <div className="section-heading table-heading">
                  <div>
                    <h2>
                      {view === 'followups'
                        ? 'Follow-ups due'
                        : view === 'overview'
                          ? 'Your opportunities'
                          : 'All opportunities'}{' '}
                      <span className="number-pill">
                        {view === 'followups' ? followups.length : jobs.length}
                      </span>
                    </h2>
                    <p>
                      {view === 'followups'
                        ? 'Reminders are shown here. No messages are sent.'
                        : 'A small step today. A better-informed decision tomorrow.'}
                    </p>
                  </div>
                  <a className="export-link" href="/api/tracker?export=1">
                    <ArrowDownToLine size={15} /> Export CSV
                  </a>
                </div>
                <div className="table-toolbar">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Search opportunities"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search role, company, or keyword…"
                    />
                  </label>
                  <div className="filter-controls">
                    <label className="sr-only" htmlFor="status-filter">
                      Filter by status
                    </label>
                    <select
                      id="status-filter"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option>All statuses</option>
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      className={`duplicate-filter ${duplicateOnly ? 'selected' : ''}`}
                      aria-pressed={duplicateOnly}
                      onClick={() => setDuplicateOnly(!duplicateOnly)}
                    >
                      <Fingerprint size={16} /> Duplicates{' '}
                      {jobs.filter((j) => j.nearDuplicates.length).length > 0 && (
                        <span>{jobs.filter((j) => j.nearDuplicates.length).length}</span>
                      )}
                    </button>
                  </div>
                </div>
                {filtered.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>ROLE & COMPANY</th>
                          <th>LOCATION</th>
                          <th>
                            FIT SCORE <CircleHelp size={12} />
                          </th>
                          <th>STATUS</th>
                          <th>SAVED</th>
                          <th>
                            <span className="sr-only">Open</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((j) => {
                          const m = matchProfile(profile, j.extraction);
                          return (
                            <tr key={j.id}>
                              <td>
                                <div className="role-cell">
                                  <CompanyMark name={j.company} />
                                  <div>
                                    <button className="role-link" onClick={() => openJob(j)}>
                                      {j.position}
                                    </button>
                                    <div className="company-line">
                                      {j.company}
                                      {j.synthetic && (
                                        <span className="synthetic-label">SYNTHETIC</span>
                                      )}
                                      {j.nearDuplicates.length > 0 && (
                                        <span
                                          className="duplicate-hint"
                                          title="Potential duplicate needs review"
                                        >
                                          <Fingerprint size={13} />
                                          <span className="sr-only">Potential duplicate</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className="location-cell">{j.location}</span>
                                <small>{j.employmentType}</small>
                              </td>
                              <td>
                                {m?.score !== null && m?.score !== undefined ? (
                                  <div className="score-cell">
                                    <strong>
                                      {m.score}
                                      <span>%</span>
                                    </strong>
                                    <div>
                                      <span style={{ width: `${m.score}%` }} />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="unscored">Not assessed</span>
                                )}
                              </td>
                              <td>
                                <Badge status={j.status} />
                              </td>
                              <td className="date-cell">{fmt(j.createdAt)}</td>
                              <td>
                                <button
                                  className="row-open"
                                  aria-label={`Open ${j.position} at ${j.company}`}
                                  onClick={() => openJob(j)}
                                >
                                  <ArrowUpRight size={17} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <BriefcaseBusiness size={30} />
                    <h3>
                      {jobs.length
                        ? 'No opportunities match this view'
                        : 'Your next chapter starts here'}
                    </h3>
                    <p>
                      {jobs.length
                        ? 'Try a different keyword or status filter.'
                        : 'Add a role, import a CSV, or explore with 20 explicitly synthetic opportunities.'}
                    </p>
                    {!jobs.length && (
                      <button
                        className="button primary"
                        disabled={!!busy}
                        onClick={() =>
                          run('Loading fixtures', () =>
                            mutate(
                              { action: 'fixtures' },
                              '20 synthetic opportunities imported. These are fictional vacancies.',
                            ),
                          )
                        }
                      >
                        Load 20 synthetic jobs <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    {filtered.length} opportunit{filtered.length === 1 ? 'y' : 'ies'}
                    {jobs.some((j) => j.synthetic) && ' · Synthetic records are labeled'}
                  </span>
                  <span>
                    <ShieldCheck size={13} />
                    Only you decide what happens next
                  </span>
                </div>
              </section>
              <div className="workspace-footer">
                <span>
                  <LockKeyhole size={13} /> Local storage. No tracking. No automatic submissions.
                </span>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() =>
                    run('Loading fixtures', async () => {
                      const r = await api<{ imported: number; duplicates: number }>({
                        action: 'fixtures',
                      });
                      await refresh();
                      setNotice(
                        `${r.imported} synthetic jobs imported. ${r.duplicates} exact duplicates skipped.`,
                      );
                    })
                  }
                >
                  Load synthetic examples <ArrowRight size={13} />
                </button>
              </div>
            </>
          )}
        </main>
      </div>
      {modal &&
        (modal === 'import' ? (
          <Modal title="Import opportunities" onClose={() => setModal(null)}>
            <p className="muted">
              Up to 200 rows · 500 KB · UTF-8 CSV. Imports validate before writing. Exact duplicates
              are skipped; possible duplicates remain for review.
            </p>
            <div className="upload-zone">
              <Upload size={26} />
              <label>
                Choose a CSV file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 512000) {
                      setError('CSV exceeds 500 KB');
                      return;
                    }
                    file
                      .text()
                      .then(setCsv)
                      .catch(() => setError('Could not read CSV file'));
                  }}
                />
              </label>
            </div>
            <label>
              Or paste CSV
              <textarea
                rows={7}
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                maxLength={512000}
                placeholder="company,position,location,employmentType,salary,sourceUrl,description,synthetic"
              />
            </label>
            <p className="field-help">
              Required: company, position, location, description (30+ characters). employmentType:
              Full-time, Part-time, Contract, Internship or Unknown. Optional: salary, sourceUrl,
              synthetic (true/false).{' '}
              <a href="/synthetic-jobs.csv" download>
                Download the synthetic fixture CSV
              </a>
              .
            </p>
            <button
              className="button primary full"
              disabled={!!busy || !csv.trim()}
              onClick={() =>
                run('Importing CSV', async () => {
                  const r = await api<{ imported: number; duplicates: number }>({
                    action: 'import',
                    csv,
                  });
                  await refresh();
                  setModal(null);
                  setNotice(
                    `${r.imported} jobs imported. ${r.duplicates} exact duplicates skipped. Near duplicates retained for review.`,
                  );
                })
              }
            >
              {busy === 'Importing CSV' ? 'Validating…' : 'Validate & import'}
            </button>
          </Modal>
        ) : (
          <Modal
            title={modal === 'edit' ? 'Edit opportunity' : 'Add an opportunity'}
            onClose={() => setModal(null)}
            wide
          >
            <form onSubmit={submitJob}>
              <div className="form-grid">
                <label>
                  Company
                  <input
                    required
                    maxLength={160}
                    value={editing.company}
                    onChange={(e) => setEditing({ ...editing, company: e.target.value })}
                    placeholder="Company name"
                  />
                </label>
                <label>
                  Position
                  <input
                    required
                    maxLength={160}
                    value={editing.position}
                    onChange={(e) => setEditing({ ...editing, position: e.target.value })}
                    placeholder="e.g. Frontend Engineer"
                  />
                </label>
                <label>
                  Location
                  <input
                    required
                    maxLength={160}
                    value={editing.location}
                    onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                    placeholder="e.g. Remote · Europe"
                  />
                </label>
                <label>
                  Employment type
                  <select
                    value={editing.employmentType}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        employmentType: e.target.value as JobInput['employmentType'],
                      })
                    }
                  >
                    {['Full-time', 'Part-time', 'Contract', 'Internship', 'Unknown'].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Salary (optional)
                  <input
                    maxLength={160}
                    value={editing.salary}
                    onChange={(e) => setEditing({ ...editing, salary: e.target.value })}
                    placeholder="As provided in the listing"
                  />
                </label>
                <label>
                  Source URL (optional)
                  <input
                    type="url"
                    maxLength={1000}
                    value={editing.sourceUrl}
                    onChange={(e) => setEditing({ ...editing, sourceUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </label>
              </div>
              <label>
                Job description
                <textarea
                  required
                  minLength={30}
                  maxLength={12000}
                  rows={7}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Paste the original description. Requirements will be extracted separately."
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editing.synthetic}
                  onChange={(e) => setEditing({ ...editing, synthetic: e.target.checked })}
                />
                This is synthetic sample data
              </label>
              {modal === 'edit' && (
                <p className="field-help">
                  Changing the description clears its extraction and score. Approved drafts keep
                  their history and are marked as needing context review.
                </p>
              )}
              <button className="button primary full" disabled={!!busy}>
                {busy === 'Saving job' ? 'Saving…' : 'Save opportunity'}
              </button>
            </form>
          </Modal>
        ))}
      {confirm && (
        <Modal
          title={confirm === 'delete' ? 'Delete this opportunity?' : 'Erase private profile data?'}
          onClose={() => setConfirm(null)}
        >
          <p className="muted">
            {confirm === 'delete'
              ? 'This permanently removes the job, notes, status history and all its drafts from this workspace.'
              : 'This removes the saved résumé, structured profile and all drafts. Jobs and application tracking remain. This cannot be undone.'}
          </p>
          <div className="action-row">
            <button className="button secondary" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="button destructive"
              disabled={!!busy}
              onClick={() =>
                run('Deleting', async () => {
                  if (confirm === 'delete' && active) {
                    await api({ action: 'delete', id: active.id, confirmed: true });
                    setSelected(null);
                  } else {
                    await api({ action: 'profile-clear', confirmed: true });
                    setResume('');
                    setProfileEditor('');
                    setVerified(false);
                  }
                  setConfirm(null);
                  await refresh();
                  setNotice('Selected records permanently removed from the workspace.');
                })
              }
            >
              Confirm permanent deletion
            </button>
          </div>
        </Modal>
      )}
      {error && (modal || confirm) && (
        <div className="modal-error banner error" role="alert">
          <span>{error}</span>
          <button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={18} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          <LoaderCircle size={16} className="spin" />
          {busy}…
        </div>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  label,
  icon,
  accent = false,
}: {
  title: string;
  value: number;
  label: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={`stat-card ${accent ? 'accent' : ''}`}>
      <div>
        <span>{title}</span>
        {icon}
      </div>
      <strong>{value.toString().padStart(2, '0')}</strong>
      <p>{label}</p>
    </section>
  );
}
