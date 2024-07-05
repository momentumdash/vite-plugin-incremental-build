import * as vite from 'vite'
import chokidar from 'chokidar'
import fs from 'node:fs'
import fg from 'fast-glob'

let running = false
let watcherModifiedFile: string | null = null
let waitForBuildEndPromiseResolver: (() => void) | undefined
type DictionaryEntry = { parents: Set<string>; realLocationInDist: string; imports: string[] }
const dictionary: Record<string, DictionaryEntry> = {}

// we use a chokidar watcher so we can rely on it for incremental changes and build only what changed (and its dependencies)
// it's also easier to trigger a full rebuild when the file structure changes

export const viteIncrementalBuild = ({
	config,
	bundleName = 'bundle',
	watcherIgnoredFiles,
	beforeBuildCallback,
}: {
	config: vite.UserConfig
	bundleName: string
	watcherIgnoredFiles: (string | RegExp)[]
	beforeBuildCallback: () => void
}) => {
	const buildFn = () => {
		void buildBundle(bundleName, config, beforeBuildCallback)
	}
	const sourceFolder = config.root?.replace('./', '')
	const watcher = chokidar.watch('./' + sourceFolder, {
		persistent: true,
		ignored: watcherIgnoredFiles,
	})

	watcher
		.on('add', buildFn)
		.on('unlink', buildFn)
		.on('unlinkDir', buildFn)
		.on('change', (file: string) => {
			watcherModifiedFile = file.replace(sourceFolder + '/', '')
			void buildBundle(bundleName, config, beforeBuildCallback).then(() => {
				watcherModifiedFile = null
			})
		})
}

/** patch up vite config with necessary prerequisites for incremental build */
export const patchConfig = (config: vite.UserConfig, { ignoreWarnings = false } = {}) => {
	if (config.root === undefined || !config.root.startsWith('./') || config.root.endsWith('/')) {
		console.log(
			'\x1b[31m%s\x1b[0m',
			`expected to find 'root' in vite config and for 'root' to start with "./" and not to end with "/"`
		)
		throw new Error('config error')
	}
	if (config.build === undefined) {
		config.build = {}
		if (!ignoreWarnings) console.log('\x1b[33m%s\x1b[0m', `expected to find 'build' in vite config`)
	}
	if (config.build === undefined) {
		config.build = {}
		if (!ignoreWarnings) console.log('\x1b[33m%s\x1b[0m', `expected to find 'build' in vite config`)
	}
	if (config.build.rollupOptions === undefined) {
		config.build.rollupOptions = {}
	} else if (!ignoreWarnings) {
		console.log('\x1b[33m%s\x1b[0m', `expected to 'build.rollupOptions' in vite config to not exist`)
	}

	config.build.emptyOutDir = false
	config.build.rollupOptions.preserveEntrySignatures = 'strict'
	config.build.rollupOptions.output = {
		entryFileNames: ({ facadeModuleId, name }) => {
			if (`${facadeModuleId}`.includes('/node_modules/')) return 'node_modules/[name].js'
			if (name.endsWith('.vue')) return name.replace('.vue', '.js')
			return '[name].js'
		},
		preserveModules: true,
		preserveModulesRoot: config.root.replace('./', ''),
		inlineDynamicImports: false,
		compact: false,
		indent: false,
		minifyInternalExports: false,
		format: 'esm',
	}

	if (config.plugins === undefined) config.plugins = []
	config.plugins.unshift({
		name: 'viteIncrementalBuild',
		closeBundle: () => {
			// files have been written to disk, can proceed with dependency tree map
			waitForBuildEndPromiseResolver?.()
		},
		generateBundle(_, bundle) {
			void (async () => {
				await new Promise<void>(resolve => {
					waitForBuildEndPromiseResolver = resolve
				})

				if (watcherModifiedFile) {
					// update files that import this file if the hash changed
					// CSS
					if (watcherModifiedFile.includes('.vue')) {
						const dictKey = watcherModifiedFile.replace('.vue', '.css')
						const dictEntry = dictionary[dictKey]
						if (dictEntry) {
							const oldName = dictEntry.realLocationInDist
							const newName = Object.values(bundle).find(fileInfo => {
								return fileInfo.name === dictKey
							})?.fileName

							if (oldName && newName && oldName !== newName) {
								fs.rmSync('./dist/' + oldName)
								dictEntry.realLocationInDist = newName
								dictEntry.parents.forEach(file => {
									const fileName = dictionary[file]!.realLocationInDist
									const fileContent = fs
										.readFileSync('./dist/' + fileName)
										.toString()
										.replaceAll(oldName, newName)
									fs.writeFileSync('./dist/' + fileName, fileContent)
								})
							}
						}
					}
					return
				}

				console.log('\x1b[90m%s\x1b[0m', '    building dependency tree')
				Object.values(bundle).forEach(fileInfo => {
					if (fileInfo.fileName.includes('node_modules')) return
					if (fileInfo.fileName.includes('_virtual')) return
					if (!('facadeModuleId' in fileInfo) || !fileInfo.facadeModuleId) {
						if (fileInfo.type !== 'asset' || !fileInfo.name?.endsWith('.css')) return
						dictionary[fileInfo.name] = {
							parents: new Set(),
							realLocationInDist: fileInfo.fileName,
							imports: [],
						}
					} else {
						dictionary[fileInfo.name + '.js'] = {
							parents: new Set(),
							realLocationInDist: fileInfo.fileName,
							imports: [...fileInfo.imports, ...fileInfo.dynamicImports],
						}
					}
				})
				const cssImportsToFind = new Set<string>()
				Object.entries(dictionary).forEach(([key, fileInfo]) => {
					fileInfo.imports.forEach(imported => {
						if (imported.includes('node_modules')) return
						if (imported.includes('_virtual')) return
						const bundleEntry = bundle[imported]
						if (!bundleEntry) return
						dictionary[bundleEntry.name + '.js']?.parents.add(key)
						if (bundleEntry.name?.includes('.vue')) {
							const cssFileEntryKey = bundleEntry.name.replace('.vue', '.css')
							if (cssFileEntryKey in dictionary) cssImportsToFind.add(cssFileEntryKey)
						}
					})
				})
				fg.globSync('dist/**/*.html').forEach(match => {
					const key = match.replace('dist/', '')
					dictionary[key] = { realLocationInDist: key, parents: new Set(), imports: [] }
				})
				Object.entries(dictionary).forEach(([key, fileInfo]) => {
					if (fileInfo.realLocationInDist.startsWith('assets/')) return
					cssImportsToFind.forEach(cssImportEntryKey => {
						const cssImportEntry = dictionary[cssImportEntryKey]
						const code = fs.readFileSync('./dist/' + fileInfo.realLocationInDist)
						if (cssImportEntry && code.includes(cssImportEntry.realLocationInDist)) {
							cssImportEntry.parents.add(key)
						}
					})
				})
				console.log('\x1b[32m%s\x1b[0m', '    ✓ dependency tree built')
			})()
		},
		options(options) {
			if (watcherModifiedFile) {
				// partial build
				const modifiedEntries = {
					[watcherModifiedFile.split('.')[0]!]: config.root + '/' + watcherModifiedFile,
				}
				options.input = modifiedEntries
			}
		},
	})
	return config
}

const buildBundle = async (bundleName: string, config: vite.UserConfig, beforeBuildCallback: () => void) => {
	if (running) return
	running = true
	beforeBuildCallback()
	const start = performance.now()
	console.log('\x1b[90m%s\x1b[0m', `building ${bundleName}`)
	try {
		await vite.build({ configFile: false, ...config })
		console.log('\x1b[32m%s\x1b[0m', `✓ ${bundleName} built in ${((performance.now() - start) / 1000).toFixed(3)}s`)
	} catch (error) {
		console.error(typeof error === 'object' && error && 'message' in error ? error.message : error)
		console.log(
			'\x1b[31m%s\x1b[0m',
			`𐄂 ${bundleName} failed in ${((performance.now() - start) / 1000).toFixed(3)}s`
		)
	}
	setTimeout(() => {
		// build sometimes trigger the watcher without 200ms delay
		running = false
	}, 200)
}