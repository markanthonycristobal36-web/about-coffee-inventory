'use strict';
const root = document.querySelector('#root');
const modal = document.querySelector('#modal');
let state, page = 'Overview', period = 7, filter = {}, refreshTimer;
const icons = {
  Overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  Inventory:'m3 7 9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10 M8 5l9 4',
  Movements:'M3 7h16m-4-4 4 4-4 4 M21 17H5m4-4-4 4 4 4',
  Alerts:'M4 17h16l-2-3V9a6 6 0 0 0-12 0v5z M10 20a2 2 0 0 0 4 0',
  Reports:'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6',
  Team:'M15 20v-2a5 5 0 0 0-10 0v2 M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M18 5a3 3 0 0 1 0 6 M18 14a4 4 0 0 1 3 4v2',
  plus:'M12 5v14 M5 12h14', close:'m6 6 12 12 M6 18 18 6', menu:'M3 6h18 M3 12h18 M3 18h18',
  clock:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0 M12 6v6l4 2',
  warning:'m12 3 10 17H2z M12 9v5 M12 17h.01', calendar:'M4 6h16v15H4z M8 3v5 M16 3v5 M4 11h16',
  exit:'M10 4H4v16h6 M9 12h12m-5-5 5 5-5 5', leaf:'M4 19C1 8 10 5 21 3c-1 10-5 18-15 16 M4 21 16 9',
  milk:'M8 3h8v3l2 4v11H6V10l2-4z M8 6h8 M6 12h12', tea:'M3 9h14v5a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6z M17 10h2a3 3 0 1 1-2 5 M6 3l1 3 M11 2l1 4',
  pearl:'M5 8h14l-2 13H7z M4 8h16 M12 8l3-6h4 M9 16h.1 M13 18h.1 M15 14h.1',
  drop:'M12 2C9 7 4 11 4 15a8 8 0 0 0 16 0c0-4-5-8-8-13z M8 15c0 2 1 3 3 4',
  sugar:'m3 8 9-5 9 5-9 5z M3 8v9l9 5 9-5V8 M12 13v9', box:'M5 6h14l-2 15H7z M4 3h16v3H4z M8 11h8',
  search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  print:'M7 8V3h10v5 M7 17H3V9h18v8h-4 M7 14h10v7H7z', chevron:'m9 6 6 6-6 6', check:'m4 12 5 5L20 6',
  edit:'m4 16 12-12 4 4L8 20l-5 1z M13 7l4 4', layers:'m3 7 9-4 9 4-9 4z M3 12l9 4 9-4 M3 17l9 4 9-4',
  chart:'M4 20V5 M4 20h17 M9 16v-4 M14 16V6 M19 16V9', down:'M12 3v16m-6-6 6 6 6-6', up:'M12 21V5m-6 6 6-6 6 6'
};
function icon(name,size=20){return '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="'+icons[name]+'"/></svg>';}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qty=n=>new Intl.NumberFormat('en-PH',{maximumFractionDigits:3}).format(Number(n)/1000);
const iso=d=>d.toISOString().slice(0,10);
const shifted=(s,offset)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return iso(d)};
const fmt=(d,opt={month:'short',day:'numeric'})=>new Intl.DateTimeFormat('en-PH',{...opt,timeZone:'UTC'}).format(new Date(d.slice(0,10)+'T12:00:00Z'));
const daysTo=d=>Math.round((Date.parse(d)-Date.parse(state.today))/86400000);
const option=(v,label=v,selected=false)=>'<option value="'+esc(v)+'" '+(selected?'selected':'')+'>'+esc(label)+'</option>';
const brand=()=>'<span class="brand"><img src="assets/mark.svg?v=2" alt=""><span>About Coffee<small>STOCKROOM</small></span></span>';
const initials=s=>s.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const roleOwner=()=>state.user.role==='Owner';
const itemBy=id=>state.itemMap.get(Number(id));
const archived=i=>Boolean(Number(i.archived));
const activeItems=()=>state.items.filter(i=>!archived(i));
const itemLots=id=>state.lotsBy.get(Number(id))||[];
const total=id=>itemLots(id).reduce((n,l)=>n+Number(l.balance),0);
const available=id=>itemLots(id).reduce((n,l)=>n+(!l.expiry||l.expiry>=state.today?Number(l.balance):0),0);
const status=i=>available(i.id)===0?'Out of stock':available(i.id)<=Number(i.minimum)?'Low stock':'In stock';
const catIcon=i=>['tea','milk','pearl','drop','sugar','box'][state.categories.indexOf(i.category)]||'leaf';
const itemCell=i=>'<span class="itemcell"><span class="tile c'+state.categories.indexOf(i.category)+'">'+icon(catIcon(i),19)+'</span><span><strong>'+esc(i.name)+'</strong><small>'+esc(i.category)+'</small></span></span>';
const pill=(s)=>'<span class="pill '+({'In stock':'green','Low stock':'amber','Out of stock':'red','Stock in':'green','Stock out':'blue','Wastage':'red',Adjustment:'purple',Expired:'red','Due soon':'amber',Active:'green',Inactive:'gray'}[s]||'gray')+'">'+esc(s)+'</span>';
function alerts(){
  const a=activeItems().filter(i=>status(i)!=='In stock').map(i=>({i,kind:status(i),detail:qty(available(i.id))+' '+i.unit+' usable · minimum '+qty(i.minimum)+' '+i.unit}));
  state.lots.filter(l=>l.expiry && daysTo(l.expiry)<=7).forEach(l=>{const i=itemBy(l.item_id),d=daysTo(l.expiry);a.push({i,kind:d<0?'Expired':'Due soon',detail:'Batch #'+l.id+' · '+qty(l.balance)+' '+i.unit+' · '+(d<0?'expired ':d===0?'due today, ':'due ')+fmt(l.expiry)});});
  return a;
}
async function request(action,body){
  const r=await fetch('api.php?action='+encodeURIComponent(action),body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.token},body:JSON.stringify(body)});
  let data;try{data=await r.json()}catch{throw Error('The PHP service could not respond. Open this folder through Apache on localhost.');}
  if(!r.ok){if(r.status===401 && state?.mode==='app'){if(modal.open)modal.close();await load();} throw Error(data.error||'Please try again.');}return data;
}
async function load(){
 state=await request('state');
 if(state.mode==='app'){
  state.itemMap=new Map(state.items.map(i=>[Number(i.id),i]));
  state.lotsBy=new Map();state.lots.forEach(l=>{const k=Number(l.item_id);if(!state.lotsBy.has(k))state.lotsBy.set(k,[]);state.lotsBy.get(k).push(l);});
  if(page==='Team'&&!roleOwner())page='Overview';
  shell();
 } else {page='Overview';auth();}
}
function toast(s){const t=document.querySelector('#toast');t.textContent=s;t.classList.add('show');clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>t.classList.remove('show'),3500);}
// Delay credential entry until the corresponding field receives user focus.
function clearAccessFields() {
 const form=root.querySelector('.access-desk form');
 if(!form)return;
 form.reset();
 for(const field of form.querySelectorAll('input[data-manual]')){
  field.value='';
  field.readOnly=true;
 }
}
document.addEventListener('focusin',event=>{
 const field=event.target;
 if(field.matches('.access-desk input[data-manual]') && field.readOnly){
  field.value='';
  field.readOnly=false;
 }
});
window.addEventListener('pageshow',event=>{if(event.persisted)clearAccessFields();});
function auth(){
 const setup = state.mode === 'setup';
 const pending = state.mode === 'pending';
 const title = setup ? 'Create workspace' : pending ? 'Setup required' : 'Sign in';
 const form = pending ? '' : `
   <form autocomplete="off" data-form="${setup ? 'setup' : 'login'}">
     ${setup ? '<label>Owner name<input name="name" autocomplete="off" data-manual readonly maxlength="80" required></label>' : ''}
     <label>Username<input name="username" autocapitalize="none" autocomplete="off" data-manual readonly maxlength="60" required></label>
     <label>Password<input name="password" type="password" autocomplete="off" data-manual readonly ${setup ? 'minlength="8" placeholder="At least 8 characters"' : ''} required></label>
     ${setup ? '<label class="checkline"><input name="sample" type="checkbox" checked>Start with sample items and transactions</label>' : ''}
     <div class="error" role="alert"></div>
     <button type="submit" class="primary"><span>${setup ? 'Create workspace' : 'Sign in'}</span><span aria-hidden="true">&rarr;</span></button>
   </form>`;
 root.innerHTML = `<main class="access-desk">
   <div class="access-sheet">
     <header class="access-stub">
       <div class="access-wordmark">About <em>Coffee.</em></div>
       <div class="access-stub-title">Stockroom</div>
     </header>
     <section class="access-entry" aria-labelledby="access-title">
       <h1 id="access-title">${title}</h1>
       ${setup ? '<p>Create the owner account for About Coffee.</p>' : pending ? '<p>Open the system on localhost to create the first owner account.</p>' : ''}
       ${form}
     </section>
   </div>
 </main>`;
 clearAccessFields();
}
const desc={Overview:'Your inventory and stock activity at a glance.',Inventory:'Ingredients and packaging, organized by category.',Movements:'Review deliveries, usage, wastage and stock adjustments.',Alerts:'Review replenishment needs and batches due within seven days.',Reports:'Prepare printable stock summaries and movement records.',Team:'Manage access to the stockroom.'};
function actionBtn(label,action,ic='plus',cls='primary'){return '<button class="'+cls+'" data-action="'+action+'">'+icon(ic,17)+esc(label)+'</button>';}
function shell(){
 const nav=(n)=>'<button data-nav="'+n+'" class="navbtn '+(page===n?'active':'')+'" '+(page===n?'aria-current="page"':'')+'>'+icon(n)+'<span>'+n+'</span>'+(n==='Alerts'&&alerts().length?'<b>'+alerts().length+'</b>':'')+'</button>';
 root.innerHTML='<div class="layout"><button class="scrim" data-action="menu" aria-label="Close navigation"></button><aside>'+brand()+'<div class="navlabel">Workspace</div><nav>'+['Overview','Inventory','Movements','Alerts','Reports'].map(nav).join('')+'</nav>'+(roleOwner()?'<div class="navlabel secondary">Administration</div>'+nav('Team'):'')+'<div class="identity"><span class="avatar">'+esc(initials(state.user.name))+'</span><span><strong>'+esc(state.user.name)+'</strong><small>'+state.user.role+'</small></span><button class="iconbtn" data-action="logout" aria-label="Sign out" title="Sign out">'+icon('exit',17)+'</button></div></aside><div class="main"><header class="topbar"><div class="crumb"><button class="iconbtn mobile" data-action="menu" aria-label="Open navigation">'+icon('menu')+'</button>Stockroom <span>/</span> <strong>'+page+'</strong></div><div class="topdate">'+icon('calendar',16)+fmt(state.today,{weekday:'short',month:'short',day:'numeric',year:'numeric'})+'</div></header><main id="content"><div class="pagehead"><div><div class="kicker"><i></i> ABOUT COFFEE</div><h1>'+(page==='Overview'?'Stock overview':page==='Movements'?'Stock movements':page==='Team'?'Team access':page==='Alerts'?'Stock alerts':page)+'</h1><p class="sub">'+desc[page]+'</p></div>'+(page==='Movements'?actionBtn('Record movement','move'):page==='Inventory'&&roleOwner()?actionBtn('Add item','item'):page==='Team'?actionBtn('Add staff','staff'):page==='Reports'?actionBtn('Print report','print','print'):'')+'</div><div id="work"></div></main></div></div>';
 render();
}
function render(){document.querySelector('#work').innerHTML=({Overview:overview,Inventory:inventory,Movements:movements,Alerts:alertPage,Reports:reports,Team:team})[page]();}
function go(p){page=p;filter={};shell();window.scrollTo(0,0);}
function panel(title,subtitle,action,body){return '<section class="panel"><div class="panelhead"><div><h2>'+title+'</h2>'+(subtitle?'<p>'+subtitle+'</p>':'')+'</div>'+action+'</div>'+body+'</section>';}
const link=(label,p)=>'<button class="textbtn" data-nav="'+p+'">'+label+'</button>';
function stat(label,num,note,ic,cls,p,subset=''){return '<button class="stat '+cls+'" data-nav="'+p+'" data-subset="'+subset+'"><span class="statlabel"><span class="stat-icon">'+icon(ic,18)+'</span>'+label+'</span><b>'+num+'</b><small>'+note+'</small></button>';}
function overview(){
 const low=activeItems().filter(i=>status(i)!=='In stock').length;
 const exp=state.lots.filter(l=>l.expiry && daysTo(l.expiry)>=0 && daysTo(l.expiry)<=7).length;
 const week=state.moves.filter(m=>m.created.slice(0,10)>=shifted(state.today,-6)).length;
 const stats=stat('Inventory items',activeItems().length,'Ingredients & supplies','Inventory','hero-stat','Inventory')+stat('Low stock',low,'At or below minimum','warning','ochre','Alerts','Stock levels')+stat('Expiring soon',exp,'Batches due in 7 days','clock','clay','Alerts','Due soon')+stat('Movements',week,'Entries in the last 7 days','Movements','mint','Movements','week');
 const entries=alerts().sort((a,b)=>({Expired:0,'Out of stock':1,'Low stock':2,'Due soon':3}[a.kind]-{Expired:0,'Out of stock':1,'Low stock':2,'Due soon':3}[b.kind])).slice(0,4);
 return '<div class="stats">'+stats+'</div><div class="dashboard-grid">'+panel('Stock activity','Recorded movement entries', '<select class="compact" id="period" aria-label="Stock activity period">'+[7,14].map(n=>option(n,'Last '+n+' days',n===period)).join('')+'</select>',chart())+panel('Needs attention','Stock and expiration alerts',link('View all','Alerts'),entries.length?'<div class="attention">'+entries.map(a=>'<button data-detail="'+a.i.id+'">'+itemCell(a.i)+pill(a.kind)+'</button>').join('')+'</div>':empty('All caught up','No stock or expiry alerts.'))+'</div>'+panel('Recent movements','Latest entries in the stock ledger',link('View history','Movements'),moveTable(state.moves.slice(0,5)));
}
function chart(){
 const dates=Array.from({length:period},(_,i)=>shifted(state.today,i-period+1));
 const data=dates.map(d=>{const m=state.moves.filter(x=>x.created.slice(0,10)===d);return [m.filter(x=>x.delta>0).length,m.filter(x=>x.delta<0).length];});
 const ceiling=Math.max(4,Math.ceil(Math.max(0,...data.flat())/4)*4);
 return '<div class="chartlegend"><span><i></i>Incoming</span><span><i></i>Outgoing</span></div><div class="plot"><div class="axis">'+[4,3,2,1,0].map(n=>'<span>'+n*ceiling/4+'</span>').join('')+'</div><div class="bars">'+dates.map((d,i)=>'<div class="barcol" title="'+fmt(d)+': '+data[i][0]+' incoming, '+data[i][1]+' outgoing"><div class="barpair">'+data[i].map((v,k)=>'<i class="bar b'+k+'" style="height:'+v/ceiling*100+'%"></i>').join('')+'</div><small>'+(period===7?fmt(d,{weekday:'short'}):(i%2===0?Number(d.slice(-2)):''))+'</small></div>').join('')+'</div></div><details class="chart-data"><summary>View chart data</summary>'+table(['Date','Incoming','Outgoing'],dates.map((d,i)=>[fmt(d),...data[i]]))+'</details>';
}
function empty(title,sub=''){return '<div class="empty">'+icon('layers',26)+'<strong>'+title+'</strong><p>'+sub+'</p></div>';}
function table(head,body){return '<div class="scrolltable" tabindex="0" aria-label="Scrollable table"><table><thead><tr>'+head.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+body.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function moveTable(data){
 if(!data.length)return empty('No movements found','Recorded transactions will appear here.');
 return table(['Item','Movement','Quantity','Recorded',''],data.map(m=>{const i=itemBy(m.item_id);return [itemCell(i),pill(m.type),'<strong class="'+(m.delta>0?'pos':'neg')+'">'+(m.delta>0?'+':'')+qty(m.delta)+' '+i.unit+'</strong>',fmt(m.created,{day:'numeric',month:'short',year:'numeric'})+'<small>'+esc(m.actor)+'</small>','<button class="iconbtn" data-move="'+m.id+'" aria-label="View movement '+m.id+'">'+icon('chevron',17)+'</button>'];}));
}
function search(){return '<label class="search">'+icon('search',17)+'<input id="search" aria-label="Search items" placeholder="Search items…" value="'+esc(filter.q||'')+'"></label>';}
function sel(key,options,first){return '<select aria-label="'+esc(first)+'" data-filter="'+key+'">'+option('',first)+options.map(o=>option(o,o,filter[key]===o)).join('')+'</select>';}
function invData(){return state.items.filter(i=>archived(i)===(filter.visibility==='Archived items')&&(!filter.q||i.name.toLowerCase().includes(filter.q.toLowerCase()))&&(!filter.cat||i.category===filter.cat)&&(!filter.status||status(i)===filter.status));}
function inventoryScope(){
 return '<select aria-label="Inventory view" data-filter="visibility">'+['Active items','Archived items'].map(v=>option(v,v,v===filter.visibility)).join('')+'</select>';
}
function inventory(){return '<section class="panel"><div class="tools">'+search()+inventoryScope()+sel('cat',state.categories,'All categories')+sel('status',['In stock','Low stock','Out of stock'],'All statuses')+'</div>'+inventoryList()+'</section>';}
function inventoryList(){const data=invData();return '<div id="results">'+(data.length?table(['Item','On hand','Usable','Minimum','Status',''],data.map(i=>[itemCell(i),qty(total(i.id))+' '+i.unit,qty(available(i.id))+' '+i.unit,qty(i.minimum)+' '+i.unit,pill(status(i)),'<button class="textbtn" data-detail="'+i.id+'">Details</button>'])):empty('No matching items','Add an item or change your filters.'))+'</div>';}
function movementData(){return state.moves.filter(m=>(!filter.q||itemBy(m.item_id).name.toLowerCase().includes(filter.q.toLowerCase()))&&(!filter.type||m.type===filter.type)&&(!filter.from||m.created.slice(0,10)>=filter.from)&&(!filter.to||m.created.slice(0,10)<=filter.to));}
function dateFilters(){return '<label class="inline">From<input aria-label="From date" type="date" data-filter="from" value="'+esc(filter.from||'')+'" max="'+esc(filter.to||'9999-12-31')+'"></label><label class="inline">To<input aria-label="To date" type="date" data-filter="to" value="'+esc(filter.to||'')+'" min="'+esc(filter.from||'1000-01-01')+'"></label>';}
const types=['Stock in','Stock out','Wastage','Adjustment'];
function movements(){return '<section class="panel"><div class="tools">'+search()+sel('type',types,'All movements')+dateFilters()+'</div><div id="results">'+moveTable(movementData())+'</div></section>';}
function alertPage(){const arr=alerts().filter(a=>!filter.kind||a.kind===filter.kind||(filter.kind==='Stock levels'&&['Low stock','Out of stock'].includes(a.kind)));return '<section class="panel"><div class="tools">'+sel('kind',['Stock levels','Due soon','Expired'],'All alerts')+'</div>'+(arr.length?table(['Item','Alert','Stock or batch detail',''],arr.map(a=>[itemCell(a.i),pill(a.kind),esc(a.detail),'<button data-detail="'+a.i.id+'" class="textbtn">Details</button>'])):empty('No alerts to review','Items in this view are up to date.'))+'</section>';}
function reports(){
 const mode=filter.report||'Inventory summary', names=['Inventory summary','Stock movements','Replenishment'];
 const mv=mode===names[1], data=mv?movementData():state.items.filter(i=>mode===names[2]?(!archived(i)&&status(i)!=='In stock'):(!archived(i)||total(i.id)>0));
 const contents=mv?table(['Date','Item','Type','Change','Balance','Recorded by'],data.map(m=>{const i=itemBy(m.item_id);return [esc(m.created),esc(i.name),m.type,(m.delta>0?'+':'')+qty(m.delta)+' '+i.unit,qty(m.after_qty)+' '+i.unit,esc(m.actor)];})):table(['Item','Category','On hand','Usable','Minimum','Status'],data.map(i=>[esc(i.name)+(archived(i)?' (archived)':''),esc(i.category),qty(total(i.id))+' '+i.unit,qty(available(i.id))+' '+i.unit,qty(i.minimum)+' '+i.unit,pill(status(i))]));
 return '<div class="report-tools"><div class="tabs">'+names.map(n=>'<button class="'+(n===mode?'chosen':'')+'" data-report="'+n+'">'+n+'</button>').join('')+'</div>'+(mv?'<div class="tools">'+sel('type',types,'All movements')+dateFilters()+'</div>':'')+'</div>'+panel(mode,esc('About Coffee · '+fmt(state.today,{month:'long',day:'numeric',year:'numeric'})+' · '+data.length+' records'+(mv?' · '+(filter.from||'First entry')+' to '+(filter.to||state.today)+' · '+(filter.type||'All movements'):'')),'',data.length?contents:empty('No records in this report'));
}
function team(){return panel('Workspace members','Owner and staff accounts','',table(['Name','Username','Role','Access',''],state.team.map(u=>[esc(u.name),esc(u.username),u.role,pill(Number(u.active)?'Active':'Inactive'),u.role==='Staff'?'<button class="textbtn" data-access="'+u.id+'">'+(Number(u.active)?'Deactivate':'Activate')+'</button>':''])));}
function openDialog(title,body,tag='STOCKROOM'){
 modal.innerHTML='<div class="dialoghead"><div><span class="kicker">'+esc(tag)+'</span><h2 id="dialogtitle">'+esc(title)+'</h2></div><button class="iconbtn" data-action="close" aria-label="Close dialog">'+icon('close')+'</button></div>'+body;
 modal.setAttribute('aria-labelledby','dialogtitle');if(!modal.open)modal.showModal();
}
function form(action,fields,button){return '<form data-form="'+action+'">'+fields+'<div class="error" role="alert"></div><div class="formfoot"><button type="button" class="secondarybtn" data-action="close">Cancel</button><button class="primary">'+button+'</button></div></form>';}
const input=(label,name,attrs='')=>'<label>'+label+'<input name="'+name+'" '+attrs+'></label>';
function editItem(i){
 const dateField=!i ? input('First batch expiry date (optional)','expiry','type="date"') : '';

 openDialog(i?'Edit inventory item':'Add inventory item',form('item','<input type="hidden" name="id" value="'+(i?i.id:0)+'">'+input('Item name','name','required maxlength="100" value="'+esc(i?.name||'')+'"')+'<label>Category<select name="category">'+state.categories.map(v=>option(v,v,v===i?.category)).join('')+'</select></label><div class="formrow"><label>Unit<select name="unit">'+state.units.map(v=>option(v,v,v===i?.unit)).join('')+'</select></label>'+input('Minimum stock','minimum','type="number" required min="0" max="99999999" step="0.001" value="'+(i?Number(i.minimum)/1000:0)+'"')+'</div>'+dateField,i?'Save changes':'Add item'));
}
const itemActionLabels={archive:'Archive item',restore:'Restore item',delete_item:'Delete item'};
function itemActions(i){
 if(page!=='Inventory' && archived(i)){
  return '<p class="hint">This item is archived. An owner can restore it in Inventory before recording a movement.</p>';
 }
 const actions=[];
 if(page==='Inventory' && roleOwner()){
  const hasHistory=state.moves.some(m=>Number(m.item_id)===Number(i.id));
  const action=archived(i)?'restore':(hasHistory||total(i.id)>0?'archive':'delete_item');
  actions.push('<button class="secondarybtn" data-item-action="'+action+'" data-id="'+i.id+'">'+itemActionLabels[action]+'</button>');
  if(!archived(i))actions.push('<button class="secondarybtn" data-edit="'+i.id+'">Edit item</button>');
 }
 if(!archived(i))actions.push('<button class="primary" data-newmove="'+i.id+'">Record movement</button>');
 return actions.length?'<div class="formfoot item-actions">'+actions.join('')+'</div>':'';
}
function confirmItemAction(action,i){
 const messages={
  archive:'This item will move to Archived items. Its balance and movement history will be kept. Restore it to record another movement.',
  restore:'This item will return to active inventory and can be used in new movements.',
  delete_item:'This unused item will be permanently deleted, including any pending first-batch expiry date.'
 };
 openDialog(itemActionLabels[action]+'?',form(action,'<input type="hidden" name="id" value="'+i.id+'"><p><strong>'+esc(i.name)+'</strong></p><p>'+messages[action]+'</p>',itemActionLabels[action]),'INVENTORY');
}
function details(id){
 const i=itemBy(id),lots=itemLots(id);
 openDialog(i.name,'<div class="detail-summary">'+itemCell(i)+pill(status(i))+'</div><div class="metrics"><span>On hand<b>'+qty(total(id))+' '+i.unit+'</b></span><span>Usable<b>'+qty(available(id))+' '+i.unit+'</b></span><span>Minimum<b>'+qty(i.minimum)+' '+i.unit+'</b></span></div>'+(i.pending_expiry?'<p>First batch expiry date: '+esc(i.pending_expiry)+'</p>':'')+'<h3>Remaining batches</h3>'+(lots.length?table(['Batch','Best before / expiry','Balance'],lots.map(l=>['#'+l.id,l.expiry?esc(l.expiry):'Unrecorded',qty(l.balance)+' '+i.unit])):empty('No remaining stock'))+itemActions(i),'INVENTORY ITEM');
}
function movementDetail(mid){
 const m=state.moves.find(v=>Number(v.id)===mid),i=itemBy(m.item_id),lines=state.lines.filter(l=>Number(l.move_id)===mid);
 openDialog('Movement #'+m.id,'<div class="detail-summary">'+itemCell(i)+pill(m.type)+'</div><div class="metrics"><span>Change<b>'+(m.delta>0?'+':'')+qty(m.delta)+' '+i.unit+'</b></span><span>Balance after<b>'+qty(m.after_qty)+' '+i.unit+'</b></span></div><dl><dt>Recorded by</dt><dd>'+esc(m.actor)+'</dd><dt>Date & time</dt><dd>'+esc(m.created)+' PHT</dd><dt>Note</dt><dd>'+esc(m.note||'—')+'</dd></dl>'+table(['Batch','Expiry','Change'],lines.map(l=>['#'+l.lot_id,esc(l.expiry||'Unrecorded'),qty(l.delta)+' '+i.unit])),'MOVEMENT HISTORY');
}
function newMove(id=0){
 if(!activeItems().length){openDialog('Add inventory first','<p>Create an inventory item before recording its first delivery.</p>'+(roleOwner()?actionBtn('Add item','item'):''));return;}
 const key=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
 openDialog('Record movement',form('move','<input type="hidden" name="key" value="'+key+'"><label>Inventory item<select name="item" required>'+option('','Select an item')+activeItems().map(i=>option(i.id,i.name,i.id==id)).join('')+'</select></label><label>Movement type<select name="type">'+types.filter(t=>roleOwner()||t!=='Adjustment').map(t=>option(t)).join('')+'</select></label><div id="direction"></div><div id="balancehint" class="hint"></div>'+input('Quantity','quantity','type="number" min="0.001" max="99999999" step="0.001" required placeholder="0"')+'<div id="batchfield"></div><label><span id="notelabel">Note (optional)</span><textarea name="note" rows="2" maxlength="255" placeholder="Delivery reference or reason"></textarea></label>','Save movement'));moveFields();
}
function moveFields(){
 const f=modal.querySelector('form'),i=itemBy(f.elements.item.value),type=f.elements.type.value;
 const dir=f.querySelector('#direction');
 if(type==='Adjustment' && !f.elements.direction)dir.innerHTML='<label>Adjustment direction<select name="direction"><option value="increase">Increase stock</option><option value="decrease">Decrease stock</option></select></label>';
 if(type!=='Adjustment')dir.innerHTML='';
 const incoming=type==='Stock in'||(type==='Adjustment'&&f.elements.direction.value==='increase');
 const hint=f.querySelector('#balancehint');hint.textContent=i?'On hand: '+qty(total(i.id))+' '+i.unit+' · Usable: '+qty(available(i.id))+' '+i.unit:'';
 f.elements.quantity.step=i?.unit==='pcs'?'1':'0.001';f.elements.quantity.min=f.elements.quantity.step;
 const applicable=i?itemLots(i.id).filter(l=>type!=='Stock out'||!l.expiry||l.expiry>=state.today):[];
 f.querySelector('#batchfield').innerHTML=incoming?input('Best before / expiry (optional)','expiry','type="date" value="'+esc(i?.pending_expiry||'')+'"')+(i?.pending_lot?'<input type="hidden" name="pending_lot" value="'+esc(i.pending_lot)+'">':''):'<label>Source batch<select name="lot">'+option(0,'Automatic · earliest expiry first')+applicable.map(l=>option(l.id,'#'+l.id+' · '+(l.expiry||'No date')+' · '+qty(l.balance)+' '+i.unit)).join('')+'</select></label>';
 const required=type==='Wastage'||type==='Adjustment';f.elements.note.required=required;f.querySelector('#notelabel').textContent=required?'Reason (required)':'Note (optional)';
}
function newStaff(){openDialog('Add staff account',form('staff',input('Full name','name','required maxlength="80"')+input('Username','username','required minlength="3" maxlength="60" autocomplete="off"')+input('Password','password','type="password" minlength="8" required autocomplete="new-password"'),'Create account'),'TEAM ACCESS');}
function handleError(el,e){el.textContent=e.message;el.hidden=false;}
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.nav){go(d.nav);if(d.subset){if(d.nav==='Alerts')filter.kind=d.subset;if(d.subset==='week')filter.from=shifted(state.today,-6);render();}return;}
 if(d.itemAction)return confirmItemAction(d.itemAction,itemBy(d.id));
 if(d.detail)return details(Number(d.detail));
 if(d.edit)return editItem(itemBy(d.edit));
 if(d.move)return movementDetail(Number(d.move));
 if(d.newmove)return newMove(Number(d.newmove));
 if(d.report){filter={report:d.report};render();return;}
 if(d.access){const u=state.team.find(u=>u.id==d.access),active=!Number(u.active);openDialog((active?'Activate ':'Deactivate ')+u.name+'?',form('access','<input type="hidden" name="id" value="'+u.id+'"><input type="hidden" name="active" value="'+active+'"><p>'+esc(u.name)+(active?' will be able to sign in.':' will lose access to the stockroom. Their movement history will be kept.')+'</p>',active?'Activate':'Deactivate'));return;}
 switch(d.action){
 case 'move':newMove();break;case 'item':editItem();break;case 'staff':newStaff();break;case 'close':modal.close();break;case 'print':window.print();break;
 case 'menu':document.querySelector('.layout').classList.toggle('open');break;
 case 'logout':try{await request('logout',{});filter={};await load();}catch(e){toast(e.message);}break;
 case 'retry':location.reload();break;
 }
});
document.addEventListener('change',ev=>{
 const t=ev.target;
 if(t.id==='period'){period=Number(t.value);render();}
 if(t.dataset.filter){filter[t.dataset.filter]=t.value;render();}
 if(t.closest('[data-form="move"]')&&['item','type','direction'].includes(t.name))moveFields();
});
document.addEventListener('input',ev=>{
 if(ev.target.id==='search'){filter.q=ev.target.value;const results=document.querySelector('#results');if(page==='Inventory')results.outerHTML=inventoryList();else results.innerHTML=moveTable(movementData());}
});
document.addEventListener('submit',async ev=>{
 const f=ev.target;if(!f.dataset.form)return;ev.preventDefault();
 const action=f.dataset.form,body=Object.fromEntries(new FormData(f)),btn=f.querySelector('button.primary'),error=f.querySelector('.error');
 if(action==='setup')body.sample=Boolean(f.elements.sample.checked);
 if(action==='access')body.active=body.active==='true';
 error.textContent='';btn.disabled=true;
 try{await request(action,body);if(modal.open)modal.close();await load();if(action!=='login')toast(({setup:'Workspace created',move:'Movement recorded',item:'Inventory item saved',archive:'Item archived',restore:'Item restored',delete_item:'Item deleted',staff:'Staff account created',access:'Access updated'})[action]);}
 catch(e){if(f.isConnected)handleError(error,e);else toast(e.message);}
 finally{btn.disabled=false;}
});
load().catch(e=>{root.innerHTML='<main class="boot">'+brand()+'<h2>Stockroom unavailable</h2><p>'+esc(e.message)+'</p><button data-action="retry" class="primary">Try again</button></main>';});
