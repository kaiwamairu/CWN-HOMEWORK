(() => {
  const $ = s => document.querySelector(s);
  const all = s => [...document.querySelectorAll(s)];
  const art = (name, cls='illustration') => `<svg class="${cls}" viewBox="0 0 128 128" aria-hidden="true"><use href="#art-${name}"/></svg>`;
  const ui = (name, cls='nav-icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#ui-${name}"/></svg>`;
  const services = [
    {id:'SV-01',name:'ขอหนังสือรับรอง',price:'เริ่มต้น 20 บาท',sla:3,art:'certificate',detail:'เลือกจำนวน 1–5 ฉบับ แนบบัตรประชาชน แล้วชำระค่าธรรมเนียม 20 บาทต่อฉบับ\nเจ้าหน้าที่ทะเบียนพิจารณาและออกเอกสาร'},
    {id:'SV-02',name:'ขออนุญาตประกอบกิจการ',price:'500 บาท / คำขอ',sla:10,art:'shop',detail:'แนบบัตรประชาชนและแผนที่ตั้ง\nทะเบียนตรวจเอกสาร → หัวหน้าฝ่ายอนุมัติ → ผู้รับทะเบียนครั้งแรกออกเอกสาร'},
    {id:'SV-03',name:'ขออนุญาตก่อสร้าง',price:'คิดตามพื้นที่',sla:15,art:'house',detail:'พื้นที่ 1–100 ตร.ม. 1,000 บาท จาก 101–500 ตร.ม. เพิ่ม 10 บาทต่อ ตร.ม.\nแนบแบบแปลน PDF และโฉนด\nทะเบียน → โยธา → หัวหน้า'}
  ];
  const cases = [
    {id:'EG-2569-000020',service:'หนังสือรับรอง',status:'กำลังตรวจสอบ',due:'30 พ.ย. 16:30',level:'เกินกำหนด',color:'red',mine:true,owner:'คุณ'},
    {id:'EG-2569-000022',service:'หนังสือรับรอง',status:'กำลังตรวจสอบ',due:'1 ธ.ค. 16:30',level:'ใกล้ครบกำหนด',color:'amber',mine:true,owner:'คุณ'},
    {id:'EG-2569-000024',service:'หนังสือรับรอง',status:'ส่งคำขอแล้ว',due:'2 ธ.ค. 16:30',level:'ใกล้ครบกำหนด',color:'amber',mine:false,unclaimed:true,owner:'ยังไม่มีผู้รับ'},
    {id:'EG-2569-000023',service:'หนังสือรับรอง',status:'กำลังตรวจสอบ',due:'3 ธ.ค. 16:30',level:'ปกติ',color:'gray',mine:true,owner:'คุณ'},
    {id:'EG-2569-000025',service:'หนังสือรับรอง',status:'กำลังตรวจสอบ',due:'3 ธ.ค. 16:30',level:'ปกติ',color:'gray',mine:false,owner:'จนท.ทะเบียน 2'}
  ];
  let screen='citizen', filter='all', query='', calendarMonth=11, calendarYear=2026;

  function show(title,text,illustration='building') {
    $('#dialog-title').textContent=title;
    $('#dialog-text').textContent=text;
    $('#dialog-art').setAttribute('href','#art-'+illustration);
    $('#detail').showModal();
  }
  function header(title,icon='building',action='') {
    return `<div class="panel-header"><h3 class="panel-title">${ui(icon)}${title}</h3>${action}</div>`;
  }
  function sidebar() {
    const citizen = screen==='citizen';
    const items = citizen ? [
      ['home','home','หน้าหลัก',''],['cases','file','คำขอของฉัน','3'],['services','building','เริ่มใช้บริการ',''],['todos','bell','สิ่งที่ต้องทำ','1'],['guide','book','คู่มือบริการ','']
    ] : [
      ['home','home','คิวงานฝ่ายทะเบียน',''],['mine','file','งานของฉัน','3'],['alerts','bell','การแจ้งเตือน','3'],['journey','route','ขั้นตอนงาน',''],['guide','book','คู่มือบริการ','']
    ];
    return `<aside class="sidebar"><div class="side-brand">${art('building','brand-building')}<div><div class="brand-name">บ้านบริการ</div><div class="brand-caption">CIVIC SERVICE HOUSE</div><hr class="side-rule"><div class="side-town">เทศบาลนครตัวอย่าง</div></div></div><nav class="side-nav" aria-label="เมนูตัวอย่าง">${items.map(([id,icon,label,count],i)=>`<button class="side-item ${i===0?'active':''}" data-nav="${id}">${ui(icon)}<span>${label}</span>${count?`<span class="nav-count">${count}</span>`:''}</button>`).join('')}</nav><div class="side-spacer"></div><div class="side-help">${art('counter')}<h4>ทุกคำขอ มีคนดูแล</h4><p>ยื่นออนไลน์ ติดตามได้<br>เหมือนมีจุดบริการอยู่ใกล้คุณ</p><button data-action="journey">รู้จักขั้นตอนบริการ</button></div><div class="side-foot">${ui('leaf','sprig')} MADE FOR OUR COMMUNITY</div></aside>`;
  }
  function dateCard(context){return `<div class="date-card"><span class="calendar-binding" aria-hidden="true"></span><time datetime="2026-12-01T09:00:00+07:00"><span class="calendar-month">ธันวาคม 2569</span><b class="calendar-day">1</b><span class="calendar-weekday">วันอังคาร · 09:00 น.</span></time><span class="calendar-caption calendar-context">${context}</span></div>`;}
  function hero() {
    const citizen=screen==='citizen';
    return `<header class="hero">${window.CivicMotion.markup(window.__CIVIC_MOTION_ASSETS__['1A'],'hero')}<div class="hero-copy"><p class="hero-hello">${ui('building','sprig')} เทศบาลนครตัวอย่าง · e-Service</p><h2>${citizen?'สวัสดี คุณสมชาย':'ยินดีต้อนรับ เจ้าหน้าที่ทะเบียน'}</h2><p class="hero-subtitle">${citizen?'ให้ทุกเรื่องของคุณ เดินหน้าได้จากที่บ้าน':'ดูแลทุกคำขอ ให้ไปถึงจุดหมาย'}</p></div><div class="hero-meta">${dateCard(citizen?'พื้นที่บริการของคุณ':'ฝ่ายทะเบียน')}<div class="profile" aria-label="${citizen?'สมชาย ใจดี':'เจ้าหน้าที่ทะเบียน 1'}"><svg viewBox="0 0 80 80" aria-hidden="true"><use href="#art-person"/></svg></div></div></header>`;
  }
  function calendar() {
    return `<section class="calendar" aria-label="ปฏิทินคำขอ"><div class="calendar-head"><button data-month="-1" aria-label="เดือนก่อนหน้า">‹</button><span id="calendar-label"></span><button data-month="1" aria-label="เดือนถัดไป">›</button></div><div class="calendar-grid" id="calendar-grid"></div><div class="calendar-note"><i></i>4 ธ.ค. กำหนดส่งเอกสารแก้ไข</div></section>`;
  }
  function overview() {
    if(screen==='staff') return `<section class="panel overview">${header('ภาพรวมงานของเรา','building')}<div class="overview-stats" style="grid-template-columns:1fr 1fr"><div class="stat-tile"><span>คิวของแผนก</span><strong>17<small>เรื่อง</small></strong>${art('folder','seal')}</div><div class="stat-tile"><span>งานของฉัน</span><strong>3<small>เรื่อง</small></strong>${art('counter','seal')}</div><div class="stat-tile gold"><span>ใกล้ครบกำหนด</span><strong>2<small>เรื่อง</small></strong>${art('certificate','seal')}</div><div class="stat-tile gold"><span>เกินกำหนด</span><strong>1<small>เรื่อง</small></strong>${art('stamp','seal')}</div></div><p style="font-size:9px;color:#8c866d;margin-top:13px">ข้อมูลคิวทะเบียน ณ 1 ธ.ค. 2569 09:00</p></section>`;
    return `<section class="panel overview">${header('ภาพรวมของฉัน','building')}<div class="overview-body"><div class="overview-stats"><div class="stat-tile"><span>คำขอล่าสุดในตัวอย่าง</span><strong>3<small>เรื่อง</small></strong>${art('folder','seal')}</div><div class="stat-tile gold"><span>รอแก้ไขเอกสาร</span><strong>1<small>เรื่อง</small></strong>${art('certificate','seal')}</div></div>${calendar()}</div></section>`;
  }
  function todos() {
    const citizen=screen==='citizen';
    return `<section class="panel tasks-panel" id="todos">${header(citizen?'สิ่งที่ต้องทำ':'งานที่ต้องติดตาม','bell',`<button class="subtle-link" data-action="${citizen?'fix':'alerts'}">ดูรายละเอียด</button>`)}${citizen?`
      <div class="todo-item">${art('certificate')}<div class="todo-copy"><b>แก้ไขเอกสารคำขอ</b><small>EG-2569-000017</small></div><button data-action="fix">แก้ไข</button></div>
      <div class="todo-item">${art('folder')}<div class="todo-copy"><b>ส่งกลับก่อน 4 ธ.ค. 2569</b><small>เวลา 14:00 น. · นับจากตีกลับ 168 ชม.</small></div><button class="chev" data-action="fix" aria-label="ดูกำหนดแก้ไขเอกสาร">›</button></div>
      <div class="todo-item">${art('building')}<div class="todo-copy"><b>คำขอของคุณไปถึงไหนแล้ว</b><small>ติดตามสถานะและขั้นตอนถัดไป</small></div><button class="chev" data-action="cases" aria-label="ดูคำขอของฉัน">›</button></div>` : `
      <div class="todo-item">${art('stamp')}<div class="todo-copy"><b>EG-2569-000020</b><small>เกินกำหนด · 30 พ.ย. 16:30</small></div><button data-case="EG-2569-000020">เปิด</button></div>
      <div class="todo-item">${art('certificate')}<div class="todo-copy"><b>EG-2569-000022</b><small>ใกล้ครบกำหนด · 1 ธ.ค. 16:30</small></div><button data-case="EG-2569-000022">เปิด</button></div>
      <div class="todo-item">${art('folder')}<div class="todo-copy"><b>EG-2569-000024</b><small>ใกล้ครบกำหนด · 2 ธ.ค. 16:30</small></div><button data-case="EG-2569-000024">เปิด</button></div>`}</section>`;
  }
  function town() {
    return `<section class="panel town-panel">${header('บ้านของทุกบริการ','building')}<div class="town-window" role="img" aria-label="ภาพวาดสำนักงานเทศบาลในชุมชนชานเมืองไทย"><span class="window-label">${ui('building')} เทศบาลนครตัวอย่าง</span></div><div class="town-caption"><div><b>ใกล้ชิดชุมชน ใกล้คุณเสมอ</b><p>เชื่อมบ้านของคุณกับสำนักงานบริการ</p></div>${art('counter')}</div></section>`;
  }
  function servicePanel() {
    return `<section class="panel services-panel" id="services">${header('วันนี้ ให้เราช่วยเรื่องอะไร','building',`<button class="subtle-link" data-action="guide">คู่มือบริการ</button>`)}<div class="service-grid">${services.map(s=>`<button class="service" data-service="${s.id}">${art(s.art)}<h4>${s.name}</h4><p>${s.price}<br>ภายใน ${s.sla} วันทำการ</p><span class="service-bottom">เริ่มยื่นคำขอ <span class="arrow">↗</span></span></button>`).join('')}</div></section>`;
  }
  function journey() {
    return `<section class="panel journey-panel" id="journey">${header('เส้นทางของหนึ่งคำขอ','route')}<div class="journey-art" aria-hidden="true">${art('folder')}${art('counter')}${art('certificate')}</div><div class="journey-text"><h4>ยื่นเรื่อง · มีคนดูแล · ได้เอกสาร</h4><p>จากเอกสารที่บ้าน สู่เจ้าหน้าที่<br>พร้อมติดตามได้ทุกขั้นของบริการ</p><button class="soft-button" data-action="journey">ดูขั้นตอนทั้งหมด ${'↗'}</button></div></section>`;
  }
  function requests() {
    const list=[{id:'000030',service:services[0],status:'ส่งคำขอแล้ว',color:'blue'},{id:'000017',service:services[0],status:'รอแก้ไขเอกสาร',color:'amber'},{id:'000011',service:services[2],status:'รออนุมัติ',color:'gray'}];
    return `<section class="panel requests-panel" id="requests">${header('คำขอล่าสุดของฉัน','file',`<span style="font-size:9px;color:#8b866e">ข้อมูลตัวอย่าง 3 รายการ</span>`)}<div class="table-region" tabindex="0" role="region" aria-label="คำขอล่าสุด"><table class="requests-table"><thead><tr><th>คำขอ / บริการ</th><th>สถานะปัจจุบัน</th><th class="wide-only">ขั้นตอนถัดไป</th><th></th></tr></thead><tbody>${list.map(c=>`<tr><td><div class="request-info">${art(c.service.art)}<div><b>${c.service.name}</b><small>EG-2569-${c.id}</small></div></div></td><td><span class="badge ${c.color}">${c.status}</span></td><td class="wide-only">${c.id==='000017'?'แก้ไขเอกสารภายในกำหนด':c.id==='000011'?'รอหัวหน้าพิจารณา':'รอเจ้าหน้าที่รับเรื่อง'}</td><td><button class="table-action" data-citizen-case="${c.id}" aria-label="เปิดคำขอ EG-2569-${c.id}">เปิด ↗</button></td></tr>`).join('')}</tbody></table></div><div class="table-note"><span>คำขอแต่ละเรื่องมีประวัติและสถานะให้ติดตาม</span><span>e-Service</span></div></section>`;
  }
  function queue() {
    return `<section class="panel staff-queue" id="requests">${header('คิวงานฝ่ายทะเบียน','file',`<span style="font-size:9px;color:#8b866e">เรียงกำหนดก่อน ↑</span>`)}<div class="filter-row"><div class="filters" role="group" aria-label="ตัวกรองคิวงาน"><button class="filter-btn" data-filter="all">ทั้งหมด 17</button><button class="filter-btn" data-filter="mine">ของฉัน 3</button><button class="filter-btn" data-filter="unclaimed">รอรับเรื่อง 4</button></div><input class="case-search" id="case-search" type="search" aria-label="ค้นหาเลขคำขอ" placeholder="ค้นหาเลขคำขอ…"></div><div class="table-region" tabindex="0" role="region" aria-label="คิวงานเลื่อนแนวนอนได้"><table class="requests-table"><thead><tr><th>คำขอ / บริการ</th><th>ระดับ SLA</th><th>กำหนดเสร็จ</th><th>ผู้ถือเรื่อง</th><th></th></tr></thead><tbody id="queue-rows"></tbody></table></div><div class="table-note"><span id="queue-count"></span><span>ข้อมูลชุดตัวอย่าง</span></div></section>`;
  }
  function bottomNote() {
    return `<div class="bottom-note"><span>${ui('check')} ทุกเรื่องราวของคำขอ ตรวจสอบย้อนกลับได้</span><span>ข้อมูลตัวอย่าง · 1 ธันวาคม 2569 09:00 น.</span></div>`;
  }
  function render() {
    filter='all'; query='';
    $('#app').innerHTML=sidebar()+`<section class="app-content" aria-label="ตัวอย่างหน้าจอ ${screen==='citizen'?'ประชาชน':'เจ้าหน้าที่'}">${hero()}<div class="app-dashboard">${overview()}${todos()}${town()}${screen==='citizen'?servicePanel()+journey()+requests():queue()+`<div class="staff-aside">${journey()}<div class="staff-note">${art('counter')}<span>หนึ่งเรื่อง มีผู้ถือเรื่องคนเดียว<br>รับงานใหม่ได้สูงสุด 10 เรื่อง</span></div></div>`}${bottomNote()}</div></section>`;
    all('[data-screen]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.screen===screen)));
    if(screen==='citizen') renderCalendar(); else renderRows();
    window.CivicMotion.mount($('#app'));
  }
  function renderCalendar() {
    if(!$('#calendar-grid'))return;
    const monthNames=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    $('#calendar-label').textContent=`${monthNames[calendarMonth]} ${calendarYear+543}`;
    const first=(new Date(calendarYear,calendarMonth,1).getDay()+6)%7;
    const days=new Date(calendarYear,calendarMonth+1,0).getDate();
    $('#calendar-grid').innerHTML=['จ','อ','พ','พฤ','ศ','ส','อา'].map(d=>`<span>${d}</span>`).join('')+Array.from({length:first},()=>'<span></span>').join('')+Array.from({length:days},(_,i)=>{const day=i+1,seed=calendarYear===2026&&calendarMonth===11;return `<button data-day="${day}" class="${seed&&day===1?'today':''} ${seed&&day===4?'deadline':''}" aria-label="${day} ${monthNames[calendarMonth]} ${calendarYear+543}${seed&&day===1?' วันนี้':seed&&day===4?' กำหนดแก้ไขเอกสาร':''}">${day}</button>`}).join('');
  }
  function renderRows() {
    const matched=cases.filter(c=>(filter==='all'||filter==='mine'&&c.mine||filter==='unclaimed'&&c.unclaimed)&&c.id.toLowerCase().includes(query.trim().toLowerCase()));
    $('#queue-rows').innerHTML=matched.length?matched.map(c=>`<tr><td><div class="request-info">${art('certificate')}<div><b title="${c.id}">…${c.id.slice(-6)}</b><small>${c.service}</small></div></div></td><td><span class="badge ${c.color}">${c.level}</span></td><td>${c.due}</td><td>${c.owner}</td><td><button class="table-action" data-case="${c.id}" aria-label="เปิดคำขอ ${c.id}">เปิด ↗</button></td></tr>`).join(''):'<tr><td colspan="5" class="queue-empty">ไม่พบคำขอในชุดตัวอย่างนี้</td></tr>';
    $('#queue-count').textContent=query?`ผลในตัวอย่าง ${matched.length} รายการ`:`แสดงตัวอย่าง ${matched.length} จาก ${{all:17,mine:3,unclaimed:4}[filter]} รายการ`;
    all('button[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter))});
  }
  function go(id) {
    const el=$('#'+id);
    if(!el)return;
    el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'center'});
  }
  function action(id) {
    if(id==='fix')show('แก้ไขเอกสารคำขอ','EG-2569-000017\nส่งเอกสารแก้ไขก่อน 4 ธ.ค. 2569 เวลา 14:00 น. ภายใน 168 ชั่วโมงนับจากเวลาตีกลับ\nเมื่อส่งกลับ ระบบคืนเรื่องให้ผู้ถือเดิม','certificate');
    if(id==='cases')go('requests');
    if(id==='alerts')show('การแจ้งเตือนของคุณ','EG-2569-000024 และ EG-2569-000022 ใกล้ครบกำหนด\nEG-2569-000020 เกินกำหนด','folder');
    if(id==='guide')show('เริ่มต้นที่บ้าน จบด้วยเอกสาร','1. เลือกบริการที่ต้องการ\n2. กรอกข้อมูลและแนบเอกสาร\n3. ชำระค่าธรรมเนียมเพื่อรับเลขคำขอ\n4. ติดตามการตรวจพิจารณา\n5. ดาวน์โหลดเอกสารและตรวจสอบรหัส','building');
    if(id==='journey')show('เส้นทางของหนึ่งคำขอ','บ้านของคุณ → ยื่นข้อมูลและเอกสาร → ชำระค่าธรรมเนียม\nสำนักงานทะเบียน → ตรวจเอกสารและดำเนินการตามบริการ\nพิจารณาอนุมัติ → ออกเอกสาร → ดาวน์โหลดและตรวจสอบ\n\nภาพเอกสาร จุดบริการ และตรารับรอง ช่วยบอกว่าแต่ละขั้นกำลังทำอะไร','counter');
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b)return;
    if(b.dataset.screen){screen=b.dataset.screen;render();return}
    if(b.dataset.service){const s=services.find(s=>s.id===b.dataset.service);show(s.name,s.detail+'\n\nเริ่มยื่น: กรอกข้อมูล → แนบเอกสาร → ชำระเงิน',s.art)}
    if(b.dataset.action)action(b.dataset.action);
    if(b.dataset.case){const c=cases.find(c=>c.id===b.dataset.case);show(c.id,`${c.status}\n${c.level} · กำหนด ${c.due}\nผู้ถือเรื่อง: ${c.owner}\n\nหน้ารายละเอียดแสดงเอกสาร เส้นเวลา และปุ่มดำเนินการตามสิทธิ์`,'certificate')}
    if(b.dataset.citizenCase){const id=b.dataset.citizenCase;if(id==='000017')action('fix');else show('EG-2569-'+id,'ติดตามสถานะคำขอ กำหนดเสร็จ ประวัติการดำเนินการ และเอกสารที่เกี่ยวข้อง\nดูข้อมูลได้เฉพาะคำขอของตัวเอง',id==='000011'?'house':'certificate')}
    if(b.dataset.filter){filter=b.dataset.filter;renderRows()}
    if(b.dataset.month){const date=new Date(calendarYear,calendarMonth+Number(b.dataset.month),1);calendarYear=date.getFullYear();calendarMonth=date.getMonth();renderCalendar()}
    if(b.dataset.day){const seed=calendarYear===2026&&calendarMonth===11;show($('#calendar-label').textContent+' · วันที่ '+b.dataset.day,seed&&b.dataset.day==='4'?'กำหนดแก้ไข EG-2569-000017\nก่อนเวลา 14:00 น.':'ปฏิทินประกอบภาพรวมคำขอ\nตัวอย่างนี้เน้นกำหนดแก้ไข 4 ธ.ค. 2569 เวลา 14:00 น.','folder')}
    if(b.dataset.nav){const nav=b.dataset.nav;all('.side-item').forEach(n=>n.classList.toggle('active',n===b));if(nav==='home')go('todos');if(nav==='cases')go('requests');if(nav==='services')go('services');if(nav==='todos')go('todos');if(nav==='journey')go('journey');if(nav==='guide'||nav==='alerts')action(nav);if(nav==='mine'){filter='mine';renderRows();go('requests')}}
  });
  document.addEventListener('input',e=>{if(e.target.id==='case-search'){query=e.target.value;renderRows()}});
  $('#close-dialog').onclick=()=>$('#detail').close();
  $('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
  render();
  window.__CIVIC_STUDY__={variant:'C',status:'selected-direction-prototype',selected:true,screens:2,services:3,cursorTracking:false,source:'TEST-DATA.md',illustrations:['municipal-building','service-counter','certificate','business-permit','house-blueprint','folder','stamp','fees']};
})();
