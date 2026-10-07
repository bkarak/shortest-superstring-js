// The classical Greedy algorithm (Tarhio and Ukkonen 1988; Turner 1989):
// repeatedly merge the two strings with the largest overlap. Implemented the
// usual way, as a greedy choice of path edges in decreasing order of overlap,
// which yields the same merges. Proven within a factor 3.5 (Kaplan and Shafrir
// 2005); its factor-2 conjecture fails (Shibata 2026 reports ratio >= 9/4).
const { preprocess, overlapMatrix, mergePath, fromSymbols } = require('./common.js');

function pathCover(n, ov) {
    const edges = [];

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i !== j) {
                edges.push([ov[i][j], i, j]);
            }
        }
    }

    // Stable order: larger overlap first, then by index.
    edges.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);

    const next = new Array(n).fill(-1);
    const hasPrev = new Array(n).fill(false);
    const head = Array.from({ length: n }, (_, i) => i); // head of the path ending at i
    const tail = Array.from({ length: n }, (_, i) => i); // tail of the path starting at i
    let merges = 0;

    for (const [, i, j] of edges) {
        if (merges === n - 1) {
            break;
        }

        // i must end a path, j must start one, and they must be different paths.
        if (next[i] !== -1 || hasPrev[j] || head[i] === j) {
            continue;
        }

        next[i] = j;
        hasPrev[j] = true;
        const h = head[i];
        const t = tail[j];
        tail[h] = t;
        head[t] = h;
        merges++;
    }

    const paths = [];

    for (let s = 0; s < n; s++) {
        if (!hasPrev[s]) {
            const order = [];

            for (let cur = s; cur !== -1; cur = next[cur]) {
                order.push(cur);
            }

            paths.push(order);
        }
    }

    return paths;
}

function greedySymbols(words) {
    if (words.length === 0) {
        return [];
    }

    const ov = overlapMatrix(words);
    return [].concat(...pathCover(words.length, ov).map((order) => mergePath(words, ov, order)));
}

function greedy(strings) {
    return fromSymbols(greedySymbols(preprocess(strings)));
}

module.exports = { greedy, greedySymbols };
