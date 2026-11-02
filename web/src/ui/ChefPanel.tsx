import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatMessage, Report } from '../../../shared/types';
import { useStore } from '../store';
import { Avatar, activityText, timeOf, useAction, useBackend } from './common';
import { Icon } from './icons';
import { Markdown } from './markdown';

const SUGGESTIONS = [
  "Fais le point sur l'équipe",
  'Ajoute des tests au module de paiement puis documente-le',
  'Trouve et corrige les bugs signalés dans TODO.md',
  'Résume ce qui a été fait aujourd’hui',
];

const LEVEL_LABEL: Record<Report['level'], string> = {
  info: 'Info',
  success: 'Terminé',
  warning: 'Attention',
  question: 'Question',
};

function ReportCard({ report }: { report: Report }) {
  const sessions = useStore((s) => s.sessions);
  const select = useStore((s) => s.select);
  return (
    <article className={`report report-${report.level}`}>
      <header>
        <span className={`level level-${report.level}`}>{LEVEL_LABEL[report.level]}</span>
        <h3>{report.title}</h3>
        <time dateTime={new Date(report.ts).toISOString()}>{timeOf(report.ts)}</time>
      </header>
      <Markdown text={report.body} />
      {report.sessionIds.length ? (
        <footer>
          {report.sessionIds.map((id) => {
            const s = sessions[id];
            if (!s) return null;
            return (
              <button key={id} type="button" className="mini-agent" onClick={() => select(id, { openTab: true })}>
                <Avatar session={s} scale={1} />
                {s.name}
              </button>
            );
          })}
        </footer>
      ) : null}
    </article>
  );
}

function Message({ m }: { m: ChatMessage }) {
  if (m.from === 'system') {
    return (
      <p className="msg msg-system">
        <span>{m.text}</span>
      </p>
    );
  }
  return (
    <div className={`msg msg-${m.from}`}>
      <div className="msg-body">
        {m.from === 'manager' ? <Markdown text={m.text} /> : <p className="msg-plain">{m.text}</p>}
      </div>
      <time dateTime={new Date(m.ts).toISOString()}>{timeOf(m.ts)}</time>
    </div>
  );
}

export function ChefPanel() {
  const chef = useStore((s) => s.sessions.chef);
  const chat = useStore((s) => s.chat);
  const reports = useStore((s) => s.reports);
  const backend = useBackend();
  const run = useAction();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const reportById = useMemo(() => new Map(reports.map((r) => [r.id, r] as const)), [reports]);
  const busy = chef?.status === 'working' || chef?.status === 'starting';

  useEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.length, busy]);

  const onScroll = () => {
    const el = logRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText('');
    stick.current = true;
    const ok = await run(() => backend.sendToManager(t));
    if (!ok) setText(t);
    setSending(false);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <section className="panel panel-chef" aria-label="Discussion avec le Chef">
      <header className="panel-head">
        {chef ? <Avatar session={chef} scale={2} /> : null}
        <div className="panel-title">
          <h2>Le Chef</h2>
          <p className="muted">{chef ? activityText(chef) : 'Connexion…'}</p>
        </div>
        {busy ? (
          <button type="button" className="btn btn-ghost" onClick={() => run(() => backend.interrupt('chef'), 'Chef interrompu')}>
            <Icon name="pause" /> Interrompre
          </button>
        ) : null}
      </header>

      <div className="chat-log" ref={logRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions">
        {chat.map((m) => {
          const report = m.reportId ? reportById.get(m.reportId) : undefined;
          return report ? <ReportCard key={m.id} report={report} /> : <Message key={m.id} m={m} />;
        })}
        {busy ? (
          <p className="typing" aria-live="off">
            Le Chef réfléchit<span className="typing-dots" aria-hidden />
          </p>
        ) : null}
      </div>

      {!chat.some((m) => m.from === 'user') ? (
        <div className="suggestions" aria-label="Idées de missions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="suggestion" onClick={() => setText(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form className="composer" onSubmit={send}>
        <label htmlFor="chef-input" className="sr-only">
          Message au Chef
        </label>
        <textarea
          id="chef-input"
          value={text}
          rows={2}
          placeholder="Donne un objectif au Chef… (Entrée pour envoyer)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim() || sending}>
          <Icon name="send" /> Envoyer
        </button>
      </form>
    </section>
  );
}
