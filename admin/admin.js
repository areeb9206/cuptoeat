// Firebase SDK modules load only after real project credentials are supplied.
let initializeApp,getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,setPersistence,browserSessionPersistence,getDatabase,ref,get,getFunctions,httpsCallable;

const $=(selector,scope=document)=>scope.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const rupees=value=>`₹${Number(value||0).toLocaleString('en-IN')}`;
const page=document.body.dataset.adminPage;
const cfg=window.CUP2EAT_FIREBASE_CONFIG||{};
const configured=['apiKey','projectId','authDomain','appId','databaseURL'].every(key=>!!cfg[key]);
const loginURL=new URL('admin/login/',document.baseURI).href;
const dashURL=new URL('admin/dashboard/',document.baseURI).href;
const frontendURL=new URL('./',document.baseURI).href;
let auth,db,callStatus,callProduct;
async function isOwner(user){if(!user)return false;const role=await get(ref(db,'admins/'+user.uid));return role.val()===true;}
let orders=[],products=[],tab='orders',orderFilter='all',searchText='';
const toast=(message,kind='success')=>{const el=$('#dash-feedback');if(!el)return;el.className='alert '+kind;el.textContent=message;el.hidden=false;};

function loginNotice(text){const e=$('#admin-feedback');if(e)e.textContent=text;}
function unavailable(){
 if(page==='login'){
   loginNotice('Admin access is locked until Firebase credentials and a verified administrator account are configured.');
   $('#admin-login-form').querySelectorAll('input,button').forEach(el=>el.disabled=true);
 }else{
   $('#admin-root').innerHTML=`<section class="login-card" style="padding:26px"><span class="kicker">PRIVATE ACCESS</span><h2>Not configured.</h2><p class="muted">The owner dashboard requires Firebase Authentication, protected Realtime Database rules, and an administrator role assigned in the Firebase Console. It is intentionally unavailable in offline preview mode.</p><a class="back-link" href="admin/login/">← Admin sign in</a></section>`;
 }
}
function mount(){
 const email=esc(auth.currentUser?.email||'Admin');
 $('#admin-root').outerHTML=`<div class="admin-app" id="admin-app"><aside class="sidebar"><a class="sidebar-brand" href="admin/dashboard/"><img src="assets/reference-logo.png" alt="CUP2EAT"><span>CUP2EAT<small>OWNER WORKSPACE</small></span></a><nav class="side-links"><button class="side-link active" data-tab="orders">▤ &nbsp; Orders</button><button class="side-link" data-tab="products">▦ &nbsp; Products & stock</button><a class="side-link" href="./">↗ &nbsp; Customer store</a><button class="side-link mobile-admin-logout" id="admin-logout-mobile">⎋ &nbsp; Sign out</button></nav><div class="side-foot"><small>${email}</small><button class="side-link" id="admin-logout">⎋ &nbsp; Sign out</button></div></aside><div class="dashboard"><header class="topbar"><small>STORE OPERATIONS / CUP2EAT</small><div class="topbar-right"><span style="color:#6e786a;font-size:11px">OWNER ACCOUNT</span><span class="avatar">C</span></div></header><main class="dash-content"><div class="dash-title"><div><span class="kicker">WELCOME TO YOUR WORKSPACE</span><h1>Store overview.</h1><p>Orders, fulfilment and your edible cup collection, together in one place.</p></div><button class="ghost" id="reload-admin">↻ Refresh data</button></div><div class="stats" id="admin-stats"></div><div id="dash-feedback" class="alert" role="status" aria-live="polite" hidden></div><section id="admin-panel" class="panel"></section><p style="color:#82867d;margin-top:24px;font-size:11px">Order values, stock and fulfilment statuses are read from your secured Realtime Database. No demo totals are shown here.</p></main></div></div>`;
 $('#admin-logout').addEventListener('click',()=>signOut(auth).then(()=>location.assign(loginURL)));
 $('#admin-logout-mobile').addEventListener('click',()=>signOut(auth).then(()=>location.assign(loginURL)));
 $('#reload-admin').addEventListener('click',reload);
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));render()}));
 $('#admin-panel').addEventListener('click',async ev=>{
   const update=ev.target.closest('[data-save-product]');
   if(update){await updateProduct(update);return}
   const status=ev.target.closest('[data-save-status]');
   if(status) await updateStatus(status);
 });
 $('#admin-panel').addEventListener('input',ev=>{if(ev.target.id==='search-orders'){searchText=ev.target.value.toLowerCase();renderOrdersTable()}});
 $('#admin-panel').addEventListener('change',ev=>{if(ev.target.id==='filter-orders'){orderFilter=ev.target.value;renderOrdersTable()}else if(ev.target.matches('[data-product-pack]')){const row=ev.target.closest('tr'), selected=ev.target.selectedOptions[0];row.querySelector('[data-product-price]').value=selected.dataset.price;row.querySelector('[data-product-stock]').value=selected.dataset.stock;}});
}
async function reload(){
 const button=$('#reload-admin');if(button)button.disabled=true;
 try{
   const [orderSnap,productSnap]=await Promise.all([get(ref(db,'store/orders')),get(ref(db,'store/products'))]);
   orders=Object.entries(orderSnap.val()||{}).map(([id,o])=>({id,...o})).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
   products=Object.entries(productSnap.val()||{}).map(([id,p])=>({id,...p})).sort((a,b)=>a.name.localeCompare(b.name));
   render();
 }catch(err){toast(`Unable to load private data: ${err.message}`,'danger')}
 finally{if(button)button.disabled=false}
}
function render(){
 const total=orders.filter(o=>o.status!=='Cancelled').reduce((sum,o)=>sum+Number(o.total||0),0);
 const pending=orders.filter(o=>!['Cancelled','Delivered'].includes(o.status)).length;
 const sold=orders.filter(o=>o.status!=='Cancelled').reduce((sum,o)=>sum+(o.items||[]).reduce((n,l)=>n+(l.qty||0),0),0);
 $('#admin-stats').innerHTML=`<article class="stat"><span>TOTAL ORDERS</span><strong>${orders.length}</strong><span>Across all customers</span></article><article class="stat"><span>ORDER VALUE</span><strong>${rupees(total)}</strong><span>Excludes cancelled orders · not settled revenue</span></article><article class="stat"><span>IN PROGRESS</span><strong>${pending}</strong><span>Awaiting fulfilment</span></article><article class="stat"><span>PACKS ORDERED</span><strong>${sold}</strong><span>Total recorded pack quantities</span></article>`;
 if(tab==='orders')renderOrders();else renderProducts();
}
function renderOrders(){
 $('#admin-panel').innerHTML=`<div class="panel-head"><div><span class="kicker">01 / CUSTOMER ORDERS</span><h2>All orders <span style="color:#9aa095">(${orders.length})</span></h2></div><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="search-orders" value="${esc(searchText)}" aria-label="Search orders" placeholder="Search order ID / customer" style="border:1px solid #ddd;padding:10px;border-radius:7px;min-width:180px"><select id="filter-orders" aria-label="Filter status" style="padding:10px;border:1px solid #ddd;border-radius:7px"><option value="all">All statuses</option>${['Confirmed','Preparing','Dispatched','Delivered','Cancelled'].map(s=>`<option ${orderFilter===s?'selected':''} value="${s}">${s}</option>`).join('')}</select></div></div><div id="orders-table-area" class="table-wrap"></div>`;
 renderOrdersTable();
}
function renderOrdersTable(){
 const target=$('#orders-table-area');if(!target)return;
 const visible=orders.filter(o=>(orderFilter==='all'||o.status===orderFilter)&&(`${o.orderNo} ${o.shipping?.name} ${o.shipping?.city} ${o.email}`).toLowerCase().includes(searchText));
 if(!visible.length){target.innerHTML='<p class="empty">No matching orders. Orders appear here after verified customers complete checkout.</p>';return}
 target.innerHTML=`<table class="data-table"><thead><tr><th>Order & date</th><th>Customer</th><th>Items</th><th>Value</th><th>Current status</th><th>Update</th></tr></thead><tbody>${visible.map(o=>`<tr><td><strong>#${esc(o.orderNo||o.id)}</strong><br><small>${esc(o.createdAt?new Date(o.createdAt).toLocaleString('en-IN'):'—')}</small></td><td>${esc(o.shipping?.name||'—')}<br><small>${esc(o.email||'')}</small><br><small>${esc(o.shipping?.city||'')}</small></td><td>${(o.items||[]).map(l=>`${esc(l.name)} <small>×${Number(l.qty)||0}</small>`).join('<br>')}</td><td><strong>${rupees(o.total)}</strong></td><td><span class="status ${esc(o.status)}">${esc(o.status)}</span></td><td>${['Delivered','Cancelled'].includes(o.status)?'<small>Final status</small>':`<select data-select-order="${esc(o.id)}" aria-label="New order status">${['Confirmed','Preparing','Dispatched','Delivered','Cancelled'].map(s=>`<option ${o.status===s?'selected':''}>${s}</option>`).join('')}</select><button class="primary small-btn" style="margin-left:7px" data-save-status="${esc(o.id)}">Save</button>`}</td></tr>`).join('')}</tbody></table>`;
}
async function updateStatus(button){
 const id=button.dataset.saveStatus, select=document.querySelector(`[data-select-order="${CSS.escape(id)}"]`);
 if(!select)return;const next=select.value;
 button.disabled=true;
 try{await callStatus({id,status:next});toast('Order status updated.');await reload()}catch(err){toast(err.message,'danger')}finally{button.disabled=false}
}
function renderProducts(){
 $('#admin-panel').innerHTML=`<div class="panel-head"><div><span class="kicker">02 / CATALOG MANAGEMENT</span><h2>Products & inventory</h2></div><p class="muted" style="max-width:400px;font-size:11px">Update the price and remaining stock for the selected pack, or publish/unpublish a product.</p></div><div class="table-wrap" id="products-area">${products.length?`<table class="data-table"><thead><tr><th>Product</th><th>Pack</th><th>Price (₹)</th><th>Stock packs</th><th>Published</th><th>Action</th></tr></thead><tbody>${products.map(p=>`<tr><td><strong>${esc(p.name)}</strong><br><small>${esc(p.flavour||'')}</small></td><td><select data-product-pack="${esc(p.id)}" aria-label="Product pack">${(p.packs||[]).map((v,i)=>`<option value="${i}" data-price="${Number(v.price)}" data-stock="${Number(p.stockPacks?.[i]||0)}">${esc(v.label)}</option>`).join('')}</select></td><td><input type="number" data-product-price="${esc(p.id)}" min="1" max="1000000" step="1" value="${Number(p.packs?.[0]?.price||0)}"></td><td><input type="number" data-product-stock="${esc(p.id)}" min="0" max="100000" step="1" value="${Number(p.stockPacks?.[0]||0)}"></td><td><input type="checkbox" data-product-active="${esc(p.id)}" ${p.active?'checked':''} aria-label="Published"></td><td><button class="primary small-btn" data-save-product="${esc(p.id)}">Save</button></td></tr>`).join('')}</tbody></table>`:'<p class="empty">No products. Run the seed-catalog script to create the initial catalog.</p>'}</div><div class="alert">Prices are demo examples until CUP2EAT confirms the official catalogue. The trusted backend validates price and stock using Realtime Database.</div>`;
}
async function updateProduct(button){
 const row=button.closest('tr'),id=button.dataset.saveProduct,pack=Number(row.querySelector('[data-product-pack]').value),price=Number(row.querySelector('[data-product-price]').value),stock=Number(row.querySelector('[data-product-stock]').value),active=row.querySelector('[data-product-active]').checked;
 if(!Number.isInteger(price)||price<1||!Number.isInteger(stock)||stock<0){toast('Enter a valid integer price and stock quantity.','danger');return}
 button.disabled=true;
 try{await callProduct({id,pack,price,stock,active});toast('Product updated securely.');await reload()}catch(err){toast(err.message,'danger')}finally{button.disabled=false}
}

if(!configured){unavailable()}
else {
 try {
 const [firebaseApp, firebaseAuth, firebaseDb, firebaseFunctions]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'),
   import('https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js'),
   import('https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js'),
   import('https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js')
 ]);
 ({initializeApp}=firebaseApp);
 ({getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,setPersistence,browserSessionPersistence}=firebaseAuth);
 ({getDatabase,ref,get}=firebaseDb);
 ({getFunctions,httpsCallable}=firebaseFunctions);
 const app=initializeApp(cfg);auth=getAuth(app);db=getDatabase(app);
 const functions=getFunctions(app,cfg.functionsRegion||'asia-south1');
 callStatus=httpsCallable(functions,'setOrderStatus');callProduct=httpsCallable(functions,'updateProduct');
 if(page==='login'){
   $('#admin-login-form').addEventListener('submit',async ev=>{
     ev.preventDefault();const form=ev.currentTarget,button=form.querySelector('button');button.disabled=true;loginNotice('Verifying administrator access…');
     try{
       await setPersistence(auth,browserSessionPersistence);
       const user=await signInWithEmailAndPassword(auth,form.elements.namedItem('email').value.trim(),form.elements.namedItem('password').value);
       if(!(await isOwner(user.user))){await signOut(auth);throw Error('This account does not have the administrator role.');}
       location.assign(dashURL);
     }catch(err){loginNotice(err.code ? err.code.replace('auth/','').replaceAll('-',' ') : err.message);form.elements.namedItem('password').value=''}finally{button.disabled=false}
   });
   onAuthStateChanged(auth,async user=>{if(!user)return;try{if(await isOwner(user))location.assign(dashURL)}catch{}});
 }else {
   onAuthStateChanged(auth,async user=>{
     if(!user){location.replace(loginURL);return}
     try{
       if(!(await isOwner(user))){await signOut(auth);location.replace(loginURL);return}
       mount();await reload();
     }catch(err){
       const root=$('#admin-root');if(root)root.innerHTML=`<p class="danger alert">Unable to verify administrator role. <a href="admin/login/">Sign in again</a>.</p>`;
     }
   });
 }
} catch(e) {console.error('Admin backend initialization failed', e); unavailable();}
}
