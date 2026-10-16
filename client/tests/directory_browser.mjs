import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Administrador/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:5179';
const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {})});
try {
const context = await browser.newContext();
const errors=[];let fail=false;
const listing={publicId:'test-salon',name:'Salão de Teste',description:'Penteados e cortes.',phone:'11999999999',storeSlug:'teste',city:'São Paulo',uf:'SP',municipalityCode:'3550308',neighborhood:'Centro',address:null,location:{lat:-23.55,lng:-46.63,precision:'approximate'},services:['corte'],hours:{},timeZone:'America/Sao_Paulo',openNow:false,priceFrom:50};
await context.route('**/api/**',async route=>{
 const url=route.request().url();let status=200,payload={};
 if(url.includes('/auth/me')){status=401;payload={error:'Não autenticado'};}
 else if(url.includes('/directory/services'))payload={items:[{slug:'corte',name:'Corte'}]};
 else if(url.includes('/directory/municipalities'))payload={items:[{code:'3550308',name:'São Paulo',uf:'SP',timeZone:'America/Sao_Paulo'}]};
 else if(url.includes('/reviews'))payload={items:[],hasMore:false};
 else if(url.includes('/directory/listings/'))payload=listing;
 else if(url.includes('/directory?')){status=fail?503:200;payload=fail?{error:'Indisponível para teste'}:{items:[listing],hasMore:false};}
 else {status=404;payload={error:'Não encontrado'};}
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload),headers:{'Access-Control-Allow-Origin':baseUrl,'Access-Control-Allow-Credentials':'true'}});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.goto(baseUrl + '/explorar');await page.waitForLoadState('networkidle');
await page.getByRole('heading',{name:'Encontre seu próximo salão.'}).waitFor();
await page.getByText('Explore pela lista',{exact:true}).waitFor();
await page.getByLabel('Cidade',{exact:true}).fill('São');await page.getByRole('button',{name:'São Paulo / SP'}).click();
await page.getByRole('button',{name:'Buscar salões',exact:true}).click();await page.getByRole('link',{name:'Salão de Teste',exact:true}).waitFor();
fs.mkdirSync('test-results/directory',{recursive:true});
await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/directory/desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/directory/mobile.png',fullPage:true});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
await page.getByRole('link',{name:'Salão de Teste',exact:true}).click();await page.getByRole('heading',{name:'Salão de Teste'}).waitFor();
assert.equal(await page.getByRole('link',{name:'Como chegar'}).count(),0);
assert.equal(await page.getByRole('link',{name:'Conversar no WhatsApp'}).getAttribute('href'),'https://wa.me/5511999999999');
await page.goto(baseUrl + '/explorar');await page.getByLabel('Cidade',{exact:true}).fill('São');await page.getByRole('button',{name:'São Paulo / SP'}).click();fail=true;await page.getByRole('button',{name:'Buscar salões',exact:true}).click();await page.getByRole('alert').filter({hasText:'Não foi possível buscar salões'}).waitFor();
assert.equal(await page.getByText('Nenhum salão nesta busca').count(),0);assert.deepEqual(errors,[]);
const ownerContext = await browser.newContext();
let ownerListing = {...listing, version:1, status:'draft', address:'Rua Exemplo, 100', latitude:-23.55, longitude:-46.63, locationPrecision:'approximate', consent:true, coordinatesConfirmed:true, holidayHours:{}, productServices:[], products:[{id:1,name:'Corte feminino',price:50}]};
let savedPayload = null; let bookedPayload = null;
await ownerContext.route('**/api/**', async route => {
 const url=route.request().url();let body={};
 if(url.includes('/auth/me')) body={user:{id:1,name:'Pessoa Teste',role:'business'},store:{id:1,name:'Salão de Teste',phone:'11999999999',address:'Rua Exemplo, 100'},csrfToken:'test-csrf'};
 else if(url.includes('/directory/services')) body={items:[{slug:'corte',name:'Corte'}]};
 else if(url.includes('/availability?')) body={slots:['10:00'],professionals:[],timeZone:'America/Sao_Paulo'};
 else if(url.endsWith('/bookings') && route.request().method()==='POST') { bookedPayload=route.request().postDataJSON();body={booking:{id:99,status:'confirmed'}}; }
 else if(url.includes('/directory/listings/') && !url.includes('/reviews')) body={...listing,onlineBookingEnabled:true,products:[{id:1,name:'Corte feminino',price:50}]};
 else if(url.includes('/me/favorites/')) body={saved:false};
 else if(url.includes('/reviews') || url.endsWith('/favorites') || url.endsWith('/bookings')) body={items:[],hasMore:false};
 else if(url.endsWith('/me/listing/submit')) { ownerListing={...ownerListing,status:'pending',version:3}; body={listing:ownerListing}; }
 else if(url.endsWith('/me/listing')) {
  if(route.request().method()==='PUT'){ savedPayload=route.request().postDataJSON();assert.equal(route.request().headers()['x-csrf-token'],'test-csrf');ownerListing={...ownerListing,...savedPayload,version:2}; }
  body={listing:ownerListing};
 }
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'Access-Control-Allow-Origin':baseUrl,'Access-Control-Allow-Credentials':'true'}});
});
const ownerPage = await ownerContext.newPage();ownerPage.on('pageerror',e=>errors.push(e.message));
await ownerPage.goto(baseUrl + '/dashboard/diretorio');
await ownerPage.getByRole('heading',{name:'Seu salão no mapa'}).waitFor();
await ownerPage.getByRole('textbox',{name:/Apresentação/}).fill('Atendimento especializado para eventos e cortes.');
await ownerPage.locator('.directory-product-mapping').getByRole('checkbox',{name:'Corte',exact:true}).check();
await ownerPage.getByRole('button',{name:'Salvar perfil',exact:true}).click();
await ownerPage.getByText('Rascunho salvo e retirado da busca até nova aprovação.',{exact:false}).waitFor();
assert.equal(savedPayload.coordinatesConfirmed,true);assert.deepEqual(savedPayload.productServices,[{productId:1,services:['corte']}]);
await ownerPage.getByRole('button',{name:'Enviar para análise',exact:true}).click();
await ownerPage.getByText('Perfil enviado para análise.',{exact:false}).waitFor();
assert.deepEqual(errors,[]);
await ownerPage.goto(baseUrl + '/explorar/test-salon');
await ownerPage.getByRole('button',{name:/Corte feminino/}).click();
await ownerPage.getByRole('button',{name:'Continuar',exact:true}).click();
await ownerPage.getByLabel('Data',{exact:true}).fill('2026-12-20');
await ownerPage.getByRole('button',{name:'10:00',exact:true}).click();
await ownerPage.getByRole('button',{name:'Continuar',exact:true}).click();
await ownerPage.getByLabel('Seu WhatsApp',{exact:true}).fill('11999999999');
await ownerPage.getByRole('button',{name:'Solicitar agendamento',exact:true}).click();
await ownerPage.getByRole('heading',{name:'Agendamento confirmado',exact:true}).waitFor();
assert.equal(bookedPayload.productId,1);assert.equal(bookedPayload.time,'10:00');assert.match(bookedPayload.idempotencyKey,/^[a-f0-9-]{36}$/);
assert.deepEqual(errors,[]);
const consumerContext=await browser.newContext();let signedIn=false;let registration;
await consumerContext.route('**/api/**',async route=>{
 const url=route.request().url();let status=200,body={};
 if(url.includes('/auth/register')){registration=route.request().postDataJSON();body={requiresVerification:true};}
 else if(url.includes('/auth/login')){signedIn=true;body={csrfToken:'consumer-csrf'};}
 else if(url.includes('/auth/me')){status=signedIn?200:401;body=signedIn?{user:{id:2,name:'Cliente Teste',role:'consumer'},store:null,csrfToken:'consumer-csrf'}:{error:'Não autenticado'};}
 else body={items:[],hasMore:false};
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'Access-Control-Allow-Origin':baseUrl,'Access-Control-Allow-Credentials':'true'}});
});
const consumerPage=await consumerContext.newPage();consumerPage.on('pageerror',e=>errors.push(e.message));
await consumerPage.goto(baseUrl + '/conta');
await consumerPage.getByRole('button',{name:'Criar conta gratuita',exact:true}).click();
await consumerPage.getByLabel('Seu nome',{exact:true}).fill('Cliente Teste');
await consumerPage.getByLabel('E-mail',{exact:true}).fill('cliente@example.test');
await consumerPage.getByLabel('Senha',{exact:true}).fill('senha-teste-2026');
await consumerPage.getByRole('checkbox').check();
await consumerPage.getByRole('button',{name:'Criar conta',exact:true}).click();
await consumerPage.getByText('Confira seu e-mail e confirme o cadastro antes de entrar.').waitFor();
assert.equal(registration.accountType,'consumer');
await consumerPage.getByLabel('Senha',{exact:true}).fill('senha-teste-2026');
await consumerPage.getByRole('button',{name:'Entrar',exact:true}).click();
await consumerPage.getByRole('heading',{name:'Olá, Cliente Teste'}).waitFor();
await consumerPage.goto(baseUrl + '/dashboard');
await consumerPage.waitForURL('**/conta');
assert.deepEqual(errors,[]);
console.log('PASS: consumer-only registration, verification instruction, login, dashboard role redirect');
console.log('PASS: booking availability, confirmation, idempotency key');
console.log('PASS: owner edit, product taxonomy mapping, CSRF request, confirmed coordinates, save then submit');
console.log('PASS: anonymous search, municipality selection, map fallback, responsive layout, privacy, contact and failure state');
} finally { await browser.close(); }


