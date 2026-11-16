import { jobs, profile, fixedExtraction } from './data.js';
import { matchProfile } from './matching.js';
import type { DemoJob, Requirement } from './types.js';

const content = document.getElementById('content')!;
const announce = document.getElementById('announce')!;
const repo = 'https://github.com/mubidotjs/ai-job-application-tracker';
const evidenceRoot = `${repo}/blob/aca0a75ee717e1032a9b55006c25a08d791f91d7`;
const statuses = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected'];
const state = {
  query: '',
  filter: 'All statuses',
  stages: new Map<string, string>(),
  flags: new Map<string, Set<string>>(),
  reviewed: new Set<string>(),
  approved: new Set<string>(),
};
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const tag = '<span class="synthetic-tag">SYNTHETIC</span>';
const badge = (stage: string) => `<span class="badge ${escape(stage)}">${escape(stage)}</span>`;
const stageOf = (job: DemoJob) => state.stages.get(job.id) || job.status;
const requirementsOf = (job: DemoJob): Requirement[] =>
  job.requirements.map((r) =>
    state.flags.get(job.id)?.has(r.term) ? { ...r, priority: 'unknown' } : r,
  );
const fitOf = (job: DemoJob) => matchProfile(profile, { requirements: requirementsOf(job) })!;
const marks = (company: string) =>
  escape(
    company
      .split(' ')
      .slice(0, 2)
      .map((s) => s[0])
      .join(''),
  );
function say(message: string) {
  announce.textContent = message;
}
function heading(eyebrow: string, title: string, subtitle: string, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1 tabindex="-1">${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function jobRows(list: DemoJob[]) {
  return list
    .map((j) => {
      const fit = fitOf(j);
      return `<li class="job-row"><div class="job-title"><span class="company-mark" aria-hidden="true">${marks(j.company)}</span><div><a href="#job/${j.id}">${escape(j.position)}</a><p>${escape(j.company)} ${tag}</p></div></div><div class="job-location">${escape(j.location)}<small>${escape(j.employmentType)}</small></div><div class="job-fit"><span class="score-small">${fit.score === null ? 'Unscored' : `${fit.score}%`}</span><div class="fit-bar" aria-hidden="true"><span class="fit-${fit.score ?? 0}"></span></div></div><div class="job-stage">${badge(stageOf(j))}</div></li>`;
    })
    .join('');
}
function listPanel(overview: boolean) {
  return `<section class="panel" aria-labelledby="opportunities-heading"><div class="panel-head"><div><h2 id="opportunities-heading">Your opportunities <span class="tiny-tag">21</span></h2><p>Invented roles. Fixed evidence. A closer look at where you fit.</p></div><button class="text-link" data-action="reset">Reset demo previews</button></div><div class="filters"><label class="search-label" for="search">Search fictional opportunities<input id="search" type="search" maxlength="100" value="${escape(state.query)}" placeholder="Search role, company or location…" autocomplete="off" spellcheck="false"></label><div class="filter-field"><label for="status-filter">Application status</label><select id="status-filter">${['All statuses', ...statuses].map((s) => `<option${state.filter === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div></div><div id="job-list" data-overview="${overview}"></div></section>`;
}
function updateList() {
  const target = document.getElementById('job-list');
  if (!target) return;
  const overview = target.dataset.overview === 'true';
  const query = state.query.toLocaleLowerCase().trim();
  const found = [...jobs]
    .reverse()
    .filter(
      (j) =>
        (state.filter === 'All statuses' || stageOf(j) === state.filter) &&
        `${j.company} ${j.position} ${j.location}`.toLocaleLowerCase().includes(query),
    );
  const shown = overview && !query && state.filter === 'All statuses' ? found.slice(0, 6) : found;
  target.innerHTML = found.length
    ? `<ul class="jobs">${jobRows(shown)}</ul><div class="list-footer"><span>${found.length} synthetic opportunities${shown.length !== found.length ? ` · showing ${shown.length}` : ''}</span>${overview ? '<a href="#opportunities">Explore all roles →</a>' : '<span>Examples reset on reload</span>'}</div>`
    : '<div class="empty"><h2>No opportunities match this view</h2><p>Try another fictional role, company or status.</p><button class="button" data-action="clear-filters">Clear filters</button></div>';
  say(`${found.length} synthetic opportunities match the filters.`);
}
function dashboard(overview: boolean) {
  const counts = Object.fromEntries(
    statuses.map((s) => [s, jobs.filter((j) => stageOf(j) === s).length]),
  );
  const stats = [
    ['Total opportunities', jobs.length, 'Invented roles, in one place'],
    ['Applications recorded', jobs.length - counts.Saved, 'Fictional progress · nothing sent'],
    ['In conversation', counts.Interview, 'Illustrative interview stages'],
    ['Offers recorded', counts.Offer, 'Fictional outcomes only'],
  ];
  return (
    heading(
      'A LITTLE CLARITY FOR YOUR NEXT CHAPTER',
      overview
        ? 'Make your next move a considered one.'
        : 'Good opportunities deserve a closer look.',
      'Explore an evidence-first job workspace with a fictional candidate. Everything here is a temporary illustration.',
      '<a class="button primary" href="#ai">How local AI works <span aria-hidden="true">↗</span></a>',
    ) +
    (overview
      ? `<section class="stats" aria-label="Fictional application totals">${stats.map(([label, count, sub]) => `<div class="stat"><span>${label}</span><strong>${count}</strong><p>${sub}</p></div>`).join('')}</section><div class="dashboard-grid"><section class="panel panel-pad"><h2>Your application journey</h2><p>Progress is worth keeping track of. These stages are fictional.</p><div class="pipeline">${statuses.map((s) => `<div><span>${s}</span><strong>${counts[s]}</strong><i aria-hidden="true"></i></div>`).join('')}</div><div class="pipeline-caption"><span>Temporary previews · no records saved</span><span>3 fictional follow-ups due</span></div></section><section class="panel insight"><p class="eyebrow">THOUGHTFUL, LOCAL AI</p><h2>Find the fit.<br>See the evidence.</h2><p>Every point has a reason you can inspect.</p><div class="button-row"><a href="#job/synthetic-5/fit">Explore a match →</a></div></section></div>`
      : '') +
    listPanel(overview)
  );
}
function requirementRows(requirements: Requirement[], job?: DemoJob) {
  return requirements
    .map(
      (r) =>
        `<div class="requirement"><div class="requirement-head"><strong>${escape(r.term)}</strong><span class="priority ${r.priority}">${r.priority}</span><small>${r.kind}${r.minYears !== null ? ` · ${r.minYears}+ years` : ''}</small></div><blockquote>“${escape(r.evidence)}”</blockquote>${job ? `<button class="text-link" data-action="flag" data-job="${job.id}" data-term="${escape(r.term)}">${state.flags.get(job.id)?.has(r.term) ? 'Restore authored priority' : 'Preview: flag priority for human assessment'}</button>` : ''}</div>`,
    )
    .join('');
}
function fitPanel(job: DemoJob) {
  const fit = fitOf(job);
  return `<h2>A score you can inspect</h2><p class="field-help">Documented alignment, never a hiring probability or guarantee.</p><div class="fit-summary"><div class="fit-number">${fit.score ?? '—'}<small>${fit.score === null ? ' unscored' : ' / 100'}</small></div><div><strong>${fit.earned} of ${fit.possible} weighted points</strong><p>${fit.matched} matched · ${fit.missing} missing · ${fit.unknown} unknown</p></div></div><p class="field-help">Required = 3 points. Preferred = 1. Evidence-backed matches earn full points. Missing and unresolved weighted requirements earn 0. Unknown priority has weight 0; duties and constraints need human assessment. A review preview can change these contributions.</p>${fit.rows.map((r) => `<div class="fit-row"><div class="requirement-head"><strong>${escape(r.term)}</strong><span class="priority ${r.priority}">${r.priority}</span><span class="contribution">+${r.points} / ${r.weight}</span></div><p class="result ${r.result}">${r.result}</p><p>${escape(r.profileEvidence)}</p><details><summary>Job evidence</summary><blockquote>“${escape(r.evidence)}”</blockquote></details></div>`).join('')}`;
}
function draftText(job: DemoJob) {
  const supported = fitOf(job)
    .rows.filter((r) => r.result === 'matched' && ['skill', 'technology'].includes(r.kind))
    .slice(0, 4);
  if (!supported.length) return '';
  return `SYNTHETIC COVER-NOTE EXAMPLE — not an application.\n\nHello ${job.company} team,\n\nI am interested in the ${job.position} role. My fictional résumé includes experience with ${supported.map((r) => r.term).join(', ')}, which overlap with the requirements in your invented description. I would welcome the opportunity to discuss that experience.\n\nThank you for your consideration.`;
}
function draftPanel(job: DemoJob) {
  const text = draftText(job),
    approved = state.approved.has(job.id),
    reviewed = state.reviewed.has(job.id);
  if (!text)
    return '<h2>No supported draft example</h2><p class="field-help">This role has no documented skill match in the fictional profile. Choose another role to preview an evidence-assembled template.</p>';
  return `<h2>Review before any decision</h2><p class="field-help">Deterministic template · not AI-generated prose. This fixed example cannot be edited or sent. The local application supports editing and explicit approval.</p><div class="draft-text">${escape(text)}</div><label class="checkbox-label"><input id="draft-review" type="checkbox" data-job="${job.id}"${reviewed ? ' checked' : ''}>I reviewed this synthetic example and its fictional evidence.</label><div class="button-row"><button class="button primary" data-action="approve" data-job="${job.id}"${!reviewed || approved ? ' disabled' : ''}>Preview approval</button><button class="button" data-action="reject" data-job="${job.id}">Reject example</button><button class="button" data-action="copy" data-job="${job.id}"${!approved ? ' disabled' : ''}>Copy synthetic example</button></div><p class="status-note" role="status">${approved ? 'Approved preview only. Nothing was saved or sent.' : 'Unapproved example. Human review is required before the approval preview.'}</p>`;
}
function jobDetail(job: DemoJob, tab: string) {
  const panels: Record<string, string> = {
    requirements: `<h2>Understand the role</h2><p class="field-help">Fixed, human-authored synthetic requirements. The public showcase never extracts from descriptions.</p><div class="source-note">Authored example · no live AI. Flagging a priority changes only this temporary preview.</div>${requirementRows(requirementsOf(job), job)}<div class="button-row"><a class="button" href="#job/${job.id}/fit">Inspect score contributions →</a></div>`,
    fit: fitPanel(job),
    drafts: draftPanel(job),
    description: `<h2>Original synthetic description</h2><p class="field-help">Source: bundled invented fixture. No external job fetching or scraping.</p><div class="description">${escape(job.description)}</div>`,
  };
  const tabs = [
    ['requirements', 'Requirements'],
    ['fit', 'Fit comparison'],
    ['drafts', 'Draft preview'],
    ['description', 'Description'],
  ];
  return `<a class="small" href="#opportunities">← Back to opportunities</a><div class="detail-heading"><div class="job-title"><span class="company-mark" aria-hidden="true">${marks(job.company)}</span><div><p>${escape(job.company)} ${tag}</p><h1 tabindex="-1">${escape(job.position)}</h1><p>${escape(job.location)} · ${escape(job.employmentType)}${job.salary ? ` · ${escape(job.salary)}` : ''}</p></div></div></div><div class="detail-grid"><section class="panel"><nav class="tabs" aria-label="Job detail sections">${tabs.map(([id, name]) => `<a href="#job/${job.id}/${id}"${tab === id ? ' aria-current="page"' : ''}>${name}</a>`).join('')}</nav><div class="panel-pad">${panels[tab] || panels.requirements}</div></section><aside><section class="panel panel-pad"><h2>Application progress</h2><p class="field-help">Preview a stage. No application, message or record is created.</p><label for="stage-preview">Fictional application stage<select id="stage-preview" data-job="${job.id}">${statuses.map((s) => `<option${stageOf(job) === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label><p class="status-note">${badge(stageOf(job))}<br>Temporary preview · resets on reload</p><p class="field-help">${escape(job.appliedDate || 'No application date in this invented scenario.')}<br>${escape(job.followUpDate || 'No follow-up due in this scenario.')}</p></section><section class="panel panel-pad section-gap"><h2>Evidence you can review</h2><p class="field-help">Candidate: Alex Morgan, a fictional engineer. Profile review and priority flags are examples, not saved decisions.</p><a class="small" href="#profile">Inspect the fictional résumé →</a></section></aside></div>`;
}
function profilePanel() {
  return (
    heading(
      'THE FOUNDATION',
      'Experience, clearly represented.',
      'A fixed, fictional profile. There is no résumé entry, upload or personal data processing in this showcase.',
    ) +
    `<div class="two-column"><section class="panel panel-pad"><h2>Fictional résumé</h2><p class="source-note">SYNTHETIC · Alex Morgan is an invented person.</p><div class="description">${escape(profile.resume)}</div></section><section class="panel panel-pad"><h2>Reviewed fictional evidence</h2><p class="field-help">Pre-authored verification for illustration. The actual local app requires a person to review and confirm their own evidence.</p>${profile.skills.map((s) => `<div class="profile-evidence"><h3>${escape(s.name)}</h3><details><summary>Exact résumé evidence</summary><p>“${escape(s.evidence)}”</p></details></div>`).join('')}<div class="profile-evidence"><h3>JavaScript · 4 explicit years</h3><p>“${escape(profile.experience[0].evidence)}”</p></div></section></div>`
  );
}
function aiPanel() {
  return (
    heading(
      'REAL IMPLEMENTATION. CLEAR BOUNDARIES.',
      'Local intelligence. Inspectable evidence.',
      'The working local-first application uses actual Ollama with Qwen3 4B. This public page contains only fixed synthetic examples.',
    ) +
    `<ol class="steps"><li><span class="step-number">01 · LOCAL APP</span><strong>Supplied job description</strong>Untrusted input, bounded in size. Résumé information remains local.</li><li><span class="step-number">02 · OLLAMA</span><strong>Qwen3 4B inference</strong>One explicit request to the locally configured model. CPU inference may take tens of seconds.</li><li><span class="step-number">03 · CONTRACT</span><strong>Fail-closed validation</strong>Strict Zod output, exact evidence quotes, numeric support and model provenance.</li><li><span class="step-number">04 · HUMAN REVIEW</span><strong>Explainable matching</strong>Review requirements, inspect weighted contributions, then make your own decisions.</li></ol><div class="two-column"><section class="panel panel-pad"><h2>Fixed synthetic extraction illustration</h2><p class="source-note">Human-authored example, not a model response from this site. No model request occurs.</p><div class="description">${escape(fixedExtraction.description)}</div>${requirementRows(fixedExtraction.requirements)}</section><section class="panel panel-pad"><h2>Verification, with its limits</h2><p class="field-help">Genuine local inference: PASS. Model: qwen3:4b. The recorded model digest and exact source hashes are in the linked evidence.</p><p class="field-help">The original reviewed set reached 8/8 application acceptance: five affected reruns plus three explicitly retained results. A separate four-case holdout reached 4/4 acceptance, 100% precision and 92.3% recall. One supported Flask preference was omitted.</p><p class="field-help">Acceptance is not proof of completeness. This small synthetic evaluation is not a general benchmark, hiring prediction or guarantee. The extraction implementation is frozen; no new evaluations were run to publish this showcase.</p><ul class="link-list"><li><a href="${evidenceRoot}/docs/verification/real-ai-pass.json">Actual local inference verification ↗</a></li><li><a href="${evidenceRoot}/docs/quality-correction.md">Quality evaluation and retained-result methodology ↗</a></li><li><a href="${evidenceRoot}/docs/quality-correction/results.json">Model digest, source hashes and per-fixture results ↗</a></li><li><a href="${evidenceRoot}/README.md#run-locally">Run the full local application ↗</a></li></ul></section></div>`
  );
}
function capabilitiesPanel() {
  return (
    heading(
      'THE PRODUCT BEHIND THE SHOWCASE',
      'Useful locally. Honest publicly.',
      'The local application is complete. This static showcase deliberately illustrates its workflow without connecting to its storage or inference services.',
    ) +
    `<div class="two-column"><section class="panel panel-pad"><h2>Explore here</h2><ul><li>Search and filter 21 invented opportunities.</li><li>Inspect supplied descriptions and exact requirement quotes.</li><li>Compare a fictional résumé using the actual pure matching calculation.</li><li>Flag priority for assessment and preview score changes.</li><li>Preview tracking and explicit draft approval, in temporary memory only.</li></ul><a class="button primary" href="#opportunities">Explore opportunities →</a></section><section class="panel panel-pad"><h2>Available in the local application</h2><ul><li>CSV import, manual jobs, duplicate detection and review.</li><li>Evidence review forms and verified profile matching.</li><li>Genuine local Ollama/Qwen3 extraction with provenance.</li><li>Dates, private notes, follow-ups and safe CSV export.</li><li>Editable deterministic drafts, explicit approval and copying.</li><li>Persistent SQLite plus validated backup and restore.</li></ul><p class="field-help">The public showcase has no upload, account, job submission, data-writing or storage API.</p></section></div><section class="panel panel-pad section-gap"><h2>Local backup & restore, explained</h2><p class="field-help">The local app uses a SQLite-safe snapshot that includes WAL data, migration metadata, tracking, evidence and approvals. Restore validates integrity and compatibility, previews the file, requires explicit confirmation, and replaces records in one transaction. Backups contain sensitive plaintext information.</p><p class="field-help">This public site exposes no backup file, upload control or restore endpoint. Nothing here can access a local workspace.</p><a class="small" href="${evidenceRoot}/docs/workspace-backups.md">Read the local recovery design and tests ↗</a></section><div class="gallery"><figure><img src="/assets/local-dashboard.png" loading="lazy" width="1440" height="1000" alt="Genuine local application dashboard captured using only invented opportunities"><figcaption>Actual local application screenshot · synthetic data and human/demo requirements.</figcaption></figure><figure><img src="/assets/local-fit.png" loading="lazy" width="1440" height="1000" alt="Genuine local application fit comparison showing matched Node.js and missing PostgreSQL and Redis"><figcaption>Actual local application screenshot · deterministic evidence comparison.</figcaption></figure></div><div class="button-row"><a class="button" href="/case-study.html">Read the portfolio case study</a><a class="button" href="${repo}">View GitHub source ↗</a></div>`
  );
}
function render(focus = false) {
  const [fragment, id = '', selectedTab = 'requirements'] = location.hash.slice(1).split('/');
  const route = !fragment || fragment === 'main' ? 'dashboard' : fragment;
  const job = jobs.find((j) => j.id === id);
  const title =
    route === 'job'
      ? 'Opportunity details'
      : (
          {
            dashboard: 'Overview',
            opportunities: 'Opportunities',
            profile: 'Fictional profile',
            ai: 'Local AI explained',
            capabilities: 'Product & evidence',
          } as Record<string, string>
        )[route] || 'Page not found';
  document.getElementById('breadcrumb')!.textContent = title;
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((link) => {
    if (link.dataset.nav === route || (route === 'job' && link.dataset.nav === 'opportunities'))
      link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  content.innerHTML =
    route === 'dashboard' || route === 'opportunities'
      ? dashboard(route === 'dashboard')
      : route === 'job' && job
        ? jobDetail(job, selectedTab)
        : route === 'profile'
          ? profilePanel()
          : route === 'ai'
            ? aiPanel()
            : route === 'capabilities'
              ? capabilitiesPanel()
              : '<section class="empty"><h1 tabindex="-1">This example is not here</h1><p>Choose an invented opportunity from the dashboard.</p><a class="button" href="#dashboard">Return to overview</a></section>';
  updateList();
  if (focus) {
    content.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}
document.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'search') {
    state.query = target.value.slice(0, 100);
    updateList();
  }
});
document.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'status-filter') {
    state.filter = target.value;
    updateList();
  }
  if (target.id === 'stage-preview' && target.dataset.job) {
    state.stages.set(target.dataset.job, target.value);
    render();
    say('Fictional stage preview updated. No record was saved or application sent.');
  }
  if (target.id === 'draft-review' && target.dataset.job) {
    if (target.checked) state.reviewed.add(target.dataset.job);
    else {
      state.reviewed.delete(target.dataset.job);
      state.approved.delete(target.dataset.job);
    }
    render();
    document.getElementById('draft-review')?.focus();
  }
});
document.addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const job = jobs.find((j) => j.id === button.dataset.job);
  if (action === 'reset') {
    state.stages.clear();
    state.flags.clear();
    state.reviewed.clear();
    state.approved.clear();
    state.query = '';
    state.filter = 'All statuses';
    render();
    say('All temporary previews reset. No records were saved.');
  }
  if (action === 'clear-filters') {
    state.query = '';
    state.filter = 'All statuses';
    render();
    document.getElementById('search')?.focus();
  }
  if (action === 'flag' && job && button.dataset.term) {
    const flags = state.flags.get(job.id) || new Set<string>();
    const term = button.dataset.term;
    if (flags.has(term)) flags.delete(term);
    else flags.add(term);
    state.flags.set(job.id, flags);
    state.approved.delete(job.id);
    state.reviewed.delete(job.id);
    render();
    const next = [...content.querySelectorAll<HTMLButtonElement>('[data-action="flag"]')].find(
      (b) => b.dataset.term === term,
    );
    next?.focus();
    say(
      'Priority preview changed. The fit score was recalculated; no evidence was rewritten or saved.',
    );
  }
  if (action === 'approve' && job && state.reviewed.has(job.id)) {
    state.approved.add(job.id);
    render();
    say('Approved preview only. Nothing was saved or sent.');
  }
  if (action === 'reject' && job) {
    state.reviewed.delete(job.id);
    state.approved.delete(job.id);
    render();
    say('Synthetic example rejected. Nothing was saved or sent.');
  }
  if (action === 'copy' && job && state.approved.has(job.id)) {
    try {
      await navigator.clipboard.writeText(draftText(job));
      say('Synthetic template copied. Nothing was sent.');
      button.textContent = 'Synthetic example copied';
    } catch {
      say(
        'Clipboard access is unavailable. The fixed example remains visible for manual selection.',
      );
      button.textContent = 'Copy unavailable — select the example text';
    }
  }
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#main') document.getElementById('main')?.focus();
  else render(true);
});
render();
