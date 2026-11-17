import {mkdir,copyFile,rm,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['--test','tests/backend-validation.test.mjs','tests/client-search.test.mjs','tests/handler.test.mjs','tests/image-sizing.test.js','tests/sharing.test.mjs','tests/coastal.test.mjs'],{stdio:'inherit'});
await rm('dist',{recursive:true,force:true});await mkdir('dist/backend',{recursive:true});
const files=['index.html','styles.css','favicon.svg','config.mjs','data.mjs','pricing.mjs','ui.mjs','main.mjs','admin.mjs','backend/client.mjs','backend/search.mjs','sharing.mjs'];
const assets={};for(const file of files){await copyFile(file,'dist/'+file);assets['/'+file]=await readFile(file,'utf8');}
await writeFile('dist/robots.txt','User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: https://phuketliving.aleroy953.workers.dev/sitemap.xml\n');
await mkdir('release',{recursive:true});await writeFile('release/worker.mjs',`import {makeWorker} from './worker-runtime.mjs';\nconst assets=${JSON.stringify(assets)};\nexport default makeWorker(assets);\n`);await copyFile('worker.mjs','release/worker-runtime.mjs');await copyFile('config.mjs','release/config.mjs');
console.log('Built static assets and Cloudflare Worker.');
await copyFile('pricing.mjs','release/pricing.mjs');
