import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { encodeView } from 'deepscroll';
import Demo from '../../demo/src/App';
import { findDataset } from '../../demo/src/datasets';
import { scenes } from './scenes';
import { filmWindow, Marketing, titleCards } from './Marketing';
import 'deepscroll/styles.css';
import '../../demo/src/styles.css';
import './studio.css';

const params = new URLSearchParams(location.search);
const selected = scenes.find((scene) => scene.id === params.get('scene')) ?? scenes[0];
const capture = params.get('capture') === '1' || params.get('page') === '1';
const artwork = params.get('artwork');

// The capture page mounts the actual demo. Only its existing saved-view URL is prepared.
if (capture && !location.hash) {
  const dataset = findDataset(selected.dataset);
  params.set('dataset', selected.dataset);
  history.replaceState(
    null,
    '',
    `?${params}#view=${encodeView({
      version: 1,
      dataset: dataset.provider.id,
      revision: dataset.provider.revision,
      location: {
        position: selected.index ?? dataset.initialIndex ?? 0,
        view: 'rows',
        rowsPerPixel: 1 / dataset.rowHeight,
      },
      selection: null,
    })}`,
  );
}

declare global {
  interface Window {
    __deepscrollMedia?: {
      scenes: typeof scenes;
      titleCards: typeof titleCards;
      filmWindow: typeof filmWindow;
    };
  }
}
window.__deepscrollMedia = { scenes, titleCards, filmWindow };

/** Chromium screencasts omit the OS cursor. This follows real pointer events for the film. */
function RecordingPointer() {
  const [point, setPoint] = useState({ x: -40, y: -40, down: false });
  useEffect(() => {
    const move = (event: PointerEvent) =>
      setPoint((p) => ({ ...p, x: event.clientX, y: event.clientY }));
    const down = () => setPoint((p) => ({ ...p, down: true }));
    const up = () => setPoint((p) => ({ ...p, down: false }));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, []);
  return (
    <svg
      className="recording-pointer"
      width="20"
      height="26"
      viewBox="0 0 20 26"
      aria-hidden="true"
      style={{ left: point.x, top: point.y, transform: point.down ? 'scale(.9)' : undefined }}
    >
      <path d="M2 2v19l5-5 4 8 4-2-4-8h7Z" fill="#16191d" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

function Studio() {
  const [scene, setScene] = useState(selected);
  const [take, setTake] = useState(0);
  return (
    <main className="media-studio">
      <aside className="media-director">
        <h1>Media</h1>
        <p>deepscroll / demo captures</p>
        <nav aria-label="Media scenes">
          {scenes.map((item, index) => (
            <button
              key={item.id}
              aria-pressed={scene.id === item.id}
              onClick={() => {
                setScene(item);
                setTake((n) => n + 1);
              }}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              {item.label}
              <small>{item.seconds}s</small>
            </button>
          ))}
        </nav>
        <p className="media-direction">{scene.description}</p>
        <p className="media-direction">
          <strong>{scene.headline}</strong>
          <br />
          {scene.promise}
        </p>
        <a
          className="media-preview-link"
          href={`?artwork=scene&scene=${scene.id}`}
          target="_blank"
          rel="noreferrer"
        >
          Preview scene artwork ↗
        </a>
        <a className="media-preview-link" href="?artwork=intro" target="_blank" rel="noreferrer">
          Opening card ↗
        </a>
        <a className="media-preview-link" href="?artwork=outro" target="_blank" rel="noreferrer">
          Closing card ↗
        </a>
        <a
          className="media-preview-link"
          href="output/deepscroll-launch.mp4"
          target="_blank"
          rel="noreferrer"
        >
          Play latest exported film ↗
        </a>
        <button className="media-reset" onClick={() => setTake((n) => n + 1)}>
          Reset demo
        </button>
        <p className="media-note">
          Use the demo's controls to try each action. The export script runs the full sequence.
        </p>
        <code>npm run media:screenshots</code>
        <code>npm run media:video</code>
      </aside>
      <iframe
        key={`${scene.id}:${take}`}
        title={`${scene.label} — actual deepscroll demo`}
        src={`?capture=1&scene=${scene.id}`}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  artwork ? (
    <Marketing
      scene={selected}
      card={artwork === 'intro' || artwork === 'outro' ? artwork : undefined}
      plate={params.get('plate') === '1'}
    />
  ) : capture ? (
    <>
      <Demo />
      {params.get('film') === '1' && <RecordingPointer />}
    </>
  ) : (
    <Studio />
  ),
);
