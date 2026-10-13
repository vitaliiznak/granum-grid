import { memo, useEffect, useRef } from 'react';
import type { OverviewTrack } from '../data/types.js';
import { atlasDomain, drawAtlas } from '../visuals/atlas.js';

export const OverviewTracks = memo(function OverviewTracks({
  tracks,
  total,
}: {
  tracks: OverviewTrack[];
  total: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const draw = () =>
      element.querySelectorAll('canvas').forEach((canvas, i) => {
        const track = tracks[i];
        drawAtlas(
          canvas,
          track.buckets,
          total,
          atlasDomain(track.buckets, track.metric?.domain, track.metric?.kind),
          track.metric?.kind,
        );
      });
    const resize = new ResizeObserver(draw);
    resize.observe(element);
    const theme = new MutationObserver(draw);
    theme.observe(element.closest('.ds-root') ?? element, { attributes: true });
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', draw);
    draw();
    return () => {
      resize.disconnect();
      theme.disconnect();
      media.removeEventListener('change', draw);
    };
  }, [tracks, total]);
  return (
    <div className="ds-overview-tracks" ref={container}>
      {tracks.map((track) => (
        <div
          key={track.id}
          title={`${track.label} · ${track.buckets.some((b) => b.accuracy === 'estimated') ? 'estimated' : 'exact'} overview`}
        >
          <canvas aria-label={`${track.label} overview`} />
          <span>{track.label}</span>
        </div>
      ))}
    </div>
  );
});
