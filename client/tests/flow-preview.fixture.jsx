import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import BookingFlow from '../src/features/directory/BookingFlow';
import Dashboard from '../src/pages/Dashboard';
import AgendaPage from '../src/pages/AgendaPage';
import ConsumerAccount from '../src/features/directory/ConsumerAccount';
import '../src/index.css';
import '../src/sophisticated.css';
import '../src/features/directory/directory.css';
import '../src/styles/flows.css';
const params = new URLSearchParams(location.search);
const day = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0,10);
const listing = { publicId:`fixture-premium-${params.get('scenario') || 'default'}`, name:'Studio demonstrativo', timeZone:'America/Sao_Paulo', location:{precision:'exact',lat:-23.56,lng:-46.65}, products:[{id:1,name:'Corte e finalização',price:90,duration:45},{id:2,name:'Barba',price:45,duration:30}] };
const order = {id:1,customerName:'Cliente demonstrativo',customerPhone:'11000000000',product:listing.products[0],professional:{id:1,name:'Profissional demonstrativo'},scheduledAt:`${day}T14:00:00.000Z`,status:'pending'};
let calls = 0;
window.fetch = async (input, options = {}) => {
  const url = new URL(String(input), location.origin);
  let body = {};
  if (url.pathname.endsWith('/auth/me')) { if(params.has('guest')) return Response.json({error:'Entre na conta'},{status:401}); body={user:{id:1,name:'Cliente demonstrativo',role:params.has('dashboard')?'business':'consumer'},store:{name:'Studio demonstrativo',slug:'demonstracao',phone:'11000000000',schedulingConfig:JSON.stringify({hours:{mon:{active:true,open:'09:00',close:'18:00'}}})}}; }
  else if(url.pathname.endsWith('/availability')) body={slots:params.has('empty')?[]:['10:00','11:00','14:00','15:30'],professionals:[{id:1,name:'Profissional demonstrativo'}],timeZone:listing.timeZone};
  else if(url.pathname.endsWith('/bookings') && options.method === 'POST') {calls++; document.getElementById('fixture-requests').textContent=`Solicitações de teste: ${calls}`; if(params.has('conflict')) return Response.json({error:'Ocupado'},{status:409}); if(params.has('failure')) return Response.json({error:'Indisponível'},{status:503}); body={booking:{status:'pending'}}; }
  else if(url.pathname.endsWith('/products')) body=listing.products.map(item=>({...item,active:true}));
  else if(url.pathname.endsWith('/professionals')) body=[order.professional];
  else if(url.pathname.endsWith('/orders/agenda')) body=[order];
  else if(url.pathname.endsWith('/me/favorites')) body={items:[{publicId:listing.publicId,name:listing.name,city:'São Paulo',uf:'SP'}],hasMore:false};
  else if(url.pathname.endsWith('/me/bookings')) body={items:[{id:1,listingPublicId:listing.publicId,storeName:listing.name,productName:listing.products[0].name,date:day,time:'14:00',timeZone:listing.timeZone,status:'pending'}],hasMore:false};
  else body=[];
  return Response.json(body);
};
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[params.has('dashboard') ? '/dashboard' : '/']}><AuthProvider>{params.has('dashboard') ? <Routes><Route path="/dashboard/*" element={<Dashboard />} /></Routes> : <main className="directory-page directory-detail"><p>Prévia local · dados demonstrativos</p><span id="fixture-requests">Solicitações de teste: 0</span>{params.has('professional') ? <AgendaPage /> : params.has('account') ? <ConsumerAccount /> : <BookingFlow listing={listing} />}</main>}</AuthProvider></MemoryRouter>);
