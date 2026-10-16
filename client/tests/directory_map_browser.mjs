import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Administrador/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const clusterRequests=[];const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/mapbox-gl.js*',route=>route.fulfill({contentType:'text/javascript',body:`
 class Map { constructor(){this.handlers={};this.sources={};window.testMap=this;} on(event,layer,fn){const callback=typeof layer==='function'?layer:fn;this.handlers[event]=callback;if(event==='load')setTimeout(callback,0);return this;} off(){} addControl(){} addSource(name){this.sources[name]={setData(data){window[name+'Data']=data;},async getClusterExpansionZoom(){return 8;}};} addLayer(){} getSource(name){return this.sources[name];} getBounds(){return {getWest:()=>-55,getEast:()=>-40,getSouth:()=>-30,getNorth:()=>-10};} getCenter(){return{lng:-46.63,lat:-23.55};} getZoom(){return 5;} fitBounds(){this.handlers.moveend?.();} jumpTo(){this.handlers.moveend?.();} easeTo(){this.handlers.moveend?.();} remove(){} }
 export default {Map,NavigationControl:class{},Popup:class{}};`}));
 await page.route('**/api/**',async route=>{
 const url=route.request().url();let payload={},status=200;
 if(url.includes('/auth/me')){status=401;payload={error:'Não autenticado'};}
 else if(url.includes('/directory/services'))payload={items:[{slug:'corte',name:'Corte'}]};
 else if(url.includes('/directory/clusters?')){clusterRequests.push(url);payload={items:[{lat:-23.55,lng:-46.63,count:132}],truncated:false};}
 else if(url.includes('/directory?'))payload={items:[],hasMore:false};
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload),headers:{'Access-Control-Allow-Origin':'http://localhost:5178','Access-Control-Allow-Credentials':'true'}});
 });
 await page.goto('http://localhost:5178/explorar');
 await page.waitForFunction(()=>window.nationalData?.features?.[0]?.properties?.count===132);
 assert(clusterRequests.some(url=>url.includes('bbox=-55,-30,-40,-10')),'Viewport bbox forwarded');
 await page.getByRole('combobox',{name:/^Serviço/}).selectOption('corte');
 await page.waitForFunction(()=>window.nationalData?.features?.length===1);
 await page.waitForTimeout(500);
 assert(clusterRequests.some(url=>url.includes('service=corte')),'Service filter forwarded to clusters');
 await page.getByRole('button',{name:'Buscar perto do centro do mapa'}).click();
 await page.getByRole('heading',{name:'Nenhum salão nesta busca'}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: mocked Mapbox viewport bbox, filtered national clusters, map-center list search. Does not validate live provider.');
}finally{await browser.close();}
