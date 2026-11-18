"""Assemble every page: src/head.html + the page's data and settings + src/app.js.

usage: build.py <repo_root> [<test_dir> <local_three_js>]
With a test dir, a copy of each page is also written there that loads three.js from a local file.
"""
import sys, os, json, glob
root = sys.argv[1]
test, three = (sys.argv[2], sys.argv[3]) if len(sys.argv) > 3 else (None, None)
CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
head = open(f"{root}/src/head.html").read(); app = open(f"{root}/src/app.js").read()
for path in sorted(glob.glob(f"{root}/src/pages/*.json")):
    pg = json.load(open(path))
    h = head
    for k, v in {"TITLE": pg["title"], "DESC": pg["desc"], "URL": pg["url"], "UNIT": pg["unit"], "NAV_HREF": pg["nav_href"],
                 "NAV_TEXT": pg["nav_text"], "ARIA": pg["aria"], "ABOUT": pg["about"]}.items():
        h = h.replace("{{" + k + "}}", v)
    assert "{{" not in h, path
    data = open(f"{root}/{pg['data']}").read().replace("</", "<\\/")
    conf = json.dumps(pg["config"], ensure_ascii=False).replace("</", "<\\/")
    html = h + "<script>\nconst DATA=" + data + ";\nconst CONFIG=" + conf + ";\n" + app + "</script>\n</body>\n</html>\n"
    os.makedirs(os.path.dirname(f"{root}/{pg['out']}") or ".", exist_ok=True)
    open(f"{root}/{pg['out']}", "w").write(html)
    if test:
        os.makedirs(os.path.dirname(f"{test}/{pg['out']}"), exist_ok=True)
        open(f"{test}/{pg['out']}", "w").write(html.replace(CDN, three))
    print("built", pg["out"], len(html))
