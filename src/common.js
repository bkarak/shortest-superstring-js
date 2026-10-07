// Helpers shared by the baseline algorithms. Strings are handled as arrays of
// Unicode code points, so a surrogate pair is never split.

function toSymbols(s) {
    return Array.from(s, (c) => c.codePointAt(0));
}

function fromSymbols(symbols) {
    return symbols.map((c) => String.fromCodePoint(c)).join('');
}

function contains(haystack, needle) {
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

// Drop empty strings, duplicates and strings contained in another. The set of
// common superstrings does not change.
function preprocess(strings) {
    const seen = new Set();
    const unique = [];

    for (const s of strings) {
        const word = toSymbols(s);
        const key = word.join(',');

        if (word.length > 0 && !seen.has(key)) {
            seen.add(key);
            unique.push(word);
        }
    }

    return unique.filter((word, i) => !unique.some((other, j) =>
        j !== i && other.length > word.length && contains(other, word)
    ));
}

// Longest proper suffix of a that is a prefix of b, via the prefix function
// of b + sentinel + a. With a === b it is the longest proper self-overlap.
function overlap(a, b) {
    const s = b.concat([-1], a);
    const pi = new Array(s.length).fill(0);

    for (let i = 1; i < s.length; i++) {
        let k = pi[i - 1];

        while (k > 0 && s[i] !== s[k]) {
            k = pi[k - 1];
        }

        if (s[i] === s[k]) {
            k++;
        }

        pi[i] = k;
    }

    // A proper overlap is shorter than both strings; walk down the border chain.
    const limit = Math.min(a.length, b.length) - 1;
    let k = pi[s.length - 1];

    while (k > limit) {
        k = pi[k - 1];
    }

    return k;
}

function overlapMatrix(words) {
    return words.map((a) => words.map((b) => overlap(a, b)));
}

// Merge an ordered list of word indices, overlapping consecutive words maximally.
function mergePath(words, ov, order) {
    let out = words[order[0]].slice();

    for (let i = 1; i < order.length; i++) {
        out = out.concat(words[order[i]].slice(ov[order[i - 1]][order[i]]));
    }

    return out;
}

module.exports = { toSymbols, fromSymbols, contains, preprocess, overlap, overlapMatrix, mergePath };
