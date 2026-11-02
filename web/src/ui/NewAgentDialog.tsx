import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PermissionModeChoice } from '../../../shared/types';
import { useStore } from '../store';
import { useAction, useBackend } from './common';
import { Icon } from './icons';

const MODES: Array<{ value: PermissionModeChoice; label: string; hint: string }> = [
  { value: 'default', label: 'Standard', hint: 'Te demande ton feu vert pour les commandes et les écritures.' },
  { value: 'acceptEdits', label: 'Éditions auto', hint: 'Modifie les fichiers librement, demande pour les commandes.' },
  { value: 'plan', label: 'Plan d’abord', hint: 'Lit le code et te propose un plan avant de toucher à quoi que ce soit.' },
  { value: 'auto', label: 'Automatique', hint: 'Un classifieur valide les actions sûres et te demande en cas de doute.' },
  { value: 'bypassPermissions', label: 'Sans garde-fou', hint: 'Aucune demande. Seulement si le serveur a ALLOW_BYPASS=1.' },
];

const MODELS = [
  { value: '', label: 'Par défaut' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

export function NewAgentDialog() {
  const open = useStore((s) => s.newAgentOpen);
  const setOpen = useStore((s) => s.setNewAgentOpen);
  const info = useStore((s) => s.info);
  const select = useStore((s) => s.select);
  const backend = useBackend();
  const run = useAction();
  const [task, setTask] = useState('');
  const [name, setName] = useState('');
  const [cwd, setCwd] = useState('');
  const [model, setModel] = useState('');
  const [mode, setMode] = useState<PermissionModeChoice>('default');
  const [supervised, setSupervised] = useState(true);
  const [sending, setSending] = useState(false);
  const firstField = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode(info?.defaultPermissionMode ?? 'default');
    const t = setTimeout(() => firstField.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, info?.defaultPermissionMode, setOpen]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!task.trim() || sending) return;
    setSending(true);
    let newId = '';
    const ok = await run(async () => {
      const res = await backend.spawnWorker({
        task: task.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
        ...(model ? { model } : {}),
        permissionMode: mode,
        supervised,
      });
      newId = res.id;
    }, 'Agent recruté : il arrive au QG !');
    setSending(false);
    if (ok) {
      setTask('');
      setName('');
      setOpen(false);
      if (newId) select(newId, { openTab: true });
    }
  };

  const modeHint = MODES.find((m) => m.value === mode)?.hint;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-agent-title">
        <header className="modal-head">
          <h2 id="new-agent-title">Recruter un agent</h2>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} title="Fermer">
            <Icon name="close" />
            <span className="sr-only">Fermer</span>
          </button>
        </header>
        <form className="form" onSubmit={submit}>
          <label htmlFor="na-task">Mission</label>
          <textarea
            id="na-task"
            ref={firstField}
            rows={4}
            required
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Ex. : Ajoute la pagination à l'API /users, avec des tests. Terminé quand npm test passe."
          />
          <div className="form-grid">
            <div>
              <label htmlFor="na-name">Prénom (optionnel)</label>
              <input id="na-name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Tiré au sort" />
            </div>
            <div>
              <label htmlFor="na-model">Modèle</label>
              <select id="na-model" value={model} onChange={(e) => setModel(e.target.value)}>
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="na-cwd">Dossier de travail</label>
          <input id="na-cwd" className="mono" value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder={info?.defaultCwd ?? '.'} />
          <label htmlFor="na-mode">Autorisations</label>
          <select id="na-mode" value={mode} onChange={(e) => setMode(e.target.value as PermissionModeChoice)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {modeHint ? <p className="hint">{modeHint}</p> : null}
          <label className="check">
            <input type="checkbox" id="na-supervised" checked={supervised} onChange={(e) => setSupervised(e.target.checked)} />
            Le Chef suit cet agent et me fait un rapport
          </label>
          <footer className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={!task.trim() || sending}>
              <Icon name="plus" /> Recruter
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
