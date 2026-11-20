const {chromium}=require('playwright');
const {pathToFileURL}=require('url');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:375,height:812},acceptDownloads:true});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\//,route=>route.abort());
 const url=pathToFileURL(path.join(process.cwd(),'index.html')).href;
 const verify=(condition,msg)=>assert.ok(condition,msg);
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#image-input').setInputFiles({
    name:'test-local-photo.png',mimeType:'image/png',
    buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64')
  });
  await page.waitForFunction(()=>document.querySelector('#image-preview')?.style.display==='block',{timeout:8000});
  verify(await page.locator('#btn-analyze').isEnabled(),'photo upload should enable local AI button');
  console.log('PASS: photo upload and preview');
  await page.locator('#btn-analyze').click();
  await page.waitForFunction(()=>document.querySelector('#btn-analyze')&&!document.querySelector('#btn-analyze').disabled,{timeout:10000});
  verify((await page.locator('#ai-suggestions').innerText()).length>3,'AI should provide result or explicit offline fallback');
  console.log('PASS: local AI fallback with no network');
  await page.locator('#studio-step-1 button[onclick="setStudioStep(2)"]').click();
  await page.locator('#in-name').fill('Objet test V10');
  await page.locator('#in-brand').fill('Marque Test');
  await page.locator('#in-price').fill('29');
  await page.locator('#in-notes').fill('Test hors ligne sans donnée client');
  await page.locator('button[onclick="saveProductOnly()"]').click();
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ss_products')||'[]'));
  verify(stored.length===1 && stored[0].name==='Objet test V10','product saved in localStorage');
  verify(stored[0].photo?.startsWith('data:image/jpeg'),'product image persisted');
  console.log('PASS: local product save with photo');
  await page.locator('button[onclick="generateListing()"]').click();
  const title=await page.locator('#res-title').inputValue();
  const desc=await page.locator('#res-desc').inputValue();
  verify(title.includes('Objet test V10')&&desc.includes('29'),'listing generated');
  await page.locator('button[onclick="saveProductAndHistory()"]').click();
  let history=await page.evaluate(()=>JSON.parse(localStorage.getItem('ss_history')||'[]'));
  verify(history.length===1&&history[0].title.includes('Objet test V10'),'listing history saved');
  console.log('PASS: listing generation and history save');
  await page.reload({waitUntil:'domcontentloaded'});
  stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ss_products')||'[]'));
  history=await page.evaluate(()=>JSON.parse(localStorage.getItem('ss_history')||'[]'));
  verify(stored.length===1&&history.length===1,'local persistence after page reload');
  await page.locator('#nav-products').click();
  verify((await page.locator('#products-list').innerText()).includes('Objet test V10'),'product visible after reload');
  await page.locator('#nav-history').click();
  verify((await page.locator('#history-list').innerText()).includes('Objet test V10'),'history visible after reload');
  console.log('PASS: reload persistence and navigation');
  await page.locator('#nav-settings').click();
  for(const [selector,extension,expected] of [
    ['#btn-exp-json','.json','Objet test V10'],
    ['#btn-exp-csv','.csv','Objet test V10'],
    ['#btn-exp-md','.md','Objet test V10']
  ]){
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:8000}),page.locator(selector).click()]);
    verify(download.suggestedFilename().endsWith(extension),'wrong export extension '+extension);
    const p=await download.path();
    const contents=fs.readFileSync(p,'utf8');
    verify(contents.includes(expected),'export missing saved product '+extension);
    if(extension==='.json'){
      const parsed=JSON.parse(contents);
      verify(parsed.products.length===1&&parsed.history.length===1,'JSON export records incorrect');
    }
    console.log('PASS: '+extension+' download and contents');
  }
  await page.locator('#btn-lang').click();
  verify((await page.locator('#btn-lang').innerText())==='EN','language toggle');
  console.log('PASS: FR/EN language switch');
  verify(errors.length===0,'JavaScript exceptions: '+errors.join('; '));
  console.log('PASS: Sell Smart full offline functional path');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
