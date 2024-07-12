import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
	plugins: [vue()],
	root: './src',
	publicDir: 'public',
	build: {
		outDir: '../dist',
		emptyOutDir: true,
		// rollupOptions: {
		// 	input: {
		// 		'index': './src/index.html',
		// 		'serviceWorker': './src/serviceWorker/serviceWorker.js'
		// 	}
		// },
	},
})