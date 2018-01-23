import * as assert from 'assert';

import { Deferred, Promiser } from '../shared/promiser';

suite('Promiser Tests', () => {
  [true, false, 0, 1, 1.23, 'test', '', {}, RegExp(''), null].forEach(v => {
    test(`Promiser.resolve: ${v}`, done => {
      asyncAssertEqual(v, v)
        .then(() => done())
        .catch(e => done(e));
    });
    test(`Promiser.resolve: () => ${v}`, done => {
      asyncAssertEqual(v, () => v)
        .then(() => done())
        .catch(e => done(e));
    });
    test(`Promiser.resolve: Promise.resolve(${v})`, done => {
      asyncAssertEqual(v, Promise.resolve(v))
        .then(() => done())
        .catch(e => done(e));
    });
    test(`Promiser.resolve: () => Promise.resolve(${v})`, done => {
      asyncAssertEqual(v, () => Promise.resolve(v))
        .then(() => done())
        .catch(e => done(e));
    });
  });
});

function asyncAssertEqual<T>(expected: T, deferred: Deferred<T>): Promise<void> {
  return Promiser.resolve(deferred).then(v => {
    assert.equal(expected, v);
  });
}
