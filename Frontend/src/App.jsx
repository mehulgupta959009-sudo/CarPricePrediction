import { useMemo, useState } from 'react';

const fuelTypes = ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'];

const companyModels = {
  Toyota: ['Camry', 'Corolla', 'Fortuner', 'Prius'],
  Honda: ['Civic', 'Accord', 'City', 'CR-V'],
  Hyundai: ['Elantra', 'i20', 'Creta', 'Sonata'],
  BMW: ['3 Series', '5 Series', 'X1', 'X5'],
  Mercedes: ['C Class', 'E Class', 'GLC', 'S Class'],
  Tata: ['Nexon', 'Harrier', 'Tiago', 'Altroz'],
};

function App() {
  const [company, setCompany] = useState('Toyota');
  const [model, setModel] = useState(companyModels.Toyota[0]);
  const [year, setYear] = useState('2022');
  const [kms, setKms] = useState('25000');
  const [fuel, setFuel] = useState('Petrol');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const availableModels = useMemo(() => companyModels[company] || [], [company]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setMessage('Sending your car details to the backend…');

    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          model,
          yearOfPurchase: year,
          kilometersDriven: kms,
          fuelType: fuel,
        }),
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        console.error('Prediction request failed', data);
        throw new Error(data.error || data.message || 'Unable to submit data right now.');
      }

      setStatus('success');
      setMessage(`Estimated price: ₹${data.estimatedPrice?.toLocaleString('en-IN') || 'n/a'}`);
    } catch (error) {
      console.error('Prediction request error', error);
      setStatus('error');
      setMessage(error.message || 'Submission failed.');
    }
  };

  return (
    <div className="page-shell">
      <div className="hero-card">
        <div className="hero-content">
          <p className="eyebrow">AI-powered valuation platform</p>
          <h1>Car Price Predictor</h1>
          <p className="hero-copy">
            Submit your vehicle details to the backend pipeline for future model training and price analysis.
          </p>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-pill">📡 API ready</div>
          <div className="visual-pill alt">🧠 Model-ready data</div>
        </div>
      </div>

      <div className="app-card">
        <div className="card-header">
          <div>
            <p className="section-label">Prediction intake form</p>
            <h2>Enter vehicle information</h2>
          </div>
          <div className="status-chip" data-status={status}>
            {status === 'loading' ? 'Submitting' : status === 'success' ? 'Submitted' : status === 'error' ? 'Issue' : 'Ready'}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="predict-form">
          <div className="field-grid">
            <label htmlFor="company">
              <span>Car Company</span>
              <select id="company" value={company} onChange={(e) => {
                const nextCompany = e.target.value;
                setCompany(nextCompany);
                setModel(companyModels[nextCompany][0]);
              }}>
                {Object.keys(companyModels).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label htmlFor="model">
              <span>Car Model</span>
              <select id="model" value={model} onChange={(e) => setModel(e.target.value)}>
                {availableModels.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label htmlFor="year">
              <span>Year of Purchase</span>
              <input
                id="year"
                type="number"
                min="1990"
                max="2035"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
              />
            </label>

            <label htmlFor="kms">
              <span>Kilometers Driven</span>
              <input
                id="kms"
                type="number"
                min="0"
                step="1000"
                value={kms}
                onChange={(e) => setKms(e.target.value)}
                required
              />
            </label>

            <label htmlFor="fuel">
              <span>Fuel Type</span>
              <select id="fuel" value={fuel} onChange={(e) => setFuel(e.target.value)}>
                {fuelTypes.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>

          <button type="submit">Send to Backend</button>
        </form>

        {message && (
          <div className={`result-card ${status}`} role="status">
            <p className="result-title">Submission status</p>
            <p>{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
