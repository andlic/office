#!/usr/bin/env python3
"""E2E: editing an existing /GoToR or /Launch hyperlink must persist on save.

Regression for "编辑已有 GoToR/Launch 超链接后保存不生效": a link annotation
loaded from the file draws itself from the original /AP stream
(CAnnotationLink.IsNeedDrawFromStream() === true when /AP is present and the
border width is non-zero) and CAnnotationLink.SetActions() never marked the
annotation as changed, so IsNeedWriteOnSave() stayed false and the WASM writer
passed the old object bytes through.

Fixture: web-client/e2e/fixtures/link-persist-demo.pdf — produced on
2026-10-27 by the build *before* the fix (so it is also the old-file
compatibility input), then its four link borders were bumped /W 0 -> /W 1
(same-length byte patch, xref untouched) so every link satisfies
IsNeedDrawFromStream() === true and the old build would lose the edit.

Acceptance covered (numbers from the task):
  1. cross-session: /GoToR + /AP link -> edit -> save -> reopen -> new /F,
     /D still [page /XYZ ...]
  2. /Launch branch, no /D introduced
  3. edit -> save -> reopen -> second edit -> save persists
  4. new link -> save -> reopen -> edit -> save persists
  5. /URI regression: URI edit unchanged
  6. undo -> save keeps the old target; redo -> save keeps the new target
  7. minimal change surface: only the edited annotation object is rewritten;
     page content stream and the other annotation objects stay byte-identical
  8. old-file compatibility: a PDF saved by the pre-fix build opens, edits
     and saves without errors (the fixture itself)

Run:  python3 web-client/e2e/e2e_edit_link_persist.py
Needs the demo host on :8081 (node web-client/serve.js) and the DS container
with the rebuilt image. Chromium: /usr/bin/chromium-browser (headless).
"""
import hashlib
import json
import os
import re
import shutil
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
WEB_CLIENT = os.path.dirname(HERE)
DOCS = os.path.join(WEB_CLIENT, 'docs')
PRISTINE = os.path.join(HERE, 'fixtures', 'link-persist-demo.pdf')

BASE = 'http://localhost:8081'
DOC = BASE + '/editor.html?file=link-persist-demo'
PDF = os.path.join(DOCS, 'link-persist-demo.pdf')
HIST = PDF + '-history'
ARTIFACT_DIR = '/tmp/e2e-edit-link-persist'

MOCK = BASE + '/api/ectd/link/href?token=demo-token'
LEAF_G = 'l-537aba45-1971-437a-8b72-d1a514d36aec'
LEAF_L = 'l-11111111-2222-3333-4444-555555555555'
HREF_G = '../../1.2 封面信/封面信 & 截图 #1.pdf'
HREF_L = '../../0002/模块一/附件.docx'

# Targets. .pdf -> /GoToR, anything else -> /Launch (CreateFileHyperlinkAction).
NEW1 = '../1.0-封面/cover.pdf'
NEW2 = '../1.0-封面/cover-v2.pdf'
LAUNCH_PATH = '../1.0-封面/annex.xml'
URI_OLD = 'https://example.com/x'
URI_NEW = 'https://example.com/y'
FORCER = 'https://example.com/save-forcer'
PICK_PATH = '../1.0-封面/cover.pdf'
PICK_NODE = 'm1 区域行政信息/1.0-封面/cover.pdf'

# PDF-page points (y up) of the fixture links: rects are
# [20 220 200 260] GoToR leaf, [20 150 200 190] Launch leaf,
# [20 80 200 120] URI, [20 10 200 50] GoToR relative target.
PT = {'GoToR': (110, 240), 'Launch': (110, 170), 'URI': (110, 100),
      'target': (110, 30), 'blank': (270, 250)}
# Selection rect (top-left space, same as cacheSelectionQuads) for a new link.
NEW_RECT = {'x1': 60, 'y1': 205, 'x2': 180, 'y2': 235}

results = []


def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name +
          (('  [' + str(detail) + ']') if detail != '' else ''), flush=True)


def sha256(p):
    with open(p, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def make_init(ectd):
    return ("""try { if (location.origin === 'http://localhost:8081') {"""
            """ localStorage.setItem('web-client-config-v2', JSON.stringify(%s)); } } catch (e) {}"""
            % json.dumps({'ectd': ectd}))


def ectd_conf(resolve_url=None):
    c = {'enabled': True, 'pickerUrl': '/ectd-picker.html',
         'treeUrl': '/api/ectd/files/tree'}
    if resolve_url is not None:
        c['resolveUrl'] = resolve_url
    return c


def editor_frame(page, timeout=120):
    deadline = time.time() + timeout
    last_force = 0
    while time.time() < deadline:
        for f in page.frames:
            if '/pdfeditor/' in f.url:
                try:
                    if f.evaluate("""() => { try { var m = PDFE.getController('Main');
                        return !!(m && m._isDocReady && Common.Controllers.LaunchController.isScriptLoaded()); }
                        catch (e) { return false; } }"""):
                        return f
                except Exception:
                    pass
        if time.time() - last_force > 8:
            page.evaluate("""() => { var f = document.querySelector('iframe');
                if (f && /\\/common\\/index\\.html/i.test(f.src) && !/pdfeditor/.test(f.src))
                    f.src = f.src.replace(/common\\/index\\.html/i, 'pdfeditor/main/index.html') + '&isForm=false'; }""")
            last_force = time.time()
        page.wait_for_timeout(1000)
    raise RuntimeError('editor not ready: ' + str([f.url[:120] for f in page.frames]))


class Session:
    def __init__(self, browser, name, ectd):
        self.name = name
        self.ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
        self.ctx.add_init_script(make_init(ectd))
        self.page = self.ctx.new_page()
        self.errors = []
        self.warnings = []
        self.page.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)))
        self.page.on('console', self._on_console)
        self.page.goto(DOC, wait_until='domcontentloaded', timeout=60000)
        self.frame = editor_frame(self.page)
        refresh_geom(self)

    def _on_console(self, msg):
        if msg.type == 'warning':
            self.warnings.append(msg.text)
        elif msg.type == 'error' and 'Failed to load resource' not in msg.text:
            self.errors.append('console: ' + msg.text)

    def pump(self, ms=100):
        self.page.wait_for_timeout(ms)

    def point(self, xpt, ypt):
        g = self.geom
        xc = (g['docW'] / 2) if g['docW'] > g['width'] else (g['width'] / 2)
        page_x = g['canvas'][0] + xc - g['pw'] / 2
        page_y = g['canvas'][1] + g['pageY'] - g['scrollY']
        return (self.box['x'] + page_x + xpt * (g['pw'] / g['fullW']),
                self.box['y'] + page_y + (g['fullH'] - ypt) * (g['ph'] / g['fullH']))

    def close(self):
        self.ctx.close()


def refresh_geom(s):
    s.geom = s.frame.evaluate("""() => { var v = Asc.editor.getPDFDoc().Viewer;
        function r(el) { var b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }
        var p = v.drawingPages[0], fp = v.file.pages[0];
        return {canvas: r(v.canvas), pw: p.W, ph: p.H, pageY: p.Y, scrollY: v.scrollY,
                fullW: fp.W, fullH: fp.H, width: v.width, docW: v.documentWidth}; }""")
    s.box = s.frame.frame_element().bounding_box()


def enter_edit_mode(s):
    s.frame.evaluate("() => Common.NotificationCenter.trigger('pdf:mode-apply', 'edit')")
    s.pump(800)
    refresh_geom(s)
    return s.frame.evaluate("() => PDFE.getController('Main').appOptions.isPDFEdit")


# ---- dialog helpers (same mechanics as e2e_link_dialog.py) ----------------
def dialog_visible(s):
    return s.frame.evaluate("""() => {
        var w = document.getElementById('window-hyperlink-settings');
        if (!w) return false;
        var cs = getComputedStyle(w), b = w.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0;
    }""")


def wait_dialog(s, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if dialog_visible(s):
            return True
        s.pump(100)
    return False


def dialog_state(s):
    return s.frame.evaluate("""() => {
        var w = document.getElementById('window-hyperlink-settings');
        if (!w) return {exists: false};
        var i = w.querySelector('#id-dlg-hyperlink-url input');
        var cmp = w.querySelector('#id-dlg-hyperlink-url');
        var ext = document.getElementById('id-dlg-hyperlink-external');
        var ok = w.querySelector('.primary');
        return {exists: true, value: i ? i.value : null,
                errorClass: cmp ? cmp.className.indexOf('error') !== -1 : null,
                externalActive: ext ? ext.className.indexOf('active') !== -1 : null,
                okDisabled: ok ? (ok.disabled || ok.className.indexOf('disabled') !== -1) : null};
    }""")


def click_ok(s, timeout=10.0):
    t0 = time.time()
    s.frame.locator('#window-hyperlink-settings .primary').first.click(timeout=5000)
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not dialog_visible(s):
            return time.time() - t0
        s.pump(100)
    return None


def find_visible_menu_item(s, text):
    return s.frame.evaluate("""(text) => {
        var out = [];
        Array.prototype.slice.call(document.querySelectorAll('.menu-item')).forEach(function(el) {
            if (el.textContent.trim() !== text) return;
            var b = el.getBoundingClientRect();
            if (b.width > 0 && b.height > 0) out.push({x: b.x, y: b.y, w: b.width, h: b.height});
        });
        return out;
    }""", text)


def open_link_dialog(s, pt, attempts=3):
    for attempt in range(attempts):
        refresh_geom(s)
        x, y = s.point(*pt)
        s.page.mouse.move(x, y, steps=4)
        s.pump(500)
        s.page.mouse.click(x, y, button='right')
        s.pump(900)
        items = find_visible_menu_item(s, '编辑链接')
        if items:
            it = items[0]
            s.page.mouse.click(s.box['x'] + it['x'] + it['w'] / 2,
                               s.box['y'] + it['y'] + it['h'] / 2)
            if wait_dialog(s):
                return
        # Close any half-open menu / dialog, then retry with fresh geometry
        # (the first right-click after a (re)load occasionally lands before
        # the link overlay is hit-testable).
        s.page.keyboard.press('Escape')
        s.pump(600)
    raise RuntimeError('link dialog did not open at %r' % (pt,))


def wait_dialog_value(s, expected, timeout=8.0):
    """Wait for the dialog to finish the async leaf-ID resolve (or show a value)."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = dialog_state(s)
        if last.get('value') == expected:
            return last
        s.pump(150)
    return last


def fill_url(s, value):
    s.frame.locator('#id-dlg-hyperlink-url input').first.fill(value)
    s.pump(300)


def add_uri_link(s, rect, url):
    s.frame.evaluate("""(q) => {
        const api = Asc.editor;
        const oFile = api.getDocumentRenderer().file;
        oFile.Selection.IsSelection = true;
        oFile.cacheSelectionQuads([{page: 0, quads: [[q.x1, q.y1, q.x2, q.y1, q.x1, q.y2, q.x2, q.y2]]}]);
        PDFE.getController('DocumentHolder').onAddHyperlinkFromBar();
    }""", rect)
    if not wait_dialog(s):
        raise RuntimeError('add-link dialog did not open')
    s.pump(300)
    fill_url(s, url)
    if not click_ok(s):
        raise RuntimeError('add-link OK did not close dialog')
    s.pump(400)


def add_link_via_picker(s, rect, node_path):
    s.frame.evaluate("""(q) => {
        const api = Asc.editor;
        const oFile = api.getDocumentRenderer().file;
        oFile.Selection.IsSelection = true;
        oFile.cacheSelectionQuads([{page: 0, quads: [[q.x1, q.y1, q.x2, q.y1, q.x1, q.y2, q.x2, q.y2]]}]);
        PDFE.getController('DocumentHolder').onAddHyperlinkFromBar();
    }""", rect)
    if not wait_dialog(s):
        raise RuntimeError('add-link dialog did not open')
    s.pump(400)
    btn = s.frame.evaluate("""() => {
        var b = document.querySelector('#id-dlg-hyperlink-url .select-button button');
        if (!b) return null;
        var r = b.getBoundingClientRect();
        return {x: r.x, y: r.y, w: r.width, h: r.height};
    }""")
    if not btn or not btn['w']:
        raise RuntimeError('select-file button missing')
    s.page.mouse.click(s.box['x'] + btn['x'] + btn['w'] / 2,
                       s.box['y'] + btn['y'] + btn['h'] / 2)
    picker = None
    for _ in range(40):
        for f in s.page.frames:
            if 'ectd-picker.html' in f.url:
                try:
                    f.wait_for_selector('.file', timeout=3000)
                    picker = f
                    break
                except Exception:
                    pass
        if picker:
            break
        s.pump(500)
    if not picker:
        raise RuntimeError('host picker did not open')
    picker.click(".file[data-path='%s']" % node_path)
    picker.click('#confirm')
    deadline = time.time() + 5
    while time.time() < deadline:
        st = dialog_state(s)
        if st.get('value'):
            break
        s.pump(100)
    s.pump(300)
    value = dialog_state(s)['value']
    if not click_ok(s):
        raise RuntimeError('add-link OK did not close dialog')
    s.pump(400)
    return value


def last_annot_pdf_point(s):
    """Center of the last annotation in PDF user space (y up)."""
    info = s.frame.evaluate("""() => {
        var doc = Asc.editor.getPDFDoc();
        var a = doc.annots[doc.annots.length - 1];
        var r = a.GetRect();
        return {cx: (r[0] + r[2]) / 2, cy: (r[1] + r[3]) / 2,
                pageH: doc.Viewer.file.pages[0].H, rect: r};
    }""")
    return (info['cx'], info['pageH'] - info['cy'])


def annot_state(s, match_file):
    """State of the annotation whose engine/raw action points at match_file."""
    return s.frame.evaluate("""(target) => {
        var doc = Asc.editor.getPDFDoc();
        var dh = PDFE.getController('DocumentHolder');
        var out = [];
        (doc.annots || []).forEach(function(a) {
            if (a.IsLink && !a.IsLink()) return;
            var file = null;
            try {
                // CAnnotationLink.GetActions returns plain info objects
                // ({S, F, page, kind, ...}), not CAction instances.
                var acts = a.GetActions(AscPDF.PDF_TRIGGERS_TYPES.MouseUp);
                if (acts && acts.length &&
                    (acts[0].S === AscPDF.ACTIONS_TYPES.GoToR ||
                     acts[0].S === AscPDF.ACTIONS_TYPES.Launch))
                    file = acts[0].F;
            } catch (e) {}
            if (!file) {
                try {
                    var raw = dh._ectdGetRawLinkAction(a);
                    if (raw) file = raw.file;
                } catch (e) {}
            }
            if (file !== target) return;
            var r = a.GetRect();
            out.push({file: file, rect: r,
                      cx: (r[0] + r[2]) / 2, cy: (r[1] + r[3]) / 2,
                      pageH: doc.Viewer.file.pages[0].H,
                      changed: a.IsChanged(),
                      fromStream: a.IsNeedDrawFromStream(),
                      borderW: a.GetBorderWidth(),
                      name: a.GetName ? a.GetName() : null});
        });
        return out;
    }""", match_file)


def press_shortcut(s, combo):
    """Send a key shortcut into the editor frame (body-level focus)."""
    s.frame.locator('body').first.press(combo)
    s.pump(800)


def click_undo(s):
    # Keyboard, not #id-toolbar-btn-undo: enter_edit_mode() switches modes via
    # Common.NotificationCenter, which does not make the edit-mode toolbar
    # visible, so the button is present but hidden (Playwright can't click it).
    # Ctrl+Z is the documented Undo shortcut for the PDF editor.
    press_shortcut(s, 'Control+z')


def click_redo(s):
    press_shortcut(s, 'Control+y')


def modified(s):
    return s.frame.evaluate("() => Asc.editor.isDocumentModified()")


def wait_modified(s, expected, timeout=5.0):
    """Poll isDocumentModified(): the flag updates on the next UI event loop
    turn after the dialog closes, so a single immediate sample is racy."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if modified(s) is expected:
            return True
        s.pump(100)
    return modified(s) is expected


def save_and_wait(s, timeout=180):
    st0 = os.stat(PDF)
    s.frame.locator('#file').click()
    s.pump(1200)
    s.frame.locator('#fm-btn-save').click()
    deadline = time.time() + timeout
    while time.time() < deadline:
        s.pump(1000)
        st = os.stat(PDF)
        if st.st_mtime != st0.st_mtime and st.st_size > 0:
            s.pump(1500)   # let the callback finish writing/archiving
            return True
    return False


# ---- fixture lifecycle ----------------------------------------------------
def reset_fixture():
    shutil.copy2(PRISTINE, PDF)
    if os.path.isdir(HIST):
        shutil.rmtree(HIST, ignore_errors=True)
    return sha256(PDF)


def settle_and_reset(settle=20):
    """Let the DS status-2 callback (sent when the page closes) land first."""
    time.sleep(settle)
    h = reset_fixture()
    time.sleep(2)
    if sha256(PDF) != h:
        print('late write detected; resetting again', flush=True)
        h = reset_fixture()
        time.sleep(3)
    return sha256(PDF) == sha256(PRISTINE)


def save_artifact(data, name):
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    path = os.path.join(ARTIFACT_DIR, name)
    with open(path, 'wb') as f:
        f.write(data)
    return path


# ---- PDF parsing ----------------------------------------------------------
def read_literal(data, i):
    out = bytearray()
    depth = 1
    mp = {b'n': 10, b'r': 13, b't': 9, b'b': 8, b'f': 12, b'(': 40, b')': 41, b'\\': 92}
    while i < len(data):
        c = data[i:i + 1]
        if c == b'\\':
            nxt = data[i + 1:i + 2]
            if nxt and nxt in b'01234567':
                j = i + 1
                digits = b''
                while j < len(data) and len(digits) < 3 and data[j:j + 1] in b'01234567':
                    digits += data[j:j + 1]
                    j += 1
                out.append(int(digits, 8) & 0xff)
                i = j
                continue
            if nxt in mp:
                out.append(mp[nxt])
                i += 2
                continue
            if nxt in (b'\n', b'\r'):
                i += 2
                if nxt == b'\r' and data[i:i + 1] == b'\n':
                    i += 1
                continue
            if nxt:
                out.append(nxt[0])
            i += 2
            continue
        if c == b'(':
            depth += 1
            out += c
            i += 1
            continue
        if c == b')':
            depth -= 1
            if depth == 0:
                return bytes(out), i + 1
            out += c
            i += 1
            continue
        out += c
        i += 1
    return bytes(out), i


def decode_pdf_text(raw):
    if raw.startswith(b'\xfe\xff'):
        return raw[2:].decode('utf-16-be', 'replace')
    try:
        return raw.decode('utf-8')
    except UnicodeDecodeError:
        return raw.decode('latin-1', 'replace')


def object_map(data):
    """Effective last body of every `N 0 obj ... endobj` (bytes between)."""
    objs = {}
    for m in re.finditer(rb'(?m)^(\d+)\s+0\s+obj\b', data):
        num = int(m.group(1))
        end = data.find(b'endobj', m.end())
        objs[num] = data[m.end():end if end != -1 else len(data)]
    return objs


def extract_action(body):
    m = re.search(rb'/A\s*<<', body)
    if not m:
        return None
    start = m.end() - 2
    depth = 0
    i = start
    while i < len(body):
        if body[i:i + 2] == b'<<':
            depth += 1
            i += 2
            continue
        if body[i:i + 2] == b'>>':
            depth -= 1
            i += 2
            if depth == 0:
                return body[start + 2:i - 2]
            continue
        i += 1
    return None


def action_body(body, objs):
    act = extract_action(body)
    if act is not None:
        return act
    m = re.search(rb'/A\s+(\d+)\s+0\s+R', body)
    if m:
        target = objs.get(int(m.group(1)))
        if target is not None:
            dm = re.search(rb'<<(.*)>>', target, re.S)
            return dm.group(1) if dm else target
    return None


def effective_links(data):
    objs = object_map(data)
    links = []
    for num, body in objs.items():
        if not re.search(rb'/Subtype\s*/Link\b', body):
            continue
        act = action_body(body, objs)
        if act is None:
            continue
        sm = re.search(rb'/S\s*/(\w+)', act)
        if not sm:
            continue
        kind = sm.group(1).decode()
        fm = re.search(rb'/(?:UF|F)\s*\(', act)
        files = []
        if fm:
            raw, _ = read_literal(act, fm.end())
            files.append(decode_pdf_text(raw))
        dest = None
        dm = re.search(rb'/D\s*\[\s*(-?\d+)\s*/(\w+)([^\]]*)\]', act)
        if dm:
            def num_or_str(v):
                if v == b'null':
                    return None
                try:
                    return float(v) if b'.' in v else int(v)
                except ValueError:
                    return v.decode('latin-1')
            dest = {'page': int(dm.group(1)), 'kind': dm.group(2).decode(),
                    'args': [num_or_str(a) for a in dm.group(3).split()]}
        uri = None
        um = re.search(rb'/URI\s*\(', act)
        if um:
            raw, _ = read_literal(act, um.end())
            uri = decode_pdf_text(raw)
        nm = None
        nmm = re.search(rb'/NM\s*\(', body)
        if nmm:
            raw, _ = read_literal(body, nmm.end())
            nm = decode_pdf_text(raw)
        rect = None
        rm = re.search(rb'/Rect\s*\[\s*([^\]]*)\]', body)
        if rm:
            try:
                rect = [float(x) for x in rm.group(1).split()]
            except ValueError:
                rect = None
        links.append({'obj': num, 'S': kind, 'files': files, 'dest': dest,
                      'uri': uri, 'nm': nm, 'rect': rect,
                      'hasAP': b'/AP' in body,
                      'borderW': (re.search(rb'/W\s+([\d.]+)', body) or [None, None])[1]})
    return links


def link_object_fragment(data, target_file):
    """Raw object fragment of the link whose effective /A targets target_file.

    Matching goes through the parsed action (effective_links) rather than a raw
    byte search: non-ASCII /F values are written as escaped literals or
    filespec dicts, so ``target_file.encode()`` never appears verbatim.
    """
    objs = object_map(data)
    for l in effective_links(data):
        if l['files'] and l['files'][0] == target_file:
            return l['obj'], objs[l['obj']].strip().decode('latin-1')
    return None, None


def print_fragment(title, data, target_file):
    num, body = link_object_fragment(data, target_file)
    print('   --- %s (object %s) ---' % (title, num), flush=True)
    print(body if body else '(not found)', flush=True)


def find_link(links, **kw):
    out = []
    for l in links:
        ok = True
        for k, v in kw.items():
            if k == 'file':
                ok = ok and bool(l['files']) and l['files'][0] == v
            else:
                ok = ok and l.get(k) == v
        if ok:
            out.append(l)
    return out


# ---- cases ----------------------------------------------------------------
def case_uri_regression(browser):
    print('== acceptance 5: /URI regression ==', flush=True)
    reset_fixture()
    s = Session(browser, 'uri', ectd_conf(MOCK))
    try:
        check('5 edit mode', enter_edit_mode(s) is True)
        open_link_dialog(s, PT['URI'])
        st = wait_dialog_value(s, URI_OLD)
        check('5 dialog shows the old URI', st.get('value') == URI_OLD, st.get('value'))
        fill_url(s, URI_NEW)
        check('5 OK closes the dialog', click_ok(s) is not None)
        check('5 save reported back', save_and_wait(s))
        check('5 no page errors', not s.errors, s.errors)
        data = open(PDF, 'rb').read()
        save_artifact(data, 'uri-regression.pdf')
    finally:
        s.close()
    links = effective_links(data)
    new = find_link(links, S='URI', uri=URI_NEW)
    check('5 saved /URI carries the new value', bool(new), [l.get('uri') for l in links])
    check('5 old URI gone', not find_link(links, uri=URI_OLD))
    check('5 still /S /URI, no /F', bool(new) and all(l['S'] == 'URI' and not l['files'] for l in new))
    check('5 fixture rescoped', settle_and_reset())


def case_gotor_and_second_edit(browser):
    print('== acceptance 1/3/7/8: /GoToR + /AP edit, save, reopen, edit again ==', flush=True)
    pristine = open(PRISTINE, 'rb').read()
    plinks = effective_links(pristine)
    old = find_link(plinks, file=LEAF_G)
    check('8 fixture is a pre-fix save (old /GoToR leaf link exists)', bool(old),
          [(l['obj'], l['files'], l['hasAP']) for l in plinks])
    check('8 fixture link has /AP + non-zero border (bug preconditions)',
          bool(old) and old[0]['hasAP'] and old[0]['borderW'] == b'1',
          old[0] if old else None)
    old_nm = old[0]['nm'] if old else None
    old_rect = old[0]['rect'] if old else None

    reset_fixture()
    # --- session 1: edit -> save
    s = Session(browser, 'gotor-1', ectd_conf(MOCK))
    try:
        check('1 edit mode', enter_edit_mode(s) is True)
        prelim = annot_state(s, LEAF_G)
        check('1 preconditions in editor: drawn from /AP, border 1, unchanged',
              bool(prelim) and prelim[0]['fromStream'] is True and
              prelim[0]['borderW'] == 1 and prelim[0]['changed'] is False,
              prelim)
        open_link_dialog(s, PT['GoToR'])
        st = wait_dialog_value(s, HREF_G)
        check('1 dialog shows the resolved published path', st.get('value') == HREF_G, st.get('value'))
        fill_url(s, NEW1)
        check('1 OK closes the dialog', click_ok(s) is not None)
        mid = annot_state(s, NEW1)
        check('1 edited annot owns its bytes (changed, not from stream)',
              bool(mid) and mid[0]['changed'] is True and mid[0]['fromStream'] is False, mid)
        check('1 save reported back', save_and_wait(s))
        check('1 no page errors', not s.errors, s.errors)
        data1 = open(PDF, 'rb').read()
        save_artifact(data1, 'gotor-edit1.pdf')
    finally:
        s.close()
        time.sleep(3)

    links1 = effective_links(data1)
    new1 = find_link(links1, S='GoToR', file=NEW1)
    check('1 saved /A has the new /F', bool(new1),
          [(l['obj'], l['S'], l['files']) for l in links1])
    check('1 saved /D is still [page /XYZ ...]',
          bool(new1) and new1[0]['dest'] == {'page': 0, 'kind': 'XYZ', 'args': [None, None, None]},
          new1[0]['dest'] if new1 else None)
    check('1 old leaf /F replaced', not find_link(links1, file=LEAF_G))
    check('1 link never written as /URI',
          not find_link(links1, S='URI', uri=NEW1) and not find_link(links1, S='URI', uri=LEAF_G))
    check('1 annotation identity kept (/NM, /Rect)',
          bool(new1) and new1[0]['nm'] == old_nm and new1[0]['rect'] == old_rect,
          (new1[0]['nm'], new1[0]['rect']) if new1 else None)
    print_fragment('saved /GoToR link (first edit)', data1, NEW1)

    # --- session 2 (reopen): second edit -> save
    s = Session(browser, 'gotor-2', ectd_conf(MOCK))
    try:
        check('3 reopen: edit mode', enter_edit_mode(s) is True)
        open_link_dialog(s, PT['GoToR'])
        st = wait_dialog_value(s, NEW1)
        check('3 reopened link shows the first edit', st.get('value') == NEW1, st.get('value'))
        fill_url(s, NEW2)
        check('3 second edit OK closes the dialog', click_ok(s) is not None)
        check('3 second save reported back', save_and_wait(s))
        check('3 no page errors after reopen', not s.errors, s.errors)
        data2 = open(PDF, 'rb').read()
        save_artifact(data2, 'gotor-edit2.pdf')
    finally:
        s.close()
    links2 = effective_links(data2)
    new2 = find_link(links2, S='GoToR', file=NEW2)
    check('3 second edit persisted', bool(new2), [(l['obj'], l['files']) for l in links2])
    check('3 first target replaced', not find_link(links2, file=NEW1))
    check('3 /D still /XYZ after second edit',
          bool(new2) and new2[0]['dest'] == {'page': 0, 'kind': 'XYZ', 'args': [None, None, None]},
          new2[0]['dest'] if new2 else None)
    print_fragment('saved /GoToR link (second edit after reopen)', data2, NEW2)
    check('3 fixture rescoped', settle_and_reset())

    # --- acceptance 7: minimal change surface (first save vs pristine)
    case_minimal_diff(pristine, data1)


def case_minimal_diff(pristine, saved):
    print('== acceptance 7: object-level diff of the first save ==', flush=True)
    old = object_map(pristine)
    new = object_map(saved)
    common = [n for n in old if n in new]
    unchanged = [n for n in common if old[n] == new[n]]
    changed = [n for n in common if old[n] != new[n]]
    removed = [n for n in old if n not in new]
    added = [n for n in new if n not in old]
    print('   unchanged objects: %s' % sorted(unchanged), flush=True)
    print('   changed objects:   %s' % sorted(changed), flush=True)
    print('   removed objects:   %s' % sorted(removed), flush=True)
    print('   added objects:     %s' % sorted(added), flush=True)

    def is_link_annot(body):
        return b'/Subtype /Link' in body or b'/Subtype/Link' in body

    old_links = {n for n, b in old.items() if is_link_annot(b)}
    edited = 5
    others = old_links - {edited}
    check('7 page content stream is byte-identical', 10 in unchanged, {'10': 10 in unchanged})
    check('7 all other annotation objects are byte-identical',
          others and others <= set(unchanged), sorted(others - set(unchanged)))
    edited_changed = edited in changed or edited in removed
    check('7 only the edited annotation object changed', edited_changed,
          {'changed': sorted(changed), 'removed': sorted(removed)})
    # The edited object (or its replacement) is the only new/changed annot.
    new_links = {n for n, b in new.items() if is_link_annot(b)}
    new_only = new_links - old_links
    check('7 at most one new annotation object appears', len(new_only) <= 1, sorted(new_only))
    # The rewritten annot may keep its object number or be appended anew;
    # locate it through the parsed action, since non-ASCII /F is written as an
    # escaped literal / filespec dict and never matches raw utf-8 bytes.
    body = b''
    action_text = b''
    for l in effective_links(saved):
        if l['files'] and l['files'][0] == NEW1:
            body = new[l['obj']]
            action_text = action_body(body, new) or b''
            break
    check('7 rewritten annotation carries the new /F and /XYZ',
          bool(body) and b'/XYZ' in action_text,
          {'annot': body[:160], 'action': action_text[:200]})
    fixture_body = old[edited]
    nm_old = re.search(rb'/NM\s*\(([^)]*)\)', fixture_body)
    nm_new = re.search(rb'/NM\s*\(([^)]*)\)', body)
    check('7 /NM preserved on the rewritten annotation',
          bool(nm_old and nm_new) and nm_old.group(1) == nm_new.group(1),
          (nm_old.group(1) if nm_old else None, nm_new.group(1) if nm_new else None))
    print('   --- edited object BEFORE ---\n%s' %
          fixture_body.strip().decode('latin-1'), flush=True)
    print('   --- edited object AFTER (annotation) ---\n%s' %
          body.strip().decode('latin-1'), flush=True)
    if action_text:
        print('   --- edited object AFTER (resolved /A) ---\n%s' %
              action_text.strip().decode('latin-1'), flush=True)


def case_launch(browser):
    print('== acceptance 2: /Launch branch ==', flush=True)
    reset_fixture()
    s = Session(browser, 'launch', ectd_conf(MOCK))
    try:
        check('2 edit mode', enter_edit_mode(s) is True)
        prelim = annot_state(s, LEAF_L)
        check('2 preconditions in editor: /AP, border 1, unchanged',
              bool(prelim) and prelim[0]['fromStream'] is True and
              prelim[0]['borderW'] == 1 and prelim[0]['changed'] is False, prelim)
        open_link_dialog(s, PT['Launch'])
        st = wait_dialog_value(s, HREF_L)
        check('2 dialog shows the resolved Launch target', st.get('value') == HREF_L, st.get('value'))
        fill_url(s, LAUNCH_PATH)
        check('2 OK closes the dialog', click_ok(s) is not None)
        check('2 save reported back', save_and_wait(s))
        check('2 no page errors', not s.errors, s.errors)
        data = open(PDF, 'rb').read()
        save_artifact(data, 'launch-edit.pdf')
    finally:
        s.close()
    links = effective_links(data)
    new = find_link(links, S='Launch', file=LAUNCH_PATH)
    check('2 saved /A is /S /Launch with the new /F', bool(new),
          [(l['obj'], l['S'], l['files']) for l in links])
    check('2 /Launch writes no /D', bool(new) and all(l['dest'] is None for l in new))
    check('2 old leaf target replaced', not find_link(links, file=LEAF_L))
    print_fragment('saved /Launch link', data, LAUNCH_PATH)
    check('2 fixture rescoped', settle_and_reset())


def case_new_link_roundtrip(browser):
    print('== acceptance 4: new link -> save -> reopen -> edit -> save ==', flush=True)
    reset_fixture()
    s = Session(browser, 'newlink-1', ectd_conf(MOCK))
    try:
        check('4 edit mode', enter_edit_mode(s) is True)
        picked = add_link_via_picker(s, NEW_RECT, PICK_NODE)
        check('4 picker returns the relative path', picked == PICK_PATH, picked)
        check('4 save reported back', save_and_wait(s))
        check('4 no page errors', not s.errors, s.errors)
        data1 = open(PDF, 'rb').read()
        save_artifact(data1, 'newlink-created.pdf')
    finally:
        s.close()
        time.sleep(3)
    links1 = effective_links(data1)
    new1 = find_link(links1, S='GoToR', file=PICK_PATH)
    check('4 created link persisted as /GoToR', bool(new1),
          [(l['obj'], l['S'], l['files']) for l in links1])

    s = Session(browser, 'newlink-2', ectd_conf(MOCK))
    try:
        check('4 reopen: edit mode', enter_edit_mode(s) is True)
        pt = last_annot_pdf_point(s)
        open_link_dialog(s, pt)
        st = wait_dialog_value(s, PICK_PATH)
        check('4 reopened new link shows the picked path', st.get('value') == PICK_PATH, st.get('value'))
        fill_url(s, NEW2)
        check('4 edit OK closes the dialog', click_ok(s) is not None)
        check('4 second save reported back', save_and_wait(s))
        check('4 no page errors after reopen', not s.errors, s.errors)
        data2 = open(PDF, 'rb').read()
        save_artifact(data2, 'newlink-edited.pdf')
    finally:
        s.close()
    links2 = effective_links(data2)
    new2 = find_link(links2, S='GoToR', file=NEW2)
    check('4 new link edit persisted', bool(new2), [(l['obj'], l['files']) for l in links2])
    check('4 previous target replaced', not find_link(links2, file=PICK_PATH))
    check('4 fixture rescoped', settle_and_reset())


def case_undo(browser):
    print('== acceptance 6a: edit -> undo -> save keeps the old target ==', flush=True)
    reset_fixture()
    s = Session(browser, 'undo', ectd_conf(MOCK))
    try:
        check('6a edit mode', enter_edit_mode(s) is True)
        open_link_dialog(s, PT['GoToR'])
        check('6a dialog shows the resolved path',
              wait_dialog_value(s, HREF_G).get('value') == HREF_G)
        fill_url(s, NEW1)
        check('6a OK closes the dialog', click_ok(s) is not None)
        check('6a document is modified after the edit', wait_modified(s, True))
        click_undo(s)
        check('6a undo reverts the edit (document unmodified)', wait_modified(s, False))
        state = annot_state(s, LEAF_G)
        check('6a undo restores the stream-drawn, unchanged annot',
              bool(state) and state[0]['changed'] is False and state[0]['fromStream'] is True, state)
        # Make the document modified again so Save actually pushes the file.
        add_uri_link(s, {'x1': 215, 'y1': 120, 'x2': 285, 'y2': 155}, FORCER)
        check('6a forcer link makes the document modified', wait_modified(s, True))
        check('6a save reported back', save_and_wait(s))
        check('6a no page errors', not s.errors, s.errors)
        data = open(PDF, 'rb').read()
        save_artifact(data, 'undo-save.pdf')
    finally:
        s.close()
    links = effective_links(data)
    check('6a saved file still holds the old leaf target', bool(find_link(links, file=LEAF_G)),
          [(l['obj'], l['files']) for l in links])
    check('6a reverted target is absent', not find_link(links, file=NEW1))
    check('6a forcer link present', bool(find_link(links, uri=FORCER)))
    print_fragment('saved /GoToR link (after undo)', data, LEAF_G)
    check('6a fixture rescoped', settle_and_reset())


def case_redo(browser):
    print('== acceptance 6b: edit -> undo -> redo -> save keeps the new target ==', flush=True)
    reset_fixture()
    s = Session(browser, 'redo', ectd_conf(MOCK))
    try:
        check('6b edit mode', enter_edit_mode(s) is True)
        open_link_dialog(s, PT['GoToR'])
        check('6b dialog shows the resolved path',
              wait_dialog_value(s, HREF_G).get('value') == HREF_G)
        fill_url(s, NEW1)
        check('6b OK closes the dialog', click_ok(s) is not None)
        click_undo(s)
        check('6b undo leaves the document unmodified', wait_modified(s, False))
        click_redo(s)
        check('6b redo re-applies the edit (modified)', wait_modified(s, True))
        state = annot_state(s, NEW1)
        check('6b redo restores owned bytes (changed, not from stream)',
              bool(state) and state[0]['changed'] is True and state[0]['fromStream'] is False, state)
        check('6b save reported back', save_and_wait(s))
        check('6b no page errors', not s.errors, s.errors)
        data = open(PDF, 'rb').read()
        save_artifact(data, 'redo-save.pdf')
    finally:
        s.close()
    links = effective_links(data)
    new = find_link(links, S='GoToR', file=NEW1)
    check('6b saved file holds the new target', bool(new),
          [(l['obj'], l['S'], l['files']) for l in links])
    check('6b old leaf target replaced', not find_link(links, file=LEAF_G))
    check('6b /D still /XYZ', bool(new) and new[0]['dest'] ==
          {'page': 0, 'kind': 'XYZ', 'args': [None, None, None]},
          new[0]['dest'] if new else None)
    check('6b exactly one saved target (no leftover duplicate)',
          len(find_link(links, S='GoToR', file=NEW1)) == 1, len(new))
    print_fragment('saved /GoToR link (after redo)', data, NEW1)
    check('6b fixture rescoped', settle_and_reset())


def main():
    if not os.path.isfile(PRISTINE):
        print('missing fixture:', PRISTINE, flush=True)
        return 1
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    print('fixture:', PRISTINE, sha256(PRISTINE), flush=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium-browser',
                                     headless=True, args=['--no-sandbox'])
        try:
            case_uri_regression(browser)
            case_gotor_and_second_edit(browser)
            case_launch(browser)
            case_new_link_roundtrip(browser)
            case_undo(browser)
            case_redo(browser)
        finally:
            browser.close()

    failed = [r for r in results if not r[1]]
    print('\n%d checks, %d failed' % (len(results), len(failed)), flush=True)
    for name, ok, detail in failed:
        print('  FAILED:', name, detail, flush=True)
    print('EDIT_LINK_PERSIST_E2E:', 'PASS' if not failed else 'FAIL', flush=True)
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
