// MGREEDY and TGREEDY (Blum, Jiang, Li, Tromp and Yannakakis 1994).
//
// MGREEDY builds a cycle cover greedily -- edges in decreasing order of
// overlap, self-loops allowed, closing cycles allowed -- then opens every
// cycle and concatenates the results. It is within a factor 4.
//
// TGREEDY takes the strings MGREEDY produced for the cycles and merges them
// with Greedy. It is within a factor 3.
const { preprocess, overlapMatrix, mergePath, fromSymbols } = require('./common.js');
const { greedySymbols } = require('./greedy.js');

function cycleCover(n, ov) {
    const edges = [];

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            edges.push([ov[i][j], i, j]);
        }
    }

    edges.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);

    const next = new Array(n).fill(-1);
    const hasPrev = new Array(n).fill(false);

    for (const [, i, j] of edges) {
        if (next[i] === -1 && !hasPrev[j]) {
            next[i] = j;
            hasPrev[j] = true;
        }
    }

    const seen = new Array(n).fill(false);
    const cycles = [];

    for (let s = 0; s < n; s++) {
        if (!seen[s]) {
            const order = [];

            for (let cur = s; !seen[cur]; cur = next[cur]) {
                seen[cur] = true;
                order.push(cur);
            }

            cycles.push(order);
        }
    }

    return cycles;
}

// Open each cycle where the overlap back to its first string is smallest.
function cycleStrings(words) {
    const ov = overlapMatrix(words);

    return cycleCover(words.length, ov).map((cycle) => {
        const len = cycle.length;
        const into = (k) => ov[cycle[(k + len - 1) % len]][cycle[k]];
        let cut = 0;

        for (let k = 1; k < len; k++) {
            if (into(k) < into(cut)) {
                cut = k;
            }
        }

        const order = cycle.slice(cut).concat(cycle.slice(0, cut));
        return mergePath(words, ov, order);
    });
}

function mgreedy(strings) {
    const words = preprocess(strings);
    return fromSymbols([].concat(...cycleStrings(words)));
}

function tgreedy(strings) {
    const words = preprocess(strings);
    const pieces = cycleStrings(words);
    return fromSymbols(greedySymbols(pieces));
}

module.exports = { mgreedy, tgreedy };
