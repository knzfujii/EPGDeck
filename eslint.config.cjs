const { FlatCompat } = require('@eslint/eslintrc');
const eslint = require('@eslint/js');

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: eslint.configs.recommended,
});

module.exports = compat.config(require('./.eslintrc.json'));