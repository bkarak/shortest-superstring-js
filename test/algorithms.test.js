const test = require('node:test');
const assert = require('node:assert');

const algorithms = require('../src');
const { random, periodic, reads, greedyTrap } = require('../bench/instances.js');

const ALL = ['twoApprox', 'greedy', 'mgreedy', 'tgreedy', 'exact', 'naive'];

test('edge cases', () => {
    for (const name of ALL) {
        const f = algorithms[name];
        assert.strictEqual(f([]), '', name);
        assert.strictEqual(f(['', '']), '', name);
        assert.strictEqual(f(['abc', 'abc', 'b']), 'abc', name);
    }

    assert.strictEqual(algorithms.exact(['cde', 'abc', 'efg']), 'abcdefg');
    assert.strictEqual(algorithms.twoApprox(['cde', 'abc', 'efg']), 'abcdefg');
});

test('code points are never split', () => {
    const words = ['😀a😀', 'a😀b', 'b😀😀'];

    for (const name of ALL) {
        const s = algorithms[name](words);
        assert.ok(words.every((w) => s.includes(w)), name);
        assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(s), name);
    }
});

test('every algorithm returns a common superstring, and the 2-approximation keeps its bound', () => {
    for (let seed = 1; seed <= 400; seed++) {
        const instances = [
            random(seed, 2 + (seed % 7), 'ab', 1, 8),
            periodic(seed, 2 + (seed % 7), 20),
            reads(seed, 3 + (seed % 6), 40, 10)
        ];

        for (const strings of instances) {
            const opt = algorithms.exact(strings).length;

            for (const name of ALL) {
                const s = algorithms[name](strings);
                assert.ok(strings.every((w) => s.includes(w)), `${name} on ${JSON.stringify(strings)}`);
                assert.ok(s.length >= opt, `${name} beat the optimum on ${JSON.stringify(strings)}`);
            }

            const detail = algorithms.solve(strings);
            const label = JSON.stringify(strings);
            assert.ok(detail.lowerBound <= opt, `W > OPT on ${label}`);
            assert.ok(detail.superstring.length <= 2 * detail.lowerBound, `length > 2W on ${label}`);
            assert.strictEqual(detail.fallback, false, `fallback on ${label}`);
        }
    }
});

test('the greedy trap', () => {
    const k = 10;
    const strings = greedyTrap(k);
    assert.strictEqual(algorithms.exact(strings).length, 2 * k + 4);
    assert.strictEqual(algorithms.greedy(strings).length, 4 * k + 2);
    assert.ok(algorithms.twoApprox(strings).length <= 2 * (2 * k + 4));
});
