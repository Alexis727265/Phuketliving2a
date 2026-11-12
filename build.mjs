import {mkdir,copyFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['--test','tests/backend-validation.test.mjs','tests/client-search.test.mjs','tests/handler.test.mjs','tests/image-sizing.test.js','tests/sharing.test.mjs'],{stdio:'inherit'});
await rm('dist',{recursive:true,force:true});await mkdir('dist/backend',{recursive:true});
for(const file of ['index.html','styles.css','image-sizing.js','app.js','live.mjs','sharing.mjs','backend/client.mjs','backend/search.mjs'])await copyFile(file,'dist/'+file);
