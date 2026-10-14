import type { Scene } from './scenes';
import { scenes } from './scenes';
import './marketing.css';

const previews = import.meta.glob<string>('../images/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Shared with the encoder: live footage never covers the headline or evidence labels.
export const filmWindow = { x: 80, y: 248, width: 1760, height: 736 };
export const titleCards = [
  {
    id: 'intro',
    seconds: 7,
    title:
      'Turn data into clarity. Transform rows of information into a visual experience people can explore and understand.',
  },
  {
    id: 'capabilities',
    seconds: 10,
    title:
      'A playground for large data. Jump to a row, read the shape, compare two stretches, and come back.',
  },
  {
    id: 'outro',
    seconds: 8,
    title:
      'Make your data make sense. See the pattern. Understand the detail. Open the playground.',
  },
] as const;
export type FilmCard = (typeof titleCards)[number]['id'];

const capabilities = [
  ['Pick a dataset', 'Logs, a genome, a market, stars, Bitcoin, or Hacker News.'],
  ['Jump to a row', 'An address, a percent, or a named event.'],
  ['See the shape', 'Summaries and a map of the whole set.'],
  ['Read the records', 'Select a stretch, then open its rows or summary.'],
  ['Compare two stretches', 'Two panes that keep their relative place.'],
  ['Come back', 'Back restores the view you left.'],
];

function Brand() {
  return (
    <div className="film-brand">
      <span className="film-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      Granum Grid<span className="film-brand-tag">A DATA PLAYGROUND</span>
    </div>
  );
}

function AddressMap() {
  return (
    <div className="film-map" aria-hidden="true">
      <div className="film-map-top">
        A PLACE FOR EVERY ROW <span>↓</span>
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
        THE SCALE OF YOUR DATA.
        <br />
        <strong>THE CLARITY OF A SINGLE ROW.</strong>
      </div>
    </div>
  );
}

export function Marketing({
  scene,
  card,
  plate = false,
}: {
  scene: Scene;
  card?: FilmCard;
  plate?: boolean;
}) {
  const index = scenes.findIndex((item) => item.id === scene.id);
  return (
    <main className={`film-canvas ${card ? `film-card film-${card}` : 'film-scene'}`}>
      <header className="film-header">
        <Brand />
        <span className="film-edition">
          {card
            ? 'FROM THE BIG PICTURE TO THE EXACT ROW'
            : `${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')} — ${scene.label.toUpperCase()}`}
        </span>
      </header>
      {card === 'capabilities' ? (
        <>
          <div className="film-capabilities-copy">
            <p className="film-kicker">A PLAYGROUND FOR LARGE DATA</p>
            <h1>
              Pick a dataset.
              <br />
              <em>Look at the shape.</em>
            </h1>
          </div>
          <div className="film-capability-grid">
            {capabilities.map(([title, detail], i) => (
              <div key={title}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <h2>{title}</h2>
                <p>{detail}</p>
              </div>
            ))}
          </div>
          <footer className="film-card-footer">
            <span>OPEN THE PAGE. NOTHING TO INSTALL.</span>
            <span>Generated sets and live public data</span>
          </footer>
        </>
      ) : card ? (
        <>
          <div className="film-card-copy">
            <p className="film-kicker">
              {card === 'intro'
                ? 'FROM INFORMATION TO UNDERSTANDING'
                : 'LESS SEARCHING. MORE UNDERSTANDING.'}
            </p>
            <h1>
              {card === 'intro' ? (
                <>
                  Turn data
                  <br />
                  <em>into clarity.</em>
                </>
              ) : (
                <>
                  Make your data
                  <br />
                  <em>make sense.</em>
                </>
              )}
            </h1>
            <p className="film-card-promise">
              {card === 'intro' ? (
                <>
                  Turn rows of information into a visual experience
                  <br />
                  people can explore and understand.
                </>
              ) : (
                <>
                  See the pattern. Understand the detail.
                  <br />
                  Give people a clearer way to explore your data.
                </>
              )}
            </p>
            {card === 'outro' && (
              <div className="film-cta">
                Open the playground <span>↗</span>
              </div>
            )}
          </div>
          <AddressMap />
          <footer className="film-card-footer">
            <span>
              FIND YOUR ROW <i /> SEE THE PATTERN <i /> KEEP YOUR PLACE
            </span>
            <span>
              {card === 'intro'
                ? 'Generated demo data · real product interactions'
                : 'Music: Firefly by Scott Buckley · CC-BY 4.0 · scottbuckley.com.au'}
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
            {!plate &&
              (previews[`../images/${scene.id}.png`] ? (
                <img
                  src={previews[`../images/${scene.id}.png`]}
                  alt={`${scene.label} demo preview`}
                />
              ) : (
                <p className="film-preview-pending">
                  Capture this scene to preview its product footage.
                </p>
              ))}
          </div>
          <footer className="film-scene-footer">
            <div className="film-feature-strip">
              {scene.features.map((feature) => (
                <span key={feature}>{feature}</span>
              ))}
            </div>
            <span className="film-source">{scene.detail}</span>
            <strong>
              EVERY ROW. WITHIN REACH. <span>↗</span>
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
