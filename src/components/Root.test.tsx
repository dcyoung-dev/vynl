import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Root from './Root';

const installDemo = vi.hoisted(() => vi.fn());

vi.mock('../demo/installDemo', () => ({ installDemo }));
vi.mock('./App', () => ({ default: () => <p>the app</p> }));

describe('Root', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    installDemo.mockClear();
  });

  it('renders the app straight away without the demo flag', () => {
    render(<Root />);
    expect(screen.getByText('the app')).toBeInTheDocument();
    expect(installDemo).not.toHaveBeenCalled();
  });

  it('renders nothing until the demo is installed when the flag is set', async () => {
    vi.stubEnv('PUBLIC_VYNL_DEMO', 'true');
    const { container } = render(<Root />);
    expect(container).toBeEmptyDOMElement();
    expect(await screen.findByText('the app')).toBeInTheDocument();
    expect(installDemo).toHaveBeenCalledOnce();
  });

  it('ignores any other flag value', () => {
    vi.stubEnv('PUBLIC_VYNL_DEMO', 'false');
    render(<Root />);
    expect(screen.getByText('the app')).toBeInTheDocument();
    expect(installDemo).not.toHaveBeenCalled();
  });
});
