import { marked, type Tokens } from 'marked';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value, 'https://helpsaveandroid.org');
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      return escapeHtml(value);
    }
  } catch {
    return null;
  }
  return null;
}

function renderInline(tokens: Tokens.Generic[] = []): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case 'text':
          return 'tokens' in token ? renderInline(token.tokens as Tokens.Generic[]) : escapeHtml(token.text ?? '');
        case 'escape':
          return escapeHtml(token.text ?? '');
        case 'strong':
          return `<strong>${renderInline(token.tokens as Tokens.Generic[])}</strong>`;
        case 'em':
          return `<em>${renderInline(token.tokens as Tokens.Generic[])}</em>`;
        case 'codespan':
          return `<code>${escapeHtml(token.text ?? '')}</code>`;
        case 'br':
          return '<br>';
        case 'link': {
          const href = safeUrl((token as Tokens.Link).href);
          const text = renderInline((token as Tokens.Link).tokens as Tokens.Generic[]);
          return href ? `<a href="${href}" rel="nofollow noreferrer" target="_blank">${text}</a>` : text;
        }
        default:
          return escapeHtml(token.raw ?? token.text ?? '');
      }
    })
    .join('');
}

function renderBlock(token: Tokens.Generic): string {
  switch (token.type) {
    case 'paragraph':
      return `<p>${renderInline(token.tokens as Tokens.Generic[])}</p>`;
    case 'space':
      return '';
    case 'blockquote':
      return `<blockquote>${(token.tokens as Tokens.Generic[]).map(renderBlock).join('')}</blockquote>`;
    case 'list': {
      const list = token as Tokens.List;
      const tag = list.ordered ? 'ol' : 'ul';
      const items = list.items
        .map((item) => `<li>${item.tokens.map((child) => (child.type === 'text' ? renderInline(child.tokens as Tokens.Generic[]) : renderBlock(child as Tokens.Generic))).join('')}</li>`)
        .join('');
      return `<${tag}>${items}</${tag}>`;
    }
    default:
      return token.tokens ? renderInline(token.tokens as Tokens.Generic[]) : escapeHtml(token.text ?? '');
  }
}

export function renderSafeGfm(markdown: string | null | undefined): string {
  if (!markdown) return '';
  const tokens = marked.lexer(markdown, {
    breaks: true,
    gfm: true,
  }) as Tokens.Generic[];
  return tokens.map(renderBlock).join('');
}
