PORT = 8000

import BaseHTTPServer, SimpleHTTPServer
BaseHTTPServer.HTTPServer(('localhost', PORT), SimpleHTTPServer.SimpleHTTPRequestHandler).serve_forever()
