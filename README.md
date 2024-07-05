# Incremental builds for Vite
This is a wrapper + plugin for Vite that brings incremental builds for your project

![Vite vs Vite Incremental](https://github.com/momentumdash/vite-plugin-incremental-build/assets/114431298/e070f60d-8519-4885-823c-8b9477ea8b5a)


#### Use case:

Large web extensions that need to be built to the disk to be installed (see notes if you are using this for an extension)

## Installation

```
npm i -D vite-plugin-incremental-build
```

## Usage

Recommended setup:

`/tools/incrementalBuild.ts`

```ts
import viteConfig from '../vite.config'
import { viteIncrementalBuild, patchConfig } from 'vite-plugin-incremental-build'

if (existsSync('./dist')) rmSync('./dist/', { recursive: true, force: true })
viteIncrementalBuild({
	config: patchConfig(viteConfig, { ignoreWarnings: false }),
	bundleName: 'bundle',
	watcherIgnoredFiles: ['./src/not-watched', /(^|[\/\\])\../, /* ignore dotfiles */],
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
│   package.json
│   vite.config.ts
│   ...
│
└───tools
│   │   incrementalBuild.ts
│
└───src
│   │   index.html
│   │   ...
│   │   
│   └───public
│       │   ...
│
└───dist
    |   your bundle

```

---

Loosely based on the [rollup-plugin-incremental](https://github.com/mprt-org/rollup-plugin-incremental/)


Notes:

For extensions, it's required to patch rollup (use `patch-package`) to replace `_virtual` by `rollup__virtual` in order for chrome to allow installation of the bundle

Tested only for vue (but React should work)

Build speed is highly dependent on how many files are imported by the file that you are saving. The more files your file imports (including the files that those files import), the longer the incremental build will take
