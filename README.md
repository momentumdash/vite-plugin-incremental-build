# Incremental builds for Vite
This is a wrapper + plugin for Vite that brings incremental builds for your project

![Vite vs Vite Incremental](https://github.com/momentumdash/vite-plugin-incremental-build/assets/114431298/e070f60d-8519-4885-823c-8b9477ea8b5a)


#### Use case:

Large web extensions that need to be built to the disk to be installed

## Installation

```
npm i -D vite-plugin-incremental-build
```

## Usage

Recommended setup:

`/tools/incrementalBuild.ts`

```ts
import viteConfig from '../vite.config.ts'
import { viteIncrementalBuild, patchConfig } from 'vite-plugin-incremental-build'

viteIncrementalBuild({
	config: patchConfig(viteConfig, { showWarnings: true }),
	bundleName: 'extension',
	beforeBuildCallback: () => {
		// do whatever you want here, like build content scripts in iife mode
	}
})
```

`package.json`

```json
"scripts": {
    "build:incremental": "tsx ./tools/incrementalBuild.ts",
}
```

`vite.config.ts`

```ts
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [/* ... */],
	root: './src',
	publicDir: 'public',
	build: {
		outDir: '../dist',
		emptyOutDir: true,
	},
})
```

## Requirements

Your project needs to be structured like the following for this plugin to work:

```
project
│	package.json
│	vite.config.ts
│	...
│
└───tools
│	│	incrementalBuild.ts
│
└───src
│	│	index.html
│	│	...
│	│   
│	└───public
│		│	...
│
└───dist
	|	your bundle

```

---

Loosely based on the [rollup-plugin-incremental](https://github.com/mprt-org/rollup-plugin-incremental/)
