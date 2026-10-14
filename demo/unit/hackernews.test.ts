import { describe, expect, it } from 'vitest';
import {
  createHackerNewsClient,
  estimatedRowCount,
  hackerNewsProvider,
  commentBody,
  plainText,
  type AlgoliaHit,
  type HackerNewsClientOptions,
} from '../src/data/hackernews';

const S = 1000;
const ROWS = 10_000;
/** The API's latest item; a refresh grows the provider to it. */
const MAX = ROWS + 50;
const START = Date.UTC(2020, 0, 1);
/** One item every ten seconds from 2020-01-01. */
const posted = (id: number) => START + (id - 1) * 10 * S;
const DELETED = 5000;
/** Items Algolia does not index, just before 2020-01-02. */
const UNINDEXED = new Set([8636, 8637, 8638, 8639, 8640]);

function item(id: number) {
  if (id < 1 || id > MAX) return null;
  const time = posted(id) / S;
  if (id === 11)
    return {
      id,
      by: 'commenter',
      time,
      type: 'comment',
      parent: 10,
      kids: Array.from({ length: 60 }, (_, i) => i + 20),
      text: '<p>See <a href="https://example.com/docs">the docs</a></p>',
      url: 'javascript:alert(1)',
    };
  if (id === DELETED) return { id, deleted: true, time, type: 'comment' };
  if (id % 10 === 0)
    return {
      id,
      by: 'author',
      time,
      type: 'story',
      title: `Story ${id}`,
      score: id / 10,
      descendants: 3,
    };
  return {
    id,
    by: 'commenter',
    time,
    type: 'comment',
    parent: id - 1,
    kids: [id + 1],
    text: `<p>Hi &amp; <i>there</i> &#x27;${id}&#x27;`,
  };
}
const hit = (id: number, extra: Partial<AlgoliaHit> = {}): AlgoliaHit => ({
  objectID: String(id),
  created_at_i: posted(id) / S,
  ...extra,
});

function fakeApis() {
  const urls: string[] = [];
  let active = 0,
    peak = 0;
  const fetch: HackerNewsClientOptions['fetch'] = async (url, { signal }) => {
    urls.push(url);
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      signal.throwIfAborted();
      const parsed = new URL(url);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      const itemPath = /\/v0\/item\/(\d+)\.json$/.exec(parsed.pathname);
      if (itemPath) return json(item(Number(itemPath[1])));
      if (parsed.pathname.endsWith('/maxitem.json')) return json(MAX);
      const params = parsed.searchParams;
      const filters = (params.get('numericFilters') ?? '').split(',').filter(Boolean);
      const before = filters.find((f) => f.startsWith('created_at_i<'));
      if (before) {
        const limit = Number(before.slice('created_at_i<'.length)) * S;
        let id = Math.ceil((limit - START) / (10 * S));
        while (UNINDEXED.has(id) || posted(id) >= limit) id--;
        return json({ hits: id >= 1 ? [hit(id)] : [], nbHits: Math.max(0, id) });
      }
      const after = filters.find((f) => f.startsWith('created_at_i>='));
      const keep = (h: AlgoliaHit) =>
        !after || h.created_at_i >= Number(after.slice('created_at_i>='.length));
      if (filters.includes('points>2000'))
        return json({
          hits: [
            hit(4000, { title: 'Top', points: 9000 }),
            hit(7000, { title: 'Second', points: 5000 }),
          ],
          nbHits: 2,
        });
      if (filters.includes('num_comments>2500'))
        return json({
          hits: [
            hit(7000, { title: 'Second', num_comments: 2600 }),
            hit(100, { title: 'Thread', num_comments: 4000 }),
          ],
          nbHits: 2,
        });
      if (params.get('query') === 'rust') {
        const hits = [
          hit(9000, { title: 'Rust 1.0' }),
          hit(300, { comment_text: 'rust', author: 'a', story_title: 'Langs' }),
          hit(20_000, { title: 'Too new' }),
        ].filter(keep);
        return json({ hits, nbHits: 500 });
      }
      return json({ hits: [hit(1230, { title: 'Match', points: 4000 })], nbHits: 1 });
    } finally {
      active--;
    }
  };
  return { urls, fetch, peak: () => peak };
}
const signal = new AbortController().signal;
const setup = (rows = ROWS) => {
  const server = fakeApis();
  return { ...server, provider: hackerNewsProvider(rows, createHackerNewsClient(server)) };
};

describe('Hacker News provider', () => {
  it('reads row i as item i + 1 with bounded concurrency', async () => {
    const { provider, peak } = setup();
    const rows = await provider.fetchRows(DELETED - 5, 15, signal);
    expect(rows.map((row) => row.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => DELETED - 4 + i),
    );
    expect(rows[4]).toMatchObject({ id: DELETED, missing: false, deleted: true, text: '' });
    expect(rows[5]).toMatchObject({
      id: 5000 + 1,
      type: 'comment',
      text: "Hi & there '5001'",
      replies: 1,
      parent: 5000,
      kids: [5002],
      links: [],
      body: [{ code: false, parts: [{ text: "Hi & there '5001'" }] }],
    });
    expect(rows[14]).toMatchObject({
      id: 5010,
      type: 'story',
      title: 'Story 5010',
      score: 501,
      descendants: 3,
    });
    expect(rows[14].missing === false && rows[14].time).toBe(posted(5010));
    const page = await provider.fetchRows(0, 100, signal);
    expect(page).toHaveLength(100);
    expect(peak()).toBeLessThanOrEqual(24);
    const beyond = await setup(MAX + 10).provider.fetchRows(MAX - 1, 3, signal);
    expect(beyond.map((row) => row.missing)).toEqual([false, true, true]);
    const aborted = new AbortController();
    aborted.abort();
    await expect(provider.fetchRows(0, 5, aborted.signal)).rejects.toThrow();
  });

  it('summarizes activity from the posting times at group edges', async () => {
    const { provider, urls } = setup();
    const groups = await provider.fetchAggregates!({ start: 0, end: 1000, buckets: 4 }, signal);
    expect(groups.map(({ start, end }) => [start, end])).toEqual([
      [0, 250],
      [250, 500],
      [500, 750],
      [750, 1000],
    ]);
    // One item per ten seconds is 360 items an hour.
    for (const group of groups) {
      expect(group).toMatchObject({ count: 250, min: null, max: null, accuracy: 'exact' });
      expect(group.avg).toBeCloseTo(360, 9);
    }
    expect(urls).toHaveLength(5);
    const overview = await provider.fetchOverview!(320, signal);
    expect(overview).toHaveLength(160);
    expect(overview.at(-1)!.end).toBe(ROWS);
    expect(overview.every((group) => Math.abs(group.avg! - 360) < 1e-9)).toBe(true);
    const tail = await setup(MAX + 10).provider.fetchAggregates!(
      { start: MAX - 10, end: MAX + 10, buckets: 2 },
      signal,
    );
    expect(tail.map((group) => group.accuracy)).toEqual(['exact', 'unavailable']);
  });

  it('jumps to the first item posted on a date, past unindexed items', async () => {
    const { provider } = setup();
    const at = (value: string) =>
      provider.search!({ kind: 'date', value }, { fromIndex: 0, limit: 1, signal });
    expect((await at('2020-01-02')).matches[0].index).toBe(8640);
    expect((await at('2020-01-01')).matches[0].index).toBe(0);
    expect((await at('2005')).matches).toEqual([]);
    expect((await at('2020-03')).matches).toEqual([]);
  });

  it('maps Algolia matches to item rows from the current position', async () => {
    const { provider, urls } = setup();
    const all = await provider.search!(
      { kind: 'text', value: 'rust' },
      { fromIndex: 0, limit: 5, signal },
    );
    expect(all.matches.map((match) => match.index)).toEqual([299, 8999]);
    expect(all.matches[0].label).toBe('Comment by a on “Langs” · 2020-01-01');
    expect(all).toMatchObject({
      complete: false,
      message: 'Top 2 of about 500 matches, ranked by Algolia.',
    });
    const later = await provider.search!(
      { kind: 'text', value: 'rust' },
      { fromIndex: 1000, limit: 5, signal },
    );
    expect(later.matches.map((match) => match.index)).toEqual([8999]);
    expect(urls.at(-1)).toContain(encodeURIComponent(`created_at_i>=${posted(1001) / S}`));
    const points = await provider.search!(
      { kind: 'predicate', field: 'points', operator: '>', value: 3000 },
      { fromIndex: 0, limit: 5, signal },
    );
    expect(points).toEqual({
      matches: [
        {
          id: 'search-1230',
          index: 1229,
          label: 'Match · 4,000 points · 2020-01-01',
          kind: 'search',
        },
      ],
      complete: true,
      message: undefined,
    });
    expect(urls.at(-1)).toContain('tags=story');
    await provider.search!(
      { kind: 'predicate', field: 'by', operator: '=', value: 'pg' },
      { fromIndex: 0, limit: 5, signal },
    );
    expect(urls.at(-1)).toContain('tags=author_pg');
    const reject = (field: string, operator: '=' | '<', value: string | number) =>
      provider.search!(
        { kind: 'predicate', field, operator, value },
        { fromIndex: 0, limit: 5, signal },
      );
    await expect(reject('score', '=', 1)).rejects.toThrow(/points > N/);
    await expect(reject('points', '<', 1)).rejects.toThrow(/points > N/);
    await expect(reject('by', '=', 'a b')).rejects.toThrow(/by = "username"/);
  });

  it('derives landmarks once from the most upvoted and discussed stories', async () => {
    const { provider, urls } = setup();
    const markers = await provider.fetchMarkers!(signal);
    expect(markers.map(({ id, index, kind }) => [id, index, kind])).toEqual([
      ['discussed-1', 99, 'event'],
      ['top', 3999, 'spike'],
      ['upvoted-2', 6999, 'event'],
    ]);
    await provider.loadMarkers(signal);
    expect(urls).toHaveLength(2);
  });

  it('grows to the latest item without moving addresses', async () => {
    const { provider } = setup();
    const grown = await provider.refresh(signal);
    expect(grown).toMatchObject({ id: provider.id, revision: provider.revision, rowCount: MAX });
    expect(await grown.refresh(signal)).toBe(grown);
    const chapters = await provider.fetchChapters!(signal);
    expect(chapters[0]).toMatchObject({ id: 'year-2006', start: 0, end: 62 });
    expect(chapters.at(-1)!.end).toBe(ROWS);
  });

  it('estimates a row count that trails the real latest item', () => {
    const anchor = Date.UTC(2026, 9, 14, 0, 2, 7);
    expect(estimatedRowCount(anchor - 86_400_000)).toBe(50_080_669);
    expect(estimatedRowCount(anchor + 86_400_000)).toBe(50_080_669 + 8000);
  });

  it('reduces item markup to plain text and keeps safe links', async () => {
    expect(plainText('<p>a &lt;b&gt; <a href="x">link</a>&#x2F;&#47; &bogus; &#xFFFFFF;')).toBe(
      'a <b> link// &bogus; &#xFFFFFF;',
    );
    expect(plainText('x'.repeat(300))).toHaveLength(280);
    const body = commentBody(
      '<p>See <a href="https://example.com/a?x=1&amp;y=2" rel="nofollow">docs</a> and <a href="javascript:alert(1)">no</a>.</p><pre><code>line\n  two</code></pre>',
    );
    expect(body.truncated).toBe(false);
    expect(body.links).toEqual([{ href: 'https://example.com/a?x=1&y=2', label: 'docs' }]);
    expect(body.paragraphs).toEqual([
      {
        code: false,
        parts: [
          { text: 'See ' },
          { text: 'docs', href: 'https://example.com/a?x=1&y=2' },
          { text: ' and no.' },
        ],
      },
      { code: true, parts: [{ text: 'line\n  two' }] },
    ]);
    const clipped = commentBody('x'.repeat(20), 10);
    expect(clipped.truncated).toBe(true);
    expect(clipped.paragraphs[0].parts[0].text).toHaveLength(10);
    const linked = await setup().provider.fetchRows(10, 1, signal);
    expect(linked[0]).toMatchObject({
      id: 11,
      url: '',
      replies: 60,
      parent: 10,
      links: [{ href: 'https://example.com/docs', label: 'the docs' }],
    });
    expect(linked[0].missing).toBe(false);
    if (!linked[0].missing) expect(linked[0].kids).toHaveLength(48);
  });
});
