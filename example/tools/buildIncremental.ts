import { existsSync, rmSync } from 'node:fs'
import viteConfig from '../vite.config'
import { viteIncrementalBuild, patchConfig } from 'vite-plugin-incremental-build'

if (existsSync('./dist')) rmSync('./dist/', { recursive: true, force: true })
viteIncrementalBuild({
	config: patchConfig(viteConfig),
	bundleName: 'bundle',
	watcherIgnoredFiles: [/(^|[\/\\])\../ /* ignore dotfiles */],
	beforeBuildCallback: () => {
		// do whatever you want here, like build content scripts in iife mode
	},
})
