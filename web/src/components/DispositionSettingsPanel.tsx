import { useEffect, useMemo, useState } from 'react';
import type { DispositionSettings, EigenerKuehlraumConfig, KuehlraumWandTab } from '../types/dispositionSettings';
import { useDispositionSettings } from '../settings/SettingsProvider';
import { classifyOrt } from '../settings/recognitionEngine';
import { dedupeKeywords } from '../settings/recognitionEngine';
import {
  settingsChanged,
  validateDispositionSettings,
} from '../settings/settingsValidation';
import { normalizeDispositionSettings } from '../settings/settingsNormalize';

const TEST_BEISPIELE = [
  'UK-Neunkirchen',
  'KH Wolfsberg',
  'Kühlr. Grafenbach',
  'Feba Krematorium',
  'Wien',
];

function parseLines(text: string): string[] {
  return dedupeKeywords(
    text
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function linesToText(items: string[]): string {
  return items.join('\n');
}

function keywordsEqual(a: string[], b: string[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Textarea für Keywords — Enter erlaubt neue Zeile (kein sofortiges Zurücksetzen leerer Zeilen). */
function KeywordsTextarea({
  value,
  onChange,
  rows = 4,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  rows?: number;
}) {
  const [text, setText] = useState(() => linesToText(value));

  useEffect(() => {
    if (!keywordsEqual(parseLines(text), value)) {
      setText(linesToText(value));
    }
  }, [value, text]);

  return (
    <textarea
      className="settings-textarea"
      rows={rows}
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        onChange(parseLines(next));
      }}
      spellCheck={false}
    />
  );
}

function KeywordSection({
  title,
  hint,
  count,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  count: number;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="settings-block">
      <div className="settings-block-head">
        <h4>{title}</h4>
        <span className="settings-count">{count} Einträge</span>
      </div>
      <p className="settings-hint">{hint}</p>
      <KeywordsTextarea value={value} onChange={onChange} rows={4} />
    </div>
  );
}

function emptyKuehlraum(): EigenerKuehlraumConfig {
  return {
    id: crypto.randomUUID(),
    label: 'Neuer Kühlraum',
    matchKeywords: [],
    externKeywords: [],
    wandTab: 'kuehlraum',
    plaetze: 9,
  };
}

export function DispositionSettingsPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { settings, loading, saving, error, saveSettings } = useDispositionSettings();
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState<DispositionSettings>(() =>
    normalizeDispositionSettings(settings)
  );
  const [savedOk, setSavedOk] = useState(false);
  const [testOrt, setTestOrt] = useState('');

  useEffect(() => {
    if (!open) setDraft(normalizeDispositionSettings(settings));
  }, [settings, open]);

  const normalizedDraft = useMemo(() => normalizeDispositionSettings(draft), [draft]);
  const validation = useMemo(
    () => validateDispositionSettings(normalizedDraft),
    [normalizedDraft]
  );
  const dirty = useMemo(
    () => settingsChanged(normalizedDraft, settings),
    [normalizedDraft, settings]
  );
  const testErgebnis = useMemo(
    () => classifyOrt(testOrt, normalizedDraft),
    [testOrt, normalizedDraft]
  );

  const updateKuehlraum = (index: number, patch: Partial<EigenerKuehlraumConfig>) => {
    setDraft((d) => ({
      ...d,
      eigeneKuehlraeume: d.eigeneKuehlraeume.map((k, i) =>
        i === index ? { ...k, ...patch } : k
      ),
    }));
  };

  const handleSave = async () => {
    setSavedOk(false);
    try {
      await saveSettings(normalizedDraft);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 4000);
    } catch {
      /* Fehler in context */
    }
  };

  const applyBeispiel = (ort: string) => setTestOrt(ort);

  return (
    <section className="panel settings-panel">
      <button
        type="button"
        className="settings-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="settings-toggle-title">Erkennung & Kühlraum</span>
        <span className="settings-toggle-meta">
          Keywords, Plätze, Prüfen — für Disposition, Wandmonitor & Agent
          {dirty && open ? ' · Ungespeicherte Änderungen' : ''}
        </span>
        <span className="case-chevron" aria-hidden />
      </button>

      {open && (
        <div className="settings-body">
          {loading ? (
            <p className="settings-hint">Lade Einstellungen…</p>
          ) : (
            <>
              <div className="settings-test panel-inset">
                <h4>Ort prüfen</h4>
                <p className="settings-hint">
                  Testet die aktuellen Entwurfs-Regeln (noch nicht gespeichert), wie der Agent sie
                  anwendet.
                </p>
                <div className="settings-test-row">
                  <input
                    type="text"
                    className="settings-test-input"
                    placeholder="z. B. UK-Neunkirchen / Kühlr. Grafenbach / Feba"
                    value={testOrt}
                    onChange={(e) => setTestOrt(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() => setTestOrt('')}
                  >
                    Leeren
                  </button>
                </div>
                <div className="settings-test-chips">
                  {TEST_BEISPIELE.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className="chip chip-muted settings-test-chip"
                      onClick={() => applyBeispiel(b)}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                {testOrt.trim() && (
                  <div className="settings-test-result">
                    {testErgebnis.treffer.length === 0 ? (
                      <p className="settings-test-none">Keine Regel erkannt (nur Überführung).</p>
                    ) : (
                      <ul>
                        {testErgebnis.treffer.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    )}
                    <div className="settings-test-badges">
                      {testErgebnis.kremation && (
                        <span className="chip chip-kremation">Kremation</span>
                      )}
                      {testErgebnis.krankenhaus && (
                        <span className="chip chip-warn">Krankenhaus</span>
                      )}
                      {testErgebnis.pflegeheim && (
                        <span className="chip chip-success">Pflegeheim</span>
                      )}
                      {testErgebnis.bestattung && (
                        <span className="chip chip-muted">Bestattung</span>
                      )}
                      {!testErgebnis.kremation &&
                        !testErgebnis.krankenhaus &&
                        !testErgebnis.pflegeheim &&
                        !testErgebnis.bestattung &&
                        !testErgebnis.eigenerKuehlraum &&
                        testOrt.trim() && (
                          <span className="chip">Extern</span>
                        )}
                      {testErgebnis.eigenerKuehlraum && (
                        <span className="chip chip-success">
                          {testErgebnis.eigenerKuehlraum.label}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {validation.warnings.length > 0 && (
                <div className="alert alert-warn settings-alert">
                  <strong>Hinweise</strong>
                  <ul>
                    {validation.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {validation.errors.length > 0 && (
                <div className="alert alert-danger settings-alert">
                  <strong>Bitte korrigieren</strong>
                  <ul>
                    {validation.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="settings-block">
                <div className="settings-block-head">
                  <h4>Wandmonitor — Tabwechsel</h4>
                  <span className="settings-count">Sekunden pro Ansicht</span>
                </div>
                <p className="settings-hint">
                  Countdown bis zum automatischen Wechsel (5–300 s). Jeder Tab hat eine eigene
                  Dauer; gilt für alle Übergänge im Rotationsmodus.
                </p>
                <div className="settings-wall-tabs-grid">
                  {(
                    [
                      ['kuehlraum', 'Kühlraum'],
                      ['extern', 'Extern'],
                      ['kalender', 'Kalender'],
                      ['abholungen', 'Heute'],
                      ['offen', 'Offen'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="settings-wall-tab-field">
                      {label}
                      <input
                        type="number"
                        min={5}
                        max={300}
                        step={1}
                        value={draft.wallTabWechselSekunden?.[key] ?? 18}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setDraft((d) => {
                            const base = d.wallTabWechselSekunden ?? {
                              kuehlraum: 18,
                              extern: 18,
                              kalender: 24,
                              abholungen: 18,
                              offen: 18,
                            };
                            return {
                              ...d,
                              wallTabWechselSekunden: { ...base, [key]: v },
                            };
                          });
                        }}
                      />
                      <span className="settings-wall-tab-unit">s</span>
                    </label>
                  ))}
                </div>
                <p className="settings-hint" style={{ marginTop: '0.6rem' }}>
                  Tabs in der Rotation anzeigen
                </p>
                <div className="settings-wall-tabs-grid">
                  {(
                    [
                      ['kuehlraum', 'Kühlraum'],
                      ['extern', 'Extern'],
                      ['kalender', 'Kalender'],
                      ['abholungen', 'Heute'],
                      ['offen', 'Offen'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={`enabled-${key}`} className="settings-wall-tab-field">
                      <input
                        type="checkbox"
                        checked={draft.wallTabRotationEnabled?.[key] ?? true}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            wallTabRotationEnabled: {
                              kuehlraum: d.wallTabRotationEnabled?.kuehlraum ?? true,
                              extern: d.wallTabRotationEnabled?.extern ?? true,
                              kalender: d.wallTabRotationEnabled?.kalender ?? true,
                              abholungen: d.wallTabRotationEnabled?.abholungen ?? true,
                              offen: d.wallTabRotationEnabled?.offen ?? true,
                              [key]: e.target.checked,
                            },
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <KeywordSection
                title="Kremation — Präfixe"
                hint="Ein Präfix pro Zeile (Enter). Ortsname beginnt mit …"
                count={normalizedDraft.kremationPrefixe.length}
                value={draft.kremationPrefixe}
                onChange={(kremationPrefixe) => setDraft((d) => ({ ...d, kremationPrefixe }))}
              />
              <KeywordSection
                title="Kremation — Keywords"
                hint="Ein Keyword pro Zeile (Enter). Enthält-Match, min. 2 Zeichen."
                count={normalizedDraft.kremationKeywords.length}
                value={draft.kremationKeywords}
                onChange={(kremationKeywords) => setDraft((d) => ({ ...d, kremationKeywords }))}
              />
              <KeywordSection
                title="Krankenhaus — Präfixe"
                hint="Ein Präfix pro Zeile (Enter). Ortsname beginnt mit …"
                count={normalizedDraft.krankenhausPrefixe.length}
                value={draft.krankenhausPrefixe}
                onChange={(krankenhausPrefixe) => setDraft((d) => ({ ...d, krankenhausPrefixe }))}
              />
              <KeywordSection
                title="Krankenhaus — Keywords"
                hint="Ein Keyword pro Zeile (Enter). Enthält im Ortsnamen."
                count={normalizedDraft.krankenhausKeywords.length}
                value={draft.krankenhausKeywords}
                onChange={(krankenhausKeywords) => setDraft((d) => ({ ...d, krankenhausKeywords }))}
              />
              <KeywordSection
                title="Pflegeheim — Präfixe (Extern-Wand)"
                hint="Ein Präfix pro Zeile (Enter). z. B. Senecura für „Senecura Ternitz“."
                count={normalizedDraft.pflegeheimPrefixe.length}
                value={draft.pflegeheimPrefixe}
                onChange={(pflegeheimPrefixe) => setDraft((d) => ({ ...d, pflegeheimPrefixe }))}
              />
              <KeywordSection
                title="Pflegeheim — Keywords (Extern-Wand)"
                hint="Ein Keyword pro Zeile (Enter). Enthält im Ortsnamen."
                count={normalizedDraft.pflegeheimKeywords.length}
                value={draft.pflegeheimKeywords}
                onChange={(pflegeheimKeywords) => setDraft((d) => ({ ...d, pflegeheimKeywords }))}
              />
              <KeywordSection
                title="Bestattung — Präfixe (Extern-Wand)"
                hint="Ein Präfix pro Zeile (Enter). Ortsname beginnt mit …"
                count={normalizedDraft.bestattungPrefixe.length}
                value={draft.bestattungPrefixe}
                onChange={(bestattungPrefixe) => setDraft((d) => ({ ...d, bestattungPrefixe }))}
              />
              <KeywordSection
                title="Bestattung — Keywords (Extern-Wand)"
                hint="Ein Keyword pro Zeile (Enter). Enthält im Ortsnamen."
                count={normalizedDraft.bestattungKeywords.length}
                value={draft.bestattungKeywords}
                onChange={(bestattungKeywords) => setDraft((d) => ({ ...d, bestattungKeywords }))}
              />

              <div className="settings-block">
                <div className="settings-block-head">
                  <h4>Eigene Kühlräume</h4>
                  <span className="settings-count">
                    {normalizedDraft.eigeneKuehlraeume.length} Kühlraum
                    {normalizedDraft.eigeneKuehlraeume.length !== 1 ? 'e' : ''}
                  </span>
                </div>
                <p className="settings-hint">
                  Erster Eintrag = Haupt-Kühlraum. Pro Raum wählbar: Anzeige im Wand-Tab „Kühlraum“
                  (Platzraster) oder „Extern“ (Kartenliste). Bei mehreren Räumen im Kühlraum-Tab
                  wechselt die Anzeige automatisch (Tabzeit ÷ Anzahl Räume).
                </p>
                {draft.eigeneKuehlraeume.map((kr, index) => (
                  <div key={kr.id} className="settings-kr-card">
                    {index === 0 && <span className="settings-kr-badge">Haupt-Kühlraum</span>}
                    <div className="settings-kr-row">
                      <label>
                        Bezeichnung
                        <input
                          type="text"
                          value={kr.label}
                          onChange={(e) => updateKuehlraum(index, { label: e.target.value })}
                        />
                      </label>
                      <label>
                        Plätze
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={kr.plaetze}
                          onChange={(e) =>
                            updateKuehlraum(index, {
                              plaetze: parseInt(e.target.value, 10) || 1,
                            })
                          }
                        />
                      </label>
                    </div>
                    <fieldset className="settings-kr-wand-tab">
                      <legend>Wandmonitor — Anzeige</legend>
                      <div className="settings-kr-wand-tab-options">
                        {(
                          [
                            ['kuehlraum', 'Tab Kühlraum'],
                            ['extern', 'Tab Extern'],
                          ] as const
                        ).map(([value, label]) => (
                          <label key={value} className="settings-kr-wand-tab-option">
                            <input
                              type="radio"
                              name={`wand-tab-${kr.id}`}
                              checked={(kr.wandTab ?? 'kuehlraum') === value}
                              onChange={() =>
                                updateKuehlraum(index, { wandTab: value as KuehlraumWandTab })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label>
                      Alamida-Name (optional)
                      <input
                        type="text"
                        placeholder="Kühlr. Grafenbach"
                        value={kr.alamidaName ?? ''}
                        onChange={(e) => updateKuehlraum(index, { alamidaName: e.target.value })}
                      />
                    </label>
                    <label>
                      Erkennungs-Keywords (Enter = neue Zeile, auch Komma)
                      <KeywordsTextarea
                        value={kr.matchKeywords}
                        onChange={(matchKeywords) => updateKuehlraum(index, { matchKeywords })}
                        rows={3}
                      />
                    </label>
                    <label>
                      Extern-Zuordnung — Abholorte für diesen Kühlraum
                      <KeywordsTextarea
                        value={kr.externKeywords ?? []}
                        onChange={(externKeywords) => updateKuehlraum(index, { externKeywords })}
                        rows={3}
                      />
                    </label>
                    <p className="settings-hint settings-hint--inline">
                      z. B. UK-Neunkirchen, Senecura Wolfsberg — Zuordnung für Disposition/Board.
                    </p>
                    {draft.eigeneKuehlraeume.length > 1 && (
                      <button
                        type="button"
                        className="btn-ghost btn-small"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            eigeneKuehlraeume: d.eigeneKuehlraeume.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        Kühlraum entfernen
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-ghost btn-small"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      eigeneKuehlraeume: [...d.eigeneKuehlraeume, emptyKuehlraum()],
                    }))
                  }
                >
                  + Kühlraum hinzufügen
                </button>
              </div>

              {error && <p className="settings-error">{error}</p>}
              {savedOk && (
                <p className="settings-ok">
                  Gespeichert — Agent lädt beim nächsten Sync (spätestens ~45 s) neu.
                </p>
              )}

              <div className="settings-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || !validation.ok || !dirty}
                  onClick={() => void handleSave()}
                >
                  {saving ? 'Speichern…' : dirty ? 'Einstellungen speichern' : 'Keine Änderungen'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={saving}
                  onClick={() => setDraft(normalizeDispositionSettings(settings))}
                >
                  Verwerfen
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
