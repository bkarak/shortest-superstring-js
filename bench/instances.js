// Deterministic instance generators for the benchmark.

function rng(seed) {
    let state = seed | 0;

    return () => {
        state = (state + 0x6D2B79F5) | 0;
        let x = Math.imul(state ^ (state >>> 15), 1 | state);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function word(rnd, alphabet, length) {
    let out = '';

    for (let i = 0; i < length; i++) {
        out += alphabet[Math.floor(rnd() * alphabet.length)];
    }

    return out;
}

const between = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// n random strings over an alphabet, lengths in [lo, hi].
function random(seed, n, alphabet, lo, hi) {
    const rnd = rng(seed);
    return Array.from({ length: n }, () => word(rnd, alphabet, between(rnd, lo, hi)));
}

// Reads of a random genome: n substrings of length r at random positions, the
// fragment-assembly setting the problem is usually motivated by.
function reads(seed, n, genome, r) {
    const rnd = rng(seed);
    const g = word(rnd, 'ACGT', genome);
    return Array.from({ length: n }, () => {
        const at = Math.floor(rnd() * (genome - r + 1));
        return g.slice(at, at + r);
    });
}

// Strings cut from repetitions of a few short seeds: long overlaps, many
// periodic substrings, and the cases the paper's periodicity rule is about.
function periodic(seed, n, maxLength) {
    const rnd = rng(seed);
    const alphabet = 'abc'.slice(0, between(rnd, 2, 3));
    const seeds = Array.from({ length: between(rnd, 1, 3) }, () => word(rnd, alphabet, between(rnd, 1, 6)));

    return Array.from({ length: n }, () => {
        let w = '';

        for (let part = 0, parts = between(rnd, 1, 2); part < parts; part++) {
            const s = seeds[Math.floor(rnd() * seeds.length)];
            const reps = between(rnd, 1, 9);
            const off = Math.floor(rnd() * s.length);
            w += s.repeat(reps + 1).slice(off, off + 1 + Math.floor(rnd() * s.length * reps));
        }

        if (rnd() < 0.3) {
            w += alphabet[Math.floor(rnd() * alphabet.length)];
        }

        return w.slice(0, maxLength);
    });
}

// The textbook instance on which Greedy is twice the optimum in the limit:
// {c(ab)^k, (ba)^k, (ab)^k c}. Greedy writes 4k+2 letters, the optimum 2k+4.
function greedyTrap(k) {
    return ['c' + 'ab'.repeat(k), 'ba'.repeat(k), 'ab'.repeat(k) + 'c'];
}

module.exports = { rng, random, reads, periodic, greedyTrap };
