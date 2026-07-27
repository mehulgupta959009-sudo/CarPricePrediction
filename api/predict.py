import csv
import json
import os
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / 'Backend' / 'quikr_car.csv'


def normalize_text(value):
    return (value or '').strip().lower()


def _predict_price(company, model, year, kilometers, fuel):
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


def app(request, context=None):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }

    method = None
    body = '{}'

    if isinstance(request, dict):
        method = request.get('method') or request.get('httpMethod')
        body = request.get('body', '{}')

        if isinstance(body, str) and body.startswith('{') and body.endswith('}'):
            pass
        else:
            body = '{}'

        if 'body' not in request and 'data' in request:
            body = request.get('data', '{}')

    elif hasattr(request, 'method'):
        method = request.method
        body = getattr(request, 'body', '{}')

    if method == 'OPTIONS':
        return {'statusCode': 204, 'headers': headers, 'body': ''}

    if method != 'POST':
        return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'error': 'Method not allowed'})}

    if isinstance(body, bytes):
        body = body.decode('utf-8')

    try:
        payload = json.loads(body) if isinstance(body, str) else body
    except json.JSONDecodeError:
        return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Invalid JSON'})}

    company = normalize_text(payload.get('company'))
    model = normalize_text(payload.get('model'))
    year = int(payload.get('yearOfPurchase', 0) or 0)
    kilometers = int(payload.get('kilometersDriven', 0) or 0)
    fuel = normalize_text(payload.get('fuelType'))

    try:
        estimate = _predict_price(company, model, year, kilometers, fuel)
    except ValueError as exc:
        return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': str(exc)})}

    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps({
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
        }),
    }


# Vercel Python runtime expects an exported app or handler function.
def handler(request, context=None):
    return app(request, context)
