// The exact optimum by dynamic programming over subsets (Held and Karp style),
// O(2^n n^2) time. For a substring-free set, a shortest superstring is the
// merge of some ordering of the strings with maximal overlaps.
const { preprocess, overlapMatrix, mergePath, fromSymbols } = require('./common.js');

const MAX_STRINGS = 16;

function exact(strings) {
    const words = preprocess(strings);
    const n = words.length;

    if (n === 0) {
        return '';
    }

    if (n > MAX_STRINGS) {
        throw new RangeError(`exact supports at most ${MAX_STRINGS} strings after preprocessing, got ${n}`);
    }

    const ov = overlapMatrix(words);
    const full = (1 << n) - 1;
    const cost = new Float64Array((1 << n) * n).fill(Infinity);
    const from = new Int8Array((1 << n) * n).fill(-1);

    for (let i = 0; i < n; i++) {
        cost[(1 << i) * n + i] = words[i].length;
    }

    for (let mask = 1; mask <= full; mask++) {
        for (let i = 0; i < n; i++) {
            const here = cost[mask * n + i];

            if (here === Infinity) {
                continue;
            }

            for (let j = 0; j < n; j++) {
                if (mask & (1 << j)) {
                    continue;
                }

                const m2 = mask | (1 << j);
                const value = here + words[j].length - ov[i][j];

                if (value < cost[m2 * n + j]) {
                    cost[m2 * n + j] = value;
                    from[m2 * n + j] = i;
                }
            }
        }
    }

    let last = 0;

    for (let i = 1; i < n; i++) {
        if (cost[full * n + i] < cost[full * n + last]) {
            last = i;
        }
    }

    const order = [];

    for (let mask = full, cur = last; cur !== -1;) {
        order.push(cur);
        const prev = from[mask * n + cur];
        mask &= ~(1 << cur);
        cur = prev;
    }

    return fromSymbols(mergePath(words, ov, order.reverse()));
}

module.exports = { exact, MAX_STRINGS };
