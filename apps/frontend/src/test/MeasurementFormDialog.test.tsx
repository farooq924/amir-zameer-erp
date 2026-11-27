import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeasurementFormDialog } from '@/features/measurements/MeasurementFormDialog';
import type { Measurement, MeasurementTemplate } from '@/types';

const template: MeasurementTemplate = {
  id: 't1', code: 'SHIRT', name: 'Shirt', garmentCategory: 'SHIRT', defaultUnit: 'INCH', isSystem: true, isActive: true,
  fields: [
    { id: 'f1', key: 'length', label: 'Length', sortOrder: 10, isRequired: true, isActive: true },
    { id: 'f2', key: 'chest', label: 'Chest', sortOrder: 20, isRequired: false, isActive: true },
    { id: 'f3', key: 'old', label: 'Old Field', sortOrder: 30, isRequired: false, isActive: false },
  ],
};
const previous: Measurement = {
  id: 'm1', customer: { id: 'c1', code: 'AZC-1', name: 'Ali', mobile: '923001234567' }, template: { id: 't1', code: 'SHIRT', name: 'Shirt', garmentCategory: 'SHIRT' },
  versionNo: 2, unit: 'INCH', isLatest: true, takenAt: '2026-11-20T10:00:00Z', takenByName: null, notes: null, createdBy: null,
  values: [
    { fieldKey: 'length', fieldLabel: 'Length', isCustom: false, value: '30.00', textValue: null },
    { fieldKey: 'collar_style', fieldLabel: 'Collar Style', isCustom: true, value: null, textValue: 'Ban' },
  ],
};

function renderDialog(latest: Record<string, Measurement> = {}) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MeasurementFormDialog open onOpenChange={() => {}} customerId="c1" templates={[template]} latest={latest} />
    </QueryClientProvider>,
  );
}

describe('MeasurementFormDialog', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows only active fields and blocks saving without required values', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderDialog();
    expect(screen.getByLabelText(/^Length/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Old Field')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects values that are not numbers or out of range', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/^Length/), '30');
    await userEvent.type(screen.getByLabelText('Chest'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    expect(await screen.findByText('Use a number like 40 or 40.5')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Chest'));
    await userEvent.type(screen.getByLabelText('Chest'), '500');
    await userEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    expect(await screen.findByText(/Must be between 0 and 150/)).toBeInTheDocument();
  });

  it('prefills from the latest version and converts when the unit changes', async () => {
    renderDialog({ t1: previous });
    expect(screen.getByText(/Prefilled from version 2/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Length/)).toHaveValue('30');
    expect(screen.getByDisplayValue('Collar Style')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'CM' } });
    expect(screen.getByLabelText(/^Length/)).toHaveValue('76.2');
  });

  it('sends a new version with an idempotency id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...previous, versionNo: 3 }), { status: 201 }),
    );
    renderDialog({ t1: previous });
    await userEvent.type(screen.getByLabelText('Chest'), '40.5');
    await userEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/customers/c1/measurements');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.values).toEqual([{ fieldKey: 'length', value: '30' }, { fieldKey: 'chest', value: '40.5' }]);
    expect(body.customValues).toEqual([{ label: 'Collar Style', textValue: 'Ban' }]);
  });
});
