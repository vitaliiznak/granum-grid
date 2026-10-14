import { Fragment, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Inventory from './InventoryLesson';
import Sensors from './SensorsLesson';
import Logs from './LogsLesson';
import Compose from './ComposeLesson';
import '../example-page.css';
import './tutorials.css';

const lessons = {
  inventory: {
    title: '1. Build an inventory explorer',
    concept: 'Start with an array, render your own rows, and navigate from a button.',
    steps: [
      'Choose Find SKU-060. The leading row should be 60.',
      'Use Back to return to row 1.',
      'Open Go to… and enter 90 to practice one-based row addresses.',
    ],
    component: Inventory,
    next: '?lesson=sensors',
  },
  sensors: {
    title: '2. Add a sensor map and summaries',
    concept:
      'A provider supplies the metric, overview, exact selection statistics, and a named event.',
    steps: [
      'Choose Inspect warm interval: rows 721–740 are selected.',
      'Choose Show summary: the 20 readings have an exact average of 40 °C.',
    ],
    component: Sensors,
    next: '?lesson=logs',
  },
  logs: {
    title: '3. Search application logs',
    concept: 'Declare searchable fields, validate queries, and report when results are incomplete.',
    steps: [
      'Choose Find errors: all 20 error rows are returned.',
      'Replace the query with auth: only the first 100 of 200 matches are shown.',
      'Narrow to unavailable, select a result, then use Back.',
    ],
    component: Logs,
    next: './http.html',
  },
  compose: {
    title: '5. Compose your own explorer',
    concept: 'Use the headless hook with the map and search widgets, and own the state they share.',
    steps: [
      'Focus the rows and press N: the Restock marker brings SKU-100 to the top.',
      'Use Back to return to row 1.',
      'Choose Search products, enter restock, and choose the result.',
    ],
    component: Compose,
    next: null,
  },
};
const requested = new URLSearchParams(location.search).get('lesson') ?? 'inventory';
const key = (Object.hasOwn(lessons, requested) ? requested : 'inventory') as keyof typeof lessons;
const lesson = lessons[key];
const Lesson = lesson.component;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="example-page tutorial-page">
      <a href="./">← Dataset gallery</a>
      <header>
        <p className="tutorial-eyebrow">Library tutorials · working companions</p>
        <h1>Build with Granum Grid</h1>
        <p>Learn one capability at a time with small datasets you can inspect and change.</p>
      </header>
      <nav aria-label="Tutorial lessons">
        {Object.entries(lessons).map(([id, item]) => (
          <Fragment key={id}>
            <a href={`?lesson=${id}`} aria-current={id === key ? 'page' : undefined}>
              {item.title}
            </a>
            {id === 'logs' && <a href="./http.html">4. Connect an HTTP recording</a>}
          </Fragment>
        ))}
      </nav>
      <h2>{lesson.title}</h2>
      <p>{lesson.concept}</p>
      <Lesson />
      <aside aria-label="Check your result" className="tutorial-checkpoint">
        <h2>Check your result</h2>
        <ol>
          {lesson.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          These three datasets are generated teaching fixtures. Their complete source arrays are
          already in browser memory.
        </p>
      </aside>
      {lesson.next && <a href={lesson.next}>Continue to the next lesson →</a>}
    </main>
  </StrictMode>,
);
