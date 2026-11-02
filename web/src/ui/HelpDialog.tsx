import { useEffect } from 'react';
import { useStore } from '../store';
import { Icon } from './icons';

const ZONES: Array<[string, string, string]> = [
  ['Bureau du Chef', 'en haut à gauche', "Le Chef coordonne : il découpe tes objectifs, recrute et briefe les agents, puis te fait des rapports. Quand il se déplace jusqu'au bureau d'un agent, c'est qu'il lui parle."],
  ['Postes de travail', 'open space', "Chaque agent a son bureau. Il y réfléchit (bulle « … ») et y code (bulle crayon, écran qui défile)."],
  ['Bibliothèque', 'en haut', 'Lecture et recherche dans le code : Read, Grep, Glob.'],
  ['Salle serveurs', 'en haut à droite', 'Commandes shell : Bash (tests, build, git…). Les LED s’affolent quand quelqu’un y travaille.'],
  ['Coin Web', 'à droite', 'Recherches et pages web (WebSearch, WebFetch) et outils MCP externes.'],
  ['Tableau de planning', 'au centre', 'Listes de tâches (TodoWrite). Les post-it représentent les missions en cours.'],
  ['Salle de réunion', 'en bas', 'Délégation à des sous-agents : les stagiaires (casquette) y travaillent, puis repartent.'],
  ['Salon & arcade', 'en bas', "Les agents disponibles y prennent un café, jouent au babyfoot… ou font la sieste."],
];

const BUBBLES: Array<[string, string]> = [
  ['!', 'Lève la main : attend ton feu vert (autorisation). Réponds dans la colonne de droite.'],
  ['✓', 'Mission ou tour terminé : petite fête, puis direction le salon.'],
  ['×', 'Une erreur est survenue.'],
  ['…', 'Réfléchit.'],
];

export function HelpDialog() {
  const open = useStore((s) => s.helpOpen);
  const setOpen = useStore((s) => s.setHelpOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header className="modal-head">
          <h2 id="help-title">Comment lire le QG</h2>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} title="Fermer">
            <Icon name="close" />
            <span className="sr-only">Fermer</span>
          </button>
        </header>
        <div className="help">
          <p>
            Chaque personnage est une session Claude Code ou Codex. Sa position dans le QG indique ce qu’il fait, sa bulle
            précise l’action. Clique sur un personnage pour voir son journal, lui écrire ou l’arrêter.
          </p>
          <dl className="legend">
            {ZONES.map(([zone, where, what]) => (
              <div key={zone}>
                <dt>
                  {zone} <span className="muted">· {where}</span>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
          <h3>Bulles</h3>
          <dl className="legend legend-bubbles">
            {BUBBLES.map(([b, what]) => (
              <div key={b}>
                <dt>
                  <span className="bubble-sample">{b}</span>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
          <h3>Qui est qui ?</h3>
          <ul className="plain">
            <li>
              <strong>Le Chef</strong> (toque blanche) : l’agent coordinateur à qui tu parles dans l’onglet Chef.
            </li>
            <li>
              <strong>Les agents</strong> : sessions lancées par le Chef ou par toi (bouton Recruter), avec Claude Code ou Codex.
            </li>
            <li>
              <strong>Les agents Codex</strong> : sweat anthracite, étiquette turquoise et badge <span className="badge badge-codex">Codex</span>.
            </li>
            <li>
              <strong>Les stagiaires</strong> (casquette) : sous-agents lancés par un agent. Ils bossent en salle de réunion puis
              repartent quand ils ont rendu leur travail.
            </li>
            <li>
              <strong>Les visiteurs en sweat gris</strong> (nom précédé de «&nbsp;&gt;&nbsp;») : tes sessions ouvertes dans un terminal
              ou un IDE. Sans rien installer, le QG les repère en lisant leurs transcripts (badge{' '}
              <span className="badge badge-watch">Observée</span>, lecture seule). Avec les hooks (<code>npm run hooks:install</code>,
              et <code>-- --codex</code> pour Codex), elles deviennent <span className="badge badge-hook">Terminal</span> et se pilotent
              à distance.
            </li>
          </ul>
          <h3>À distance</h3>
          <ul className="plain">
            <li>
              <strong>Télécommande</strong> (en haut) : quand elle est active, les demandes d’autorisation et les fins de tour des
              sessions terminal attendent ta réponse ici. Tu réponds depuis la fiche de l’agent ; « Rendre la main au terminal »
              libère la session.
            </li>
            <li>
              <strong>Téléphone</strong> : lance le serveur avec <code>npm run remote</code>, ouvre le bouton téléphone et scanne le QR
              code. Le dashboard s’installe comme une appli (« Ajouter à l’écran d’accueil »).
            </li>
            <li>
              <strong>Notifications</strong> : ntfy, Discord ou Slack te préviennent quand un agent t’attend, même dashboard fermé.
            </li>
          </ul>
          <p className="muted small">Astuce : le chat du QG adore les caresses. Clique dessus.</p>
        </div>
      </div>
    </div>
  );
}
