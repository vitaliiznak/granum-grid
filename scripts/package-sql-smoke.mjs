import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createSqlSource, plainValue, quoteIdentifier } from '@granum/sql';

assert.match(import.meta.resolve('@granum/sql'), /\/dist\/index\.js$/);
assert.deepEqual(Object.keys(await import('@granum/sql')).sort(), [
  'createSqlSource',
  'plainValue',
  'quoteIdentifier',
]);
// @granum/core is a type-only peer: the built JavaScript must not import it at runtime.
const dist = new URL('.', import.meta.resolve('@granum/sql'));
for (const name of readdirSync(dist).filter((file) => file.endsWith('.js')))
  assert.ok(!readFileSync(new URL(name, dist), 'utf8').includes('@granum/core'), name);

// A stand-in database: the package must build every statement itself.
const statements = [];
const query = async (sql, params) => {
  statements.push([sql, params]);
  if (sql.startsWith('DESCRIBE'))
    return [
      { column_name: 'id', column_type: 'BIGINT' },
      { column_name: 'name', column_type: 'VARCHAR' },
    ];
  if (sql.startsWith('SELECT count(*)')) return [{ n: 3n }];
  if (sql.startsWith('SELECT * FROM'))
    return [
      { id: 1n, name: 'a' },
      { id: 2n, name: 'b' },
    ];
  return [];
};
const signal = new AbortController().signal;
const provider = await createSqlSource({ query, id: 'stand-in', from: 'items' }).open(
  { filters: [{ column: 'name', operator: '=', value: "o'brien" }], orderBy: [{ column: 'id' }] },
  signal,
);
assert.equal(provider.rowCount, 3);
assert.deepEqual(await provider.fetchRows(1, 2, signal), [
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
]);
const [create, params] = statements.find(([sql]) => sql.startsWith('CREATE'));
assert.match(create, /WHERE "name" = \? ORDER BY "id"/);
assert.deepEqual(params, ["o'brien"]);
assert.equal(quoteIdentifier('x'), '"x"');
assert.equal(plainValue(5n), 5);
console.log('@granum/sql: built statements, parameters, and JSON-safe rows verified.');
