import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LaunchBanner } from './LaunchBanner';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '@/config';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}')),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the launch banner', () => {
  it('announces both apps as available, not coming', () => {
    render(<LaunchBanner />);
    expect(screen.getByText(/now on iPhone and Android/i)).toBeInTheDocument();
    const text = document.querySelector('.launch')?.textContent ?? '';
    expect(text).not.toMatch(/coming soon|coming to|notify me|we.ll email/i);
  });

  it('links each official badge to its own live store listing', () => {
    render(<LaunchBanner />);
    const apple = screen.getByRole('img', { name: 'Download on the App Store' }).closest('a');
    const play = screen.getByRole('img', { name: 'Get it on Google Play' }).closest('a');
    expect(apple).toHaveAttribute('href', APP_STORE_URL);
    expect(play).toHaveAttribute('href', GOOGLE_PLAY_URL);
  });

  it('offers a QR code per store, with the Android robot credited', () => {
    render(<LaunchBanner />);
    expect(screen.getByRole('img', { name: /QR code: PromptSpend on the App Store/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /QR code: PromptSpend on Google Play/ })).toBeInTheDocument();
    expect(screen.getByText(/Android robot is reproduced or modified/)).toBeInTheDocument();
  });

  it('points to the permanent app page, which cannot be dismissed', () => {
    render(<LaunchBanner />);
    expect(screen.getByRole('link', { name: 'About the app' })).toHaveAttribute('href', '/app/');
  });

  /** The email list is closed; nothing about this banner may reach the network. */
  it('has no form and sends nothing', () => {
    render(<LaunchBanner />);
    expect(document.querySelector('.launch form, .launch input')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stays dismissed once dismissed', async () => {
    const { unmount } = render(<LaunchBanner />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss the app announcement/i }));
    expect(document.querySelector('.launch')).toBeNull();
    unmount();

    render(<LaunchBanner />);
    expect(document.querySelector('.launch')).toBeNull();
  });

  /**
   * Someone who closed the "coming soon" version has not seen this news. The
   * old key must not hide the new banner.
   */
  it('shows again to someone who dismissed the old "coming soon" banner', () => {
    localStorage.setItem('ps.launchBannerDismissed', '1');
    render(<LaunchBanner />);
    expect(screen.getByText(/now on iPhone and Android/i)).toBeInTheDocument();
  });
});
