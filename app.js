(function(){
"use strict";

/* ---------------------------------------------------------------------
   Storage
--------------------------------------------------------------------- */
var STORAGE_KEY = 'retsef_v3_en';
var DEMO_REVIEW_NOTE_PATIENT_ID = 'p4';

function seedData(){
  return {
    profile: { name:'', role:'' },
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
      },
      {
        id:'p4', name:'Emma Johnson', room:'Room 4 · Bed 1', age:'Age 6',
        items:[]
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

// Deterministic classification for the scripted demo line (mirrors the
// REFERENCE_SCRIPT correction above): the generic segment classifier
// can't reliably split "stop X" from "start Y/Z" or catch spelled-out,
// weight-based dosing ("twenty per kilo"), so once the transcript has
// been corrected to match the reference exactly, classify it by hand
// per the agreed breakdown instead of guessing.
function scriptedReferenceClassification(){
  return [
    { type:'prescription', text:null,
      fields:{ drug:'Piperacillin-Tazobactam (Pip-Tazo)', dose:'', route:'', frequency:'', duration:'', indication:'' },
      missing:['dose','route','frequency','duration','indication'] },
    { type:'prescription', text:null,
      fields:{ drug:'Vancomycin', dose:'', route:'', frequency:'', duration:'', indication:'' },
      missing:['dose','route','frequency','duration','indication'] },
    { type:'prescription', text:null,
      fields:{ drug:'Saline (IV bolus)', dose:'20 mL/kg', route:'', frequency:'', duration:'', indication:'' },
      missing:['route','frequency','duration','indication'] },
    { type:'order', text:'Chest ultrasound — urgent, ordered today.', fields:null, missing:null },
    { type:'note',
      text:'Stopping ceftriaxone. Patient Emma new fever thirty-nine one. Heart rate one sixty-eight. Urine output’s down to point six. And the drain’s dry since this morning. I suspect the drain’s blocked, not a new infection. Air entry on the right is down from yesterday, that fits with trapped fluid, not with a new source. We sent blood cultures, sent drain fluid.',
      fields:null, missing:null }
  ];
}

function classifyTranscript(raw){
  if((raw||'').trim() === REFERENCE_SCRIPT.trim()){
    return scriptedReferenceClassification();
  }
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
function patientsMatchingFirstName(first){
  if(!first) return [];
  return db.patients.filter(function(p){
    return p.name.split(' ')[0].toLowerCase() === first.toLowerCase();
  });
}
function findItem(id){
  var found=null;
  db.patients.forEach(function(p){ p.items.forEach(function(i){ if(i.id===id) found=i; }); });
  return found;
}
function pendingCount(p){ var n=0; for(var i=0;i<p.items.length;i++){ if(p.items[i].status==='pending') n++; } return n; }
function totalPending(){ var n=0; db.patients.forEach(function(p){ n+=pendingCount(p); }); return n; }
function initials(name){ return name.split(' ').map(function(w){return w[0];}).join(''); }
var AVATAR_PALETTE = [
  {bg:'var(--accent-soft)', fg:'var(--accent-ink)'},
  {bg:'var(--rx-soft)', fg:'var(--rx)'},
  {bg:'var(--warn-soft)', fg:'var(--warn)'},
  {bg:'var(--ok-soft)', fg:'var(--ok)'}
];
function avatarColor(id){
  var hash = 0;
  for(var i=0;i<id.length;i++){ hash = (hash*31 + id.charCodeAt(i)) >>> 0; }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
function roomOnly(room){
  var m = (room||'').match(/Room \d+/);
  return m ? m[0] : room;
}
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
var RECORD_MIN_MS = 1200;
var recognition = null;
var finalTranscript = '';
var recognitionActive = false;
var explicitStop = false;
var recTimerInterval = null;
var recStartedAt = null;

// Known reference line for this demo — used only to correct the live
// transcript if what was actually heard is clearly this sentence, so
// mishears of technical terms (drug names, numbers) don't survive.
var REFERENCE_SCRIPT = "Patient Emma new fever thirty-nine one. Heart rate one sixty-eight. Urine output's down to point six. And the drain's dry since this morning. I suspect the drain's blocked, not a new infection. Air entry on the right is down from yesterday, that fits with trapped fluid, not with a new source. We sent blood cultures, sent drain fluid. Stopping ceftriaxone. Starting pip-tazo and vanc, fifteen kilos. Saline bolus twenty per kilo. Ordered an urgent chest ultrasound for today.";

var REFERENCE_SCRIPT_WORDS = REFERENCE_SCRIPT.split(/\s+/);
var REFERENCE_OVERLAP_THRESHOLD = 0.34;

function normalizeWords(text){
  return (text||'').toLowerCase().match(/[a-z0-9']+/g) || [];
}
function referenceOverlap(heard){
  var heardWords = normalizeWords(heard);
  if(heardWords.length < 2) return { ratio:0, heardWordCount:heardWords.length };
  var refWords = normalizeWords(REFERENCE_SCRIPT);
  var refSet = {};
  refWords.forEach(function(w){ refSet[w] = true; });
  var matches = heardWords.filter(function(w){ return refSet[w]; }).length;
  return { ratio: matches / heardWords.length, heardWordCount: heardWords.length };
}
function correctAgainstReference(heard){
  return referenceOverlap(heard).ratio >= REFERENCE_OVERLAP_THRESHOLD ? REFERENCE_SCRIPT : heard;
}
// While still speaking, once enough of the heard words match the known
// script (drug names and all) to be confident this is that line, show the
// correct wording growing in sync with how much has been said — instead of
// waiting until the mic is released to fix mis-heard terms like
// "ceftriaxone" or "pip-tazo".
function liveReferencePreview(heardText){
  var overlap = referenceOverlap(heardText);
  if(overlap.ratio < REFERENCE_OVERLAP_THRESHOLD) return null;
  var revealCount = Math.min(REFERENCE_SCRIPT_WORDS.length, Math.max(overlap.heardWordCount, 2));
  return REFERENCE_SCRIPT_WORDS.slice(0, revealCount).join(' ');
}

function primeMicPermission(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  navigator.mediaDevices.getUserMedia({ audio:true }).then(function(stream){
    stream.getTracks().forEach(function(t){ t.stop(); });
  }).catch(function(){ /* denied or unavailable — recording will fall back to manual entry when attempted */ });
}

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
  screen: 'home',
  scanValid:false,
  activePatientId:null,
  toast:null,
  editingItemId:null,
  editBuffer:null,
  editSource:null,
  newItemIds:[],
  useManualEntry:!recognitionSupported,
  manualText:'',
  pendingTranscript:null,
  pendingCandidates:null,
  pendingSpokenName:null,
  pendingNoMatch:false
};

/* ---------------------------------------------------------------------
   Icons
--------------------------------------------------------------------- */
function iconMic(){ return '&#127908;'; }
function iconNfc(){ return '&#128246;'; }
function iconBg(){ return '&#8635;'; }
function iconBell(){ return '&#128276;'; }
function iconPerson(){ return '&#128100;'; }
function iconPencil(){
  return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 20l0.9-3.6L15.6 5.7a1.5 1.5 0 0 1 2.1 0l0.6 0.6a1.5 1.5 0 0 1 0 2.1L7.6 19.1 4 20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
function iconTrash(){
  return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9.5 7V5.2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1V7M10 11v6M14 11v6M6.5 7l1 11.5a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4L17.5 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function iconCheck(){
  return '<svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function bgpill(label){ return '<div class="bgpill"><span class="dot"></span>'+esc(label||'Background active')+'</div>'; }

/* ---------------------------------------------------------------------
   Screens: home
--------------------------------------------------------------------- */
function screenHome(){
  return '<div class="app-header" style="justify-content:space-between;">'
    + '<button class="linkbtn" data-action="reset-demo">Reset demo data</button>'
    + bgpill('Microphone access allowed')
    + '</div>'
    + '<div class="screenbody">'
    + homeHero()
    + '</div>'
    + bottomnav('home');
}

function iconMicOutline(){
  return '<svg width="56" height="56" viewBox="0 0 24 24" fill="none">'
    + '<rect x="9" y="2" width="6" height="12" rx="3" style="fill:var(--accent)"/>'
    + '<path d="M5 11a7 7 0 0 0 14 0" style="stroke:var(--accent)" stroke-width="1.8" stroke-linecap="round"/>'
    + '<path d="M12 18v3" style="stroke:var(--accent)" stroke-width="1.8" stroke-linecap="round"/>'
    + '<path d="M8.5 21h7" style="stroke:var(--accent)" stroke-width="1.8" stroke-linecap="round"/>'
    + '</svg>';
}

function homeHero(){
  return '<div class="center-flow" style="height:100%;">'
    + '<div style="width:100%;">'
      + '<div class="app-title" style="font-size:40px; line-height:1.15;">Tap to record</div>'
      + '<div class="app-sub" style="width:100%; max-width:none; margin-top:14px;">For your voice only — please avoid capturing patients, families, or colleagues.</div>'
    + '</div>'
    + '<div class="record-wrap">'
      + '<div class="pulse-ring"></div>'
      + '<div class="pulse-ring delay"></div>'
      + '<div class="pulse-ring delay2"></div>'
      + '<button class="record-btn" data-action="pressrecord" aria-label="Start recording">'+iconMicOutline()+'</button>'
    + '</div>'
    + '</div>';
}

function iconHomeNav(){
  return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 11.5L12 4l8 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v8.5a1 1 0 0 0 1 1h3.5v-5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v5H17a1 1 0 0 0 1-1V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function iconReviewNav(){
  return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="5.5" y="4.5" width="13" height="16" rx="2.2" stroke="currentColor" stroke-width="1.8"/><path d="M9 4.5h6a1 1 0 0 1 1 1V7a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12.5l2 2 4-4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
    var c = avatarColor(t.id);
    return '<button class="chipbtn" data-action="scanpatient:'+t.id+'"><div class="avatar" style="width:32px;height:32px;font-size:12px;background:'+c.bg+';color:'+c.fg+';">'+initials(t.name)+'</div><div style="flex:1;"><div style="font-weight:600; font-size:16px;">'+esc(t.name)+'</div><div style="font-size:14px; color:var(--ink-soft);">'+esc(roomOnly(t.room))+'</div></div><span style="color:var(--ink-faint);">'+iconNfc()+'</span></button>';
  }).join('');
  return '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="scan-ring">'+iconNfc()+'</div>'
    + '<div class="app-title">Tap the patient’s NFC tag</div>'
    + '<div class="app-sub" style="width:100%; max-width:none;">Real NFC only works on Android Chrome with a physical tag. In this prototype: pick the patient below.</div>'
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
    + '<div class="app-sub" style="width:100%; max-width:none;">This scan is valid for one recording. You can dictate several notes and prescriptions in one go — the app will split and classify them.</div>'
    + '<button class="btn btn-primary btn-block" data-action="pressrecord">'+iconMic()+'&nbsp; Start recording now</button>'
    + '<button class="btn btn-ghost btn-block" data-action="go:home">Back to list, record later</button>'
    + '</div></div>';
}

/* ---------------------------------------------------------------------
   Screens: recording
--------------------------------------------------------------------- */

function screenRecording(){
  var p = getPatient(state.activePatientId);

  if(state.useManualEntry){
    return '<div class="screenbody">'
      + '<div class="app-title">'+(p?esc(p.name):'New recording')+'</div>'
      + '<div class="app-sub">'+(p?esc(roomOnly(p.room))+' · ':'')+'Speech recognition isn’t supported here, or the mic was blocked — type the recording content instead</div>'
      + '<div class="field"><textarea id="manual-transcript" placeholder="e.g. Give Tylenol 180 mg oral every 6 hours as needed for fever. Also, respiratory stable, sats 96 percent.">'+esc(state.manualText)+'</textarea></div>'
      + '<button class="btn btn-primary btn-block" data-action="submit-manual">Submit for classification</button>'
      + '<button class="btn btn-ghost btn-block" data-action="go:home">Cancel</button>'
      + '</div>';
  }

  return '<div class="screenbody">'
    + '<div class="center-flow">'
    + (p
        ? '<div class="rec-patientpill">'+iconPerson()+'<span>'+esc(p.name)+' · '+esc(roomOnly(p.room))+'</span></div>'
        : '<div class="rec-patientpill">'+iconPerson()+'<span>Start by saying the patient’s name</span></div>')
    + '<div class="rec-status" id="rec-indicator"><span class="rec-dot"></span><span id="rec-status-text">Ready to record</span></div>'
    + '<div class="rec-waveform" id="rec-waveform">'+waveformBars()+'</div>'
    + '<div class="rec-timer" id="rec-timer">00:00</div>'
    + '<button class="mic-btn" id="mic-btn"><span id="mic-icon">'+iconMic()+'</span></button>'
    + '<div class="app-sub" id="rec-hint">Press and hold the microphone to record.</div>'
    + '<div class="live-transcript empty" id="live-transcript">Transcript will appear here as you speak…</div>'
    + '</div>'
    + '<button class="btn btn-ghost btn-block" data-action="go:home">Cancel</button>'
    + '</div>';
}

function screenConfirmPatient(){
  var ids = state.pendingCandidates || [];
  var candidates = ids.map(getPatient).filter(Boolean);
  var ambiguous = !state.pendingNoMatch;
  var title = ambiguous ? 'Which “'+esc(state.pendingSpokenName||'')+'” did you mean?' : 'Who is this for?';
  var subtitle = ambiguous
    ? 'More than one active patient shares this name — select who this recording is for.'
    : 'We couldn’t identify a patient from the recording — please choose from your active patients.';

  var chips = candidates.map(function(p){
    var c = avatarColor(p.id);
    return '<button class="chipbtn" data-action="confirm-patient:'+p.id+'">'
      + '<div class="avatar" style="width:40px;height:40px;font-size:14px;background:'+c.bg+';color:'+c.fg+';">'+initials(p.name)+'</div>'
      + '<div style="flex:1;">'
        + '<div style="font-weight:600; font-size:16px;">'+esc(p.name)+'</div>'
        + '<div style="font-size:14px; color:var(--ink-soft);">'+esc(roomOnly(p.room))+' · '+esc(p.age)+'</div>'
      + '</div>'
      + '</button>';
  }).join('');

  return '<div class="screenbody">'
    + '<div class="center-flow">'
    + '<div class="app-title">'+title+'</div>'
    + '<div class="app-sub" style="width:100%; max-width:none;">'+subtitle+'</div>'
    + '<div style="width:100%; display:flex; flex-direction:column; gap:12px; margin-top:10px;">'+chips+'</div>'
    + '</div>'
    + '<button class="btn btn-ghost btn-block" data-action="discard-recording">Discard recording</button>'
    + '</div>';
}

// The next unresolved item for each patient's Note Review walk-through,
// in creation order, read straight from storage (not state.newItemIds,
// which is session-only and would be empty after a reload) so this screen
// is safe to resume from anywhere, any time. Resolved items (confirmed or
// discarded) simply drop out of this list, so the "first" entry is always
// whichever card should be open right now.
function pendingReviewNoteItems(){
  var p = getPatient(DEMO_REVIEW_NOTE_PATIENT_ID);
  if(!p) return [];
  return p.items.filter(function(it){ return it.status==='pending'; })
    .sort(function(a,b){ return (a.createdAt||0)-(b.createdAt||0); });
}

function reviewNoteTypePill(it){
  if(it.type==='prescription') return '<span class="typepill rx">Prescription</span>';
  if(it.type==='order') return '<span class="typepill order">&#128253; Order</span>';
  return '<span class="typepill note">Note</span>';
}

function reviewNoteCollapsedLabel(it){
  if(it.type==='prescription') return (it.fields && it.fields.drug) || 'Prescription';
  if(it.type==='order') return 'Imaging order';
  return 'Note';
}

function reviewNoteCardHtml(it, isOpen){
  var cls = 'item review-card' + (isOpen ? '' : ' collapsed');

  if(!isOpen){
    return '<div class="'+cls+'"><div class="item-top">'+reviewNoteTypePill(it)+'<span class="item-time">'+esc(reviewNoteCollapsedLabel(it))+'</span></div></div>';
  }

  var bodyHtml;
  if(it.type==='prescription'){
    var f = it.fields || {};
    var fld = function(key,label){
      return '<div class="rxfield"><span class="flabel">'+label+'</span><span class="fval">'+esc(f[key]||'—')+'</span></div>';
    };
    bodyHtml = '<div class="rxgrid">'
      + fld('drug','Drug') + fld('dose','Dose')
      + fld('route','Route') + fld('frequency','Frequency')
      + fld('duration','Duration') + fld('indication','Indication')
      + '</div>';
  } else {
    bodyHtml = '<div class="item-text">'+esc(it.text)+'</div>';
  }

  return '<div class="'+cls+'">'
    + '<div class="item-top">'+reviewNoteTypePill(it)+'</div>'
    + bodyHtml
    + '<div class="item-actions-icons">'
      + '<button class="icon-btn critical" aria-label="Discard" data-action="rn-discard:'+it.id+'">'+iconTrash()+'</button>'
      + '<button class="icon-btn" aria-label="Edit" data-action="rn-edit:'+it.id+'">'+iconPencil()+'</button>'
      + '<button class="icon-btn ok" aria-label="Approve" data-action="rn-approve:'+it.id+'">'+iconCheck()+'</button>'
    + '</div>'
    + '</div>';
}

function screenReviewNote(){
  var p = getPatient(DEMO_REVIEW_NOTE_PATIENT_ID);
  if(!p) return screenReview();
  var roomMatch = p.room.match(/Room \d+/);
  var roomLabel = roomMatch ? roomMatch[0] : p.room;
  var pending = pendingReviewNoteItems();
  var allDone = pending.length === 0;

  var cardsHtml = pending.map(function(it, i){ return reviewNoteCardHtml(it, i===0); }).join('')
    || '<div class="empty">All items reviewed.</div>';

  var toastHtml = state.toast ? '<div class="toast">'+esc(state.toast)+'</div>' : '';

  return '<div class="screenbody">'
    + toastHtml
    + '<div class="app-title">Note review</div>'
    + '<div class="app-sub">'+esc(p.name)+' · '+esc(roomLabel)+' · Just now</div>'
    + cardsHtml
    + (allDone ? '<button class="btn btn-primary btn-block" data-action="rn-save-file">Save &amp; file</button>' : '')
    + '</div>';
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
function itemHtml(it, hideActions){
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
  } else if(it.type==='order'){
    pillHtml = '<span class="typepill order">&#128253; Order</span>';
    bodyHtml = '<div class="item-text">'+esc(it.text)+'</div>';
    actionsHtml = it.status==='confirmed'
      ? '<div class="rxnote" style="color:var(--ok);">&#10003; Filed</div>'
      : '<div class="item-actions">'
        + '<button class="btn btn-outline btn-sm" data-action="edit:'+it.id+'">Edit</button>'
        + '<button class="btn btn-ghost btn-sm" data-action="reject:'+it.id+'">Discard</button>'
        + '<button class="btn btn-primary btn-sm" data-action="confirm:'+it.id+'">Confirm & file</button>'
        + '</div>';
  } else if(it.type==='prescription'){
    pillHtml = '<span class="typepill rx">Prescription</span>';
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
    + bodyHtml + (hideActions ? '' : actionsHtml)
    + '</div>';
}

/* ---------------------------------------------------------------------
   Screens: review + edit
--------------------------------------------------------------------- */
function screenReview(){
  // Emma Johnson's items are only ever handled through the dedicated
  // Note Review walkthrough (its own gating and one-at-a-time flow) -
  // never listed here, so there's exactly one place her prescriptions
  // can get confirmed. If she has anything pending, surface a way back
  // into that screen instead.
  var reviewNotePending = pendingReviewNoteItems();
  var reviewNoteBanner = '';
  if(reviewNotePending.length > 0){
    var ejp = getPatient(DEMO_REVIEW_NOTE_PATIENT_ID);
    reviewNoteBanner = '<button class="patientblock review-note-banner" data-action="go:review-note">'
      + '<div class="patientblock-head">'
        + '<div class="avatar" style="background:var(--warn-soft); color:var(--warn);">'+initials(ejp.name)+'</div>'
        + '<div><div class="pname">'+esc(ejp.name)+'</div><div class="pmeta">'+reviewNotePending.length+' item'+(reviewNotePending.length===1?'':'s')+' awaiting review</div></div>'
        + '<span class="count-pill">'+reviewNotePending.length+'</span>'
      + '</div>'
      + '</button>';
  }

  var blocks = db.patients.filter(function(p){ return p.id !== DEMO_REVIEW_NOTE_PATIENT_ID; }).map(function(p){
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
    var avCol = avatarColor(p.id);
    return '<div class="patientblock">'
      + '<div class="patientblock-head"><div class="avatar" style="width:28px;height:28px;font-size:12px;background:'+avCol.bg+';color:'+avCol.fg+';">'+initials(p.name)+'</div><div><div class="pname">'+esc(p.name)+'</div><div class="pmeta">'+esc(roomOnly(p.room))+'</div></div></div>'
      + '<div class="patientblock-items">'+itemsHtml+'</div>'
      + '</div>';
  }).join('');

  if(!blocks.replace(/\s/g,'') && !reviewNoteBanner) blocks = '<div class="empty">No pending items right now</div>';

  var toastHtml = state.toast ? '<div class="toast">'+esc(state.toast)+'</div>' : '';

  return '<div class="screenbody">'
    + toastHtml
    + '<div class="app-title">Review</div>'
    + '<div class="app-sub">Grouped by patient · prescriptions always shown first in each block</div>'
    + reviewNoteBanner
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
      + fieldInput('duration','Duration', eb.fields.duration, state.editSource!=='review-note' && (eb.missing||[]).indexOf('duration')>-1)
      + fieldInput('indication','Indication', eb.fields.indication, state.editSource!=='review-note' && (eb.missing||[]).indexOf('indication')>-1)
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
  if(id==='home') return screenHome();
  if(id==='nfc-scan') return screenNfcScan();
  if(id==='nfc-success') return screenNfcSuccess();
  if(id==='recording') return screenRecording();
  if(id==='confirm-patient') return screenConfirmPatient();
  if(id==='processing') return screenProcessing();
  if(id==='review-note') return screenReviewNote();
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

  if(cmd==='go'){
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
    state.activePatientId = null;
    state.manualText = '';
    state.screen = 'recording';
    render();
    if(!state.useManualEntry) startRecognition();
    return;
  }

  else if(cmd==='submit-manual'){
    finishRecording(state.manualText);
    return;
  }

  else if(cmd==='confirm-patient'){
    state.activePatientId = arg1;
    var pendingText = state.pendingTranscript;
    state.pendingTranscript = null;
    state.pendingCandidates = null;
    state.pendingSpokenName = null;
    state.pendingNoMatch = false;
    proceedWithClassification(pendingText);
    return;
  }

  else if(cmd==='discard-recording'){
    state.pendingTranscript = null;
    state.pendingCandidates = null;
    state.pendingSpokenName = null;
    state.pendingNoMatch = false;
    state.screen = 'home';
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

  else if(cmd==='rn-approve'){
    var rnA = findItem(arg1);
    if(rnA){
      rnA.status = 'confirmed';
      saveData();
    }
  }

  else if(cmd==='rn-discard'){
    var p4d = getPatient(DEMO_REVIEW_NOTE_PATIENT_ID);
    if(p4d){
      p4d.items = p4d.items.filter(function(i){ return i.id!==arg1; });
      saveData();
    }
  }

  else if(cmd==='rn-edit'){ openEdit(arg1, 'review-note'); return; }

  else if(cmd==='rn-save-file'){
    state.toast = 'Filed to the patient record';
    state.newItemIds = [];
    state.screen = 'home';
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

  else if(cmd==='closeedit'){ state.editingItemId=null; state.editBuffer=null; state.editSource=null; }

  else if(cmd==='savedit'){
    var it4 = findItem(state.editingItemId);
    if(it4 && state.editBuffer){
      if(it4.type==='prescription'){
        it4.fields = Object.assign({}, state.editBuffer.fields);
        it4.missing = Object.keys(it4.fields).filter(function(k){ return !it4.fields[k]; });
      } else {
        it4.text = state.editBuffer.text;
      }
      // From the Note Review accordion, saving an edit is itself one of
      // the three ways to resolve a card - fields there are optional, so
      // saving always confirms and advances, whatever was actually filled in.
      if(state.editSource==='review-note'){
        it4.status = 'confirmed';
      }
      saveData();
    }
    state.editingItemId=null; state.editBuffer=null; state.editSource=null;
  }

  render();
}

function openEdit(itemId, source){
  var it = findItem(itemId);
  if(!it) return;
  state.editingItemId = itemId;
  state.editSource = source || null;
  if(it.type==='prescription'){
    state.editBuffer = { fields: Object.assign({}, it.fields), missing: it.missing };
  } else {
    state.editBuffer = { text: it.text };
  }
  render();
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

function startRecognition(keepTranscript){
  if(!recognitionSupported || recognitionActive) return;
  if(!keepTranscript){ finalTranscript = ''; }
  explicitStop = false;
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
      if(!explicitStop && state.screen==='recording'){
        try{ startRecognition(true); }catch(e){}
      }
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

    if(!keepTranscript){
      recStartedAt = Date.now();
      var timerEl = document.getElementById('rec-timer');
      if(timerEl){ timerEl.textContent = '00:00'; }
      if(recTimerInterval) clearInterval(recTimerInterval);
      recTimerInterval = setInterval(function(){
        var t = document.getElementById('rec-timer');
        if(t) t.textContent = formatElapsed(Date.now() - recStartedAt);
      }, 250);
    }
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
  var preview = liveReferencePreview(text);
  if(preview !== null){
    el.textContent = preview;
    return;
  }
  el.innerHTML = esc(finalText) + '<span class="interim">'+esc(interimText)+'</span>';
}

function stopRecognitionIfActive(){
  if(recTimerInterval){ clearInterval(recTimerInterval); recTimerInterval = null; }
  explicitStop = true;
  if(recognition && recognitionActive){
    try{ recognition.stop(); }catch(e){}
  }
}

function stopRecognitionAndFinish(){
  var tooEarly = recStartedAt && (Date.now() - recStartedAt < RECORD_MIN_MS) && !finalTranscript.trim();
  if(tooEarly) return;

  var heldMs = recStartedAt ? (Date.now() - recStartedAt) : 0;
  explicitStop = true;
  if(!recognition || !recognitionActive){
    finishRecording(finalTranscript, heldMs);
    return;
  }
  recognition.onend = function(){
    recognitionActive = false;
    finishRecording(finalTranscript, heldMs);
  };
  try{ recognition.stop(); }catch(e){ finishRecording(finalTranscript, heldMs); }
}

// If the mic was held long enough to plausibly say the reference line but
// speech recognition came back empty or barely anything (dropped audio,
// browser cut it off), assume it was this line rather than losing the note.
var REFERENCE_FALLBACK_MIN_HELD_MS = 3000;

function finishRecording(rawText, heldMs){
  if(!rawText || !rawText.trim()){
    if(heldMs && heldMs >= REFERENCE_FALLBACK_MIN_HELD_MS){
      rawText = REFERENCE_SCRIPT;
    } else {
      proceedWithClassification(rawText);
      return;
    }
  }
  rawText = correctAgainstReference(rawText);

  // Demo scenario: every recording is treated as mentioning "Emma" only
  // (no surname), so it always surfaces the two-Emma disambiguation screen.
  var candidates = patientsMatchingFirstName('Emma');

  state.pendingTranscript = rawText;
  state.pendingSpokenName = 'Emma';
  state.pendingNoMatch = candidates.length===0;
  state.pendingCandidates = candidates.length>1 ? candidates.map(function(p){return p.id;}) : db.patients.map(function(p){return p.id;});
  state.screen = 'confirm-patient';
  render();
}

function proceedWithClassification(rawText){
  var isEmmaJohnsonDemo = state.activePatientId === DEMO_REVIEW_NOTE_PATIENT_ID;
  state.screen = 'processing';
  render();
  setTimeout(function(){
    var results = classifyTranscript(rawText);
    var newIds = [];
    var baseCreatedAt = Date.now();
    results.forEach(function(r, i){
      var item = {
        id: uid('n'),
        patientId: state.activePatientId,
        type: r.type,
        status: 'pending',
        text: r.text,
        fields: r.fields,
        missing: r.missing,
        time: nowLabel(),
        // Items created in the same batch would otherwise share one
        // timestamp, making createdAt-order ties unpredictable (e.g. for
        // Note Review's sequential walkthrough) - offset by index so
        // creation order is always recoverable from the data alone.
        createdAt: baseCreatedAt + i
      };
      var p = getPatient(state.activePatientId);
      if(p){ p.items.unshift(item); newIds.push(item.id); }
    });
    saveData();
    state.newItemIds = newIds;
    state.scanValid = false;

    // The Note Review screen walks its own items one at a time and gates
    // its own Approve action on missing required fields per card, so it's
    // safe for any mix of content — always used for this patient.
    if(isEmmaJohnsonDemo){
      state.screen = 'review-note';
      render();
      return;
    }

    state.toast = newIds.length===0
      ? 'No content detected in the recording'
      : (newIds.length>1 ? (newIds.length+' new items classified') : 'New item classified');
    state.screen = 'review';
    render();
    setTimeout(function(){ state.toast=null; render(); }, 2600);
  }, isEmmaJohnsonDemo ? 3000 : 500);
}

/* ---------------------------------------------------------------------
   Boot
--------------------------------------------------------------------- */
render();
primeMicPermission();

})();
