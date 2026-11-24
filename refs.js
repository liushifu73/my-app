// 参考文献核实与格式化：Crossref + arXiv，输出俄文期刊惯用的 ГОСТ 变体。
// 只用 Node 内置的 fetch，不依赖任何包。

const UA = 'dsh-my-app/0.4 (+https://github.com/liushifu73/my-app)';
const TIMEOUT_MS = 9000;

async function fetchText(url, asJson, attempt = 0) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: asJson ? 'application/json' : 'application/atom+xml,text/xml' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // 429 / 5xx 再试一次，Crossref 偶尔限流
    if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 900));
      return fetchText(url, asJson, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return asJson ? res.json() : res.text();
}

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 2);
}

/** 标题相似度：词集合的 Dice 系数（0..1）。 */
function dice(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return (2 * inter) / (A.size + B.size);
}

function initials(given) {
  return String(given || '')
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + '.')
    .join('');
}

function authorsLine(list) {
  if (!Array.isArray(list)) return '';
  return list
    .slice(0, 8)
    .map((a) => {
      const family = a.family || a.name || '';
      const init = a.given ? initials(a.given) : a.initials || '';
      return `${family} ${init}`.trim();
    })
    .filter(Boolean)
    .join(', ');
}

/** 把核实到的元数据写成文献表一行（英文源沿用 Vol./No./P.，与期刊已有文风一致）。 */
export function toGost(meta) {
  const auth = authorsLine(meta.authors);
  const title = String(meta.title || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  let s = '';
  if (auth) s += auth + '. ';
  s += title;
  if (meta.venue) s += ' // ' + String(meta.venue).replace(/\s+/g, ' ').trim();
  s += '. ' + (meta.year || 'б. г.') + '.';
  if (meta.volume) s += ' Vol. ' + meta.volume + (meta.issue ? ',' : '.');
  if (meta.issue) s += ' No. ' + meta.issue + '.';
  if (meta.pages) s += ' P. ' + String(meta.pages).replace(/\s*[-–—]\s*/, '–') + '.';
  if (meta.doi) s += ' DOI: ' + meta.doi + '.';
  return s.replace(/\s+/g, ' ').replace(/\.\./g, '.').trim();
}

function fromCrossref(item) {
  const parts = item.issued?.['date-parts']?.[0];
  const container = item['container-title'];
  return {
    title: Array.isArray(item.title) ? item.title[0] : item.title || '',
    authors: item.author || [],
    year: parts && parts[0] ? String(parts[0]) : '',
    venue: Array.isArray(container) ? container[0] : container || '',
    volume: item.volume || '',
    issue: item.issue || '',
    pages: item.page || '',
    doi: item.DOI || '',
    source: 'crossref',
  };
}

function decodeXml(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function fromArxivEntry(entry) {
  const title = decodeXml((entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '')
    .replace(/\s+/g, ' ')
    .trim();
  const id = (entry.match(/<id>([\s\S]*?)<\/id>/) || [])[1] || '';
  const arxivId = ((id.match(/abs\/([^<]+)/) || [])[1] || '').replace(/v\d+$/, '');
  const published = (entry.match(/<published>([\s\S]*?)<\/published>/) || [])[1] || '';
  const names = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => decodeXml(m[1]).trim());
  const authors = names.map((n) => {
    const bits = n.split(/\s+/);
    return { family: bits.pop(), given: bits.join(' ') };
  });
  return {
    title,
    authors,
    year: published.slice(0, 4),
    venue: 'arXiv:' + arxivId,
    volume: '',
    issue: '',
    pages: '',
    doi: arxivId ? '10.48550/arXiv.' + arxivId : '',
    source: 'arxiv',
    arxivId,
  };
}

/** 从一整行文献里猜标题：取 // 之前最长的「. 」分段。 */
function guessTitle(input) {
  const s = String(input || '').replace(/\s+/g, ' ').trim();
  const slash = s.indexOf('//');
  const head = slash >= 0 ? s.slice(0, slash) : s;
  const parts = head.split(/\.\s+/).map((p) => p.trim()).filter(Boolean);
  let best = parts.reduce((a, b) => (b.length > a.length ? b : a), '');
  best = best.replace(/\s*\.?\s*(19|20)\d{2}[\s.,;].*$/, '').trim();
  return best || s.slice(0, 200);
}

/** 单条查询：先试 Crossref，再试 arXiv。 */
async function lookup(input) {
  const candidates = [];
  const doi = (input.match(/10\.\d{4,9}\/[^\s"<>]+/) || [])[0];
  if (doi) {
    try {
      const url = 'https://api.crossref.org/works/' + encodeURIComponent(doi.replace(/[.,;]+$/, ''));
      const data = await fetchText(url, true);
      if (data?.message) candidates.push(fromCrossref(data.message));
    } catch {
      /* 继续走检索 */
    }
  }
  try {
    const title = guessTitle(input);
    const q = encodeURIComponent(title.slice(0, 300));
    const url =
      'https://api.crossref.org/works?rows=5&query.bibliographic=' + q +
      '&select=title,author,issued,container-title,volume,issue,page,DOI';
    const data = await fetchText(url, true);
    for (const item of data?.message?.items || []) candidates.push(fromCrossref(item));
  } catch {
    /* 网络问题留给下面的 arXiv 或最终的空结果 */
  }
  const want = tokens(guessTitle(input));
  let best = null;
  for (const c of candidates) {
    const score = dice(want, tokens(c.title));
    if (!best || score > best.score) best = { ...c, score };
  }
  if (!best || best.score < 0.5) {
    try {
      const q = encodeURIComponent('ti:"' + guessTitle(input).replace(/["\\]/g, ' ').slice(0, 200) + '"');
      const xml = await fetchText('https://export.arxiv.org/api/query?search_query=' + q + '&max_results=3', false);
      for (const block of xml.split('<entry>').slice(1)) {
        const c = fromArxivEntry(block);
        const score = dice(want, tokens(c.title));
        if (!best || score > best.score) best = { ...c, score };
      }
    } catch {
      /* arXiv 不可用就算了 */
    }
  }
  return best;
}

/** 核实一批文献。每条返回 input / status / score / formatted / match。 */
export async function verifyRefs(refs, concurrency = 2) {
  const list = (Array.isArray(refs) ? refs : []).map((r) => String(r || '').trim()).filter(Boolean).slice(0, 20);
  const out = new Array(list.length);
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const i = cursor++;
      const input = list[i];
      try {
        const best = await lookup(input);
        if (!best || !best.title) {
          out[i] = { input, status: 'not_found', score: 0, formatted: '', match: null };
        } else {
          const status = best.score >= 0.55 ? 'verified' : best.score >= 0.3 ? 'check' : 'not_found';
          out[i] = {
            input,
            status,
            score: Number(best.score.toFixed(2)),
            formatted: toGost(best),
            match: {
              title: best.title,
              authors: authorsLine(best.authors),
              year: best.year,
              venue: best.venue,
              volume: best.volume,
              issue: best.issue,
              pages: best.pages,
              doi: best.doi,
              source: best.source,
            },
          };
        }
      } catch (err) {
        out[i] = { input, status: 'error', score: 0, formatted: '', match: null, error: String(err?.message ?? err) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length || 1) }, worker));
  return out;
}
