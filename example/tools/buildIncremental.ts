
import viteConfig from '../vite.config'
import { viteIncrementalBuild, patchConfig } from '../../lib'

viteIncrementalBuild({
	config: patchConfig(viteConfig, { ignoreWarnings: true }),
	bundleName: 'bundle',
	watcherIgnoredFiles: [/(^|[\/\\])\../, /* ignore dotfiles */],
	beforeBuildCallback: () => {
		// do whatever you want here, like build content scripts in iife mode
	}
})