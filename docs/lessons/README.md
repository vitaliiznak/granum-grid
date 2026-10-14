# Build with Granum Grid

Learn to build an indexed-data explorer in your own React application. Each lesson
uses a different dataset to teach one part of the library, with complete code,
observable results, and a small exercise.

**Start with [Setup](Setup.md), then build the inventory explorer.** You only need
React and TypeScript; no lesson needs an API key.

## Learning path

| Lesson                                 | What you build                                       | Library concepts                                              | Dataset                            |
| -------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| [1. Inventory](Inventory.md)           | A product list with an exact jump button             | Array provider, custom rows, identity, indices, history       | 120 generated products             |
| [2. Sensors](Sensors.md)               | A day of readings with a map and range statistics    | Metric, overview, aggregates, markers, selection              | 1,440 generated minute readings    |
| [3. Logs](Logs.md)                     | Search for failed requests and inspect matching rows | Query validation, search help, result addresses, completeness | 600 generated log entries          |
| [4. HTTP recording](HTTP-recording.md) | Investigate server-held events and share a view      | Paging, cancellation, revisions, saved views                  | A real redacted Chromium recording |
| [5. Compose](Compose.md)               | Your own explorer from the hook and two widgets      | Headless hook, controlled widgets, host markers               | The 120 products from lesson 1     |

The lessons are small on purpose: you can inspect every record and know the
expected answer. Arrays are already in browser memory. Virtualization limits
rendered rows; it does not remove the memory cost of those arrays. The HTTP lesson
moves storage behind a server boundary.

## Run the companions

[Try the lessons online](https://vitaliiznak.github.io/granum-grid/tutorials.html), except
HTTP: it needs the local dev or preview server because GitHub Pages only serves static
files. To run all five locally, follow [Setup](Setup.md#1-run-the-working-examples).
Choose a lesson and follow its **Check your result** steps.

You can copy the complete lesson code into your own app after installing the local
package. The companion modules import the public `@granum/react` API; they do not rely
on the gallery's generators, layouts, or private library modules.

## After the lessons

[Next steps](Next-steps.md) covers live data, variable row heights, custom UI, and
other dataset choices. Use the [integration guide](../GUIDE.md) and
[styling guide](../../STYLING.md) when adapting the result to your app.

Use the lessons from the same tag or commit as your installed package so the code
and available APIs agree.
