import { memo, useEffect, useRef } from 'react';
import type { OverviewTrack } from '../data/types.js';
import { atlasDomain, drawAtlas, observeCanvas } from '../visuals/atlas.js';

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
    draw();
    return observeCanvas(element, draw);
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
