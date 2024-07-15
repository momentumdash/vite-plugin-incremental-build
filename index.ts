import * as vite from 'vite'
import chokidar from 'chokidar'
import fs from 'node:fs'
import fg from 'fast-glob'
import path from 'node:path'

let running = false
let watcherModifiedFile: string | null = null
let waitForBuildEndPromiseResolver: (() => void) | undefined
type DictionaryEntry = {
	parents: Set<string>
	realLocationInDist: string[]
	imports: string[]
}
const dictionary: Record<string, DictionaryEntry> = {}
let originalEntries: Record<string, string>

// we use a chokidar watcher so we can rely on it for incremental changes and build only what changed (and its dependencies)
// it's also easier to trigger a full rebuild when the file structure changes

let buildFn: () => void

export const viteIncrementalBuild = ({
	config,
	bundleName = 'bundle',
	watcherIgnoredFiles,
	beforeBuildCallback,
}: {
	config: vite.UserConfig
	bundleName?: string
	watcherIgnoredFiles?: (string | RegExp)[]
	beforeBuildCallback?: () => void
}) => {
	buildFn = () => {
		void buildBundle(bundleName, config, beforeBuildCallback)
	}
	const sourceFolder = config.root?.replace('./', '')
	const watcher = chokidar.watch('./' + sourceFolder, {
		persistent: true,
		ignored: watcherIgnoredFiles || [],
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

	if (
		config.build.rollupOptions.input &&
		(typeof config.build.rollupOptions.input !== 'object' ||
			Array.isArray(config.build.rollupOptions.input) ||
			!Object.keys(config.build.rollupOptions.input).length)
	) {
		console.log(
			'\x1b[31m%s\x1b[0m',
			`build.rollupOptions.input was supplied but was either empty, a string or a string[]. Please use an object instead (Record<string, string>)`
		)
		throw new Error('config error')
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
				await new Promise<void>((resolve) => {
					waitForBuildEndPromiseResolver = resolve
				})

				if (watcherModifiedFile) {
					// update files that import this file if the hash changed
					// CSS
					if (watcherModifiedFile.includes('.vue')) {
						const dictKey = watcherModifiedFile.replace('.vue', '.css')
						const dictEntry = dictionary[dictKey]
						if (dictEntry) {
							const oldNames = dictEntry.realLocationInDist
							const newNames = Object.values(bundle)
								.filter((fileInfo) => {
									return fileInfo.name === dictKey
								})
								.map((fileInfo) => fileInfo.fileName)

							if (oldNames.length !== newNames.length) {
								return buildFn()
							}
							dictEntry.realLocationInDist = newNames
							for (let i = 0; i < oldNames.length; i++) {
								const oldName = oldNames[i],
									newName = newNames[i]

								if (oldName && newName && oldName !== newName) {
									fs.rmSync('./dist/' + oldName)
									dictEntry.parents.forEach((file) => {
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
					}
					return
				}

				console.log('\x1b[90m%s\x1b[0m', '    building dependency tree')
				Object.values(bundle).forEach((fileInfo) => {
					if (fileInfo.fileName.includes('node_modules')) return
					if (fileInfo.fileName.includes('_virtual')) return
					if (!('facadeModuleId' in fileInfo) || !fileInfo.facadeModuleId) {
						if (fileInfo.type !== 'asset' || !fileInfo.name?.endsWith('.css')) return
						// css files can have more than one realLocation (vue with many style blocks)
						const dictEntry = dictionary[fileInfo.name]
						if (dictEntry) dictionary[fileInfo.name].realLocationInDist.push(fileInfo.fileName)
						else
							dictionary[fileInfo.name] = {
								parents: new Set(),
								realLocationInDist: [fileInfo.fileName],
								imports: [],
							}
					} else {
						dictionary[fileInfo.name + '.js'] = {
							parents: new Set(),
							realLocationInDist: [fileInfo.fileName],
							imports: [...fileInfo.imports, ...fileInfo.dynamicImports],
						}
					}
				})
				const cssImportsToFind = new Set<string>()
				Object.entries(dictionary).forEach(([key, fileInfo]) => {
					fileInfo.imports.forEach((imported) => {
						if (imported.includes('node_modules')) return
						if (imported.includes('_virtual')) return
						const bundleEntry = bundle[imported]
						if (!bundleEntry) return
						dictionary[bundleEntry.name + '.js']?.parents.add(key)
					})
					if (key.endsWith('.css')) cssImportsToFind.add(key)
				})
				fg.globSync('dist/**/*.html').forEach((match) => {
					const key = match.replace('dist/', '')
					dictionary[key] = {
						realLocationInDist: [key],
						parents: new Set(),
						imports: [],
					}
				})
				Object.entries(dictionary).forEach(([key, fileInfo]) => {
					if (fileInfo.realLocationInDist[0].startsWith('assets/')) return
					cssImportsToFind.forEach((cssImportEntryKey) => {
						const cssImportEntry = dictionary[cssImportEntryKey]
						const code = fs.readFileSync('./dist/' + fileInfo.realLocationInDist)
						cssImportEntry.realLocationInDist.forEach((file) => {
							if (cssImportEntry && code.includes(file)) {
								cssImportEntry.parents.add(key)
							}
						})
					})
				})
				console.log('\x1b[32m%s\x1b[0m', '    ✓ dependency tree built')
			})()
		},
		options(options) {
			if (
				originalEntries === undefined &&
				options.input &&
				typeof options.input === 'object' &&
				!Array.isArray(options.input) &&
				Object.keys(options.input).length
			)
				originalEntries = options.input
			if (watcherModifiedFile) {
				// partial build
				let entryName = watcherModifiedFile.split('.')[0]!
				const findMatching = (item: [string, string]) =>
					path.resolve(item[1]) === path.resolve(config.root + '/' + watcherModifiedFile)
				const matchingItemInEntries = Object.entries(originalEntries).find(findMatching)
				if (originalEntries && matchingItemInEntries) entryName = matchingItemInEntries[0]
				const modifiedEntries = {
					[entryName]: config.root + '/' + watcherModifiedFile,
				}
				options.input = modifiedEntries
			}
		},
	})
	return config
}

const buildBundle = async (bundleName: string, config: vite.UserConfig, beforeBuildCallback?: () => void) => {
	if (running) return
	running = true
	beforeBuildCallback?.()
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
