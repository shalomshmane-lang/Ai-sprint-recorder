(function(){
"use strict";

/* ---------------------------------------------------------------------
   Storage
--------------------------------------------------------------------- */
var STORAGE_KEY = 'retsef_v1';

function seedData(){
  return {
    profile: { name:'', role:'', onboarded:false },
    patients: [
      {
        id:'p1', name:'נועה כהן', room:'חדר 3 · מיטה 2', age:'גיל 4',
        items:[
          {
            id:'i1', patientId:'p1', type:'prescription', status:'pending',
            text:null,
            fields:{ drug:'פרצטמול', dose:'180 מ"ג', route:'פומי', frequency:'כל 6 שעות, לפי הצורך לחום', duration:'', indication:'חום' },
            missing:['duration'],
            time:'06:42', createdAt: Date.now()-1000*60*40
          },
          {
            id:'i2', patientId:'p1', type:'note', status:'pending',
            text:'נשימתית: סטורציה יציבה סביב 96% על O2 זרימה נמוכה, הפרשות מוגברות מהצינורית. המודינמית: לחץ דם תקין, קצב לב 118. נוירולוגית: מגיבה לגירוי, אישונים תקינים ותגובתיים.',
            time:'06:41', createdAt: Date.now()-1000*60*41
          }
        ]
      },
      {
        id:'p2', name:'איתן לוי', room:'חדר 5 · מיטה 1', age:'גיל 7',
        items:[
          {
            id:'i3', patientId:'p2', type:'uncertain', status:'pending',
            text:'המשפחה ביקשה עדכון לגבי הפרוצדורה של מחר, צריך לוודא צום מחצות ולתאם עם הרדמה.',
            time:'07:03', createdAt: Date.now()-1000*60*10
          }
        ]
      },
      {
        id:'p3', name:'מאיה בר', room:'חדר 1 · מיטה 1', age:'גיל 2',
        items:[
          {
            id:'i4', patientId:'p3', type:'note', status:'confirmed',
            text:'שינוי במצב ביום 5: ירידה בדרישת חמצן, הופסקה תמיכה נשימתית לא פולשנית. תיאבון חוזר בהדרגה.',
            time:'אתמול 22:10', createdAt: Date.now()-1000*60*60*14
          }
        ]
      }
    ]
  };
}

function loadData(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seedData();
    var parsed = JSON.parse(raw);
    if(!parsed || !parsed.patients) return seedData();
    return parsed;
  }catch(e){
    return seedData();
  }
}

function saveData(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  catch(e){ /* storage unavailable (private mode / quota) - app still works for this session */ }
}

var db = loadData();

/* ---------------------------------------------------------------------
   Rule-based note/prescription classifier
--------------------------------------------------------------------- */
var DRUGS = ['פרצטמול','אקמול','איבופרופן','נורופן','אמוקסיצילין','אוגמנטין','טאזוצין',
  'מרופנם','ונקומיצין','מורפין','פנטניל','מידזולם','דורמיקום','אדרנלין','נוראדרנלין',
  'דקסמתזון','ונטולין','לזיקס','קלקסן','אומפרזול','זופרן','אונדנסטרון'];

var ROUTES = ['תוך ורידי','דרך הוריד','ורידי','תוך שרירי','תת עורי','דרך הפה','פומי','משאף'];

var INDICATIONS = ['חום','כאב','זיהום','הקאות','בחילה','אי שקט','שיעול','גודש','נפיחות','גירוד'];

var FREQ_RE = /(כל\s*\d+\s*שעות|פעם ביום|פעמיים ביום|שלוש פעמים ביום|ארבע פעמים ביום|לפי הצורך|\d+\s*פעמים ביום)/;
var DOSE_RE = /(\d+(?:\.\d+)?)\s*(מ"ג\/ק"ג|מ״ג\/ק"ג|מ"ג|מ״ג|מיליגרם|מ"ל|מ״ל|יחידות|מק"ג)/;
var DURATION_RE = /(\d+)\s*(ימים|יום|שבועות|שבוע)\b/;

function findFirst(list, text){
  for(var i=0;i<list.length;i++){ if(text.indexOf(list[i])>-1) return list[i]; }
  return '';
}

function splitSegments(raw){
  var text = (raw||'').trim();
  if(!text) return [];
  var parts = text.split(/[\.\!\?]+|\s+(?:בנוסף|וגם|וכן|עוד דבר|לגבי)\s+/);
  var out = [];
  for(var i=0;i<parts.length;i++){
    var s = parts[i].trim();
    if(s.length>2) out.push(s);
  }
  return out.length ? out : [text];
}

function classifySegment(segment){
  var drug = findFirst(DRUGS, segment);
  var doseMatch = segment.match(DOSE_RE);
  var route = findFirst(ROUTES, segment);
  var freqMatch = segment.match(FREQ_RE);
  var indication = findFirst(INDICATIONS, segment);

  var remainder = freqMatch ? segment.replace(freqMatch[0],'') : segment;
  var durationMatch = remainder.match(DURATION_RE);

  var strongSignal = !!drug || !!doseMatch;
  var weakSignal = !strongSignal && (!!route || !!freqMatch);

  if(strongSignal){
    var fields = {
      drug: drug || '',
      dose: doseMatch ? doseMatch[0] : '',
      route: route || '',
      frequency: freqMatch ? freqMatch[0] : '',
      duration: durationMatch ? durationMatch[0] : '',
      indication: indication || ''
    };
    var missing = [];
    for(var k in fields){ if(!fields[k]) missing.push(k); }
    return { type:'prescription', text:null, fields:fields, missing:missing };
  }
  if(weakSignal){
    return { type:'uncertain', text:segment, fields:null, missing:null };
  }
  return { type:'note', text:segment, fields:null, missing:null };
}

function classifyTranscript(raw){
  var segments = splitSegments(raw);
  return segments.map(classifySegment);
}

/* ---------------------------------------------------------------------
   Helpers
--------------------------------------------------------------------- */
function uid(prefix){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function nowLabel(){
  var t = new Date();
  return String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
}
function getPatient(id){ for(var i=0;i<db.patients.length;i++){ if(db.patients[i].id===id) return db.patients[i]; } return null; }
function findItem(id){
  var found=null;
  db.patients.forEach(function(p){ p.items.forEach(function(i){ if(i.id===id) found=i; }); });
  return found;
}
function pendingCount(p){ var n=0; for(var i=0;i<p.items.length;i++){ if(p.items[i].status==='pending') n++; } return n; }
function pendingRx(p){ var n=0; for(var i=0;i<p.items.length;i++){ if(p.items[i].status==='pending' && p.items[i].type==='prescription') n++; } return n; }
function totalPending(){ var n=0; db.patients.forEach(function(p){ n+=pendingCount(p); }); return n; }
function initials(name){ return name.split(' ').map(function(w){return w[0];}).join(''); }
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

/* ---------------------------------------------------------------------
   Speech support / mic permission detection
--------------------------------------------------------------------- */
var SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition || null;
var recognitionSupported = !!SpeechRecognitionAPI;
var micPermission = 'unknown'; // unknown | granted | denied
var recognition = null;
var finalTranscript = '';
var recognitionActive = false;

/* ---------------------------------------------------------------------
   Session (non-persisted) state
--------------------------------------------------------------------- */
var state = {
  screen: db.profile.onboarded ? 'home' : 'onboard-1',
  scanValid:false,
  activePatientId:null,
  toast:null,
  editingItemId:null,
  editBuffer:null,
  newItemIds:[],
  recDenied:false,
  useManualEntry:!recognitionSupported,
  manualText:''
};

/* ---------------------------------------------------------------------
   Icons
--------------------------------------------------------------------- */
function iconMic(){ return '&#127908;'; }
function iconNfc(){ return '&#128246;'; }
function iconBg(){ return '&#8635;'; }
function iconBell(){ return '&#128276;'; }

function statusbar(){ return '<div class="statusbar"><span>'+nowLabel()+'</span><span class="icons">׀׀׀ · 82%</span></div>'; }
function bgpill(){ return '<div class="bgpill"><span class="dot"></span>פעיל ברקע</div>'; }

/* ---------------------------------------------------------------------
   Screens: onboarding
--------------------------------------------------------------------- */
function screenOnboard1(){
  return statusbar() + '<div class="screenbody">'
    + '<div class="center-flow" style="height:100%;">'
    + '<div style="font-family:var(--font-display); font-weight:700; font-size:26px; color:var(--accent);">רצף</div>'
    + '<div class="app-sub" style="max-width:26ch;">תחילת משמרת. הפרטים נשמרים במכשיר הזה בלבד.</div>'
    + '<div class="field" style="width:100%;"><label>שם מלא</label><input id="onb-name" value="'+esc(db.profile.name)+'" placeholder="לדוגמה: ד״ר טל אבני"></div>'
    + '<div class="field" style="width:100%;"><label>תפקיד</label><select id="onb-role">'
      + ['רופא/ה מתמחה','רופא/ה בכיר/ה','אח/ות'].map(function(r){
          return '<option '+(db.profile.role===r?'selected':'')+'>'+r+'</option>';
        }).join('')
    + '</select></div>'
    + '<button class="btn btn-primary btn-block" data-action="onboard1-continue">המשך להרשאות</button>'
    + '</div></div>';
}

function screenOnboard2(){
  var micRow;
  if(micPermission==='granted'){
    micRow = permRow(iconMic(),'מיקרופון','אושר', 'ok');
  } else if(micPermission==='denied'){
    micRow = permRow(iconMic(),'מיקרופון','נדחה — ההקלטה תעבוד במצב הקלדה ידנית', 'bad');
  } else {
    micRow = permRow(iconMic(),'מיקרופון','נדרש אישור כדי לתמלל הערות קוליות', 'pending');
  }
  var speechNote = recognitionSupported
    ? ''
    : '<div class="infobanner">&#9888; הדפדפן הזה לא תומך בזיהוי דיבור אוטומטי. אפשר להמשיך — תמלול הערות יתבצע בהקלדה ידנית.</div>';

  return statusbar() + '<div class="screenbody">'
    + '<div class="app-title">הרשאות למשמרת</div>'
    + '<div class="app-sub">כדי שההקלטה תעבוד נדרשות ההרשאות הבאות. בטלפון אמיתי הפעולה ברקע דורשת אפליקציה נייטיבית — כאן ההקלטה פועלת כשהאפליקציה פתוחה.</div>'
    + micRow
    + permRow(iconNfc(),'קורא NFC','מדומה בפרוטוטייפ הזה', 'pending')
    + permRow(iconBg(),'פעולה ברקע','מוגבל בדפדפן — עובד כל עוד האפליקציה פתוחה', 'pending')
    + permRow(iconBell(),'התראות','לעדכון על הערות ממתינות (מדומה)', 'pending')
    + speechNote
    + '<div style="flex:1"></div>'
    + (micPermission==='unknown'
        ? '<button class="btn btn-primary btn-block" data-action="request-mic">בקש הרשאת מיקרופון</button>'
          + '<button class="btn btn-ghost btn-block" data-action="go:onboard-3">דלג בינתיים</button>'
        : '<button class="btn btn-primary btn-block" data-action="go:onboard-3">המשך</button>')
    + '</div>';
}
function permRow(ic,title,sub,statusCls){
  var mark = statusCls==='ok' ? '&#10003;' : (statusCls==='bad' ? '&#10005;' : '&#8230;');
  return '<div class="permrow"><div class="ic">'+ic+'</div><div class="tx"><b>'+title+'</b><span>'+sub+'</span></div><div class="check '+(statusCls==='ok'?'':(statusCls==='bad'?'bad':'pending'))+'">'+mark+'</div></div>';
}

function screenOnboard3(){
  return statusbar() + '<div class="screenbody">'
    + '<div class="center-flow" style="height:100%;">'
    + '<div class="check" style="width:64px; height:64px; font-size:28px;">&#10003;</div>'
    + '<div class="app-title">המשמרת פעילה</div>'
    + '<div class="app-sub" style="max-width:26ch;">'+esc(db.profile.name||'המשתמש/ת')+', '+esc(db.profile.role||'')+'. אפשר להתחיל.</div>'
    + '<button class="btn btn-primary btn-block" style="margin-top:10px;" data-action="onboard3-finish">כניסה לרשימת המטופלים</button>'
    + '</div></div>';
}

/* ---------------------------------------------------------------------
   Screens: home
--------------------------------------------------------------------- */
function screenHome(){
  var rows = db.patients.map(function(p){
    var c = pendingCount(p), rx = pendingRx(p);
    var badge = c===0 ? '<span class="badge zero">0</span>' : '<span class="badge '+(rx>0?'rx':'')+'">'+c+'</span>';
    return '<div class="patientcard" data-action="go:review">'
      + '<div class="avatar">'+initials(p.name)+'</div>'
      + '<div class="pinfo"><div class="pname">'+esc(p.name)+'</div><div class="pmeta">'+esc(p.room)+' · '+esc(p.age)+'</div></div>'
      + badge + '</div>';
  }).join('');

  return statusbar()
    + '<div class="screenbody" style="padding-bottom:150px;">'
    + '<div style="display:flex; justify-content:space-between; align-items:center;">'
    + '<div><div class="app-title">המשמרת שלי</div><div class="app-sub">'+esc(db.profile.name||'')+' · '+db.patients.length+' מטופלים</div></div>'
    + bgpill()
    + '</div>'
    + '<div class="section-label">מטופלים פעילים</div>'
    + rows
    + '<div class="section-label" style="margin-top:6px;">שיוך מטופל חדש</div>'
    + '<button class="btn btn-outline btn-block" data-action="go:nfc-scan">'+iconNfc()+'&nbsp; סרוק תג NFC</button>'
    + '</div>'
    + fab(false)
    + bottomnav('home');
}

function fab(active){
  var hint = active
    ? '<div class="fab-hint">מוכן להקלטה עבור '+(getPatient(state.activePatientId)?esc(getPatient(state.activePatientId).name):'')+'</div>'
    : '<div class="fab-hint">לחיצה כפולה + החזק לשחרור</div>';
  return hint + '<button class="fab '+(active?'':'inactive')+'" data-action="pressrecord">'+iconMic()+'</button>';
}

function bottomnav(active){
  var tp = totalPending();
  return '<div class="bottomnav">'
    + '<button class="navbtn '+(active==='home'?'active':'')+'" data-action="go:home">&#127968;<span>בית</span></button>'
    + '<button class="navbtn '+(active==='review'?'active':'')+'" data-action="go:review">'
    + (tp>0 ? '<span class="navbadge">'+tp+'</span>' : '')
    + '&#128203;<span>לאישור</span></button>'
    + '</div>';
}

/* ---------------------------------------------------------------------
   Screens: NFC
--------------------------------------------------------------------- */
function screenNfcScan(){
  var chips = db.patients.map(function(t){
    return '<button class="chipbtn" data-action="scanpatient:'+t.id+'"><div class="avatar" style="width:32px;height:32px;font-size:12px;">'+initials(t.name)+'</div><div style="flex:1;"><div style="font-weight:700; font-size:13px;">'+esc(t.name)+'</div><div style="font-size:11px; color:var(--ink-soft);">'+esc(t.room)+'</div></div><span style="color:var(--ink-faint);">'+iconNfc()+'</span></button>';
  }).join('');
  return statusbar() + '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="scan-ring">'+iconNfc()+'</div>'
    + '<div class="app-title">קרב תג NFC של המטופל</div>'
    + '<div class="app-sub" style="max-width:28ch;">חומרת NFC אמיתית זמינה רק ב-Android Chrome עם שבב פיזי. בפרוטוטייפ: בחר/י את המטופל.</div>'
    + '<div style="width:100%; display:flex; flex-direction:column; gap:8px; margin-top:4px;">'+chips+'</div>'
    + '<button class="btn btn-ghost btn-block" data-action="go:home">ביטול</button>'
    + '</div></div>';
}

function screenNfcSuccess(){
  var p = getPatient(state.activePatientId);
  if(!p) return screenHome();
  return statusbar() + '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="scan-ring success">&#10003;</div>'
    + '<div class="app-title">שויך: '+esc(p.name)+'</div>'
    + '<div class="app-sub" style="max-width:26ch;">הסריקה תקפה להקלטה אחת בלבד. אפשר להכתיב כמה הערות ומרשמים ברצף — המערכת תפצל ותסווג אותם.</div>'
    + '<button class="btn btn-primary btn-block" data-action="pressrecord">'+iconMic()+'&nbsp; התחל הקלטה עכשיו</button>'
    + '<button class="btn btn-ghost btn-block" data-action="go:home">חזרה לרשימה, אקליט מאוחר יותר</button>'
    + '</div></div>';
}

/* ---------------------------------------------------------------------
   Screens: recording
--------------------------------------------------------------------- */
function screenRecordWarning(){
  return statusbar() + '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="warnbanner" style="text-align:center; flex-direction:column; align-items:center;">'
    + '<div class="buzzicon">!</div>'
    + '<div><b>לא זוהתה סריקת מטופל תקפה</b>יש לסרוק את תג ה-NFC של המטופל לפני ההקלטה, כדי שההערה תשויך נכון.</div>'
    + '</div>'
    + '<button class="btn btn-primary btn-block" data-action="go:nfc-scan">'+iconNfc()+'&nbsp; סרוק עכשיו</button>'
    + '<button class="btn btn-ghost btn-block" data-action="go:home">ביטול ההקלטה</button>'
    + '</div></div>';
}

function screenRecording(){
  var p = getPatient(state.activePatientId);
  if(!p) return screenHome();

  if(state.useManualEntry){
    return statusbar() + '<div class="screenbody">'
      + '<div class="app-title">'+esc(p.name)+'</div>'
      + '<div class="app-sub">'+esc(p.room)+' · הדפדפן לא תומך בזיהוי דיבור, או שהמיקרופון נחסם — הקלד/י את תוכן ההקלטה</div>'
      + '<div class="field"><textarea id="manual-transcript" placeholder="לדוגמה: תרשום פרצטמול 180 מיליגרם פומי כל 6 שעות לפי הצורך לחום. בנוסף, נשימתית יציבה, סטורציה 96 אחוז.">'+esc(state.manualText)+'</textarea></div>'
      + '<button class="btn btn-primary btn-block" data-action="submit-manual">שלח לסיווג</button>'
      + '<button class="btn btn-ghost btn-block" data-action="go:home">ביטול</button>'
      + '</div>';
  }

  return statusbar() + '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="badge" id="rec-indicator" style="background:var(--ink-faint); padding:0 12px; height:24px; border-radius:100px; font-size:11px;">&#9679; לחץ והחזק כדי להקליט</div>'
    + '<div class="app-title">'+esc(p.name)+'</div>'
    + '<div class="app-sub">'+esc(p.room)+'</div>'
    + '<button class="mic-btn" id="mic-btn">'+iconMic()+'</button>'
    + '<div class="live-transcript empty" id="live-transcript">התמלול יופיע כאן תוך כדי הדיבור…</div>'
    + '<div class="app-sub" style="max-width:26ch;">לחץ והחזק על המיקרופון כדי להקליט, שחרר לסיום.</div>'
    + '<button class="btn btn-ghost btn-block" data-action="go:home">ביטול</button>'
    + '</div></div>';
}

function screenProcessing(){
  return statusbar() + '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="scan-ring">&#9203;</div>'
    + '<div class="app-title">מסווג…</div>'
    + '<div class="app-sub">מפריד בין הערות למרשמים, ומזהה שדות חסרים במרשמים.</div>'
    + '</div></div>';
}

/* ---------------------------------------------------------------------
   Item rendering (used on review screen)
--------------------------------------------------------------------- */
function itemHtml(it){
  var isNew = state.newItemIds.indexOf(it.id) > -1;
  var cls = 'item';
  if(it.type==='prescription') cls += ' rx';
  if(it.type==='uncertain') cls += ' uncertain';
  if(isNew) cls += ' new';
  if(it.status==='confirmed') cls += ' confirmed';

  var pillHtml, bodyHtml, actionsHtml;

  if(it.type==='uncertain'){
    pillHtml = '<span class="typepill uncertain">&#9888; סיווג לא ודאי</span>';
    bodyHtml = '<div class="item-text">'+esc(it.text)+'</div>';
    actionsHtml = it.status==='confirmed'
      ? '<div class="rxnote" style="color:var(--ok);">&#10003; טופל</div>'
      : '<div class="uncertain-choice">'
        + '<button class="btn btn-outline btn-sm" data-action="classify:'+it.id+':note">סמן כהערה</button>'
        + '<button class="btn btn-outline btn-sm" data-action="classify:'+it.id+':prescription">סמן כמרשם</button>'
        + '</div>';
  } else if(it.type==='prescription'){
    pillHtml = '<span class="typepill rx">&#8478; מרשם</span>';
    var f = it.fields || {};
    var missing = it.missing || [];
    var fld = function(key,label){
      var isMissing = missing.indexOf(key)>-1;
      var val = f[key] || (isMissing ? 'נדרשת השלמה' : '');
      return '<div class="rxfield '+(isMissing?'missing':'')+'"><span class="flabel">'+label+'</span><span class="fval">'+esc(val)+'</span></div>';
    };
    bodyHtml = '<div class="rxgrid">'
      + fld('drug','תרופה') + fld('dose','מינון')
      + fld('route','נתיב מתן') + fld('frequency','תדירות')
      + fld('duration','משך טיפול') + fld('indication','אינדיקציה')
      + '</div>';
    var canConfirm = missing.length === 0 || it.status==='confirmed';
    actionsHtml = it.status==='confirmed'
      ? '<div class="rxnote" style="color:var(--ok);">&#10003; אושר ונשמר</div>'
      : '<div class="item-actions">'
        + '<button class="btn btn-outline btn-sm" data-action="edit:'+it.id+'">ערוך</button>'
        + '<button class="btn '+(canConfirm?'btn-primary':'btn-ghost')+' btn-sm" '+(canConfirm?'':'title="יש להשלים שדות חסרים לפני אישור"')+' data-action="'+(canConfirm?('confirm:'+it.id):'edit:'+it.id)+'">'+(canConfirm?'אשר ושמור':'השלם שדות')+'</button>'
        + '</div>';
  } else {
    pillHtml = '<span class="typepill note">הערה</span>';
    bodyHtml = '<div class="item-text">'+esc(it.text)+'</div>';
    actionsHtml = it.status==='confirmed'
      ? '<div class="rxnote" style="color:var(--ok);">&#10003; תויק</div>'
      : '<div class="item-actions">'
        + '<button class="btn btn-outline btn-sm" data-action="edit:'+it.id+'">ערוך</button>'
        + '<button class="btn btn-ghost btn-sm" data-action="reject:'+it.id+'">דחה</button>'
        + '<button class="btn btn-primary btn-sm" data-action="confirm:'+it.id+'">אשר לתיוק</button>'
        + '</div>';
  }

  return '<div class="'+cls+'">'
    + '<div class="item-top">'+pillHtml+'<span class="item-time">'+esc(it.time)+'</span></div>'
    + bodyHtml + actionsHtml
    + '</div>';
}

/* ---------------------------------------------------------------------
   Screens: review + edit
--------------------------------------------------------------------- */
function screenReview(){
  var blocks = db.patients.map(function(p){
    var pending = p.items.filter(function(i){return i.status==='pending';});
    var recentConfirmed = p.items.filter(function(i){return i.status==='confirmed';})
      .sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); }).slice(0,1);
    var shown = pending.concat(recentConfirmed);
    if(shown.length===0) return '';
    var sorted = shown.slice().sort(function(a,b){
      var rank = function(i){ return i.status==='confirmed' ? 3 : (i.type==='prescription'?0:(i.type==='uncertain'?1:2)); };
      return rank(a)-rank(b);
    });
    var itemsHtml = sorted.map(itemHtml).join('');
    return '<div class="patientblock">'
      + '<div class="patientblock-head"><div class="avatar" style="width:28px;height:28px;font-size:11px;">'+initials(p.name)+'</div><div><div class="pname">'+esc(p.name)+'</div><div class="pmeta">'+esc(p.room)+'</div></div></div>'
      + '<div class="patientblock-items">'+itemsHtml+'</div>'
      + '</div>';
  }).join('');

  if(!blocks.replace(/\s/g,'')) blocks = '<div class="empty">אין פריטים ממתינים כרגע</div>';

  var toastHtml = state.toast ? '<div class="toast">'+esc(state.toast)+'</div>' : '';

  return statusbar() + toastHtml + '<div class="screenbody" style="padding-bottom:70px;">'
    + '<div class="app-title">לאישור</div>'
    + '<div class="app-sub">מקובץ לפי מטופל · מרשמים תמיד למעלה בכל בלוק</div>'
    + blocks
    + '</div>'
    + bottomnav('review');
}

function screenEdit(){
  var it = findItem(state.editingItemId);
  if(!it) return screenReview();
  var eb = state.editBuffer;

  var body;
  if(it.type==='prescription'){
    body = '<div class="field-row">'
      + fieldInput('drug','תרופה', eb.fields.drug)
      + fieldInput('dose','מינון', eb.fields.dose)
      + '</div>'
      + '<div class="field-row">'
      + fieldInput('route','נתיב מתן', eb.fields.route)
      + fieldInput('frequency','תדירות', eb.fields.frequency)
      + '</div>'
      + '<div class="field-row">'
      + fieldInput('duration','משך טיפול', eb.fields.duration, (eb.missing||[]).indexOf('duration')>-1)
      + fieldInput('indication','אינדיקציה', eb.fields.indication, (eb.missing||[]).indexOf('indication')>-1)
      + '</div>';
  } else {
    body = '<div class="field"><label>תוכן ההערה</label><textarea id="edit-text">'+esc(eb.text||'')+'</textarea></div>';
  }

  return '<div class="modal-overlay" data-action="closeedit"><div class="modal" onclick="event.stopPropagation()">'
    + '<div class="modal-handle"></div>'
    + '<div class="app-title">עריכה לפני אישור</div>'
    + body
    + '<div class="modal-actions">'
    + '<button class="btn btn-ghost" data-action="closeedit">ביטול</button>'
    + '<button class="btn btn-primary" data-action="savedit">שמור</button>'
    + '</div>'
    + '</div></div>';
}
function fieldInput(key,label,val,isMissing){
  return '<div class="field"><label>'+label+'</label>'
    + '<input class="'+(isMissing?'missing':'')+'" data-key="'+key+'" value="'+esc(val)+'">'
    + (isMissing ? '<span class="fieldnote">שדה חובה להשלמה לפני אישור</span>' : '')
    + '</div>';
}

/* ---------------------------------------------------------------------
   Router
--------------------------------------------------------------------- */
function screenFor(id){
  if(id==='onboard-1') return screenOnboard1();
  if(id==='onboard-2') return screenOnboard2();
  if(id==='onboard-3') return screenOnboard3();
  if(id==='home') return screenHome();
  if(id==='nfc-scan') return screenNfcScan();
  if(id==='nfc-success') return screenNfcSuccess();
  if(id==='record-warning') return screenRecordWarning();
  if(id==='recording') return screenRecording();
  if(id==='processing') return screenProcessing();
  if(id==='review') return screenReview();
  return screenHome();
}

function render(){
  stopRecognitionIfActive();
  var el = document.getElementById('screen');
  el.innerHTML = screenFor(state.screen);
  if(state.editingItemId){
    var wrap = document.createElement('div');
    wrap.innerHTML = screenEdit();
    el.appendChild(wrap.firstChild);
  }
  bind();
  if(state.screen==='recording' && !state.useManualEntry){
    wireMicButton();
  }
}

/* ---------------------------------------------------------------------
   Event binding
--------------------------------------------------------------------- */
function bind(){
  var root = document.getElementById('screen');
  Array.prototype.forEach.call(root.querySelectorAll('[data-action]'), function(el){
    el.addEventListener('click', function(){
      handleAction(el.getAttribute('data-action'));
    });
  });
  var editFields = root.querySelectorAll('.field input[data-key]');
  Array.prototype.forEach.call(editFields, function(input){
    input.addEventListener('input', function(){
      if(state.editBuffer && state.editBuffer.fields){
        state.editBuffer.fields[input.getAttribute('data-key')] = input.value;
      }
    });
  });
  var editText = root.querySelector('#edit-text');
  if(editText){
    editText.addEventListener('input', function(){
      if(state.editBuffer) state.editBuffer.text = editText.value;
    });
  }
  var manualBox = root.querySelector('#manual-transcript');
  if(manualBox){
    manualBox.addEventListener('input', function(){ state.manualText = manualBox.value; });
  }
}

function handleAction(action){
  var parts = action.split(':');
  var cmd = parts[0], arg1 = parts[1], arg2 = parts[2];

  if(cmd==='onboard1-continue'){
    var nameEl = document.getElementById('onb-name');
    var roleEl = document.getElementById('onb-role');
    db.profile.name = nameEl ? nameEl.value.trim() : db.profile.name;
    db.profile.role = roleEl ? roleEl.value : db.profile.role;
    saveData();
    state.screen = 'onboard-2';
  }

  else if(cmd==='request-mic'){
    requestMicPermission();
    return;
  }

  else if(cmd==='onboard3-finish'){
    db.profile.onboarded = true;
    saveData();
    state.screen = 'home';
  }

  else if(cmd==='go'){
    state.toast = null;
    state.screen = arg1;
  }

  else if(cmd==='scanpatient'){
    state.activePatientId = arg1;
    state.scanValid = true;
    state.screen = 'nfc-success';
  }

  else if(cmd==='pressrecord'){
    if(state.scanValid && state.activePatientId){
      state.manualText = '';
      state.screen = 'recording';
    } else {
      state.screen = 'record-warning';
    }
  }

  else if(cmd==='submit-manual'){
    finishRecording(state.manualText);
    return;
  }

  else if(cmd==='classify'){
    var it = findItem(arg1);
    if(it){
      it.type = arg2;
      if(arg2==='prescription'){
        it.fields = { drug:'', dose:'', route:'', frequency:'', duration:'', indication:'' };
        it.missing = ['drug','dose','route','frequency','duration','indication'];
      }
      saveData();
    }
  }

  else if(cmd==='confirm'){
    var it2 = findItem(arg1);
    if(it2){ it2.status='confirmed'; saveData(); }
    state.toast = 'אושר ותויק בתיק המטופל';
    render();
    setTimeout(function(){ state.toast=null; render(); }, 2000);
    return;
  }

  else if(cmd==='reject'){
    var it3 = findItem(arg1);
    if(it3){ it3.status='confirmed'; it3.text = it3.text + ' (נדחה)'; saveData(); }
  }

  else if(cmd==='edit'){ openEdit(arg1); return; }

  else if(cmd==='closeedit'){ state.editingItemId=null; state.editBuffer=null; }

  else if(cmd==='savedit'){
    var it4 = findItem(state.editingItemId);
    if(it4 && state.editBuffer){
      if(it4.type==='prescription'){
        it4.fields = Object.assign({}, state.editBuffer.fields);
        it4.missing = Object.keys(it4.fields).filter(function(k){ return !it4.fields[k]; });
      } else {
        it4.text = state.editBuffer.text;
      }
      saveData();
    }
    state.editingItemId=null; state.editBuffer=null;
  }

  render();
}

function openEdit(itemId){
  var it = findItem(itemId);
  if(!it) return;
  state.editingItemId = itemId;
  if(it.type==='prescription'){
    state.editBuffer = { fields: Object.assign({}, it.fields), missing: it.missing };
  } else {
    state.editBuffer = { text: it.text };
  }
  render();
}

/* ---------------------------------------------------------------------
   Microphone permission (onboarding)
--------------------------------------------------------------------- */
function requestMicPermission(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    micPermission = 'denied';
    state.screen = 'onboard-2';
    render();
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio:true }).then(function(stream){
    micPermission = 'granted';
    stream.getTracks().forEach(function(t){ t.stop(); });
    state.screen = 'onboard-2';
    render();
  }).catch(function(){
    micPermission = 'denied';
    state.useManualEntry = true;
    state.screen = 'onboard-2';
    render();
  });
}

/* ---------------------------------------------------------------------
   Recording via Web Speech API
--------------------------------------------------------------------- */
function wireMicButton(){
  var btn = document.getElementById('mic-btn');
  if(!btn) return;

  var start = function(ev){
    ev.preventDefault();
    startRecognition();
  };
  var stop = function(ev){
    ev.preventDefault();
    stopRecognitionAndFinish();
  };

  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('pointercancel', stop);
}

function startRecognition(){
  if(!recognitionSupported || recognitionActive) return;
  finalTranscript = '';
  try{
    recognition = new SpeechRecognitionAPI();
    recognition.lang = 'he-IL';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = function(event){
      var interim = '';
      for(var i=event.resultIndex; i<event.results.length; i++){
        var res = event.results[i];
        if(res.isFinal){ finalTranscript += res[0].transcript + ' '; }
        else { interim += res[0].transcript; }
      }
      updateLiveTranscript(finalTranscript, interim);
    };
    recognition.onerror = function(event){
      if(event.error === 'not-allowed' || event.error === 'service-not-allowed'){
        recognitionActive = false;
        state.useManualEntry = true;
        render();
      }
    };
    recognition.onend = function(){
      recognitionActive = false;
    };

    recognition.start();
    recognitionActive = true;
    var indicator = document.getElementById('rec-indicator');
    if(indicator){ indicator.textContent = '● מקליט — שחרר לסיום'; indicator.style.background = 'var(--critical)'; indicator.style.color = '#fff'; }
    var btn = document.getElementById('mic-btn');
    if(btn){ btn.classList.add('live'); }
  }catch(e){
    state.useManualEntry = true;
    render();
  }
}

function updateLiveTranscript(finalText, interimText){
  var el = document.getElementById('live-transcript');
  if(!el) return;
  var text = (finalText + interimText).trim();
  if(!text){
    el.className = 'live-transcript empty';
    el.textContent = 'התמלול יופיע כאן תוך כדי הדיבור…';
    return;
  }
  el.className = 'live-transcript';
  el.innerHTML = esc(finalText) + '<span class="interim">'+esc(interimText)+'</span>';
}

function stopRecognitionIfActive(){
  if(recognition && recognitionActive){
    try{ recognition.stop(); }catch(e){}
  }
}

function stopRecognitionAndFinish(){
  if(!recognition || !recognitionActive){
    if(finalTranscript.trim()){ finishRecording(finalTranscript); }
    return;
  }
  recognition.onend = function(){
    recognitionActive = false;
    finishRecording(finalTranscript);
  };
  try{ recognition.stop(); }catch(e){ finishRecording(finalTranscript); }
}

function finishRecording(rawText){
  state.screen = 'processing';
  render();
  setTimeout(function(){
    var results = classifyTranscript(rawText);
    var newIds = [];
    results.forEach(function(r){
      var item = {
        id: uid('n'),
        patientId: state.activePatientId,
        type: r.type,
        status: 'pending',
        text: r.text,
        fields: r.fields,
        missing: r.missing,
        time: nowLabel(),
        createdAt: Date.now()
      };
      var p = getPatient(state.activePatientId);
      if(p){ p.items.unshift(item); newIds.push(item.id); }
    });
    saveData();
    state.newItemIds = newIds;
    state.scanValid = false;
    state.toast = newIds.length===0
      ? 'לא זוהה תוכן להקלטה'
      : (newIds.length>1 ? (newIds.length+' פריטים חדשים סווגו') : 'פריט חדש סווג');
    state.screen = 'review';
    render();
    setTimeout(function(){ state.toast=null; render(); }, 2600);
  }, 500);
}

/* ---------------------------------------------------------------------
   Boot
--------------------------------------------------------------------- */
render();

})();
