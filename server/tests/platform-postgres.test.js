const assert = require('node:assert/strict');
if(!process.env.TEST_POSTGRES_URL||process.env.TEST_POSTGRES_DISPOSABLE!=='yes')throw new Error('Requires explicitly disposable TEST_POSTGRES_URL');
process.env.DATABASE_URL=process.env.TEST_POSTGRES_URL;
const prisma=require('../src/lib/prisma');
const {withStoreLock}=require('../src/utils/bookingLock');
const {Client}=require('pg');
async function connection(){const c=new Client({connectionString:process.env.TEST_POSTGRES_URL});await c.connect();return c;}
(async()=>{let user;try{
 const id=require('node:crypto').randomUUID();
 user=await prisma.user.create({data:{email:`${id}@test.invalid`,password:'not-login',name:'Test',store:{create:{name:'Test',slug:id,phone:'11999999999'}}},include:{store:true}});
 const storeId=user.store.id;
 const product=await prisma.product.create({data:{storeId,name:'Cut',price:20,duration:30,bufferTime:10}});
 const attempts=await Promise.all(Array.from({length:30},async()=>{const c=await connection();try{
   await c.query('INSERT INTO "Order"("storeId","productId","customerName","customerPhone","scheduledAt","status","totalPrice") VALUES($1,$2,$3,$4,$5,$6,$7)',[storeId,product.id,'Test','11999999999','2028-01-03 10:00:00','pending',20]);return true;
 }catch(e){assert.equal(e.code,'23P01');return false;}finally{await c.end();}}));
 assert.equal(attempts.filter(Boolean).length,1,'Exactly one booking across independent connections');
 let order=await prisma.order.findFirst({where:{storeId}});assert.equal(order.reservedDurationMinutes,30);assert.equal(order.priceCents,2000);
 await prisma.product.update({where:{id:product.id},data:{duration:90,price:99}});
 order=await prisma.order.findUnique({where:{id:order.id}});assert.equal(order.reservedDurationMinutes,30);assert.equal(order.priceCents,2000);
 const result=await withStoreLock(storeId,async()=>{await prisma.order.update({where:{id:order.id},data:{status:'cancelled'}});return prisma.order.create({data:{storeId,productId:product.id,customerName:'Replacement',customerPhone:'11999999999',scheduledAt:new Date('2028-01-03T10:00:00Z'),totalPrice:99}});});
 assert.equal(result.reservedDurationMinutes,90);
 await assert.rejects(()=>withStoreLock(storeId,async()=>{await prisma.product.update({where:{id:product.id},data:{price:1}});throw new Error('rollback');}));
 assert.equal((await prisma.product.findUnique({where:{id:product.id}})).price,99,'Nested legacy accesses share transaction rollback');
 console.log('PASS Postgres: 30 competing independent connections, snapshot integrity, cancel/rebook, async transaction rollback');
 }finally{if(user)await prisma.user.delete({where:{id:user.id}});await prisma.$disconnect();}})().catch(e=>{console.error(e);process.exitCode=1;});
