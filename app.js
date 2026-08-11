(function(){
"use strict";

/* ---------------------------------------------------------------------
   Storage
--------------------------------------------------------------------- */
var STORAGE_KEY = 'retsef_v2_en';

function seedData(){
  return {
    profile: { name:'', role:'', onboarded:false },
    patients: [
      {
        id:'p1', name:'Emma Carter', room:'Room 3 · Bed 2', age:'Age 4',
        items:[
          {
            id:'i1', patientId:'p1', type:'prescription', status:'pending',
            text:null,
            fields:{ drug:'Acetaminophen (Tylenol)', dose:'180 mg', route:'Oral', frequency:'Every 6 hours, PRN', duration:'', indication:'Fever' },
            missing:['duration'],
            time:'06:42', createdAt: Date.now()-1000*60*40
          },
          {
            id:'i2', patientId:'p1', type:'note', status:'pending',
            text:'Respiratory: sats stable around 96% on low-flow O2, increased ETT secretions. Hemodynamic: BP normal, HR 118. Neuro: responsive to stimuli, pupils equal and reactive.',
            time:'06:41', createdAt: Date.now()-1000*60*41
          }
        ]
      },
      {
        id:'p2', name:'Ethan Bennett', room:'Room 5 · Bed 1', age:'Age 7',
        items:[
          {
            id:'i3', patientId:'p2', type:'uncertain', status:'pending',
            text:'Family asked for an update on tomorrow’s procedure, need to confirm NPO after midnight and coordinate with anesthesia.',
            time:'07:03', createdAt: Date.now()-1000*60*10
          }
        ]
      },
      {
        id:'p3', name:'Maya Turner', room:'Room 1 · Bed 1', age:'Age 2',
        items:[
          {
            id:'i4', patientId:'p3', type:'note', status:'confirmed',
            text:'Day 5 status change: decreased O2 requirement, non-invasive respiratory support discontinued. Appetite gradually returning.',
            time:'Yesterday 22:10', createdAt: Date.now()-1000*60*60*14
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
var DRUGS = ['acamol','tylenol','acetaminophen','paracetamol','panadol','ibuprofen','advil',
  'nurofen','motrin','amoxicillin','augmentin','tazocin','piperacillin','meropenem',
  'vancomycin','morphine','fentanyl','midazolam','versed','epinephrine','adrenaline',
  'norepinephrine','levophed','dexamethasone','decadron','albuterol','ventolin',
  'furosemide','lasix','ondansetron','zofran','omeprazole','optalgin','dipyrone',
  'ceftriaxone','rocephin'];

var ROUTES = ['iv','intravenous','oral','po','im','intramuscular','subcutaneous','subq',
  'sc','nebulizer','inhaled','topical','rectal','pr'];

var INDICATIONS = ['fever','pain','infection','vomiting','nausea','agitation','cough',
  'congestion','swelling','itching','irritability','sepsis'];

var FREQ_RE = /(every\s*\d+\s*hours?|once a day|twice a day|three times a day|four times (?:a day|daily)|\d+\s*times a day|as needed|prn)/i;
var DOSE_RE = /(\d+(?:\.\d+)?)\s*(mg\/kg|mg|mcg|ml|cc|units?)\b/i;
var DURATION_RE = /(\d+)\s*(days?|weeks?)\b/i;

var UPPER_ABBR = { iv:'IV', im:'IM', po:'PO', pr:'PR', sc:'SC', subq:'SubQ' };
function displayTerm(term){
  if(UPPER_ABBR[term.toLowerCase()]) return UPPER_ABBR[term.toLowerCase()];
  return term.charAt(0).toUpperCase() + term.slice(1);
}
function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function findFirst(list, text){
  for(var i=0;i<list.length;i++){
    var re = new RegExp('\\b'+escapeRegex(list[i])+'\\b','i');
    if(re.test(text)) return displayTerm(list[i]);
  }
  return '';
}

function splitSegments(raw){
  var text = (raw||'').trim();
  if(!text) return [];
  var parts = text.split(/[\.\!\?]+|\s+(?:also|in addition|additionally|and also|one more thing|regarding|plus)\s+/i);
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
      frequency: freqMatch ? displayTerm(freqMatch[0]) : '',
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
var RECOGNITION_LANG = 'en-US';
var micPermission = 'unknown'; // unknown | granted | denied
var recognition = null;
var finalTranscript = '';
var recognitionActive = false;
var recTimerInterval = null;
var recStartedAt = null;

function formatElapsed(ms){
  var totalSec = Math.floor(ms/1000);
  var mm = String(Math.floor(totalSec/60)).padStart(2,'0');
  var ss = String(totalSec%60).padStart(2,'0');
  return mm+':'+ss;
}

function waveformBars(){
  var out = '';
  for(var i=0;i<28;i++){ out += '<span class="wave-bar" style="animation-delay:'+(i*0.07)+'s"></span>'; }
  return out;
}

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
  useManualEntry:!recognitionSupported,
  manualText:'',
  roleDropdownOpen:false
};

/* ---------------------------------------------------------------------
   Icons
--------------------------------------------------------------------- */
function iconMic(){ return '&#127908;'; }
function iconNfc(){ return '&#128246;'; }
function iconBg(){ return '&#8635;'; }
function iconBell(){ return '&#128276;'; }
function iconPerson(){ return '&#128100;'; }
function iconInfo(){ return '&#8505;&#65039;'; }

function bgpill(){ return '<div class="bgpill"><span class="dot"></span>Background active</div>'; }

/* ---------------------------------------------------------------------
   Screens: onboarding
--------------------------------------------------------------------- */
var ROLE_OPTIONS = ['Resident Physician','Attending Physician','Nurse'];

function roleDropdown(){
  var current = db.profile.role || ROLE_OPTIONS[0];
  var open = state.roleDropdownOpen;
  var options = ROLE_OPTIONS.map(function(r, i){
    var selected = r === db.profile.role;
    return '<div class="dropdown-option'+(selected?' selected':'')+'" data-action="select-role:'+i+'">'
      + '<span>'+esc(r)+'</span>'
      + (selected ? '<span class="dropdown-check">&#10003;</span>' : '')
      + '</div>';
  }).join('');
  return '<div class="dropdown'+(open?' open':'')+'">'
    + '<button type="button" class="dropdown-trigger" data-action="toggle-role-dropdown">'
      + '<span>'+esc(current)+'</span>'
      + '<span class="dropdown-arrow"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
    + '</button>'
    + (open ? '<div class="dropdown-list">'+options+'</div>' : '')
    + '</div>';
}

function screenOnboard1(){
  return '<div class="screenbody" style="background:linear-gradient(180deg, var(--accent-soft) 0%, var(--surface) 55%);">'
    + '<div class="center-flow" style="height:100%;">'
    + '<div style="font-family:var(--font-display); font-weight:700; font-size:44px; color:var(--accent);">TapTalk</div>'
    + '<div class="app-sub" style="max-width:32ch;">Tap. Talk. Confirm</div>'
    + '<div class="field" style="width:100%;"><label>Full name</label><input id="onb-name" value="'+esc(db.profile.name)+'" placeholder="e.g. Dr. Sam Rivera"></div>'
    + '<div class="field" style="width:100%;"><label>Role</label>'+roleDropdown()+'</div>'
    + '<button class="btn btn-primary btn-block" data-action="onboard1-continue">Continue to permissions</button>'
    + '</div></div>';
}

function screenOnboard2(){
  var micRow;
  if(micPermission==='granted'){
    micRow = permRow(iconMic(),'Microphone','Granted', 'ok');
  } else if(micPermission==='denied'){
    micRow = permRow(iconMic(),'Microphone','Denied — recording will fall back to manual typing', 'bad');
  } else {
    micRow = permRow(iconMic(),'Microphone','Required to transcribe spoken notes', 'pending');
  }
  var speechNote = recognitionSupported
    ? ''
    : '<div class="infobanner">&#9888; This browser does not support automatic speech recognition. You can continue — recording will use manual typing instead.</div>';

  return '<div class="screenbody">'
    + '<div class="app-title">Permissions for this shift</div>'
    + '<div class="app-sub">Recording needs these permissions. On a real phone, running in the background while locked requires a native app — here, recording works while this app is open.</div>'
    + micRow
    + permRow(iconNfc(),'NFC reader','Simulated in this prototype', 'pending')
    + permRow(iconBg(),'Background activity','Limited in a browser — works while the app stays open', 'pending')
    + permRow(iconBell(),'Notifications','For pending-note alerts (simulated)', 'pending')
    + speechNote
    + '<div style="flex:1"></div>'
    + (micPermission==='unknown'
        ? '<button class="btn btn-primary btn-block" data-action="request-mic">Request microphone access</button>'
          + '<button class="btn btn-ghost btn-block" data-action="go:onboard-3">Skip for now</button>'
        : '<button class="btn btn-primary btn-block" data-action="go:onboard-3">Continue</button>')
    + '</div>';
}
function permRow(ic,title,sub,statusCls){
  var mark = statusCls==='ok' ? '&#10003;' : (statusCls==='bad' ? '&#10005;' : '&#8230;');
  return '<div class="permrow"><div class="ic">'+ic+'</div><div class="tx"><b>'+title+'</b><span>'+sub+'</span></div><div class="check '+(statusCls==='ok'?'':(statusCls==='bad'?'bad':'pending'))+'">'+mark+'</div></div>';
}

function screenOnboard3(){
  return '<div class="screenbody">'
    + '<div class="center-flow" style="height:100%;">'
    + '<div class="check" style="width:64px; height:64px; font-size:28px;">&#10003;</div>'
    + '<div class="app-title">Shift active</div>'
    + '<div class="app-sub" style="max-width:32ch;">'+esc(db.profile.name||'')+', '+esc(db.profile.role||'')+'. Ready to go.</div>'
    + '<button class="btn btn-primary btn-block" style="margin-top:10px;" data-action="onboard3-finish">Go to patient list</button>'
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

  return '<div class="app-header">'
    + '<div><div class="app-title">My Shift</div><div class="app-sub">'+esc(db.profile.name||'')+' · '+db.patients.length+' patients</div></div>'
    + bgpill()
    + '</div>'
    + '<div class="screenbody" style="padding-top:14px;">'
    + '<div class="section-label">Active patients</div>'
    + rows
    + '<div class="section-label" style="margin-top:6px;">Assign new patient</div>'
    + '<button class="btn btn-outline btn-block" data-action="go:nfc-scan">'+iconNfc()+'&nbsp; Scan NFC tag</button>'
    + '<div style="flex:1"></div>'
    + '<button class="linkbtn" data-action="reset-demo" style="align-self:center;">Reset demo data</button>'
    + '</div>'
    + fabRow(false)
    + bottomnav('home');
}

function fabRow(active){
  var hint = active
    ? 'Ready to record for '+(getPatient(state.activePatientId)?esc(getPatient(state.activePatientId).name):'')
    : 'Double-press and hold to record';
  return '<div class="fab-row">'
    + '<button class="fab '+(active?'':'inactive')+'" data-action="pressrecord">'+iconMic()+'</button>'
    + '<div class="fab-hint">'+hint+'</div>'
    + '</div>';
}

function iconHomeNav(){
  return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M4 11.5L12 4l8 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v8.5a1 1 0 0 0 1 1h3.5v-5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v5H17a1 1 0 0 0 1-1V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function iconReviewNav(){
  return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none"><rect x="5.5" y="4.5" width="13" height="16" rx="2.2" stroke="currentColor" stroke-width="1.8"/><path d="M9 4.5h6a1 1 0 0 1 1 1V7a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12.5l2 2 4-4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function bottomnav(active){
  var tp = totalPending();
  return '<div class="bottomnav">'
    + '<button class="navbtn '+(active==='home'?'active':'')+'" data-action="go:home">'+iconHomeNav()+'<span>Home</span></button>'
    + '<button class="navbtn '+(active==='review'?'active':'')+'" data-action="go:review">'
    + (tp>0 ? '<span class="navbadge">'+tp+'</span>' : '')
    + iconReviewNav()+'<span>Review</span></button>'
    + '</div>';
}

/* ---------------------------------------------------------------------
   Screens: NFC
--------------------------------------------------------------------- */
function screenNfcScan(){
  var chips = db.patients.map(function(t){
    return '<button class="chipbtn" data-action="scanpatient:'+t.id+'"><div class="avatar" style="width:32px;height:32px;font-size:12px;">'+initials(t.name)+'</div><div style="flex:1;"><div style="font-weight:600; font-size:16px;">'+esc(t.name)+'</div><div style="font-size:12px; color:var(--ink-soft);">'+esc(t.room)+'</div></div><span style="color:var(--ink-faint);">'+iconNfc()+'</span></button>';
  }).join('');
  return '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="scan-ring">'+iconNfc()+'</div>'
    + '<div class="app-title">Tap the patient’s NFC tag</div>'
    + '<div class="app-sub" style="max-width:32ch;">Real NFC only works on Android Chrome with a physical tag. In this prototype: pick the patient below.</div>'
    + '<div style="width:100%; display:flex; flex-direction:column; gap:8px; margin-top:4px;">'+chips+'</div>'
    + '<button class="btn btn-ghost btn-block" data-action="go:home">Cancel</button>'
    + '</div></div>';
}

function screenNfcSuccess(){
  var p = getPatient(state.activePatientId);
  if(!p) return screenHome();
  return '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="scan-ring success">&#10003;</div>'
    + '<div class="app-title">Linked: '+esc(p.name)+'</div>'
    + '<div class="app-sub" style="max-width:32ch;">This scan is valid for one recording. You can dictate several notes and prescriptions in one go — the app will split and classify them.</div>'
    + '<button class="btn btn-primary btn-block" data-action="pressrecord">'+iconMic()+'&nbsp; Start recording now</button>'
    + '<button class="btn btn-ghost btn-block" data-action="go:home">Back to list, record later</button>'
    + '</div></div>';
}

/* ---------------------------------------------------------------------
   Screens: recording
--------------------------------------------------------------------- */
function screenRecordWarning(){
  return '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="warnbanner" style="text-align:center; flex-direction:column; align-items:center;">'
    + '<div class="buzzicon">!</div>'
    + '<div><b>No valid patient scan detected</b>Scan the patient’s NFC tag before recording, so the note gets linked correctly.</div>'
    + '</div>'
    + '<button class="btn btn-primary btn-block" data-action="go:nfc-scan">'+iconNfc()+'&nbsp; Scan now</button>'
    + '<button class="btn btn-ghost btn-block" data-action="go:home">Cancel recording</button>'
    + '</div></div>';
}

function screenRecording(){
  var p = getPatient(state.activePatientId);
  if(!p) return screenHome();

  if(state.useManualEntry){
    return '<div class="screenbody">'
      + '<div class="app-title">'+esc(p.name)+'</div>'
      + '<div class="app-sub">'+esc(p.room)+' · Speech recognition isn’t supported here, or the mic was blocked — type the recording content instead</div>'
      + '<div class="field"><textarea id="manual-transcript" placeholder="e.g. Give Tylenol 180 mg oral every 6 hours as needed for fever. Also, respiratory stable, sats 96 percent.">'+esc(state.manualText)+'</textarea></div>'
      + '<button class="btn btn-primary btn-block" data-action="submit-manual">Submit for classification</button>'
      + '<button class="btn btn-ghost btn-block" data-action="go:home">Cancel</button>'
      + '</div>';
  }

  return '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="rec-patientpill">'+iconPerson()+'<span>'+esc(p.name)+' · '+esc(p.room)+'</span></div>'
    + '<div class="rec-status" id="rec-indicator"><span class="rec-dot"></span><span id="rec-status-text">Ready to record</span></div>'
    + '<div class="rec-waveform" id="rec-waveform">'+waveformBars()+'</div>'
    + '<div class="rec-timer" id="rec-timer">00:00</div>'
    + '<button class="mic-btn" id="mic-btn"><span id="mic-icon">'+iconMic()+'</span></button>'
    + '<div class="app-sub" id="rec-hint">Press and hold the microphone to record.</div>'
    + '<div class="ethics-note">'+iconInfo()+' Record only your own voice — avoid capturing conversations with patients or family members.</div>'
    + '<div class="live-transcript empty" id="live-transcript">Transcript will appear here as you speak…</div>'
    + '<button class="btn btn-ghost btn-block" data-action="go:home">Cancel</button>'
    + '</div></div>';
}

function screenProcessing(){
  return '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="scan-ring">&#9203;</div>'
    + '<div class="app-title">Classifying…</div>'
    + '<div class="app-sub">Separating notes from prescriptions, and checking prescriptions for missing fields.</div>'
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
    pillHtml = '<span class="typepill uncertain">&#9888; Unclear classification</span>';
    bodyHtml = '<div class="item-text">'+esc(it.text)+'</div>';
    actionsHtml = it.status==='confirmed'
      ? '<div class="rxnote" style="color:var(--ok);">&#10003; Handled</div>'
      : '<div class="uncertain-choice">'
        + '<button class="btn btn-outline btn-sm" data-action="classify:'+it.id+':note">Mark as note</button>'
        + '<button class="btn btn-outline btn-sm" data-action="classify:'+it.id+':prescription">Mark as prescription</button>'
        + '</div>';
  } else if(it.type==='prescription'){
    pillHtml = '<span class="typepill rx">&#8478; Prescription</span>';
    var f = it.fields || {};
    var missing = it.missing || [];
    var fld = function(key,label){
      var isMissing = missing.indexOf(key)>-1;
      var val = f[key] || (isMissing ? 'Needs completion' : '');
      return '<div class="rxfield '+(isMissing?'missing':'')+'"><span class="flabel">'+label+'</span><span class="fval">'+esc(val)+'</span></div>';
    };
    bodyHtml = '<div class="rxgrid">'
      + fld('drug','Drug') + fld('dose','Dose')
      + fld('route','Route') + fld('frequency','Frequency')
      + fld('duration','Duration') + fld('indication','Indication')
      + '</div>';
    var canConfirm = missing.length === 0 || it.status==='confirmed';
    actionsHtml = it.status==='confirmed'
      ? '<div class="rxnote" style="color:var(--ok);">&#10003; Confirmed and saved</div>'
      : '<div class="item-actions">'
        + '<button class="btn btn-outline btn-sm" data-action="edit:'+it.id+'">Edit</button>'
        + '<button class="btn '+(canConfirm?'btn-primary':'btn-ghost')+' btn-sm" '+(canConfirm?'':'title="Complete the missing fields before confirming"')+' data-action="'+(canConfirm?('confirm:'+it.id):'edit:'+it.id)+'">'+(canConfirm?'Confirm & save':'Complete fields')+'</button>'
        + '</div>';
  } else {
    pillHtml = '<span class="typepill note">Note</span>';
    bodyHtml = '<div class="item-text">'+esc(it.text)+'</div>';
    actionsHtml = it.status==='confirmed'
      ? '<div class="rxnote" style="color:var(--ok);">&#10003; Filed</div>'
      : '<div class="item-actions">'
        + '<button class="btn btn-outline btn-sm" data-action="edit:'+it.id+'">Edit</button>'
        + '<button class="btn btn-ghost btn-sm" data-action="reject:'+it.id+'">Discard</button>'
        + '<button class="btn btn-primary btn-sm" data-action="confirm:'+it.id+'">Confirm & file</button>'
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
      + '<div class="patientblock-head"><div class="avatar" style="width:28px;height:28px;font-size:12px;">'+initials(p.name)+'</div><div><div class="pname">'+esc(p.name)+'</div><div class="pmeta">'+esc(p.room)+'</div></div></div>'
      + '<div class="patientblock-items">'+itemsHtml+'</div>'
      + '</div>';
  }).join('');

  if(!blocks.replace(/\s/g,'')) blocks = '<div class="empty">No pending items right now</div>';

  var toastHtml = state.toast ? '<div class="toast">'+esc(state.toast)+'</div>' : '';

  return '<div class="screenbody">'
    + toastHtml
    + '<div class="app-title">Review</div>'
    + '<div class="app-sub">Grouped by patient · prescriptions always shown first in each block</div>'
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
      + fieldInput('drug','Drug', eb.fields.drug)
      + fieldInput('dose','Dose', eb.fields.dose)
      + '</div>'
      + '<div class="field-row">'
      + fieldInput('route','Route', eb.fields.route)
      + fieldInput('frequency','Frequency', eb.fields.frequency)
      + '</div>'
      + '<div class="field-row">'
      + fieldInput('duration','Duration', eb.fields.duration, (eb.missing||[]).indexOf('duration')>-1)
      + fieldInput('indication','Indication', eb.fields.indication, (eb.missing||[]).indexOf('indication')>-1)
      + '</div>';
  } else {
    body = '<div class="field"><label>Note content</label><textarea id="edit-text">'+esc(eb.text||'')+'</textarea></div>';
  }

  return '<div class="modal-overlay" data-action="closeedit"><div class="modal" onclick="event.stopPropagation()">'
    + '<div class="modal-handle"></div>'
    + '<div class="app-title">Edit before confirming</div>'
    + body
    + '<div class="modal-actions">'
    + '<button class="btn btn-ghost" data-action="closeedit">Cancel</button>'
    + '<button class="btn btn-primary" data-action="savedit">Save</button>'
    + '</div>'
    + '</div></div>';
}
function fieldInput(key,label,val,isMissing){
  return '<div class="field"><label>'+label+'</label>'
    + '<input class="'+(isMissing?'missing':'')+'" data-key="'+key+'" value="'+esc(val)+'">'
    + (isMissing ? '<span class="fieldnote">Required before confirming</span>' : '')
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
  if(state.roleDropdownOpen){
    setTimeout(function(){
      document.addEventListener('click', closeRoleDropdownOnOutsideClick, {once:true});
    }, 0);
  }
}

function closeRoleDropdownOnOutsideClick(e){
  var dd = document.querySelector('.dropdown');
  if(dd && !dd.contains(e.target)){
    state.roleDropdownOpen = false;
    render();
  }
}

function handleAction(action){
  var parts = action.split(':');
  var cmd = parts[0], arg1 = parts[1], arg2 = parts[2];

  if(cmd==='onboard1-continue'){
    var nameEl = document.getElementById('onb-name');
    db.profile.name = nameEl ? nameEl.value.trim() : db.profile.name;
    saveData();
    state.screen = 'onboard-2';
  }

  else if(cmd==='toggle-role-dropdown'){
    state.roleDropdownOpen = !state.roleDropdownOpen;
  }

  else if(cmd==='select-role'){
    db.profile.role = ROLE_OPTIONS[arg1];
    state.roleDropdownOpen = false;
    saveData();
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

  else if(cmd==='reset-demo'){
    if(window.confirm('Reset all demo data (patients, notes, prescriptions)?')){
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
    return;
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
    state.toast = 'Confirmed and filed to the patient record';
    render();
    setTimeout(function(){ state.toast=null; render(); }, 2000);
    return;
  }

  else if(cmd==='reject'){
    var it3 = findItem(arg1);
    if(it3){ it3.status='confirmed'; it3.text = it3.text + ' (discarded)'; saveData(); }
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
    recognition.lang = RECOGNITION_LANG;
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
    if(indicator){ indicator.classList.add('live'); }
    var statusText = document.getElementById('rec-status-text');
    if(statusText){ statusText.textContent = 'Recording'; }
    var hint = document.getElementById('rec-hint');
    if(hint){ hint.textContent = 'Release the microphone to finish.'; }
    var waveform = document.getElementById('rec-waveform');
    if(waveform){ waveform.classList.add('live'); }
    var btn = document.getElementById('mic-btn');
    if(btn){ btn.classList.add('live'); }
    var micIcon = document.getElementById('mic-icon');
    if(micIcon){ micIcon.innerHTML = '<span class="stop-square"></span>'; }

    recStartedAt = Date.now();
    var timerEl = document.getElementById('rec-timer');
    if(timerEl){ timerEl.textContent = '00:00'; }
    if(recTimerInterval) clearInterval(recTimerInterval);
    recTimerInterval = setInterval(function(){
      var t = document.getElementById('rec-timer');
      if(t) t.textContent = formatElapsed(Date.now() - recStartedAt);
    }, 250);
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
    el.textContent = 'Transcript will appear here as you speak…';
    return;
  }
  el.className = 'live-transcript';
  el.innerHTML = esc(finalText) + '<span class="interim">'+esc(interimText)+'</span>';
}

function stopRecognitionIfActive(){
  if(recTimerInterval){ clearInterval(recTimerInterval); recTimerInterval = null; }
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
      ? 'No content detected in the recording'
      : (newIds.length>1 ? (newIds.length+' new items classified') : 'New item classified');
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
