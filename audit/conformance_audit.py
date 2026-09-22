from pathlib import Path
import csv, hashlib, json, re, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'audit'

checks = []
def check(cid, condition, severity, detail):
    checks.append({'check_id':cid,'pass':bool(condition),'severity_if_failed':severity,'detail':detail})

# Parse core files
html = (ROOT/'index.html').read_text(encoding='utf-8')
app = (ROOT/'app.js').read_text(encoding='utf-8')
gov = (ROOT/'governance.js').read_text(encoding='utf-8')
db = (ROOT/'db.js').read_text(encoding='utf-8')
sw = (ROOT/'service-worker.js').read_text(encoding='utf-8')
catalog = json.loads((ROOT/'data/semantic_catalog.json').read_text(encoding='utf-8'))
outputs = {x['output_id']: x for x in catalog['outputs']}

# Syntax / unit tests
node_checks = []
for f in ['app.js','governance.js','db.js','service-worker.js']:
    r = subprocess.run(['node','--check',str(ROOT/f)], capture_output=True, text=True)
    node_checks.append((f, r.returncode == 0, r.stderr.strip()))
check('AUTO-001', all(x[1] for x in node_checks), 'BLOCKER', 'JavaScript syntax check for app/governance/db/service-worker.')

r = subprocess.run(['node','--test',str(ROOT/'tests/governance.test.mjs')], capture_output=True, text=True)
check('AUTO-002', r.returncode == 0, 'BLOCKER', 'Governance unit tests: badge derivation, validation contamination, history preservation, retention trigger, self-report semantics.')
(AUDIT/'node_test_output.txt').write_text(r.stdout + '\n' + r.stderr, encoding='utf-8')

# Data integrity
nodes = json.loads((ROOT/'data/msvo_nodes.json').read_text())
edges = json.loads((ROOT/'data/msvo_edges.json').read_text())
roots = json.loads((ROOT/'data/tnpo_roots.json').read_text())
branches = json.loads((ROOT/'data/tnpo_branches.json').read_text())
check('AUTO-003', len(nodes)==782 and len(edges)==1744 and len(roots)==5 and len(branches)==26, 'BLOCKER', 'Bundled MSVO/TNPO counts match frozen/current reference state.')
check('AUTO-004', not any(e.get('relation')=='REQUIRES' for e in edges), 'BLOCKER', 'Bundle contains no REQUIRES edges; implementation must surface unavailability rather than invent prerequisites.')
check('AUTO-005', 'PREREQ_GRAPH_UNAVAILABLE' in app and 'will not invent a prerequisite claim' in (ROOT/'data/semantic_catalog.json').read_text(), 'BLOCKER', 'Missing prerequisite graph is explicitly surfaced.')

# Bidirectional semantic output traceability
literal_html_ids = set(re.findall(r'data-output-id="([A-Z0-9_\-]+)"', html))
app_ids = set(re.findall(r"outputAttr\('([A-Z0-9_\-]+)'\)", app)) | set(re.findall(r"semanticText\('([A-Z0-9_\-]+)'", app))
used_ids = literal_html_ids | app_ids
unknown_ids = sorted(used_ids - set(outputs))
check('AUTO-006', not unknown_ids, 'BLOCKER', f'Reverse traceability: every used semantic output ID exists in semantic catalog. Unknown={unknown_ids}')
missing_rules = [oid for oid,o in outputs.items() if not o.get('requirement_ids') or not o.get('record_type')]
check('AUTO-007', not missing_rules, 'BLOCKER', f'Every semantic catalog output has governing requirement IDs and source record type. Missing={missing_rules}')

# Mutation authority / append-only
check('AUTO-008', app.count('putLearnerState(')==1 and 'commitGovernedTransition' in app, 'BLOCKER', 'Learner-state write path is centralized in governed transition commit path.')
check('AUTO-009', "putRecord('events'" not in db and "putRecord('pilotEvents'" not in db and "addRecord(participantId ? 'pilotEvents' : 'events'" in db, 'BLOCKER', 'Event ledger uses append-only add(), not overwrite put().')
direct_validation_assign = re.findall(r'\b(?:state|s|next|prev)\.validation_state\s*=(?!=)', app)
check('AUTO-010', not direct_validation_assign, 'BLOCKER', f'UI code does not directly assign validation state. Matches={direct_validation_assign}')
check('AUTO-011', "learnerCorrectionEvent" in app and "appendEvent('SELF_REPORT'" in app and 'putLearnerState' not in app[app.find("$('#saveCorrectionBtn')"):app.find('// ---------- Map ----------')], 'BLOCKER', 'Learner correction appends SELF_REPORT observation without direct learner-state mutation.')

# Retention/history/no scalar
check('AUTO-012', 'mayDisplayReviewDue(s)' in app and 'retention_trigger_authorized' in gov, 'BLOCKER', 'Review-due rendering is gated by authorized retention trigger.')
check('AUTO-013', 'validation_history' in gov and 'historicalValidation(s)' in app, 'BLOCKER', 'Historical validation is stored separately and rendered without history rewrite.')
user_semantic_text = html + '\n' + app
scalar_patterns = re.findall(r'(?i)mastery.{0,30}\b\d{1,3}\s*%|\b\d{1,3}\s*%.{0,30}mastery', user_semantic_text)
check('AUTO-014', not scalar_patterns, 'BLOCKER', f'No ungoverned mastery percentage present. Matches={scalar_patterns}')

# Consent/withdrawal
check('AUTO-015', 'Participation is voluntary' in html and 'not part of the study tasks' in html and 'it is not scored' in html, 'MAJOR', 'Required participant-facing consent/understanding wording is present.')
check('AUTO-016', "disposition = 'DELETE_WHERE_FEASIBLE'" in db and 'WITHDRAWAL_NOT_FAILURE' in html, 'BLOCKER', 'Withdrawal protective default and withdrawal != learner failure are implemented.')
check('AUTO-017', "deleteByParticipant('pilotEvents'" in db and "deleteByParticipant('pilotLearnerState'" in db, 'BLOCKER', 'Protective withdrawal deletion removes participant-level pilot events/state where feasible.')

# PWA/accessibility static checks
manifest = json.loads((ROOT/'manifest.webmanifest').read_text())
check('AUTO-018', manifest.get('display')=='standalone' and manifest.get('start_url')=='./' and len(manifest.get('icons',[]))>=2, 'MAJOR', 'PWA manifest contains standalone display, start URL, and icons.')
required_cache = ['index.html','styles.css','app.js','governance.js','db.js','msvo_nodes.json','semantic_catalog.json']
check('AUTO-019', all(x in sw for x in required_cache), 'MAJOR', 'Service worker pre-caches core shell and governed map/catalog assets.')
check('AUTO-020', 'role="status"' in html and 'aria-live="polite"' in html and ':focus-visible' in (ROOT/'styles.css').read_text(), 'MAJOR', 'Status announcements and visible focus treatment are present.')
check('AUTO-021', all(x in html for x in ['<small>Learn</small>','<small>Map</small>','<small>Progress</small>','<small>More</small>']), 'MAJOR', 'Learner-first four-tab navigation is implemented.')

# Build manual audit inventory
manual_items = [
    ('MAN-001','Interface wording: uncertainty language does not exceed evidence authority','UIG-01/UIG-03/UIG-12','PENDING_DEVICE_REVIEW'),
    ('MAN-002','Provenance badges visually correspond to deterministic record-type mapping','UIG-02','PENDING_DEVICE_REVIEW'),
    ('MAN-003','Cyclic backtracking scenario is understandable without implying learner failure','UIG-06','PENDING_DEVICE_REVIEW'),
    ('MAN-004','Practice/diagnostic/validation roles are visibly distinct before response','UIG-07','PENDING_DEVICE_REVIEW'),
    ('MAN-005','Progress dimensions do not visually collapse into a mastery score','UIG-10','PENDING_DEVICE_REVIEW'),
    ('MAN-006','Consent/withdrawal copy is readable, voluntary, and visibly non-evaluative','CONSENT v1.0 + SUPPLEMENT v1.0','PENDING_DEVICE_REVIEW'),
    ('MAN-007','Touch/focus/layout behavior on iPhone-sized viewport does not obscure focused controls','WCAG 2.2 / device inspection','PENDING_DEVICE_REVIEW')
]
with open(AUDIT/'manual_review_checklist.csv','w',newline='',encoding='utf-8') as f:
    w=csv.writer(f); w.writerow(['manual_id','check','requirement','status']); w.writerows(manual_items)

# Traceability matrix: key frozen requirements -> implementation/test
trace_rows = [
    ('TR-001','FORWARD','CA-INV-01','Conformance Audit v1.0','semantic_catalog.json + semanticText/outputAttr','All semantic outputs','AUTO-006/AUTO-007','MAN-001','DUAL','BLOCKER'),
    ('TR-002','FORWARD','CA-INV-02','Conformance Audit v1.0','commitGovernedTransition + db appendEvent','State-changing controls','AUTO-008/AUTO-009/AUTO-010','', 'AUTOMATED','BLOCKER'),
    ('TR-003','FORWARD','UIG-01','Interface Governance v1.0','evidencePresentation + Why dialog','WHY_*','AUTO-002','MAN-001','DUAL','BLOCKER'),
    ('TR-004','FORWARD','UIG-02','Interface Governance v1.0','badgeForRecordType + provenanceBadge','PROV_*','AUTO-002/AUTO-006','MAN-002','DUAL','BLOCKER'),
    ('TR-005','FORWARD','UIG-03','Interface Governance v1.0','EVIDENCE_STATES + progress/Why rendering','EVID_*','AUTO-002','MAN-001','DUAL','BLOCKER'),
    ('TR-006','FORWARD','UIG-04','Interface Governance v1.0','learnerCorrectionEvent + SELF_REPORT append','SELF_REPORT_RECORDED','AUTO-011','', 'AUTOMATED','BLOCKER'),
    ('TR-007','FORWARD','UIG-05','Interface Governance v1.0','NO_GAMING_INFERENCE semantic output','NO_GAMING_INFERENCE','AUTO-006','MAN-001','DUAL','MAJOR'),
    ('TR-008','FORWARD','UIG-06','Interface Governance v1.0','Pilot scenario lab PT-02','BACKTRACK_EXPLANATION','AUTO-006','MAN-003','MANUAL','MAJOR'),
    ('TR-009','FORWARD','UIG-07','Interface Governance v1.0','Task role cards + validation transition guards','TASK_*','AUTO-002','MAN-004','DUAL','BLOCKER'),
    ('TR-010','FORWARD','UIG-08','Interface Governance v1.0','mayDisplayReviewDue','RETENTION_*','AUTO-012/AUTO-002','', 'AUTOMATED','BLOCKER'),
    ('TR-011','FORWARD','UIG-09','Interface Governance v1.0','validation_history + history renderer','HISTORICAL_VALIDATION','AUTO-013/AUTO-002','', 'AUTOMATED','BLOCKER'),
    ('TR-012','FORWARD','UIG-10','Interface Governance v1.0','Progress 5-dimension renderer','PROGRESS_*','AUTO-014','MAN-005','DUAL','BLOCKER'),
    ('TR-013','FORWARD','UIG-11','Interface Governance v1.0','Why this step dialog','WHY_*','AUTO-006','MAN-001','DUAL','MAJOR'),
    ('TR-014','FORWARD','UIG-12','Interface Governance v1.0','semantic catalog + record badges','All learner claims','AUTO-006/AUTO-007','MAN-001','DUAL','BLOCKER'),
    ('TR-015','FORWARD','CONSENT-01','Consent Addendum v1.0','Pilot consent panel','CONSENT_VOLUNTARY','AUTO-015','MAN-006','DUAL','BLOCKER'),
    ('TR-016','FORWARD','CONSENT-SUPP-01','Consent Supplement v1.0','withdrawPilotSession default delete','WITHDRAWAL_DEFAULT_DELETE','AUTO-016/AUTO-017','MAN-006','DUAL','BLOCKER'),
    ('TR-017','FORWARD','CONSENT-SUPP-02','Consent Supplement v1.0','pilot consent wording','CONSENT_NONSCORED','AUTO-015','MAN-006','DUAL','MAJOR')
]
with open(AUDIT/'traceability_matrix_v0.2.csv','w',newline='',encoding='utf-8') as f:
    w=csv.writer(f)
    w.writerow(['trace_id','direction','requirement_id','spec_document','implementation_component','semantic_output','automated_evidence','manual_evidence','verification_mode','severity_if_failed'])
    w.writerows(trace_rows)

# Reverse inventory from semantic catalog
with open(AUDIT/'semantic_output_inventory_v0.2.csv','w',newline='',encoding='utf-8') as f:
    w=csv.writer(f)
    w.writerow(['output_id','category','template','record_type','governing_requirement_ids','used_in_build','reverse_trace_status'])
    for oid,o in sorted(outputs.items()):
        used = oid in used_ids
        w.writerow([oid,o['category'],o['template'],o['record_type'],';'.join(o['requirement_ids']),used,'PASS' if used else 'CATALOG_RESERVED'])

blockers = [c for c in checks if not c['pass'] and c['severity_if_failed']=='BLOCKER']
majors = [c for c in checks if not c['pass'] and c['severity_if_failed']=='MAJOR']
automated_pass = not blockers and not majors
full_pass = automated_pass and all(x[3]=='PASS' for x in manual_items)

state = {
    'build_version':'0.2.0',
    'automated_conformance':'PASS' if automated_pass else 'FAIL',
    'full_implementation_conformance':'PASS' if full_pass else 'NOT_YET_ACHIEVED',
    'manual_device_review':'PENDING',
    'pilot_build_frozen': False,
    'blockers': blockers,
    'majors': majors,
    'checks': checks
}
(AUDIT/'conformance_state.json').write_text(json.dumps(state,indent=2),encoding='utf-8')

report = ['# TNPO/MSVO Navigator v0.2 — Implementation Conformance Audit','',
          f'**Automated conformance:** `{"PASS" if automated_pass else "FAIL"}`',
          '**Full implementation conformance:** `NOT_YET_ACHIEVED`',
          '**Pilot build frozen:** `NO`','',
          'The automated/static lane has been executed. The required rendered-device/manual semantic review remains pending; therefore the build is not yet eligible to be frozen for P01–P05.','',
          '## Automated checks','']
for c in checks:
    report.append(f"- `{c['check_id']}` — **{'PASS' if c['pass'] else 'FAIL'}** — {c['detail']}")
report += ['', '## Pending manual/device checks','']
for mid,desc,req,status in manual_items:
    report.append(f'- `{mid}` — `{status}` — {desc} ({req})')
report += ['', '## Interpretation boundary','',
           'An automated/static pass does not establish that the rendered iPhone UI is semantically clear or usable. The pilot build must remain unfrozen until the manual/device lane is completed against the frozen audit specification.']
(AUDIT/'CONFORMANCE_AUDIT_REPORT_v0.2.md').write_text('\n'.join(report)+'\n',encoding='utf-8')

print(json.dumps({'automated_pass':automated_pass,'blockers':len(blockers),'majors':len(majors),'manual_pending':len(manual_items)},indent=2))
if not automated_pass:
    sys.exit(1)
