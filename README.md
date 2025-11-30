# Incremental builds for Vite
brings incremental builds for your project

![Vite vs Vite Incremental](https://github.com/momentumdash/vite-plugin-incremental-build/assets/114431298/e070f60d-8519-4885-823c-8b9477ea8b5a)


#### Use case:

Projects that need to be built to the disk instead of being served by vite
- If you can, the recommended approach is to use csp to allow localhost (in your dev environment and use the vite dev server without this plugin at all)

## Installation

```
npm i -D vite-plugin-incremental-build tsx
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
		// do whatever you want here
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


**Notes:**

- For extensions, don't use this package. Instead:
    1. build the minimum files needed to install the extension (manifest, public files, index.html)
    2. in index.html, make your entry be a served js/ts file from localhost (vite dev server)
    3. Allow localhost in your manifest's CSP
    4. Have as much javascript served from vite as possible
- If you need to remap where files are built, try to do it in a vite middleware

- Tested only for Vue (React should work)
- Untested for rolldown
- Build speed is highly dependent on how many files are imported by the file that you are saving. The more files your file imports (including the files that those files import), the longer the incremental build will take
