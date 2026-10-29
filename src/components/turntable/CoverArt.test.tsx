import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Album } from '../../lib/store/queue';
import CoverArt from './CoverArt';

const album: Album = {
  id: 'a1',
  uri: 'spotify:album:a1',
  name: 'Kind of Blue',
  artists: ['Miles Davis'],
  imageUrl: 'https://i.scdn.co/image/kob',
  tracks: [],
};

describe('CoverArt', () => {
  it('renders a single square img with nothing drawn over it', () => {
    const { container } = render(<CoverArt album={album} />);
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    const img = screen.getByRole('img', { name: 'Kind of Blue by Miles Davis' });
    expect(img).toHaveAttribute('src', 'https://i.scdn.co/image/kob');
    expect(img).toHaveClass('aspect-square');
    expect(img.parentElement?.children).toHaveLength(1);
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(img);
  });

  it('renders nothing without an album or without artwork', () => {
    const { container, rerender } = render(<CoverArt album={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CoverArt album={{ ...album, imageUrl: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
