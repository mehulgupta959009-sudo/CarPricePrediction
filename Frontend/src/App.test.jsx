import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

describe('App', () => {
  it('submits the entered car details to the backend', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'received' }),
    });

    global.fetch = fetchSpy;

    render(<App />);

    fireEvent.change(screen.getByLabelText(/car company/i), { target: { value: 'BMW' } });
    fireEvent.change(screen.getByLabelText(/car model/i), { target: { value: '3 Series' } });
    fireEvent.change(screen.getByLabelText(/year of purchase/i), { target: { value: '2021' } });
    fireEvent.change(screen.getByLabelText(/kilometers driven/i), { target: { value: '30000' } });
    fireEvent.change(screen.getByLabelText(/fuel type/i), { target: { value: 'Diesel' } });

    fireEvent.click(screen.getByRole('button', { name: /send to backend/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/predict',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company: 'BMW',
            model: '3 Series',
            yearOfPurchase: '2021',
            kilometersDriven: '30000',
            fuelType: 'Diesel',
          }),
        })
      );
    });
  });
});
