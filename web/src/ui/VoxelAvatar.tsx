import type { SessionInfo } from '../../../shared/types';
import { villageAppearance } from '../village/appearance';

/** An original cubical portrait using the very same palette as the 3D actor. */
export function Avatar({
  session,
  scale = 2,
}: {
  session: Pick<SessionInfo, 'seed' | 'role' | 'agent'>;
  scale?: number;
}) {
  const p = villageAppearance(session);
  return (
    <svg
      className="avatar voxel-avatar"
      viewBox="0 0 48 55"
      width={24 * scale}
      height={27.5 * scale}
      aria-hidden="true"
    >
      <path d="M5 50 24 55 44 49 43 35 25 30 7 35Z" fill={p.coat} />
      <path d="M25 30 43 35 44 49 25 54Z" fill="#000" opacity=".13" />
      <path d="m20 34 6 2 0 7-6-2Z" fill="#e3d7b9" />
      <path d="M7 14 26 8 42 14 42 36 25 43 7 36Z" fill={p.skin} />
      <path d="m25 21 17-7v22l-17 7Z" fill="#000" opacity=".13" />
      <path d="M5 12 24 5 44 11 44 22 37 24 37 16 25 21 10 17 10 28 5 26Z" fill={p.hair} />
      <path d="M5 12 24 5 44 11 25 18Z" fill="#fff" opacity=".13" />
      <path d="m12 26 3 1v4l-3-1Zm9 2 3 1v4l-3-1Z" fill="#39382f" />
      <path d="m13 26 1 .3v1l-1-.3Zm9 2 1 .3v1l-1-.3Z" fill="#fff3d9" />
      <path d="m17 33 3 1v2l-3-1Z" fill="#b17e61" />
      {p.hat ? (
        <g>
          <path d="M1 12 24 4 47 11 46 17 24 24 1 18Z" fill="#bd9d60" />
          <path d="M2 12 24 5 47 11 24 19Z" fill="#d3ba7f" />
          <path d="M10 10 25 5 39 9 38 14 25 19 10 15Z" fill="#bda062" />
          <path d="m10 10 15-5 14 4-14 5Z" fill="#dfc68c" />
        </g>
      ) : null}
      <path d="M7 40 13 42 13 50 7 48Z" fill={p.skin} />
    </svg>
  );
}
