import type { Scene } from './scenes';
import { scenes } from './scenes';
import './marketing.css';

// Shared with the encoder: live footage fits inside this window without covering copy.
export const filmWindow = { x: 80, y: 280, width: 1760, height: 704 };
export const titleCards = [
  {
    id: 'intro',
    seconds: 4,
    title: 'Go beyond the scroll. Turn massive datasets into places you can explore.',
  },
  {
    id: 'outro',
    seconds: 5,
    title: 'Make big data feel small. Build your next explorer with deepscroll.',
  },
];

function Brand() {
  return (
    <div className="film-brand">
      <span className="film-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      deepscroll<span className="film-brand-tag">THE REACT DATA EXPLORER</span>
    </div>
  );
}

export function Marketing({
  scene,
  card,
  plate = false,
}: {
  scene: Scene;
  card?: 'intro' | 'outro';
  plate?: boolean;
}) {
  const index = scenes.findIndex((item) => item.id === scene.id);
  return (
    <main className={`film-canvas ${card ? `film-card film-${card}` : 'film-scene'}`}>
      <header className="film-header">
        <Brand />
        <span className="film-edition">
          {card
            ? 'EXPLORE WITHOUT LOSING YOUR PLACE'
            : `${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')} — ${scene.label.toUpperCase()}`}
        </span>
      </header>
      {card ? (
        <>
          <div className="film-card-copy">
            <p className="film-kicker">
              {card === 'intro'
                ? 'BIG DATA DESERVES A BETTER WAY IN'
                : 'BUILD SOMETHING WORTH EXPLORING'}
            </p>
            <h1>
              {card === 'intro' ? (
                <>
                  Go beyond
                  <br />
                  the <em>scroll.</em>
                </>
              ) : (
                <>
                  Make big data
                  <br />
                  feel <em>small.</em>
                </>
              )}
            </h1>
            <p className="film-card-promise">
              {card === 'intro' ? (
                <>
                  Turn massive datasets into
                  <br />
                  places you can explore.
                </>
              ) : (
                <>
                  Your rows. Your renderers. Your next big idea.
                  <br />
                  Bring it to life with deepscroll.
                </>
              )}
            </p>
            {card === 'outro' && (
              <div className="film-cta">
                Build with deepscroll <span>↗</span>
              </div>
            )}
          </div>
          <div className="film-map" aria-hidden="true">
            <div className="film-map-top">
              YOUR NEXT DISCOVERY <span>↓</span>
            </div>
            {[
              '000,000,001',
              '012,500,000',
              '025,000,000',
              '037,500,000',
              '050,000,000',
              '061,700,000',
              '073,500,000',
              '087,500,000',
              '100,000,000',
            ].map((row, i) => (
              <div className={`film-map-row ${i === 6 ? 'film-map-selected' : ''}`} key={row}>
                <span>{row}</span>
                <i style={{ width: `${22 + ((i * 37) % 62)}%` }} />
                {i === 6 && <b>YOU ARE HERE ↗</b>}
              </div>
            ))}
            <div className="film-map-bottom">
              A PLACE FOR EVERY ROW.
              <br />
              <strong>A WAY TO GET THERE.</strong>
            </div>
          </div>
          <footer className="film-card-footer">
            <span>
              JUMP PRECISELY <i /> SEE THE PATTERNS <i /> KEEP THE CONTEXT
            </span>
            <span>
              {card === 'intro'
                ? 'Generated demo data · real product interactions'
                : 'React + TypeScript · Custom renderers · Provider-powered data'}
            </span>
          </footer>
        </>
      ) : (
        <>
          <div className="film-scene-copy">
            <h1>{scene.headline}</h1>
            <p>{scene.promise}</p>
          </div>
          <div
            className="film-window"
            style={{
              left: filmWindow.x,
              top: filmWindow.y,
              width: filmWindow.width,
              height: filmWindow.height,
            }}
          >
            {!plate && <img src={`/images/${scene.id}.png`} alt={`${scene.label} demo preview`} />}
          </div>
          <footer className="film-scene-footer">
            <span>{scene.detail}</span>
            <strong>
              GO BEYOND THE SCROLL <span>↗</span>
            </strong>
          </footer>
          <div className="film-chapters" aria-hidden="true">
            {scenes.map((item, i) => (
              <i key={item.id} className={i <= index ? 'is-active' : undefined} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
