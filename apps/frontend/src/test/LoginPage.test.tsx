import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import { useAuth } from '@/store/auth';

function renderLogin() {
  useAuth.setState({ status: 'anonymous', user: null });
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

describe('LoginPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('validates required fields before calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter your username or email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the server error message on failed login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 401, message: 'Invalid username or password' }), { status: 401 }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText(/username or email/i), 'owner');
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password');
  });

  it('sends credentials with cookies included', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: '1', fullName: 'O', email: 'o@x', username: 'owner', isOwner: true, roles: [], permissions: [], sessionId: 's' }, csrfToken: 'c' }), { status: 200 }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText(/username or email/i), 'owner');
    await userEvent.type(screen.getByLabelText(/^password/i), 'OwnerPass123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect((init as RequestInit).credentials).toBe('include');
    expect(useAuth.getState().status).toBe('authenticated');
  });
});
