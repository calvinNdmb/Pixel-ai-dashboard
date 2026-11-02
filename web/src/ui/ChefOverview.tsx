import { formatCost, formatTokens, truncate } from '../../../shared/util';
import { sortSessions, useStore } from '../store';
import { Avatar, activityText } from './common';
import { VillageIcon } from './VillageIcon';

export function ChefOverview() {
  const sessions = useStore((s) => s.sessions);
  const reports = useStore((s) => s.reports);
  const select = useStore((s) => s.select);
  const setChat = useStore((s) => s.setChefChat);
  const setTab = useStore((s) => s.setTab);
  const ready = useStore((s) => s.ready);
  const list = Object.values(sessions);
  const chef = list.find((s) => s.role === 'manager');
  const crew = list.filter((s) => s.role !== 'manager' && s.status !== 'ended');
  const working = sortSessions(crew.filter((s) => s.status !== 'idle'));
  const pending = crew.filter((s) => s.pending || s.hold || s.status === 'error');
  const latest = reports.at(-1);
  const tokens = list.reduce((n, s) => n + s.tokensIn + s.tokensOut, 0);
  const cost = list.reduce((n, s) => n + s.costUsd, 0);
  const openDecision = () => {
    if (pending[0]) select(pending[0].id, { openTab: true });
    else setTab('missions');
  };
  return (
    <section className="chef-overview" aria-label="Le point du chef">
      <header className="overview-header">
        <div className="portrait-tile">
          {chef ? <Avatar session={chef} scale={2.2} /> : <VillageIcon name="chef" size={32} />}
        </div>
        <div>
          <span className="eyebrow">Le point du village</span>
          <h2>
            {chef && chef.name !== 'Chef' ? (
              <>
                {chef.name} <span>· Chef</span>
              </>
            ) : (
              'Le chef du village'
            )}
          </h2>
          <p>
            {ready ? `${crew.length} session${crew.length > 1 ? 's' : ''} dans le village` : 'Connexion aux sessions…'}
          </p>
        </div>
      </header>
      <div className="overview-scroll">
        <div className="overview-stats">
          <span>
            <i className="status-dot" /> {working.length} en activité
          </span>
          <span>
            {formatTokens(tokens)} tokens <b>·</b> {formatCost(cost)}
          </span>
        </div>
        <section className="overview-work">
          <div className="section-heading">
            <h3>En cours</h3>
            <button type="button" onClick={() => setTab('missions')}>
              Tout voir <VillageIcon name="arrow" size={14} />
            </button>
          </div>
          {working.slice(0, 3).map((s) => (
            <button key={s.id} type="button" className="work-card" onClick={() => select(s.id, { openTab: true })}>
              <Avatar session={s} scale={1.5} />
              <span>
                <strong>{s.name}</strong>
                <small>{truncate(s.task || activityText(s), 62)}</small>
              </span>
              <i className={`status-dot dot-${s.status}`} title={activityText(s)} />
            </button>
          ))}
          {!working.length ? (
            <p className="village-empty">
              {crew.length
                ? 'L’équipe est disponible pour une nouvelle mission.'
                : 'Ton village attend ses premiers agents. Donne un objectif au chef pour commencer.'}
            </p>
          ) : null}
        </section>
        <section className={`chief-note ${pending.length ? 'needs-attention' : ''}`}>
          <h3>{pending.length ? 'À décider' : 'Le dernier rapport'}</h3>
          <div className="note-content">
            <VillageIcon name={pending.length ? 'missions' : 'leaf'} size={24} />
            <div>
              <strong>
                {pending.length
                  ? `${pending.length} session${pending.length > 1 ? 's' : ''} demande${pending.length > 1 ? 'nt' : ''} ton attention`
                  : (latest?.title ?? 'Le chef veille sur le village')}
              </strong>
              <p>
                {pending[0]
                  ? truncate(
                      pending[0].pending?.summary || pending[0].activityLabel || 'Ouvre la fiche pour voir le détail.',
                      120,
                    )
                  : latest
                    ? truncate(latest.body, 160)
                    : 'Les nouvelles et les décisions importantes seront réunies ici.'}
              </p>
            </div>
          </div>
        </section>
      </div>
      <footer className="overview-actions">
        <button type="button" className="btn btn-ghost" disabled={!ready} onClick={() => setChat(true)}>
          <VillageIcon name="chat" size={18} /> Discuter
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ready}
          onClick={pending.length ? openDecision : () => setChat(true)}
        >
          <VillageIcon name={pending.length ? 'arrow' : 'plus'} size={18} />{' '}
          {pending.length ? 'Voir la demande' : 'Donner une mission'}
        </button>
      </footer>
    </section>
  );
}
