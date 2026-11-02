import { Fragment, type ReactNode } from 'react';

/**
 * Rendu Markdown minimal et sûr (aucun HTML injecté) pour les messages des
 * agents : paragraphes, listes, titres, citations, blocs de code, `code`,
 * **gras**, *italique* et liens http(s).
 */

type Block =
  | { type: 'code'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'heading'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'para'; text: string };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'para', text: para.join('\n') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i++]!);
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    const heading = /^\s*#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', text: heading[1]! });
      continue;
    }
    const bullet = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      const ordered = Boolean(bullet[1]);
      const last = blocks[blocks.length - 1];
      if (last?.type === 'list' && last.ordered === ordered) last.items.push(bullet[2]!);
      else blocks.push({ type: 'list', ordered, items: [bullet[2]!] });
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      blocks.push({ type: 'quote', text: quote[1]! });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s)<>"]+)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const [whole, code, bold, italic, link, linkUrl, bare] = m;
    if (code) out.push(<code key={key++}>{code.slice(1, -1)}</code>);
    else if (bold) out.push(<strong key={key++}>{bold.slice(2, -2)}</strong>);
    else if (italic) out.push(<em key={key++}>{italic.slice(1, -1)}</em>);
    else if (link && linkUrl) {
      const label = link.slice(1, link.indexOf(']'));
      out.push(
        <a key={key++} href={linkUrl} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    } else if (bare) {
      out.push(
        <a key={key++} href={bare} target="_blank" rel="noopener noreferrer">
          {bare}
        </a>,
      );
    } else out.push(whole);
    last = idx + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(text: string): ReactNode[] {
  return text.split('\n').map((line, i, arr) => (
    <Fragment key={i}>
      {inline(line)}
      {i < arr.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      {parseBlocks(text).map((b, i) => {
        switch (b.type) {
          case 'code':
            return (
              <pre key={i}>
                <code>{b.text}</code>
              </pre>
            );
          case 'heading':
            return (
              <p key={i} className="md-h">
                {inline(b.text)}
              </p>
            );
          case 'quote':
            return <blockquote key={i}>{withBreaks(b.text)}</blockquote>;
          case 'list': {
            const items = b.items.map((it, j) => <li key={j}>{inline(it)}</li>);
            return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
          }
          default:
            return <p key={i}>{withBreaks(b.text)}</p>;
        }
      })}
    </div>
  );
}
