'use client';

import { useId, useState } from 'react';
import type { Profile, Requirement } from '@/lib/contracts';

type Row<T> = T & { editorKey: number };
type ProfileReview = {
  skills: Row<Profile['skills'][number]>[];
  experience: Row<Omit<Profile['experience'][number], 'years'> & { years: number | null }>[];
  nextKey: number;
};
type RequirementsReview = { requirements: Row<Requirement>[]; nextKey: number };

// Keys belong to the unsaved editor only; API and persisted contracts stay unchanged.
const withoutKey = <T extends { editorKey: number }>({ editorKey: _key, ...entry }: T) => entry;
const readRequirements = (value: string): RequirementsReview => {
  const { requirements } = JSON.parse(value) as { requirements: Requirement[] };
  return {
    requirements: requirements.map((r, editorKey) => ({ ...r, editorKey })),
    nextKey: requirements.length,
  };
};
const writeRequirements = (doc: RequirementsReview) =>
  JSON.stringify({ requirements: doc.requirements.map(withoutKey) });
const readProfile = (value: string): ProfileReview => {
  const { skills, experience } = value
    ? (JSON.parse(value) as Pick<Profile, 'skills' | 'experience'>)
    : { skills: [], experience: [] };
  return {
    skills: skills.map((s, editorKey) => ({ ...s, editorKey })),
    experience: experience.map((e, i) => ({ ...e, editorKey: skills.length + i })),
    nextKey: skills.length + experience.length,
  };
};
const writeProfile = (doc: ProfileReview) =>
  JSON.stringify({
    skills: doc.skills.map(withoutKey),
    experience: doc.experience.map(withoutKey),
  });

// Reconcile explicit external loads (saved profile / new extraction), without an
// effect that can overwrite in-progress typing or move focus between rows.
function useReviewDocument<T>(
  value: string,
  onChange: (value: string) => void,
  read: (value: string) => T,
  write: (doc: T) => string,
) {
  const [state, setState] = useState(() => ({ value, doc: read(value) }));
  if (state.value !== value) setState({ value, doc: read(value) });
  const change = (doc: T) => {
    const nextValue = write(doc);
    setState({ value: nextValue, doc });
    onChange(nextValue);
  };
  return [state.doc, change] as const;
}

export function RequirementsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [doc, change] = useReviewDocument(value, onChange, readRequirements, writeRequirements);
  const update = (key: number, patch: Partial<Requirement>) =>
    change({
      ...doc,
      requirements: doc.requirements.map((r) => (r.editorKey === key ? { ...r, ...patch } : r)),
    });
  return (
    <div className="review-editor">
      <p className="field-help" id={`${id}-help`}>
        Copy exact quotes from the job description, including the named requirement. Duties usually
        have unknown priority. Keep conflicting statements together with unknown priority for
        review. Minimum years must be explicitly stated; leave blank when unstated.
      </p>
      {doc.requirements.length === 0 && (
        <p>No requirements entered. Add one to begin your review.</p>
      )}
      {doc.requirements.map((r, index) => (
        <fieldset className="review-card" key={r.editorKey} aria-describedby={`${id}-help`}>
          <legend>Requirement {index + 1}</legend>
          <div className="review-fields">
            <label>
              Requirement name
              <input
                value={r.term}
                required
                maxLength={160}
                onChange={(e) => update(r.editorKey, { term: e.target.value })}
              />
            </label>
            <div>
              <label htmlFor={`${id}-${r.editorKey}-kind`}>Kind</label>
              <select
                id={`${id}-${r.editorKey}-kind`}
                value={r.kind}
                disabled={r.minYears !== null}
                onChange={(e) =>
                  update(r.editorKey, { kind: e.target.value as Requirement['kind'] })
                }
              >
                <option value="skill">Skill</option>
                <option value="technology">Technology</option>
                <option value="experience">Experience</option>
                <option value="responsibility">Responsibility</option>
                <option value="constraint">Constraint</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-${r.editorKey}-priority`}>Priority</label>
              <select
                id={`${id}-${r.editorKey}-priority`}
                value={r.priority}
                onChange={(e) =>
                  update(r.editorKey, { priority: e.target.value as Requirement['priority'] })
                }
              >
                <option value="unknown">Unknown — needs assessment</option>
                <option value="required">Required</option>
                <option value="preferred">Preferred</option>
              </select>
            </div>
            {r.kind === 'experience' && (
              <label>
                Minimum years (optional)
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={r.minYears ?? ''}
                  onChange={(e) =>
                    update(r.editorKey, {
                      minYears: e.target.value === '' ? null : e.target.valueAsNumber,
                    })
                  }
                />
                <span className="field-help">Clear years before changing the kind.</span>
              </label>
            )}
          </div>
          <label>
            Exact job quote
            <textarea
              rows={3}
              value={r.evidence}
              required
              minLength={3}
              maxLength={500}
              onChange={(e) => update(r.editorKey, { evidence: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="text-button danger"
            aria-label={`Remove requirement ${index + 1}`}
            onClick={() =>
              change({
                ...doc,
                requirements: doc.requirements.filter((item) => item.editorKey !== r.editorKey),
              })
            }
          >
            Remove requirement
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={doc.requirements.length >= 24}
        onClick={() =>
          change({
            requirements: [
              ...doc.requirements,
              {
                editorKey: doc.nextKey,
                term: '',
                kind: 'skill',
                priority: 'unknown',
                evidence: '',
                minYears: null,
              },
            ],
            nextKey: doc.nextKey + 1,
          })
        }
      >
        Add requirement
      </button>
      <p className="field-help">
        {doc.requirements.length} of 24 requirements. Changes are saved only when you select Save
        human review.
      </p>
    </div>
  );
}

export function ProfileEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [doc, change] = useReviewDocument(value, onChange, readProfile, writeProfile);
  return (
    <div className="review-editor">
      <p className="field-help" id={`${id}-help`}>
        Keep only skills and experience supported by exact résumé quotes. The name or area must
        appear in its quote. Enter years only when explicitly stated; never infer tenure.
      </p>
      <h3>Skills</h3>
      {doc.skills.length === 0 && <p>No skills entered. Extract evidence or add a skill.</p>}
      {doc.skills.map((s, index) => (
        <fieldset className="review-card" key={s.editorKey} aria-describedby={`${id}-help`}>
          <legend>Skill {index + 1}</legend>
          <label>
            Skill name
            <input
              value={s.name}
              required
              maxLength={160}
              onChange={(e) =>
                change({
                  ...doc,
                  skills: doc.skills.map((item) =>
                    item.editorKey === s.editorKey ? { ...item, name: e.target.value } : item,
                  ),
                })
              }
            />
          </label>
          <label>
            Exact résumé quote
            <textarea
              rows={2}
              value={s.evidence}
              required
              minLength={2}
              maxLength={500}
              onChange={(e) =>
                change({
                  ...doc,
                  skills: doc.skills.map((item) =>
                    item.editorKey === s.editorKey ? { ...item, evidence: e.target.value } : item,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            className="text-button danger"
            aria-label={`Remove skill ${index + 1}`}
            onClick={() =>
              change({
                ...doc,
                skills: doc.skills.filter((item) => item.editorKey !== s.editorKey),
              })
            }
          >
            Remove skill
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={doc.skills.length >= 60}
        onClick={() =>
          change({
            ...doc,
            skills: [...doc.skills, { editorKey: doc.nextKey, name: '', evidence: '' }],
            nextKey: doc.nextKey + 1,
          })
        }
      >
        Add skill
      </button>
      <h3>Experience</h3>
      {doc.experience.length === 0 && (
        <p>No numeric experience entered. Leave this empty when years are unstated.</p>
      )}
      {doc.experience.map((e, index) => (
        <fieldset className="review-card" key={e.editorKey} aria-describedby={`${id}-help`}>
          <legend>Experience {index + 1}</legend>
          <div className="review-fields">
            <label>
              Experience area
              <input
                value={e.area}
                required
                maxLength={160}
                onChange={(event) =>
                  change({
                    ...doc,
                    experience: doc.experience.map((item) =>
                      item.editorKey === e.editorKey ? { ...item, area: event.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <label>
              Explicit years
              <input
                type="number"
                min={0}
                max={50}
                step="any"
                value={e.years ?? ''}
                required
                onChange={(event) =>
                  change({
                    ...doc,
                    experience: doc.experience.map((item) =>
                      item.editorKey === e.editorKey
                        ? {
                            ...item,
                            years: event.target.value === '' ? null : event.target.valueAsNumber,
                          }
                        : item,
                    ),
                  })
                }
              />
            </label>
          </div>
          <label>
            Exact résumé quote
            <textarea
              rows={2}
              value={e.evidence}
              required
              minLength={3}
              maxLength={500}
              onChange={(event) =>
                change({
                  ...doc,
                  experience: doc.experience.map((item) =>
                    item.editorKey === e.editorKey
                      ? { ...item, evidence: event.target.value }
                      : item,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            className="text-button danger"
            aria-label={`Remove experience ${index + 1}`}
            onClick={() =>
              change({
                ...doc,
                experience: doc.experience.filter((item) => item.editorKey !== e.editorKey),
              })
            }
          >
            Remove experience
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={doc.experience.length >= 20}
        onClick={() =>
          change({
            ...doc,
            experience: [
              ...doc.experience,
              { editorKey: doc.nextKey, area: '', years: null, evidence: '' },
            ],
            nextKey: doc.nextKey + 1,
          })
        }
      >
        Add experience
      </button>
      <p className="field-help">
        {doc.skills.length} of 60 skills · {doc.experience.length} of 20 experience entries. Edits
        require renewed confirmation before saving.
      </p>
    </div>
  );
}
