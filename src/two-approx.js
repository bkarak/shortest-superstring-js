// A polynomial-time 2-approximation for the shortest common superstring.
//
// This follows "A Polynomial-Time 2-Approximation for Shortest Common
// Superstring" (openai/math, result 128, September 2026). Section numbers in
// the comments below refer to that manuscript.
//
// Outline:
//   1. Every distinct substring of the inputs is a vertex of the hierarchical
//      graph (a suffix trie). An up edge appends a letter (cost 1), a down edge
//      deletes the first letter (cost 0).
//   2. Forced occurrence counts m(s) are computed in decreasing length (s2).
//      Their one-letter sum W is a lower bound on the optimum, and they define
//      a balanced base graph with W up edges.
//   3. The base graph is split into closed walks, which are regrouped into
//      periodic layers (s3). Each layer of period p gets a further budget p.
//   4. The layers are connected to the empty word within those budgets
//      (s4-s6), so the final graph costs at most 2W.
//   5. An Euler tour from the empty word spells the superstring (s7).

class InternalError extends Error {}

function check(condition, message) {
    if (!condition) {
        throw new InternalError(message);
    }
}

function mod(x, n) {
    return ((x % n) + n) % n;
}

function compareSymbols(a, b) {
    const n = Math.min(a.length, b.length);

    for (let i = 0; i < n; i++) {
        if (a[i] !== b[i]) {
            return a[i] < b[i] ? -1 : 1;
        }
    }

    return a.length - b.length;
}

function containsSymbols(haystack, needle) {
    outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (haystack[i + j] !== needle[j]) {
                continue outer;
            }
        }
        return true;
    }

    return false;
}

// Remove duplicates, empty strings and strings contained in another (s2).
function preprocess(words) {
    const seen = new Set();
    const unique = [];

    for (const word of words) {
        const key = word.join(',');

        if (word.length > 0 && !seen.has(key)) {
            seen.add(key);
            unique.push(word);
        }
    }

    return unique.filter((word, i) => !unique.some((other, j) =>
        j !== i && other.length > word.length && containsSymbols(other, word)
    ));
}

// ---------------------------------------------------------------------------
// Suffix trie: one node per distinct substring, including the empty word.

function buildTrie(words) {
    const root = { id: 0, len: 0, sym: -1, first: -1, parent: null, link: null, children: new Map(), lefts: new Map() };
    const nodes = [root];

    for (const word of words) {
        for (let i = 0; i < word.length; i++) {
            let node = root;

            for (let j = i; j < word.length; j++) {
                let next = node.children.get(word[j]);

                if (next === undefined) {
                    next = {
                        id: nodes.length,
                        len: node.len + 1,
                        sym: word[j],
                        first: node.len === 0 ? word[j] : node.first,
                        parent: node,
                        link: null,
                        children: new Map(),
                        lefts: new Map()
                    };
                    node.children.set(word[j], next);
                    nodes.push(next);
                }

                node = next;
            }
        }
    }

    // Suffix links (delete the first letter), in order of length.
    const byLength = nodes.slice().sort((a, b) => a.len - b.len || a.id - b.id);

    for (const node of byLength) {
        if (node.len === 0) {
            continue;
        }

        node.link = node.len === 1 ? root : node.parent.link.children.get(node.sym);
        node.link.lefts.set(node.first, node);
    }

    return { root, nodes, byLength };
}

function symbolsOf(node) {
    const out = new Array(node.len);

    for (let cur = node; cur.len > 0; cur = cur.parent) {
        out[cur.len - 1] = cur.sym;
    }

    return out;
}

function ancestor(node, len) {
    let cur = node;

    while (cur.len > len) {
        cur = cur.parent;
    }

    return cur;
}

// Periods p < |s| of s, from its border chain.
function periodsOf(symbols) {
    const n = symbols.length;
    const pi = new Array(n).fill(0);

    for (let i = 1; i < n; i++) {
        let k = pi[i - 1];

        while (k > 0 && symbols[i] !== symbols[k]) {
            k = pi[k - 1];
        }

        if (symbols[i] === symbols[k]) {
            k++;
        }

        pi[i] = k;
    }

    const periods = [];

    for (let b = n > 0 ? pi[n - 1] : 0; b > 0; b = pi[b - 1]) {
        periods.push(n - b);
    }

    return periods;
}

// ---------------------------------------------------------------------------
// Forced occurrence counts (s2).

function computeCounts(trie, required) {
    const { nodes, byLength } = trie;
    const m = new Array(nodes.length).fill(0);
    const lsum = new Array(nodes.length).fill(0);
    const rsum = new Array(nodes.length).fill(0);
    const maxLen = byLength[byLength.length - 1].len;

    const mOf = (node) => (node === undefined ? 0 : m[node.id]);
    const lsumOf = (node) => (node === undefined ? 0 : lsum[node.id]);
    const rsumOf = (node) => (node === undefined ? 0 : rsum[node.id]);

    // B_A(s; m) for the text A that repeats `period` and starts with s.
    // A bracketing word is c1 M c2 with M = A[x+1 : y1), x <= -1, y1 >= |s|,
    // c1 != A(x) and c2 != A(y1); its contribution is computed from sums over
    // extensions so that only words of V are visited.
    const blockCache = new Map();

    const blocking = (periodNode, period, sNode) => {
        const key = periodNode.id * (maxLen + 1) + sNode.len;

        if (blockCache.has(key)) {
            return blockCache.get(key);
        }

        const p = period.length;
        const at = (i) => period[mod(i, p)];
        let total = 0;
        let start = sNode;

        for (let x = -1; start !== undefined && start.len + 2 <= maxLen; x--) {
            let node = start;

            for (let y1 = sNode.len; node !== undefined && node.len + 2 <= maxLen; y1++) {
                const a = at(x);
                const b = at(y1);
                const aM = node.lefts.get(a);
                const Mb = node.children.get(b);
                let both = 0;

                for (const child of node.children.values()) {
                    both += lsum[child.id];
                }

                total += both - rsumOf(aM) - lsumOf(Mb) + mOf(aM === undefined ? undefined : aM.children.get(b));
                node = node.children.get(b);
            }

            start = start.lefts.get(at(x));
        }

        blockCache.set(key, total);
        return total;
    };

    // Rules (2.3): for v with period p and k >= 1, the prefix w with
    // |v| = |w| + kp is constrained when m(v) > B_A(v; m). They are attached
    // to w and evaluated when its length is reached.
    const rules = new Map();

    for (const v of nodes) {
        if (v.len < 2) {
            continue;
        }

        const symbols = symbolsOf(v);

        for (const p of periodsOf(symbols)) {
            const periodNode = ancestor(v, p);
            const period = symbols.slice(0, p);

            for (let k = 1; k * p < v.len; k++) {
                const w = ancestor(v, v.len - k * p);

                if (!rules.has(w.id)) {
                    rules.set(w.id, []);
                }

                rules.get(w.id).push({ v, periodNode, period, k });
            }
        }
    }

    const triggerCache = new Map();
    let index = byLength.length - 1;

    while (index > 0) {
        const len = byLength[index].len;
        let lo = index;

        while (lo > 1 && byLength[lo - 1].len === len) {
            lo--;
        }

        for (let i = lo; i <= index; i++) {
            const s = byLength[i];
            let l = 0;
            let r = 0;

            for (const left of s.lefts.values()) {
                l += m[left.id];
            }

            for (const child of s.children.values()) {
                r += m[child.id];
            }

            lsum[s.id] = l;
            rsum[s.id] = r;
        }

        for (let i = lo; i <= index; i++) {
            const s = byLength[i];
            let value = Math.max(lsum[s.id], rsum[s.id], required.has(s.id) ? 1 : 0);

            for (const rule of rules.get(s.id) || []) {
                const tkey = rule.v.id + ':' + rule.periodNode.len;
                let fires = triggerCache.get(tkey);

                if (fires === undefined) {
                    fires = m[rule.v.id] > blocking(rule.periodNode, rule.period, rule.v);
                    triggerCache.set(tkey, fires);
                }

                if (fires) {
                    value = Math.max(value, blocking(rule.periodNode, rule.period, s) + rule.k + 1);
                }
            }

            m[s.id] = value;
        }

        index = lo - 1;
    }

    for (const left of trie.root.lefts.values()) {
        lsum[0] += m[left.id];
    }

    for (const child of trie.root.children.values()) {
        rsum[0] += m[child.id];
    }

    return { m, lsum, rsum };
}

// ---------------------------------------------------------------------------
// Closed walks and periodic layers (s3).

// A multiset of hierarchical-graph edges. up[id] counts the up edge into the
// node, down[id] the down edge out of it.
function edgeSet(size) {
    return { up: new Map(), down: new Map(), size };
}

function addEdge(map, id, n) {
    map.set(id, (map.get(id) || 0) + n);
}

function decomposeWalks(trie, base) {
    const { nodes, root } = trie;
    const upLeft = new Map(base.up);
    const downLeft = new Map(base.down);

    // Out-edges of a node: its down edge, then up edges to children in symbol order.
    const sortedChildren = new Map();
    const childrenOf = (node) => {
        if (!sortedChildren.has(node.id)) {
            sortedChildren.set(node.id, [...node.children.values()].sort((a, b) => a.sym - b.sym));
        }
        return sortedChildren.get(node.id);
    };

    const takeEdge = (node) => {
        if ((downLeft.get(node.id) || 0) > 0) {
            downLeft.set(node.id, downLeft.get(node.id) - 1);
            return { up: false, to: node.link };
        }

        for (const child of childrenOf(node)) {
            if ((upLeft.get(child.id) || 0) > 0) {
                upLeft.set(child.id, upLeft.get(child.id) - 1);
                return { up: true, to: child };
            }
        }

        return null;
    };

    const outDegree = (node) => {
        let n = downLeft.get(node.id) || 0;

        for (const child of node.children.values()) {
            n += upLeft.get(child.id) || 0;
        }

        return n;
    };

    const walks = [];

    for (const start of [root, ...nodes.slice(1)]) {
        while (outDegree(start) > 0) {
            const steps = [];
            let cur = start;

            do {
                const edge = takeEdge(cur);
                check(edge !== null, 'base graph is not balanced');
                steps.push(edge);
                cur = edge.to;
            } while (cur !== start);

            walks.push({ start, steps });
        }
    }

    return walks;
}

function leastRotation(word) {
    let best = 0;

    for (let r = 1; r < word.length; r++) {
        for (let i = 0; i < word.length; i++) {
            const a = word[(r + i) % word.length];
            const b = word[(best + i) % word.length];

            if (a !== b) {
                if (a < b) {
                    best = r;
                }
                break;
            }
        }
    }

    return best;
}

function greatestRotation(word) {
    let best = 0;

    for (let r = 1; r < word.length; r++) {
        for (let i = 0; i < word.length; i++) {
            const a = word[(r + i) % word.length];
            const b = word[(best + i) % word.length];

            if (a !== b) {
                if (a > b) {
                    best = r;
                }
                break;
            }
        }
    }

    return best;
}

function primitivePeriod(letters) {
    const P = letters.length;

    for (let p = 1; p < P; p++) {
        if (P % p !== 0) {
            continue;
        }

        let ok = true;

        for (let i = 0; i < P && ok; i++) {
            ok = letters[i] === letters[(i + p) % P];
        }

        if (ok) {
            return p;
        }
    }

    return P;
}

function buildLayers(walks) {
    const groups = new Map();

    for (const walk of walks) {
        const letters = walk.steps.filter((s) => s.up).map((s) => s.to.sym);
        const P = letters.length;
        check(P > 0, 'closed walk without up steps');

        // Lift: the start vertex is the window [-n0, 0); up step k appends text(k).
        let x = -walk.start.len;
        let e = 0;
        const x0 = x;
        const Z = new Array(P);

        for (const step of walk.steps) {
            if (step.up) {
                e++;
            } else {
                Z[x - x0] = e;
                x++;
            }
        }

        const p = primitivePeriod(letters);
        const primitive = letters.slice(0, p);
        const r = leastRotation(primitive);
        const canonical = primitive.map((_, i) => primitive[(i + r) % p]);
        const key = canonical.join(',');

        if (!groups.has(key)) {
            groups.set(key, { p, canonical, passages: [] });
        }

        // Group coordinates are the walk's coordinates shifted by -r.
        groups.get(key).passages.push({ x0: x0 - r, P, Z: Z.map((z) => z - r) });
    }

    const ordered = [...groups.values()].sort((a, b) => a.p - b.p || compareSymbols(a.canonical, b.canonical));
    const layers = [];

    ordered.forEach((group, gi) => {
        const { p, canonical } = group;
        group.index = gi;
        group.at = (i) => canonical[mod(i, p)];
        group.t = greatestRotation(canonical);
        group.layers = [];

        const columns = [];

        for (let x = 0; x < p; x++) {
            const ends = [];

            for (const passage of group.passages) {
                const turns = passage.P / p;

                for (let k = 0; k < turns; k++) {
                    const y = x + k * p;
                    const offset = y - passage.x0;
                    const base = mod(offset, passage.P);
                    ends.push(passage.Z[base] + (offset - base) - k * p);
                }
            }

            ends.sort((a, b) => a - b);
            columns.push(ends);
        }

        const h = columns[0].length;

        for (let i = 0; i < h; i++) {
            const zArr = columns.map((ends) => ends[i]);
            const layer = {
                id: layers.length,
                group,
                rank: i,
                p,
                z: (x) => {
                    const rr = mod(x, p);
                    return zArr[rr] + (x - rr);
                },
                rooted: false,
                requests: new Map()
            };
            layer.f = (x) => layer.z(x - 1);
            layer.l = (x) => layer.z(x);

            let best = null;

            for (let x = 0; x < p; x++) {
                const length = layer.f(x) - x;
                if (best === null || length < best.length) {
                    best = { x, length };
                }
            }

            layer.shortest = best;
            group.layers.push(layer);
            layers.push(layer);
        }
    });

    return { groups: ordered, layers };
}

// ---------------------------------------------------------------------------
// Walk construction (s4).

function makeBuilder(trie) {
    const walks = [];

    const nodeAt = (at, a, b) => {
        let node = trie.root;

        for (let i = a; i < b; i++) {
            node = node.children.get(at(i));
            check(node !== undefined, 'window is not a substring of the input');
        }

        return node;
    };

    const newWalk = () => {
        const walk = { up: [], down: [] };
        walks.push(walk);
        return walk;
    };

    // Lemma 4.1: follow an ordered list of windows in the text `at`.
    const follow = (at, list) => {
        const walk = newWalk();

        for (let i = 0; i + 1 < list.length; i++) {
            const [a, b] = list[i];
            const [c, d] = list[i + 1];
            check(a <= c && b <= d, 'windows are not ordered');
            let cur = nodeAt(at, a, b);

            if (c <= b) {
                for (let s = a; s < c; s++) {
                    walk.down.push(cur.id);
                    cur = cur.link;
                }
            } else {
                for (let s = a; s < b; s++) {
                    walk.down.push(cur.id);
                    cur = cur.link;
                }

                for (let s = b; s < c; s++) {
                    const letter = trie.root.children.get(at(s));
                    check(letter !== undefined, 'letter is not in the alphabet');
                    walk.up.push(letter.id);
                    walk.down.push(letter.id);
                }

                cur = trie.root;
            }

            for (let s = Math.max(b, c); s < d; s++) {
                cur = cur.children.get(at(s));
                check(cur !== undefined, 'window is not a substring of the input');
                walk.up.push(cur.id);
            }
        }
    };

    // A round trip from a vertex to the empty word and back, of cost |s|.
    const roundTrip = (node) => {
        if (node.len === 0) {
            return;
        }

        const walk = newWalk();

        for (let cur = node; cur.len > 0; cur = cur.link) {
            walk.down.push(cur.id);
        }

        for (let cur = node; cur.len > 0; cur = cur.parent) {
            walk.up.push(cur.id);
        }
    };

    return { walks, nodeAt, follow, roundTrip };
}

// ---------------------------------------------------------------------------
// Connecting the layers (s4-s6).

function connect(trie, groups, layers, builder) {
    const { nodeAt, follow, roundTrip } = builder;
    const blocks = [];
    const blockOf = new Map();

    const rootShortest = (layer) => {
        const { x, length } = layer.shortest;
        roundTrip(nodeAt(layer.group.at, x, x + length));
    };

    // Lemma 4.2: join ordered layers of one group at start t for cost h.
    const band = (group, t, H, E, h) => {
        check(H - E <= h, 'band is too wide');

        if (E < H) {
            follow(group.at, [[t, E], [t, H], [t + h, E + h]]);
        }
    };

    // Lemma 4.4: fulfil every request received by one host layer.
    const fulfil = (host) => {
        const q = host.p;
        const records = [...host.requests.values()];
        let j = records[0];

        for (const record of records) {
            if (record.p < j.p) {
                j = record;
            }
        }

        for (const record of records) {
            if (record === j) {
                continue;
            }

            const before = (a, b) => a < j.a || (a === j.a && b < j.b) || (a === j.a && b === j.b && record.group.index < j.group.index);
            let s = 0;

            while (before(record.a + s, record.b + s)) {
                s += q;
            }

            while (!before(record.a + s - q, record.b + s - q)) {
                s -= q;
            }

            record.a += s;
            record.b += s;
            record.shift += s;
            record.requesters.forEach((rq) => { rq.e += s; });
        }

        const later = records.filter((r) => r !== j).sort((x, y) => x.a - y.a || x.b - y.b || x.group.index - y.group.index);
        const T = j.a + q;
        const own = j.requesters.slice().sort((x, y) => x.e - y.e);
        const list = own.map((rq) => [j.a, rq.e]);
        list.push([j.a, j.b]);
        const loops = [];

        for (const record of later) {
            for (const rq of record.requesters.slice().sort((x, y) => x.e - y.e)) {
                const target = [Math.min(record.a + record.p, T), Math.max(rq.e, j.b)];
                list.push(target);
                loops.push({ record, rq, target });
            }
        }

        const last = list[list.length - 1];
        list.push([T, own[0].e + q]);
        follow(host.group.at, list);

        for (const { record, rq, target } of loops) {
            const at = (x) => record.group.at(x - record.shift);
            const p = record.p;
            follow(at, [target, [record.a + p, rq.e + p], [target[0] + p, target[1] + p]]);
        }

        if (last[1] > T) {
            check(last[1] - T < j.p, 'host contact is too long');
            roundTrip(nodeAt(host.group.at, T, last[1]));
        }

        host.rooted = true;

        for (const record of records) {
            record.requesters.forEach((rq) => { rq.layer.rooted = true; });
        }
    };

    for (const group of groups) {
        const { p, t, at } = group;
        const recipients = group.layers.filter((layer) => layer.requests.size > 0);

        recipients.forEach(fulfil);

        // s5.1: a baseline, and the layers below it.
        let baseline = null;

        if (recipients.length > 0) {
            baseline = recipients[recipients.length - 1];
            const record = [...baseline.requests.values()][0];
            const a = record.a;
            const h = record.b;

            for (const layer of group.layers) {
                if (layer.rank >= baseline.rank || layer.rooted) {
                    continue;
                }

                if (layer.shortest.length <= p) {
                    rootShortest(layer);
                } else {
                    const e = Math.min(layer.l(a), h);
                    follow(at, [[a, h], [a + p, e + p], [a + p, h + p]]);
                }

                layer.rooted = true;
            }
        }

        const upper = group.layers.filter((layer) => baseline === null || layer.rank > baseline.rank);
        const n = upper.length;

        if (n === 0) {
            continue;
        }

        // s5.2: easy connections.
        const top = group.layers[group.layers.length - 1];
        const H = top.f(t);

        if (H - t <= n * p) {
            roundTrip(nodeAt(at, t, H));
            upper.forEach((layer) => { layer.rooted = true; });
            continue;
        }

        if (baseline !== null && baseline.l(t) >= H - n * p) {
            band(group, t, H, baseline.l(t), n * p);
            upper.forEach((layer) => { layer.rooted = true; });
            continue;
        }

        // s5.3: forcing a record on another aligned text.
        let k = 1;

        while (group.layers.filter((layer) => layer.l(t) >= H - k * p).length > k) {
            k++;
        }

        check(k <= n, 'threshold search exceeded the upper layers');
        const K = k * p;
        const topK = group.layers.slice(group.layers.length - k);
        const lowest = topK[0];
        const record = findRecord(group, layers, t, H - K);
        check(record !== null, 'no record on another aligned text');
        const { a, b, layer: D, shift } = record;

        // s5.4: distributing the remaining budgets.
        const inBlock = new Set();

        if (lowest.l(a) + K >= b) {
            const block = { id: blocks.length, kind: 'collective', group, layers: topK.slice().reverse(), p, k, K, t, a, b, target: D };
            blocks.push(block);
            topK.forEach((layer) => { inBlock.add(layer); blockOf.set(layer, block); });
        }

        for (const layer of upper) {
            if (inBlock.has(layer)) {
                continue;
            }

            check(layer.f(a) <= b, 'individual layer starts above the record');

            if (layer.shortest.length <= p) {
                rootShortest(layer);
                layer.rooted = true;
            } else if (layer.l(a) + p >= b) {
                const block = { id: blocks.length, kind: 'individual', group, layers: [layer], p, k: 1, K: p, t, a, b, target: D };
                blocks.push(block);
                blockOf.set(layer, block);
            } else {
                const e = layer.f(a);
                check(a + p < e && e < b - p, 'request condition fails');
                check(D.group.index > group.index, 'request goes to an earlier group');

                if (!D.requests.has(group)) {
                    D.requests.set(group, { group, p, a: a + shift, b: b + shift, shift, requesters: [] });
                }

                D.requests.get(group).requesters.push({ layer, e: e + shift });
            }
        }
    }

    // s6: execute the planned links, opening cycles of blocks.
    const collectiveLink = (block) => {
        const { group, layers: members, K, a, b } = block;
        const Y = Math.max(b, members[0].f(a));
        const list = [[a, b]];

        for (const layer of members) {
            let x = a;

            while (layer.z(x) < Y) {
                x++;
            }

            check(x <= a + K && layer.z(x - 1) <= Y, 'collective link misses a layer');
            list.push([x, Y]);
        }

        list.push([a + K, b + K]);
        follow(group.at, list);
    };

    const individualLink = (block) => {
        const { group, layers: [layer], p, a, b } = block;
        const e = Math.max(b, layer.f(a + p));
        check(e <= Math.min(b + p, layer.l(a + p)), 'individual link misses its layer');
        follow(group.at, [[a, b], [a + p, e], [a + p, b + p]]);
    };

    const link = (block) => (block.kind === 'collective' ? collectiveLink(block) : individualLink(block));

    // Lemma 6.1: join a block internally, freeing one period.
    const internalJoin = (block) => {
        if (block.kind === 'collective' && block.k > 1) {
            const top = block.layers[0];
            const low = block.layers[block.layers.length - 1];
            band(block.group, block.t, top.f(block.t), low.l(block.t), (block.k - 1) * block.p);
        }
    };

    // Lemma 6.2: realise a link so that it touches a vertex of length <= q.
    const contactLink = (block, q) => {
        const { group, p, a, b, K, t } = block;

        if (block.kind === 'individual') {
            individualLink(block);
            return a + p < b ? nodeAt(group.at, a + p, b) : trie.root;
        }

        const short = block.layers.find((layer) => layer.shortest.length <= q);

        if (short !== undefined) {
            collectiveLink(block);
            return nodeAt(group.at, short.shortest.x, short.shortest.x + short.shortest.length);
        }

        const x = Math.min(t, a + K);
        check(b - x < q, 'cycle contact is too long');
        const F = block.layers[0].f(x);
        follow(group.at, [[a, b], [x, b], [x, F], [a + K, b + K]]);
        return nodeAt(group.at, x, b);
    };

    const next = (block) => (block.target.rooted ? null : blockOf.get(block.target));

    for (const block of blocks) {
        check(block.target.rooted || blockOf.has(block.target), 'target layer is neither rooted nor in a block');
    }

    const state = new Map();
    const done = new Set();

    for (const block of blocks) {
        const path = [];
        let cur = block;

        while (cur !== null && cur !== undefined && !state.has(cur)) {
            state.set(cur, path.length);
            path.push(cur);
            cur = next(cur);
        }

        if (cur !== null && cur !== undefined && path.includes(cur)) {
            const cycle = path.slice(path.indexOf(cur));

            if (cycle.length === 1) {
                internalJoin(cur);
                check(cur.b - cur.a < cur.p, 'self-loop record is too long');
                roundTrip(nodeAt(cur.group.at, cur.a, cur.b));
                done.add(cur);
            } else {
                let best = cycle[0];

                for (const candidate of cycle) {
                    if (compareRotations(candidate.group, best.group) > 0) {
                        best = candidate;
                    }
                }

                const omitted = next(best);
                const contact = contactLink(best, omitted.p);
                check(contact.len <= omitted.p, 'cycle contact exceeds the freed period');
                internalJoin(omitted);
                roundTrip(contact);
                done.add(best);
                done.add(omitted);
            }
        }

        // Mark everything on this path as visited for later starts.
        path.forEach((b) => state.set(b, -1));
    }

    for (const block of blocks) {
        if (!done.has(block)) {
            link(block);
        }
    }
}

function compareRotations(g1, g2) {
    const n = g1.p + g2.p;

    for (let i = 0; i < n; i++) {
        const a = g1.at(g1.t + i);
        const b = g2.at(g2.t + i);

        if (a !== b) {
            return a < b ? -1 : 1;
        }
    }

    return 0;
}

// s5.3 / s7: an actual layer window that agrees with A throughout and
// contains A[t : end) at an alignment different from A's own.
function findRecord(group, layers, t, end) {
    const A = group.at;
    const width = end - t;

    for (const layer of layers) {
        const q = layer.p;
        const at = layer.group.at;

        for (let x = 0; x < q; x++) {
            for (let e = layer.f(x); e <= layer.l(x); e++) {
                for (let y = x; y + width <= e; y++) {
                    const shift = y - t;

                    if (layer.group === group && mod(shift, group.p) === 0) {
                        continue;
                    }

                    let agrees = true;

                    for (let i = x; i < e && agrees; i++) {
                        agrees = at(i) === A(i - shift);
                    }

                    if (agrees) {
                        return { layer, a: x - shift, b: e - shift, shift };
                    }
                }
            }
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Assembling the answer (s7).

function components(trie, up, down) {
    const parent = new Map();
    const find = (x) => {
        while (parent.get(x) !== x) {
            parent.set(x, parent.get(parent.get(x)));
            x = parent.get(x);
        }
        return x;
    };
    const touch = (x) => { if (!parent.has(x)) parent.set(x, x); };
    const union = (x, y) => { touch(x); touch(y); parent.set(find(x), find(y)); };

    touch(0);

    for (const [id, n] of up) {
        if (n > 0) union(id, trie.nodes[id].parent.id);
    }

    for (const [id, n] of down) {
        if (n > 0) union(id, trie.nodes[id].link.id);
    }

    return { parent, find };
}

function isConnected(trie, up, down) {
    const { parent, find } = components(trie, up, down);
    const r = find(0);

    for (const id of parent.keys()) {
        if (find(id) !== r) {
            return false;
        }
    }

    return true;
}

function totals(base, walks) {
    const up = new Map(base.up);
    const down = new Map(base.down);

    for (const walk of walks) {
        walk.up.forEach((id) => addEdge(up, id, 1));
        walk.down.forEach((id) => addEdge(down, id, 1));
    }

    return { up, down };
}

function eulerTour(trie, up, down) {
    const upLeft = new Map(up);
    const downLeft = new Map(down);
    const childLists = new Map();
    const childrenOf = (node) => {
        if (!childLists.has(node.id)) {
            childLists.set(node.id, [...node.children.values()].sort((a, b) => a.sym - b.sym));
        }
        return childLists.get(node.id);
    };

    const take = (node) => {
        for (const child of childrenOf(node)) {
            if ((upLeft.get(child.id) || 0) > 0) {
                upLeft.set(child.id, upLeft.get(child.id) - 1);
                return { to: child, letter: child.sym };
            }
        }

        if ((downLeft.get(node.id) || 0) > 0) {
            downLeft.set(node.id, downLeft.get(node.id) - 1);
            return { to: node.link, letter: null };
        }

        return null;
    };

    const stack = [{ node: trie.root, letter: null }];
    const circuit = [];

    while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const edge = take(top.node);

        if (edge === null) {
            circuit.push(stack.pop().letter);
        } else {
            stack.push({ node: edge.to, letter: edge.letter });
        }
    }

    return circuit.reverse().filter((letter) => letter !== null);
}

function trim(symbols, words) {
    const coversAll = (s) => words.every((w) => containsSymbols(s, w));
    let lo = 0;
    let hi = symbols.length;

    while (lo < hi && coversAll(symbols.slice(lo + 1, hi))) lo++;
    while (lo < hi && coversAll(symbols.slice(lo, hi - 1))) hi--;

    return symbols.slice(lo, hi);
}

function fromSymbols(symbols) {
    return symbols.map((c) => String.fromCodePoint(c)).join('');
}

// Returns { superstring, lowerBound, fallback }. `lowerBound` is W <= OPT,
// and the superstring has length at most 2W. `fallback` is true only if an
// internal invariant failed and the components were joined by round trips
// instead; the result is still a common superstring.
function solve(input) {
    const words = preprocess(input.map((s) => Array.from(s, (c) => c.codePointAt(0))));

    if (words.length === 0) {
        return { superstring: '', lowerBound: 0, fallback: false };
    }

    if (words.length === 1) {
        return { superstring: fromSymbols(words[0]), lowerBound: words[0].length, fallback: false };
    }

    const trie = buildTrie(words);
    const required = new Set(words.map((word) => {
        let node = trie.root;
        word.forEach((c) => { node = node.children.get(c); });
        return node.id;
    }));

    const { m, lsum, rsum } = computeCounts(trie, required);
    const base = edgeSet(trie.nodes.length);
    let W = 0;

    for (const node of trie.nodes) {
        if (node.len === 0) {
            continue;
        }

        if (node.len === 1) {
            W += m[node.id];
        }

        if (m[node.id] - lsum[node.id] > 0) addEdge(base.up, node.id, m[node.id] - lsum[node.id]);
        if (m[node.id] - rsum[node.id] > 0) addEdge(base.down, node.id, m[node.id] - rsum[node.id]);
    }

    let builder = makeBuilder(trie);
    let fallback = false;

    try {
        const { groups, layers } = buildLayers(decomposeWalks(trie, base));
        connect(trie, groups, layers, builder);
    } catch (err) {
        if (!(err instanceof InternalError)) {
            throw err;
        }

        fallback = true;
        builder = makeBuilder(trie);
        const { parent, find } = components(trie, base.up, base.down);
        const seen = new Set([find(0)]);

        for (const id of parent.keys()) {
            if (!seen.has(find(id))) {
                seen.add(find(id));
                builder.roundTrip(trie.nodes[id]);
            }
        }
    }

    // Drop added walks that connectivity does not need; this only shortens
    // the answer and keeps every base edge.
    const kept = builder.walks.slice();

    for (let i = kept.length - 1; i >= 0; i--) {
        const without = kept.slice(0, i).concat(kept.slice(i + 1));
        const { up, down } = totals(base, without);

        if (isConnected(trie, up, down)) {
            kept.splice(i, 1);
        }
    }

    const { up, down } = totals(base, kept);

    if (!isConnected(trie, up, down)) {
        throw new Error('superstring: the final graph is not connected');
    }

    const symbols = trim(eulerTour(trie, up, down), words);

    return { superstring: fromSymbols(symbols), lowerBound: W, fallback };
}

function twoApprox(strings) {
    return solve(strings).superstring;
}

module.exports = { twoApprox, solve };
