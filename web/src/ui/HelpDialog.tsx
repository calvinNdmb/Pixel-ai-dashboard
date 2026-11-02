import { useEffect } from 'react';
import { useStore } from '../store';
import { Icon } from './icons';

const ZONES: Array<[string, string, string]> = [
  ['Maison du chef', 'à gauche', 'Le coordinateur répartit les missions et suit les agents. Le menu Chef réunit ses rapports, les demandes et la discussion.'],
  ['Atelier du code', 'au fond', 'Les agents y réfléchissent et modifient les fichiers. Leur bulle décrit la véritable activité de la session.'],
  ['Bibliothèque', 'au fond à gauche', 'Lecture du code, recherche de fichiers et consultation de documentation.'],
  ['Laboratoire de tests', 'au fond à droite', 'Commandes shell : tests, builds et autres commandes. La position seule ne prouve pas que les tests ont réussi : consulte le journal.'],
  ['Tableau des missions', 'sur la place', 'Planification et coordination. Le menu Missions affiche les objectifs et les statuts réels, sans pourcentage inventé.'],
  ['Bancs du village', 'près du chemin', 'Les agents disponibles attendent leur prochaine mission. Un cercle ambre signale une session en attente, un cercle rouge une erreur.'],
];

const BUBBLES: Array<[string, string]> = [
  ['!', 'Demande une autorisation. Ouvre sa fiche pour examiner l’action, puis autorise ou refuse.'],
  ['✓', 'Le tour est terminé : vérifie le résultat et le rapport dans la fiche.'],
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
              <strong>Le Chef</strong> (tenue verte) : l’agent coordinateur à qui tu parles dans l’onglet Chef.
            </li>
            <li>
              <strong>Les agents</strong> : sessions lancées par le Chef ou par toi (bouton Recruter), avec Claude Code ou Codex.
            </li>
            <li>
              <strong>Les agents Codex</strong> : tenue bleu ardoise et badge <span className="badge badge-codex">Codex</span>.
            </li>
            <li>
              <strong>Les sous-agents</strong> : lancés par un agent pour une sous-tâche. Ils travaillent près du chef puis
              repartent quand ils ont rendu leur travail.
            </li>
            <li>
              <strong>Les sessions externes</strong> : tes sessions ouvertes dans un terminal
              ou un IDE. Sans rien installer, le QG les repère en lisant leurs transcripts (badge{' '}
              <span className="badge badge-watch">Observée</span>, lecture seule). Avec les hooks (<code>npm run hooks:install</code>,
              et <code>-- --codex</code> pour Codex), elles deviennent <span className="badge badge-hook">Terminal</span> et se pilotent
              à distance.
            </li>
          </ul>
          <h3>À distance</h3>
          <ul className="plain">
            <li>
              <strong>Télécommande</strong> (dans les réglages) : quand elle est active, les demandes d’autorisation et les fins de tour des
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
          <p className="muted small">Caméra : glisse pour te déplacer, molette ou deux doigts pour zoomer, clic droit ou deux doigts pour tourner. « Vue du monde » révèle la tortue flottante. La pause suspend uniquement les animations ; les sessions continuent. Sans WebGL, le QG 2D prend le relais. Échap ferme le panneau courant.</p>
        </div>
      </div>
    </div>
  );
}
