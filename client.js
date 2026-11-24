// my-app —— Web 端：侧栏底部一个「文献库」按钮 + 整页浮层面板。
// 数据走宿主路由 GET /my-app/library，和 my_app_library 工具同一份扫描逻辑。
window.__ModuleLoader__.load({
  id: '@local/my-app',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;
    const NS = 'my-app';

    const zh = {
      button: '文献库',
      title: '文献库',
      refresh: '刷新',
      reveal: '在访达中打开',
      close: '关闭',
      loading: '读取中…',
      empty: '库里还没有文献。把 PDF 放进专题文件夹即可。',
      unreadable: '这个目录读不到（可能不存在）。',
      failed: '读取失败',
      transcribed: '已转录',
      pending: '待转录',
      studied: '有档案',
      topics: '专题',
      papers: '文献',
      done: '已转录',
    };
    const en = {
      button: 'Library',
      title: 'Library',
      refresh: 'Refresh',
      reveal: 'Reveal in Finder',
      close: 'Close',
      loading: 'Loading…',
      empty: 'No papers yet. Drop PDFs into a topic folder.',
      unreadable: 'That directory cannot be read.',
      failed: 'Failed to load',
      transcribed: 'Transcribed',
      pending: 'Not transcribed',
      studied: 'Study file',
      topics: 'topics',
      papers: 'papers',
      done: 'transcribed',
    };

    // 打开状态：侧栏按钮与浮层共享
    let openState = false;
    const listeners = new Set();
    function setOpen(next) {
      if (openState === next) return;
      openState = next;
      for (const fn of [...listeners]) fn();
    }
    function useOpen() {
      const [value, setValue] = useState(openState);
      useEffect(() => {
        const fn = () => setValue(openState);
        listeners.add(fn);
        return () => listeners.delete(fn);
      }, []);
      return value;
    }

    const S = {
      backdrop: {
        position: 'fixed', inset: 0, zIndex: 1200, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.38)', padding: '24px', boxSizing: 'border-box',
      },
      card: {
        width: 'min(760px, 94vw)', maxHeight: '82vh', overflow: 'auto',
        background: 'var(--dsw-alias-bg-layer-1, #fff)',
        color: 'var(--dsw-alias-label-primary, #24292f)',
        border: '1px solid var(--dsw-alias-border-l1, #d0d7de)',
        borderRadius: '12px', padding: '18px 20px',
        boxShadow: '0 18px 48px rgba(0,0,0,.24)',
        font: '13px -apple-system, "PingFang SC", sans-serif',
      },
      head: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' },
      h: { fontSize: '15px', fontWeight: 600, margin: 0, flex: 1 },
      meta: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #656d76)', wordBreak: 'break-all', margin: '0 0 12px' },
      btn: {
        fontSize: '12px', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1, #d0d7de)', background: 'none',
        color: 'var(--dsw-alias-label-secondary, #656d76)',
      },
      topic: { marginTop: '14px' },
      topicName: { fontSize: '13px', fontWeight: 600, margin: '0 0 6px' },
      row: {
        display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
        borderRadius: '6px', borderBottom: '1px solid var(--dsw-alias-border-l1, #d0d7de)',
      },
      name: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      chipOn: {
        fontSize: '11px', padding: '1px 7px', borderRadius: '999px',
        background: 'var(--dsw-alias-interactive-bg-active, rgba(9,105,218,.12))',
        color: 'var(--dsw-alias-label-primary, #24292f)',
      },
      chipOff: {
        fontSize: '11px', padding: '1px 7px', borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-l1, #d0d7de)',
        color: 'var(--dsw-alias-label-secondary, #656d76)',
      },
      err: { color: 'var(--dsw-alias-state-error-primary, #f85149)', fontSize: '12px' },
      foot: { display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' },
    };

    function LibraryPanel(props) {
      const open = useOpen();
      const [state, setState] = useState({ status: 'idle', data: null, error: null });
      const t = props.t;

      const load = useCallback(() => {
        setState({ status: 'loading', data: null, error: null });
        fetch('/my-app/library', { credentials: 'include' })
          .then((r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then((data) => setState({ status: 'ready', data, error: null }))
          .catch((e) => setState({ status: 'error', data: null, error: String(e && e.message ? e.message : e) }));
      }, []);

      useEffect(() => {
        if (open) load();
      }, [open, load]);

      useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [open]);

      if (!open) return null;

      const reveal = (topic) => {
        fetch('/my-app/reveal', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ topic: topic || '' }),
        }).catch(() => {});
      };

      const data = state.data;
      let body;
      if (state.status === 'loading') body = h('div', { style: S.meta }, t('loading'));
      else if (state.status === 'error') body = h('div', { style: S.err }, `${t('failed')}：${state.error}`);
      else if (!data || !data.readable) body = h('div', { style: S.meta }, t('unreadable'));
      else if (data.topics.length === 0) body = h('div', { style: S.meta }, t('empty'));
      else {
        body = h(React.Fragment, null, data.topics.map((topic) =>
          h('div', { key: topic.name, style: S.topic },
            h('div', { style: S.topicName }, `${topic.name}（${topic.papers.length}）`),
            topic.papers.length === 0
              ? h('div', { style: S.meta }, t('empty'))
              : topic.papers.map((paper) =>
                  h('div', { key: paper.name, style: S.row },
                    h('span', { style: S.name, title: paper.name }, paper.name),
                    h('span', { style: paper.transcribed ? S.chipOn : S.chipOff }, paper.transcribed ? t('transcribed') : t('pending')),
                    paper.studied ? h('span', { style: S.chipOn }, t('studied')) : null,
                  )),
          )));
      }

      return h('div', {
        style: S.backdrop,
        onMouseDown: (e) => { if (e.target === e.currentTarget) setOpen(false); },
      }, h('div', { style: S.card, role: 'dialog', 'aria-modal': 'true', 'aria-label': t('title') },
        h('div', { style: S.head },
          h('h2', { style: S.h }, t('title')),
          h('button', { type: 'button', style: S.btn, onClick: load }, t('refresh')),
        ),
        data
          ? h('p', { style: S.meta },
              `${data.totals.topics} ${t('topics')} · ${data.totals.papers} ${t('papers')} · ${data.totals.transcribed} ${t('done')}\n${data.dataDir}`)
          : null,
        body,
        h('div', { style: S.foot },
          data ? h('button', { type: 'button', style: S.btn, onClick: () => reveal('') }, t('reveal')) : null,
          h('button', { type: 'button', style: S.btn, onClick: () => setOpen(false) }, t('close')),
        ),
      ));
    }

    function FooterButton(props) {
      const t = props.t;
      const open = useOpen();
      const wide = props.wide !== false;
      return h('button', {
        type: 'button',
        title: t('title'),
        'aria-pressed': open ? 'true' : 'false',
        style: {
          display: 'flex', alignItems: 'center', gap: '8px', width: wide ? '100%' : '36px',
          minHeight: '36px', padding: wide ? '7px 8px' : 0,
          justifyContent: wide ? 'flex-start' : 'center',
          borderRadius: wide ? '8px' : '50%', border: 'none', background: 'none',
          cursor: 'pointer', font: 'inherit', textAlign: 'left',
          color: open ? 'var(--dsw-alias-label-primary, #24292f)' : 'var(--dsw-alias-label-secondary, #656d76)',
        },
        onClick: () => setOpen(!open),
      }, wide ? h(React.Fragment, null, '📚', h('span', null, t('button'))) : '📚');
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'my-app: dicts');

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'my-app-overlay', locale: NS,
        }, function MyAppOverlay() {
          return h(LibraryPanel, { t });
        }));

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action', id: 'my-app-library', locale: NS,
        }, function MyAppFooter(props) {
          return h(FooterButton, { ...props, t });
        }));
      },
    };
  },
});
