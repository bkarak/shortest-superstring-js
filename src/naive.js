// Baseline: concatenate the inputs that survive preprocessing.
const { preprocess, fromSymbols } = require('./common.js');

function naive(strings) {
    return fromSymbols([].concat(...preprocess(strings)));
}

module.exports = { naive };
