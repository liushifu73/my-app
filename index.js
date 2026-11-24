// my-app —— DSH 插件入口。
// 不 import 任何 DSH 包：工具定义用标准 JSON Schema，任何目录安装都能加载。
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';

export const name = 'my-app';
export const inject = ['tools'];

const VERSION = '0.3.0';

/** 文献库根目录：配置优先，其次 DSH_PAPER_DATA_DIR，最后 ~/.dsh-paper-reader/data。 */
function resolveDataDir(config = {}) {
  if (typeof config.dataDir === 'string' && config.dataDir.trim() !== '') return config.dataDir;
  const env = process.env.DSH_PAPER_DATA_DIR;
  if (typeof env === 'string' && env.trim() !== '') return env;
  return join(homedir(), '.dsh-paper-reader', 'data');
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** 扫描文献库：专题 → 文献，附带是否已转录、是否有学习档案。 */
async function scanLibrary(dataDir) {
  let entries = [];
  try {
    entries = await readdir(dataDir, { withFileTypes: true });
  } catch {
    return { dataDir, readable: false, topics: [], totals: { topics: 0, papers: 0, transcribed: 0, studied: 0 } };
  }
  const topics = [];
  const totals = { topics: 0, papers: 0, transcribed: 0, studied: 0 };
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    const topicDir = join(dataDir, entry.name);
    let files = [];
    try {
      files = await readdir(topicDir, { withFileTypes: true });
    } catch {
      continue;
    }
    const papers = [];
    for (const file of files) {
      if (!file.isFile() || !file.name.toLowerCase().endsWith('.pdf')) continue;
      const stem = file.name.slice(0, -4);
      const transcribed = await exists(join(topicDir, `${stem}.txt`));
      const studied = await exists(join(topicDir, `${stem}.study.json`));
      papers.push({ name: stem, transcribed, studied });
      totals.papers += 1;
      if (transcribed) totals.transcribed += 1;
      if (studied) totals.studied += 1;
    }
    if (papers.length === 0 && files.length === 0) continue;
    papers.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    topics.push({ name: entry.name, papers });
    totals.topics += 1;
  }
  topics.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  return { dataDir, readable: true, topics, totals };
}

const libraryOutputSchema = {
  type: 'object',
  properties: {
    dataDir: { type: 'string', description: '文献库根目录。' },
    readable: { type: 'boolean', description: '目录是否存在且可读。' },
    totals: {
      type: 'object',
      properties: {
        topics: { type: 'integer' },
        papers: { type: 'integer' },
        transcribed: { type: 'integer' },
        studied: { type: 'integer' },
      },
      required: ['topics', 'papers', 'transcribed', 'studied'],
      additionalProperties: false,
    },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          papers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                transcribed: { type: 'boolean' },
                studied: { type: 'boolean' },
              },
              required: ['name', 'transcribed', 'studied'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'papers'],
        additionalProperties: false,
      },
    },
  },
  required: ['dataDir', 'readable', 'totals', 'topics'],
  additionalProperties: false,
};

function summarize(value) {
  if (!value.readable) return `文献库不可读：${value.dataDir}`;
  const t = value.totals;
  const lines = [`文献库 ${value.dataDir}：${t.topics} 个专题 / ${t.papers} 篇，已转录 ${t.transcribed} 篇，有学习档案 ${t.studied} 篇。`];
  for (const topic of value.topics) {
    lines.push(`- ${topic.name}（${topic.papers.length} 篇）`);
    for (const paper of topic.papers) {
      const marks = [paper.transcribed ? '已转录' : '待转录', paper.studied ? '有档案' : ''].filter(Boolean).join('，');
      lines.push(`  - ${paper.name}（${marks}）`);
    }
  }
  return lines.join('\n');
}

export function apply(ctx, config = {}) {
  const dataDir = resolveDataDir(config);

  ctx.tools.register({
    name: 'my_app_library',
    description: '列出文献库的专题和文献，并标注每篇是否已转录、是否有学习档案。用于了解库里有什么。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: libraryOutputSchema,
      render: (_args, value) => [{ type: 'text', text: summarize(value) }],
    },
    execute: async () => scanLibrary(dataDir),
  });

  // web profile 才有 webServer / connection；headless 下这段不执行，插件仍然可用。
  ctx.inject(['webServer', 'connection'], (rctx) => {
    const ws = rctx.webServer;
    const sendJson = (res, status, body) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    rctx.effect(() => ws.register({
      kind: 'prefix',
      path: '/my-app',
      handler: (req, res) => {
        const rejection = rctx.connection.requestRejection(req);
        if (rejection !== undefined) {
          sendJson(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' });
          return;
        }
        const url = new URL(req.url ?? '/', 'http://x');
        if (url.pathname === '/my-app/library') {
          scanLibrary(dataDir).then(
            (data) => sendJson(res, 200, data),
            (err) => sendJson(res, 500, { error: String(err?.message ?? err) }),
          );
          return;
        }
        if (url.pathname === '/my-app/reveal' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 4096) req.destroy();
          });
          req.on('end', () => {
            let topic = '';
            let paper = '';
            try {
              const parsed = JSON.parse(body || '{}');
              topic = String(parsed.topic ?? '');
              paper = String(parsed.name ?? '');
            } catch {
              /* 空请求体 = 打开根目录 */
            }
            // 只接受单层名字：挡掉路径分隔符与 ..
            const unsafe = (v) => v.includes('/') || v.includes('\\') || v.includes('..');
            if (unsafe(topic) || unsafe(paper)) {
              sendJson(res, 400, { error: 'bad name' });
              return;
            }
            const target = paper
              ? join(dataDir, topic, `${paper}.pdf`)
              : topic
                ? join(dataDir, topic)
                : dataDir;
            // 有具体文献就 -R 在访达里选中它，否则打开目录
            const args = paper ? ['-R', target] : [target];
            execFile('open', args, (err) => {
              if (err) sendJson(res, 500, { error: 'open failed' });
              else sendJson(res, 200, { ok: true, path: target });
            });
          });
          return;
        }
        sendJson(res, 404, { error: 'not found: ' + url.pathname });
      },
    }), 'my-app routes');
  });

  console.log(`[my-app] v${VERSION} ready, library at ${dataDir}`);
}
