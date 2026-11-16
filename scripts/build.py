import sys, json
site, data, out, test = sys.argv[1:5]
d = open(data).read().replace("</", "<\\/")
html = open(site+"/head.html").read() + "<script>\nconst DATA=" + d + ";\n" + open(site+"/app.js").read() + "</script>\n</body>\n</html>\n"
open(out, "w").write(html)
open(test, "w").write(html.replace("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js", "node_modules/three/build/three.min.js"))
