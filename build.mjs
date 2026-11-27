import {build} from 'esbuild';
import {mkdir,copyFile,rm,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['--test','tests/backend-validation.test.mjs','tests/client-search.test.mjs','tests/handler.test.mjs','tests/image-sizing.test.js','tests/sharing.test.mjs','tests/coastal.test.mjs','tests/cloudflare-migration.test.mjs'],{stdio:'inherit'});
await rm('dist',{recursive:true,force:true});await mkdir('dist/backend',{recursive:true});
await mkdir('dist/cloudflare',{recursive:true});
const files=['cloudflare/client.mjs','cloudflare/listing.mjs','index.html','styles.css','favicon.svg','config.mjs','data.mjs','pricing.mjs','ui.mjs','main.mjs','admin.mjs','areas.mjs','discovery.mjs','backend/client.mjs','backend/search.mjs','sharing.mjs','video.mjs'];
const assets={};for(const file of files){await copyFile(file,'dist/'+file);assets['/'+file]=await readFile(file,'utf8');}
const tus = (await readFile('node_modules/tus-js-client/dist/tus.min.js', 'utf8')).replace(/\n?\/\/# sourceMappingURL=.*$/, '');
const tusModule = `const module = { exports: {} };\nconst exports = module.exports;\n${tus}\nexport const { Upload } = module.exports;\n`;
assets['/tus.mjs'] = tusModule;
await writeFile('dist/tus.mjs', tusModule);
const binaryAssets = ['brand-mark.png', 'phuket-living-logo.webp', 'phuket-living-share.jpg'];
const binaryModules = [];
for (const file of binaryAssets) {
  await copyFile(file, 'dist/' + file);
  const base64 = (await readFile(file)).toString('base64');
  binaryModules.push(`assets[${JSON.stringify('/' + file)}] = Uint8Array.from(atob(${JSON.stringify(base64)}), byte => byte.charCodeAt(0));`);
}
await writeFile('dist/robots.txt','User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: https://phuketliving.aleroy953.workers.dev/sitemap.xml\n');
await mkdir('release',{recursive:true});await writeFile('release/worker.mjs',`import {makeWorker} from './worker-runtime.mjs';\nconst assets=${JSON.stringify(assets)};\n${binaryModules.join('\n')}\nexport default makeWorker(assets);\n`);await build({entryPoints:['worker.mjs'],bundle:true,platform:'browser',target:'es2022',format:'esm',outfile:'release/worker-runtime.mjs'});await copyFile('config.mjs','release/config.mjs');
console.log('Built static assets and Cloudflare Worker.');
await copyFile('pricing.mjs','release/pricing.mjs');
await copyFile('video.mjs','release/video.mjs');
