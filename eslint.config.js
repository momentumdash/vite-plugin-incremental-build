// @ts-check

import eslint from '@eslint/js'
import tsEslint from 'typescript-eslint'
import { FlatCompat } from '@eslint/eslintrc'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

const flatCompat = new FlatCompat()

export default tsEslint.config(
	eslint.configs.recommended,
	...tsEslint.configs.recommended,
	eslintPluginPrettierRecommended,
	...flatCompat.config({
		overrides: [
			{
				files: ['**/*.ts'],
				parserOptions: {
					project: ['./tsconfig.json'],
					tsconfigRootDir: './',
					parser: '@typescript-eslint/parser',
				},
			},
		],
	}),
	{
		ignores: ['lib/', 'example/'],
	}
)
