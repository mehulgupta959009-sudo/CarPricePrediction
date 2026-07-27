import csv
import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, 'quikr_car.csv')
FRONTEND_DIST_PATH = os.path.abspath(os.path.join(BASE_DIR, '..', 'Frontend', 'dist'))
INDEX_PATH = os.path.join(FRONTEND_DIST_PATH, 'index.html')
HOST = os.environ.get('HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', '5000'))


def normalize_text(value: str) -> str:
    return (value or '').strip().lower()


class PredictionHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self, file_path):
        with open(file_path, 'rb') as handle:
            body = handle.read()

        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = 'application/octet-stream'

        self.send_response(200)
        self.send_header('Content-Type', mime_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_frontend(self, requested_path):
        if requested_path in ('', '/'):
            file_path = INDEX_PATH
        else:
            relative_path = unquote(requested_path.lstrip('/'))
            file_path = os.path.normpath(os.path.join(FRONTEND_DIST_PATH, relative_path))

            if not os.path.commonpath([FRONTEND_DIST_PATH, file_path]) == FRONTEND_DIST_PATH:
                self._send_json(403, {'error': 'Forbidden'})
                return

            if os.path.isdir(file_path):
                file_path = os.path.join(file_path, 'index.html')

        if os.path.exists(file_path) and os.path.isfile(file_path):
            self._serve_file(file_path)
            return

        if os.path.exists(INDEX_PATH):
            self._serve_file(INDEX_PATH)
            return

        self._send_json(404, {'error': 'Frontend build not found. Run npm run build first.'})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/health':
            self._send_json(200, {'status': 'ok'})
            return

        if parsed.path.startswith('/api/'):
            self._send_json(404, {'error': 'Not found'})
            return

        self._serve_frontend(parsed.path)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/api/predict':
            self._send_json(404, {'error': 'Not found'})
            return

        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length).decode('utf-8')

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self._send_json(400, {'error': 'Invalid JSON'})
            return

        company = normalize_text(payload.get('company'))
        model = normalize_text(payload.get('model'))
        year = int(payload.get('yearOfPurchase', 0) or 0)
        kilometers = int(payload.get('kilometersDriven', 0) or 0)
        fuel = normalize_text(payload.get('fuelType'))

        try:
            estimate = self._predict_price(company, model, year, kilometers, fuel)
        except ValueError as exc:
            self._send_json(400, {'error': str(exc)})
            return

        self._send_json(200, {
            'message': 'Prediction received',
            'estimatedPrice': estimate,
            'currency': 'INR',
            'details': {
                'company': payload.get('company'),
                'model': payload.get('model'),
                'yearOfPurchase': year,
                'kilometersDriven': kilometers,
                'fuelType': payload.get('fuelType'),
            },
        })

    def _predict_price(self, company, model, year, kilometers, fuel):
        if not company or not model or not year or not kilometers or not fuel:
            raise ValueError('All fields are required')

        company_rows = []
        with open(DATA_PATH, newline='', encoding='utf-8') as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                if not row:
                    continue
                if normalize_text(row.get('company')) != company:
                    continue
                company_rows.append(row)

        if not company_rows:
            raise ValueError('No matching data found for the supplied car details')

        rows = []
        for row in company_rows:
            name = normalize_text(row.get('name'))
            if model and name and model not in name:
                continue
            if row.get('fuel_type'):
                fuel_value = normalize_text(row.get('fuel_type'))
                if fuel_value != fuel and fuel_value.replace(' ', '') != fuel.replace(' ', ''):
                    continue
            rows.append(row)

        if not rows:
            rows = [row for row in company_rows if row.get('fuel_type')]
            if not rows:
                rows = company_rows

        if not rows:
            raise ValueError('No matching data found for the supplied car details')

        prices = []
        for row in rows:
            raw_price = (row.get('Price') or '').replace(',', '').replace('Ask For Price', '0')
            try:
                price = float(raw_price)
            except ValueError:
                continue
            prices.append(price)

        if not prices:
            raise ValueError('No usable pricing entries available for this car profile')

        average_price = sum(prices) / len(prices)
        age_factor = max(0, 2026 - year)
        kilometer_factor = kilometers / 10000
        adjustment = average_price * (0.03 * age_factor + 0.01 * kilometer_factor)
        prediction = average_price - adjustment
        return round(prediction, 2)

    def log_message(self, format, *args):
        return


def main():
    server = ThreadingHTTPServer((HOST, PORT), PredictionHandler)
    print(f'Backend running on http://{HOST}:{PORT}')
    server.serve_forever()


if __name__ == '__main__':
    main()
